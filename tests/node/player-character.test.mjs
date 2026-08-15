import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import * as audit from "../../unity-game-build-player-character/scripts/audit_player_character.mjs";
import * as animation from "../../unity-game-build-player-character/scripts/validate_player_character_animation.mjs";
import * as skeletal from "../../unity-game-build-player-character/scripts/validate_player_character_skeletal_system.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SKILL_DIR = resolve(ROOT, "unity-game-build-player-character");
const SKILL_PATH = resolve(SKILL_DIR, "SKILL.md");
const AGENT_PATH = resolve(SKILL_DIR, "agents/openai.yaml");
const CONTRACT_PATH = resolve(SKILL_DIR, "references/player-character-contract.md");
const BASELINE_REFERENCE_PATH = resolve(SKILL_DIR, "references/player-character-project-baseline.md");
const BASELINE_SCHEMA_PATH = resolve(SKILL_DIR, "schemas/player-character-project-baseline.schema.json");
const BASELINE_TEMPLATE_PATH = resolve(SKILL_DIR, "templates/player-character-project-baseline.yaml");
const ANIMATION_REFERENCE_PATH = resolve(SKILL_DIR, "references/player-character-skeletal-animation.md");
const ANIMATION_SCHEMA_PATH = resolve(SKILL_DIR, "schemas/player-character-skeletal-animation.schema.json");
const ANIMATION_TEMPLATE_PATH = resolve(SKILL_DIR, "templates/player-character-skeletal-animation.yaml");
const SKELETAL_REFERENCE_PATH = resolve(SKILL_DIR, "references/player-character-2d-skeletal-system.md");
const SKELETAL_SCHEMA_PATH = resolve(SKILL_DIR, "schemas/player-character-2d-skeletal-system.schema.json");
const SKELETAL_TEMPLATE_PATH = resolve(SKILL_DIR, "templates/player-character-2d-skeletal-system.yaml");

/** 以 UTF-8 读取单个专项 Skill 文件，避免测试依赖系统默认编码。 */
function readText(path) {
  return readFileSync(path, "utf8");
}

/** 解析 SKILL.md 顶部 YAML frontmatter，校验入口元数据结构。 */
function parseFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  assert.ok(match);
  return YAML.parse(match[1]);
}

/** 创建临时目录并保证测试结束后移除，避免 fixture 污染仓库。 */
function withTempDirectory(callback) {
  const path = resolve(tmpdir(), `unity-player-node-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path, { recursive: true });
  try {
    return callback(path);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

/** 递归收集模板中的 path/sha256 绑定并创建可复算 fixture。 */
function materializeProjectBaselineBindings(root, payload) {
  const bindings = new Map();
  // 先收集所有绑定再统一写入，确保重复引用共享同一份实际内容和摘要。
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 2 && keys.includes("path") && keys.includes("sha256")) {
        if (!bindings.has(value.path)) bindings.set(value.path, []);
        bindings.get(value.path).push(value);
      } else Object.values(value).forEach(collect);
    }
  };
  collect(payload);
  const contents = new Map([...bindings.keys()].map((path) => [path, Buffer.from(`fixture:${path}\n`)]));
  for (const asset of [...payload.layerMappings, ...Object.values(payload.runtimeAssets)]) {
    contents.set(asset.meta.path, Buffer.from(`fileFormatVersion: 2\nguid: ${asset.guid}\n`));
  }
  for (const [relative, content] of contents) {
    const path = resolve(root, relative);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, content);
    const digest = createHash("sha256").update(content).digest("hex");
    for (const binding of bindings.get(relative)) binding.sha256 = digest;
  }
  return contents;
}

/** 使用 Ajv 校验 JSON Schema，保持与专项脚本同一 2020-12 方言。 */
function assertSchemaValid(schemaPath, payload) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  assert.equal(ajv.validate(JSON.parse(readText(schemaPath)), payload), true, JSON.stringify(ajv.errors));
}

test("人物 Skill 元数据和直接参考有效", () => {
  const text = readText(SKILL_PATH);
  const frontmatter = parseFrontmatter(text);
  assert.deepEqual(Object.keys(frontmatter).sort(), ["description", "name"]);
  assert.equal(frontmatter.name, "unity-game-build-player-character");
  assert.match(frontmatter.description, /P3-002/);
  assert.match(frontmatter.description, /流畅、自然、有张力/);
  for (const reference of ["references/player-character-contract.md", "references/player-character-project-baseline.md", "references/player-character-2d-skeletal-system.md", "references/player-character-skeletal-animation.md"]) assert.match(text, new RegExp(reference.replaceAll("/", "\\/")));
  for (const path of [CONTRACT_PATH, BASELINE_REFERENCE_PATH, BASELINE_SCHEMA_PATH, BASELINE_TEMPLATE_PATH, SKELETAL_REFERENCE_PATH, SKELETAL_SCHEMA_PATH, SKELETAL_TEMPLATE_PATH, ANIMATION_REFERENCE_PATH, ANIMATION_SCHEMA_PATH, ANIMATION_TEMPLATE_PATH]) assert.equal(existsSync(path), true);
  assert.equal(existsSync(resolve(SKILL_DIR, "scripts/validate_player_character_animation.mjs")), true);
  assert.ok(text.split("\n").length < 500);
});

test("人物 Skill 代理界面调用精确名称", () => {
  const payload = YAML.parse(readText(AGENT_PATH));
  assert.equal(payload.interface.display_name, "Unity 玩家角色与骨骼动画");
  assert.ok(payload.interface.short_description.length >= 25 && payload.interface.short_description.length <= 64);
  assert.match(payload.interface.default_prompt, /\$unity-game-build-player-character/);
});

test("审计脚本不自动作视觉判断", () => withTempDirectory((root) => {
  const pngPath = resolve(root, "layer.png");
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(2048, 16);
  header.writeUInt32BE(2048, 20);
  header[24] = 8;
  header[25] = 6;
  writeFileSync(pngPath, header);
  assert.deepEqual(audit.inspectPng(pngPath), { width: 2048, height: 2048, bitDepth: 8, colorType: 6 });
  const source = readText(resolve(SKILL_DIR, "scripts/audit_player_character.mjs"));
  assert.match(source, /PLAYER_CHARACTER_EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED/);
  assert.doesNotMatch(source, /"UNITY_VISUAL_PASS"/);
  assert.match(source, /--baseline/);
}));

test("项目基线模板严格符合 Schema", () => {
  const payload = YAML.parse(readText(BASELINE_TEMPLATE_PATH));
  assertSchemaValid(BASELINE_SCHEMA_PATH, payload);
  assert.equal(payload.recordType, "PLAYER_CHARACTER_PROJECT_BASELINE");
  assert.equal(payload.status, "PLAYER_CHARACTER_BASELINE_AUDITED");
  assert.deepEqual(payload.checks.map((item) => item.checkId), audit.EXPECTED_PROJECT_BASELINE_CHECK_IDS);
  assert.deepEqual(payload.visualComparison.regions.map((item) => item.id), audit.EXPECTED_VISUAL_REGION_IDS);
  assert.deepEqual(payload.visualComparison.states.map((item) => item.id), audit.EXPECTED_VISUAL_STATE_IDS);
  assert.equal(payload.layerMappings.length, 17);
});

for (const [title, path] of [["项目基线", BASELINE_REFERENCE_PATH], ["骨骼动画", ANIMATION_REFERENCE_PATH], ["完整骨骼系统", SKELETAL_REFERENCE_PATH]]) {
  test(`${title}参考包含标准契约`, () => {
    const text = readText(path);
    for (const heading of ["## 何时读取", "## 输入", "## 执行步骤", "## 子代理角色与并行边界", "## 所需锁与 Unity 权限", "## 机器可读输出", "## 通过条件", "## 失败与恢复出口"]) assert.match(text, new RegExp(heading));
  });
}

test("专项资源命名和脚本入口保持一致", () => {
  assert.deepEqual(readdirSync(resolve(SKILL_DIR, "references")).sort(), ["player-character-2d-skeletal-system.md", "player-character-contract.md", "player-character-project-baseline.md", "player-character-skeletal-animation.md"]);
  assert.deepEqual(readdirSync(resolve(SKILL_DIR, "schemas")).sort(), ["player-character-2d-skeletal-system.schema.json", "player-character-project-baseline.schema.json", "player-character-skeletal-animation.schema.json"]);
  assert.deepEqual(readdirSync(resolve(SKILL_DIR, "templates")).sort(), ["player-character-2d-skeletal-system.yaml", "player-character-project-baseline.yaml", "player-character-skeletal-animation.yaml"]);
  assert.deepEqual(readdirSync(resolve(SKILL_DIR, "scripts")).filter((name) => name.endsWith(".mjs")).sort(), ["audit_player_character.mjs", "validate_player_character_animation.mjs", "validate_player_character_skeletal_system.mjs"]);
});

test("项目基线审计重新计算全部绑定文件", () => withTempDirectory((root) => {
  const payload = YAML.parse(readText(BASELINE_TEMPLATE_PATH));
  materializeProjectBaselineBindings(root, payload);
  audit.setTargetSha256(payload.authorityBindings.target.sha256);
  const baselinePath = resolve(root, "Artifacts/Visual/P4/g1-v0.6/p3-002/v5/project-baselines/player-character-baseline.yaml");
  mkdirSync(resolve(baselinePath, ".."), { recursive: true });
  writeFileSync(baselinePath, YAML.stringify(payload));
  const errors = [];
  assert.ok(audit.validateProjectBaseline(root, baselinePath, errors));
  assert.deepEqual(errors, []);
  const targetPath = resolve(root, audit.TARGET_RELATIVE_PATH);
  writeFileSync(targetPath, Buffer.concat([readFileSync(targetPath), Buffer.from("drift")]));
  const driftErrors = [];
  audit.validateProjectBaseline(root, baselinePath, driftErrors);
  assert.ok(driftErrors.some((error) => error.includes("哈希不一致")));
  audit.setTargetSha256("3c4da040649bd6f3a52dbd9ee423493ccd063b32619ed25a34a29334bbfb5ce6");
}));

test("骨骼系统模板符合契约", () => {
  const payload = YAML.parse(readText(SKELETAL_TEMPLATE_PATH));
  assertSchemaValid(SKELETAL_SCHEMA_PATH, payload);
  assert.deepEqual(skeletal.validateSkeletalSystem(payload), []);
  assert.equal(payload.pipeline.deformationMode, "HYBRID_SPRITE_SKIN");
  assert.equal(payload.rig.boneCount, 30);
  assert.ok(payload.rendering.sortingBands.length >= 6);
  assert.ok(payload.skinning.maxBoneInfluencesPerVertex <= 4);
  assert.deepEqual(payload.ik.solveOrder, ["BASE_CLIP", "RUNTIME_IK", "SECONDARY_MOTION"]);
  assert.equal(payload.animationControl.applyRootMotion, false);
  assert.equal(payload.facing.physicsRootUnscaled, true);
  assert.equal(payload.gameplaySync.animationEventRole, "PRESENTATION_ONLY");
  assert.equal(payload.physics.transformOwnership, "RIGIDBODY_ROOT_BONES_VISUAL_ONLY");
  assert.equal(payload.attachments.skeletonReuse, "REQUIRED");
  assert.equal(payload.performance.targetPlatform, "MOBILE");
});

test("骨骼系统验证器阻断跨模块漂移", () => {
  const payload = YAML.parse(readText(SKELETAL_TEMPLATE_PATH));
  payload.animationControl.locomotion.expectedSpeedUnitsPerSecond = 1.25;
  payload.facing.facingNode = payload.physics.rigidbodyPath;
  payload.gameplaySync.criticalEvents.splice(payload.gameplaySync.criticalEvents.indexOf("COMBO_WINDOW"), 1);
  payload.attachments.slots[0].bone = "Head";
  const errors = skeletal.validateSkeletalSystem(payload);
  assert.ok(errors.some((error) => error.includes("步幅除以循环时长")));
  assert.ok(errors.some((error) => error.includes("必须绑定 Rig 声明的翻转根")));
  assert.ok(errors.some((error) => error.includes("完整声明六类关键玩法事件")));
  assert.ok(errors.some((error) => error.includes("复用 Rig 中同 ID 的稳定挂点骨")));
});

test("骨骼系统验证器阻断预算和过渡塌缩", () => {
  const payload = YAML.parse(readText(SKELETAL_TEMPLATE_PATH));
  payload.performance.maxActiveConstraintsPerCharacter = 2;
  payload.performance.maxBoneFollowersPerCharacter = 2;
  payload.animationControl.transitionProfiles.forEach((profile) => { profile.durationSeconds = 0.1; });
  const errors = skeletal.validateSkeletalSystem(payload);
  assert.ok(errors.some((error) => error.includes("小于已启用 IK 约束数量")));
  assert.ok(errors.some((error) => error.includes("小于当前骨骼跟随对象数量")));
  assert.ok(errors.some((error) => error.includes("不得让所有动作类别共用同一过渡时长")));
});

test("胜利动画模板符合 Schema 和语义", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  assertSchemaValid(ANIMATION_SCHEMA_PATH, payload);
  assert.deepEqual(animation.validateAnimationSpec(payload), []);
  assert.equal(payload.keyPoses.length, 6);
  assert.equal(payload.timeScript.length, 5);
  assert.equal(payload.schemaVersion, "2.0");
  assert.deepEqual(payload.motionQuality.priorityOrder, ["KEY_POSE", "TIMING", "TRAJECTORY", "SECONDARY_MOTION"]);
  assert.deepEqual(payload.motionQuality.playbackReviewRates, [1, 0.25]);
  assert.ok(payload.keyPoses.every((pose) => "bodyMechanics" in pose));
  assert.ok(payload.timeScript.every((segment) => "trajectoryPlan" in segment && "ikBlend" in segment));
  assert.equal(payload.rigBinding.skeletalSystemVersion, "player-skeletal-system-v1");
  assert.ok("skeletalSystemEvidence" in payload.rigBinding);
  assert.equal(payload.builder.curveSource, "APPROVED_RESOLVED_POSES");
  assert.ok(payload.keyPoses.every((pose) => pose.worldTargets.space === "CHARACTER_ROOT_WORLD"));
});

test("动画验证器拒绝硬编码局部旋转", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.keyPoses[0].localRotationDegrees = 62;
  assert.ok(animation.validateAnimationSpec(payload).some((error) => error.includes("禁止写入猜测的局部骨骼角度")));
});

test("动画初稿可以早于姿势证据", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.status = "PLAYER_CHARACTER_ANIMATION_DRAFT";
  delete payload.poseCardsApproval;
  payload.regression.captures = [];
  payload.keyPoses.forEach((pose) => { pose.status = "DRAFT"; delete pose.acceptanceScreenshot; delete pose.resolvedPoseEvidence; });
  assert.deepEqual(animation.validateAnimationSpec(payload), []);
});

test("动画验证器拒绝脚滑和时间线漂移", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.keyPoses[2].contacts.leftFoot.anchor.x = -0.05;
  payload.timeScript[2].startSeconds = 0.3;
  const errors = animation.validateAnimationSpec(payload);
  assert.ok(errors.some((error) => error.includes("脚底锚点发生漂移")));
  assert.ok(errors.some((error) => error.includes("必须等于起始姿势时间")));
});

test("动画验证器阻断失重节奏和 IK 质量问题", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.keyPoses[1].bodyMechanics.support = "AIRBORNE";
  payload.motionQuality.timingContrast.maxBurstToPreparationRatio = 0.2;
  payload.timeScript[1].leadChain = ["Hands", "Shoulders", "Spine", "Pelvis"];
  payload.timeScript[1].ikBlend.leftFoot.startWeight = 0;
  const errors = animation.validateAnimationSpec(payload);
  assert.ok(errors.some((error) => error.includes("腾空姿势不得声明固定脚")));
  assert.ok(errors.some((error) => error.includes("缺少速度反差")));
  assert.ok(errors.some((error) => error.includes("必须由骨盆开始传力")));
  assert.ok(errors.some((error) => error.includes("固定脚起点 IK 权重不得低于 0.95")));
});

test("动画动态回归必须补齐运动审查", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.status = "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING";
  payload.buildResult = {
    clip: { path: payload.builder.outputClipPath, sha256: "3".repeat(64) },
    curveReport: { path: "Artifacts/Animation/P3-002/Victory/curve-report.yaml", sha256: "4".repeat(64) },
    generatedAtUtc: "2026-08-06T08:00:00Z",
    builderVersion: "player-character-animation-builder-v2",
  };
  const errors = animation.validateAnimationSpec(payload);
  assert.ok(errors.some((error) => error.includes("motionReview") && error.includes("required property")));
});

test("动画验证器阻断超出变形预算的姿势批准", () => {
  const payload = YAML.parse(readText(ANIMATION_TEMPLATE_PATH));
  payload.keyPoses[3].deformationAssessment.status = "MESH_REVISION_REQUIRED";
  assert.ok(animation.validateAnimationSpec(payload).some((error) => error.includes("超出变形预算时不得批准姿势卡")));
});
