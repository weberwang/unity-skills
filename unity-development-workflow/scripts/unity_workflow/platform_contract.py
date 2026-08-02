"""校验用户批准的平台集合及各平台构建制品绑定。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol


PLATFORM_IDS = {"WINDOWS", "ANDROID", "IOS", "IPADOS"}
PRIMARY_ARTIFACT_TYPES = {
    "WINDOWS": {"WINDOWS_EXECUTABLE"},
    "ANDROID": {"ANDROID_APK", "ANDROID_APP_BUNDLE"},
    "IOS": {"IOS_IPA"},
    "IPADOS": {"IOS_IPA"},
}
ARTIFACT_EXTENSIONS = {
    "WINDOWS_EXECUTABLE": (".exe",),
    "ANDROID_APK": (".apk",),
    "ANDROID_APP_BUNDLE": (".aab",),
    "IOS_IPA": (".ipa",),
}


class PlatformEvidenceReader(Protocol):
    """描述平台契约校验所需的证据回读能力。"""

    active_project_profile: Mapping[str, Any]

    def verify_active_project_profile(self) -> None:
        """验证当前项目配置。"""

    def verify_reference(self, reference: object) -> None:
        """验证证据引用。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """读取已验证契约。"""


def profile_platform_failure(profile: Mapping[str, Any]) -> str | None:
    """验证平台选择状态、唯一性和主开发平台。"""
    delivery = profile.get("delivery")
    if not isinstance(delivery, Mapping):
        return "project-profile 缺少 delivery 平台选择"
    if delivery.get("platformSelectionStatus") != "APPROVED":
        return "project-profile 平台选择未获得用户批准"
    targets = _mappings(delivery.get("targets"))
    platform_ids = [item.get("platformId") for item in targets]
    if len(platform_ids) != len(set(platform_ids)):
        return "project-profile 包含重复目标平台"
    selected = {item for item in platform_ids if isinstance(item, str)}
    if not selected or not selected.issubset(PLATFORM_IDS):
        return "project-profile 目标平台集合无效"
    if delivery.get("primaryDevelopmentPlatform") not in selected:
        return "project-profile 主开发平台不在用户批准的平台集合中"
    for target in targets:
        platform = target.get("platformId")
        orientations = {
            item for item in _objects(target.get("orientations")) if isinstance(item, str)
        }
        resolution_orientations = {
            item.get("orientation")
            for item in _mappings(target.get("referenceResolutions"))
            if isinstance(item.get("orientation"), str)
        }
        if orientations != resolution_orientations:
            return f"project-profile 平台 {platform} 的参考分辨率必须覆盖且只能覆盖已选方向"
        if target.get("adaptationFamily") == "MOBILE" and len(orientations) > 1 and target.get("autorotation") is not True:
            return f"project-profile 平台 {platform} 同时支持横竖屏时必须启用自动旋转"
    return None


def approved_platform_ids(reader: PlatformEvidenceReader) -> set[str]:
    """回读用户批准的目标平台全集。"""
    profile = active_project_profile(reader)
    delivery = profile.get("delivery")
    if not isinstance(delivery, Mapping):
        return set()
    return {
        item.get("platformId")
        for item in _mappings(delivery.get("targets"))
        if isinstance(item.get("platformId"), str)
    }


def approved_platform_targets(reader: PlatformEvidenceReader) -> dict[str, Mapping[str, Any]]:
    """回读按平台 ID 索引的用户批准适配配置。"""
    profile = active_project_profile(reader)
    delivery = profile.get("delivery")
    if not isinstance(delivery, Mapping):
        return {}
    return {
        str(item.get("platformId")): item
        for item in _mappings(delivery.get("targets"))
        if isinstance(item.get("platformId"), str)
    }


def primary_platform_id(reader: PlatformEvidenceReader) -> str:
    """回读用户批准的主开发平台。"""
    profile = active_project_profile(reader)
    delivery = profile.get("delivery")
    return str(delivery.get("primaryDevelopmentPlatform", "")) if isinstance(delivery, Mapping) else ""


def active_project_profile(reader: PlatformEvidenceReader) -> Mapping[str, Any]:
    """验证并加载质量门当前项目配置。"""
    reader.verify_active_project_profile()
    return reader._load_referenced_contract(reader.active_project_profile)


def platform_check_coverage_failure(
    reader: PlatformEvidenceReader,
    check_id: str,
    evidence: Sequence[object],
) -> str | None:
    """验证平台构建、适配和候选清单精确覆盖批准范围。"""
    expected = approved_platform_ids(reader)
    if check_id == "build.platform-development":
        expected = {primary_platform_id(reader)}
        contracts = _contracts(reader, evidence, "quality-report")
        return _report_platform_failure(check_id, contracts, expected)
    if check_id == "platforms.adaptation-complete":
        contracts = _contracts(reader, evidence, "quality-report")
        return _report_platform_failure(check_id, contracts, expected)
    if check_id == "performance.pass":
        contracts = _contracts(reader, evidence, "quality-report")
        return _report_platform_failure(check_id, contracts, expected)
    if check_id in {"candidate.verified", "user.release-approved"}:
        contracts = _contracts(reader, evidence, "delivery-manifest")
        actual = [item.get("platform") for item in contracts]
        return _exact_platform_failure(check_id, expected, actual)
    return None


def g3_candidate_device_failure(
    reader: PlatformEvidenceReader,
    checks: Mapping[object, object],
) -> str | None:
    """要求最终设备报告使用每个平台候选清单中的同一主制品。"""
    candidate_check = checks.get("candidate.verified")
    device_check = checks.get("devices.acceptance-verified")
    if not isinstance(candidate_check, Mapping) or not isinstance(device_check, Mapping):
        return "G3 缺少候选包或设备验收检查"
    manifests = _contracts(reader, _objects(candidate_check.get("evidence")), "delivery-manifest")
    reports = _contracts(reader, _objects(device_check.get("evidence")), "quality-report")
    device_reports = [item for item in reports if _has_pass_check(item, "devices.acceptance-verified")]
    if len(device_reports) != 1:
        return "G3 必须且只能包含一份最终设备验收报告"
    candidate_artifacts: dict[str, tuple[object, object, object]] = {}
    for manifest in manifests:
        platform = manifest.get("platform")
        artifact = delivery_primary_artifact(manifest)
        if not isinstance(platform, str) or artifact is None:
            return "G3 候选清单缺少平台主制品"
        candidate_artifacts[platform] = _artifact_key(artifact)
    acceptance = device_reports[0].get("deviceAcceptance")
    if not isinstance(acceptance, Mapping):
        return "G3 设备验收报告缺少 deviceAcceptance"
    device_artifacts = {
        item.get("platform"): _artifact_key(item)
        for item in _mappings(acceptance.get("buildArtifacts"))
        if isinstance(item.get("platform"), str)
    }
    if candidate_artifacts != device_artifacts:
        return "G3 设备验收制品与各平台候选清单不一致"
    return None


def s00_platform_failure(
    reader: PlatformEvidenceReader,
    report: Mapping[str, Any],
) -> str | None:
    """要求 S00 空壳构建严格绑定用户批准的主开发平台。"""
    expected = primary_platform_id(reader)
    build = report.get("emptyPlatformBuild")
    if not isinstance(build, Mapping):
        return "S00 缺少 emptyPlatformBuild"
    if build.get("platformId") != expected:
        return f"S00 空壳构建必须使用主开发平台 {expected}"
    artifact = build.get("artifact")
    if not isinstance(artifact, Mapping):
        return "S00 空壳构建缺少平台制品引用"
    if failure := artifact_reference_failure(artifact, expected):
        return f"S00 空壳构建制品无效：{failure}"
    return None


def artifact_reference_failure(reference: Mapping[str, Any], expected_platform: str | None = None) -> str | None:
    """验证平台构建引用的类型、平台和扩展名一致。"""
    required = ("type", "artifactType", "platform", "path", "sha256")
    missing = [field for field in required if not isinstance(reference.get(field), str) or not reference.get(field)]
    if missing:
        return "缺少字段：" + ", ".join(missing)
    if reference.get("type") != "platform-build-artifact":
        return "type 必须为 platform-build-artifact"
    platform = reference.get("platform")
    artifact_type = reference.get("artifactType")
    if platform not in PLATFORM_IDS:
        return "platform 不是受支持的平台 ID"
    if expected_platform is not None and platform != expected_platform:
        return f"platform 必须为主开发平台 {expected_platform}"
    if artifact_type not in PRIMARY_ARTIFACT_TYPES[str(platform)]:
        return f"artifactType 与平台 {platform} 不匹配"
    path = str(reference.get("path", "")).lower()
    if not path.endswith(ARTIFACT_EXTENSIONS[str(artifact_type)]):
        return f"path 扩展名与 {artifact_type} 不匹配"
    return None


def delivery_primary_artifact(delivery: Mapping[str, Any]) -> Mapping[str, Any] | None:
    """返回交付清单中与平台匹配的唯一主制品。"""
    platform = delivery.get("platform")
    expected_types = PRIMARY_ARTIFACT_TYPES.get(str(platform), set())
    matches = [
        item for item in _mappings(delivery.get("artifacts"))
        if item.get("artifactType") in expected_types
    ]
    return matches[0] if len(matches) == 1 else None


def _report_platform_failure(
    check_id: str,
    reports: Sequence[Mapping[str, Any]],
    expected: set[str],
) -> str | None:
    """验证每个平台恰有一份同名 PASS 报告。"""
    if any(not _has_single_pass_check(report, check_id) for report in reports):
        return f"{check_id} 的每个平台报告都必须且只能包含一个同名 PASS 检查"
    if check_id == "platforms.adaptation-complete":
        for report in reports:
            check = next(
                item for item in _mappings(report.get("checks"))
                if item.get("id") == check_id
            )
            platform = report.get("platformId")
            matching = [
                item for item in _mappings(check.get("evidence"))
                if item.get("type") == "platform-adaptation-test-report"
            ]
            if len(matching) != 1 or matching[0].get("platform") != platform:
                return f"{check_id} 平台 {platform} 必须绑定唯一同平台适配测试报告"
    actual = [report.get("platformId") for report in reports]
    return _exact_platform_failure(check_id, expected, actual)


def _exact_platform_failure(label: str, expected: set[str], actual_items: Sequence[object]) -> str | None:
    """返回目标平台全集与实际集合的稳定差异。"""
    if len(actual_items) != len(set(actual_items)):
        return f"{label} 包含重复平台"
    actual = {item for item in actual_items if isinstance(item, str)}
    if actual == expected:
        return None
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    details: list[str] = []
    if missing:
        details.append("缺少批准平台：" + ", ".join(missing))
    if extra:
        details.append("包含未批准平台：" + ", ".join(extra))
    return f"{label} 必须精确覆盖用户批准的平台全集；" + "；".join(details)


def _contracts(
    reader: PlatformEvidenceReader,
    evidence: Sequence[object],
    kind: str,
) -> list[Mapping[str, Any]]:
    """回读指定类型的契约证据。"""
    return [
        reader._load_referenced_contract(reference)
        for reference in evidence
        if isinstance(reference, Mapping) and reference.get("type") == kind
    ]


def _has_single_pass_check(report: Mapping[str, Any], check_id: str) -> bool:
    """判定报告恰好包含一个指定同名 PASS 检查。"""
    checks = [item for item in _mappings(report.get("checks")) if item.get("id") == check_id]
    return len(checks) == 1 and checks[0].get("status") == "PASS"


def _has_pass_check(report: Mapping[str, Any], check_id: str) -> bool:
    """判定报告包含指定同名 PASS 检查。"""
    return any(
        item.get("id") == check_id and item.get("status") == "PASS"
        for item in _mappings(report.get("checks"))
    )


def _artifact_key(artifact: Mapping[str, Any]) -> tuple[object, object, object]:
    """构造平台主制品稳定比较键。"""
    return artifact.get("artifactType"), artifact.get("path"), artifact.get("sha256")


def _mappings(value: object) -> list[Mapping[str, Any]]:
    """安全提取映射数组。"""
    return [item for item in _objects(value) if isinstance(item, Mapping)]


def _objects(value: object) -> list[object]:
    """安全提取普通数组。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return list(value)
