#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["jsonschema>=4.25,<5", "PyYAML>=6.0,<7"]
# ///
"""审计 P3-002 人物完整候选的技术文件和逐项证据门禁。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker


TARGET_RELATIVE_PATH = Path(
    "Artifacts/Visual/P4/g1-v0.6/p3-002/v5/target-board/p3-002-v5-neutral-target-r3.png"
)
TARGET_SHA256 = "3c4da040649bd6f3a52dbd9ee423493ccd063b32619ed25a34a29334bbfb5ce6"
EXPECTED_LAYERS = (
    ("Hair/Back", "curls-dark-back-v2", "hair-back-curls-dark-v2.png"),
    ("Body/Base", "skin-warm-medium-v2", "body-base-skin-warm-medium-v2.png"),
    ("Outfit/Bottom", "ivory-wide-leg-v2", "outfit-bottom-ivory-wide-leg-v2.png"),
    ("Shoes", "white-sneakers-v2", "shoes-white-sneakers-v2.png"),
    ("Outfit/Top", "creator-blue-jacket-cream-top-v2", "outfit-top-creator-blue-jacket-cream-top-v2.png"),
    ("Hair/Front", "curls-dark-front-v2", "hair-front-curls-dark-v2.png"),
    ("Face/Brows", "neutral-v2", "face-brows-neutral-v2.png"),
    ("Face/Brows", "raised-v2", "face-brows-raised-v2.png"),
    ("Face/Eyes", "open-brown-v2", "face-eyes-open-brown-v2.png"),
    ("Face/Eyes", "blink-v2", "face-eyes-blink-v2.png"),
    ("Face/Nose", "natural-medium-v2", "face-nose-natural-medium-v2.png"),
    ("Face/Mouth", "neutral-rose-v2", "face-mouth-neutral-rose-v2.png"),
    ("Face/Mouth", "smile-v2", "face-mouth-smile-v2.png"),
    ("Face/Mouth", "open-v2", "face-mouth-open-v2.png"),
    ("Face/Mouth", "frown-v2", "face-mouth-frown-v2.png"),
    ("Accessory/Necklace", "simple-chain-v2", "accessory-necklace-simple-chain-v2.png"),
    ("Accessory/Earrings", "simple-hoops-v2", "accessory-earrings-simple-hoops-v2.png"),
)
EXPECTED_LAYER_FILES = tuple(layer[2] for layer in EXPECTED_LAYERS)
REQUIRED_EVIDENCE_KEYS = (
    "layerPreview",
    "fullComposite",
    "threeBackgrounds",
    "targetDetailComparison",
    "occlusionLeak",
)
EXPECTED_COMPARISON_CHECK_IDS = (
    "authority.target-binding",
    "authority.approval-binding",
    "project.unity-root",
    "layers.runtime-set",
    "import.sprite-settings",
    "sprite-library.mapping",
    "sprite-atlas.membership",
    "prefab.references",
)
EXPECTED_VISUAL_REGION_IDS = (
    "full-body",
    "face",
    "hair",
    "shoulders-chest",
    "hands",
    "waist-hips",
    "pants-shoes",
)
EXPECTED_VISUAL_STATE_IDS = (
    "neutral",
    "smile",
    "speaking",
    "frown",
    "blink",
    "raised-brows",
    "accessories-on",
    "accessories-off",
)
EXPECTED_PROJECT_MARKERS = {
    "packagesManifest": "Packages/manifest.json",
    "projectVersion": "ProjectSettings/ProjectVersion.txt",
}
EXPECTED_RUNTIME_ASSET_PATHS = {
    "spriteLibrary": "Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteLib",
    "spriteAtlas": "Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteatlasv2",
    "playerPrefab": "Assets/Prefabs/Characters/Player/PlayerCharacter.prefab",
    "performancePrefab": "Assets/Prefabs/Characters/Performance/DualCharacterPerformance.prefab",
}
COMPARISON_SCHEMA_PATH = Path(__file__).parents[1] / "schemas" / "project-comparison.schema.json"


def parse_args() -> argparse.Namespace:
    """解析工作区、项目基线、生产图层、逐项记录和可选报告路径。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--layers", required=True, type=Path)
    parser.add_argument("--reviews", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def sha256(path: Path) -> str:
    """计算文件 SHA-256，避免读取摘要文件代替真实内容。"""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve_inside(workspace: Path, value: str | Path) -> Path:
    """解析工作区内路径，并拒绝绝对路径或符号链接逃逸。"""
    raw = Path(value)
    candidate = (raw if raw.is_absolute() else workspace / raw).resolve()
    if candidate != workspace and workspace not in candidate.parents:
        raise ValueError(f"路径越出工作区：{value}")
    return candidate


def inspect_png(path: Path) -> dict[str, int]:
    """直接读取 PNG IHDR，核对画布、位深和 RGBA 色彩类型。"""
    header = path.read_bytes()[:33]
    if len(header) < 33 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("不是有效 PNG 文件")
    length = struct.unpack(">I", header[8:12])[0]
    if length != 13 or header[12:16] != b"IHDR":
        raise ValueError("PNG 缺少标准 IHDR")
    width, height, bit_depth, color_type = struct.unpack(">IIBB", header[16:26])
    return {
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colorType": color_type,
    }


def read_yaml_mapping(path: Path) -> dict[str, Any]:
    """读取 YAML 映射，拒绝空文件和非映射根节点。"""
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("逐项记录根节点必须是映射")
    return payload


def format_json_path(parts: Any) -> str:
    """把 jsonschema 路径格式化成稳定且易定位的字段路径。"""
    result = "$"
    for part in parts:
        result += f"[{part}]" if isinstance(part, int) else f".{part}"
    return result


def validate_expected_ids(
    items: Any,
    key: str,
    expected: tuple[str, ...],
    label: str,
    errors: list[str],
) -> None:
    """要求规范化对照项完整、唯一并保持合同顺序。"""
    if not isinstance(items, list):
        errors.append(f"{label} 必须是列表")
        return
    actual = tuple(item.get(key) for item in items if isinstance(item, dict))
    if actual != expected:
        errors.append(f"{label} 必须严格等于：{', '.join(expected)}")


def validate_all_bindings(
    workspace: Path,
    value: Any,
    label: str,
    errors: list[str],
) -> None:
    """递归重算基线内全部文件绑定，防止对照记录在项目变化后继续生效。"""
    if isinstance(value, dict):
        if set(value) == {"path", "sha256"}:
            validate_binding(workspace, value, label, errors)
            return
        for key, nested in value.items():
            validate_all_bindings(workspace, nested, f"{label}.{key}", errors)
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            validate_all_bindings(workspace, nested, f"{label}[{index}]", errors)


def read_unity_guid(meta_path: Path) -> str | None:
    """读取 Unity meta 的稳定 GUID；格式异常时返回空值交由调用者阻断。"""
    match = re.search(
        r"^guid:\s*([0-9a-f]{32})\s*$",
        meta_path.read_text(encoding="utf-8"),
        flags=re.MULTILINE,
    )
    return match.group(1) if match is not None else None


def validate_unity_guid(
    workspace: Path,
    payload: dict[str, Any],
    label: str,
    errors: list[str],
) -> None:
    """核对记录 GUID 与真实 meta，避免只比较文件名却丢失 Unity 身份。"""
    meta = payload.get("meta")
    expected_guid = payload.get("guid")
    if not isinstance(meta, dict) or not isinstance(meta.get("path"), str):
        errors.append(f"{label} 缺少 meta 路径")
        return
    try:
        meta_path = resolve_inside(workspace, meta["path"])
    except ValueError as exc:
        errors.append(f"{label}: {exc}")
        return
    if not meta_path.is_file():
        return
    try:
        actual_guid = read_unity_guid(meta_path)
    except (OSError, UnicodeError) as exc:
        errors.append(f"{label} 无法读取 GUID：{exc}")
        return
    if actual_guid != expected_guid:
        errors.append(f"{label} GUID 与 meta 不一致")


def validate_project_baseline(
    workspace: Path,
    baseline_path: Path,
    errors: list[str],
) -> dict[str, Any] | None:
    """校验当前项目基线的 Schema、固定矩阵、文件哈希、GUID 和汇总结论。"""
    if not baseline_path.is_file():
        errors.append(f"项目基线不存在：{baseline_path}")
        return None
    try:
        payload = read_yaml_mapping(baseline_path)
        schema = json.loads(COMPARISON_SCHEMA_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError, ValueError) as exc:
        errors.append(f"无法读取项目基线或 Schema：{exc}")
        return None

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    schema_errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.path))
    for error in schema_errors:
        errors.append(f"项目基线 {format_json_path(error.path)}: {error.message}")
    if schema_errors:
        return payload

    target = payload["authorityBindings"]["target"]
    if target["path"] != TARGET_RELATIVE_PATH.as_posix() or target["sha256"] != TARGET_SHA256:
        errors.append("项目基线目标绑定与人物合同不一致")
    visual_target = payload["visualComparison"]["target"]
    if visual_target != target:
        errors.append("视觉对照目标必须复用同一权威绑定")

    layer_values = tuple(
        (item["category"], item["label"], item["filename"])
        for item in payload["layerMappings"]
    )
    if layer_values != EXPECTED_LAYERS:
        errors.append("项目基线的 17 项类别、标签或文件顺序与人物合同不一致")
    for mapping in payload["layerMappings"]:
        expected_runtime = f"Assets/Art/Runtime/Characters/Player/Sprites/{mapping['filename']}"
        if mapping["runtime"]["path"] != expected_runtime:
            errors.append(f"运行时图层路径与人物合同不一致：{mapping['filename']}")
        if mapping["meta"]["path"] != f"{expected_runtime}.meta":
            errors.append(f"运行时图层 meta 路径与人物合同不一致：{mapping['filename']}")

    for name, expected_path in EXPECTED_PROJECT_MARKERS.items():
        if payload["projectMarkers"][name]["path"] != expected_path:
            errors.append(f"项目根标记路径不规范：{name}")
    for name, expected_path in EXPECTED_RUNTIME_ASSET_PATHS.items():
        asset = payload["runtimeAssets"][name]
        if asset["asset"]["path"] != expected_path or asset["meta"]["path"] != f"{expected_path}.meta":
            errors.append(f"Unity 运行时资产路径与人物合同不一致：{name}")

    all_guids = [item["guid"] for item in payload["layerMappings"]]
    all_guids.extend(asset["guid"] for asset in payload["runtimeAssets"].values())
    if len(all_guids) != len(set(all_guids)):
        errors.append("项目基线包含重复 Unity GUID")

    validate_expected_ids(
        payload["checks"], "checkId", EXPECTED_COMPARISON_CHECK_IDS, "项目检查 ID", errors
    )
    validate_expected_ids(
        payload["visualComparison"]["regions"],
        "id",
        EXPECTED_VISUAL_REGION_IDS,
        "视觉区域 ID",
        errors,
    )
    validate_expected_ids(
        payload["visualComparison"]["states"],
        "id",
        EXPECTED_VISUAL_STATE_IDS,
        "视觉状态 ID",
        errors,
    )

    comparison_items = [
        *payload["checks"],
        *payload["visualComparison"]["regions"],
        *payload["visualComparison"]["states"],
    ]
    statuses = {item["status"] for item in comparison_items}
    if statuses & {"MISSING", "UNREADABLE"}:
        expected_result = "BLOCKED"
        expected_status = "BLOCKED"
    elif "DIFFERENT" in statuses:
        expected_result = "DIFFERENCES_FOUND"
        expected_status = "BASELINE_AUDITED"
    else:
        expected_result = "MATCHED"
        expected_status = "BASELINE_AUDITED"
    if payload["summary"]["result"] != expected_result or payload["status"] != expected_status:
        errors.append("项目基线汇总结论与逐项状态不一致")
    if expected_result == "BLOCKED" and not payload["summary"]["blockingReasons"]:
        errors.append("阻断基线必须记录 blockingReasons")
    if expected_result == "BLOCKED":
        errors.append("项目基线仍有 MISSING 或 UNREADABLE，禁止进入候选审计")

    validate_all_bindings(workspace, payload, "项目基线", errors)
    for index, mapping in enumerate(payload["layerMappings"]):
        validate_unity_guid(workspace, mapping, f"layerMappings[{index}]", errors)
    for name, asset in payload["runtimeAssets"].items():
        validate_unity_guid(workspace, asset, f"runtimeAssets.{name}", errors)
    return payload


def extract_path(value: Any) -> str | None:
    """兼容纯路径字符串和包含 path 字段的绑定对象。"""
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and isinstance(value.get("path"), str):
        return value["path"]
    return None


def validate_binding(
    workspace: Path,
    binding: Any,
    label: str,
    errors: list[str],
) -> Path | None:
    """验证路径与哈希绑定，并返回已解析文件。"""
    if not isinstance(binding, dict):
        errors.append(f"{label} 必须包含 path 和 sha256")
        return None
    path_value = binding.get("path")
    expected_hash = binding.get("sha256")
    if not isinstance(path_value, str) or not isinstance(expected_hash, str):
        errors.append(f"{label} 缺少 path 或 sha256")
        return None
    try:
        path = resolve_inside(workspace, path_value)
    except ValueError as exc:
        errors.append(f"{label}: {exc}")
        return None
    if not path.is_file():
        errors.append(f"{label} 文件不存在：{path_value}")
        return None
    actual_hash = sha256(path)
    if actual_hash != expected_hash.lower():
        errors.append(f"{label} 哈希不一致：{path_value}")
    return path


def collect_review_records(review_root: Path, errors: list[str]) -> list[tuple[Path, dict[str, Any]]]:
    """收集显式标记为人物逐项审查的 YAML 记录。"""
    records: list[tuple[Path, dict[str, Any]]] = []
    if not review_root.is_dir():
        errors.append(f"逐项审查目录不存在：{review_root}")
        return records
    for path in sorted((*review_root.rglob("*.yaml"), *review_root.rglob("*.yml"))):
        try:
            payload = read_yaml_mapping(path)
        except (OSError, UnicodeError, yaml.YAMLError, ValueError) as exc:
            errors.append(f"无法读取逐项记录 {path}: {exc}")
            continue
        if payload.get("recordType") == "CHARACTER_LAYER_ITEM_REVIEW":
            records.append((path, payload))
    return records


def validate_review_record(
    workspace: Path,
    record_path: Path,
    payload: dict[str, Any],
    errors: list[str],
) -> str | None:
    """验证一份逐项记录并返回其输出文件名。"""
    prefix = record_path.as_posix()
    if payload.get("status") != "ITEM_VISUAL_TECHNICAL_PASS":
        errors.append(f"{prefix} 状态不是 ITEM_VISUAL_TECHNICAL_PASS")

    validate_binding(workspace, payload.get("master"), f"{prefix} master", errors)
    output_path = validate_binding(workspace, payload.get("output"), f"{prefix} output", errors)

    evidence = payload.get("evidence")
    if not isinstance(evidence, dict):
        errors.append(f"{prefix} 缺少 evidence 映射")
    else:
        for key in REQUIRED_EVIDENCE_KEYS:
            path_value = extract_path(evidence.get(key))
            if path_value is None:
                errors.append(f"{prefix} 缺少证据 {key}")
                continue
            try:
                evidence_path = resolve_inside(workspace, path_value)
            except ValueError as exc:
                errors.append(f"{prefix} {key}: {exc}")
                continue
            if not evidence_path.is_file():
                errors.append(f"{prefix} 证据不存在 {key}: {path_value}")

    reviews = payload.get("reviews")
    if not isinstance(reviews, dict):
        errors.append(f"{prefix} 缺少 reviews 映射")
    else:
        for discipline in ("visual", "technical", "ux"):
            if reviews.get(discipline) != "PASS":
                errors.append(f"{prefix} {discipline} 未通过")

    category = payload.get("category")
    label = payload.get("label")
    if not isinstance(category, str) or not isinstance(label, str):
        errors.append(f"{prefix} 缺少 category 或 label")

    return output_path.name if output_path is not None else None


def audit(args: argparse.Namespace) -> dict[str, Any]:
    """执行目标、17 张图层和逐项审查证据的确定性审计。"""
    workspace = args.workspace.resolve()
    errors: list[str] = []
    layer_results: list[dict[str, Any]] = []

    if not workspace.is_dir() or workspace == workspace.parent:
        raise ValueError(f"工作区无效：{workspace}")

    baseline_path = resolve_inside(workspace, args.baseline)
    baseline = validate_project_baseline(workspace, baseline_path, errors)

    target = resolve_inside(workspace, TARGET_RELATIVE_PATH)
    if not target.is_file():
        errors.append(f"批准目标不存在：{TARGET_RELATIVE_PATH.as_posix()}")
    elif sha256(target) != TARGET_SHA256:
        errors.append("批准目标哈希变化，必须重新绑定用户批准")

    layer_root = resolve_inside(workspace, args.layers)
    if not layer_root.is_dir():
        errors.append(f"生产图层目录不存在：{layer_root}")
    else:
        for filename in EXPECTED_LAYER_FILES:
            path = layer_root / filename
            result: dict[str, Any] = {"filename": filename, "path": path.as_posix()}
            if not path.is_file():
                errors.append(f"缺少生产图层：{filename}")
                result["status"] = "MISSING"
                layer_results.append(result)
                continue
            try:
                png = inspect_png(path)
            except (OSError, ValueError, struct.error) as exc:
                errors.append(f"PNG 无效 {filename}: {exc}")
                result["status"] = "INVALID"
                layer_results.append(result)
                continue
            result.update(png)
            result["sha256"] = sha256(path)
            result["status"] = "PASS"
            if (png["width"], png["height"]) != (2048, 2048):
                errors.append(f"画布不是 2048x2048：{filename}")
                result["status"] = "FAIL"
            if png["bitDepth"] != 8 or png["colorType"] != 6:
                errors.append(f"PNG 不是 8-bit RGBA：{filename}")
                result["status"] = "FAIL"
            layer_results.append(result)

    review_root = resolve_inside(workspace, args.reviews)
    records = collect_review_records(review_root, errors)
    reviewed_outputs: list[str] = []
    for record_path, payload in records:
        output_name = validate_review_record(workspace, record_path, payload, errors)
        if output_name is not None:
            reviewed_outputs.append(output_name)

    duplicates = sorted({name for name in reviewed_outputs if reviewed_outputs.count(name) > 1})
    if duplicates:
        errors.append(f"逐项记录重复绑定输出：{', '.join(duplicates)}")
    missing_reviews = sorted(set(EXPECTED_LAYER_FILES) - set(reviewed_outputs))
    unexpected_reviews = sorted(set(reviewed_outputs) - set(EXPECTED_LAYER_FILES))
    if missing_reviews:
        errors.append(f"缺少逐项审查：{', '.join(missing_reviews)}")
    if unexpected_reviews:
        errors.append(f"存在未知输出审查：{', '.join(unexpected_reviews)}")

    return {
        "schemaVersion": "1.0",
        "status": "FAIL" if errors else "EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_STILL_REQUIRED",
        "workspace": workspace.as_posix(),
        "projectBaseline": baseline_path.as_posix(),
        "projectBaselineResult": baseline.get("summary", {}).get("result") if baseline else None,
        "target": TARGET_RELATIVE_PATH.as_posix(),
        "expectedLayerCount": len(EXPECTED_LAYER_FILES),
        "reviewRecordCount": len(records),
        "layers": layer_results,
        "errors": errors,
    }


def main() -> None:
    """运行审计、输出 JSON，并在阻断项存在时返回非零退出码。"""
    args = parse_args()
    try:
        result = audit(args)
    except (OSError, ValueError) as exc:
        result = {"schemaVersion": "1.0", "status": "FAIL", "errors": [str(exc)]}
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    if result["status"] == "FAIL":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
