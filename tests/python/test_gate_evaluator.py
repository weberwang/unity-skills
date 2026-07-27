from __future__ import annotations

import hashlib
from pathlib import Path

import yaml

from unity_workflow.gate_evaluator import evaluate_gate


ROOT = Path(__file__).parents[2] / "unity-development-workflow"


def _sha256(path: Path) -> str:
    """计算测试证据文件哈希。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_yaml(path: Path, payload: dict[str, object]) -> None:
    """以稳定 UTF-8 YAML 写入测试契约。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _gate_fixture(project: Path) -> tuple[Path, Path, Path]:
    """创建包含一份真实质量报告的 G0 求值夹具。"""
    log = project / "Artifacts" / "Logs" / "compile.txt"
    log.parent.mkdir(parents=True)
    log.write_text("compile clean\n", encoding="utf-8")
    raw_evidence = {"type": "compile-log", "path": "Artifacts/Logs/compile.txt", "sha256": _sha256(log)}
    report = {
        "schemaVersion": "1.0",
        "taskId": "qa.g0",
        "projectId": "starfall-arena",
        "sourceRevision": "revision-001",
        "buildVersion": "0.1.0-dev.1",
        "generatedAtUtc": "2026-07-27T12:00:00Z",
        "checks": [{"id": "compile.clean", "category": "compile", "status": "PASS", "message": "编译通过", "evidence": [raw_evidence]}],
        "status": "PASS",
        "evidence": [raw_evidence],
    }
    report_path = project / "Artifacts" / "Quality" / "g0.yaml"
    _write_yaml(report_path, report)
    report_evidence = {
        "type": "quality-report",
        "path": "Artifacts/Quality/g0.yaml",
        "sha256": _sha256(report_path),
        "subjectId": "qa.g0",
        "sourceRevision": "revision-001",
        "buildVersion": "0.1.0-dev.1",
    }
    gates = yaml.safe_load((ROOT / "templates" / "quality-gates.yaml").read_text(encoding="utf-8"))
    gate = gates["gates"][0]
    gate["status"] = "WAITING_APPROVAL"
    gate["evidence"] = [report_evidence]
    gate["checkResults"] = [
        {"id": check_id, "status": "PASS", "evidence": [report_evidence]}
        for check_id in gate["requiredChecks"]
    ]
    config = project / "Artifacts" / "Gates" / "quality-gates.yaml"
    output = project / "Artifacts" / "Gates" / "evaluated.yaml"
    _write_yaml(config, gates)
    return config, output, log


def test_gate_evaluate_deeply_validates_and_passes(tmp_path: Path) -> None:
    """门禁仅在嵌套文件、Schema、身份、版本和哈希全部有效时通过。"""
    config, output, _ = _gate_fixture(tmp_path)

    result = evaluate_gate(config, "G0", tmp_path, "starfall-arena", "revision-001", "0.1.0-dev.1", output)

    assert result["status"] == "PASS"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    assert evaluated["gates"][0]["status"] == "PASS"


def test_gate_evaluate_rejects_tampered_nested_evidence(tmp_path: Path) -> None:
    """顶层报告未变化但内部日志被篡改时，门禁必须失败并保留原因。"""
    config, output, log = _gate_fixture(tmp_path)
    log.write_text("tampered\n", encoding="utf-8")

    result = evaluate_gate(config, "G0", tmp_path, "starfall-arena", "revision-001", "0.1.0-dev.1", output)

    assert result["status"] == "FAIL"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    assert any("哈希不匹配" in item.get("failureReason", "") for item in evaluated["gates"][0]["checkResults"])
