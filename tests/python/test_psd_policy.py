"""验证开发阶段完全禁止 PSD、PSB、PSDT 与分层导出方案。"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.psd_policy import find_prohibited_photoshop_documents


TEMPLATES = Path(__file__).parents[2] / "unity-development-workflow" / "templates"


def _load_template(name: str) -> dict[str, object]:
    """加载指定 YAML 模板用于策略变异测试。"""
    return yaml.safe_load((TEMPLATES / name).read_text(encoding="utf-8"))


def test_visual_bible_requires_no_psd_development_policy() -> None:
    """Visual Bible 必须把无 PSD 与独立遮罩策略固化为不可变常量。"""
    payload = _load_template("visual-bible.yaml")
    assert validate_contract("visual-bible", payload) == []

    invalid = deepcopy(payload)
    invalid["assetRegeneration"]["psdWorkflow"] = "ALLOWED"
    assert validate_contract("visual-bible", invalid)


def test_split_and_assembly_contracts_reject_layer_export_channel() -> None:
    """资产地图和正式拼装不得通过泛化分层导出绕过 PSD 禁令。"""
    split_plan = _load_template("split-plan.yaml")
    split_plan["items"][0]["action"] = "EXPORT_LAYER"
    assert validate_contract("split-plan", split_plan)

    assembly = _load_template("prefab-assembly.yaml")
    assembly["assetBindings"][0]["productionType"] = "EXPORTED_LAYER"
    assert validate_contract("prefab-assembly", assembly)


def test_scanner_rejects_all_photoshop_document_extensions(tmp_path: Path) -> None:
    """真实文件扫描必须大小写不敏感地覆盖 PSD、PSB 与 PSDT。"""
    expected = {
        Path("Assets/Art/hero.PSD"),
        Path("ArtSource/ui.psb"),
        Path("Artifacts/Visual/template.PsDt"),
    }
    for relative_path in expected:
        path = tmp_path / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"forbidden")
    allowed = tmp_path / "Assets" / "Art" / "hero.png"
    allowed.write_bytes(b"allowed")

    assert set(find_prohibited_photoshop_documents(tmp_path)) == expected
