"""深验资产地图所引用的视觉审核漏斗与最终候选。"""

from collections.abc import Mapping
from typing import Any, Protocol


class VisualEvidenceReader(Protocol):
    """描述视觉证据完整性校验所需的只读能力。"""

    def verify_reference(self, reference: object) -> None:
        """验证证据路径、哈希和通用身份。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """读取已验证的契约内容。"""


def split_plan_source_failure(
    reader: VisualEvidenceReader,
    payload: Mapping[str, Any],
) -> str | None:
    """返回 P3 源图与 P0、P1、P2 漏斗链之间的首个完整性错误。"""
    structure_reference = payload.get("prefabStructureEvidence")
    generation_reference = payload.get("highFidelityGenerationEvidence")
    review_reference = payload.get("highFidelityReviewEvidence")
    if not all(
        isinstance(reference, Mapping)
        for reference in (structure_reference, generation_reference, review_reference)
    ):
        return "split-plan 缺少 P0 结构、P1 高保真生成或 P2 审阅引用"

    reader.verify_reference(structure_reference)
    structure = reader._load_referenced_contract(structure_reference)
    if structure.get("status") != "APPROVED":
        return "split-plan 只接受 APPROVED P0 Prefab 结构"
    if payload.get("projectId") != structure.get("projectId") or payload.get("sceneId") != structure.get("sceneId"):
        return "split-plan 项目或场景身份与 P0 结构不一致"
    known_node_ids = {
        node.get("id")
        for prefab in structure.get("prefabs", [])
        if isinstance(prefab, Mapping)
        for node in prefab.get("nodes", [])
        if isinstance(node, Mapping)
    }
    for item in payload.get("items", []):
        if not isinstance(item, Mapping):
            continue
        unknown = set(item.get("targetPrefabNodeIds", [])) - known_node_ids
        if unknown:
            return f"P3 条目 {item.get('id')} 引用了 P0 中不存在的 Prefab 节点：{', '.join(sorted(unknown))}"

    reader.verify_reference(generation_reference)
    generation = reader._load_referenced_contract(generation_reference)
    if generation.get("status") != "GENERATED":
        return "split-plan 只接受 P1 GENERATED 高保真候选集"
    candidate = next(
        (
            item
            for item in generation.get("candidates", [])
            if isinstance(item, Mapping) and item.get("id") == generation_reference.get("candidateId")
        ),
        None,
    )
    if candidate is None:
        return "split-plan 引用的 P1 漏斗候选不存在"
    expected = {
        "path": generation_reference.get("candidatePath"),
        "sha256": generation_reference.get("candidateSha256"),
        "visualVersion": generation_reference.get("candidateVisualVersion"),
    }
    if any(candidate.get(field) != value for field, value in expected.items()):
        return "split-plan 的 P1 候选路径、哈希或视觉版本不匹配"

    reader.verify_reference(review_reference)
    review = reader._load_referenced_contract(review_reference)
    if review.get("status") != "APPROVED":
        return "split-plan 只接受 P2 APPROVED 漏斗审阅"
    if review.get("subjectId") != generation.get("id") or review.get("subjectVersion") != candidate.get("visualVersion"):
        return "P2 漏斗审阅未绑定 P1 最终候选"
    selected = review.get("selectedCandidate")
    selected_identity = (
        selected.get("id"),
        selected.get("path"),
        selected.get("sha256"),
        selected.get("visualVersion"),
    ) if isinstance(selected, Mapping) else None
    candidate_identity = (
        candidate.get("id"),
        candidate.get("path"),
        candidate.get("sha256"),
        candidate.get("visualVersion"),
    )
    if selected_identity != candidate_identity:
        return "P3 源图必须是 P2 漏斗和用户共同批准的唯一候选"
    return None
