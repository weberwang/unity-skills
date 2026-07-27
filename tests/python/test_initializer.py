import importlib.util
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import validate_contract


ROOT = Path(__file__).parents[2]
SCRIPT_PATH = ROOT / "unity-development-workflow" / "scripts" / "initialize_project_docs.py"


def load_initializer():
    """从脚本路径加载初始化模块，避免要求它成为运行时包的一部分。"""
    spec = importlib.util.spec_from_file_location("initialize_project_docs", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_initializes_core_documents_with_valid_project_profile(tmp_path: Path) -> None:
    """核心初始化必须创建四份文件，并产生可通过契约校验的项目配置。"""
    initializer = load_initializer()

    written = initializer.initialize_documents(
        tmp_path, "my-unity-game", initializer.CORE_FILES, False
    )

    assert {path.name for path in written} == {
        "project-profile.yaml",
        "GDD.md",
        "TDD.md",
        "control-plane.md",
    }
    profile = yaml.safe_load((tmp_path / "docs" / "project-profile.yaml").read_text(encoding="utf-8"))
    assert profile["projectId"] == "my-unity-game"
    assert validate_contract("project-profile", profile) == []


def test_optional_documents_are_stage_scoped(tmp_path: Path) -> None:
    """显式 include 只能创建被选择的阶段性交付物。"""
    initializer = load_initializer()
    filenames = initializer.selected_files(["assets", "audio", "qa"])

    written = initializer.initialize_documents(
        tmp_path, "my-unity-game", filenames, False
    )

    assert {path.name for path in written} == {
        "asset-register.yaml",
        "audio-plan.md",
        "qa-plan.md",
    }
    assert not (tmp_path / "docs" / "GDD.md").exists()


def test_refuses_overwrite_without_force(tmp_path: Path) -> None:
    """已有交付物必须阻止默认覆盖，并在显式授权后允许重建。"""
    initializer = load_initializer()
    target = tmp_path / "docs" / "GDD.md"
    target.parent.mkdir()
    target.write_text("用户内容", encoding="utf-8")

    with pytest.raises(FileExistsError, match="拒绝覆盖"):
        initializer.initialize_documents(tmp_path, "my-unity-game", ("GDD.md",), False)

    initializer.initialize_documents(tmp_path, "my-unity-game", ("GDD.md",), True)
    assert target.read_text(encoding="utf-8").startswith("# 游戏设计文档")


def test_release_include_creates_compliance_documents(tmp_path: Path) -> None:
    """发布阶段必须同时初始化清单、隐私审查和第三方许可文档。"""
    initializer = load_initializer()
    filenames = initializer.selected_files(["release"])

    written = initializer.initialize_documents(
        tmp_path, "my-unity-game", filenames, False
    )

    assert {path.name for path in written} == {
        "release-checklist.md",
        "privacy-review.md",
        "third-party-notices.md",
    }
