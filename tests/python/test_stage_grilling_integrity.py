"""验证阶段专属拷问记录、不可变候选快照与规范摘要绑定。"""

from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.stage_grilling_integrity import (
    candidate_digest,
    g0_grilling_profile_failure,
    stage_grilling_failure,
)


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"
STAGES = (
    ("project-profile", "project-profile.yaml", "PRODUCT_GOAL", "starfall-arena", "profile-v1"),
    ("visual-bible", "visual-bible.yaml", "VISUAL_DIRECTION", "starfall-arena", "visual-v1"),
    ("prefab-structure", "prefab-structure.yaml", "PREFAB", "prefab-structure.scene-arena-intro.v1", "prefab-structure-v1"),
    ("visual-review", "visual-review.yaml", "VISUAL_DIRECTION", "imagegen.scene-arena-intro.game-v1", "game-visual-v1"),
    ("split-plan", "split-plan.yaml", "ASSET", "split.scene-arena-intro.game-v1", "game-v1"),
    ("runtime-visual-evidence", "runtime-visual-evidence.yaml", "QUALITY", "scene.arena-intro", "0.1.0-dev.1"),
    ("delivery-manifest", "delivery-manifest.yaml", "RELEASE", "delivery.windows-rc1", "0.1.0-rc.1"),
)


class _Reader:
    """为纯完整性测试提供确定的内存证据回读。"""

    def __init__(self, documents: dict[str, dict[str, Any]]) -> None:
        """保存以证据路径索引的契约。"""
        self.documents = documents

    def verify_reference(self, reference: object) -> None:
        """确认引用存在，真实文件哈希由 Gate 集成测试覆盖。"""
        assert isinstance(reference, dict) and reference["path"] in self.documents

    def _load_referenced_contract(self, reference: dict[str, Any]) -> dict[str, Any]:
        """读取指定内存契约。"""
        return self.documents[reference["path"]]


def _trigger(kind: str, payload: dict[str, Any]) -> None:
    """把模板推进到必须完成阶段拷问的状态。"""
    if kind == "project-profile":
        payload["workflow"]["qualityTargetsStatus"] = "APPROVED"
    else:
        payload["status"] = {
            "visual-bible": "APPROVED", "prefab-structure": "APPROVED",
            "visual-review": "APPROVED", "split-plan": "APPROVED",
            "runtime-visual-evidence": "APPROVED", "delivery-manifest": "RELEASE_APPROVED",
        }[kind]


def _bound_stage(
    kind: str, filename: str, subject_type: str, subject_id: str, subject_version: str
) -> tuple[dict[str, Any], _Reader, dict[str, Any], dict[str, Any]]:
    """创建不含循环哈希的候选、快照和拷问记录。"""
    candidate = yaml.safe_load((TEMPLATES / filename).read_text(encoding="utf-8"))
    _trigger(kind, candidate)
    snapshot = {
        "schemaVersion": "1.0", "projectId": candidate["projectId"],
        "sourceRevision": candidate["sourceRevision"], "projectStateVersion": candidate["projectStateVersion"],
        "subjectType": subject_type, "subjectId": subject_id, "subjectVersion": subject_version,
        "candidateDigest": candidate_digest(kind, candidate),
    }
    snapshot_reference = {
        "type": "grilling-subject-snapshot", "path": "snapshot.yaml", "sha256": "a" * 64,
        "projectId": candidate["projectId"], "subjectId": subject_id, "subjectVersion": subject_version,
        "sourceRevision": candidate["sourceRevision"], "projectStateVersion": candidate["projectStateVersion"],
    }
    record = {
        "projectId": candidate["projectId"], "sourceRevision": candidate["sourceRevision"],
        "projectStateVersion": candidate["projectStateVersion"],
        "subject": {"type": subject_type, "id": subject_id, "version": subject_version,
                    "evidenceType": "grilling-subject-snapshot", "path": "snapshot.yaml", "sha256": "a" * 64},
    }
    grilling_reference = {
        "type": "grilling-record", "path": "grilling.yaml", "sha256": "b" * 64,
        "projectId": candidate["projectId"], "subjectId": "grilling.stage.v1", "subjectVersion": "grilling-v1",
        "sourceRevision": candidate["sourceRevision"], "projectStateVersion": candidate["projectStateVersion"],
    }
    candidate.update({"candidateSnapshot": snapshot_reference, "grillingEvidence": grilling_reference})
    return candidate, _Reader({"snapshot.yaml": snapshot, "grilling.yaml": record}), record, snapshot


@pytest.mark.parametrize(("kind", "filename", "subject_type", "subject_id", "subject_version"), STAGES)
def test_each_authoritative_stage_binds_current_grilling_snapshot(
    kind: str, filename: str, subject_type: str, subject_id: str, subject_version: str
) -> None:
    """七个权威阶段都必须接受与当前候选摘要一致的拷问记录。"""
    candidate, reader, _, _ = _bound_stage(kind, filename, subject_type, subject_id, subject_version)
    assert stage_grilling_failure(reader, kind, candidate) is None


@pytest.mark.parametrize(("kind", "filename", "subject_type", "subject_id", "subject_version"), STAGES)
def test_each_authoritative_stage_schema_rejects_missing_grilling(
    kind: str, filename: str, subject_type: str, subject_id: str, subject_version: str
) -> None:
    """权威状态缺少阶段拷问或候选快照时必须由 Schema 默认拒绝。"""
    del subject_type, subject_id, subject_version
    payload = yaml.safe_load((TEMPLATES / filename).read_text(encoding="utf-8"))
    _trigger(kind, payload)
    payload.pop("grillingEvidence")
    payload.pop("candidateSnapshot")
    paths = {issue.path for issue in validate_contract(kind, payload)}
    assert {"$.grillingEvidence", "$.candidateSnapshot"} <= paths


@pytest.mark.parametrize(("mutation", "message"), (("WRONG_SUBJECT", "当前候选不一致"), ("OLD_VERSION", "当前候选不一致"), ("MISSING_DIGEST", "candidateDigest"), ("TAMPERED_CANDIDATE", "candidateDigest")))
def test_stage_grilling_rejects_wrong_or_stale_candidate(mutation: str, message: str) -> None:
    """错主体、旧版本、漏摘要和同版本内容篡改都不得复用批准。"""
    candidate, reader, record, snapshot = _bound_stage(*STAGES[1])
    if mutation == "WRONG_SUBJECT":
        record["subject"]["id"] = "other-project"
    elif mutation == "OLD_VERSION":
        record["subject"]["version"] = "visual-old"
    elif mutation == "MISSING_DIGEST":
        snapshot.pop("candidateDigest")
    else:
        candidate["artDirection"] = "同版本但内容已被篡改"
    assert message in (stage_grilling_failure(reader, "visual-bible", candidate) or "")


def test_g0_grilling_check_must_match_profile_embedded_record() -> None:
    """G0 不能用任意已批准记录代替 project-profile 当前记录。"""
    direct = {"type": "grilling-record", "path": "direct.yaml", "sha256": "a" * 64}
    other = {"type": "grilling-record", "path": "other.yaml", "sha256": "b" * 64}
    profile_ref = {"type": "project-profile", "path": "profile.yaml", "sha256": "c" * 64}
    reader = _Reader({"direct.yaml": {}, "other.yaml": {}, "profile.yaml": {"grillingEvidence": other}})
    checks = {
        "grilling.approved": {"evidence": [direct]},
        "scope.approved": {"evidence": [profile_ref]},
        "platforms.approved": {"evidence": [profile_ref]},
    }
    assert "必须与 project-profile" in (g0_grilling_profile_failure(reader, checks) or "")


def test_grilling_subject_snapshot_template_matches_schema() -> None:
    """不可变候选快照模板必须满足独立机器契约。"""
    payload = yaml.safe_load((TEMPLATES / "grilling-subject-snapshot.yaml").read_text(encoding="utf-8"))
    assert validate_contract("grilling-subject-snapshot", payload) == []
