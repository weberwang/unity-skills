"""校验模块全集与最终设备矩阵的门禁覆盖关系。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from unity_workflow.platform_contract import (
    approved_platform_targets,
    artifact_reference_failure,
    platform_check_coverage_failure,
)


class AcceptanceEvidenceReader(Protocol):
    """描述验收完整性校验所需的证据回读能力。"""

    active_decomposition: Mapping[str, Any]
    active_project_profile: Mapping[str, Any]

    def verify_active_decomposition(self) -> None:
        """验证当前批准拆分。"""

    def verify_active_project_profile(self) -> None:
        """验证当前用户批准的平台配置。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """读取已验证的契约。"""


def check_coverage_failure(
    reader: AcceptanceEvidenceReader,
    check_id: str,
    evidence: Sequence[object],
    expected_type: str | None,
) -> str | None:
    """校验同名报告、模块全集、场景全集与最终设备矩阵。"""
    reports = _referenced_contracts(reader, evidence, "quality-report")
    if expected_type == "quality-report" and not any(
        _has_pass_check(report, check_id) for report in reports
    ):
        return f"{check_id} 缺少同名 PASS 质量检查"
    if check_id == "modules.acceptance-complete":
        return _module_acceptance_failure(reader, reports)
    if check_id == "devices.acceptance-verified":
        return _device_acceptance_failure(reader, reports)
    if check_id in {
        "build.platform-development",
        "platforms.adaptation-complete",
        "performance.pass",
        "candidate.verified",
        "user.release-approved",
    }:
        return platform_check_coverage_failure(reader, check_id, evidence)
    if check_id in {"vertical-slice.playable", "scope.complete", "scenes.2d-adaptation-verified"}:
        return _scene_coverage_failure(reader, check_id, evidence)
    return None


def _module_acceptance_failure(
    reader: AcceptanceEvidenceReader,
    reports: Sequence[Mapping[str, Any]],
) -> str | None:
    """要求 G2 为每个已批准模块提供唯一当前 PASS 报告。"""
    approved_modules, _ = _approved_ids(reader)
    module_ids = [report.get("moduleId") for report in reports]
    if any(not _has_single_pass_check(report, "modules.acceptance-complete") for report in reports):
        return "modules.acceptance-complete 的每份模块报告都必须且只能包含一个同名 PASS 检查"
    if len(module_ids) != len(set(module_ids)):
        return "modules.acceptance-complete 包含重复 moduleId"
    actual = {item for item in module_ids if isinstance(item, str)}
    return _exact_set_failure("modules.acceptance-complete", "模块", approved_modules, actual)


def _device_acceptance_failure(
    reader: AcceptanceEvidenceReader,
    reports: Sequence[Mapping[str, Any]],
) -> str | None:
    """要求 G3 只接受覆盖全部模块与场景的唯一设备验收矩阵。"""
    matching = [report for report in reports if _has_single_pass_check(report, "devices.acceptance-verified")]
    if len(matching) != 1:
        return "devices.acceptance-verified 必须且只能引用一份设备验收报告"
    report = matching[0]
    acceptance = report.get("deviceAcceptance")
    if not isinstance(acceptance, Mapping):
        return "devices.acceptance-verified 缺少 deviceAcceptance 矩阵"
    approved_modules, approved_scenes = _approved_ids(reader)
    platform_targets = approved_platform_targets(reader)
    approved_platforms = set(platform_targets)
    platform_failure = _exact_set_failure(
        "devices.acceptance-verified",
        "平台",
        approved_platforms,
        set(_strings(acceptance.get("acceptedPlatformIds"))),
    )
    if platform_failure:
        return platform_failure
    module_failure = _exact_set_failure(
        "devices.acceptance-verified", "模块", approved_modules, set(_strings(acceptance.get("acceptedModuleIds")))
    )
    if module_failure:
        return module_failure
    scene_failure = _exact_set_failure(
        "devices.acceptance-verified", "场景", approved_scenes, set(_strings(acceptance.get("acceptedSceneIds")))
    )
    if scene_failure:
        return scene_failure

    profiles = _mappings(acceptance.get("deviceProfiles"))
    profile_ids = [item.get("id") for item in profiles]
    if len(profile_ids) != len(set(profile_ids)):
        return "devices.acceptance-verified 包含重复设备档位 ID"
    known_profiles = {item for item in profile_ids if isinstance(item, str)}
    profile_platforms = {
        item.get("platformId")
        for item in profiles
        if isinstance(item.get("platformId"), str)
    }
    if profile_platforms != approved_platforms:
        return _exact_set_failure(
            "devices.acceptance-verified",
            "设备档位平台",
            approved_platforms,
            profile_platforms,
        )
    for item in profiles:
        platform = item.get("platformId")
        target = platform_targets.get(str(platform))
        if not isinstance(target, Mapping) or item.get("formFactor") not in _strings(target.get("deviceClasses")):
            return f"devices.acceptance-verified 设备档位 {item.get('id')} 的形态不属于平台 {platform} 批准范围"
    artifact_failure = _device_artifact_failure(acceptance, approved_platforms)
    if artifact_failure:
        return artifact_failure
    cases = _mappings(acceptance.get("matrix"))
    case_ids = [item.get("id") for item in cases]
    if len(case_ids) != len(set(case_ids)):
        return "devices.acceptance-verified 包含重复矩阵用例 ID"
    pairs = [(item.get("deviceProfileId"), item.get("sceneId")) for item in cases]
    if len(pairs) != len(set(pairs)):
        return "devices.acceptance-verified 包含重复设备与场景组合"
    unknown_profiles = sorted(
        {str(item.get("deviceProfileId")) for item in cases if item.get("deviceProfileId") not in known_profiles}
    )
    unknown_scenes = sorted(
        {str(item.get("sceneId")) for item in cases if item.get("sceneId") not in approved_scenes}
    )
    if unknown_profiles:
        return f"devices.acceptance-verified 引用未知设备档位：{', '.join(unknown_profiles)}"
    if unknown_scenes:
        return f"devices.acceptance-verified 引用未批准场景：{', '.join(unknown_scenes)}"
    profile_platform_by_id = {
        item.get("id"): item.get("platformId")
        for item in profiles
        if isinstance(item.get("id"), str)
    }
    artifact_hash_by_platform = {
        item.get("platform"): item.get("sha256")
        for item in _mappings(acceptance.get("buildArtifacts"))
    }
    for item in cases:
        platform = profile_platform_by_id.get(item.get("deviceProfileId"))
        if item.get("artifactSha256") != artifact_hash_by_platform.get(platform):
            return f"devices.acceptance-verified 用例 {item.get('id')} 未绑定所属平台候选制品"
        target = platform_targets.get(str(platform))
        if not isinstance(target, Mapping):
            return f"devices.acceptance-verified 用例 {item.get('id')} 引用未批准平台"
        if item.get("inputMode") not in _strings(target.get("inputModes")):
            return f"devices.acceptance-verified 用例 {item.get('id')} 使用了平台未批准的输入模式"
        orientation = "LANDSCAPE" if int(item.get("width", 0)) >= int(item.get("height", 0)) else "PORTRAIT"
        if orientation not in _strings(target.get("orientations")):
            return f"devices.acceptance-verified 用例 {item.get('id')} 使用了平台未批准的屏幕方向"
        window_modes = _strings(target.get("windowModes"))
        if target.get("adaptationFamily") == "WINDOWS":
            if item.get("windowMode") not in window_modes:
                return f"devices.acceptance-verified 用例 {item.get('id')} 使用了平台未批准的窗口模式"
        elif item.get("windowMode") != "FULLSCREEN":
            return f"devices.acceptance-verified 移动端用例 {item.get('id')} 必须使用 FULLSCREEN"
    covered = {
        (item.get("deviceProfileId"), item.get("sceneId"))
        for item in cases
        if item.get("status") == "PASS"
    }
    missing_pairs = sorted(
        f"{profile}/{scene}"
        for profile in known_profiles
        for scene in approved_scenes
        if (profile, scene) not in covered
    )
    if missing_pairs:
        return "devices.acceptance-verified 未覆盖设备与场景笛卡尔积：" + ", ".join(missing_pairs)
    return _device_report_artifacts_failure(report, acceptance)


def _device_artifact_failure(
    acceptance: Mapping[str, Any],
    approved_platforms: set[str],
) -> str | None:
    """校验设备矩阵恰好包含每个批准平台的一个主制品。"""
    artifacts = _mappings(acceptance.get("buildArtifacts"))
    platforms = [item.get("platform") for item in artifacts]
    failure = _exact_set_failure(
        "devices.acceptance-verified", "候选制品平台", approved_platforms,
        {item for item in platforms if isinstance(item, str)},
    )
    if failure:
        return failure
    if len(platforms) != len(set(platforms)):
        return "devices.acceptance-verified 包含重复平台候选制品"
    for artifact in artifacts:
        reference = {"type": "platform-build-artifact", **artifact}
        if artifact_failure := artifact_reference_failure(reference, str(artifact.get("platform"))):
            return f"devices.acceptance-verified 平台制品无效：{artifact_failure}"
    return None


def _device_report_artifacts_failure(
    report: Mapping[str, Any], acceptance: Mapping[str, Any]
) -> str | None:
    """校验设备验收报告与全部平台主制品引用完全一致。"""
    checks = [item for item in _mappings(report.get("checks")) if item.get("id") == "devices.acceptance-verified"]
    if len(checks) != 1 or checks[0].get("status") != "PASS":
        return "设备验收报告必须且只能包含一个同名 PASS 检查"
    artifact_references = [
        item for item in _mappings(checks[0].get("evidence"))
        if item.get("type") == "platform-build-artifact"
    ]
    artifacts = _mappings(acceptance.get("buildArtifacts"))
    if len(artifact_references) != len(artifacts):
        return "设备验收报告必须为每个平台主制品提供唯一文件证据"
    expected = {
        (item.get("platform"), item.get("artifactType"), item.get("path"), item.get("sha256"))
        for item in artifacts
    }
    actual = {
        (item.get("platform"), item.get("artifactType"), item.get("path"), item.get("sha256"))
        for item in artifact_references
    }
    if actual != expected:
        return "设备验收报告的平台制品字段与文件证据不一致"
    return None


def _scene_coverage_failure(
    reader: AcceptanceEvidenceReader,
    check_id: str,
    evidence: Sequence[object],
) -> str | None:
    """校验垂直切片或场景全集检查的 scene-manifest 覆盖。"""
    _, approved_scenes = _approved_ids(reader)
    manifests = _referenced_contracts(reader, evidence, "scene-manifest")
    manifest_ids = [item.get("id") for item in manifests if isinstance(item.get("id"), str)]
    if check_id == "vertical-slice.playable":
        invalid = sorted(set(manifest_ids) - approved_scenes)
        if not manifest_ids or invalid:
            return "vertical-slice.playable 的 sceneId 必须属于 approvedSceneIds"
        return None
    if len(manifest_ids) != len(set(manifest_ids)):
        return f"{check_id} 包含重复 scene-manifest"
    return _exact_set_failure(check_id, "场景", approved_scenes, set(manifest_ids))


def _approved_ids(reader: AcceptanceEvidenceReader) -> tuple[set[str], set[str]]:
    """回读当前拆分中已批准的模块与场景全集。"""
    reader.verify_active_decomposition()
    decomposition = reader._load_referenced_contract(reader.active_decomposition)
    decision = decomposition.get("decision")
    if not isinstance(decision, Mapping):
        return set(), set()
    return set(_strings(decision.get("approvedModuleIds"))), set(_strings(decision.get("approvedSceneIds")))


def _referenced_contracts(
    reader: AcceptanceEvidenceReader,
    evidence: Sequence[object],
    kind: str,
) -> list[Mapping[str, Any]]:
    """按证据类型回读契约列表。"""
    return [
        reader._load_referenced_contract(reference)
        for reference in evidence
        if isinstance(reference, Mapping) and reference.get("type") == kind
    ]


def _has_pass_check(report: Mapping[str, Any], check_id: str) -> bool:
    """判定质量报告是否含有指定同名 PASS 检查。"""
    return any(
        item.get("id") == check_id and item.get("status") == "PASS"
        for item in _mappings(report.get("checks"))
    )


def _has_single_pass_check(report: Mapping[str, Any], check_id: str) -> bool:
    """判定质量报告恰好包含一个指定同名 PASS 检查。"""
    matching = [item for item in _mappings(report.get("checks")) if item.get("id") == check_id]
    return len(matching) == 1 and matching[0].get("status") == "PASS"


def _exact_set_failure(label: str, noun: str, expected: set[str], actual: set[str]) -> str | None:
    """返回预期全集与实际集合的稳定差异描述。"""
    if actual == expected:
        return None
    details: list[str] = []
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        details.append(f"缺少已批准{noun}：{', '.join(missing)}")
    if extra:
        details.append(f"包含未批准{noun}：{', '.join(extra)}")
    return f"{label} 必须覆盖当前拆分的{noun}全集；" + "；".join(details)


def _mappings(value: object) -> list[Mapping[str, Any]]:
    """安全提取映射数组。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _strings(value: object) -> list[str]:
    """安全提取字符串数组。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, str)]
