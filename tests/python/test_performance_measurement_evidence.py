"""验证 performance.pass 只能消费与报告完全一致的固定测量契约。"""

from copy import deepcopy
import hashlib
from pathlib import Path

import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.gate_evaluator import _EvidenceVerifier
from unity_workflow.performance_contract import CAPTURE_SOURCES, performance_gate_failure


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"


class _EvidenceReader:
    """模拟 Gate 回读 Profile、固定测量契约和原始产物。"""

    def __init__(
        self,
        profile: dict[str, object],
        evidence_by_path: dict[str, dict[str, object]],
    ) -> None:
        """保存按引用路径索引的不可变测试证据。"""
        self.profile = profile
        self.evidence_by_path = evidence_by_path

    def verify_reference(self, reference: object) -> None:
        """模拟引用哈希已由 Gate 通用层验证。"""
        assert isinstance(reference, dict)

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """按契约类型回读 Profile 或固定测量记录。"""
        if reference.get("type") == "project-profile":
            return self.profile
        return self.evidence_by_path[str(reference["path"])]


class _HybridReader:
    """让真实 Gate 验证测量文件，同时用内存 Profile 隔离无关阶段夹具。"""

    def __init__(self, verifier: _EvidenceVerifier, profile: dict[str, object]) -> None:
        """保存真实证据验证器和已批准质量预算。"""
        self.verifier = verifier
        self.profile = profile

    def verify_reference(self, reference: object) -> None:
        """Profile 由本测试隔离，测量契约与原始文件走真实 Gate。"""
        if isinstance(reference, dict) and reference.get("type") == "project-profile":
            return
        self.verifier.verify_reference(reference)

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """回读内存 Profile 或磁盘上的固定测量契约。"""
        if reference.get("type") == "project-profile":
            return self.profile
        return self.verifier._load_referenced_contract(reference)


def _fixtures() -> tuple[dict[str, object], dict[str, object], dict[str, dict[str, object]]]:
    """构造九项报告与其一一对应的测量契约。"""
    report = yaml.safe_load((TEMPLATES / "quality-report-performance.yaml").read_text(encoding="utf-8"))
    profile = yaml.safe_load((TEMPLATES / "project-profile.yaml").read_text(encoding="utf-8"))
    profile["workflow"]["qualityTargetsStatus"] = "APPROVED"
    evidence_by_path: dict[str, dict[str, object]] = {}
    for measurement in report["measurements"]:
        reference = measurement["measurementEvidence"]
        raw_path = f"Artifacts/Performance/raw/{measurement['metric']}.yaml"
        evidence_by_path[reference["path"]] = {
            "projectId": report["projectId"],
            "sourceRevision": report["sourceRevision"],
            "projectStateVersion": report["projectStateVersion"],
            "buildVersion": report["buildVersion"],
            "metric": measurement["metric"],
            "unit": measurement["unit"],
            "value": measurement["value"],
            "captureEnvironment": {"platform": report["platformId"]},
            "rawArtifact": {
                "type": "performance-raw-artifact",
                "path": raw_path,
                "sha256": "a" * 64,
            },
        }
        evidence_by_path[raw_path] = {
            "projectId": report["projectId"],
            "sourceRevision": report["sourceRevision"],
            "projectStateVersion": report["projectStateVersion"],
            "buildVersion": report["buildVersion"],
            "metric": measurement["metric"],
            "unit": measurement["unit"],
            "captureSource": CAPTURE_SOURCES[measurement["metric"]],
            "captureMetadata": {
                "platform": report["platformId"],
                "sampleCount": 1,
            },
            "samples": [measurement["value"]],
        }
    return report, profile, evidence_by_path


def test_performance_measurement_evidence_template_is_valid() -> None:
    """固定模板必须提供采集环境、原始产物和完整构建身份。"""
    payload = yaml.safe_load(
        (TEMPLATES / "performance-measurement-evidence.yaml").read_text(encoding="utf-8")
    )
    assert validate_contract("performance-measurement-evidence", payload) == []


def test_gate_rejects_report_value_different_from_measurement_evidence() -> None:
    """报告值不能覆盖固定测量契约中的真实值。"""
    report, profile, evidence_by_path = _fixtures()
    evidence_by_path = deepcopy(evidence_by_path)
    first = report["measurements"][0]["measurementEvidence"]["path"]
    evidence_by_path[first]["value"] = 61
    raw_path = evidence_by_path[first]["rawArtifact"]["path"]
    evidence_by_path[raw_path]["samples"] = [61]
    failure = performance_gate_failure(_EvidenceReader(profile, evidence_by_path), report)
    assert failure is not None and "value 与报告不一致" in failure


def test_gate_rejects_measurement_evidence_from_old_build() -> None:
    """旧构建的测量契约不得用于当前质量报告。"""
    report, profile, evidence_by_path = _fixtures()
    evidence_by_path = deepcopy(evidence_by_path)
    first = report["measurements"][0]["measurementEvidence"]["path"]
    evidence_by_path[first]["buildVersion"] = "0.0.9-old"
    raw_path = evidence_by_path[first]["rawArtifact"]["path"]
    evidence_by_path[raw_path]["buildVersion"] = "0.0.9-old"
    failure = performance_gate_failure(_EvidenceReader(profile, evidence_by_path), report)
    assert failure is not None and "buildVersion 与报告不一致" in failure


def test_gate_rejects_measurement_evidence_with_wrong_metric() -> None:
    """引用其他指标的真实证据也不能替代当前指标证据。"""
    report, profile, evidence_by_path = _fixtures()
    evidence_by_path = deepcopy(evidence_by_path)
    first = report["measurements"][0]["measurementEvidence"]["path"]
    evidence_by_path[first]["metric"] = "maximumCpuFrameTimeMs"
    raw_path = evidence_by_path[first]["rawArtifact"]["path"]
    evidence_by_path[raw_path].update(
        {
            "metric": "maximumCpuFrameTimeMs",
            "unit": "fps",
            "captureSource": "UNITY_PROFILER",
        }
    )
    failure = performance_gate_failure(_EvidenceReader(profile, evidence_by_path), report)
    assert failure is not None and "metric 与报告不一致" in failure


def test_gate_rejects_measurement_evidence_from_other_platform() -> None:
    """其他平台采集环境不能冒充当前性能报告的样本。"""
    report, profile, evidence_by_path = _fixtures()
    evidence_by_path = deepcopy(evidence_by_path)
    first = report["measurements"][0]["measurementEvidence"]["path"]
    evidence_by_path[first]["captureEnvironment"]["platform"] = "ANDROID"
    failure = performance_gate_failure(_EvidenceReader(profile, evidence_by_path), report)
    assert failure is not None and "测量证据平台" in failure


def test_real_gate_reads_measurement_contracts_and_raw_artifacts(tmp_path: Path) -> None:
    """真实 Gate 必须逐项回读固定契约、验证身份哈希并验证原始产物。"""
    report, profile, _ = _fixtures()
    template = yaml.safe_load(
        (TEMPLATES / "performance-measurement-evidence.yaml").read_text(encoding="utf-8")
    )
    raw_template = yaml.safe_load(
        (TEMPLATES / "performance-raw-artifact.yaml").read_text(encoding="utf-8")
    )
    for index, measurement in enumerate(report["measurements"]):
        reference = measurement["measurementEvidence"]
        raw_path = tmp_path / "Artifacts" / "Performance" / "raw" / f"metric-{index}.yaml"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw = deepcopy(raw_template)
        raw.update(
            {
                "id": f"performance.raw.metric-{index}.v1",
                "metric": measurement["metric"],
                "unit": measurement["unit"],
                "captureSource": CAPTURE_SOURCES[measurement["metric"]],
                "samples": [measurement["value"], measurement["value"]],
            }
        )
        raw["captureMetadata"]["sampleCount"] = 2
        raw_path.write_text(
            yaml.safe_dump(raw, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        evidence = deepcopy(template)
        evidence.update(
            {
                "id": reference["subjectId"],
                "version": reference["subjectVersion"],
                "metric": measurement["metric"],
                "unit": measurement["unit"],
                "value": measurement["value"],
            }
        )
        evidence["rawArtifact"] = {
                "type": "performance-raw-artifact",
                "path": raw_path.relative_to(tmp_path).as_posix(),
                "sha256": hashlib.sha256(raw_path.read_bytes()).hexdigest(),
                "projectId": report["projectId"],
                "subjectId": raw["id"],
                "subjectVersion": raw["version"],
                "sourceRevision": report["sourceRevision"],
                "projectStateVersion": report["projectStateVersion"],
                "buildVersion": report["buildVersion"],
            }
        evidence_path = tmp_path / reference["path"]
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(yaml.safe_dump(evidence, allow_unicode=True, sort_keys=False), encoding="utf-8")
        reference["sha256"] = hashlib.sha256(evidence_path.read_bytes()).hexdigest()
    verifier = _EvidenceVerifier(
        tmp_path.resolve(),
        report["projectId"],
        report["sourceRevision"],
        report["buildVersion"],
        "G2",
        report["projectStateVersion"],
        {},
    )
    assert performance_gate_failure(_HybridReader(verifier, profile), report) is None
