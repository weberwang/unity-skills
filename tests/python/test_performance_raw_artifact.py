"""验证性能门禁只能消费与固定测量契约一致的原始样本契约。"""

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.performance_contract import (
    CAPTURE_SOURCES,
    performance_gate_failure,
)


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"


class _RawEvidenceReader:
    """模拟 Gate 回读 Profile、测量契约和原始样本契约。"""

    def __init__(
        self,
        profile: dict[str, object],
        contracts: dict[str, dict[str, object]],
    ) -> None:
        """保存按证据路径索引的不可变契约夹具。"""
        self.profile = profile
        self.contracts = contracts

    def verify_reference(self, reference: object) -> None:
        """本测试只聚焦契约内容绑定，引用哈希由通用 Gate 测试覆盖。"""
        assert isinstance(reference, dict)

    def _load_referenced_contract(
        self, reference: dict[str, object]
    ) -> dict[str, object]:
        """按引用类型回读 Profile 或路径对应的性能契约。"""
        if reference.get("type") == "project-profile":
            return self.profile
        return self.contracts[str(reference["path"])]


def _fixtures() -> tuple[
    dict[str, object],
    dict[str, object],
    dict[str, dict[str, object]],
    dict[str, dict[str, object]],
]:
    """构造九项报告及逐项绑定的测量契约与原始样本契约。"""
    report = yaml.safe_load(
        (TEMPLATES / "quality-report-performance.yaml").read_text(encoding="utf-8")
    )
    profile = yaml.safe_load(
        (TEMPLATES / "project-profile.yaml").read_text(encoding="utf-8")
    )
    profile["workflow"]["qualityTargetsStatus"] = "APPROVED"
    contracts: dict[str, dict[str, object]] = {}
    raw_by_metric: dict[str, dict[str, object]] = {}
    for measurement in report["measurements"]:
        metric = measurement["metric"]
        measurement_reference = measurement["measurementEvidence"]
        raw_path = f"Artifacts/Performance/raw/{metric}.yaml"
        raw_reference = {
            "type": "performance-raw-artifact",
            "path": raw_path,
            "sha256": "a" * 64,
            "projectId": report["projectId"],
            "subjectId": f"performance.raw.{metric.lower()}.v1",
            "subjectVersion": "raw-v1",
            "sourceRevision": report["sourceRevision"],
            "projectStateVersion": report["projectStateVersion"],
            "buildVersion": report["buildVersion"],
        }
        evidence = {
            "projectId": report["projectId"],
            "sourceRevision": report["sourceRevision"],
            "projectStateVersion": report["projectStateVersion"],
            "buildVersion": report["buildVersion"],
            "metric": metric,
            "unit": measurement["unit"],
            "value": measurement["value"],
            "rawArtifact": raw_reference,
        }
        raw = {
            "projectId": report["projectId"],
            "sourceRevision": report["sourceRevision"],
            "projectStateVersion": report["projectStateVersion"],
            "buildVersion": report["buildVersion"],
            "metric": metric,
            "unit": measurement["unit"],
            "captureSource": CAPTURE_SOURCES[metric],
            "captureMetadata": {"sampleCount": 2},
            "samples": [measurement["value"], measurement["value"]],
        }
        contracts[measurement_reference["path"]] = evidence
        contracts[raw_path] = raw
        raw_by_metric[metric] = raw
    return report, profile, contracts, raw_by_metric


def test_performance_raw_artifact_template_is_valid() -> None:
    """原始样本模板必须具备完整身份、采集元数据和非空有限样本。"""
    payload = yaml.safe_load(
        (TEMPLATES / "performance-raw-artifact.yaml").read_text(encoding="utf-8")
    )
    assert validate_contract("performance-raw-artifact", payload) == []


@pytest.mark.parametrize("samples", ([], [float("nan")], [float("inf")]))
def test_raw_contract_rejects_empty_or_non_finite_samples(
    samples: list[float],
) -> None:
    """空数组、NaN 和 Infinity 均不得成为可验证的原始测量。"""
    payload = yaml.safe_load(
        (TEMPLATES / "performance-raw-artifact.yaml").read_text(encoding="utf-8")
    )
    payload["samples"] = samples
    payload["captureMetadata"]["sampleCount"] = len(samples)
    assert validate_contract("performance-raw-artifact", payload)


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("metric", "maximumCpuFrameTimeMs"),
        ("unit", "ms"),
        ("buildVersion", "0.0.9-old"),
    ),
)
def test_gate_rejects_raw_identity_different_from_measurement_evidence(
    field: str,
    value: str,
) -> None:
    """原始样本的指标、单位或构建身份不得与固定测量契约分离。"""
    report, profile, contracts, raw_by_metric = _fixtures()
    raw_by_metric["minimumFps"][field] = value
    failure = performance_gate_failure(_RawEvidenceReader(profile, contracts), report)
    assert failure is not None and f"原始样本 {field} 与测量证据不一致" in failure


def test_gate_recalculates_samples_and_rejects_declared_measurement_value() -> None:
    """Gate 必须按原始 samples 实算极值，不能信任测量契约自报值。"""
    report, profile, contracts, raw_by_metric = _fixtures()
    raw_by_metric["minimumFps"]["samples"] = [60, 59.999]
    failure = performance_gate_failure(_RawEvidenceReader(profile, contracts), report)
    assert failure is not None and "value 与原始 samples 实算值不一致" in failure


def test_raw_contract_rejects_sample_count_mismatch() -> None:
    """采集元数据中的样本数量必须与原始数组长度精确一致。"""
    payload = yaml.safe_load(
        (TEMPLATES / "performance-raw-artifact.yaml").read_text(encoding="utf-8")
    )
    payload["captureMetadata"]["sampleCount"] += 1
    issues = validate_contract("performance-raw-artifact", payload)
    assert any("采样数量" in issue.message for issue in issues)
