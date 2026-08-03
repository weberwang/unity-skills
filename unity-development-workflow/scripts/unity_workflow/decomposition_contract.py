"""校验模块与场景拆分决策及其下游新鲜度。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


DECOMPOSITION_QUESTIONS = {
    "CORE_LOOP", "PLAYER_JOURNEY", "SCENE_LIFECYCLE", "PERSISTENCE_BOUNDARY",
    "SHARED_CAPABILITY", "OWNERSHIP", "DEPENDENCY_DIRECTION", "ASSET_BOUNDARY",
    "UI_BOUNDARY", "PERFORMANCE_BUDGET", "TEST_BOUNDARY", "DELIVERY_IMPACT",
    "MERGE_RECOVERY",
}

EXPECTED_GATE_CHECKS = {
    "G0": {"grilling.approved", "scope.approved", "decomposition.approved", "visual-bible.approved", "platforms.approved"},
    "G1": {"s00.verified", "vertical-slice.playable", "build.platform-development"},
    "G2": {"scope.complete", "modules.acceptance-complete", "platforms.adaptation-complete", "assets.production-ready", "regression.pass", "defects.p0-p1-resolved"},
    "G3": {"candidate.verified", "licenses.verified", "privacy.verified", "rollback.ready", "devices.acceptance-verified", "performance.pass", "scenes.2d-adaptation-verified", "user.release-approved"},
}


@dataclass(frozen=True, slots=True)
class DecompositionIssue:
    """描述拆分契约中一个稳定定位的问题。"""

    path: str
    message: str


def decomposition_reference_issues(payload: Mapping[str, Any]) -> list[DecompositionIssue]:
    """约束模块、场景与 S00 只能引用同一源码和项目状态下的拆分决策。"""
    reference = payload.get("decompositionPlan")
    if not isinstance(reference, Mapping):
        return []
    issues: list[DecompositionIssue] = []
    if reference.get("type") != "decomposition-plan":
        issues.append(DecompositionIssue("$.decompositionPlan.type", "必须引用 decomposition-plan 契约"))
    if not reference.get("subjectId"):
        issues.append(DecompositionIssue("$.decompositionPlan.subjectId", "必须绑定拆分决策 ID"))
    if not reference.get("subjectVersion"):
        issues.append(DecompositionIssue("$.decompositionPlan.subjectVersion", "必须绑定拆分决策版本"))
    if reference.get("sourceRevision") != payload.get("sourceRevision"):
        issues.append(DecompositionIssue("$.decompositionPlan.sourceRevision", "必须绑定下游制品的 sourceRevision"))
    if reference.get("projectStateVersion") != payload.get("projectStateVersion"):
        issues.append(DecompositionIssue("$.decompositionPlan.projectStateVersion", "必须绑定下游制品的 projectStateVersion"))
    return issues


def decomposition_freshness_issues(
    control: Mapping[str, Any], payload: Mapping[str, Any]
) -> list[DecompositionIssue]:
    """比较下游制品与当前拆分指针，使新待确认版本立即作废旧批准。"""
    workflow = control.get("workflow")
    if isinstance(workflow, Mapping):
        current = workflow.get("decomposition")
        marker = {
            "subjectId": current.get("id") if isinstance(current, Mapping) else None,
            "subjectVersion": current.get("version") if isinstance(current, Mapping) else None,
            "sourceRevision": workflow.get("sourceRevision"),
            "projectStateVersion": workflow.get("projectStateVersion"),
        }
        current_status = current.get("status") if isinstance(current, Mapping) else None
    else:
        active = control.get("activeDecomposition")
        marker = dict(active) if isinstance(active, Mapping) else {}
        current_status = "APPROVED"

    issues: list[DecompositionIssue] = []
    if current_status != "APPROVED":
        issues.append(DecompositionIssue("$.decompositionPlan", "项目当前拆分版本尚未获得用户批准"))
    reference = payload.get("decompositionPlan")
    if not isinstance(reference, Mapping):
        return [*issues, DecompositionIssue("$.decompositionPlan", "下游制品缺少当前拆分引用")]
    for field, label in (
        ("subjectId", "拆分 ID"), ("subjectVersion", "拆分版本"),
        ("sourceRevision", "源码修订"), ("projectStateVersion", "项目状态版本"),
    ):
        if reference.get(field) != marker.get(field):
            issues.append(DecompositionIssue(f"$.decompositionPlan.{field}", f"{label}不是项目当前值"))
    for field, label in (("sourceRevision", "源码修订"), ("projectStateVersion", "项目状态版本")):
        if payload.get(field) != marker.get(field):
            issues.append(DecompositionIssue(f"$.{field}", f"下游{label}不是项目当前值"))
    if payload.get("projectId") != control.get("projectId"):
        issues.append(DecompositionIssue("$.projectId", "下游制品不属于当前项目"))
    return sorted(set(issues), key=lambda issue: (issue.path, issue.message))


def decomposition_plan_issues(payload: Mapping[str, Any]) -> list[DecompositionIssue]:
    """校验拆分拷问、模块/场景边界、共享依据和用户决定的一致性。"""
    issues: list[DecompositionIssue] = []
    snapshot = payload.get("candidateSnapshot")
    if isinstance(snapshot, Mapping):
        expected_snapshot = {
            "projectId": payload.get("projectId"),
            "subjectId": payload.get("id"),
            "subjectVersion": payload.get("version"),
            "sourceRevision": payload.get("sourceRevision"),
            "projectStateVersion": payload.get("projectStateVersion"),
        }
        for field, expected in expected_snapshot.items():
            if snapshot.get(field) != expected:
                issues.append(DecompositionIssue(f"$.candidateSnapshot.{field}", "拆分快照必须绑定当前候选的项目、ID、版本和状态"))
    grilling = payload.get("grillingEvidence")
    if isinstance(grilling, Mapping):
        if grilling.get("type") != "grilling-record":
            issues.append(DecompositionIssue("$.grillingEvidence.type", "拆分必须引用 grilling-record 契约"))
        for field, label in (("projectId", "项目"), ("sourceRevision", "源码修订"), ("projectStateVersion", "项目状态版本")):
            if grilling.get(field) != payload.get(field):
                issues.append(DecompositionIssue(f"$.grillingEvidence.{field}", f"拷问记录{label}必须与当前拆分一致"))
    interrogation = _mapping_items(payload.get("interrogation"))
    question_ids = [item.get("id") for item in interrogation if isinstance(item.get("id"), str)]
    missing = sorted(DECOMPOSITION_QUESTIONS - set(question_ids))
    if missing:
        issues.append(DecompositionIssue("$.interrogation", f"缺少拆分拷问: {'、'.join(missing)}"))
    if len(question_ids) != len(set(question_ids)):
        issues.append(DecompositionIssue("$.interrogation", "拆分拷问 ID 必须唯一"))

    modules = _mapping_items(payload.get("proposedModules"))
    scenes = _mapping_items(payload.get("proposedScenes"))
    capabilities = _mapping_items(payload.get("sharedCapabilities"))
    issues.extend(_duplicate_id_issues(modules, "proposedModules", "候选模块"))
    issues.extend(_duplicate_id_issues(scenes, "proposedScenes", "候选场景"))
    issues.extend(_duplicate_id_issues(capabilities, "sharedCapabilities", "共享能力"))
    module_ids = {item.get("id") for item in modules if isinstance(item.get("id"), str)}
    scene_ids = {item.get("id") for item in scenes if isinstance(item.get("id"), str)}

    module_dependencies: dict[str, tuple[str, ...]] = {}
    module_paths: list[tuple[int, str, str]] = []
    for index, module in enumerate(modules):
        module_id = module.get("id")
        if not isinstance(module_id, str):
            continue
        module_dependencies[module_id] = tuple(module.get("dependsOn", []))
        for dependency in module_dependencies[module_id]:
            if dependency not in module_ids:
                issues.append(DecompositionIssue(f"$.proposedModules[{index}].dependsOn", f"候选模块包含未知依赖: {dependency}"))
        module_paths.extend((index, module_id, path.rstrip("/")) for path in module.get("owns", []) if isinstance(path, str))
        for scene_id in module.get("sceneConsumers", []):
            if scene_id not in scene_ids:
                issues.append(DecompositionIssue(f"$.proposedModules[{index}].sceneConsumers", f"候选模块引用未知场景: {scene_id}"))
        if module.get("category") == "Shared" and len(set(module.get("sceneConsumers", []))) < 2:
            issues.append(DecompositionIssue(f"$.proposedModules[{index}].sceneConsumers", "Shared 模块必须至少有两个已提议场景消费者"))
    issues.extend(_cycle_issues(module_dependencies, "模块", "$.proposedModules"))
    issues.extend(_overlap_issues(module_paths, "模块", "$.proposedModules"))

    scene_dependencies: dict[str, tuple[str, ...]] = {}
    scene_paths: list[tuple[int, str, str]] = []
    for index, scene in enumerate(scenes):
        scene_id = scene.get("id")
        if not isinstance(scene_id, str):
            continue
        scene_dependencies[scene_id] = tuple(scene.get("dependsOnScenes", []))
        scene_paths.extend((index, scene_id, path.rstrip("/")) for path in scene.get("owns", []) if isinstance(path, str))
        for dependency in scene_dependencies[scene_id]:
            if dependency not in scene_ids:
                issues.append(DecompositionIssue(f"$.proposedScenes[{index}].dependsOnScenes", f"候选场景包含未知依赖: {dependency}"))
        for module_id in scene.get("moduleDependencies", []):
            if module_id not in module_ids:
                issues.append(DecompositionIssue(f"$.proposedScenes[{index}].moduleDependencies", f"候选场景引用未知模块: {module_id}"))
    issues.extend(_cycle_issues(scene_dependencies, "场景", "$.proposedScenes"))
    issues.extend(_overlap_issues(scene_paths, "场景", "$.proposedScenes"))
    for scene_index, scene_id, scene_path in scene_paths:
        for _, module_id, module_path in module_paths:
            if _paths_overlap(scene_path, module_path):
                issues.append(DecompositionIssue(f"$.proposedScenes[{scene_index}].owns", f"场景路径所有权与模块 {module_id} 重叠: {scene_path} / {module_path}"))

    module_by_id = {item.get("id"): item for item in modules}
    for index, capability in enumerate(capabilities):
        owner = capability.get("ownerModule")
        consumers = capability.get("consumerScenes", [])
        if owner not in module_ids:
            issues.append(DecompositionIssue(f"$.sharedCapabilities[{index}].ownerModule", f"共享能力引用未知模块: {owner}"))
        for scene_id in consumers:
            if scene_id not in scene_ids:
                issues.append(DecompositionIssue(f"$.sharedCapabilities[{index}].consumerScenes", f"共享能力引用未知场景: {scene_id}"))
        if capability.get("decision") == "PROMOTE_SHARED":
            if len(set(consumers)) < 2:
                issues.append(DecompositionIssue(f"$.sharedCapabilities[{index}].consumerScenes", "上移为共享能力前必须有至少两个场景消费者"))
            if module_by_id.get(owner, {}).get("category") not in {"Foundation", "Shared"}:
                issues.append(DecompositionIssue(f"$.sharedCapabilities[{index}].ownerModule", "上移的共享能力必须由 Foundation 或 Shared 模块持有"))

    status = payload.get("status")
    decision = payload.get("decision")
    if status in {"APPROVED", "REJECTED"} and isinstance(decision, Mapping):
        approval = decision.get("userApproval")
        if isinstance(approval, Mapping):
            if approval.get("subjectId") != payload.get("id"):
                issues.append(DecompositionIssue("$.decision.userApproval.subjectId", "批准记录主体 ID 不匹配"))
            if approval.get("subjectVersion") != payload.get("version"):
                issues.append(DecompositionIssue("$.decision.userApproval.subjectVersion", "批准记录主体版本不匹配"))
            if approval.get("authority") != "USER":
                issues.append(DecompositionIssue("$.decision.userApproval.authority", "拆分决定必须由用户确认"))
            if approval.get("approvalType") != "DECOMPOSITION":
                issues.append(DecompositionIssue("$.decision.userApproval.approvalType", "拆分决定必须使用 DECOMPOSITION 批准类型"))
    if status == "APPROVED" and isinstance(decision, Mapping):
        blocked_questions = [item.get("id") for item in interrogation if item.get("conclusion") == "BLOCKED"]
        if blocked_questions:
            issues.append(DecompositionIssue("$.interrogation", f"仍有 BLOCKED 拷问时不得批准拆分: {', '.join(blocked_questions)}"))
        expected_modules = {item.get("id") for item in modules if item.get("decision") == "SPLIT"}
        expected_scenes = {item.get("id") for item in scenes if item.get("decision") == "SPLIT"}
        if set(decision.get("approvedModuleIds", [])) != expected_modules:
            issues.append(DecompositionIssue("$.decision.approvedModuleIds", "必须与决定拆分的候选模块一一对应"))
        if set(decision.get("approvedSceneIds", [])) != expected_scenes:
            issues.append(DecompositionIssue("$.decision.approvedSceneIds", "必须与决定拆分的候选场景一一对应"))
    recovery = payload.get("recoveryExit")
    if status != "APPROVED" and isinstance(recovery, Mapping) and recovery.get("resumeAt") == "CONTINUE_TO_S00":
        issues.append(DecompositionIssue("$.recoveryExit.resumeAt", "未批准拆分不得继续进入 S00"))
    return issues


def _mapping_items(value: object) -> list[Mapping[str, Any]]:
    """从契约数组中提取映射项，结构错误交由 JSON Schema 报告。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _duplicate_id_issues(items: Sequence[Mapping[str, Any]], field: str, label: str) -> list[DecompositionIssue]:
    """检查候选对象 ID 唯一性。"""
    seen: set[str] = set()
    issues: list[DecompositionIssue] = []
    for index, item in enumerate(items):
        item_id = item.get("id")
        if isinstance(item_id, str) and item_id in seen:
            issues.append(DecompositionIssue(f"$.{field}[{index}].id", f"{label} ID 重复: {item_id}"))
        if isinstance(item_id, str):
            seen.add(item_id)
    return issues


def _cycle_issues(dependencies: Mapping[str, tuple[str, ...]], label: str, path: str) -> list[DecompositionIssue]:
    """以拓扑排序识别候选模块或场景依赖环。"""
    known = set(dependencies)
    indegrees = {item_id: 0 for item_id in known}
    dependants: dict[str, list[str]] = {item_id: [] for item_id in known}
    for item_id, items in dependencies.items():
        for dependency in items:
            if dependency in known:
                indegrees[item_id] += 1
                dependants[dependency].append(item_id)
    ready = sorted(item_id for item_id, degree in indegrees.items() if degree == 0)
    visited = 0
    while ready:
        current = ready.pop(0)
        visited += 1
        for dependant in sorted(dependants[current]):
            indegrees[dependant] -= 1
            if indegrees[dependant] == 0:
                ready.append(dependant)
                ready.sort()
    if visited == len(known):
        return []
    cycle_ids = sorted(item_id for item_id, degree in indegrees.items() if degree > 0)
    return [DecompositionIssue(path, f"{label}依赖存在环: {', '.join(cycle_ids)}")]


def _overlap_issues(owners: Sequence[tuple[int, str, str]], label: str, path: str) -> list[DecompositionIssue]:
    """检查同类候选之间的同路径和父子路径所有权冲突。"""
    issues: list[DecompositionIssue] = []
    for left_index, left_id, left_path in owners:
        for right_index, _, right_path in owners:
            if left_index < right_index and _paths_overlap(left_path, right_path):
                issues.append(DecompositionIssue(f"{path}[{right_index}].owns", f"{label}路径所有权与 {left_id} 重叠: {left_path} / {right_path}"))
    return issues


def _paths_overlap(left: str, right: str) -> bool:
    """按路径段判断两个所有权范围是否相同或互为父子目录。"""
    left_parts = tuple(part for part in left.split("/") if part)
    right_parts = tuple(part for part in right.split("/") if part)
    minimum = min(len(left_parts), len(right_parts))
    return left_parts[:minimum] == right_parts[:minimum]
