"""校验 G1 垂直切片检查共享同一场景与主平台开发构建。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol

from unity_workflow.platform_contract import artifact_reference_failure, primary_platform_id


G1_CHECK_TYPES = {
    "vertical-slice.playable": ("scene-manifest", "scene-report"),
    "build.platform-development": ("quality-report",),
}
IDENTITY_FIELDS = (
    "projectId",
    "subjectId",
    "subjectVersion",
    "sourceRevision",
    "projectStateVersion",
    "buildVersion",
)


class G1EvidenceReader(Protocol):
    """描述 G1 组合完整性校验需要的证据读取能力。"""

    project_id: str
    source_revision: str
    project_state_version: str
    build_version: str
    active_decomposition: Mapping[str, Any]
    active_project_profile: Mapping[str, Any]

    def verify_reference(self, reference: object) -> None:
        """验证证据引用及其文件哈希。"""

    def verify_active_decomposition(self) -> None:
        """验证当前批准拆分。"""

    def verify_active_project_profile(self) -> None:
        """验证当前项目平台配置。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """加载已经验证的契约。"""


def g1_vertical_slice_failure(
    reader: G1EvidenceReader,
    checks: Mapping[object, object],
) -> str | None:
    """要求 G1 开发检查唯一绑定同一批准场景和同一主平台制品。"""
    contracts: dict[str, Mapping[str, Any]] = {}
    primary_references: dict[str, Mapping[str, Any]] = {}
    artifact_references: dict[str, Mapping[str, Any]] = {}
    primary_platform = primary_platform_id(reader)
    for check_id, expected_types in G1_CHECK_TYPES.items():
        check = checks.get(check_id)
        if not isinstance(check, Mapping) or check.get("status") != "PASS":
            return f"G1/{check_id} 缺少 PASS 检查"
        evidence = _mappings(check.get("evidence"))
        artifacts = [item for item in evidence if item.get("type") == "platform-build-artifact"]
        for expected_type in expected_types:
            primary = [item for item in evidence if item.get("type") == expected_type]
            if len(primary) != 1:
                return f"G1/{check_id} 必须且只能包含一个 {expected_type}"
            reader.verify_reference(primary[0])
            contracts[expected_type] = reader._load_referenced_contract(primary[0])
            primary_references[expected_type] = primary[0]
        if len(artifacts) != 1:
            return f"G1/{check_id} 必须且只能包含一个 platform-build-artifact"
        artifact_issue = artifact_reference_failure(artifacts[0], primary_platform)
        if artifact_issue:
            return f"G1/{check_id} 的主平台制品 {artifact_issue}"
        reader.verify_reference(artifacts[0])
        artifact_references[check_id] = artifacts[0]

    reference_keys = {_reference_key(item) for item in artifact_references.values()}
    if len(reference_keys) != 1:
        return "G1 开发检查绑定的平台构建制品引用不一致"
    artifact = next(iter(artifact_references.values()))
    current_issue = _current_identity_issue(reader, artifact)
    if current_issue:
        return current_issue

    manifest = contracts["scene-manifest"]
    playability = contracts["scene-report"]
    report = contracts["quality-report"]
    scene_id = artifact.get("subjectId")
    contract_issue = _contract_binding_issue(
        reader, scene_id, artifact, manifest, playability, report
    )
    if contract_issue:
        return contract_issue

    reader.verify_active_decomposition()
    decomposition = reader._load_referenced_contract(reader.active_decomposition)
    decision = decomposition.get("decision")
    approved_scene_ids = set(
        decision.get("approvedSceneIds", []) if isinstance(decision, Mapping) else []
    )
    if scene_id not in approved_scene_ids:
        return f"G1 垂直切片场景未包含在 approvedSceneIds：{scene_id}"

    manifest_reference = playability.get("sceneManifest")
    if not isinstance(manifest_reference, Mapping) or _contract_reference_key(
        manifest_reference
    ) != _contract_reference_key(primary_references["scene-manifest"]):
        return "G1 可玩性报告未绑定 vertical-slice.playable 的同一 scene-manifest"
    tests_failure = _nested_artifact_failure(
        "G1 可玩性报告 tests",
        playability.get("tests"),
        artifact,
        expected_id="vertical-slice.playable",
    )
    if tests_failure:
        return tests_failure

    report_checks = [
        item
        for item in _mappings(report.get("checks"))
        if item.get("id") == "build.platform-development" and item.get("status") == "PASS"
    ]
    if len(report_checks) != 1:
        return "G1 构建报告必须且只能包含一个 PASS build.platform-development"
    return _nested_artifact_failure(
        "G1 构建报告", report_checks[0], artifact, expected_id="build.platform-development"
    )


def _contract_binding_issue(
    reader: G1EvidenceReader,
    scene_id: object,
    artifact: Mapping[str, Any],
    manifest: Mapping[str, Any],
    playability: Mapping[str, Any],
    report: Mapping[str, Any],
) -> str | None:
    """逐字段比较开发期主契约与当前平台构建制品绑定。"""
    contracts = (
        ("场景清单", manifest),
        ("可玩性报告", playability),
        ("构建报告", report),
    )
    for label, contract in contracts:
        if contract.get("projectId") != reader.project_id:
            return f"G1 {label} projectId 与当前项目不一致"
        if contract.get("sourceRevision") != reader.source_revision:
            return f"G1 {label} sourceRevision 与当前源码不一致"
        if contract.get("projectStateVersion") != reader.project_state_version:
            return f"G1 {label} projectStateVersion 与当前状态不一致"
    scene_ids = (manifest.get("id"), playability.get("sceneId"), report.get("sceneId"))
    if any(item != scene_id for item in scene_ids):
        return "G1 可玩性、视觉与构建证据未绑定同一 sceneId"
    if playability.get("sceneVersion") != manifest.get("version"):
        return "G1 可玩性报告 sceneVersion 与场景清单版本不一致"
    if playability.get("reportPurpose") != "VERTICAL_SLICE":
        return "G1 可玩性报告 reportPurpose 必须为 VERTICAL_SLICE"
    if playability.get("status") != "PASS":
        return "G1 可玩性报告状态不是 PASS"
    for label, contract in (("可玩性报告", playability), ("构建报告", report)):
        if contract.get("buildVersion") != reader.build_version:
            return f"G1 {label} buildVersion 与当前构建不一致"
        if contract.get("buildArtifactSha256") != artifact.get("sha256"):
            return f"G1 {label}未绑定共享平台制品 SHA-256"
    if report.get("platformId") != artifact.get("platform"):
        return "G1 构建报告未绑定主开发平台"
    build_artifact = report.get("buildArtifact")
    if not isinstance(build_artifact, Mapping):
        return "G1 构建报告缺少显式 buildArtifact"
    expected_artifact = {
        field: artifact.get(field)
        for field in ("artifactType", "platform", "path", "sha256")
    }
    if any(build_artifact.get(field) != value for field, value in expected_artifact.items()):
        return "G1 构建报告 buildArtifact 与共享平台制品不一致"
    return None


def _nested_artifact_failure(
    label: str,
    check: object,
    artifact: Mapping[str, Any],
    *,
    expected_id: str,
) -> str | None:
    """要求场景测试或构建检查唯一引用共享平台制品。"""
    if not isinstance(check, Mapping):
        return f"{label} 缺少检查结果"
    if check.get("id") != expected_id:
        return f"{label} id 必须为 {expected_id}"
    if check.get("status") != "PASS":
        return f"{label} 状态不是 PASS"
    nested = [
        item
        for item in _mappings(check.get("evidence"))
        if item.get("type") == "platform-build-artifact"
    ]
    if len(nested) != 1:
        return f"{label} 必须且只能包含一个 platform-build-artifact"
    if _reference_key(nested[0]) != _reference_key(artifact):
        return f"{label} 未绑定 G1 共享平台制品"
    return None


def _current_identity_issue(
    reader: G1EvidenceReader,
    reference: Mapping[str, Any],
) -> str | None:
    """拒绝旧项目、旧源码、旧状态或旧构建的平台制品引用。"""
    expected = {
        "projectId": reader.project_id,
        "sourceRevision": reader.source_revision,
        "projectStateVersion": reader.project_state_version,
        "buildVersion": reader.build_version,
    }
    mismatches = [field for field, value in expected.items() if reference.get(field) != value]
    if mismatches:
        return f"G1 平台制品使用旧身份：{', '.join(mismatches)}"
    if reference.get("subjectVersion") != reader.build_version:
        return "G1 平台制品 subjectVersion 必须等于当前 buildVersion"
    return None


def _reference_key(reference: Mapping[str, Any]) -> tuple[object, ...]:
    """构造包含文件和全部身份字段的稳定平台制品引用键。"""
    fields = ("type", "artifactType", "platform", "path", "sha256", *IDENTITY_FIELDS)
    return tuple(reference.get(field) for field in fields)


def _contract_reference_key(reference: Mapping[str, Any]) -> tuple[object, ...]:
    """比较场景契约引用的文件、主体和项目状态身份。"""
    fields = (
        "type", "path", "sha256", "projectId", "subjectId", "subjectVersion",
        "sourceRevision", "projectStateVersion",
    )
    return tuple(reference.get(field) for field in fields)


def _mappings(value: object) -> list[Mapping[str, Any]]:
    """安全提取映射数组，结构错误由上层契约报告。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]
