"""校验批准拆分到模块与场景清单的规范化精确投影。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ProjectionIssue:
    """描述清单投影中的一个稳定问题。"""

    path: str
    message: str


MODULE_FIELDS = (
    "id", "category", "responsibility", "ownerRole", "owns",
    "dependsOn", "publicInterfaces", "sceneConsumers",
)
SCENE_FIELDS = {
    "id": "id",
    "purpose": "purpose",
    "lifecycle": "lifecycle",
    "entryCondition": "entryConditions",
    "exitCondition": "exitConditions",
    "dependsOnScenes": "dependencies",
    "moduleDependencies": "moduleDependencies",
    "owns": "ownedAssets",
}


def manifest_projection_issues(
    kind: str,
    manifest: Mapping[str, Any],
    decomposition: Mapping[str, Any],
) -> list[ProjectionIssue]:
    """验证清单只包含已批准 ID，且所有可投影字段与拆分决定一致。"""
    if decomposition.get("status") != "APPROVED":
        return [ProjectionIssue("$.decompositionPlan", "投影来源拆分尚未批准")]
    if kind == "module-manifest":
        return _module_projection_issues(manifest, decomposition)
    if kind == "scene-manifest":
        return _scene_projection_issues(manifest, decomposition)
    raise ValueError(f"不支持的投影类型: {kind}")


def _module_projection_issues(
    manifest: Mapping[str, Any], decomposition: Mapping[str, Any]
) -> list[ProjectionIssue]:
    """逐模块比较批准 ID 集合和公开边界字段。"""
    decision = _mapping(decomposition.get("decision"))
    approved_ids = set(_strings(decision.get("approvedModuleIds")))
    proposed_items = _mappings(decomposition.get("proposedModules"))
    actual_items = _mappings(manifest.get("modules"))
    proposed = {item.get("id"): item for item in proposed_items if item.get("id") in approved_ids}
    actual = {item.get("id"): item for item in actual_items}
    issues = _duplicate_id_issues(proposed_items, "$.decompositionPlan.proposedModules", "模块提案")
    issues.extend(_duplicate_id_issues(actual_items, "$.modules", "模块清单"))
    missing_proposals = sorted(approved_ids - set(proposed))
    if missing_proposals:
        issues.append(ProjectionIssue("$.decompositionPlan.decision.approvedModuleIds", f"批准模块缺少对应提案：{', '.join(missing_proposals)}"))
    issues.extend(_id_set_issues("$.modules", "模块", set(actual), approved_ids))
    for module_id in sorted(set(actual) & approved_ids):
        if module_id not in proposed:
            continue
        for field in MODULE_FIELDS:
            if _normalized(actual[module_id].get(field)) != _normalized(proposed[module_id].get(field)):
                issues.append(ProjectionIssue(f"$.modules[{module_id}].{field}", f"模块 {module_id} 的 {field} 与批准拆分不一致"))
    return issues


def _scene_projection_issues(
    manifest: Mapping[str, Any], decomposition: Mapping[str, Any]
) -> list[ProjectionIssue]:
    """比较单个场景清单与其已批准场景提案。"""
    decision = _mapping(decomposition.get("decision"))
    approved_ids = set(_strings(decision.get("approvedSceneIds")))
    scene_id = manifest.get("id")
    if scene_id not in approved_ids:
        return [ProjectionIssue("$.id", f"场景未包含在 approvedSceneIds：{scene_id}")]
    matching = [item for item in _mappings(decomposition.get("proposedScenes")) if item.get("id") == scene_id]
    if len(matching) != 1:
        return [ProjectionIssue("$.decompositionPlan.proposedScenes", f"批准场景必须且只能有一个对应提案：{scene_id}")]
    proposed = matching[0]
    issues: list[ProjectionIssue] = []
    for source_field, target_field in SCENE_FIELDS.items():
        expected = proposed.get(source_field)
        if source_field in {"entryCondition", "exitCondition"}:
            expected = [expected]
        if _normalized(manifest.get(target_field)) != _normalized(expected):
            issues.append(ProjectionIssue(f"$.{target_field}", f"场景 {scene_id} 的 {target_field} 与批准拆分不一致"))
    expected_capabilities = sorted(
        item.get("id")
        for item in _mappings(decomposition.get("sharedCapabilities"))
        if item.get("decision") == "PROMOTE_SHARED" and scene_id in _strings(item.get("consumerScenes"))
    )
    if _normalized(manifest.get("sharedCapabilities")) != expected_capabilities:
        issues.append(ProjectionIssue("$.sharedCapabilities", f"场景 {scene_id} 的共享能力与批准拆分不一致"))
    return issues


def _id_set_issues(path: str, label: str, actual: set[object], expected: set[str]) -> list[ProjectionIssue]:
    """报告投影集合中的遗漏和越权 ID。"""
    missing = sorted(expected - actual)
    extra = sorted(str(item) for item in actual - expected)
    details = []
    if missing:
        details.append(f"缺少：{', '.join(missing)}")
    if extra:
        details.append(f"未批准：{', '.join(extra)}")
    return [ProjectionIssue(path, f"{label}清单不是 approved IDs 的精确投影；{'；'.join(details)}")] if details else []


def _duplicate_id_issues(
    items: Sequence[Mapping[str, Any]], path: str, label: str
) -> list[ProjectionIssue]:
    """显式拒绝重复 ID，避免 dict/set 规范化吞掉冲突项。"""
    ids = [item.get("id") for item in items]
    duplicates = sorted(str(item) for item in set(ids) if ids.count(item) > 1)
    return [ProjectionIssue(path, f"{label}包含重复 ID：{', '.join(duplicates)}")] if duplicates else []


def _normalized(value: object) -> object:
    """对集合语义的字符串数组排序，其余字段保持精确值。"""
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return tuple(sorted(item for item in value if isinstance(item, str)))
    return value


def _mapping(value: object) -> Mapping[str, Any]:
    """安全提取映射，结构错误由 Schema 负责报告。"""
    return value if isinstance(value, Mapping) else {}


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
