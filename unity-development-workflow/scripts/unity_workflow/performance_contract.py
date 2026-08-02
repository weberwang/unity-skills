"""校验性能质量报告的结构化指标、单位和预算比较。"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any, Protocol


METRIC_RULES = {
    "minimumFps": ("fps", "minimum"),
    "maximumCpuFrameTimeMs": ("ms", "maximum"),
    "maximumGpuFrameTimeMs": ("ms", "maximum"),
    "maximumMemoryMb": ("MB", "maximum"),
    "maximumGcAllocKbPerFrame": ("KB/frame", "maximum"),
    "maximumDrawCalls": ("count/frame", "maximum"),
    "maximumTextureMemoryMb": ("MB", "maximum"),
    "maximumBuildSizeMb": ("MB", "maximum"),
    "maximumLoadTimeSeconds": ("s", "maximum"),
}

CAPTURE_SOURCES = {
    "minimumFps": "UNITY_PROFILER",
    "maximumCpuFrameTimeMs": "UNITY_PROFILER",
    "maximumGpuFrameTimeMs": "UNITY_PROFILER",
    "maximumMemoryMb": "UNITY_PROFILER",
    "maximumGcAllocKbPerFrame": "UNITY_PROFILER",
    "maximumDrawCalls": "UNITY_PROFILER",
    "maximumTextureMemoryMb": "UNITY_PROFILER",
    "maximumBuildSizeMb": "UNITY_BUILD_REPORT",
    "maximumLoadTimeSeconds": "RUNTIME_STOPWATCH",
}


class IssueFactory(Protocol):
    """定义公共验证问题构造器接口。"""

    def __call__(self, path: str, message: str) -> Any:
        """创建带稳定路径的问题。"""


class PerformanceEvidenceReader(Protocol):
    """描述性能门禁回读批准 Profile 与真实测量证据的能力。"""

    def verify_reference(self, reference: object) -> None:
        """递归验证证据引用。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """读取已验证的契约。"""


def performance_report_issues(
    payload: Mapping[str, Any], issue_factory: IssueFactory
) -> list[Any]:
    """拒绝性能检查的重复、缺失、未知指标、错误单位和非有限数值。"""
    checks = _mappings(payload.get("checks"))
    performance_checks = [item for item in checks if item.get("id") == "performance.pass"]
    if not performance_checks:
        return []
    issues: list[Any] = []
    if len(performance_checks) != 1:
        issues.append(issue_factory("$.checks", "performance.pass 检查必须且只能出现一次"))
    elif performance_checks[0].get("category") != "performance":
        issues.append(issue_factory("$.checks", "performance.pass 必须使用 performance 分类"))
    measurements = _mappings(payload.get("measurements"))
    metrics = [item.get("metric") for item in measurements]
    duplicates = sorted(str(item) for item in set(metrics) if metrics.count(item) > 1)
    missing = sorted(set(METRIC_RULES) - set(metrics))
    unknown = sorted(str(item) for item in set(metrics) - set(METRIC_RULES))
    if duplicates:
        issues.append(issue_factory("$.measurements", f"性能指标重复：{', '.join(duplicates)}"))
    if missing:
        issues.append(issue_factory("$.measurements", f"性能指标缺失：{', '.join(missing)}"))
    if unknown:
        issues.append(issue_factory("$.measurements", f"未知性能指标：{', '.join(unknown)}"))
    for index, measurement in enumerate(measurements):
        metric = measurement.get("metric")
        if metric not in METRIC_RULES:
            continue
        expected_unit = METRIC_RULES[metric][0]
        if measurement.get("unit") != expected_unit:
            issues.append(issue_factory(f"$.measurements[{index}].unit", f"{metric} 单位必须为 {expected_unit}"))
        value = measurement.get("value")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            issues.append(issue_factory(f"$.measurements[{index}].value", "性能测量值必须是有限数字"))
    return issues


def performance_measurement_evidence_issues(
    payload: Mapping[str, Any], issue_factory: IssueFactory
) -> list[Any]:
    """校验固定测量契约的指标单位配对和有限数值。"""
    metric = payload.get("metric")
    issues: list[Any] = []
    if metric in METRIC_RULES and payload.get("unit") != METRIC_RULES[metric][0]:
        issues.append(issue_factory("$.unit", f"{metric} 单位必须为 {METRIC_RULES[metric][0]}"))
    value = payload.get("value")
    if not _is_finite_number(value):
        issues.append(issue_factory("$.value", "性能测量证据值必须是有限数字"))
    return issues


def performance_raw_artifact_issues(
    payload: Mapping[str, Any], issue_factory: IssueFactory
) -> list[Any]:
    """校验原始性能样本、采集器类型及采样数量的一致性。"""
    metric = payload.get("metric")
    issues: list[Any] = []
    if metric in METRIC_RULES and payload.get("unit") != METRIC_RULES[metric][0]:
        issues.append(issue_factory("$.unit", f"{metric} 原始样本单位必须为 {METRIC_RULES[metric][0]}"))
    if metric in CAPTURE_SOURCES and payload.get("captureSource") != CAPTURE_SOURCES[metric]:
        issues.append(
            issue_factory("$.captureSource", f"{metric} 必须由 {CAPTURE_SOURCES[metric]} 采集")
        )
    samples = payload.get("samples")
    if not isinstance(samples, Sequence) or isinstance(samples, (str, bytes)) or not samples:
        issues.append(issue_factory("$.samples", "原始性能样本不能为空"))
        return issues
    for index, sample in enumerate(samples):
        if not _is_finite_number(sample):
            issues.append(issue_factory(f"$.samples[{index}]", "原始性能样本必须是有限数字"))
    metadata = payload.get("captureMetadata")
    if isinstance(metadata, Mapping) and metadata.get("sampleCount") != len(samples):
        issues.append(issue_factory("$.captureMetadata.sampleCount", "采样数量必须与 samples 长度一致"))
    return issues


def performance_gate_failure(
    reader: PerformanceEvidenceReader, payload: Mapping[str, Any]
) -> str | None:
    """回读当前批准 Profile 与固定测量契约，再比较九项质量预算。"""
    if not any(item.get("id") == "performance.pass" for item in _mappings(payload.get("checks"))):
        return None
    reference = payload.get("profileEvidence")
    if not isinstance(reference, Mapping):
        return "performance.pass 缺少当前 project-profile 证据"
    reader.verify_reference(reference)
    profile = reader._load_referenced_contract(reference)
    for field in ("projectId", "sourceRevision", "projectStateVersion"):
        if profile.get(field) != payload.get(field):
            return f"performance.pass 的 project-profile {field} 与报告不一致"
    measurements = {item.get("metric"): item for item in _mappings(payload.get("measurements"))}
    platform = payload.get("platformId")
    delivery = profile.get("delivery")
    targets = _mappings(delivery.get("targets")) if isinstance(delivery, Mapping) else []
    matching_targets = [item for item in targets if item.get("platformId") == platform]
    if len(matching_targets) != 1:
        return f"performance.pass 平台 {platform} 未唯一绑定 project-profile 目标"
    quality = matching_targets[0].get("quality")
    if not isinstance(quality, Mapping):
        return f"performance.pass 的平台 {platform} 缺少质量预算"
    for metric, (_, direction) in METRIC_RULES.items():
        measurement = measurements.get(metric)
        if not isinstance(measurement, Mapping):
            return f"performance.pass 缺少指标：{metric}"
        evidence_reference = measurement.get("measurementEvidence")
        if not isinstance(evidence_reference, Mapping):
            return f"performance.pass 的 {metric} 缺少固定测量证据"
        if evidence_reference.get("type") != "performance-measurement-evidence":
            return f"performance.pass 的 {metric} 证据类型错误"
        reader.verify_reference(evidence_reference)
        measurement_evidence = reader._load_referenced_contract(evidence_reference)
        raw_failure, raw_value = _raw_measurement_value(reader, measurement_evidence, str(platform))
        if raw_failure:
            return f"performance.pass 的 {metric} {raw_failure}"
        mismatch = _measurement_evidence_mismatch(payload, measurement, measurement_evidence)
        if mismatch:
            return f"performance.pass 的 {metric} {mismatch}"
        value = raw_value
        budget = quality.get(metric)
        if not all(_is_finite_number(item) for item in (value, budget)):
            return f"performance.pass 的 {metric} 不是有限数字"
        if direction == "minimum" and value < budget:
            return f"performance.pass 超出预算：{metric} {value} < {budget}"
        if direction == "maximum" and value > budget:
            return f"performance.pass 超出预算：{metric} {value} > {budget}"
    return None


def _raw_measurement_value(
    reader: PerformanceEvidenceReader,
    evidence: Mapping[str, Any],
    expected_platform: str,
) -> tuple[str | None, int | float | None]:
    """回读原始样本契约，并按固定极值规则实算唯一测量值。"""
    reference = evidence.get("rawArtifact")
    if not isinstance(reference, Mapping):
        return "测量证据缺少原始样本契约", None
    if reference.get("type") != "performance-raw-artifact":
        return "原始样本证据类型错误", None
    reader.verify_reference(reference)
    raw = reader._load_referenced_contract(reference)
    for field in (
        "projectId",
        "sourceRevision",
        "projectStateVersion",
        "buildVersion",
        "metric",
        "unit",
    ):
        if raw.get(field) != evidence.get(field):
            return f"原始样本 {field} 与测量证据不一致", None
    samples = raw.get("samples")
    if (
        not isinstance(samples, Sequence)
        or isinstance(samples, (str, bytes))
        or not samples
        or not all(_is_finite_number(sample) for sample in samples)
    ):
        return "原始 samples 必须是非空有限数字数组", None
    metric = evidence.get("metric")
    if metric not in METRIC_RULES:
        return "测量证据包含未知指标", None
    if raw.get("captureSource") != CAPTURE_SOURCES[metric]:
        return f"原始样本 captureSource 必须为 {CAPTURE_SOURCES[metric]}", None
    metadata = raw.get("captureMetadata")
    if not isinstance(metadata, Mapping) or metadata.get("sampleCount") != len(samples):
        return "原始样本 captureMetadata.sampleCount 与 samples 长度不一致", None
    if metadata.get("platform") != expected_platform:
        return "原始样本平台与性能报告不一致", None
    # 不做隐式舍入：FPS 取最小原样值，其余预算取最大原样值，避免显示精度掩盖越界。
    value = min(samples) if METRIC_RULES[metric][1] == "minimum" else max(samples)
    if evidence.get("value") != value:
        return f"测量证据 value 与原始 samples 实算值不一致：{evidence.get('value')} != {value}", None
    return None, value


def _measurement_evidence_mismatch(
    report: Mapping[str, Any],
    measurement: Mapping[str, Any],
    evidence: Mapping[str, Any],
) -> str | None:
    """要求测量契约与报告在身份、指标、单位和值上逐字段完全一致。"""
    expected = {
        "projectId": report.get("projectId"),
        "sourceRevision": report.get("sourceRevision"),
        "projectStateVersion": report.get("projectStateVersion"),
        "buildVersion": report.get("buildVersion"),
        "metric": measurement.get("metric"),
        "unit": measurement.get("unit"),
        "value": measurement.get("value"),
    }
    for field, expected_value in expected.items():
        if evidence.get(field) != expected_value:
            return f"测量证据 {field} 与报告不一致"
    environment = evidence.get("captureEnvironment")
    if not isinstance(environment, Mapping) or environment.get("platform") != report.get("platformId"):
        return "测量证据平台与报告不一致"
    return None


def _is_finite_number(value: object) -> bool:
    """排除布尔值及 JSON 无法表达的 NaN、Infinity。"""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _mappings(value: object) -> list[Mapping[str, Any]]:
    """安全提取映射数组，结构错误由 Schema 处理。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]
