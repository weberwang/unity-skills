"""提供确定性的任务依赖图校验与就绪计算。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


class TaskGraph:
    """保存已校验的任务依赖关系并计算可执行任务。"""

    def __init__(self, dependencies: Mapping[str, tuple[str, ...]]) -> None:
        """保存由工厂方法校验过的依赖关系。"""
        self._dependencies = dict(dependencies)

    @classmethod
    def from_contracts(cls, tasks: Sequence[Mapping[str, Any]]) -> "TaskGraph":
        """从任务契约构建依赖图，并拒绝重复、悬空或成环的关系。"""
        dependencies: dict[str, tuple[str, ...]] = {}
        for task in tasks:
            if not isinstance(task, Mapping):
                raise ValueError("任务契约必须是映射")
            task_id = task.get("id")
            raw_dependencies = task.get("dependsOn", ())
            if not isinstance(task_id, str) or not task_id:
                raise ValueError("任务 ID 必须是非空字符串")
            if task_id in dependencies:
                raise ValueError(f"任务 ID 重复：{task_id}")
            if not isinstance(raw_dependencies, Sequence) or isinstance(raw_dependencies, (str, bytes)):
                raise ValueError(f"任务 {task_id} 的 dependsOn 必须是列表")
            if any(not isinstance(item, str) or not item for item in raw_dependencies):
                raise ValueError(f"任务 {task_id} 包含非法依赖 ID")
            dependencies[task_id] = tuple(sorted(set(raw_dependencies)))

        known_ids = set(dependencies)
        for task_id in sorted(dependencies):
            task_dependencies = dependencies[task_id]
            if task_id in task_dependencies:
                raise ValueError(f"任务不得自依赖：{task_id}")
            unknown = sorted(set(task_dependencies) - known_ids)
            if unknown:
                raise ValueError(f"任务 {task_id} 包含未知依赖：{', '.join(unknown)}")

        cycle_ids = _find_cycle_ids(dependencies)
        if cycle_ids:
            raise ValueError(f"任务依赖存在环：{', '.join(cycle_ids)}")
        return cls(dependencies)

    def ready_tasks(self, states: Mapping[str, str]) -> list[str]:
        """返回自身可调度且所有依赖均已完成的任务 ID。"""
        ready: list[str] = []
        for task_id in sorted(self._dependencies):
            if states.get(task_id) not in {"BLOCKED", "READY"}:
                continue
            if all(states.get(dependency) == "DONE" for dependency in self._dependencies[task_id]):
                ready.append(task_id)
        return ready


def _find_cycle_ids(dependencies: Mapping[str, tuple[str, ...]]) -> list[str]:
    """使用稳定顺序的迭代深度优先遍历收集所有环内节点。"""
    colors: dict[str, int] = {task_id: 0 for task_id in dependencies}
    cycle_ids: set[str] = set()

    for task_id in sorted(dependencies):
        if colors[task_id] != 0:
            continue
        colors[task_id] = 1
        active_path = [task_id]
        active_indexes = {task_id: 0}
        frames = [(task_id, iter(dependencies[task_id]))]
        while frames:
            current, children = frames[-1]
            try:
                dependency = next(children)
            except StopIteration:
                colors[current] = 2
                frames.pop()
                active_indexes.pop(current)
                active_path.pop()
                continue
            if colors[dependency] == 0:
                colors[dependency] = 1
                active_indexes[dependency] = len(active_path)
                active_path.append(dependency)
                frames.append((dependency, iter(dependencies[dependency])))
            elif colors[dependency] == 1:
                # 灰色节点必在当前活动路径上，回边区间正是环内任务。
                cycle_ids.update(active_path[active_indexes[dependency] :])
    return sorted(cycle_ids)
