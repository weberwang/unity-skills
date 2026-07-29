"""验证拆分批准前候选快照、拷问主体和最终裁决的机器绑定。"""

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.stage_grilling_integrity import candidate_digest, stage_grilling_failure


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATE = ROOT / "templates" / "decomposition-plan.yaml"


class _Reader:
    """提供拆分快照完整性测试所需的确定内存证据。"""

    def __init__(self, documents: dict[str, dict[str, Any]]) -> None:
        """保存以项目相对路径索引的测试契约。"""
        self.documents = documents

    def verify_reference(self, reference: object) -> None:
        """确认测试引用可回读；真实哈希由 Gate 集成测试负责。"""
        assert isinstance(reference, dict) and reference["path"] in self.documents

    def _load_referenced_contract(self, reference: dict[str, Any]) -> dict[str, Any]:
        """返回指定路径对应的测试契约。"""
        return self.documents[reference["path"]]


def _load_candidate() -> dict[str, Any]:
    """加载尚未取得最终拆分批准的候选模板。"""
    return yaml.safe_load(TEMPLATE.read_text(encoding="utf-8"))


def _approve(candidate: dict[str, Any]) -> None:
    """只推进审批控制字段，保持批准前候选内容不变。"""
    candidate["status"] = "APPROVED"
    candidate["decision"].update(
        {
            "outcome": "APPROVE_SPLIT",
            "approvedModuleIds": ["Foundation.Core", "Gameplay.Player"],
            "approvedSceneIds": ["scene.arena-intro", "scene.arena-battle"],
            "userApproval": {
                "approvalType": "DECOMPOSITION",
                "authority": "USER",
                "subjectId": candidate["id"],
                "subjectVersion": candidate["version"],
                "approvedBy": "scope-owner",
                "approvedAtUtc": "2026-07-27T12:00:00Z",
                "evidencePath": "Artifacts/Approvals/decomposition.txt",
                "evidenceSha256": "c" * 64,
            },
        }
    )
    candidate["recoveryExit"]["resumeAt"] = "CONTINUE_TO_S00"


def _bound_candidate() -> tuple[dict[str, Any], _Reader, dict[str, Any], dict[str, Any]]:
    """创建完整候选摘要、MODULE_BOUNDARY 主体和两份引用。"""
    candidate = _load_candidate()
    digest_before_approval = candidate_digest("decomposition-plan", candidate)
    _approve(candidate)
    snapshot = {
        "schemaVersion": "1.0",
        "projectId": candidate["projectId"],
        "sourceRevision": candidate["sourceRevision"],
        "projectStateVersion": candidate["projectStateVersion"],
        "subjectType": "MODULE_BOUNDARY",
        "subjectId": candidate["id"],
        "subjectVersion": candidate["version"],
        "candidateDigest": digest_before_approval,
    }
    snapshot_reference = deepcopy(candidate["candidateSnapshot"])
    snapshot_reference.update({"path": "decomposition-subject.yaml", "sha256": "a" * 64})
    record = {
        "projectId": candidate["projectId"],
        "sourceRevision": candidate["sourceRevision"],
        "projectStateVersion": candidate["projectStateVersion"],
        "subject": {
            "type": "MODULE_BOUNDARY",
            "id": candidate["id"],
            "version": candidate["version"],
            "evidenceType": "grilling-subject-snapshot",
            "path": snapshot_reference["path"],
            "sha256": snapshot_reference["sha256"],
        },
    }
    grilling_reference = deepcopy(candidate["grillingEvidence"])
    grilling_reference.update({"path": "decomposition-grilling.yaml", "sha256": "b" * 64})
    candidate.update({"candidateSnapshot": snapshot_reference, "grillingEvidence": grilling_reference})
    reader = _Reader({snapshot_reference["path"]: snapshot, grilling_reference["path"]: record})
    return candidate, reader, record, snapshot


def test_decomposition_template_declares_current_candidate_snapshot() -> None:
    """拆分模板必须声明绑定当前 ID、版本和项目状态的候选快照。"""
    payload = _load_candidate()

    assert validate_contract("decomposition-plan", payload) == []
    assert payload["candidateSnapshot"]["subjectId"] == payload["id"]
    assert payload["candidateSnapshot"]["subjectVersion"] == payload["version"]


def test_decomposition_approval_binds_preapproval_snapshot() -> None:
    """最终裁决只改变控制字段，批准前冻结的完整候选摘要仍应有效。"""
    candidate, reader, _, snapshot = _bound_candidate()

    assert snapshot["candidateDigest"] == candidate_digest("decomposition-plan", candidate)
    assert stage_grilling_failure(reader, "decomposition-plan", candidate) is None


def test_decomposition_snapshot_requires_module_boundary_and_current_identity() -> None:
    """拷问主体类型、拆分 ID 和版本任一错误都不能消费批准。"""
    candidate, reader, record, _ = _bound_candidate()
    record["subject"]["type"] = "PRODUCT_GOAL"

    assert "当前候选不一致" in (stage_grilling_failure(reader, "decomposition-plan", candidate) or "")

    record["subject"].update({"type": "MODULE_BOUNDARY", "id": "decomposition.other.v1"})
    assert "当前候选不一致" in (stage_grilling_failure(reader, "decomposition-plan", candidate) or "")

    record["subject"].update({"id": candidate["id"], "version": "decomposition-old"})
    assert "当前候选不一致" in (stage_grilling_failure(reader, "decomposition-plan", candidate) or "")


def test_decomposition_same_version_tampering_invalidates_grilling() -> None:
    """不递增版本却修改任一拷问答案时，旧快照摘要必须立即失效。"""
    candidate, reader, _, _ = _bound_candidate()
    candidate["interrogation"][0]["answer"] = "同版本偷偷替换核心循环边界。"

    assert "candidateDigest" in (stage_grilling_failure(reader, "decomposition-plan", candidate) or "")


def test_decomposition_approval_rejects_blocked_interrogation() -> None:
    """13 项拷问属于候选事实，仍有阻断结论时最终拆分裁决不得批准。"""
    candidate = _load_candidate()
    _approve(candidate)
    candidate["interrogation"][0]["conclusion"] = "BLOCKED"

    issues = validate_contract("decomposition-plan", candidate)

    assert any(issue.path == "$.interrogation" and "不得批准" in issue.message for issue in issues)


def test_decomposition_schema_requires_snapshot_at_approval() -> None:
    """批准状态删除 candidateSnapshot 时必须在静态契约层失败。"""
    candidate = _load_candidate()
    _approve(candidate)
    candidate.pop("candidateSnapshot")

    assert any(issue.path == "$.candidateSnapshot" for issue in validate_contract("decomposition-plan", candidate))
