"""提供文件持久化的任务状态机。"""

from __future__ import annotations

import json
import tempfile
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


MAIN_TRANSITIONS: dict[str, frozenset[str]] = {
    "BLOCKED": frozenset({"READY"}),
    "READY": frozenset({"ASSIGNED"}),
    "ASSIGNED": frozenset({"RUNNING"}),
    "RUNNING": frozenset({"SELF_VERIFIED", "RETRYABLE_FAILED"}),
    "RETRYABLE_FAILED": frozenset({"ASSIGNED"}),
    "SELF_VERIFIED": frozenset({"REVIEWING", "REJECTED"}),
    "REVIEWING": frozenset({"APPROVED", "REJECTED"}),
    "APPROVED": frozenset({"INTEGRATED"}),
    "INTEGRATED": frozenset({"VERIFIED"}),
    "VERIFIED": frozenset({"DONE"}),
}
TERMINAL_STATES = frozenset({"DONE", "REJECTED", "CONFLICTED", "CANCELLED"})
KNOWN_STATES = frozenset(MAIN_TRANSITIONS) | TERMINAL_STATES
EVIDENCE_ADVANCING_TRANSITIONS = frozenset(
    {
        ("SELF_VERIFIED", "REVIEWING"),
        ("REVIEWING", "APPROVED"),
        ("APPROVED", "INTEGRATED"),
        ("INTEGRATED", "VERIFIED"),
        ("VERIFIED", "DONE"),
    }
)


@dataclass(frozen=True, slots=True)
class TaskState:
    """表示单个任务的当前状态、重试次数与证据快照。"""

    task_id: str
    status: str
    retry_count: int
    updated_at_utc: str
    evidence: tuple[str, ...]


class WorkflowState:
    """管理任务的合法迁移与确定性 JSON 持久化。"""

    def __init__(self, path: Path, states: Sequence[TaskState] = ()) -> None:
        """绑定持久化路径并保存已校验的任务状态。"""
        self._path = path
        self._states = {state.task_id: state for state in states}

    @classmethod
    def load(cls, path: Path) -> "WorkflowState":
        """从 JSON 加载状态，缺失文件按无持久化任务处理。"""
        if not path.exists():
            return cls(path)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            raw_states = payload["states"]
            if not isinstance(raw_states, list):
                raise TypeError("states 必须是列表")
            states: list[TaskState] = []
            seen: set[str] = set()
            for item in raw_states:
                raw_evidence = item["evidence"]
                if not isinstance(raw_evidence, list) or any(
                    not isinstance(evidence_path, str) or not evidence_path for evidence_path in raw_evidence
                ):
                    raise ValueError("evidence 必须是非空字符串组成的列表")
                state = TaskState(
                    task_id=item["task_id"],
                    status=item["status"],
                    retry_count=item["retry_count"],
                    updated_at_utc=item["updated_at_utc"],
                    evidence=tuple(raw_evidence),
                )
                _validate_loaded_state(state)
                if state.task_id in seen:
                    raise ValueError(f"任务状态重复：{state.task_id}")
                seen.add(state.task_id)
                states.append(state)
        except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            raise ValueError(f"无法加载状态文件 {path}：{error}") from error
        return cls(path, states)

    def transition(
        self,
        task_id: str,
        next_state: str,
        *,
        actor_role: str,
        evidence: Sequence[str] = (),
    ) -> TaskState:
        """校验并执行一次迁移，返回更新后的不可变任务状态。"""
        if not isinstance(task_id, str) or not task_id:
            raise ValueError("任务 ID 必须是非空字符串")
        if next_state not in KNOWN_STATES:
            raise ValueError(f"未知目标状态：{next_state}")
        if not isinstance(actor_role, str) or not actor_role:
            raise ValueError("actor_role 必须是非空字符串")
        if isinstance(evidence, (str, bytes)) or any(not isinstance(item, str) or not item for item in evidence):
            raise ValueError("证据必须是非空路径序列")

        current = self._states.get(task_id)
        current_status = current.status if current else "BLOCKED"
        retry_count = current.retry_count if current else 0
        previous_evidence = current.evidence if current else ()
        allowed = set(MAIN_TRANSITIONS.get(current_status, ()))
        if current_status not in TERMINAL_STATES:
            allowed.update({"CONFLICTED", "CANCELLED"})
        if next_state not in allowed:
            raise ValueError(f"非法状态迁移：{current_status} → {next_state}")

        if (current_status, next_state) in EVIDENCE_ADVANCING_TRANSITIONS:
            # 质量状态必须由本阶段新证据推进，不允许只重放历史路径跳过审查。
            if not any(item not in previous_evidence for item in evidence):
                raise ValueError(f"{current_status} → {next_state} 至少需要一个本阶段新证据路径")
        if current_status == "REVIEWING" and next_state == "APPROVED":
            if actor_role != "reviewer":
                raise ValueError("REVIEWING → APPROVED 的 actor_role 必须是 reviewer")
        if current_status == "VERIFIED" and next_state == "DONE" and actor_role != "orchestrator":
            raise ValueError("VERIFIED → DONE 的 actor_role 必须是 orchestrator")
        if current_status == "RETRYABLE_FAILED" and next_state == "ASSIGNED":
            if retry_count >= 2:
                raise ValueError("任务最多允许两次重试，不得进行第三次重新分配")
            # retry_count 统计实际重新分配次数，运行失败本身不会消耗重试额度。
            retry_count += 1

        # 证据按首次出现顺序累积，既保留工作流时间语义，又稳定去重。
        combined_evidence = tuple(dict.fromkeys((*previous_evidence, *evidence)))
        updated = TaskState(task_id, next_state, retry_count, _utc_now(), combined_evidence)
        self._states[task_id] = updated
        return updated

    def statuses(self) -> dict[str, str]:
        """返回按任务 ID 排序的状态映射供 DAG 调度使用。"""
        return {task_id: self._states[task_id].status for task_id in sorted(self._states)}

    def save(self) -> None:
        """以 UTF-8、稳定键序、末尾换行和同目录原子替换保存状态。"""
        payload = {
            "states": [
                {**asdict(self._states[task_id]), "evidence": list(self._states[task_id].evidence)}
                for task_id in sorted(self._states)
            ]
        }
        serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        _atomic_write(self._path, serialized)


def _validate_loaded_state(state: TaskState) -> None:
    """拒绝损坏快照中的未知状态、重复或非法字段。"""
    if not isinstance(state.task_id, str) or not state.task_id:
        raise ValueError("task_id 非法")
    if state.status not in KNOWN_STATES:
        raise ValueError(f"未知状态：{state.status}")
    if not isinstance(state.retry_count, int) or isinstance(state.retry_count, bool) or not 0 <= state.retry_count <= 2:
        raise ValueError("retry_count 非法")
    if not isinstance(state.updated_at_utc, str) or not state.updated_at_utc:
        raise ValueError("updated_at_utc 非法")
    if any(not isinstance(item, str) or not item for item in state.evidence):
        raise ValueError("evidence 非法")


def _utc_now() -> str:
    """生成带 Z 后缀的 UTC ISO 8601 时间戳。"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _atomic_write(path: Path, content: str) -> None:
    """在目标目录写临时文件并通过 Path.replace 原子替换。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="\n", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as stream:
            stream.write(content)
            stream.flush()
            temporary_path = Path(stream.name)
        temporary_path.replace(path)
    finally:
        # 替换失败时只清理由本次保存创建的临时文件，避免污染工作区。
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()
