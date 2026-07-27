"""把已校验的 YAML 契约编译为 Unity 可消费的 JSON Job。"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from unity_workflow.contracts import ValidationIssue, load_yaml, validate_contract


class ContractValidationError(ValueError):
    """表示源契约未通过 Schema 或语义校验。"""

    issues: tuple[ValidationIssue, ...]

    def __init__(self, issues: tuple[ValidationIssue, ...]) -> None:
        """保存稳定排序的问题，并生成适合 CLI 展示的单行消息。"""
        self.issues = tuple(sorted(issues, key=lambda issue: (issue.path, issue.message)))
        details = "；".join(f"{issue.path}: {issue.message}" for issue in self.issues)
        super().__init__(details)


def compile_job(kind: str, source: Path, output: Path, project_root: Path | None = None) -> Path:
    """校验 YAML 契约并原子编译成 Unity 可消费的 JSON Job。"""
    root = (project_root or Path.cwd()).resolve()
    if not root.is_dir():
        raise ValueError(f"项目根目录不存在：{root}")
    _project_relative_path(output, root, "输出 Job")
    try:
        source_bytes = source.read_bytes()
    except OSError as error:
        # 首次读取也沿用公共加载器的错误契约，供直接 API 调用方稳定诊断。
        raise ValueError(f"无法加载 YAML {source}: {error}") from error
    payload = load_yaml(source, source_bytes=source_bytes)
    try:
        issues = validate_contract(kind, payload)
    except ValueError as error:
        # 未知类型同样属于契约入口错误，统一为调用方保留结构化问题。
        raise ContractValidationError((ValidationIssue("$.kind", str(error)),)) from error
    if issues:
        raise ContractValidationError(tuple(issues))

    job = {
        "schemaVersion": "1.0",
        "kind": kind,
        "sourcePath": _source_path(source, root),
        "sourceSha256": sha256(source_bytes).hexdigest(),
        "payloadSha256": _payload_sha256(payload),
        "compiledAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "payload": payload,
    }
    serialized = json.dumps(job, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    temporary_path: Path | None = None
    try:
        # 临时文件与目标位于同一目录，Path.replace 才能提供可靠的原子替换语义。
        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            prefix=f"{output.name}.",
            suffix=".tmp",
            dir=output.parent,
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(serialized)
        temporary_path.replace(output)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return output


def _source_path(source: Path, project_root: Path) -> str:
    """只返回项目根目录内的 POSIX 相对路径，避免生成 Unity 必然拒绝的 Job。"""
    return _project_relative_path(source, project_root, "源契约")


def _project_relative_path(path: Path, project_root: Path, label: str) -> str:
    """返回安全项目相对路径，并拒绝项目外位置和现有符号链接路径段。"""
    absolute_path = path.absolute()
    resolved_path = absolute_path.resolve()
    try:
        resolved_path.relative_to(project_root)
        relative = absolute_path.relative_to(project_root)
    except ValueError:
        raise ValueError(f"{label}必须位于项目根目录内：{path}") from None
    current = project_root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            raise ValueError(f"{label}路径不得经过符号链接：{path}")
        if not current.exists():
            break
    return relative.as_posix()


def _payload_sha256(payload: object) -> str:
    """对排序、无空白且保留 Unicode 的 JSON payload 计算稳定 SHA-256。"""
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return sha256(canonical).hexdigest()
