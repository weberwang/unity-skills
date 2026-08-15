#!/usr/bin/env node

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/** 验证 P3-002 Unity 2D 骨骼系统的结构与跨模块约束。 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = resolve(SCRIPT_DIRECTORY, "..", "schemas", "player-character-2d-skeletal-system.schema.json");
export const REQUIRED_CRITICAL_EVENTS = new Set([
  "HITBOX_ON",
  "HITBOX_OFF",
  "PROJECTILE_SPAWN",
  "COMBO_WINDOW",
  "INVULNERABILITY_WINDOW",
  "ACTION_COMPLETE",
]);
export const REQUIRED_TRANSITION_CLASSES = new Set(["LOCOMOTION", "ATTACK", "HIT_REACTION"]);

/** 解析系统规格与可选报告路径。 */
export function parseArgs(argv = process.argv.slice(2)) {
  let source;
  let report;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--source" || argument === "--report") {
      if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
        throw new Error(`${argument} 必须提供路径`);
      }
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

/** 读取 YAML 或 JSON，并拒绝空文件和非对象根节点。 */
export function loadMapping(path) {
  const payload = YAML.parse(readFileSync(path, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("骨骼系统规格根节点必须是映射");
  }
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

/** 要求对象数组中的 ID 唯一，避免运行时映射互相覆盖。 */
export function requireUniqueIds(values, path, errors) {
  const ids = values.map((value) => value.id);
  if (ids.length !== new Set(ids).size) errors.push(`${path}: ID 必须唯一`);
}

/** 校验根节点职责隔离、挂点和稳定排序带。 */
export function validateRigAndRendering(payload, errors) {
  const rig = payload.rig;
  const roots = new Set([rig.rootBone, rig.visualRoot, rig.facingRoot]);
  if (roots.size !== 3) errors.push("$.rig: 根骨、视觉根和翻转根必须是三个独立节点");
  if (!rig.facingRoot.startsWith(`${rig.visualRoot}/`)) {
    errors.push("$.rig.facingRoot: 翻转根必须位于视觉根之下");
  }
  requireUniqueIds(rig.attachmentBones, "$.rig.attachmentBones", errors);

  const bands = payload.rendering.sortingBands;
  requireUniqueIds(bands, "$.rendering.sortingBands", errors);
  const orders = bands.map((band) => band.order);
  if (orders.some((order, index) => order !== [...orders].sort((a, b) => a - b)[index]) || new Set(orders).size !== orders.length) {
    errors.push("$.rendering.sortingBands: 排序值必须唯一且严格递增");
  }
  requireUniqueIds(payload.rendering.dynamicRules, "$.rendering.dynamicRules", errors);
}

/** 校验蒙皮预算、IK 链覆盖、求解顺序和双手主从关系。 */
export function validateSkinningAndIk(payload, errors) {
  const skinning = payload.skinning;
  const performance = payload.performance;
  if (performance.maxSkinnedVerticesPerCharacter > skinning.maxVerticesPerCharacter) {
    errors.push("$.performance.maxSkinnedVerticesPerCharacter: 性能预算不得超过蒙皮总顶点上限");
  }

  const chains = payload.ik.chains;
  requireUniqueIds(chains, "$.ik.chains", errors);
  const effectors = chains.map((chain) => chain.endEffector);
  if (effectors.length !== new Set(effectors).size) errors.push("$.ik.chains: 每个效应器只能由一条主 IK 链负责");
  const enabledFootChains = new Set(chains.filter((chain) => chain.enabled && chain.purpose === "FOOT_GROUNDING").map((chain) => chain.endEffector));
  if (enabledFootChains.size !== 2 || !enabledFootChains.has("Foot.L") || !enabledFootChains.has("Foot.R")) {
    errors.push("$.ik.chains: 必须为左右脚各提供一条启用的贴地链");
  }

  const twoHand = payload.ik.twoHandConstraint;
  if (twoHand.enabled && twoHand.primaryHand === twoHand.secondaryHand) {
    errors.push("$.ik.twoHandConstraint: 主手和副手不得相同");
  }
  const enabledConstraints = chains.filter((chain) => chain.enabled).length;
  if (enabledConstraints > performance.maxActiveConstraintsPerCharacter) {
    errors.push("$.performance.maxActiveConstraintsPerCharacter: 小于已启用 IK 约束数量");
  }
}

/** 校验状态分层、步幅速度公式和逐类过渡策略。 */
export function validateAnimationControl(payload, errors) {
  const control = payload.animationControl;
  const layers = control.layers;
  requireUniqueIds(layers, "$.animationControl.layers", errors);
  const baseLayers = layers.filter((layer) => layer.role === "BASE");
  if (baseLayers.length !== 1 || Math.abs(baseLayers[0].weight - 1.0) > 1e-6) {
    errors.push("$.animationControl.layers: 必须只有一个权重为 1 的基础层");
  }

  const locomotion = control.locomotion;
  const calculatedSpeed = locomotion.strideLengthUnits / locomotion.cycleSeconds;
  if (Math.abs(calculatedSpeed - locomotion.expectedSpeedUnitsPerSecond) > 1e-6) {
    errors.push("$.animationControl.locomotion: 期望速度必须等于步幅除以循环时长");
  }

  const profiles = control.transitionProfiles;
  requireUniqueIds(profiles, "$.animationControl.transitionProfiles", errors);
  const profileClasses = new Set(profiles.map((profile) => profile.class));
  if (![...REQUIRED_TRANSITION_CLASSES].some((item) => !profileClasses.has(item))) {
    // 仅用于让下面的分支保持清晰；完整覆盖检查见下一分支。
  } else {
    errors.push("$.animationControl.transitionProfiles: 缺少移动、攻击或受击过渡策略");
  }
  const durations = new Set(profiles.map((profile) => profile.durationSeconds));
  if (durations.size === 1) errors.push("$.animationControl.transitionProfiles: 不得让所有动作类别共用同一过渡时长");
}

/** 校验翻转隔离、玩法事件权威和物理写入边界。 */
export function validateFacingEventsPhysics(payload, errors) {
  if (payload.facing.facingNode !== payload.rig.facingRoot) {
    errors.push("$.facing.facingNode: 必须绑定 Rig 声明的翻转根");
  }
  if ([payload.physics.rigidbodyPath, payload.physics.collisionRoot].includes(payload.facing.facingNode)) {
    errors.push("$.facing.facingNode: 翻转根不得与物理根或碰撞根相同");
  }

  const criticalEvents = new Set(payload.gameplaySync.criticalEvents);
  if (criticalEvents.size !== REQUIRED_CRITICAL_EVENTS.size || [...REQUIRED_CRITICAL_EVENTS].some((event) => !criticalEvents.has(event))) {
    errors.push("$.gameplaySync.criticalEvents: 必须完整声明六类关键玩法事件");
  }

  const followers = payload.physics.boneFollowers;
  requireUniqueIds(followers, "$.physics.boneFollowers", errors);
  if (followers.length > payload.performance.maxBoneFollowersPerCharacter) {
    errors.push("$.performance.maxBoneFollowersPerCharacter: 小于当前骨骼跟随对象数量");
  }
}

/** 校验换装挂点复用当前骨架，并让批准绑定当前系统版本。 */
export function validateAttachmentsAndApproval(payload, errors) {
  const attachmentBones = Object.fromEntries(payload.rig.attachmentBones.map((item) => [item.id, item.bone]));
  const slots = payload.attachments.slots;
  requireUniqueIds(slots, "$.attachments.slots", errors);
  slots.forEach((slot, index) => {
    if (attachmentBones[slot.id] !== slot.bone) {
      errors.push(`$.attachments.slots[${index}]: 附件槽必须复用 Rig 中同 ID 的稳定挂点骨`);
    }
  });

  if (payload.status === "PLAYER_CHARACTER_SKELETAL_SYSTEM_APPROVED") {
    const approval = payload.approval;
    if (approval && approval.subjectVersion !== payload.systemVersion) {
      errors.push("$.approval.subjectVersion: 必须绑定当前 systemVersion");
    }
  }
}

/** 返回骨骼系统结构和跨模块语义问题。 */
export function validateSkeletalSystem(payload) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const valid = ajv.validate(schema, payload);
  const errors = valid ? [] : (ajv.errors ?? []).map((error) => {
    const path = formatJsonPath(error.instancePath);
    const detail = error.keyword === "required" ? `must have required property '${error.params.missingProperty}'` : error.message;
    return `${path}: ${detail}`;
  });
  if (!valid) return [...new Set(errors)].sort();

  validateRigAndRendering(payload, errors);
  validateSkinningAndIk(payload, errors);
  validateAnimationControl(payload, errors);
  validateFacingEventsPhysics(payload, errors);
  validateAttachmentsAndApproval(payload, errors);
  return [...new Set(errors)].sort();
}

/** 写入确定性的技术校验报告，不冒充视觉或性能批准。 */
export function writeReport(path, source, errors) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    source: toPosix(source),
    status: errors.length === 0
      ? "PLAYER_CHARACTER_SKELETAL_SYSTEM_TECHNICAL_PASS_REVIEW_REQUIRED"
      : "PLAYER_CHARACTER_SKELETAL_SYSTEM_INVALID",
    errors,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** 将 Windows 路径统一为报告中使用的 POSIX 形式。 */
function toPosix(path) {
  return normalize(String(path)).replaceAll("\\", "/");
}

/** 执行验证并输出明确的技术状态。 */
export function main(argv = process.argv.slice(2)) {
  let args;
  let errors;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log("用法：node validate_player_character_skeletal_system.mjs --source <path> [--report <path>]");
      return 0;
    }
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  try {
    const payload = loadMapping(args.source);
    errors = validateSkeletalSystem(payload);
  } catch (error) {
    errors = [error instanceof Error ? error.message : String(error)];
  }
  if (args?.report) writeReport(args.report, args.source, errors);
  if (errors.length > 0) {
    for (const error of errors) console.log(error);
    return 1;
  }
  console.log("PLAYER_CHARACTER_SKELETAL_SYSTEM_TECHNICAL_PASS_REVIEW_REQUIRED");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
