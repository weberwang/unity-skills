"""校验 Unity 资源登记中无法由 JSON Schema 表达的跨资产关系。"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any


IssueFactory = Callable[[str, str], Any]

_PBR_CHANNEL_RULES = {
    "baseColor": ("BASE_COLOR", True, {"Default"}),
    "normal": ("NORMAL", False, {"NormalMap"}),
    "metallicSmoothness": ("METALLIC_SMOOTHNESS", False, {"Default", "SingleChannel"}),
    "ambientOcclusion": ("AMBIENT_OCCLUSION", False, {"Default", "SingleChannel"}),
    "emission": ("EMISSION", True, {"Default"}),
}


def asset_register_binding_issues(
    payload: Mapping[str, Any], issue_factory: IssueFactory
) -> list[Any]:
    """严格解析材质贴图绑定，并校验目标纹理的类型、状态和导入语义。"""
    assets = payload.get("assets")
    if not isinstance(assets, Sequence) or isinstance(assets, (str, bytes)):
        return []

    indexed_assets = [
        (index, asset)
        for index, asset in enumerate(assets)
        if isinstance(asset, Mapping)
    ]
    by_id = _index_assets(indexed_assets, "id")
    by_address = _index_assets(indexed_assets, "address")
    issues: list[Any] = []
    for material_index, material in indexed_assets:
        if material.get("type") != "material":
            continue
        importer = material.get("importer")
        bindings = importer.get("textureBindings") if isinstance(importer, Mapping) else None
        if not isinstance(bindings, Mapping):
            continue
        for channel, binding in bindings.items():
            if not isinstance(channel, str) or not isinstance(binding, Mapping):
                continue
            issues.extend(
                _binding_issues(
                    material_index,
                    channel,
                    binding,
                    by_id,
                    by_address,
                    issue_factory,
                )
            )
    return issues


def _index_assets(
    indexed_assets: Sequence[tuple[int, Mapping[str, Any]]], field: str
) -> dict[str, list[tuple[int, Mapping[str, Any]]]]:
    """按登记字段建立保留重复项的索引，使引用解析必须得到唯一结果。"""
    result: dict[str, list[tuple[int, Mapping[str, Any]]]] = {}
    for index, asset in indexed_assets:
        value = asset.get(field)
        if isinstance(value, str):
            result.setdefault(value, []).append((index, asset))
    return result


def _binding_issues(
    material_index: int,
    channel: str,
    binding: Mapping[str, Any],
    by_id: Mapping[str, list[tuple[int, Mapping[str, Any]]]],
    by_address: Mapping[str, list[tuple[int, Mapping[str, Any]]]],
    issue_factory: IssueFactory,
) -> list[Any]:
    """验证单个材质通道引用，并将错误稳定定位到绑定字段。"""
    path = f"$.assets[{material_index}].importer.textureBindings.{channel}"
    resource_id = binding.get("resourceId")
    address = binding.get("address")
    id_matches = by_id.get(resource_id, []) if isinstance(resource_id, str) else []
    address_matches = by_address.get(address, []) if isinstance(address, str) else []
    issues: list[Any] = []
    if len(id_matches) != 1:
        issues.append(issue_factory(f"{path}.resourceId", "材质贴图 resourceId 必须唯一解析到总登记资产"))
    if len(address_matches) != 1:
        issues.append(issue_factory(f"{path}.address", "材质贴图 address 必须唯一解析到总登记资产"))
    if len(id_matches) != 1 or len(address_matches) != 1:
        return issues
    target_index, target = id_matches[0]
    if address_matches[0][0] != target_index:
        issues.append(issue_factory(f"{path}.address", "材质贴图 resourceId 与 address 必须解析到同一资产"))
        return issues

    if target.get("type") != "texture":
        issues.append(issue_factory(f"{path}.resourceId", "材质贴图必须引用 texture 资产"))
        return issues
    if target.get("status") != "VALIDATED" or target.get("unityValidation") != "PASS":
        issues.append(issue_factory(f"{path}.resourceId", "材质贴图必须完成 VALIDATED 与 Unity PASS"))
    issues.extend(_texture_semantic_issues(path, channel, binding, target, issue_factory))
    return issues


def _texture_semantic_issues(
    path: str,
    channel: str,
    binding: Mapping[str, Any],
    target: Mapping[str, Any],
    issue_factory: IssueFactory,
) -> list[Any]:
    """按 PBR 通道检查绑定语义、TextureImporter 类型和颜色空间。"""
    rule = _PBR_CHANNEL_RULES.get(channel)
    if rule is None:
        return []
    expected_semantic, expected_srgb, allowed_texture_types = rule
    issues: list[Any] = []
    if binding.get("semantic") != expected_semantic:
        issues.append(issue_factory(f"{path}.semantic", f"{channel} 通道语义必须是 {expected_semantic}"))
    importer = target.get("importer")
    if not isinstance(importer, Mapping):
        issues.append(issue_factory(f"{path}.resourceId", "被引用纹理缺少类型化 importer"))
        return issues
    if importer.get("textureType") not in allowed_texture_types:
        allowed = "、".join(sorted(allowed_texture_types))
        issues.append(issue_factory(f"{path}.resourceId", f"{channel} 纹理 textureType 必须是 {allowed}"))
    if importer.get("sRgb") is not expected_srgb:
        expected = "true" if expected_srgb else "false"
        issues.append(issue_factory(f"{path}.resourceId", f"{channel} 纹理 sRgb 必须是 {expected}"))
    return issues
