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
    if payload.get("generationMode") == "RUNTIME_ASSET_ITEM":
        split = payload.get("splitPlanEvidence")
        if isinstance(split, Mapping) and split.get("itemVersion") != payload.get("subjectVersion"):
            issues.append(issue("$.splitPlanEvidence.itemVersion", "单图生成必须绑定当前资产地图条目版本"))
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
    item_generation = payload.get("itemGenerationEvidence")
    if isinstance(item_generation, Mapping) and item_generation.get("subjectVersion") != payload.get("sourceVersion"):
        issues.append(issue("$.itemGenerationEvidence.subjectVersion", "单项生成契约必须绑定当前来源版本"))
    split = payload.get("splitPlanEvidence")
    if isinstance(split, Mapping):
        if split.get("resourceId") != payload.get("resourceId"):
            issues.append(issue("$.splitPlanEvidence.resourceId", "资产地图资源 ID 必须匹配当前图片任务"))
        if split.get("itemVersion") != payload.get("sourceVersion"):
            issues.append(issue("$.splitPlanEvidence.itemVersion", "图片任务必须绑定当前资产地图条目版本"))
    return issues


def split_plan_policy_issues(payload: Mapping[str, Any], issue: IssueFactory) -> list[Any]:
    """确保资产地图绑定 P1/P2 结果、覆盖全部元素并保持框选范围有效。"""
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
    generation = payload.get("highFidelityGenerationEvidence")
    review = payload.get("highFidelityReviewEvidence")
    source = payload.get("sourceImage")
    if isinstance(source, Mapping):
        if isinstance(generation, Mapping):
            for evidence_field, source_field, label in (
                ("candidatePath", "path", "路径"),
                ("candidateSha256", "sha256", "SHA-256"),
                ("candidateVisualVersion", "subjectVersion", "视觉版本"),
            ):
                if generation.get(evidence_field) != source.get(source_field):
                    issues.append(
                        issue(
                            f"$.highFidelityGenerationEvidence.{evidence_field}",
                            f"P1 高保真候选{label}必须与资产地图源图一致",
                        )
                    )
    if isinstance(generation, Mapping) and isinstance(review, Mapping):
        if review.get("subjectId") != generation.get("subjectId"):
            issues.append(issue("$.highFidelityReviewEvidence.subjectId", "P2 审阅必须绑定 P1 高保真生成任务"))
        if review.get("subjectVersion") != generation.get("candidateVisualVersion"):
            issues.append(issue("$.highFidelityReviewEvidence.subjectVersion", "P2 审阅必须绑定 P1 已确认候选版本"))

    annotated = payload.get("annotatedPreview")
    dimensions = payload.get("sourceDimensions")
    if isinstance(annotated, Mapping) and isinstance(source, Mapping):
        for annotated_field, source_field, label in (
            ("sourcePath", "path", "路径"),
            ("sourceSha256", "sha256", "SHA-256"),
            ("sourceVersion", "subjectVersion", "版本"),
        ):
            if annotated.get(annotated_field) != source.get(source_field):
                issues.append(
                    issue(
                        f"$.annotatedPreview.{annotated_field}",
                        f"标注预览的源图{label}必须与高保真源图一致",
                    )
                )
    if isinstance(annotated, Mapping) and isinstance(dimensions, Mapping):
        for field, label in (("width", "宽度"), ("height", "高度")):
            if annotated.get(field) != dimensions.get(field):
                issues.append(issue(f"$.annotatedPreview.{field}", f"标注预览{label}必须与源图尺寸一致"))

    items = _mapping_items(payload.get("items"))
    coverage = payload.get("coverageDeclaration")
    if isinstance(coverage, Mapping) and coverage.get("declaredItemCount") != len(items):
        issues.append(issue("$.coverageDeclaration.declaredItemCount", "资产地图声明数量必须等于实际条目数"))
    if payload.get("status") == "APPROVED" and any(item.get("action") == "BLOCKED" for item in items):
        issues.append(issue("$.items", "P3 用户批准前不得存在 BLOCKED 资产条目"))
    if isinstance(dimensions, Mapping):
        width = dimensions.get("width")
        height = dimensions.get("height")
        if isinstance(width, int) and isinstance(height, int):
            for index, item in enumerate(items):
                bounds = item.get("bounds")
                if not isinstance(bounds, Mapping):
                    continue
                if bounds.get("x", 0) + bounds.get("width", 0) > width or bounds.get("y", 0) + bounds.get("height", 0) > height:
                    issues.append(issue(f"$.items[{index}].bounds", "框选范围不得超出高保真源图"))
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
