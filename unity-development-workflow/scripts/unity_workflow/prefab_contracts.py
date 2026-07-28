"""校验低保真 Prefab 结构与最终 Prefab/Scene 拼装契约。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol


class IssueFactory(Protocol):
    """描述主契约模块提供的校验问题构造器。"""

    def __call__(self, path: str, message: str) -> Any:
        """创建带稳定路径和中文消息的校验问题。"""
        ...


def prefab_structure_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """校验低保真结构的节点关系、实例引用和 P0 用户批准绑定。"""
    issues: list[Any] = []
    visual_bible = payload.get("visualBibleEvidence")
    if isinstance(visual_bible, Mapping):
        issues.extend(
            _subject_issues(
                visual_bible,
                payload.get("projectId"),
                payload.get("visualBibleVersion"),
                "$.visualBibleEvidence",
                issue,
            )
        )
    prefabs = _mapping_items(payload.get("prefabs"))
    prefab_ids = [item.get("id") for item in prefabs]
    if len(prefab_ids) != len(set(prefab_ids)):
        issues.append(issue("$.prefabs", "Prefab ID 必须唯一"))
    for prefab_index, prefab in enumerate(prefabs):
        issues.extend(_node_graph_issues(prefab.get("nodes"), f"$.prefabs[{prefab_index}].nodes", issue))

    known_prefabs = set(prefab_ids)
    instances = _mapping_items(payload.get("sceneInstances"))
    instance_ids = [item.get("id") for item in instances]
    if len(instance_ids) != len(set(instance_ids)):
        issues.append(issue("$.sceneInstances", "场景实例 ID 必须唯一"))
    for index, instance in enumerate(instances):
        if instance.get("prefabId") not in known_prefabs:
            issues.append(issue(f"$.sceneInstances[{index}].prefabId", "场景实例必须引用当前结构中的 Prefab"))

    preview = payload.get("lowFidelityPreview")
    if isinstance(preview, Mapping):
        issues.extend(
            _subject_issues(preview, payload.get("id"), payload.get("version"), "$.lowFidelityPreview", issue)
        )
    if payload.get("status") == "APPROVED":
        approval = payload.get("userApproval")
        if isinstance(approval, Mapping):
            issues.extend(_subject_issues(approval, payload.get("id"), payload.get("version"), "$.userApproval", issue))
    return issues


def prefab_assembly_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """校验最终拼装层级、资源绑定和场景实例的集合完整性。"""
    issues: list[Any] = []
    prefabs = _mapping_items(payload.get("prefabs"))
    prefab_ids = [item.get("id") for item in prefabs]
    if len(prefab_ids) != len(set(prefab_ids)):
        issues.append(issue("$.prefabs", "拼装 Prefab ID 必须唯一"))

    node_resources: list[object] = []
    for prefab_index, prefab in enumerate(prefabs):
        nodes = _mapping_items(prefab.get("nodes"))
        issues.extend(_node_graph_issues(nodes, f"$.prefabs[{prefab_index}].nodes", issue))
        node_resources.extend(item.get("resourceId") for item in nodes if item.get("resourceId") is not None)

    bindings = _mapping_items(payload.get("assetBindings"))
    item_ids = [item.get("itemId") for item in bindings]
    resource_ids = [item.get("resourceId") for item in bindings]
    if len(item_ids) != len(set(item_ids)):
        issues.append(issue("$.assetBindings", "每个资产地图条目只能绑定一次"))
    if len(resource_ids) != len(set(resource_ids)):
        issues.append(issue("$.assetBindings", "每个运行时资源只能有一个当前绑定"))
    if set(node_resources) != set(resource_ids):
        issues.append(issue("$.assetBindings", "资源绑定必须与 Prefab 视觉节点一一对应"))

    scene = payload.get("scene")
    instances = _mapping_items(scene.get("prefabInstances")) if isinstance(scene, Mapping) else []
    instance_ids = [item.get("id") for item in instances]
    if len(instance_ids) != len(set(instance_ids)):
        issues.append(issue("$.scene.prefabInstances", "场景 Prefab 实例 ID 必须唯一"))
    known_prefabs = set(prefab_ids)
    for index, instance in enumerate(instances):
        if instance.get("prefabId") not in known_prefabs:
            issues.append(issue(f"$.scene.prefabInstances[{index}].prefabId", "场景只能实例化当前拼装中的 Prefab"))
    cleanup = payload.get("lowFidelityCleanup")
    if isinstance(cleanup, Mapping):
        removed_items = _mapping_items(cleanup.get("removedItems"))
        removed_ids = [item.get("id") for item in removed_items]
        if len(removed_ids) != len(set(removed_ids)):
            issues.append(issue("$.lowFidelityCleanup.removedItems", "低保真清理记录 ID 必须唯一"))
        for index, evidence in enumerate(_mapping_items(cleanup.get("evidence"))):
            issues.extend(
                _subject_issues(
                    evidence,
                    payload.get("id"),
                    payload.get("version"),
                    f"$.lowFidelityCleanup.evidence[{index}]",
                    issue,
                )
            )
    return issues


def _node_graph_issues(nodes_value: object, path: str, issue: IssueFactory) -> list[Any]:
    """校验节点 ID、父节点存在性并检测父子环。"""
    nodes = _mapping_items(nodes_value)
    ids = [item.get("id") for item in nodes]
    issues: list[Any] = []
    if len(ids) != len(set(ids)):
        issues.append(issue(path, "节点 ID 必须唯一"))
    known = set(ids)
    parents = {item.get("id"): item.get("parentId") for item in nodes if item.get("id") is not None}
    for index, node in enumerate(nodes):
        parent = node.get("parentId")
        if parent is not None and parent not in known:
            issues.append(issue(f"{path}[{index}].parentId", "父节点必须存在于同一 Prefab"))
    for node_id in parents:
        visited: set[object] = set()
        current: object = node_id
        while current in parents and parents[current] is not None:
            if current in visited:
                issues.append(issue(path, "Prefab 节点层级不得形成循环"))
                break
            visited.add(current)
            current = parents[current]
    return issues


def _subject_issues(
    value: Mapping[str, Any], expected_id: object, expected_version: object, path: str, issue: IssueFactory
) -> list[Any]:
    """校验证据或批准绑定到当前契约主体及版本。"""
    issues: list[Any] = []
    if value.get("subjectId") != expected_id:
        issues.append(issue(f"{path}.subjectId", "主体必须绑定当前契约"))
    if value.get("subjectVersion") != expected_version:
        issues.append(issue(f"{path}.subjectVersion", "版本必须绑定当前契约版本"))
    return issues


def _mapping_items(value: object) -> list[Mapping[str, Any]]:
    """把未知集合安全转换为映射列表。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]
