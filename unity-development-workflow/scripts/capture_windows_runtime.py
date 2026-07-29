# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow>=11,<12"]
# ///
"""启动 Windows Standalone、捕获真实窗口并生成未批准的实机视觉证据。"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import time
from typing import Any


TASK_ID = re.compile(r"^[a-z0-9][a-z0-9.-]{0,95}$")


class RuntimeCaptureError(RuntimeError):
    """表示可安全展示且不会泄露项目外路径的实机捕获失败。"""


def resolve_project_path(project_root: Path, relative_path: str, required_prefix: str) -> Path:
    """解析受前缀和项目根约束的 POSIX 相对路径，并拒绝重解析点。"""
    if not relative_path or "\\" in relative_path:
        raise RuntimeCaptureError("路径必须是使用正斜杠的项目相对路径。")
    pure = PurePosixPath(relative_path)
    prefix = PurePosixPath(required_prefix)
    if pure.is_absolute() or ".." in pure.parts or pure.parts[: len(prefix.parts)] != prefix.parts:
        raise RuntimeCaptureError(f"路径必须位于 {required_prefix}/ 下。")

    root = project_root.resolve()
    candidate = (root / Path(*pure.parts)).resolve(strict=False)
    if not candidate.is_relative_to(root):
        raise RuntimeCaptureError("路径解析结果超出项目根目录。")
    current = root
    for part in pure.parts:
        current /= part
        if current.is_symlink():
            raise RuntimeCaptureError("项目路径不得经过符号链接或目录联接。")
        if not current.exists():
            break
    return candidate


def hash_file(path: Path) -> str:
    """流式计算文件 SHA-256，避免把大型构建制品一次读入内存。"""
    digest = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def find_main_window(process_id: int, title_contains: str) -> int | None:
    """枚举指定进程的可见顶层窗口，并按可选标题片段筛选。"""
    if os.name != "nt":
        raise RuntimeCaptureError("实机窗口捕获只支持 Windows。")
    user32 = ctypes.windll.user32
    matches: list[int] = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def visit(window: int, _parameter: int) -> bool:
        """收集属于目标进程且具有非空标题的可见窗口。"""
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(window, ctypes.byref(owner))
        if owner.value != process_id or not user32.IsWindowVisible(window):
            return True
        length = user32.GetWindowTextLengthW(window)
        if length <= 0:
            return True
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(window, buffer, length + 1)
        if not title_contains or title_contains.casefold() in buffer.value.casefold():
            matches.append(int(window))
        return True

    callback = callback_type(visit)
    user32.EnumWindows(callback, 0)
    return matches[0] if matches else None


def wait_for_window(process: subprocess.Popen[bytes], title_contains: str, timeout_seconds: float) -> int:
    """等待游戏创建主窗口，并在进程提前退出或超时时给出确定错误。"""
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeCaptureError(f"Windows 构建在窗口就绪前退出，退出码 {process.returncode}。")
        window = find_main_window(process.pid, title_contains)
        if window is not None:
            return window
        time.sleep(0.2)
    raise RuntimeCaptureError("等待 Windows 游戏窗口超时。")


def capture_window(window: int, output_path: Path) -> tuple[int, int]:
    """把前台游戏窗口区域捕获为 PNG；结果仍需独立视觉审查。"""
    from PIL import ImageGrab

    user32 = ctypes.windll.user32
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        user32.SetProcessDPIAware()
    user32.ShowWindow(window, 9)
    user32.SetForegroundWindow(window)
    rect = wintypes.RECT()
    if not user32.GetWindowRect(window, ctypes.byref(rect)):
        raise RuntimeCaptureError("无法读取游戏窗口边界。")
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if width <= 0 or height <= 0:
        raise RuntimeCaptureError("游戏窗口尺寸无效。")

    image = ImageGrab.grab(
        bbox=(rect.left, rect.top, rect.right, rect.bottom),
        include_layered_windows=True,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.{os.getpid()}.tmp")
    try:
        image.save(temporary, format="PNG")
        if output_path.exists():
            raise RuntimeCaptureError("目标截图已存在，必须使用新的版本路径。")
        temporary.replace(output_path)
    finally:
        temporary.unlink(missing_ok=True)
    return width, height


def build_evidence(
    args: argparse.Namespace,
    executable_hash: str,
    screenshot_hash: str,
    width: int,
    height: int,
) -> dict[str, Any]:
    """构造与 runtime-visual-evidence Schema 对齐的 CAPTURED 初始记录。"""
    return {
        "schemaVersion": "1.0",
        "projectId": args.project_id,
        "sceneId": args.scene_id,
        "buildVersion": args.build_version,
        "sourceRevision": args.source_revision,
        "projectStateVersion": args.project_state_version,
        "buildArtifactSha256": executable_hash,
        "captureSource": "WINDOWS_STANDALONE",
        "screenshot": {
            "path": args.screenshot,
            "sha256": screenshot_hash,
            "width": width,
            "height": height,
            "capturedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "status": "CAPTURED",
        "reviews": [],
        "userApprovals": [],
    }


def write_json_atomically(path: Path, payload: dict[str, Any]) -> None:
    """以 UTF-8 稳定 JSON 原子写入新证据，禁止覆盖已有审查链。"""
    if path.exists():
        raise RuntimeCaptureError("目标实机证据已存在，必须使用新的版本路径。")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="\n", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as stream:
            temporary_path = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
        if path.exists():
            raise RuntimeCaptureError("目标实机证据已存在，必须使用新的版本路径。")
        temporary_path.replace(path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def validate_args(args: argparse.Namespace) -> tuple[Path, Path, Path]:
    """校验标识、时间和全部文件范围，再返回规范化路径。"""
    for label, value in (("project-id", args.project_id), ("scene-id", args.scene_id)):
        if not TASK_ID.fullmatch(value):
            raise RuntimeCaptureError(f"{label} 不符合工作流任务 ID 规则。")
    if args.timeout <= 0 or args.capture_delay < 0:
        raise RuntimeCaptureError("超时必须大于 0，截图延迟不得小于 0。")
    if args.project_root.is_symlink():
        raise RuntimeCaptureError("Unity 项目根目录不得是符号链接或目录联接。")
    root = args.project_root.resolve()
    if not root.is_dir():
        raise RuntimeCaptureError("Unity 项目根目录不存在。")
    executable = resolve_project_path(root, args.executable, "Artifacts/Builds")
    screenshot = resolve_project_path(root, args.screenshot, "Artifacts/Visual/Runtime")
    evidence = resolve_project_path(root, args.evidence, "Artifacts/Visual/Runtime")
    if not executable.is_file() or executable.suffix.casefold() != ".exe":
        raise RuntimeCaptureError("Windows 构建 EXE 不存在或扩展名错误。")
    if screenshot.suffix.casefold() != ".png" or evidence.suffix.casefold() != ".json":
        raise RuntimeCaptureError("截图必须为 PNG，实机证据必须为 JSON。")
    if screenshot.exists() or evidence.exists():
        raise RuntimeCaptureError("截图或实机证据已存在，禁止覆盖。")
    return executable, screenshot, evidence


def run_capture(args: argparse.Namespace) -> dict[str, Any]:
    """执行启动、窗口等待、截图、哈希、证据写入和进程清理闭环。"""
    executable, screenshot, evidence_path = validate_args(args)
    executable_hash = hash_file(executable)
    process = subprocess.Popen(
        [str(executable), *args.launch_arg],
        cwd=executable.parent,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=False,
    )
    try:
        window = wait_for_window(process, args.window_title, args.timeout)
        time.sleep(args.capture_delay)
        width, height = capture_window(window, screenshot)
        payload = build_evidence(args, executable_hash, hash_file(screenshot), width, height)
        write_json_atomically(evidence_path, payload)
        return payload
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def build_parser() -> argparse.ArgumentParser:
    """创建 Windows 实机截图命令参数解析器。"""
    parser = argparse.ArgumentParser(description="启动 Windows Standalone 并生成实机视觉证据")
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--executable", required=True, help="Artifacts/Builds 下的项目相对 EXE 路径")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--scene-id", required=True)
    parser.add_argument("--build-version", required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--project-state-version", required=True)
    parser.add_argument("--screenshot", required=True, help="Artifacts/Visual/Runtime 下的 PNG 路径")
    parser.add_argument("--evidence", required=True, help="Artifacts/Visual/Runtime 下的 JSON 路径")
    parser.add_argument("--window-title", default="", help="可选窗口标题片段")
    parser.add_argument("--launch-arg", action="append", default=[], help="可重复的游戏启动参数")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--capture-delay", type=float, default=2.0)
    return parser


def main() -> int:
    """执行命令并仅输出项目相对证据摘要。"""
    args = build_parser().parse_args()
    try:
        payload = run_capture(args)
    except (OSError, RuntimeCaptureError, subprocess.SubprocessError) as error:
        print(f"实机捕获失败：{error}", file=os.sys.stderr)
        return 2
    print(json.dumps({"status": payload["status"], "evidence": args.evidence}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
