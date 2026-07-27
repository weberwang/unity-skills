"""为文件式状态提供跨进程互斥，避免多个代理丢失更新。"""

from __future__ import annotations

import os
from pathlib import Path
from types import TracebackType
from typing import BinaryIO


class FileMutex:
    """在同目录持有一个由操作系统管理的阻塞式一字节文件锁。"""

    def __init__(self, protected_path: Path) -> None:
        """根据受保护文件构造稳定的互斥文件路径。"""
        self._path = protected_path.with_name(protected_path.name + ".mutex")
        self._handle: BinaryIO | None = None

    def __enter__(self) -> "FileMutex":
        """阻塞到获得操作系统锁；进程退出时系统会自动释放锁。"""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_BINARY", 0)
        descriptor = os.open(self._path, flags, 0o666)
        handle = os.fdopen(descriptor, "r+b", buffering=0)
        try:
            # Windows 区域锁不能可靠锁住 EOF 之外的字节；并发首次创建时统一扩展到一字节。
            if os.fstat(descriptor).st_size < 1:
                os.ftruncate(descriptor, 1)
                os.fsync(descriptor)
            handle.seek(0)
            _lock_handle(handle)
        except BaseException:
            # __enter__ 失败不会触发 __exit__，必须在这里关闭底层句柄。
            handle.close()
            raise
        self._handle = handle
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """释放锁并关闭句柄，不吞掉受保护操作抛出的异常。"""
        if self._handle is None:
            return
        try:
            self._handle.seek(0)
            _unlock_handle(self._handle)
        finally:
            self._handle.close()
            self._handle = None


if os.name == "nt":
    import msvcrt

    def _lock_handle(handle: BinaryIO) -> None:
        """在 Windows 使用阻塞式 CRT 区域锁。"""
        msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)

    def _unlock_handle(handle: BinaryIO) -> None:
        """释放 Windows CRT 区域锁。"""
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)

else:
    import fcntl

    def _lock_handle(handle: BinaryIO) -> None:
        """在 POSIX 使用阻塞式独占 flock。"""
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)

    def _unlock_handle(handle: BinaryIO) -> None:
        """释放 POSIX flock。"""
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
