"""补充全局视觉、出图和资源拆分契约的跨字段语义校验。"""

from collections.abc import Mapping, Sequence
from typing import Any, Protocol


class IssueFactory(Protocol):
    """描述由主契约模块提供的校验问题构造器。"""

    def __call__(self, path: str, message: str) -> Any:
        """创建一个带稳定路径和中文消息的校验问题。"""
        ...


def visual_bible_policy_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """绑定已批准全局视觉的方向证据与最终审查，防止批准错版本。"""
    if payload.get("status") != "APPROVED":
        return []
    project_id = payload.get("projectId")
    version = payload.get("version")
    issues: list[Any] = []
    candidates = _mapping_items(payload.get("directionCandidates"))
    selected = payload.get("selectedDirection")
    if isinstance(selected, Mapping):
        candidate_identities = {(item.get("path"), item.get("sha256")) for item in candidates}
        if (selected.get("path"), selected.get("sha256")) not in candidate_identities:
            issues.append(issue("$.selectedDirection", "选定方向必须来自当前方向候选"))
        issues.extend(_evidence_binding_issues(selected, project_id, version, "$.selectedDirection", issue))
    review = payload.get("finalVisualReview")
    if isinstance(review, Mapping):
        issues.extend(_evidence_binding_issues(review, project_id, version, "$.finalVisualReview", issue))
    return issues


def image_generation_policy_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """约束截图用途和 Visual Bible 绑定，并阻止直接复用截图像素。"""
    issues: list[Any] = []
    if payload.get("generationMode") != "GLOBAL_DIRECTION":
        evidence = payload.get("visualBibleEvidence")
        if isinstance(evidence, Mapping):
            issues.extend(
                _evidence_binding_issues(
                    evidence,
                    payload.get("projectId"),
                    payload.get("visualBibleVersion"),
                    "$.visualBibleEvidence",
                    issue,
                )
            )
    if payload.get("status") != "GENERATED":
        return issues
    screenshot_hashes = {
        item.get("sha256")
        for item in _mapping_items(payload.get("references"))
        if item.get("referenceType") == "SCREENSHOT"
    }
    for index, candidate in enumerate(_mapping_items(payload.get("candidates"))):
        if candidate.get("sha256") in screenshot_hashes:
            issues.append(issue(f"$.candidates[{index}].sha256", "生成候选不得直接复用截图像素"))
    return issues


def image_task_policy_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """确保逐项资源声明全部参考，并把最终候选绑定到拆分方案条目。"""
    references = payload.get("references")
    reference_paths = [item for item in references or [] if isinstance(item, str)]
    declarations = _mapping_items(payload.get("referenceDeclarations"))
    declared_paths = [item.get("path") for item in declarations]
    issues: list[Any] = []
    if len(declared_paths) != len(set(declared_paths)):
        issues.append(issue("$.referenceDeclarations", "参考声明路径必须唯一"))
    if set(reference_paths) != set(declared_paths):
        issues.append(issue("$.referenceDeclarations", "每个参考路径必须且只能有一份用途声明"))
    bible = payload.get("visualBibleEvidence")
    if isinstance(bible, Mapping) and bible.get("subjectVersion") != payload.get("visualBibleVersion"):
        issues.append(issue("$.visualBibleEvidence.subjectVersion", "全局视觉证据必须绑定当前 Visual Bible 版本"))
    regeneration = payload.get("regenerationEvidence")
    if isinstance(regeneration, Mapping) and regeneration.get("subjectVersion") != payload.get("sourceVersion"):
        issues.append(issue("$.regenerationEvidence.subjectVersion", "重新生成契约必须绑定当前来源版本"))
    split = payload.get("splitPlanEvidence")
    selected = payload.get("selectedCandidate")
    if isinstance(split, Mapping):
        if split.get("subjectVersion") != payload.get("sourceVersion"):
            issues.append(issue("$.splitPlanEvidence.subjectVersion", "拆分方案必须绑定当前来源版本"))
        if split.get("itemId") != payload.get("resourceId"):
            issues.append(issue("$.splitPlanEvidence.itemId", "拆分条目必须绑定当前资源 ID"))
        if isinstance(selected, Mapping):
            for evidence_field, candidate_field, label in (
                ("itemPath", "path", "路径"),
                ("itemSha256", "sha256", "SHA-256"),
                ("itemVisualVersion", "visualVersion", "视觉版本"),
            ):
                if split.get(evidence_field) != selected.get(candidate_field):
                    issues.append(
                        issue(
                            f"$.splitPlanEvidence.{evidence_field}",
                            f"拆分条目{label}必须与最终候选一致",
                        )
                    )
    return issues


def split_plan_policy_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """确保拆分基于批准基线的重新生成源图，并避免问题清单出现重复身份。"""
    issues: list[Any] = []
    questions = _mapping_items(payload.get("splitQuestions"))
    question_ids = [item.get("id") for item in questions]
    if len(question_ids) != len(set(question_ids)):
        issues.append(issue("$.splitQuestions", "拆分前问题 ID 必须唯一"))
    bible = payload.get("visualBibleEvidence")
    if isinstance(bible, Mapping):
        issues.extend(
            _evidence_binding_issues(
                bible,
                payload.get("projectId"),
                payload.get("visualBibleVersion"),
                "$.visualBibleEvidence",
                issue,
            )
        )
    regeneration = payload.get("regenerationEvidence")
    if isinstance(regeneration, Mapping) and regeneration.get("subjectVersion") != payload.get("sourceVersion"):
        issues.append(issue("$.regenerationEvidence.subjectVersion", "重新生成契约必须绑定当前拆分来源版本"))
    source = payload.get("sourceImage")
    if isinstance(source, Mapping):
        if source.get("type") != "regenerated-asset-source":
            issues.append(issue("$.sourceImage.type", "拆分源图必须是依据批准全局视觉重新生成的生产源图"))
        issues.extend(
            _evidence_binding_issues(
                source,
                payload.get("sceneId"),
                payload.get("sourceVersion"),
                "$.sourceImage",
                issue,
            )
        )
        if isinstance(regeneration, Mapping):
            for evidence_field, source_field, label in (
                ("candidatePath", "path", "路径"),
                ("candidateSha256", "sha256", "SHA-256"),
                ("candidateVisualVersion", "subjectVersion", "视觉版本"),
            ):
                if regeneration.get(evidence_field) != source.get(source_field):
                    issues.append(
                        issue(
                            f"$.regenerationEvidence.{evidence_field}",
                            f"重新生成候选{label}必须与拆分源图一致",
                        )
                    )
    return issues


def _mapping_items(value: object) -> list[Mapping[str, Any]]:
    """把未知集合安全收敛为映射列表，避免字符串被当作序列处理。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _evidence_binding_issues(
    evidence: Mapping[str, Any],
    expected_id: object,
    expected_version: object,
    path: str,
    issue: IssueFactory,
) -> list[Any]:
    """校验证据主体和版本，阻止跨项目、跨场景或跨基线复用。"""
    issues: list[Any] = []
    if evidence.get("subjectId") != expected_id:
        issues.append(issue(f"{path}.subjectId", "证据主体必须绑定当前对象"))
    if evidence.get("subjectVersion") != expected_version:
        issues.append(issue(f"{path}.subjectVersion", "证据版本必须绑定当前对象版本"))
    return issues
