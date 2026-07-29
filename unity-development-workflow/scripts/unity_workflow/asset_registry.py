"""合并 Unity Toolkit 生成的不可变资源登记记录。"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

from unity_workflow.contracts import load_yaml, validate_contract
from unity_workflow.file_mutex import FileMutex


def merge_registration_records(
    project_root: Path,
    records_directory: Path,
    register_path: Path,
) -> dict[str, int]:
    """校验不可变登记记录，并由单写者原子合并到总资源登记。"""
    root = project_root.resolve()
    records_root = _resolve_within(root, records_directory)
    target = _resolve_within(root, register_path)
    if not records_root.is_dir():
        raise ValueError(f"登记记录目录不存在或不是目录：{records_directory}")
    record_paths = sorted(records_root.glob("*.json"))
    if not record_paths:
        raise ValueError("登记记录目录中没有 JSON 文件")

    with FileMutex(target):
        register = _load_register(target)
        existing = {
            item["id"]: item
            for item in register["assets"]
            if isinstance(item, Mapping) and isinstance(item.get("id"), str)
        }
        merged = 0
        unchanged = 0
        for record_path in record_paths:
            record = _load_record(record_path)
            candidate = _record_to_asset(root, record_path, record)
            current = existing.get(candidate["id"])
            if current is not None:
                _assert_idempotent(current, candidate)
                unchanged += 1
                continue
            register["assets"].append(candidate)
            existing[candidate["id"]] = candidate
            merged += 1

        issues = validate_contract("asset-register", register)
        if issues:
            details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
            raise ValueError(f"合并后的资源登记无效：{details}")
        _atomic_dump_yaml(target, register)
    return {"merged": merged, "unchanged": unchanged, "records": len(record_paths)}


def _load_register(path: Path) -> dict[str, Any]:
    """读取并校验已有总登记，拒绝在未知结构上继续写入。"""
    if not path.is_file():
        raise ValueError(f"总资源登记不存在：{path}")
    payload = load_yaml(path)
    issues = validate_contract("asset-register", payload)
    if issues:
        details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
        raise ValueError(f"总资源登记无效：{details}")
    return payload


def _load_record(path: Path) -> dict[str, Any]:
    """读取单个 Toolkit 登记事实并执行完整 Schema 校验。"""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"无法读取登记记录 {path}: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError(f"登记记录顶层必须是对象：{path}")
    issues = validate_contract("registration-record", payload)
    if issues:
        details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
        raise ValueError(f"登记记录无效 {path}: {details}")
    return payload


def _record_to_asset(root: Path, record_path: Path, record: Mapping[str, Any]) -> dict[str, Any]:
    """将不可变登记事实映射为总资源登记项，并补齐实际文件哈希证据。"""
    source = _resolve_within(root, Path(str(record["sourcePath"])))
    asset = _resolve_within(root, Path(str(record["assetPath"])))
    import_report = _resolve_within(root, Path(str(record["importReportPath"])))
    expected_hash = str(record["sourceSha256"])
    for label, path in (("源制品", source), ("Unity 资产", asset)):
        if not path.is_file() or _sha256(path).lower() != expected_hash.lower():
            raise ValueError(f"{label}缺失或哈希不匹配：{path}")
    if not import_report.is_file():
        raise ValueError(f"导入报告不存在：{import_report}")

    evidence = [
        _evidence(root, record_path, "registration-record"),
        _evidence(root, import_report, "asset-import-report"),
    ]
    for approval_path in record["approvalEvidencePaths"]:
        evidence.append(_evidence(root, _resolve_within(root, Path(approval_path)), "asset-approval"))

    return {
        "id": record["resourceId"],
        "type": record["type"],
        "purpose": record["purpose"],
        "source": record["sourcePath"],
        "sourceVersion": record["sourceVersion"],
        "visualVersion": record["visualVersion"],
        "sourceSha256": record["sourceSha256"],
        "path": record["assetPath"],
        "address": record["address"],
        "guid": record["assetGuid"],
        "importerReportPath": record["importReportPath"],
        "registrationRecordPath": record_path.resolve().relative_to(root).as_posix(),
        # 复制已经由资产 type 判别校验过的导入设置，避免调用方随后修改原始记录。
        "importer": dict(record["importer"]),
        "status": "VALIDATED",
        # 技术导入不能推导许可证结论，必须由后续权属审查单独批准。
        "licenseStatus": "PENDING",
        "unityValidation": "PASS",
        "approvals": record["approvals"],
        "evidence": evidence,
    }


def _assert_idempotent(current: Mapping[str, Any], candidate: Mapping[str, Any]) -> None:
    """允许完全相同记录重复合并，拒绝同一资源 ID 指向不同事实。"""
    conflicts = [
        field
        for field in (
            "type",
            "sourceVersion",
            "visualVersion",
            "sourceSha256",
            "path",
            "address",
            "guid",
            "importer",
        )
        if current.get(field) != candidate.get(field)
    ]
    if conflicts:
        raise ValueError(f"资源 {candidate['id']} 的不可变字段冲突：{', '.join(conflicts)}")


def _evidence(root: Path, path: Path, evidence_type: str) -> dict[str, str]:
    """为项目内真实文件创建可深度校验的证据引用。"""
    if not path.is_file():
        raise ValueError(f"证据文件不存在：{path}")
    return {"type": evidence_type, "path": path.resolve().relative_to(root).as_posix(), "sha256": _sha256(path)}


def _resolve_within(root: Path, path: Path) -> Path:
    """解析项目相对路径，并拒绝目录穿越或项目外绝对路径。"""
    candidate = path if path.is_absolute() else root / path
    current = candidate
    while current != root and current.is_relative_to(root):
        if current.exists() and current.is_symlink():
            raise ValueError(f"路径不得经过符号链接或目录联接：{path}")
        current = current.parent
    resolved = candidate.resolve()
    if not resolved.is_relative_to(root):
        raise ValueError(f"路径超出项目根目录：{path}")
    return resolved


def _sha256(path: Path) -> str:
    """流式计算文件 SHA-256，避免大文件一次性载入内存。"""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_dump_yaml(path: Path, payload: Mapping[str, Any]) -> None:
    """在目标目录写入临时文件后原子替换，避免留下半份登记。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            yaml.safe_dump(dict(payload), handle, allow_unicode=True, sort_keys=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
