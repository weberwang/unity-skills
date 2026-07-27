from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
import yaml

from unity_workflow.asset_registry import merge_registration_records
from unity_workflow.contracts import validate_contract


ROOT = Path(__file__).parents[2] / "unity-development-workflow"


def _sha256(path: Path) -> str:
    """计算测试文件哈希。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _registration_fixture(project: Path) -> tuple[Path, Path, dict[str, object]]:
    """创建可由单写者合并的 Toolkit 登记事实。"""
    source = project / "ArtSource" / "Generated" / "arena" / "processed" / "background.png"
    asset = project / "Assets" / "Art" / "Runtime" / "Arena" / "background.png"
    approval = project / "Artifacts" / "Approvals" / "image.arena-background.json"
    report = project / "Artifacts" / "Imports" / "image.arena-background.json"
    for path in (source, asset, approval, report):
        path.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(b"png-bytes")
    asset.write_bytes(b"png-bytes")
    approval.write_text("approved\n", encoding="utf-8")
    report.write_text("{}\n", encoding="utf-8")
    record = {
        "schemaVersion": "1.0",
        "recordId": "registration.asset-arena-background.v1",
        "taskId": "image.arena-background",
        "resourceId": "asset.arena-background",
        "module": "Visual.Arena",
        "type": "sprite",
        "purpose": "竞技场背景",
        "sourceVersion": "source-v1",
        "visualVersion": "visual-v1",
        "sourcePath": source.relative_to(project).as_posix(),
        "sourceSha256": _sha256(source),
        "assetPath": asset.relative_to(project).as_posix(),
        "address": "arena/background",
        "assetGuid": "b" * 32,
        "importer": {"textureType": "Sprite", "spriteMode": "Single", "pixelsPerUnit": 100, "filterMode": "Bilinear", "wrapMode": "Clamp", "maxSize": 2048, "compression": "Uncompressed", "sRgb": True, "alphaIsTransparency": True, "mipmaps": False, "readWriteEnabled": False},
        "approvalEvidencePaths": [approval.relative_to(project).as_posix()],
        "approvals": [{"approvalType": "GAME_VISUAL", "authority": "USER", "subjectId": "image.arena-background", "subjectVersion": "visual-v1", "approvedBy": "visual-owner", "approvedAtUtc": "2026-07-27T12:00:00Z", "evidencePath": approval.relative_to(project).as_posix(), "evidenceSha256": _sha256(approval)}],
        "importReportPath": report.relative_to(project).as_posix(),
        "status": "VALIDATED",
        "licenseStatus": "PENDING",
        "unityValidation": "PASS",
        "generatedAtUtc": "2026-07-27T12:00:00Z",
    }
    records = project / "Artifacts" / "AssetRegistry" / "records"
    records.mkdir(parents=True)
    (records / "record.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
    register = project / "docs" / "asset-register.yaml"
    register.parent.mkdir(parents=True)
    payload = yaml.safe_load((ROOT / "templates" / "project-docs" / "asset-register.yaml").read_text(encoding="utf-8"))
    register.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return records, register, record


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
    alternate.write_bytes(b"png-bytes")
    record["recordId"] = "registration.asset-arena-background.v2"
    record["assetPath"] = alternate.relative_to(tmp_path).as_posix()
    (records / "record-2.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(ValueError, match="不可变字段冲突"):
        merge_registration_records(tmp_path, records, register)
