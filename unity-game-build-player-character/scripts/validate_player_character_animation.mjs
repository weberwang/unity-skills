#!/usr/bin/env node

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/** 验证 P3-002 关键姿势骨骼动画规格的结构、时间与约束完整性。 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = resolve(SCRIPT_DIRECTORY, "..", "schemas", "player-character-skeletal-animation.schema.json");
export const POSE_APPROVED_STATES = new Set([
  "PLAYER_CHARACTER_ANIMATION_POSE_CARDS_APPROVED",
  "PLAYER_CHARACTER_ANIMATION_TRANSITIONS_BUILT",
  "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
  "PLAYER_CHARACTER_ANIMATION_APPROVED",
]);
export const BUILT_STATES = new Set([
  "PLAYER_CHARACTER_ANIMATION_TRANSITIONS_BUILT",
  "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
  "PLAYER_CHARACTER_ANIMATION_APPROVED",
]);
export const REGRESSION_STATES = new Set([
  "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING",
  "PLAYER_CHARACTER_ANIMATION_APPROVED",
]);
export const FORBIDDEN_ROTATION_FIELDS = new Set(["localrotation", "localrotationdegrees", "rotationdegrees", "bonerotations"]);
export const QUALITY_PRIORITY_ORDER = ["KEY_POSE", "TIMING", "TRAJECTORY", "SECONDARY_MOTION"];
export const REVIEW_FIELDS = ["speedContinuity", "trajectory", "ikContinuity", "bodyMechanics", "tension"];

/** 解析动画规格与可选报告路径。 */
export function parseArgs(argv = process.argv.slice(2)) {
  let source;
  let report;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--source" || argument === "--report") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`${argument} 必须提供路径`);
      if (argument === "--source") source = argv[++index];
      else report = argv[++index];
    } else if (argument.startsWith("--")) {
      throw new Error(`未知参数：${argument}`);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  if (!source) throw new Error("缺少必需参数：--source");
  return { source, report };
}

/** 读取 YAML 或 JSON 映射，并拒绝空文件与非对象根节点。 */
export function loadMapping(path) {
  const payload = YAML.parse(readFileSync(path, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("动画规格根节点必须是映射");
  return payload;
}

/** 把 Ajv 路径转换为稳定 JSONPath。 */
export function formatJsonPath(instancePath) {
  if (!instancePath) return "$";
  return `$${instancePath.split("/").filter(Boolean).map((part) => {
    const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
    return /^\d+$/.test(decoded) ? `[${decoded}]` : `.${decoded}`;
  }).join("")}`;
}

/** 定位把猜测局部角度当设计输入的字段。 */
export function findForbiddenRotationFields(value, path = "$") {
  const errors = [];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const normalized = String(key).replaceAll("_", "").replaceAll("-", "").toLowerCase();
      const childPath = `${path}.${key}`;
      if (FORBIDDEN_ROTATION_FIELDS.has(normalized)) errors.push(`${childPath}: 设计规格禁止写入猜测的局部骨骼角度`);
      errors.push(...findForbiddenRotationFields(nested, childPath));
    }
  } else if (Array.isArray(value)) {
    value.forEach((nested, index) => errors.push(...findForbiddenRotationFields(nested, `${path}[${index}]`)));
  }
  return errors;
}

/** 计算二维世界空间点距离。 */
export function pointDistance(first, second) {
  return Math.hypot(Number(first.x) - Number(second.x), Number(first.y) - Number(second.y));
}

/** 以足够严格的浮点容差比较时间点。 */
export function isSameTime(first, second) {
  return typeof first === "number" && Number.isFinite(first) && typeof second === "number" && Number.isFinite(second) && Math.abs(first - second) <= 1e-6;
}

/** 校验承重点声明与脚部接触状态一致，避免静态姿势失去重量依据。 */
export function validateBodyMechanics(poses, errors) {
  const requiredContacts = {
    BOTH_FEET: new Set(["leftFoot", "rightFoot"]),
    LEFT_FOOT: new Set(["leftFoot"]),
    RIGHT_FOOT: new Set(["rightFoot"]),
    AIRBORNE: new Set(),
  };
  poses.forEach((pose, poseIndex) => {
    const support = pose.bodyMechanics.support;
    const planted = new Set(["leftFoot", "rightFoot"].filter((foot) => pose.contacts[foot].state === "PLANTED"));
    const required = requiredContacts[support];
    if ([...required].some((foot) => !planted.has(foot))) errors.push(`$.keyPoses[${poseIndex}].bodyMechanics.support: 承重点必须绑定实际固定脚`);
    if (support === "AIRBORNE" && planted.size > 0) errors.push(`$.keyPoses[${poseIndex}].bodyMechanics.support: 腾空姿势不得声明固定脚`);
  });
}

/** 校验姿势优先级、蓄力爆发反差和运行时相位策略。 */
export function validateMotionQuality(payload, segments, errors) {
  const quality = payload.motionQuality;
  if (JSON.stringify(quality.priorityOrder) !== JSON.stringify(QUALITY_PRIORITY_ORDER)) errors.push("$.motionQuality.priorityOrder: 必须按关键姿势、节奏、轨迹、次级运动排序");

  const segmentIds = segments.map((segment) => segment.id);
  if (segmentIds.length !== new Set(segmentIds).size) errors.push("$.timeScript: 时间段 ID 必须唯一");
  const segmentById = new Map(segments.map((segment, index) => [segment.id, { index, segment }]));
  const contrast = quality.timingContrast;
  const preparation = segmentById.get(contrast.preparationSegmentId);
  const burst = segmentById.get(contrast.burstSegmentId);
  if (!preparation) errors.push("$.motionQuality.timingContrast.preparationSegmentId: 必须引用现有时间段");
  if (!burst) errors.push("$.motionQuality.timingContrast.burstSegmentId: 必须引用现有时间段");
  if (preparation && burst) {
    if (preparation.segment.phase !== "PREPARATION") errors.push("$.motionQuality.timingContrast.preparationSegmentId: 引用段必须是 PREPARATION");
    if (burst.segment.phase !== "BURST") errors.push("$.motionQuality.timingContrast.burstSegmentId: 引用段必须是 BURST");
    if (preparation.index >= burst.index) errors.push("$.motionQuality.timingContrast: 蓄力段必须早于爆发段");
    const preparationDuration = preparation.segment.endSeconds - preparation.segment.startSeconds;
    const burstDuration = burst.segment.endSeconds - burst.segment.startSeconds;
    if (preparationDuration <= 0 || burstDuration <= 0) errors.push("$.motionQuality.timingContrast: 蓄力段和爆发段时长必须大于零");
    else if (burstDuration / preparationDuration > contrast.maxBurstToPreparationRatio + 1e-6) errors.push("$.motionQuality.timingContrast: 爆发段相对蓄力段过长，缺少速度反差");
  }

  const runtime = payload.runtimeIntegration;
  if (runtime.actionClass === "LOCOMOTION" && runtime.phaseSync === "NOT_APPLICABLE") errors.push("$.runtimeIntegration.phaseSync: 移动循环必须声明接触相位或归一化相位同步");
}

/** 校验正常速度、慢放、轨迹和逐段动态审查证据。 */
export function validateMotionReview(payload, segmentIds, errors) {
  const review = payload.motionReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) return;
  const checks = review.segmentChecks;
  const checkIds = checks.map((check) => check.segmentId);
  if (checkIds.length !== new Set(checkIds).size) errors.push("$.motionReview.segmentChecks: 每个时间段只能有一份动态审查");
  if (new Set(checkIds).size !== new Set(segmentIds).size || [...new Set(segmentIds)].some((id) => !checkIds.includes(id))) errors.push("$.motionReview.segmentChecks: 必须完整覆盖全部时间段");
  if (payload.status !== "PLAYER_CHARACTER_ANIMATION_APPROVED") return;
  const topLevelResults = [review.normalSpeedPlayback.result, review.slowMotionPlayback.result, review.trajectoryEvidence.result];
  if (topLevelResults.some((result) => result !== "PASS")) errors.push("$.motionReview: 最终批准前正常速度、慢放和轨迹审查必须全部通过");
  if (checks.some((check) => REVIEW_FIELDS.some((field) => check[field] !== "PASS"))) errors.push("$.motionReview.segmentChecks: 最终批准前全部逐段动态质量检查必须通过");
}

/** 要求批准精确绑定当前动画 ID 和版本。 */
export function validateApproval(payload, field, errors) {
  const approval = payload[field];
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    errors.push(`$.${field}: 缺少当前动画的绑定批准`);
    return;
  }
  if (approval.subjectId !== payload.animationId) errors.push(`$.${field}.subjectId: 必须绑定当前 animationId`);
  if (approval.subjectVersion !== payload.animationVersion) errors.push(`$.${field}.subjectVersion: 必须绑定当前 animationVersion`);
}

/** 返回结构、关键姿势、接触、时间脚本和回归证据问题。 */
export function validateAnimationSpec(payload) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const valid = ajv.validate(schema, payload);
  const errors = findForbiddenRotationFields(payload);
  if (!valid) {
    errors.push(...(ajv.errors ?? []).map((error) => {
      const path = formatJsonPath(error.instancePath);
      const detail = error.keyword === "required" ? `must have required property '${error.params.missingProperty}'` : error.message;
      return `${path}: ${detail}`;
    }));
    return [...new Set(errors)].sort();
  }

  const poses = payload.keyPoses;
  const poseIds = poses.map((pose) => pose.id);
  const poseTimes = poses.map((pose) => pose.timeSeconds);
  if (poseIds.length !== new Set(poseIds).size) errors.push("$.keyPoses: 关键姿势 ID 必须唯一");
  if (!isSameTime(poseTimes[0], 0.0)) errors.push("$.keyPoses[0].timeSeconds: 第一张关键姿势必须位于 0 秒");
  if (poseTimes.some((current, index) => index > 0 && current <= poseTimes[index - 1])) errors.push("$.keyPoses: 关键姿势时间必须严格递增");
  if (poseTimes.at(-1) > payload.durationSeconds) errors.push("$.keyPoses: 最后一张姿势不得超过动画时长");

  const elbowRange = payload.deformationBudget.elbowFlexionDegrees;
  if (elbowRange.minimum > elbowRange.maximum) errors.push("$.deformationBudget.elbowFlexionDegrees: 肘部最小弯曲不得大于最大弯曲");

  const previousAnchors = new Map();
  poses.forEach((pose, poseIndex) => {
    for (const foot of ["leftFoot", "rightFoot"]) {
      const contact = pose.contacts[foot];
      if (contact.state !== "PLANTED") {
        previousAnchors.delete(foot);
        continue;
      }
      const anchor = contact.anchor;
      const target = pose.worldTargets[foot];
      const allowed = Math.max(Number(contact.maxSlipUnits), Number(target.toleranceUnits));
      if (pointDistance(anchor, target.position) > allowed + 1e-6) errors.push(`$.keyPoses[${poseIndex}].contacts.${foot}.anchor: 固定脚锚点与世界目标不一致`);
      const previous = previousAnchors.get(foot);
      if (previous && pointDistance(previous.anchor, anchor) > Math.min(previous.slip, Number(contact.maxSlipUnits)) + 1e-6) errors.push(`$.keyPoses[${poseIndex}].contacts.${foot}.anchor: 连续固定期间脚底锚点发生漂移`);
      previousAnchors.set(foot, { anchor, slip: Number(contact.maxSlipUnits) });
    }
  });

  validateBodyMechanics(poses, errors);
  const segments = payload.timeScript;
  if (segments.length !== poses.length - 1) errors.push("$.timeScript: 必须为每对相邻关键姿势提供且只提供一个时间段");
  segments.slice(0, Math.max(0, poses.length - 1)).forEach((segment, index) => {
    const startPose = poses[index];
    const endPose = poses[index + 1];
    if (segment.fromPoseId !== startPose.id || segment.toPoseId !== endPose.id) errors.push(`$.timeScript[${index}]: 时间段必须连接相邻关键姿势`);
    if (!isSameTime(segment.startSeconds, startPose.timeSeconds)) errors.push(`$.timeScript[${index}].startSeconds: 必须等于起始姿势时间`);
    if (!isSameTime(segment.endSeconds, endPose.timeSeconds)) errors.push(`$.timeScript[${index}].endSeconds: 必须等于结束姿势时间`);
    const segmentDuration = Number(segment.endSeconds) - Number(segment.startSeconds);
    if (segmentDuration <= 0) errors.push(`$.timeScript[${index}]: 时间段时长必须大于零`);
    if (Number(segment.holdSeconds) > Math.max(0, segmentDuration) + 1e-6) errors.push(`$.timeScript[${index}].holdSeconds: 保持时间不得超过当前时间段`);
    if (payload.motionQuality.style === "SNAPPY_WEIGHTED" && segment.phase === "BURST" && segment.leadChain[0] !== "Pelvis") errors.push(`$.timeScript[${index}].leadChain: 有重量的爆发动作必须由骨盆开始传力`);
    if (payload.motionQuality.style === "SNAPPY_WEIGHTED" && ["BURST", "FOLLOW_THROUGH", "RECOVERY"].includes(segment.phase) && Number(segment.followThroughDelaySeconds) <= 0) errors.push(`$.timeScript[${index}].followThroughDelaySeconds: 动态阶段必须声明错位跟随`);

    const frameCount = Math.max(1, Math.ceil(Math.max(0, segmentDuration) * payload.sampleRate));
    const maxWeightDelta = Number(payload.motionQuality.maxIkWeightDeltaPerFrame);
    for (const foot of ["leftFoot", "rightFoot"]) {
      const blend = segment.ikBlend[foot];
      if (Math.abs(Number(blend.endWeight) - Number(blend.startWeight)) / frameCount > maxWeightDelta + 1e-6) errors.push(`$.timeScript[${index}].ikBlend.${foot}: IK 权重单帧变化超过上限`);
      const startPlanted = startPose.contacts[foot].state === "PLANTED";
      const endPlanted = endPose.contacts[foot].state === "PLANTED";
      if (startPlanted && Number(blend.startWeight) < 0.95) errors.push(`$.timeScript[${index}].ikBlend.${foot}.startWeight: 固定脚起点 IK 权重不得低于 0.95`);
      if (endPlanted && Number(blend.endWeight) < 0.95) errors.push(`$.timeScript[${index}].ikBlend.${foot}.endWeight: 固定脚终点 IK 权重不得低于 0.95`);
      if (startPlanted && endPlanted && segment.trajectoryPlan[foot] !== "LOCKED") errors.push(`$.timeScript[${index}].trajectoryPlan.${foot}: 连续固定脚轨迹必须为 LOCKED`);
    }
  });

  validateMotionQuality(payload, segments, errors);
  const eventIds = payload.visualEvents.map((event) => event.id);
  const eventTimes = payload.visualEvents.map((event) => event.timeSeconds);
  if (eventIds.length !== new Set(eventIds).size) errors.push("$.visualEvents: 视觉事件 ID 必须唯一");
  if (JSON.stringify(eventTimes) !== JSON.stringify([...eventTimes].sort((a, b) => a - b))) errors.push("$.visualEvents: 视觉事件必须按时间排序");
  payload.visualEvents.forEach((event, index) => {
    if (event.timeSeconds + event.durationSeconds > payload.durationSeconds + 1e-6) errors.push(`$.visualEvents[${index}]: 视觉事件不得超出动画时长`);
  });

  const status = payload.status;
  const captures = payload.regression.captures;
  const captureIds = captures.map((capture) => capture.poseId);
  if (captureIds.length !== new Set(captureIds).size) errors.push("$.regression.captures: 每个关键姿势只能有一份回归捕获");
  if ((captures.length > 0 || REGRESSION_STATES.has(status)) && (new Set(captureIds).size !== new Set(poseIds).size || poseIds.some((id) => !captureIds.includes(id)))) errors.push("$.regression.captures: 必须完整覆盖全部关键姿势");
  const captureById = new Map(captures.map((capture) => [capture.poseId, capture]));
  poses.forEach((pose, index) => {
    const capture = captureById.get(pose.id);
    if (capture && !isSameTime(capture.timeSeconds, pose.timeSeconds)) errors.push(`$.regression.captures[${index}].timeSeconds: 必须等于对应关键姿势时间`);
  });

  validateMotionReview(payload, segments.map((segment) => segment.id), errors);
  if (POSE_APPROVED_STATES.has(status)) {
    validateApproval(payload, "poseCardsApproval", errors);
    poses.forEach((pose, index) => {
      if (pose.status !== "STATIC_POSE_PASS") errors.push(`$.keyPoses[${index}].status: 姿势卡批准前必须通过静态姿势验收`);
      if (!pose.acceptanceScreenshot || typeof pose.acceptanceScreenshot !== "object" || Array.isArray(pose.acceptanceScreenshot)) errors.push(`$.keyPoses[${index}].acceptanceScreenshot: 姿势卡批准前必须绑定验收截图`);
      if (!pose.resolvedPoseEvidence || typeof pose.resolvedPoseEvidence !== "object" || Array.isArray(pose.resolvedPoseEvidence)) errors.push(`$.keyPoses[${index}].resolvedPoseEvidence: 姿势卡批准前必须绑定已求解姿势证据`);
      if (pose.deformationAssessment.status !== "WITHIN_BUDGET") errors.push(`$.keyPoses[${index}].deformationAssessment.status: 超出变形预算时不得批准姿势卡`);
    });
  }
  if (BUILT_STATES.has(status)) {
    const result = payload.buildResult;
    if (result && result.clip.path !== payload.builder.outputClipPath) errors.push("$.buildResult.clip.path: 构建结果必须绑定声明的版本化 AnimationClip");
  }
  if (status === "PLAYER_CHARACTER_ANIMATION_APPROVED") {
    validateApproval(payload, "finalApproval", errors);
    if (captures.some((capture) => capture.result !== "PASS")) errors.push("$.regression.captures: 最终批准前全部固定时间回归必须通过");
  }
  return [...new Set(errors)].sort();
}

/** 写入确定性的技术校验报告。 */
export function writeReport(path, source, errors) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    source: normalize(String(source)).replaceAll("\\", "/"),
    status: errors.length === 0 ? "PLAYER_CHARACTER_ANIMATION_SPEC_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED" : "PLAYER_CHARACTER_ANIMATION_SPEC_INVALID",
    errors,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** 执行验证，输出明确但不冒充视觉批准的结果。 */
export function main(argv = process.argv.slice(2)) {
  let args;
  let errors;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log("用法：node validate_player_character_animation.mjs --source <path> [--report <path>]");
      return 0;
    }
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  try {
    errors = validateAnimationSpec(loadMapping(args.source));
  } catch (error) {
    errors = [error instanceof Error ? error.message : String(error)];
  }
  if (args?.report) writeReport(args.report, args.source, errors);
  if (errors.length > 0) {
    for (const error of errors) console.log(error);
    return 1;
  }
  console.log("PLAYER_CHARACTER_ANIMATION_SPEC_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();
