"""工作流状态机的行为测试。"""

import json
from pathlib import Path

import pytest

from unity_workflow.cli import main
from unity_workflow.state import WorkflowState


def advance_to_running(state: WorkflowState, task_id: str = "task") -> None:
    """把测试任务沿主路径推进到运行态。"""
    state.transition(task_id, "READY", actor_role="orchestrator")
    state.transition(task_id, "ASSIGNED", actor_role="orchestrator")
    state.transition(task_id, "RUNNING", actor_role="worker")


def test_main_path_enforces_evidence_and_roles(tmp_path: Path) -> None:
    """主路径要求评审证据、评审角色与编排者收尾。"""
    state = WorkflowState.load(tmp_path / "state.json")
    advance_to_running(state)
    state.transition("task", "SELF_VERIFIED", actor_role="worker")
    with pytest.raises(ValueError, match="证据"):
        state.transition("task", "REVIEWING", actor_role="worker")
    state.transition("task", "REVIEWING", actor_role="worker", evidence=["Artifacts/self.json"])
    with pytest.raises(ValueError, match="reviewer"):
        state.transition("task", "APPROVED", actor_role="worker", evidence=["Artifacts/review.json"])
    with pytest.raises(ValueError, match="证据"):
        state.transition("task", "APPROVED", actor_role="reviewer")
    state.transition("task", "APPROVED", actor_role="reviewer", evidence=["Artifacts/review.json"])
    state.transition("task", "INTEGRATED", actor_role="orchestrator")
    state.transition("task", "VERIFIED", actor_role="orchestrator")
    with pytest.raises(ValueError, match="orchestrator"):
        state.transition("task", "DONE", actor_role="worker")
    result = state.transition("task", "DONE", actor_role="orchestrator")
    assert result.status == "DONE"
    assert result.evidence == ("Artifacts/self.json", "Artifacts/review.json")


def test_illegal_jump_and_direct_done_are_rejected(tmp_path: Path) -> None:
    """非法跳转以及自验后直接完成必须被拒绝。"""
    state = WorkflowState.load(tmp_path / "state.json")
    with pytest.raises(ValueError, match="BLOCKED"):
        state.transition("task", "RUNNING", actor_role="worker")
    advance_to_running(state)
    state.transition("task", "SELF_VERIFIED", actor_role="worker")
    with pytest.raises(ValueError, match="SELF_VERIFIED"):
        state.transition("task", "DONE", actor_role="orchestrator")


def test_reject_and_nonterminal_exception_paths(tmp_path: Path) -> None:
    """评审拒绝与非终态冲突、取消路径应按规则开放。"""
    state = WorkflowState.load(tmp_path / "state.json")
    advance_to_running(state, "reject")
    state.transition("reject", "SELF_VERIFIED", actor_role="worker")
    assert state.transition("reject", "REJECTED", actor_role="reviewer").status == "REJECTED"
    assert state.transition("cancel", "CANCELLED", actor_role="orchestrator").status == "CANCELLED"
    state.transition("conflict", "READY", actor_role="orchestrator")
    assert state.transition("conflict", "CONFLICTED", actor_role="orchestrator").status == "CONFLICTED"


def test_retry_limit_records_third_failure_and_rejects_third_reassignment(tmp_path: Path) -> None:
    """重试计数仅记录实际重新分配，并在两次后拒绝下一次分配。"""
    state = WorkflowState.load(tmp_path / "state.json")
    advance_to_running(state)
    first = state.transition("task", "RETRYABLE_FAILED", actor_role="worker")
    assert first.retry_count == 0
    first_assignment = state.transition("task", "ASSIGNED", actor_role="orchestrator")
    assert first_assignment.retry_count == 1
    state.transition("task", "RUNNING", actor_role="worker")
    second = state.transition("task", "RETRYABLE_FAILED", actor_role="worker")
    assert second.retry_count == 1
    second_assignment = state.transition("task", "ASSIGNED", actor_role="orchestrator")
    assert second_assignment.retry_count == 2
    state.transition("task", "RUNNING", actor_role="worker")
    third = state.transition("task", "RETRYABLE_FAILED", actor_role="worker")
    assert third.retry_count == 2
    with pytest.raises(ValueError, match="两次"):
        state.transition("task", "ASSIGNED", actor_role="orchestrator")


def test_state_save_is_stable_atomic_and_load_handles_missing_or_corrupt_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """状态稳定原子保存，缺失文件为空状态，损坏文件携带路径报错。"""
    path = tmp_path / "state.json"
    state = WorkflowState.load(path)
    state.transition("z", "READY", actor_role="orchestrator")
    state.transition("a", "READY", actor_role="orchestrator")
    replaced: list[Path] = []
    original_replace = Path.replace

    def track_replace(source: Path, target: Path) -> Path:
        """记录原子替换调用并执行真实替换。"""
        replaced.append(target)
        return original_replace(source, target)

    monkeypatch.setattr(Path, "replace", track_replace)
    state.save()
    assert replaced == [path]
    assert path.read_bytes().endswith(b"\n")
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert [item["task_id"] for item in payload["states"]] == ["a", "z"]
    assert WorkflowState.load(tmp_path / "absent.json").transition("new", "READY", actor_role="orchestrator").status == "READY"

    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match=str(corrupt).replace("\\", r"\\")):
        WorkflowState.load(corrupt)


def test_transition_cli_saves_state_and_reports_transition_errors(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """transition 命令保存成功状态，并区分非法迁移错误码。"""
    path = tmp_path / "state.json"
    base = ["transition", "--file", str(path), "--task", "a", "--actor", "orchestrator"]
    assert main([*base, "--to", "READY", "--evidence", "Artifacts/start.json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "READY"
    assert json.loads(path.read_text(encoding="utf-8"))["states"][0]["status"] == "READY"
    assert main([*base, "--to", "DONE"]) == 3
    assert capsys.readouterr().err


def test_transition_cli_returns_file_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """transition 命令遇到损坏状态文件时返回输入错误码。"""
    path = tmp_path / "state.json"
    path.write_text("{", encoding="utf-8")
    assert main(
        ["transition", "--file", str(path), "--task", "a", "--to", "READY", "--actor", "orchestrator"]
    ) == 2
    assert capsys.readouterr().err


@pytest.mark.parametrize(
    "state_item",
    [
        {"task_id": 1, "status": "READY", "retry_count": 0, "updated_at_utc": "now", "evidence": []},
        {"task_id": "a", "status": 1, "retry_count": 0, "updated_at_utc": "now", "evidence": []},
        {"task_id": "a", "status": "READY", "retry_count": "0", "updated_at_utc": "now", "evidence": []},
        {"task_id": "a", "status": "READY", "retry_count": 3, "updated_at_utc": "now", "evidence": []},
        {"task_id": "a", "status": "READY", "retry_count": 0, "updated_at_utc": 1, "evidence": []},
        {"task_id": "a", "status": "READY", "retry_count": 0, "updated_at_utc": "now", "evidence": "proof"},
        {"task_id": "a", "status": "READY", "retry_count": 0, "updated_at_utc": "now", "evidence": [1]},
    ],
)
def test_state_load_rejects_invalid_persisted_field_types(tmp_path: Path, state_item: dict[str, object]) -> None:
    """状态快照字段类型不符合结构时必须携带文件路径拒绝加载。"""
    path = tmp_path / "invalid-state.json"
    path.write_text(json.dumps({"states": [state_item]}), encoding="utf-8")

    with pytest.raises(ValueError) as raised:
        WorkflowState.load(path)
    assert str(path) in str(raised.value)


def test_state_save_cleans_temporary_file_when_replace_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """状态原子替换失败时必须清理临时文件且保留旧快照。"""
    path = tmp_path / "state.json"
    state = WorkflowState.load(path)
    state.transition("a", "READY", actor_role="orchestrator")
    state.save()
    old_snapshot = path.read_text(encoding="utf-8")
    state.transition("b", "READY", actor_role="orchestrator")

    def fail_replace(_source: Path, _target: Path) -> Path:
        """模拟原子替换失败。"""
        raise OSError("replace failed")

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError, match="replace failed"):
        state.save()
    assert path.read_text(encoding="utf-8") == old_snapshot
    assert list(tmp_path.glob(".state.json.*.tmp")) == []
