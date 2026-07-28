import json
import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[2]
PACKAGE_PATH = ROOT / "package.json"
INSTALLER_PATH = ROOT / "scripts" / "install-project-skills.mjs"


def test_package_exposes_single_npx_entry() -> None:
    """根 npm 包必须让 npx 无需额外子命令即可推断安装入口。"""
    package = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))

    assert package["name"] == "unity-skills"
    assert package["type"] == "module"
    assert package["bin"] == {"unity-skills": "./scripts/install-project-skills.mjs"}
    assert package["engines"]["node"] == ">=22.20.0"
    assert len([path for path in package["files"] if path.startswith("unity-")]) == 9
    assert "scripts/install-project-skills.mjs" in package["files"]


def test_npx_installer_bundles_fixed_skill_allowlist() -> None:
    """远程安装器必须从当前包复制固定白名单中的全部 Skills。"""
    source = INSTALLER_PATH.read_text(encoding="utf-8")

    assert "const PACKAGE_ROOT" in source
    assert "const SKILL_NAMES" in source
    assert 'resolve(projectRoot, ".agents")' in source
    assert "cpSync(source, target" in source
    assert "skills@" not in source


def test_npx_installer_help_uses_short_command() -> None:
    """帮助信息必须展示无需克隆仓库的最短安装命令。"""
    node = shutil.which("node")
    if node is None:
        pytest.skip("当前环境未安装 Node.js")

    result = subprocess.run(
        [node, str(INSTALLER_PATH), "--help"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 0
    assert "npx -y github:weberwang/unity-skills" in result.stdout


def test_npx_installer_rejects_filesystem_root() -> None:
    """安装器必须阻止误把文件系统根目录当作 Unity 项目。"""
    node = shutil.which("node")
    if node is None:
        pytest.skip("当前环境未安装 Node.js")

    result = subprocess.run(
        [node, str(INSTALLER_PATH), str(ROOT.anchor)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 1
    assert "不能是文件系统根目录" in result.stderr


def test_npx_installer_copies_current_package_and_requires_force(tmp_path: Path) -> None:
    """真实安装必须复制当前包内容，并且只有显式授权才覆盖本地修改。"""
    node = shutil.which("node")
    if node is None:
        pytest.skip("当前环境未安装 Node.js")

    first = subprocess.run(
        [node, str(INSTALLER_PATH), str(tmp_path)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert first.returncode == 0

    package = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))
    skill_names = [path for path in package["files"] if path.startswith("unity-")]
    target_root = tmp_path / ".agents" / "skills"
    assert sorted(path.name for path in target_root.iterdir()) == sorted(skill_names)
    for name in skill_names:
        source_root = ROOT / name
        source_files = sorted(path.relative_to(source_root) for path in source_root.rglob("*") if path.is_file())
        target_files = sorted(path.relative_to(target_root / name) for path in (target_root / name).rglob("*") if path.is_file())
        assert target_files == source_files
        for relative_path in source_files:
            assert (target_root / name / relative_path).read_bytes() == (source_root / relative_path).read_bytes()

    modified = target_root / "unity-game-audio" / "SKILL.md"
    modified.write_text("本地修改", encoding="utf-8")
    refused = subprocess.run(
        [node, str(INSTALLER_PATH), str(tmp_path)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert refused.returncode == 1
    assert modified.read_text(encoding="utf-8") == "本地修改"

    replaced = subprocess.run(
        [node, str(INSTALLER_PATH), str(tmp_path), "--force"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert replaced.returncode == 0
    assert modified.read_bytes() == (ROOT / "unity-game-audio" / "SKILL.md").read_bytes()


def test_npx_installer_rejects_symlink_project_root(tmp_path: Path) -> None:
    """项目根目录本身是链接时也不得沿链接安装或覆盖。"""
    node = shutil.which("node")
    if node is None:
        pytest.skip("当前环境未安装 Node.js")

    actual = tmp_path / "actual"
    actual.mkdir()
    linked = tmp_path / "linked"
    try:
        linked.symlink_to(actual, target_is_directory=True)
    except OSError:
        pytest.skip("当前系统或权限不支持创建目录符号链接")

    result = subprocess.run(
        [node, str(INSTALLER_PATH), str(linked), "--force"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 1
    assert "不能是符号链接或目录联接" in result.stderr
    assert not (actual / ".agents").exists()
