import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const SKILL_ROOT = resolve(ROOT, "unity-game-spine-reskin");
const SKILL_TEXT = readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf8");

/** 解析 Skill frontmatter 的顶级字段名。 */
function frontmatterKeys(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, "SKILL.md 缺少 frontmatter");
  return match[1].split(/\r?\n/).filter(Boolean).map((line) => line.split(":", 1)[0]);
}

test("Spine 换皮 Skill 结构精简且元数据完整", () => {
  assert.deepEqual(frontmatterKeys(SKILL_TEXT), ["name", "description"]);
  assert.deepEqual(readdirSync(SKILL_ROOT).sort(), ["SKILL.md", "agents"]);
  assert.equal(readdirSync(SKILL_ROOT, { recursive: true }).filter((path) => String(path).endsWith(".py")).length, 0);

  const openai = readFileSync(resolve(SKILL_ROOT, "agents/openai.yaml"), "utf8");
  for (const key of ["display_name", "short_description", "default_prompt"]) {
    assert.match(openai, new RegExp(`^  ${key}: "[^"]+"$`, "m"));
  }
  assert.match(openai, /default_prompt: "使用 \$unity-game-spine-reskin /);
});

test("换皮边界冻结 Spine 结构、动画与玩法挂点", () => {
  for (const token of [
    "Bone 名称、父子层级和 Setup Pose",
    "Slot 名称、顺序和 Draw Order",
    "Attachment 名称、类型",
    "Mesh 顶点、三角形、UV、权重和 Linked Mesh",
    "IK、Transform、Path 约束",
    "动画、事件和 Attachment Timeline",
    "碰撞、攻击点、受击点、挂点及玩法代码",
  ]) assert.ok(SKILL_TEXT.includes(token), "缺少固定项：" + token);
  assert.match(SKILL_TEXT, /必须改变任一冻结项[\s\S]*`BLOCKED`/);
});

test("换皮嵌入 V0-V4 且不复用旧视觉动作阶段", () => {
  for (const stage of ["V0", "V1", "V2", "V3", "V4"]) assert.match(SKILL_TEXT, new RegExp(`### ${stage}`));
  assert.match(SKILL_TEXT, /A0-A6 只表示动作风险/);
  assert.match(SKILL_TEXT, /F2[\s\S]*独立 Spine\/视觉审查/);
  assert.match(SKILL_TEXT, /F3[\s\S]*Unity 编译、导入、PlayMode/);
  assert.match(SKILL_TEXT, /V2[\s\S]*资产地图/);
  assert.match(SKILL_TEXT, /skinId → slotName → attachmentName → sourceImage → atlasRegion/);
  assert.match(SKILL_TEXT, /禁止裁切、抠取、放大或轻微修饰高保真效果图/);
});

test("V3 分批必须依赖完整 V2 地图并维护追加式 JSON 台账", () => {
  assert.match(SKILL_TEXT, /只有完整 V2 资产地图与生产边界冻结后才可拆批/);
  assert.match(SKILL_TEXT, /分批只是执行调度，不能替代 V0-V2 任何门禁/);
  assert.match(SKILL_TEXT, /Artifacts\/Spine\/<characterId>\/batch-ledger\.json/);
  for (const field of [
    "taskId", "skinId", "batchId", "ordinal", "assetIds", "dependsOnBatchIds",
    "inputVersion", "inputSha256", "outputVersion", "outputSha256", "owner", "singleWriter",
    "status", "assetMapVersion", "assetMapSha256", "sourceRevision", "recoveryPoint",
    "unityVersion", "spineEditorVersion", "spineRuntimeVersion", "exportFormat",
  ]) assert.ok(SKILL_TEXT.includes("`" + field + "`"), "台账缺少字段：" + field);
  assert.match(SKILL_TEXT, /且只能在一个当前有效批次中出现/);
  assert.match(SKILL_TEXT, /禁止遗漏、重复、空批次或依赖循环/);
  assert.match(SKILL_TEXT, /PLANNED → READY → IN_PROGRESS → PRODUCED → REVIEWED → INTEGRATED → VALIDATED/);
  assert.match(SKILL_TEXT, /FAILED` 或 `BLOCKED`/);
  assert.match(SKILL_TEXT, /追加式 `events`/);
  assert.match(SKILL_TEXT, /禁止覆盖旧事件、旧证据或用聊天记录补写历史/);
  assert.match(SKILL_TEXT, /重新读取并核对当前 V2 地图\/Visual Bible 哈希、输入\/输出哈希、依赖批次状态/);
  assert.match(SKILL_TEXT, /`supersedes`\/`supersededBy`/);
});

test("批次全部完成后仍需整角色全量回归", () => {
  assert.match(SKILL_TEXT, /全部批次达到 `VALIDATED`、整批映射无遗漏且 V4 集成完成后/);
  assert.match(SKILL_TEXT, /完整 `assetId → skinId → slotName → attachmentName → atlasRegion` 映射/);
  for (const token of ["Atlas/材质/PMA/Draw Call/纹理内存", "全部动画与 Attachment Timeline", "默认/新 Skin、多实例隔离", "极端姿势、Clipping 和遮挡"]) {
    assert.ok(SKILL_TEXT.includes(token), "全量回归缺少：" + token);
  }
  assert.match(SKILL_TEXT, /只有全量回归实际 `PASS`，才可写整体 `COMPLETE`/);
});

test("源工程、导出、运行时与验证边界不可绕过", () => {
  assert.match(SKILL_TEXT, /没有可写[\s\S]*源工程时立即 `BLOCKED`/);
  assert.match(SKILL_TEXT, /禁止直接篡改导出 JSON、Binary 或 Atlas/);
  assert.match(SKILL_TEXT, /PMA 或 Straight Alpha/);
  assert.match(SKILL_TEXT, /Draw Call/);
  assert.match(SKILL_TEXT, /只有用户明确需要[\s\S]*才引入 Addressables/);
  assert.match(SKILL_TEXT, /保持原 `AnimationState`/);
  assert.match(SKILL_TEXT, /恢复 Slot setup pose/);
  assert.match(SKILL_TEXT, /回退默认 Skin/);
  assert.match(SKILL_TEXT, /不写入共享 `SkeletonData`/);
  assert.match(SKILL_TEXT, /站立、移动、攻击、受击、死亡/);
  assert.match(SKILL_TEXT, /不得自动启动 Standalone、Player 或真机/);
});

test("根包、安装器、README 与角色路由包含 Spine 换皮", () => {
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  assert.ok(packageJson.files.includes("unity-game-spine-reskin"));
  assert.match(readFileSync(resolve(ROOT, "scripts/install-project-skills.mjs"), "utf8"), /"unity-game-spine-reskin"/);
  assert.match(readFileSync(resolve(ROOT, "README.md"), "utf8"), /\$unity-game-spine-reskin/);
  assert.match(readFileSync(resolve(ROOT, "unity-development-workflow/SKILL.md"), "utf8"), /\$unity-game-spine-reskin/);
  assert.match(readFileSync(resolve(ROOT, "unity-game-visual-assets/SKILL.md"), "utf8"), /\$unity-game-spine-reskin/);
});

test("视觉角色使用现行 V0-V4 与 F2-F3 门禁", () => {
  const visual = readFileSync(resolve(ROOT, "unity-game-visual-assets/SKILL.md"), "utf8");
  assert.doesNotMatch(visual, /\bP[0-5]\b/);
  for (const stage of ["V0", "V1", "V2", "V3", "V4", "F2", "F3"]) {
    assert.match(visual, new RegExp(`\\b${stage}\\b`));
  }
  assert.match(visual, /A0-A6 只表示动作风险/);
  assert.match(visual, /未经用户明确要求，不启动 Standalone\/Player 或真机/);
});
