"""Windows Standalone 实机视觉证据脚本的离线测试。"""

import argparse
import importlib.util
from pathlib import Path

import pytest

from unity_workflow.contracts import validate_contract


ROOT = Path(__file__).parents[2]
SCRIPT = ROOT / "unity-development-workflow" / "scripts" / "capture_windows_runtime.py"


def load_module():
    """加载真实脚本以测试路径与证据生成逻辑。"""
    spec = importlib.util.spec_from_file_location("capture_windows_runtime", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_args(project_root: Path) -> argparse.Namespace:
    """创建不启动真实进程的有效测试参数。"""
    return argparse.Namespace(
        project_root=project_root,
        executable="Artifacts/Builds/0.1/Game.exe",
        project_id="starfall-arena",
        scene_id="scene.arena-intro",
        build_version="0.1.0-dev.1",
        source_revision="a1b2c3d4e5f6",
        screenshot="Artifacts/Visual/Runtime/scene.arena-intro/frame.png",
        evidence="Artifacts/Visual/Runtime/scene.arena-intro/evidence.json",
        window_title="",
        launch_arg=[],
        timeout=30.0,
        capture_delay=2.0,
    )


def test_build_evidence_matches_runtime_schema(tmp_path: Path) -> None:
    """脚本生成的初始 CAPTURED 记录必须直接通过正式契约。"""
    module = load_module()
    payload = module.build_evidence(make_args(tmp_path), "a" * 64, "b" * 64, 1920, 1080)

    assert validate_contract("runtime-visual-evidence", payload) == []
    assert payload["status"] == "CAPTURED"
    assert payload["reviews"] == []
    assert payload["userApprovals"] == []


def test_validate_args_rejects_project_escape(tmp_path: Path) -> None:
    """构建、截图和证据路径均不得通过父目录跳出项目。"""
    module = load_module()
    args = make_args(tmp_path)
    args.executable = "Artifacts/Builds/../../outside.exe"

    with pytest.raises(module.RuntimeCaptureError, match="路径"):
        module.validate_args(args)


def test_validate_args_requires_immutable_outputs(tmp_path: Path) -> None:
    """已存在的截图或证据必须阻止覆盖。"""
    module = load_module()
    args = make_args(tmp_path)
    executable = tmp_path / "Artifacts" / "Builds" / "0.1" / "Game.exe"
    executable.parent.mkdir(parents=True)
    executable.write_bytes(b"build")
    screenshot = tmp_path / "Artifacts" / "Visual" / "Runtime" / "scene.arena-intro" / "frame.png"
    screenshot.parent.mkdir(parents=True)
    screenshot.write_bytes(b"old")

    with pytest.raises(module.RuntimeCaptureError, match="禁止覆盖"):
        module.validate_args(args)
