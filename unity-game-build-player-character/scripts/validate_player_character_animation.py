#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["jsonschema>=4.25,<5", "PyYAML>=6.0,<7"]
# ///
"""验证 P3-002 关键姿势骨骼动画规格的结构、时间与约束完整性。"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker


SCHEMA_PATH = Path(__file__).parents[1] / "schemas" / "player-character-skeletal-animation.schema.json"
POSE_APPROVED_STATES = {
    "PLAYER_CHARACTER_ANIMATION_POSE_CARDS_APPROVED",
    "PLAYER_CHARACTER_ANIMATION_TRANSITIONS_BUILT",
    "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
    "PLAYER_CHARACTER_ANIMATION_APPROVED",
}
BUILT_STATES = {
    "PLAYER_CHARACTER_ANIMATION_TRANSITIONS_BUILT",
    "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
    "PLAYER_CHARACTER_ANIMATION_APPROVED",
}
REGRESSION_STATES = {
    "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
    "PLAYER_CHARACTER_ANIMATION_APPROVED",
}
FORBIDDEN_ROTATION_FIELDS = {
    "localrotation",
    "localrotationdegrees",
    "rotationdegrees",
    "bonerotations",
}
QUALITY_PRIORITY_ORDER = ["KEY_POSE", "TIMING", "TRAJECTORY", "SECONDARY_MOTION"]
REVIEW_FIELDS = (
    "speedContinuity",
    "trajectory",
    "ikContinuity",
    "bodyMechanics",
    "tension",
)


def parse_args() -> argparse.Namespace:
    """解析动画规格与可选报告路径。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def load_mapping(path: Path) -> dict[str, Any]:
    """读取 YAML 或 JSON 映射，并拒绝空文件与非对象根节点。"""
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("动画规格根节点必须是映射")
    return payload


def format_json_path(parts: Any) -> str:
    """把 jsonschema 路径转换为稳定 JSONPath。"""
    result = "$"
    for part in parts:
        result += f"[{part}]" if isinstance(part, int) else f".{part}"
    return result


def find_forbidden_rotation_fields(value: Any, path: str = "$") -> list[str]:
    """定位把猜测局部角度当设计输入的字段。"""
    errors: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = str(key).replace("_", "").replace("-", "").lower()
            child_path = f"{path}.{key}"
            if normalized in FORBIDDEN_ROTATION_FIELDS:
                errors.append(f"{child_path}: 设计规格禁止写入猜测的局部骨骼角度")
            errors.extend(find_forbidden_rotation_fields(nested, child_path))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            errors.extend(find_forbidden_rotation_fields(nested, f"{path}[{index}]"))
    return errors


def point_distance(first: dict[str, Any], second: dict[str, Any]) -> float:
    """计算二维世界空间点距离。"""
    return math.hypot(float(first["x"]) - float(second["x"]), float(first["y"]) - float(second["y"]))


def is_same_time(first: Any, second: Any) -> bool:
    """以足够严格的浮点容差比较时间点。"""
    return isinstance(first, (int, float)) and isinstance(second, (int, float)) and math.isclose(
        float(first), float(second), rel_tol=0.0, abs_tol=1e-6
    )


def validate_body_mechanics(poses: list[dict[str, Any]], errors: list[str]) -> None:
    """校验承重点声明与脚部接触状态一致，避免静态姿势失去重量依据。"""
    required_contacts = {
        "BOTH_FEET": {"leftFoot", "rightFoot"},
        "LEFT_FOOT": {"leftFoot"},
        "RIGHT_FOOT": {"rightFoot"},
        "AIRBORNE": set(),
    }
    for pose_index, pose in enumerate(poses):
        support = pose["bodyMechanics"]["support"]
        planted = {
            foot
            for foot in ("leftFoot", "rightFoot")
            if pose["contacts"][foot]["state"] == "PLANTED"
        }
        required = required_contacts[support]
        if not required.issubset(planted):
            errors.append(
                f"$.keyPoses[{pose_index}].bodyMechanics.support: 承重点必须绑定实际固定脚"
            )
        if support == "AIRBORNE" and planted:
            errors.append(
                f"$.keyPoses[{pose_index}].bodyMechanics.support: 腾空姿势不得声明固定脚"
            )


def validate_motion_quality(
    payload: dict[str, Any],
    segments: list[dict[str, Any]],
    errors: list[str],
) -> None:
    """校验姿势优先级、蓄力爆发反差和运行时相位策略。"""
    quality = payload["motionQuality"]
    if quality["priorityOrder"] != QUALITY_PRIORITY_ORDER:
        errors.append("$.motionQuality.priorityOrder: 必须按关键姿势、节奏、轨迹、次级运动排序")

    segment_ids = [segment["id"] for segment in segments]
    if len(segment_ids) != len(set(segment_ids)):
        errors.append("$.timeScript: 时间段 ID 必须唯一")
    segment_by_id = {segment["id"]: (index, segment) for index, segment in enumerate(segments)}
    contrast = quality["timingContrast"]
    preparation = segment_by_id.get(contrast["preparationSegmentId"])
    burst = segment_by_id.get(contrast["burstSegmentId"])
    if preparation is None:
        errors.append("$.motionQuality.timingContrast.preparationSegmentId: 必须引用现有时间段")
    if burst is None:
        errors.append("$.motionQuality.timingContrast.burstSegmentId: 必须引用现有时间段")
    if preparation is not None and burst is not None:
        preparation_index, preparation_segment = preparation
        burst_index, burst_segment = burst
        if preparation_segment["phase"] != "PREPARATION":
            errors.append("$.motionQuality.timingContrast.preparationSegmentId: 引用段必须是 PREPARATION")
        if burst_segment["phase"] != "BURST":
            errors.append("$.motionQuality.timingContrast.burstSegmentId: 引用段必须是 BURST")
        if preparation_index >= burst_index:
            errors.append("$.motionQuality.timingContrast: 蓄力段必须早于爆发段")
        preparation_duration = preparation_segment["endSeconds"] - preparation_segment["startSeconds"]
        burst_duration = burst_segment["endSeconds"] - burst_segment["startSeconds"]
        if preparation_duration <= 0 or burst_duration <= 0:
            errors.append("$.motionQuality.timingContrast: 蓄力段和爆发段时长必须大于零")
        else:
            ratio = burst_duration / preparation_duration
            if ratio > contrast["maxBurstToPreparationRatio"] + 1e-6:
                errors.append("$.motionQuality.timingContrast: 爆发段相对蓄力段过长，缺少速度反差")

    runtime = payload["runtimeIntegration"]
    if runtime["actionClass"] == "LOCOMOTION" and runtime["phaseSync"] == "NOT_APPLICABLE":
        errors.append("$.runtimeIntegration.phaseSync: 移动循环必须声明接触相位或归一化相位同步")


def validate_motion_review(
    payload: dict[str, Any],
    segment_ids: list[str],
    errors: list[str],
) -> None:
    """校验正常速度、慢放、轨迹和逐段动态审查证据。"""
    review = payload.get("motionReview")
    if not isinstance(review, dict):
        return
    checks = review["segmentChecks"]
    check_ids = [check["segmentId"] for check in checks]
    if len(check_ids) != len(set(check_ids)):
        errors.append("$.motionReview.segmentChecks: 每个时间段只能有一份动态审查")
    if set(check_ids) != set(segment_ids):
        errors.append("$.motionReview.segmentChecks: 必须完整覆盖全部时间段")

    if payload["status"] != "PLAYER_CHARACTER_ANIMATION_APPROVED":
        return
    top_level_results = (
        review["normalSpeedPlayback"]["result"],
        review["slowMotionPlayback"]["result"],
        review["trajectoryEvidence"]["result"],
    )
    if any(result != "PASS" for result in top_level_results):
        errors.append("$.motionReview: 最终批准前正常速度、慢放和轨迹审查必须全部通过")
    if any(check[field] != "PASS" for check in checks for field in REVIEW_FIELDS):
        errors.append("$.motionReview.segmentChecks: 最终批准前全部逐段动态质量检查必须通过")


def validate_approval(
    payload: dict[str, Any],
    field: str,
    errors: list[str],
) -> None:
    """要求批准精确绑定当前动画 ID 和版本。"""
    approval = payload.get(field)
    if not isinstance(approval, dict):
        errors.append(f"$.{field}: 缺少当前动画的绑定批准")
        return
    if approval.get("subjectId") != payload.get("animationId"):
        errors.append(f"$.{field}.subjectId: 必须绑定当前 animationId")
    if approval.get("subjectVersion") != payload.get("animationVersion"):
        errors.append(f"$.{field}.subjectVersion: 必须绑定当前 animationVersion")


def validate_animation_spec(payload: dict[str, Any]) -> list[str]:
    """返回结构、关键姿势、接触、时间脚本和回归证据问题。"""
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = find_forbidden_rotation_fields(payload)
    schema_errors = sorted(
        validator.iter_errors(payload),
        key=lambda item: format_json_path(item.absolute_path),
    )
    errors.extend(f"{format_json_path(error.absolute_path)}: {error.message}" for error in schema_errors)
    if schema_errors:
        return sorted(set(errors))

    poses = payload["keyPoses"]
    pose_ids = [pose["id"] for pose in poses]
    pose_times = [pose["timeSeconds"] for pose in poses]
    if len(pose_ids) != len(set(pose_ids)):
        errors.append("$.keyPoses: 关键姿势 ID 必须唯一")
    if not is_same_time(pose_times[0], 0.0):
        errors.append("$.keyPoses[0].timeSeconds: 第一张关键姿势必须位于 0 秒")
    if any(current <= previous for previous, current in zip(pose_times, pose_times[1:])):
        errors.append("$.keyPoses: 关键姿势时间必须严格递增")
    if pose_times[-1] > payload["durationSeconds"]:
        errors.append("$.keyPoses: 最后一张姿势不得超过动画时长")

    elbow_range = payload["deformationBudget"]["elbowFlexionDegrees"]
    if elbow_range["minimum"] > elbow_range["maximum"]:
        errors.append("$.deformationBudget.elbowFlexionDegrees: 肘部最小弯曲不得大于最大弯曲")

    previous_anchors: dict[str, tuple[dict[str, Any], float]] = {}
    for pose_index, pose in enumerate(poses):
        for foot in ("leftFoot", "rightFoot"):
            contact = pose["contacts"][foot]
            if contact["state"] != "PLANTED":
                previous_anchors.pop(foot, None)
                continue
            anchor = contact["anchor"]
            target = pose["worldTargets"][foot]
            allowed = max(float(contact["maxSlipUnits"]), float(target["toleranceUnits"]))
            if point_distance(anchor, target["position"]) > allowed + 1e-6:
                errors.append(
                    f"$.keyPoses[{pose_index}].contacts.{foot}.anchor: 固定脚锚点与世界目标不一致"
                )
            previous = previous_anchors.get(foot)
            if previous is not None:
                previous_anchor, previous_slip = previous
                max_continuous_slip = min(previous_slip, float(contact["maxSlipUnits"]))
                if point_distance(previous_anchor, anchor) > max_continuous_slip + 1e-6:
                    errors.append(
                        f"$.keyPoses[{pose_index}].contacts.{foot}.anchor: 连续固定期间脚底锚点发生漂移"
                    )
            previous_anchors[foot] = (anchor, float(contact["maxSlipUnits"]))

    validate_body_mechanics(poses, errors)

    segments = payload["timeScript"]
    if len(segments) != len(poses) - 1:
        errors.append("$.timeScript: 必须为每对相邻关键姿势提供且只提供一个时间段")
    for index, segment in enumerate(segments[: max(0, len(poses) - 1)]):
        start_pose = poses[index]
        end_pose = poses[index + 1]
        if segment["fromPoseId"] != start_pose["id"] or segment["toPoseId"] != end_pose["id"]:
            errors.append(f"$.timeScript[{index}]: 时间段必须连接相邻关键姿势")
        if not is_same_time(segment["startSeconds"], start_pose["timeSeconds"]):
            errors.append(f"$.timeScript[{index}].startSeconds: 必须等于起始姿势时间")
        if not is_same_time(segment["endSeconds"], end_pose["timeSeconds"]):
            errors.append(f"$.timeScript[{index}].endSeconds: 必须等于结束姿势时间")
        segment_duration = float(segment["endSeconds"]) - float(segment["startSeconds"])
        if segment_duration <= 0:
            errors.append(f"$.timeScript[{index}]: 时间段时长必须大于零")
        if float(segment["holdSeconds"]) > max(0.0, segment_duration) + 1e-6:
            errors.append(f"$.timeScript[{index}].holdSeconds: 保持时间不得超过当前时间段")

        if (
            payload["motionQuality"]["style"] == "SNAPPY_WEIGHTED"
            and segment["phase"] == "BURST"
            and segment["leadChain"][0] != "Pelvis"
        ):
            errors.append(f"$.timeScript[{index}].leadChain: 有重量的爆发动作必须由骨盆开始传力")
        if (
            payload["motionQuality"]["style"] == "SNAPPY_WEIGHTED"
            and segment["phase"] in {"BURST", "FOLLOW_THROUGH", "RECOVERY"}
            and float(segment["followThroughDelaySeconds"]) <= 0
        ):
            errors.append(f"$.timeScript[{index}].followThroughDelaySeconds: 动态阶段必须声明错位跟随")

        frame_count = max(1, math.ceil(max(0.0, segment_duration) * payload["sampleRate"]))
        max_weight_delta = float(payload["motionQuality"]["maxIkWeightDeltaPerFrame"])
        for foot in ("leftFoot", "rightFoot"):
            blend = segment["ikBlend"][foot]
            per_frame_delta = abs(float(blend["endWeight"]) - float(blend["startWeight"])) / frame_count
            if per_frame_delta > max_weight_delta + 1e-6:
                errors.append(f"$.timeScript[{index}].ikBlend.{foot}: IK 权重单帧变化超过上限")
            start_planted = start_pose["contacts"][foot]["state"] == "PLANTED"
            end_planted = end_pose["contacts"][foot]["state"] == "PLANTED"
            if start_planted and float(blend["startWeight"]) < 0.95:
                errors.append(f"$.timeScript[{index}].ikBlend.{foot}.startWeight: 固定脚起点 IK 权重不得低于 0.95")
            if end_planted and float(blend["endWeight"]) < 0.95:
                errors.append(f"$.timeScript[{index}].ikBlend.{foot}.endWeight: 固定脚终点 IK 权重不得低于 0.95")
            if (
                start_planted
                and end_planted
                and segment["trajectoryPlan"][foot] != "LOCKED"
            ):
                errors.append(f"$.timeScript[{index}].trajectoryPlan.{foot}: 连续固定脚轨迹必须为 LOCKED")

    validate_motion_quality(payload, segments, errors)

    event_ids = [event["id"] for event in payload["visualEvents"]]
    event_times = [event["timeSeconds"] for event in payload["visualEvents"]]
    if len(event_ids) != len(set(event_ids)):
        errors.append("$.visualEvents: 视觉事件 ID 必须唯一")
    if event_times != sorted(event_times):
        errors.append("$.visualEvents: 视觉事件必须按时间排序")
    for index, event in enumerate(payload["visualEvents"]):
        if event["timeSeconds"] + event["durationSeconds"] > payload["durationSeconds"] + 1e-6:
            errors.append(f"$.visualEvents[{index}]: 视觉事件不得超出动画时长")

    status = payload["status"]
    captures = payload["regression"]["captures"]
    capture_ids = [capture["poseId"] for capture in captures]
    if len(capture_ids) != len(set(capture_ids)):
        errors.append("$.regression.captures: 每个关键姿势只能有一份回归捕获")
    requires_regression = status in REGRESSION_STATES
    if (captures or requires_regression) and set(capture_ids) != set(pose_ids):
        errors.append("$.regression.captures: 必须完整覆盖全部关键姿势")
    capture_by_id = {capture["poseId"]: capture for capture in captures}
    for index, pose in enumerate(poses):
        capture = capture_by_id.get(pose["id"])
        if capture is not None and not is_same_time(capture["timeSeconds"], pose["timeSeconds"]):
            errors.append(f"$.regression.captures[{index}].timeSeconds: 必须等于对应关键姿势时间")

    validate_motion_review(payload, [segment["id"] for segment in segments], errors)

    if status in POSE_APPROVED_STATES:
        validate_approval(payload, "poseCardsApproval", errors)
        for index, pose in enumerate(poses):
            if pose["status"] != "STATIC_POSE_PASS":
                errors.append(f"$.keyPoses[{index}].status: 姿势卡批准前必须通过静态姿势验收")
            if not isinstance(pose.get("acceptanceScreenshot"), dict):
                errors.append(f"$.keyPoses[{index}].acceptanceScreenshot: 姿势卡批准前必须绑定验收截图")
            if not isinstance(pose.get("resolvedPoseEvidence"), dict):
                errors.append(f"$.keyPoses[{index}].resolvedPoseEvidence: 姿势卡批准前必须绑定已求解姿势证据")
            if pose["deformationAssessment"]["status"] != "WITHIN_BUDGET":
                errors.append(f"$.keyPoses[{index}].deformationAssessment.status: 超出变形预算时不得批准姿势卡")
    if status in BUILT_STATES:
        result = payload.get("buildResult")
        if isinstance(result, dict) and result["clip"]["path"] != payload["builder"]["outputClipPath"]:
            errors.append("$.buildResult.clip.path: 构建结果必须绑定声明的版本化 AnimationClip")
    if status == "PLAYER_CHARACTER_ANIMATION_APPROVED":
        validate_approval(payload, "finalApproval", errors)
        if any(capture["result"] != "PASS" for capture in captures):
            errors.append("$.regression.captures: 最终批准前全部固定时间回归必须通过")
    return sorted(set(errors))


def write_report(path: Path, source: Path, errors: list[str]) -> None:
    """原子性要求由调用方保证；这里只写入确定性的技术校验报告。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": source.as_posix(),
        "status": (
            "PLAYER_CHARACTER_ANIMATION_SPEC_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED"
            if not errors
            else "PLAYER_CHARACTER_ANIMATION_SPEC_INVALID"
        ),
        "errors": errors,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    """执行验证，输出明确但不冒充视觉批准的结果。"""
    args = parse_args()
    try:
        payload = load_mapping(args.source)
        errors = validate_animation_spec(payload)
    except (OSError, UnicodeError, ValueError, yaml.YAMLError, json.JSONDecodeError) as exc:
        errors = [str(exc)]
    if args.report is not None:
        write_report(args.report, args.source, errors)
    if errors:
        for error in errors:
            print(error)
        return 1
    print("PLAYER_CHARACTER_ANIMATION_SPEC_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
