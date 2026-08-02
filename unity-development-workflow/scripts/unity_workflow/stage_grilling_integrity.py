"""把阶段专属拷问记录严格绑定到当前权威候选。"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from copy import deepcopy
from typing import Any, Protocol


class StageEvidenceReader(Protocol):
    """描述阶段拷问完整性校验需要的证据能力。"""

    def verify_reference(self, reference: object) -> None:
        """递归验证证据引用。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """读取已经验证的契约或主体快照。"""


STAGE_RULES = {
    "project-profile": ("PRODUCT_GOAL", lambda item: item.get("projectId"), lambda item: item.get("version")),
    "decomposition-plan": ("MODULE_BOUNDARY", lambda item: item.get("id"), lambda item: item.get("version")),
    "visual-bible": ("VISUAL_DIRECTION", lambda item: item.get("projectId"), lambda item: item.get("version")),
    "prefab-structure": ("PREFAB", lambda item: item.get("id"), lambda item: item.get("version")),
    "image-generation": ("VISUAL_DIRECTION", lambda item: item.get("id"), lambda item: item.get("subjectVersion")),
    "split-plan": ("ASSET", lambda item: item.get("id"), lambda item: item.get("sourceVersion")),
    "runtime-visual-evidence": ("QUALITY", lambda item: item.get("sceneId"), lambda item: item.get("buildVersion")),
    "delivery-manifest": ("RELEASE", lambda item: item.get("id"), lambda item: item.get("version")),
}

EXCLUDED_TOP_LEVEL_FIELDS = {
    "project-profile": {"candidateSnapshot", "grillingEvidence"},
    "decomposition-plan": {"candidateSnapshot", "grillingEvidence", "status", "blockedReason"},
    "visual-bible": {"candidateSnapshot", "grillingEvidence", "status", "reviews", "approval"},
    "prefab-structure": {"candidateSnapshot", "grillingEvidence", "status", "userApproval", "blockedReason"},
    "image-generation": {"candidateSnapshot", "grillingEvidence", "status", "userApproval", "failureReason"},
    "split-plan": {"candidateSnapshot", "grillingEvidence", "status", "reviews", "userApproval", "blockedReason"},
    "runtime-visual-evidence": {"candidateSnapshot", "grillingEvidence", "status", "reviews", "userApprovals", "blockedReason"},
    "delivery-manifest": {"candidateSnapshot", "grillingEvidence", "status", "authorization", "blockedReason"},
}


def stage_grilling_failure(
    reader: StageEvidenceReader,
    kind: str,
    payload: Mapping[str, Any],
) -> str | None:
    """递归验真阶段拷问，并比较项目、版本、源码、状态和主体快照身份。"""
    if not _requires_grilling(kind, payload):
        return None
    reference = payload.get("grillingEvidence")
    snapshot_reference = payload.get("candidateSnapshot")
    if not isinstance(reference, Mapping) or not isinstance(snapshot_reference, Mapping):
        return f"{kind} 当前阶段缺少 candidateSnapshot 或 grillingEvidence"
    reader.verify_reference(reference)
    reader.verify_reference(snapshot_reference)
    record = reader._load_referenced_contract(reference)
    subject = record.get("subject")
    if not isinstance(subject, Mapping):
        return f"{kind} 的 grilling-record 缺少 subject"
    expected_type, id_getter, version_getter = STAGE_RULES[kind]
    expected = {
        "projectId": payload.get("projectId"),
        "sourceRevision": payload.get("sourceRevision"),
        "projectStateVersion": payload.get("projectStateVersion"),
        "subjectId": id_getter(payload),
        "subjectVersion": version_getter(payload),
        "subjectType": expected_type,
    }
    actual = {
        "projectId": record.get("projectId"),
        "sourceRevision": record.get("sourceRevision"),
        "projectStateVersion": record.get("projectStateVersion"),
        "subjectId": subject.get("id"),
        "subjectVersion": subject.get("version"),
        "subjectType": subject.get("type"),
    }
    mismatch = _mismatch_fields(expected, actual)
    if mismatch:
        return f"{kind} 的 grilling-record 与当前候选不一致：{', '.join(mismatch)}"
    snapshot_expected = {
        "projectId": expected["projectId"],
        "sourceRevision": expected["sourceRevision"],
        "projectStateVersion": expected["projectStateVersion"],
        "subjectId": expected["subjectId"],
        "subjectVersion": expected["subjectVersion"],
    }
    mismatch = _mismatch_fields(snapshot_expected, snapshot_reference)
    subject_binding = (subject.get("evidenceType"), subject.get("path"), subject.get("sha256"))
    snapshot_binding = (snapshot_reference.get("type"), snapshot_reference.get("path"), snapshot_reference.get("sha256"))
    if mismatch or subject_binding != snapshot_binding:
        return f"{kind} 的 grilling-record 未绑定当前 candidateSnapshot：{', '.join(mismatch) or 'path/type/sha256'}"
    snapshot = reader._load_referenced_contract(snapshot_reference)
    snapshot_actual = {field: snapshot.get(field) for field in expected}
    mismatch = _mismatch_fields(expected, snapshot_actual)
    if mismatch:
        return f"{kind} 的拷问主体快照与当前候选不一致：{', '.join(mismatch)}"
    if snapshot.get("candidateDigest") != candidate_digest(kind, payload):
        return f"{kind} 的 candidateDigest 与当前候选内容不一致"
    return None


def candidate_digest(kind: str, payload: Mapping[str, Any]) -> str:
    """按阶段明确排除审批控制字段后计算规范 JSON SHA-256。"""
    excluded = EXCLUDED_TOP_LEVEL_FIELDS.get(kind)
    if excluded is None:
        raise ValueError(f"不支持候选摘要类型: {kind}")
    candidate = deepcopy(dict(payload))
    for field in excluded:
        candidate.pop(field, None)
    if kind == "project-profile":
        workflow = candidate.get("workflow")
        if isinstance(workflow, dict):
            workflow.pop("qualityTargetsStatus", None)
            decomposition = workflow.get("decomposition")
            if isinstance(decomposition, dict):
                decomposition.pop("status", None)
    elif kind == "decomposition-plan":
        # 冻结决定理由与恢复方案，仅排除候选快照之后才产生的裁决和流程状态。
        decision = candidate.get("decision")
        if isinstance(decision, dict):
            for field in ("outcome", "approvedModuleIds", "approvedSceneIds", "userApproval"):
                decision.pop(field, None)
        recovery = candidate.get("recoveryExit")
        if isinstance(recovery, dict):
            recovery.pop("resumeAt", None)
    canonical = json.dumps(candidate, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def g0_grilling_profile_failure(
    reader: StageEvidenceReader,
    checks: Mapping[object, object],
) -> str | None:
    """要求 G0 独立拷问检查与同门 project-profile 使用完全相同的记录。"""
    grilling_references = _typed_references(checks.get("grilling.approved"), "grilling-record")
    profile_references = [
        reference
        for check_id in ("scope.approved", "platforms.approved")
        for reference in _typed_references(checks.get(check_id), "project-profile")
    ]
    if len(grilling_references) != 1 or not profile_references:
        return "G0 必须包含唯一 grilling-record 和 project-profile 契约"
    for reference in (*grilling_references, *profile_references):
        reader.verify_reference(reference)
    profiles = [reader._load_referenced_contract(reference) for reference in profile_references]
    profile_keys = {_reference_key(reference) for reference in profile_references}
    if len(profile_keys) != 1:
        return "G0 的 project-profile 检查必须引用同一候选"
    direct_key = _reference_key(grilling_references[0])
    if any(_reference_key(profile.get("grillingEvidence")) != direct_key for profile in profiles):
        return "G0 grilling.approved 必须与 project-profile 的 grillingEvidence 完全一致"
    return None


def _requires_grilling(kind: str, payload: Mapping[str, Any]) -> bool:
    """判断权威契约是否已经到达必须完成阶段拷问的状态。"""
    if kind == "project-profile":
        workflow = payload.get("workflow")
        return isinstance(workflow, Mapping) and workflow.get("qualityTargetsStatus") == "APPROVED"
    required_status = {
        "decomposition-plan": "APPROVED",
        "visual-bible": "APPROVED",
        "prefab-structure": "APPROVED",
        "image-generation": "USER_CONFIRMED",
        "split-plan": "APPROVED",
        "runtime-visual-evidence": "APPROVED",
        "delivery-manifest": "RELEASE_APPROVED",
    }
    return kind in required_status and payload.get("status") == required_status[kind]


def _typed_references(check: object, kind: str) -> list[Mapping[str, Any]]:
    """提取检查中的指定契约引用。"""
    if not isinstance(check, Mapping):
        return []
    evidence = check.get("evidence")
    if not isinstance(evidence, Sequence) or isinstance(evidence, (str, bytes)):
        return []
    return [item for item in evidence if isinstance(item, Mapping) and item.get("type") == kind]


def _reference_key(reference: object) -> tuple[object, ...]:
    """构造跨检查比较所需的完整记录引用身份。"""
    if not isinstance(reference, Mapping):
        return ()
    fields = ("type", "path", "sha256", "projectId", "subjectId", "subjectVersion", "sourceRevision", "projectStateVersion")
    return tuple(reference.get(field) for field in fields)


def _mismatch_fields(expected: Mapping[str, object], actual: Mapping[str, object]) -> list[str]:
    """稳定列出身份不一致字段。"""
    return [field for field in expected if expected[field] != actual.get(field)]
