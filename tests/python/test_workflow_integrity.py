"""覆盖拆分投影与 G3 平台实机证据的严格完整性门禁。"""

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.gate_evaluator import GateEvidenceError, _EvidenceVerifier
from unity_workflow.projection_integrity import manifest_projection_issues


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"


def _approved_decomposition() -> dict[str, object]:
    """创建无需外部证据文件的已批准拆分快照。"""
    payload = yaml.safe_load((TEMPLATES / "decomposition-plan.yaml").read_text(encoding="utf-8"))
    payload["status"] = "APPROVED"
    payload["decision"].update(
        {
            "outcome": "APPROVE_SPLIT",
            "approvedModuleIds": ["Foundation.Core", "Gameplay.Player"],
            "approvedSceneIds": ["scene.arena-intro", "scene.arena-battle"],
        }
    )
    return payload


def _verifier(gate_id: str = "G1") -> _EvidenceVerifier:
    """创建用于直接验证严格语义方法的门禁验证器。"""
    return _EvidenceVerifier(
        Path.cwd(), "starfall-arena", "working-tree-snapshot-20260727",
        "0.1.0-dev.1", gate_id, "project-state-v1",
        {"type": "decomposition-plan", "path": "decomposition.yaml"},
    )


def test_module_manifest_rejects_tampered_responsibility(monkeypatch: pytest.MonkeyPatch) -> None:
    """模块清单不得在拆分批准后静默改写职责。"""
    verifier = _verifier()
    manifest = yaml.safe_load((TEMPLATES / "module-manifest.yaml").read_text(encoding="utf-8"))
    manifest["modules"][0]["responsibility"] = "被篡改的职责"
    monkeypatch.setattr(verifier, "verify_reference", lambda reference: None)
    monkeypatch.setattr(verifier, "_load_referenced_contract", lambda reference: _approved_decomposition())

    with pytest.raises(GateEvidenceError, match="responsibility 与批准拆分不一致"):
        verifier._verify_manifest_projection("module-manifest", manifest)


@pytest.mark.parametrize("mutation", ("DUPLICATE_MANIFEST", "MISSING_PROPOSAL"))
def test_module_projection_rejects_duplicate_or_missing_ids(mutation: str) -> None:
    """模块投影不得吞掉重复清单 ID，也不得批准不存在的模块提案。"""
    decomposition = _approved_decomposition()
    manifest = yaml.safe_load((TEMPLATES / "module-manifest.yaml").read_text(encoding="utf-8"))
    if mutation == "DUPLICATE_MANIFEST":
        manifest["modules"].append(dict(manifest["modules"][0]))
    else:
        decomposition["proposedModules"] = decomposition["proposedModules"][:1]
    issues = manifest_projection_issues("module-manifest", manifest, decomposition)
    assert any("重复 ID" in issue.message or "缺少对应提案" in issue.message for issue in issues)


@pytest.mark.parametrize(
    ("mutation", "message"),
    (("LIFECYCLE", "lifecycle 与批准拆分不一致"), ("UNAPPROVED", "未包含在 approvedSceneIds")),
)
def test_scene_manifest_rejects_non_projected_scene(
    monkeypatch: pytest.MonkeyPatch, mutation: str, message: str
) -> None:
    """场景生命周期和场景身份都必须来自批准拆分。"""
    verifier = _verifier()
    manifest = yaml.safe_load((TEMPLATES / "scene-manifest.yaml").read_text(encoding="utf-8"))
    if mutation == "LIFECYCLE":
        manifest["lifecycle"] = "MENU"
    else:
        manifest["id"] = "scene.unapproved"
    monkeypatch.setattr(verifier, "verify_reference", lambda reference: None)
    monkeypatch.setattr(verifier, "_load_referenced_contract", lambda reference: _approved_decomposition())

    with pytest.raises(GateEvidenceError, match=message):
        verifier._verify_manifest_projection("scene-manifest", manifest)


def test_scene_projection_rejects_duplicate_proposals() -> None:
    """同一个批准场景出现多份提案时必须阻断，不能静默选择第一份。"""
    decomposition = _approved_decomposition()
    decomposition["proposedScenes"].append(deepcopy(decomposition["proposedScenes"][0]))
    manifest = yaml.safe_load((TEMPLATES / "scene-manifest.yaml").read_text(encoding="utf-8"))
    issues = manifest_projection_issues("scene-manifest", manifest, decomposition)
    assert any("必须且只能有一个对应提案" in issue.message for issue in issues)


def test_g1_vertical_slice_rejects_unapproved_scene(monkeypatch: pytest.MonkeyPatch) -> None:
    """G1 纵切片检查不得以拆分范围外场景冒充可玩场景。"""
    verifier = _verifier()
    decomposition = _approved_decomposition()
    monkeypatch.setattr(verifier, "verify_active_decomposition", lambda: None)
    monkeypatch.setattr(
        verifier,
        "_load_referenced_contract",
        lambda reference: decomposition if reference.get("type") == "decomposition-plan" else {"id": "scene.unapproved"},
    )

    with pytest.raises(GateEvidenceError, match="sceneId 必须属于 approvedSceneIds"):
        verifier.verify_check_coverage(
            "vertical-slice.playable",
            [{"type": "scene-manifest", "path": "Scenes/unapproved.yaml"}],
        )


def _delivery_fixture() -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    """创建两个批准场景各一份且绑定同一可执行文件的交付证据。"""
    executable_hash = "a" * 64
    delivery = {
        "platform": "WINDOWS",
        "artifacts": [
            {"artifactType": "WINDOWS_EXECUTABLE", "path": "Build/Game.exe", "sha256": executable_hash, "sizeBytes": 1}
        ],
        "runtimeVisualEvidence": [
            {"type": "runtime-visual-evidence", "path": "runtime-intro.yaml"},
            {"type": "runtime-visual-evidence", "path": "runtime-battle.yaml"},
        ],
    }
    contracts = {
        "decomposition.yaml": _approved_decomposition(),
        "runtime-intro.yaml": {
            "sceneId": "scene.arena-intro", "platformId": "WINDOWS",
            "buildArtifactSha256": executable_hash,
        },
        "runtime-battle.yaml": {
            "sceneId": "scene.arena-battle", "platformId": "WINDOWS",
            "buildArtifactSha256": executable_hash,
        },
    }
    return delivery, contracts


def test_g3_delivery_accepts_exact_runtime_scene_coverage(monkeypatch: pytest.MonkeyPatch) -> None:
    """完整且绑定同一可执行文件的逐场景证据应通过 G3 完整性校验。"""
    verifier = _verifier("G3")
    delivery, contracts = _delivery_fixture()
    monkeypatch.setattr(verifier, "verify_active_decomposition", lambda: None)
    monkeypatch.setattr(verifier, "verify_reference", lambda reference: None)
    monkeypatch.setattr(verifier, "_load_referenced_contract", lambda reference: contracts[reference["path"]])
    verifier._verify_delivery_runtime_coverage(delivery)


@pytest.mark.parametrize(
    ("mutation", "message"),
    (
        ("MISSING", "缺少场景"),
        ("DUPLICATE", "重复场景"),
        ("WRONG_HASH", "buildArtifactSha256"),
        ("WRONG_PLATFORM", "platformId"),
    ),
)
def test_g3_delivery_rejects_incomplete_or_wrong_runtime_coverage(
    monkeypatch: pytest.MonkeyPatch, mutation: str, message: str
) -> None:
    """G3 必须无重复覆盖全部批准场景，并绑定同一平台主制品。"""
    verifier = _verifier("G3")
    delivery, contracts = _delivery_fixture()
    if mutation == "MISSING":
        delivery["runtimeVisualEvidence"].pop()
    elif mutation == "DUPLICATE":
        contracts["runtime-battle.yaml"]["sceneId"] = "scene.arena-intro"
    elif mutation == "WRONG_HASH":
        contracts["runtime-battle.yaml"]["buildArtifactSha256"] = "b" * 64
    else:
        contracts["runtime-battle.yaml"]["platformId"] = "ANDROID"
    monkeypatch.setattr(verifier, "verify_active_decomposition", lambda: None)
    monkeypatch.setattr(verifier, "verify_reference", lambda reference: None)
    monkeypatch.setattr(verifier, "_load_referenced_contract", lambda reference: contracts[reference["path"]])

    with pytest.raises(GateEvidenceError, match=message):
        verifier._verify_delivery_runtime_coverage(delivery)


def test_delivery_artifact_requires_unique_primary_machine_role() -> None:
    """交付 artifact 必须以机器字段标识唯一的平台主制品。"""
    payload = yaml.safe_load((TEMPLATES / "delivery-manifest.yaml").read_text(encoding="utf-8"))
    payload["artifacts"] = [{"path": "Build/Game.exe", "sha256": "a" * 64, "sizeBytes": 1}]
    assert any(issue.path == "$.artifacts[0].artifactType" for issue in validate_contract("delivery-manifest", payload))
    payload["status"] = "CANDIDATE"
    payload["artifacts"] = [
        {"artifactType": "WINDOWS_EXECUTABLE", "path": path, "sha256": character * 64, "sizeBytes": 1}
        for path, character in (("Build/Game.exe", "a"), ("Build/Other.exe", "b"))
    ]
    assert any(issue.path == "$.artifacts" for issue in validate_contract("delivery-manifest", payload))
