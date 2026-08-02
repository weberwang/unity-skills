"""验证模块全集通过后才能执行最终设备验收。"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.acceptance_integrity import check_coverage_failure
from unity_workflow.contracts import validate_contract
from unity_workflow.gate_evaluator import GateEvidenceError, _EvidenceVerifier


TEMPLATES = Path(__file__).parents[2] / "unity-development-workflow" / "templates"


@pytest.mark.parametrize(
    "filename",
    [
        "quality-report-module-acceptance.yaml",
        "quality-report-device-acceptance.yaml",
        "quality-report-platform-adaptation.yaml",
    ],
)
def test_acceptance_report_templates_validate(filename: str) -> None:
    """模块与设备验收模板必须满足质量报告契约。"""
    payload = yaml.safe_load((TEMPLATES / filename).read_text(encoding="utf-8"))
    assert validate_contract("quality-report", payload) == []


class _Reader:
    """提供验收覆盖单元测试所需的契约回读。"""

    active_decomposition = {
        "type": "decomposition-plan",
        "path": "decomposition.yaml",
        "sha256": "d" * 64,
    }
    active_project_profile = {
        "type": "project-profile",
        "path": "profile.yaml",
        "sha256": "e" * 64,
    }

    def __init__(self, contracts: dict[str, dict[str, object]]) -> None:
        """保存按项目相对路径索引的契约。"""
        self.contracts = contracts

    def verify_active_decomposition(self) -> None:
        """夹具中的拆分始终代表当前已批准版本。"""

    def verify_active_project_profile(self) -> None:
        """夹具中的平台配置始终代表当前已批准版本。"""

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """读取夹具中已验证的契约。"""
        return self.contracts[str(reference["path"])]


def _module_report(module_id: str) -> dict[str, object]:
    """创建当前模块的最小 PASS 验收报告。"""
    report = yaml.safe_load(
        (TEMPLATES / "quality-report-module-acceptance.yaml").read_text(encoding="utf-8")
    )
    report["moduleId"] = module_id
    return report


def _reader() -> _Reader:
    """创建包含两个批准模块和两个场景的读取器。"""
    return _Reader(
        {
            "decomposition.yaml": {
                "decision": {
                    "approvedModuleIds": ["Foundation.Core", "Gameplay.Player"],
                    "approvedSceneIds": ["scene.arena-intro", "scene.arena-battle"],
                }
            },
            "profile.yaml": {
                "delivery": {
                    "platformSelectionStatus": "APPROVED",
                    "primaryDevelopmentPlatform": "WINDOWS",
                    "targets": [
                        {
                            "platformId": "WINDOWS",
                            "adaptationFamily": "WINDOWS",
                            "deviceClasses": ["DESKTOP"],
                            "orientations": ["LANDSCAPE"],
                            "inputModes": ["KEYBOARD_MOUSE", "GAMEPAD"],
                            "windowModes": ["WINDOWED", "FULLSCREEN_WINDOW"],
                        },
                        {
                            "platformId": "ANDROID",
                            "adaptationFamily": "MOBILE",
                            "deviceClasses": ["PHONE", "TABLET"],
                            "orientations": ["PORTRAIT", "LANDSCAPE"],
                            "inputModes": ["TOUCH"],
                        },
                    ],
                }
            },
            "foundation.yaml": _module_report("Foundation.Core"),
            "player.yaml": _module_report("Gameplay.Player"),
            "devices.yaml": yaml.safe_load(
                (TEMPLATES / "quality-report-device-acceptance.yaml").read_text(encoding="utf-8")
            ),
        }
    )


def test_module_acceptance_requires_exact_approved_module_set() -> None:
    """G2 必须为当前拆分的每个模块提供唯一 PASS 报告。"""
    reader = _reader()
    evidence = [
        {"type": "quality-report", "path": "foundation.yaml"},
        {"type": "quality-report", "path": "player.yaml"},
    ]
    assert check_coverage_failure(
        reader, "modules.acceptance-complete", evidence, "quality-report"
    ) is None

    assert "Gameplay.Player" in (
        check_coverage_failure(
            reader, "modules.acceptance-complete", evidence[:1], "quality-report"
        )
        or ""
    )


def test_device_acceptance_requires_full_profile_scene_cartesian_product() -> None:
    """最终设备矩阵必须覆盖每个设备档位与已批准场景组合。"""
    reader = _reader()
    evidence = [{"type": "quality-report", "path": "devices.yaml"}]
    assert check_coverage_failure(
        reader, "devices.acceptance-verified", evidence, "quality-report"
    ) is None

    reader.contracts["devices.yaml"]["deviceAcceptance"]["matrix"].pop()
    assert "笛卡尔积" in (
        check_coverage_failure(
            reader, "devices.acceptance-verified", evidence, "quality-report"
        )
        or ""
    )

    reader = _reader()
    matrix = reader.contracts["devices.yaml"]["deviceAcceptance"]["matrix"]
    matrix[1]["deviceProfileId"] = matrix[0]["deviceProfileId"]
    matrix[1]["sceneId"] = matrix[0]["sceneId"]
    assert "重复设备与场景组合" in (
        check_coverage_failure(
            reader, "devices.acceptance-verified", evidence, "quality-report"
        )
        or ""
    )


def test_device_acceptance_rejects_stale_module_set_and_artifact() -> None:
    """设备验收不得绕过新增模块或换用其他平台制品。"""
    reader = _reader()
    evidence = [{"type": "quality-report", "path": "devices.yaml"}]
    report = reader.contracts["devices.yaml"]
    report["deviceAcceptance"]["acceptedModuleIds"].pop()
    assert "Gameplay.Player" in (
        check_coverage_failure(
            reader, "devices.acceptance-verified", evidence, "quality-report"
        )
        or ""
    )

    reader = _reader()
    report = reader.contracts["devices.yaml"]
    report["checks"][0]["evidence"][0]["sha256"] = "f" * 64
    assert "平台制品字段" in (
        check_coverage_failure(
            reader, "devices.acceptance-verified", evidence, "quality-report"
        )
        or ""
    )


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("FORM_FACTOR", "形态不属于平台"),
        ("INPUT", "未批准的输入模式"),
        ("ORIENTATION", "未批准的屏幕方向"),
        ("WINDOW_MODE", "移动端用例"),
    ],
)
def test_device_acceptance_obeys_each_platform_adaptation_target(
    mutation: str, message: str
) -> None:
    """设备档位与用例必须服从所属平台获批的形态、输入、方向和窗口策略。"""
    reader = _reader()
    evidence = [{"type": "quality-report", "path": "devices.yaml"}]
    acceptance = reader.contracts["devices.yaml"]["deviceAcceptance"]
    android_profile = acceptance["deviceProfiles"][1]
    android_cases = [
        item for item in acceptance["matrix"]
        if item["deviceProfileId"] == android_profile["id"]
    ]
    if mutation == "FORM_FACTOR":
        android_profile["formFactor"] = "DESKTOP"
    elif mutation == "INPUT":
        android_cases[0]["inputMode"] = "KEYBOARD_MOUSE"
    elif mutation == "ORIENTATION":
        reader.contracts["profile.yaml"]["delivery"]["targets"][1]["orientations"] = ["PORTRAIT"]
    else:
        android_cases[0]["windowMode"] = "WINDOWED"

    assert message in (
        check_coverage_failure(
            reader, "devices.acceptance-verified", evidence, "quality-report"
        )
        or ""
    )


def test_2d_contract_must_be_verified_before_g2_but_is_not_device_acceptance(tmp_path: Path) -> None:
    """G2 只消费已验证适配契约，最终设备矩阵仍由 G3 的独立检查证明。"""
    common = {
        "root": tmp_path,
        "project_id": "starfall-arena",
        "source_revision": "revision-001",
        "build_version": "0.1.0-dev.1",
        "project_state_version": "project-state-v1",
        "active_decomposition": {},
    }
    g2 = _EvidenceVerifier(gate_id="G2", **common)
    with pytest.raises(GateEvidenceError, match="scene-2d-adaptation"):
        g2._verify_status("scene-2d-adaptation", {"status": "APPROVED"})
    g2._verify_status("scene-2d-adaptation", {"status": "VERIFIED"})

    g3 = _EvidenceVerifier(gate_id="G3", **common)
    g3._verify_status("scene-2d-adaptation", {"status": "VERIFIED"})


def test_device_acceptance_mutations_do_not_leak_between_cases() -> None:
    """深拷贝设备报告时不得污染其他验收用例。"""
    reader = _reader()
    original = reader.contracts["devices.yaml"]
    changed = deepcopy(original)
    changed["deviceAcceptance"]["matrix"][0]["status"] = "FAIL"
    assert original["deviceAcceptance"]["matrix"][0]["status"] == "PASS"
