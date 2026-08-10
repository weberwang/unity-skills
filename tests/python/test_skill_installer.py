import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[2]
SCRIPT_PATH = ROOT / "scripts" / "install_project_skills.py"
EXPECTED_SKILL_NAMES = {
    "unity-game-build-player-character",
    "unity-development-workflow",
    "unity-game-grilling",
    "unity-game-3d-modeling",
    "unity-game-3d-texturing",
    "unity-game-architecture",
    "unity-game-audio",
    "unity-game-balance",
    "unity-game-production",
    "unity-game-qa-performance",
    "unity-game-release",
    "unity-game-visual-assets",
    "unity-game-spine-reskin",
    "unity-gameplay-development",
}


def load_installer():
    """从仓库脚本路径加载安装器以测试真实实现。"""
    spec = importlib.util.spec_from_file_location("install_project_skills", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_installs_all_discovered_skills(tmp_path: Path) -> None:
    """安装器必须复制总控和全部角色 Skill。"""
    installer = load_installer()

    installed = installer.install_skills(tmp_path, False)

    assert {path.name for path in installed} == EXPECTED_SKILL_NAMES
    assert all((path / "SKILL.md").is_file() for path in installed)
    assert (tmp_path / ".agents" / "skills" / "unity-development-workflow").is_dir()
    assert (tmp_path / ".agents" / "skills" / "unity-game-3d-modeling").is_dir()
    assert (tmp_path / ".agents" / "skills" / "unity-game-3d-texturing").is_dir()


def test_refuses_existing_skill_without_force(tmp_path: Path) -> None:
    """默认安装不得静默覆盖项目中已有的 Skill 修改。"""
    installer = load_installer()
    target = tmp_path / ".agents" / "skills" / "unity-game-audio"
    target.mkdir(parents=True)
    (target / "SKILL.md").write_text("用户版本", encoding="utf-8")

    with pytest.raises(FileExistsError, match="拒绝覆盖"):
        installer.install_skills(tmp_path, False)

    installer.install_skills(tmp_path, True)
    assert "name: unity-game-audio" in (target / "SKILL.md").read_text(encoding="utf-8")


def test_refuses_symlink_target_even_with_force(tmp_path: Path) -> None:
    """显式覆盖也不得沿符号链接删除或写入项目外目录。"""
    installer = load_installer()
    outside = tmp_path / "outside"
    outside.mkdir()
    target = tmp_path / ".agents" / "skills" / "unity-game-audio"
    target.parent.mkdir(parents=True)
    try:
        target.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("当前系统或权限不支持创建目录符号链接")

    with pytest.raises(ValueError, match="符号链接"):
        installer.install_skills(tmp_path, True)
