"""验证 performance.pass 的九项预算测量和当前 Profile 证据链。"""

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import ValidationIssue, validate_contract
from unity_workflow.performance_contract import (
    CAPTURE_SOURCES,
    performance_gate_failure,
    performance_report_issues,
)


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"


class _Reader:
    """模拟 Gate 的 Profile 回读和证据哈希验证。"""

    def __init__(
        self,
        profile: dict[str, object],
        report: dict[str, object],
        *,
        expected_profile_hash: str = "a" * 64,
    ) -> None:
        """保存当前 Profile、报告和期望引用哈希。"""
        self.profile = profile
        self.report = report
        self.expected_profile_hash = expected_profile_hash

    def verify_reference(self, reference: object) -> None:
        """对 Profile 引用执行哈希检查，并接受测量原始证据。"""
        assert isinstance(reference, dict)
        if reference.get("type") == "project-profile" and reference.get("sha256") != self.expected_profile_hash:
            raise ValueError("project-profile 哈希错误")

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """返回当前已批准 Profile 或与报告一致的固定测量契约。"""
        if reference.get("type") == "project-profile":
            return self.profile
        if reference.get("type") == "performance-raw-artifact":
            metric = str(reference["path"]).rsplit("/", 1)[-1].removesuffix(".yaml")
            measurement = next(
                item for item in self.report["measurements"] if item["metric"] == metric
            )
            return {
                "projectId": self.report["projectId"],
                "sourceRevision": self.report["sourceRevision"],
                "projectStateVersion": self.report["projectStateVersion"],
                "buildVersion": self.report["buildVersion"],
                "metric": metric,
                "unit": measurement["unit"],
                "captureSource": CAPTURE_SOURCES[metric],
                "captureMetadata": {
                    "platform": self.report["platformId"],
                    "sampleCount": 1,
                },
                "samples": [measurement["value"]],
            }
        measurement = next(
            item for item in self.report["measurements"]
            if item["measurementEvidence"]["path"] == reference.get("path")
        )
        return {
            "projectId": self.report["projectId"],
            "sourceRevision": self.report["sourceRevision"],
            "projectStateVersion": self.report["projectStateVersion"],
            "buildVersion": self.report["buildVersion"],
            "metric": measurement["metric"],
            "unit": measurement["unit"],
            "value": measurement["value"],
            "captureEnvironment": {"platform": self.report["platformId"]},
            "rawArtifact": {
                "type": "performance-raw-artifact",
                "path": f"Artifacts/Performance/raw/{measurement['metric']}.yaml",
                "sha256": "f" * 64,
            },
        }


def _fixtures() -> tuple[dict[str, object], dict[str, object]]:
    """加载边界值恰好等于九项预算的性能报告与 Profile。"""
    report = yaml.safe_load((TEMPLATES / "quality-report-performance.yaml").read_text(encoding="utf-8"))
    profile = yaml.safe_load((TEMPLATES / "project-profile.yaml").read_text(encoding="utf-8"))
    profile["workflow"]["qualityTargetsStatus"] = "APPROVED"
    return report, profile


def test_performance_template_and_equal_budget_boundary_pass() -> None:
    """九项测量恰好等于最小或最大预算边界时必须通过。"""
    report, profile = _fixtures()
    assert validate_contract("quality-report", report) == []
    assert performance_gate_failure(_Reader(profile, report), report) is None


def test_performance_gate_uses_selected_platform_budget() -> None:
    """Android 性能报告必须使用 Android 预算，而不是 Windows 预算。"""
    report, profile = _fixtures()
    report["platformId"] = "ANDROID"
    android_quality = profile["delivery"]["targets"][1]["quality"]
    for measurement in report["measurements"]:
        measurement["value"] = android_quality[measurement["metric"]]
    assert performance_gate_failure(_Reader(profile, report), report) is None

    next(
        item for item in report["measurements"]
        if item["metric"] == "maximumMemoryMb"
    )["value"] = android_quality["maximumMemoryMb"] + 1
    assert "超出预算" in (performance_gate_failure(_Reader(profile, report), report) or "")


@pytest.mark.parametrize(
    ("metric", "value"),
    (("minimumFps", 59.99), ("maximumCpuFrameTimeMs", 16.68)),
)
def test_performance_gate_recalculates_and_rejects_over_budget(metric: str, value: float) -> None:
    """Gate 必须按方向重新比较测量值，不能信任报告的 PASS 文本。"""
    report, profile = _fixtures()
    next(item for item in report["measurements"] if item["metric"] == metric)["value"] = value
    assert "超出预算" in (performance_gate_failure(_Reader(profile, report), report) or "")


def test_performance_report_rejects_missing_metric() -> None:
    """少报任一预算指标时不得通过 performance.pass。"""
    report, _ = _fixtures()
    report["measurements"].pop()
    issues = performance_report_issues(report, ValidationIssue)
    assert any("性能指标缺失" in issue.message for issue in issues)


@pytest.mark.parametrize("mutation", ("DUPLICATE", "UNKNOWN", "WRONG_UNIT", "NAN", "INFINITY"))
def test_performance_report_rejects_invalid_measurement_set(mutation: str) -> None:
    """重复、未知、错单位和非有限测量值都必须默认拒绝。"""
    report, _ = _fixtures()
    measurements = report["measurements"]
    if mutation == "DUPLICATE":
        measurements[-1]["metric"] = measurements[0]["metric"]
    elif mutation == "UNKNOWN":
        measurements[-1]["metric"] = "averageFps"
    elif mutation == "WRONG_UNIT":
        measurements[0]["unit"] = "ms"
    elif mutation == "NAN":
        measurements[0]["value"] = float("nan")
    else:
        measurements[0]["value"] = float("inf")
    assert performance_report_issues(report, ValidationIssue)


def test_performance_gate_rejects_old_profile() -> None:
    """旧源码 Profile 即使预算相同也不能用于当前性能报告。"""
    report, profile = _fixtures()
    profile["sourceRevision"] = "old-revision"
    assert "sourceRevision" in (performance_gate_failure(_Reader(profile, report), report) or "")


def test_performance_gate_rejects_wrong_profile_hash() -> None:
    """Profile 引用哈希不匹配时必须在预算比较前失败。"""
    report, profile = _fixtures()
    report = deepcopy(report)
    report["profileEvidence"]["sha256"] = "b" * 64
    with pytest.raises(ValueError, match="哈希错误"):
        performance_gate_failure(_Reader(profile, report), report)
