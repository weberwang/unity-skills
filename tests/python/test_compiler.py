from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import re

import pytest

from unity_workflow.cli import main
import unity_workflow.compiler as compiler_module
from unity_workflow.contracts import load_yaml, validate_contract as validate_contract_source
from unity_workflow.compiler import ContractValidationError, compile_job


TEMPLATE = (
    Path(__file__).parents[2]
    / "unity-development-workflow"
    / "templates"
    / "image-task.yaml"
)


def _copy_valid_source(destination: Path) -> bytes:
    """复制有效图片任务，并返回用于哈希断言的原始字节。"""
    raw = TEMPLATE.read_bytes()
    destination.write_bytes(raw)
    return raw


def _key_orders(value: object) -> list[tuple[str, ...]]:
    """递归提取所有 JSON 对象的键顺序，覆盖顶层与嵌套对象。"""
    if isinstance(value, dict):
        orders = [tuple(value)]
        for child in value.values():
            orders.extend(_key_orders(child))
        return orders
    if isinstance(value, list):
        orders: list[tuple[str, ...]] = []
        for child in value:
            orders.extend(_key_orders(child))
        return orders
    return []


def test_compile_job_produces_deterministic_payload_hash_and_key_order(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """重复编译时，非时间内容及顶层键顺序必须保持确定。"""
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "contracts" / "image-task.yaml"
    source.parent.mkdir()
    _copy_valid_source(source)

    first_path = compile_job("image-task", source, tmp_path / "first.json", tmp_path)
    second_path = compile_job("image-task", source, tmp_path / "second.json", tmp_path)
    first = json.loads(first_path.read_text(encoding="utf-8"))
    second = json.loads(second_path.read_text(encoding="utf-8"))

    assert first["payload"] == second["payload"]
    assert first["sourceSha256"] == second["sourceSha256"]
    assert first["payloadSha256"] == second["payloadSha256"]
    canonical_payload = json.dumps(
        first["payload"], ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    assert first["payloadSha256"] == sha256(canonical_payload).hexdigest()
    assert _key_orders(first) == _key_orders(second)
    assert all(order == tuple(sorted(order)) for order in _key_orders(first))
    assert first["schemaVersion"] == "1.0"
    assert first["kind"] == "image-task"
    assert first["sourcePath"] == "contracts/image-task.yaml"
    assert list(tmp_path.glob("*.tmp")) == []


def test_compile_job_uses_one_source_byte_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """校验载荷与源哈希必须来自同一次原始字节快照。"""
    source = tmp_path / "image-task.yaml"
    original = _copy_valid_source(source)
    replacement = original.replace(
        "玩家选择界面的角色头像".encode(),
        "并发替换后的角色头像".encode(),
    )
    load_calls: list[tuple[Path, bytes | None]] = []

    def track_load_yaml(path: Path, *, source_bytes: bytes | None = None):
        """记录编译器是否通过 Task 2 公共入口解析既有快照。"""
        load_calls.append((path, source_bytes))
        return load_yaml(path, source_bytes=source_bytes)

    def validate_then_replace(kind: str, payload: dict[str, object]):
        """在校验后模拟另一个进程原子替换源文件。"""
        issues = validate_contract_source(kind, payload)
        source.write_bytes(replacement)
        return issues

    monkeypatch.setattr(compiler_module, "load_yaml", track_load_yaml, raising=False)
    monkeypatch.setattr(compiler_module, "validate_contract", validate_then_replace)
    result = json.loads(
        compile_job("image-task", source, tmp_path / "job.json", tmp_path).read_text(encoding="utf-8")
    )

    assert result["payload"]["useCase"] == "玩家选择界面的角色头像"
    assert result["sourceSha256"] == sha256(original).hexdigest()
    canonical_payload = json.dumps(
        result["payload"], ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    assert result["payloadSha256"] == sha256(canonical_payload).hexdigest()
    assert load_calls == [(source, original)]


def test_compile_job_emits_rfc3339_utc_timestamp(tmp_path: Path) -> None:
    """编译时间必须是明确带 Z 后缀的 RFC3339 UTC 时间。"""
    source = tmp_path / "image-task.yaml"
    _copy_valid_source(source)

    result = json.loads(compile_job("image-task", source, tmp_path / "job.json", tmp_path).read_text("utf-8"))

    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", result["compiledAtUtc"])


def test_compile_job_hashes_original_bytes_and_preserves_unicode(tmp_path: Path) -> None:
    """源哈希必须基于原始字节，JSON 中的中文不得转义。"""
    source = tmp_path / "image-task.yaml"
    raw = _copy_valid_source(source)
    output = compile_job("image-task", source, tmp_path / "job.json", tmp_path)
    text = output.read_text(encoding="utf-8")
    result = json.loads(text)

    assert result["sourceSha256"] == sha256(raw).hexdigest()
    assert re.fullmatch(r"[a-f0-9]{64}", result["payloadSha256"])
    assert "玩家选择界面的角色头像" in text
    assert "\\u73a9" not in text
    assert text.endswith("\n")


def test_invalid_contract_does_not_create_output_or_leave_temporary_file(tmp_path: Path) -> None:
    """契约校验失败时不得创建输出或遗留临时文件。"""
    source = tmp_path / "invalid.yaml"
    source.write_text("schemaVersion: '1.0'\n", encoding="utf-8")
    output = tmp_path / "job.json"

    with pytest.raises(ContractValidationError) as raised:
        compile_job("image-task", source, output, tmp_path)

    assert raised.value.issues == tuple(
        sorted(raised.value.issues, key=lambda issue: (issue.path, issue.message))
    )
    assert not output.exists()
    assert list(tmp_path.glob("*.tmp")) == []


def test_invalid_contract_does_not_replace_existing_output(tmp_path: Path) -> None:
    """契约校验失败时必须完整保留已有目标内容。"""
    source = tmp_path / "invalid.yaml"
    source.write_text("unexpected: true\n", encoding="utf-8")
    output = tmp_path / "job.json"
    output.write_bytes(b"existing\n")

    with pytest.raises(ContractValidationError):
        compile_job("image-task", source, output, tmp_path)

    assert output.read_bytes() == b"existing\n"


def test_compile_job_cleans_temporary_file_when_replace_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """原子替换失败时必须清理本次唯一临时文件。"""
    source = tmp_path / "image-task.yaml"
    _copy_valid_source(source)
    output = tmp_path / "job.json"
    output.write_bytes(b"existing\n")

    def fail_replace(_temporary: Path, _target: Path) -> Path:
        """模拟操作系统拒绝原子替换。"""
        raise OSError("replace failed")

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError, match="replace failed"):
        compile_job("image-task", source, output, tmp_path)

    assert output.read_bytes() == b"existing\n"
    assert list(tmp_path.glob("*.tmp")) == []


def test_compile_job_rejects_unknown_kind_as_contract_error(tmp_path: Path) -> None:
    """不受支持的契约类型必须按契约错误报告。"""
    source = tmp_path / "image-task.yaml"
    _copy_valid_source(source)

    with pytest.raises(ContractValidationError) as raised:
        compile_job("unknown", source, tmp_path / "job.json", tmp_path)

    assert raised.value.issues[0].path == "$.kind"


def test_compile_job_wraps_source_read_error_with_path_and_cause(tmp_path: Path) -> None:
    """源文件读取失败必须沿用公共加载器的路径消息与异常链。"""
    source = tmp_path / "missing.yaml"

    with pytest.raises(ValueError, match=re.escape(str(source))) as raised:
        compile_job("image-task", source, tmp_path / "job.json", tmp_path)

    assert isinstance(raised.value.__cause__, OSError)


def test_compile_job_rejects_source_outside_project_root(tmp_path: Path) -> None:
    """编译器不得生成 Unity Loader 必然拒绝的绝对 sourcePath。"""
    project_root = tmp_path / "project"
    project_root.mkdir()
    source = tmp_path / "outside.yaml"
    _copy_valid_source(source)

    with pytest.raises(ValueError, match="项目根目录内"):
        compile_job("image-task", source, project_root / "job.json", project_root)


def test_cli_compile_success_prints_path_and_returns_zero(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """CLI 编译成功时必须输出目标路径并返回零。"""
    source = tmp_path / "image-task.yaml"
    _copy_valid_source(source)
    output = tmp_path / "job.json"

    exit_code = main(
        ["compile", "--project-root", str(tmp_path), "--kind", "image-task", "--source", str(source), "--output", str(output)]
    )

    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.out == f"{output}\n"
    assert captured.err == ""


@pytest.mark.parametrize("failure", ("contract", "file"))
def test_cli_compile_failure_prints_one_chinese_line_and_returns_two(
    failure: str,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """CLI 契约或文件错误必须无堆栈地输出一行中文错误。"""
    source = tmp_path / "source.yaml"
    if failure == "contract":
        source.write_text("invalid: true\n", encoding="utf-8")
    output = tmp_path / "job.json"

    exit_code = main(
        ["compile", "--project-root", str(tmp_path), "--kind", "image-task", "--source", str(source), "--output", str(output)]
    )

    captured = capsys.readouterr()
    assert exit_code == 2
    assert captured.out == ""
    assert captured.err.startswith("错误：")
    assert captured.err.count("\n") == 1
