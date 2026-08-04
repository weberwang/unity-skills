"""验证多级漏斗审核的收敛、顺序和最终候选绑定。"""

from copy import deepcopy
from pathlib import Path
import sys


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
sys.path.insert(0, str(ROOT / "scripts"))

from unity_workflow.contracts import load_yaml, validate_contract  # noqa: E402


TEMPLATE = ROOT / "templates" / "visual-review.yaml"
DISCIPLINES = ("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY")


def _approval(authority: str, reviewer: str, discipline: str | None = None) -> dict[str, str]:
    """创建绑定当前漏斗唯一候选的审查或用户批准记录。"""
    approval = {
        "approvalType": "GAME_VISUAL",
        "authority": authority,
        "subjectId": "imagegen.scene-arena-intro.game-v1",
        "subjectVersion": "game-visual-v1",
        "approvedBy": reviewer,
        "approvedAtUtc": "2026-08-04T08:00:00Z",
        "evidencePath": f"Artifacts/Approvals/{reviewer}.yaml",
        "evidenceSha256": "a" * 64,
    }
    if authority == "INDEPENDENT_REVIEWER":
        approval.update(
            {
                "reviewTaskId": f"review.{reviewer}",
                "reviewDiscipline": discipline or "QA",
            }
        )
    return approval


def _approved_funnel() -> dict[str, object]:
    """把工作模板推进为四级全部通过的最小有效漏斗。"""
    payload = load_yaml(TEMPLATE)
    candidate = payload["candidateEvidence"][0]
    candidate_id = candidate["candidateId"]
    stage_evidence = {
        "type": "review-stage",
        "path": "Artifacts/Reviews/stage.yaml",
        "sha256": "b" * 64,
    }
    for stage in payload["funnel"]["stages"]:
        stage.update(
            {
                "status": "PASS",
                "inputCandidateIds": [candidate_id],
                "outputCandidateIds": [candidate_id],
                "decisionSummary": "本级检查通过并保留唯一候选",
                "evidence": [stage_evidence],
            }
        )
    payload["selectedCandidate"] = {
        "id": candidate_id,
        "path": candidate["path"],
        "sha256": candidate["sha256"],
        "visualVersion": candidate["subjectVersion"],
    }
    payload["reviews"] = [
        _approval("INDEPENDENT_REVIEWER", f"specialist-{index}", discipline)
        for index, discipline in enumerate(DISCIPLINES, start=1)
    ]
    payload["userDecision"] = "APPROVED"
    payload["userApproval"] = _approval("USER", "visual-owner")
    payload["status"] = "APPROVED"
    return payload


def test_approved_review_funnel_is_valid() -> None:
    """四级连续收敛、专业审查和用户批准齐全时应通过。"""
    assert validate_contract("visual-review", _approved_funnel()) == []


def test_review_funnel_rejects_reordered_stages() -> None:
    """审核级别不能跳级或改变顺序。"""
    payload = _approved_funnel()
    stages = payload["funnel"]["stages"]
    stages[1], stages[2] = stages[2], stages[1]

    issues = validate_contract("visual-review", payload)

    assert any(issue.path == "$.funnel.stages" and "F0→F1→F2→F3" in issue.message for issue in issues)


def test_review_funnel_rejects_candidate_expansion() -> None:
    """下游级不得新增上一级未输出的候选。"""
    payload = _approved_funnel()
    payload["funnel"]["stages"][1]["outputCandidateIds"].append("candidate.injected")

    paths = {issue.path for issue in validate_contract("visual-review", payload)}

    assert "$.funnel.stages[1].outputCandidateIds" in paths
    assert "$.funnel.stages[2].inputCandidateIds" in paths


def test_review_funnel_rejects_skipped_upstream_stage() -> None:
    """上游仍待处理时，下游不能提前写入通过状态。"""
    payload = load_yaml(TEMPLATE)
    candidate_id = payload["candidateEvidence"][0]["candidateId"]
    payload["funnel"]["stages"][0]["outputCandidateIds"] = [candidate_id]
    payload["funnel"]["stages"][1].update(
        {
            "status": "PASS",
            "inputCandidateIds": [candidate_id],
            "outputCandidateIds": [candidate_id],
            "evidence": [
                {
                    "type": "review-stage",
                    "path": "Artifacts/Reviews/owner-screen.yaml",
                    "sha256": "d" * 64,
                }
            ],
        }
    )

    issues = validate_contract("visual-review", payload)

    assert any(issue.path == "$.funnel.stages[1].status" and "上游级" in issue.message for issue in issues)


def test_review_funnel_requires_single_specialist_finalist() -> None:
    """F2 通过时必须收敛为一个候选，不能把选择成本转给用户。"""
    payload = _approved_funnel()
    original = payload["candidateEvidence"][0]
    second = deepcopy(original)
    second.update(
        {
            "candidateId": "candidate.scene-arena-intro.game-2",
            "path": "Artifacts/Visual/Reviews/scene.arena-intro/game-v2.png",
            "sha256": "c" * 64,
        }
    )
    payload["candidateEvidence"].append(second)
    second_id = second["candidateId"]
    payload["funnel"]["stages"][0]["inputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][0]["outputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][1]["inputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][1]["outputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][2]["inputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][2]["outputCandidateIds"].append(second_id)
    payload["funnel"]["stages"][3]["inputCandidateIds"].append(second_id)

    issues = validate_contract("visual-review", payload)

    assert any(
        issue.path == "$.funnel.stages[2].outputCandidateIds" and "唯一候选" in issue.message
        for issue in issues
    )


def test_review_funnel_rejects_final_candidate_swap() -> None:
    """F3 不能把 F2 未推荐的对象写成最终批准候选。"""
    payload = _approved_funnel()
    payload["selectedCandidate"]["id"] = "candidate.swapped"

    issues = validate_contract("visual-review", payload)

    assert any(issue.path == "$.selectedCandidate.id" for issue in issues)
    assert any(issue.path == "$.selectedCandidate" for issue in issues)


def test_review_funnel_stops_downstream_after_failure() -> None:
    """任一级未通过后，下游级必须保持待处理。"""
    payload = _approved_funnel()
    payload.update(
        {
            "status": "CHANGES_REQUIRED",
            "userDecision": "CHANGES_REQUESTED",
            "returnGate": "P1",
            "consolidatedChanges": ["重新生成不满足硬约束的候选"],
        }
    )
    payload["funnel"]["stages"][0]["status"] = "CHANGES_REQUIRED"

    issues = validate_contract("visual-review", payload)

    assert any(issue.path == "$.funnel.stages[1].status" and "PENDING" in issue.message for issue in issues)
