from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import pytest
import yaml

from unity_workflow.asset_registry import merge_registration_records
from unity_workflow.contracts import validate_contract


ROOT = Path(__file__).parents[2] / "unity-development-workflow"

IMPORTERS: dict[str, dict[str, object]] = {
    "sprite": {"textureType": "Sprite", "spriteMode": "Single", "pixelsPerUnit": 100, "filterMode": "Bilinear", "wrapMode": "Clamp", "maxSize": 2048, "compression": "Uncompressed", "sRgb": True, "alphaIsTransparency": True, "mipmaps": False, "readWriteEnabled": False},
    "texture": {"textureType": "NormalMap", "filterMode": "Trilinear", "wrapMode": "Repeat", "maxSize": 4096, "compression": "NormalQuality", "sRgb": False, "alphaIsTransparency": False, "mipmaps": True, "readWriteEnabled": False},
    "model": {"globalScale": 1.0, "meshCompression": "Medium", "readWriteEnabled": False, "optimizeMeshPolygons": True, "optimizeMeshVertices": True, "importBlendShapes": True, "importCameras": False, "importLights": False, "generateColliders": False, "importMaterials": False, "importAnimation": False},
    "prefab": {"rootObjectName": "ArenaProp", "prefabKind": "Regular", "unpackMode": "PreserveLinks", "missingScriptCount": 0, "autoSave": True},
    "material": {"shader": "Universal Render Pipeline/Lit", "renderPipeline": "URP", "materialMode": "PBR_TEXTURED", "workflowMode": "Metallic", "textureBindings": {"baseColor": {"resourceId": "asset.material-base-color", "address": "arena/material/base-color", "semantic": "BASE_COLOR"}, "normal": {"resourceId": "asset.material-normal", "address": "arena/material/normal", "semantic": "NORMAL"}, "metallicSmoothness": {"resourceId": "asset.material-metallic", "address": "arena/material/metallic", "semantic": "METALLIC_SMOOTHNESS"}, "ambientOcclusion": {"resourceId": "asset.material-ao", "address": "arena/material/ao", "semantic": "AMBIENT_OCCLUSION"}, "emission": {"resourceId": "asset.material-emission", "address": "arena/material/emission", "semantic": "EMISSION"}}, "enableInstancing": True, "doubleSidedGI": False, "renderQueue": -1},
    "audio": {"loadType": "CompressedInMemory", "compressionFormat": "Vorbis", "quality": 0.7, "sampleRateSetting": "OptimizeSampleRate", "forceToMono": False, "normalize": False, "preloadAudioData": True, "loadInBackground": False, "ambisonic": False},
    "font": {"fontType": "Dynamic", "characterSet": "Unicode", "includeFontData": True, "fontSize": 32, "renderMode": "HintedSmooth"},
    "animation": {"clipName": "Idle", "loopTime": True, "loopPose": True, "cycleOffset": 0.0, "rootMotion": False, "legacy": False},
    "vfx": {"rendererType": "VFXGraph", "simulationSpace": "World", "maxParticles": 1024, "prewarm": False, "playOnAwake": True},
    "ui": {"assetKind": "UIDocument", "referencePixelsPerUnit": 100, "raycastTarget": True, "preserveAspect": True, "addressable": True},
}

ASSET_SUFFIXES = {
    "sprite": ".png",
    "texture": ".png",
    "model": ".fbx",
    "prefab": ".prefab",
    "material": ".mat",
    "audio": ".ogg",
    "font": ".ttf",
    "animation": ".anim",
    "vfx": ".vfx",
    "ui": ".uxml",
}


def _sha256(path: Path) -> str:
    """计算测试文件哈希。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _registration_fixture(project: Path, asset_type: str = "sprite") -> tuple[Path, Path, dict[str, object]]:
    """创建可由单写者合并的 Toolkit 登记事实。"""
    suffix = ASSET_SUFFIXES[asset_type]
    source = project / "ArtSource" / "Generated" / "arena" / "processed" / f"{asset_type}{suffix}"
    asset = project / "Assets" / "Art" / "Runtime" / "Arena" / f"{asset_type}{suffix}"
    approval = project / "Artifacts" / "Approvals" / f"asset.{asset_type}.json"
    report = project / "Artifacts" / "Imports" / f"asset.{asset_type}.json"
    for path in (source, asset, approval, report):
        path.parent.mkdir(parents=True, exist_ok=True)
    asset_bytes = f"{asset_type}-bytes".encode()
    source.write_bytes(asset_bytes)
    asset.write_bytes(asset_bytes)
    approval.write_text("approved\n", encoding="utf-8")
    report.write_text("{}\n", encoding="utf-8")
    record = {
        "schemaVersion": "1.0",
        "recordId": f"registration.asset-{asset_type}.v1",
        "taskId": f"asset-task.{asset_type}",
        "resourceId": f"asset.{asset_type}",
        "module": "Visual.Arena",
        "type": asset_type,
        "purpose": f"{asset_type} 资源",
        "sourceVersion": "source-v1",
        "visualVersion": "visual-v1",
        "sourcePath": source.relative_to(project).as_posix(),
        "sourceSha256": _sha256(source),
        "assetPath": asset.relative_to(project).as_posix(),
        "address": f"arena/{asset_type}",
        "assetGuid": "b" * 32,
        "importer": copy.deepcopy(IMPORTERS[asset_type]),
        "approvalEvidencePaths": [approval.relative_to(project).as_posix()],
        "approvals": [{"approvalType": "GAME_VISUAL", "authority": "USER", "subjectId": f"asset-task.{asset_type}", "subjectVersion": "visual-v1", "approvedBy": "asset-owner", "approvedAtUtc": "2026-07-27T12:00:00Z", "evidencePath": approval.relative_to(project).as_posix(), "evidenceSha256": _sha256(approval)}],
        "importReportPath": report.relative_to(project).as_posix(),
        "status": "VALIDATED",
        "licenseStatus": "PENDING",
        "unityValidation": "PASS",
        "generatedAtUtc": "2026-07-27T12:00:00Z",
    }
    records = project / "Artifacts" / "AssetRegistry" / "records"
    records.mkdir(parents=True, exist_ok=True)
    (records / "record.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    register = project / "docs" / "asset-register.yaml"
    register.parent.mkdir(parents=True)
    payload = yaml.safe_load((ROOT / "templates" / "project-docs" / "asset-register.yaml").read_text(encoding="utf-8"))
    register.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return records, register, record


def _validated_asset(
    asset_id: str,
    asset_type: str,
    address: str,
    importer: dict[str, object],
    index: int,
) -> dict[str, object]:
    """创建满足登记基础契约的已验证资产，供跨资源语义测试使用。"""
    stem = asset_id.replace(".", "-")
    return {
        "id": asset_id,
        "type": asset_type,
        "purpose": f"{asset_type} 测试资源",
        "source": f"ArtSource/{stem}.asset",
        "sourceVersion": "source-v1",
        "visualVersion": "visual-v1",
        "sourceSha256": f"{index + 1:064x}",
        "path": f"Assets/Art/Runtime/{stem}.asset",
        "address": address,
        "guid": f"{index + 1:032x}",
        "importerReportPath": f"Artifacts/Imports/{stem}.json",
        "registrationRecordPath": f"Artifacts/AssetRegistry/{stem}.json",
        "importer": copy.deepcopy(importer),
        "status": "VALIDATED",
        "licenseStatus": "PENDING",
        "unityValidation": "PASS",
        "approvals": [],
        "evidence": [{"type": "asset-import-report", "path": f"Artifacts/Imports/{stem}.json", "sha256": f"{index + 101:064x}"}],
    }


def _pbr_texture_assets() -> list[dict[str, object]]:
    """生成与 PBR 五类通道语义和颜色空间匹配的纹理登记。"""
    settings = {
        "baseColor": ("Default", True),
        "normal": ("NormalMap", False),
        "metallicSmoothness": ("SingleChannel", False),
        "ambientOcclusion": ("SingleChannel", False),
        "emission": ("Default", True),
    }
    bindings = IMPORTERS["material"]["textureBindings"]
    assets = []
    for index, (channel, (texture_type, srgb)) in enumerate(settings.items()):
        binding = bindings[channel]
        importer = {**IMPORTERS["texture"], "textureType": texture_type, "sRgb": srgb}
        assets.append(_validated_asset(binding["resourceId"], "texture", binding["address"], importer, index))
    return assets


def _pbr_register() -> dict[str, object]:
    """创建包含完整纹理依赖与 PBR 材质的有效总登记。"""
    payload = yaml.safe_load((ROOT / "templates" / "project-docs" / "asset-register.yaml").read_text(encoding="utf-8"))
    payload["assets"] = _pbr_texture_assets()
    payload["assets"].append(_validated_asset("asset.material", "material", "arena/material", IMPORTERS["material"], 20))
    return payload


def test_merge_records_is_valid_idempotent_and_keeps_license_pending(tmp_path: Path) -> None:
    """合并器映射导入事实且重复执行不新增资源，也不自动批准许可证。"""
    records, register, _ = _registration_fixture(tmp_path)

    first = merge_registration_records(tmp_path, records, register)
    second = merge_registration_records(tmp_path, records, register)

    payload = yaml.safe_load(register.read_text(encoding="utf-8"))
    assert first == {"merged": 1, "unchanged": 0, "records": 1}
    assert second == {"merged": 0, "unchanged": 1, "records": 1}
    assert payload["assets"][0]["licenseStatus"] == "PENDING"
    assert payload["assets"][0]["importer"]["textureType"] == "Sprite"
    assert validate_contract("asset-register", payload) == []


def test_merge_records_rejects_same_resource_with_different_path(tmp_path: Path) -> None:
    """同一资源 ID 出现不同路径时必须拒绝，不能静默覆盖总登记。"""
    records, register, record = _registration_fixture(tmp_path)
    merge_registration_records(tmp_path, records, register)
    alternate = tmp_path / "Assets" / "Art" / "Runtime" / "Arena" / "other.png"
    alternate.write_bytes(b"sprite-bytes")
    record["recordId"] = "registration.asset-arena-background.v2"
    record["assetPath"] = alternate.relative_to(tmp_path).as_posix()
    (records / "record-2.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="不可变字段冲突"):
        merge_registration_records(tmp_path, records, register)


@pytest.mark.parametrize("asset_type", tuple(IMPORTERS))
def test_registration_record_accepts_each_typed_importer(tmp_path: Path, asset_type: str) -> None:
    """每种受支持资产都必须使用与自身类型匹配的完整导入设置。"""
    _, _, record = _registration_fixture(tmp_path / asset_type, asset_type)

    assert validate_contract("registration-record", record) == []


@pytest.mark.parametrize("asset_type", tuple(IMPORTERS))
def test_merge_preserves_each_typed_importer(tmp_path: Path, asset_type: str) -> None:
    """合并器必须原样保留每种类型化 importer，并产出有效总登记。"""
    project = tmp_path / asset_type
    records, register, _ = _registration_fixture(project, asset_type)
    if asset_type == "material":
        initial = yaml.safe_load(register.read_text(encoding="utf-8"))
        initial["assets"] = _pbr_texture_assets()
        register.write_text(yaml.safe_dump(initial, allow_unicode=True, sort_keys=False), encoding="utf-8")

    assert merge_registration_records(project, records, register)["merged"] == 1
    payload = yaml.safe_load(register.read_text(encoding="utf-8"))
    merged_asset = next(asset for asset in payload["assets"] if asset["id"] == f"asset.{asset_type}")
    assert merged_asset["type"] == asset_type
    assert merged_asset["importer"] == IMPORTERS[asset_type]
    assert validate_contract("asset-register", payload) == []


@pytest.mark.parametrize("asset_type", ("model", "prefab", "material", "audio", "font", "animation", "vfx", "ui"))
def test_typed_importer_rejects_texture_pollution(tmp_path: Path, asset_type: str) -> None:
    """非纹理资产的单条记录和总登记都不得混入 textureType 等纹理字段。"""
    project = tmp_path / asset_type
    _, _, record = _registration_fixture(project, asset_type)
    record["importer"] = {**IMPORTERS[asset_type], "textureType": "Default"}
    assert validate_contract("registration-record", record)

    register = yaml.safe_load((ROOT / "templates" / "project-docs" / "asset-register.yaml").read_text(encoding="utf-8"))
    register["assets"] = [{"id": record["resourceId"], "type": asset_type, "purpose": record["purpose"], "source": record["sourcePath"], "sourceVersion": record["sourceVersion"], "path": record["assetPath"], "address": record["address"], "importer": record["importer"], "status": "PLANNED", "licenseStatus": "PENDING", "unityValidation": "NOT_RUN", "approvals": [], "evidence": []}]
    assert validate_contract("asset-register", register)


def test_typed_importer_rejects_other_type_shape(tmp_path: Path) -> None:
    """资产 type 必须判别 importer 结构，完整的 Sprite 设置也不能用于模型。"""
    _, _, record = _registration_fixture(tmp_path, "model")
    record["importer"] = dict(IMPORTERS["sprite"])

    assert validate_contract("registration-record", record)


def test_material_importer_rejects_wrong_pbr_channel_semantic(tmp_path: Path) -> None:
    """材质贴图槽位必须绑定正确通道语义，避免法线图被登记为基础色。"""
    _, _, record = _registration_fixture(tmp_path, "material")
    record["importer"]["textureBindings"]["baseColor"]["semantic"] = "NORMAL"

    assert validate_contract("registration-record", record)


def test_pbr_material_register_resolves_all_validated_texture_bindings() -> None:
    """完整 PBR 材质必须解析到正确类型、状态、语义与颜色空间的纹理登记。"""
    assert validate_contract("asset-register", _pbr_register()) == []


def test_pbr_material_rejects_missing_required_binding() -> None:
    """PBR_TEXTURED 不能以空绑定或缺少四个核心通道冒充完整 PBR。"""
    payload = _pbr_register()
    payload["assets"][-1]["importer"]["textureBindings"].pop("ambientOcclusion")

    assert validate_contract("asset-register", payload)


def test_material_importer_rejects_non_urp_and_ambiguous_modes(tmp_path: Path) -> None:
    """材质必须固定 URP，并禁止 UNLIT/PROCEDURAL 携带不属于该模式的 PBR 设置。"""
    _, _, record = _registration_fixture(tmp_path, "material")
    record["importer"]["renderPipeline"] = "HDRP"
    assert validate_contract("registration-record", record)

    record["importer"] = {"shader": "Universal Render Pipeline/Unlit", "renderPipeline": "URP", "materialMode": "UNLIT", "workflowMode": "Metallic", "textureBindings": {"normal": IMPORTERS["material"]["textureBindings"]["normal"]}, "enableInstancing": True, "doubleSidedGI": False, "renderQueue": -1}
    assert validate_contract("registration-record", record)

    record["importer"] = {"shader": "Project/Procedural", "renderPipeline": "URP", "materialMode": "PROCEDURAL", "textureBindings": {"baseColor": IMPORTERS["material"]["textureBindings"]["baseColor"]}, "enableInstancing": True, "doubleSidedGI": False, "renderQueue": -1}
    assert validate_contract("registration-record", record)


@pytest.mark.parametrize(
    ("channel", "field", "value"),
    (
        ("baseColor", "sRgb", False),
        ("normal", "textureType", "Default"),
        ("metallicSmoothness", "sRgb", True),
        ("ambientOcclusion", "sRgb", True),
        ("emission", "sRgb", False),
    ),
)
def test_pbr_channels_reject_wrong_import_semantics(channel: str, field: str, value: object) -> None:
    """每个 PBR 通道都必须遵守自己的纹理类型与线性或 sRGB 颜色空间规则。"""
    payload = _pbr_register()
    resource_id = payload["assets"][-1]["importer"]["textureBindings"][channel]["resourceId"]
    target = next(asset for asset in payload["assets"] if asset["id"] == resource_id)
    target["importer"][field] = value

    assert any(
        issue.path.endswith(".resourceId")
        for issue in validate_contract("asset-register", payload)
    )


@pytest.mark.parametrize(
    ("mutation", "expected_path"),
    (
        ("missing", ".resourceId"),
        ("address", ".address"),
        ("unvalidated", ".resourceId"),
        ("wrong-type", ".resourceId"),
        ("semantic", ".semantic"),
        ("normal-importer", ".resourceId"),
        ("color-space", ".resourceId"),
    ),
)
def test_pbr_material_rejects_invalid_texture_resolution(mutation: str, expected_path: str) -> None:
    """材质绑定必须拒绝缺失、错址、未验证、错类型、错语义和错误导入设置。"""
    payload = _pbr_register()
    material = payload["assets"][-1]
    base_binding = material["importer"]["textureBindings"]["baseColor"]
    if mutation == "missing":
        base_binding["resourceId"] = "asset.missing"
    elif mutation == "address":
        base_binding["address"] = "arena/material/ao"
    elif mutation == "unvalidated":
        payload["assets"][0]["status"] = "BLOCKED"
        payload["assets"][0]["unityValidation"] = "BLOCKED"
    elif mutation == "wrong-type":
        payload["assets"][0]["type"] = "model"
        payload["assets"][0]["importer"] = copy.deepcopy(IMPORTERS["model"])
    elif mutation == "semantic":
        base_binding["semantic"] = "NORMAL"
    elif mutation == "normal-importer":
        payload["assets"][1]["importer"]["textureType"] = "Default"
    else:
        payload["assets"][0]["importer"]["sRgb"] = False

    issues = validate_contract("asset-register", payload)
    assert any(issue.path.endswith(expected_path) for issue in issues)


@pytest.mark.parametrize(
    "importer",
    (
        {"shader": "Universal Render Pipeline/Unlit", "renderPipeline": "URP", "materialMode": "UNLIT", "textureBindings": {}, "enableInstancing": True, "doubleSidedGI": False, "renderQueue": -1},
        {"shader": "Project/Procedural", "renderPipeline": "URP", "materialMode": "PROCEDURAL", "textureBindings": {}, "enableInstancing": True, "doubleSidedGI": False, "renderQueue": -1},
    ),
)
def test_material_non_pbr_modes_are_explicit_and_valid(importer: dict[str, object]) -> None:
    """UNLIT 与 PROCEDURAL 必须以明确模式登记，且不能被误判为纹理 PBR。"""
    payload = _pbr_register()
    payload["assets"][-1]["importer"] = importer

    assert validate_contract("asset-register", payload) == []


@pytest.mark.parametrize("field", ("type", "importer"))
def test_merge_rejects_typed_importer_identity_change(tmp_path: Path, field: str) -> None:
    """同一资源 ID 的资产类型或 importer 变化必须作为不可变事实冲突拒绝。"""
    records, register, record = _registration_fixture(tmp_path)
    merge_registration_records(tmp_path, records, register)
    record["recordId"] = "registration.asset-sprite.v2"
    if field == "type":
        record["type"] = "model"
        record["importer"] = dict(IMPORTERS["model"])
    else:
        record["importer"] = {**IMPORTERS["sprite"], "filterMode": "Point"}
    (records / "record-2.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match=field):
        merge_registration_records(tmp_path, records, register)
