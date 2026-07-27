"""提供文件持久化的确定性资源锁表。"""

from __future__ import annotations

import json
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from collections.abc import Sequence
from typing import Any


LOCK_TYPES = frozenset(
    {
        "path",
        "scene",
        "prefab",
        "project_settings",
        "package_manager",
        "asset_database",
        "unity_instance",
        "build_target",
    }
)
LOCK_MODES = frozenset({"read", "write"})


@dataclass(frozen=True, slots=True)
class LockRequest:
    """描述单个资源的读锁或写锁请求。"""

    type: str
    resource: str
    mode: str


@dataclass(frozen=True, slots=True)
class LockResult:
    """描述一组锁是否全部获得以及冲突任务。"""

    acquired: bool
    conflicts: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _LockEntry:
    """表示锁表中带所有者的持久化条目。"""

    task_id: str
    type: str
    resource: str
    mode: str


class LockTable:
    """管理支持批量原子申请的内存锁表及其 JSON 快照。"""

    def __init__(self, path: Path, entries: Sequence[_LockEntry] = ()) -> None:
        """绑定持久化路径并载入已校验的锁条目。"""
        self._path = path
        self._entries = list(entries)

    @classmethod
    def load(cls, path: Path) -> "LockTable":
        """从 JSON 加载锁表，缺失文件按空表处理。"""
        if not path.exists():
            return cls(path)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            raw_entries = payload["locks"]
            if not isinstance(raw_entries, list):
                raise TypeError("locks 必须是列表")
            entries = []
            for item in raw_entries:
                entry = _LockEntry(
                    task_id=item["task_id"],
                    type=item["type"],
                    resource=item["resource"],
                    mode=item["mode"],
                )
                normalized = _normalize_request(LockRequest(entry.type, entry.resource, entry.mode))
                if not isinstance(entry.task_id, str) or not entry.task_id:
                    raise ValueError("task_id 非法")
                entries.append(_LockEntry(entry.task_id, normalized.type, normalized.resource, normalized.mode))
        except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            raise ValueError(f"无法加载锁文件 {path}：{error}") from error
        return cls(path, entries)

    def acquire(self, task_id: str, requests: Sequence[LockRequest]) -> LockResult:
        """全有或全无地申请一组锁，并稳定返回冲突任务 ID。"""
        if not isinstance(task_id, str) or not task_id:
            raise ValueError("任务 ID 必须是非空字符串")
        normalized = tuple(dict.fromkeys(_normalize_request(item) for item in requests))
        conflicts: set[str] = set()
        for requested in normalized:
            for held in self._entries:
                if held.task_id == task_id:
                    continue
                if _requests_conflict(requested, LockRequest(held.type, held.resource, held.mode)):
                    conflicts.add(held.task_id)
        if conflicts:
            return LockResult(False, tuple(sorted(conflicts)))

        existing = {(item.task_id, item.type, item.resource, item.mode) for item in self._entries}
        for item in normalized:
            key = (task_id, item.type, item.resource, item.mode)
            if key not in existing:
                self._entries.append(_LockEntry(task_id, item.type, item.resource, item.mode))
                existing.add(key)
        return LockResult(True, ())

    def release(self, task_id: str) -> int:
        """删除指定任务的全部锁并返回删除数量。"""
        before = len(self._entries)
        self._entries = [item for item in self._entries if item.task_id != task_id]
        return before - len(self._entries)

    def entries(self) -> list[dict[str, str]]:
        """返回可供 CLI 展示的稳定排序锁条目。"""
        return [asdict(item) for item in sorted(self._entries, key=_entry_key)]

    def save(self) -> None:
        """以 UTF-8、稳定键序、末尾换行和同目录原子替换保存锁表。"""
        payload = {"locks": self.entries()}
        serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        _atomic_write(self._path, serialized)


def _entry_key(entry: _LockEntry) -> tuple[str, str, str, str]:
    """生成不依赖文件系统顺序的锁条目排序键。"""
    return (entry.task_id, entry.type, entry.resource, entry.mode)


def _normalize_request(request: LockRequest) -> LockRequest:
    """校验锁类型与模式，并规范化路径类资源。"""
    if not isinstance(request, LockRequest):
        raise ValueError("锁请求必须是 LockRequest")
    if request.type not in LOCK_TYPES:
        raise ValueError(f"未知锁类型：{request.type}")
    if request.mode not in LOCK_MODES:
        raise ValueError(f"未知锁模式：{request.mode}")
    if not isinstance(request.resource, str) or not request.resource:
        raise ValueError("锁资源必须是非空字符串")
    resource = request.resource
    if request.type in {"path", "scene", "prefab"}:
        resource = _normalize_project_path(resource)
    return LockRequest(request.type, resource, request.mode)


def _normalize_project_path(resource: str) -> str:
    """规范化并限制为 POSIX 形式的项目相对路径。"""
    if "\\" in resource:
        raise ValueError(f"路径必须使用 POSIX 分隔符：{resource}")
    path = PurePosixPath(resource)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError(f"路径必须是项目相对路径：{resource}")
    if ":" in path.parts[0]:
        raise ValueError(f"路径必须是项目相对路径：{resource}")
    return path.as_posix()


def _requests_conflict(left: LockRequest, right: LockRequest) -> bool:
    """判断两项规范化请求在资源范围与锁模式上是否冲突。"""
    left_resources = _effective_resources(left)
    right_resources = _effective_resources(right)
    for left_type, left_resource in left_resources:
        for right_type, right_resource in right_resources:
            if left_type != right_type:
                continue
            if left_type == "path":
                related = _path_scope_conflict(left_resource, left.mode, right_resource, right.mode)
            else:
                related = left_resource == right_resource
            if related and (left.mode == "write" or right.mode == "write"):
                return True
    return False


def _effective_resources(request: LockRequest) -> tuple[tuple[str, str], ...]:
    """把场景和预制体锁映射为目标文件及其 meta 文件路径锁。"""
    if request.type in {"scene", "prefab"}:
        return (("path", request.resource), ("path", f"{request.resource}.meta"))
    return ((request.type, request.resource),)


def _path_scope_conflict(left: str, left_mode: str, right: str, right_mode: str) -> bool:
    """按目录边界判断相同路径或父目录写锁的覆盖关系。"""
    if left == right:
        return True
    left_parts = PurePosixPath(left).parts
    right_parts = PurePosixPath(right).parts
    if len(left_parts) < len(right_parts) and right_parts[: len(left_parts)] == left_parts:
        return left_mode == "write"
    if len(right_parts) < len(left_parts) and left_parts[: len(right_parts)] == right_parts:
        return right_mode == "write"
    return False


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
