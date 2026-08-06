#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["jsonschema>=4.25,<5", "PyYAML>=6.0,<7"]
# ///
"""验证 P3-002 Unity 2D 骨骼系统的结构与跨模块约束。"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker


SCHEMA_PATH = (
    Path(__file__).parents[1]
    / "schemas"
    / "player-character-2d-skeletal-system.schema.json"
)
REQUIRED_CRITICAL_EVENTS = {
    "HITBOX_ON",
    "HITBOX_OFF",
    "PROJECTILE_SPAWN",
    "COMBO_WINDOW",
    "INVULNERABILITY_WINDOW",
    "ACTION_COMPLETE",
}
REQUIRED_TRANSITION_CLASSES = {"LOCOMOTION", "ATTACK", "HIT_REACTION"}


def parse_args() -> argparse.Namespace:
    """解析系统规格与可选报告路径。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def load_mapping(path: Path) -> dict[str, Any]:
    """读取 YAML 或 JSON，并拒绝空文件和非对象根节点。"""
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("骨骼系统规格根节点必须是映射")
    return payload


def format_json_path(parts: Any) -> str:
    """把 jsonschema 路径转换为稳定 JSONPath。"""
    result = "$"
    for part in parts:
        result += f"[{part}]" if isinstance(part, int) else f".{part}"
    return result


def require_unique_ids(
    values: list[dict[str, Any]],
    path: str,
    errors: list[str],
) -> None:
    """要求对象数组中的 ID 唯一，避免运行时映射互相覆盖。"""
    ids = [value["id"] for value in values]
    if len(ids) != len(set(ids)):
        errors.append(f"{path}: ID 必须唯一")


def validate_rig_and_rendering(payload: dict[str, Any], errors: list[str]) -> None:
    """校验根节点职责隔离、挂点和稳定排序带。"""
    rig = payload["rig"]
    roots = {rig["rootBone"], rig["visualRoot"], rig["facingRoot"]}
    if len(roots) != 3:
        errors.append("$.rig: 根骨、视觉根和翻转根必须是三个独立节点")
    if not rig["facingRoot"].startswith(f"{rig['visualRoot']}/"):
        errors.append("$.rig.facingRoot: 翻转根必须位于视觉根之下")
    require_unique_ids(rig["attachmentBones"], "$.rig.attachmentBones", errors)

    bands = payload["rendering"]["sortingBands"]
    require_unique_ids(bands, "$.rendering.sortingBands", errors)
    orders = [band["order"] for band in bands]
    if orders != sorted(orders) or len(orders) != len(set(orders)):
        errors.append("$.rendering.sortingBands: 排序值必须唯一且严格递增")
    require_unique_ids(payload["rendering"]["dynamicRules"], "$.rendering.dynamicRules", errors)


def validate_skinning_and_ik(payload: dict[str, Any], errors: list[str]) -> None:
    """校验蒙皮预算、IK 链覆盖、求解顺序和双手主从关系。"""
    skinning = payload["skinning"]
    performance = payload["performance"]
    if performance["maxSkinnedVerticesPerCharacter"] > skinning["maxVerticesPerCharacter"]:
        errors.append("$.performance.maxSkinnedVerticesPerCharacter: 性能预算不得超过蒙皮总顶点上限")

    chains = payload["ik"]["chains"]
    require_unique_ids(chains, "$.ik.chains", errors)
    effectors = [chain["endEffector"] for chain in chains]
    if len(effectors) != len(set(effectors)):
        errors.append("$.ik.chains: 每个效应器只能由一条主 IK 链负责")
    enabled_foot_chains = {
        chain["endEffector"]
        for chain in chains
        if chain["enabled"] and chain["purpose"] == "FOOT_GROUNDING"
    }
    if enabled_foot_chains != {"Foot.L", "Foot.R"}:
        errors.append("$.ik.chains: 必须为左右脚各提供一条启用的贴地链")

    two_hand = payload["ik"]["twoHandConstraint"]
    if two_hand["enabled"] and two_hand["primaryHand"] == two_hand["secondaryHand"]:
        errors.append("$.ik.twoHandConstraint: 主手和副手不得相同")

    enabled_constraints = sum(1 for chain in chains if chain["enabled"])
    if enabled_constraints > performance["maxActiveConstraintsPerCharacter"]:
        errors.append("$.performance.maxActiveConstraintsPerCharacter: 小于已启用 IK 约束数量")


def validate_animation_control(payload: dict[str, Any], errors: list[str]) -> None:
    """校验状态分层、步幅速度公式和逐类过渡策略。"""
    control = payload["animationControl"]
    layers = control["layers"]
    require_unique_ids(layers, "$.animationControl.layers", errors)
    base_layers = [layer for layer in layers if layer["role"] == "BASE"]
    if len(base_layers) != 1 or not math.isclose(base_layers[0]["weight"], 1.0, abs_tol=1e-6):
        errors.append("$.animationControl.layers: 必须只有一个权重为 1 的基础层")

    locomotion = control["locomotion"]
    calculated_speed = locomotion["strideLengthUnits"] / locomotion["cycleSeconds"]
    if not math.isclose(
        calculated_speed,
        locomotion["expectedSpeedUnitsPerSecond"],
        rel_tol=0.0,
        abs_tol=1e-6,
    ):
        errors.append("$.animationControl.locomotion: 期望速度必须等于步幅除以循环时长")

    profiles = control["transitionProfiles"]
    require_unique_ids(profiles, "$.animationControl.transitionProfiles", errors)
    profile_classes = {profile["class"] for profile in profiles}
    if not REQUIRED_TRANSITION_CLASSES.issubset(profile_classes):
        errors.append("$.animationControl.transitionProfiles: 缺少移动、攻击或受击过渡策略")
    durations = {profile["durationSeconds"] for profile in profiles}
    if len(durations) == 1:
        errors.append("$.animationControl.transitionProfiles: 不得让所有动作类别共用同一过渡时长")


def validate_facing_events_physics(payload: dict[str, Any], errors: list[str]) -> None:
    """校验翻转隔离、玩法事件权威和物理写入边界。"""
    if payload["facing"]["facingNode"] != payload["rig"]["facingRoot"]:
        errors.append("$.facing.facingNode: 必须绑定 Rig 声明的翻转根")
    if payload["facing"]["facingNode"] in {
        payload["physics"]["rigidbodyPath"],
        payload["physics"]["collisionRoot"],
    }:
        errors.append("$.facing.facingNode: 翻转根不得与物理根或碰撞根相同")

    critical_events = set(payload["gameplaySync"]["criticalEvents"])
    if critical_events != REQUIRED_CRITICAL_EVENTS:
        errors.append("$.gameplaySync.criticalEvents: 必须完整声明六类关键玩法事件")

    followers = payload["physics"]["boneFollowers"]
    require_unique_ids(followers, "$.physics.boneFollowers", errors)
    if len(followers) > payload["performance"]["maxBoneFollowersPerCharacter"]:
        errors.append("$.performance.maxBoneFollowersPerCharacter: 小于当前骨骼跟随对象数量")


def validate_attachments_and_approval(payload: dict[str, Any], errors: list[str]) -> None:
    """校验换装挂点复用当前骨架，并让批准绑定当前系统版本。"""
    attachment_bones = {
        item["id"]: item["bone"]
        for item in payload["rig"]["attachmentBones"]
    }
    slots = payload["attachments"]["slots"]
    require_unique_ids(slots, "$.attachments.slots", errors)
    for index, slot in enumerate(slots):
        if attachment_bones.get(slot["id"]) != slot["bone"]:
            errors.append(
                f"$.attachments.slots[{index}]: 附件槽必须复用 Rig 中同 ID 的稳定挂点骨"
            )

    if payload["status"] == "PLAYER_CHARACTER_SKELETAL_SYSTEM_APPROVED":
        approval = payload.get("approval")
        if isinstance(approval, dict) and approval["subjectVersion"] != payload["systemVersion"]:
            errors.append("$.approval.subjectVersion: 必须绑定当前 systemVersion")


def validate_skeletal_system(payload: dict[str, Any]) -> list[str]:
    """返回骨骼系统结构和跨模块语义问题。"""
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    schema_errors = sorted(
        validator.iter_errors(payload),
        key=lambda item: format_json_path(item.absolute_path),
    )
    errors = [
        f"{format_json_path(error.absolute_path)}: {error.message}"
        for error in schema_errors
    ]
    if schema_errors:
        return sorted(set(errors))

    validate_rig_and_rendering(payload, errors)
    validate_skinning_and_ik(payload, errors)
    validate_animation_control(payload, errors)
    validate_facing_events_physics(payload, errors)
    validate_attachments_and_approval(payload, errors)
    return sorted(set(errors))


def write_report(path: Path, source: Path, errors: list[str]) -> None:
    """写入确定性的技术校验报告，不冒充视觉或性能批准。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": source.as_posix(),
        "status": (
            "PLAYER_CHARACTER_SKELETAL_SYSTEM_TECHNICAL_PASS_REVIEW_REQUIRED"
            if not errors
            else "PLAYER_CHARACTER_SKELETAL_SYSTEM_INVALID"
        ),
        "errors": errors,
    }
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    """执行验证并输出明确的技术状态。"""
    args = parse_args()
    try:
        payload = load_mapping(args.source)
        errors = validate_skeletal_system(payload)
    except (OSError, UnicodeError, ValueError, yaml.YAMLError, json.JSONDecodeError) as exc:
        errors = [str(exc)]
    if args.report is not None:
        write_report(args.report, args.source, errors)
    if errors:
        for error in errors:
            print(error)
        return 1
    print("PLAYER_CHARACTER_SKELETAL_SYSTEM_TECHNICAL_PASS_REVIEW_REQUIRED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
