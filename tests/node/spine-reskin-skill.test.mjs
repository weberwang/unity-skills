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

test("换皮严格执行 A0-A4 与独立 F4 用户门", () => {
  for (const stage of ["A0", "A1", "A2", "A3", "A4"]) assert.match(SKILL_TEXT, new RegExp(`### ${stage}`));
  assert.match(SKILL_TEXT, /A0[\s\S]*恰好三个有效候选[\s\S]*F4 三选一/);
  assert.match(SKILL_TEXT, /A1[\s\S]*F4 确认/);
  assert.match(SKILL_TEXT, /A2[\s\S]*F4 确认/);
  assert.match(SKILL_TEXT, /A3[\s\S]*资产地图经 F4 确认/);
  assert.match(SKILL_TEXT, /skinId → slotName → attachmentName → sourceImage → atlasRegion/);
  assert.match(SKILL_TEXT, /禁止裁切、抠取、放大或轻微修饰高保真效果图/);
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

test("视觉角色使用现行 A0-A4 与 F0-F4 门禁", () => {
  const visual = readFileSync(resolve(ROOT, "unity-game-visual-assets/SKILL.md"), "utf8");
  assert.doesNotMatch(visual, /\bP[0-5]\b/);
  for (const stage of ["A0", "A1", "A2", "A3", "A4", "F0", "F1", "F2", "F3", "F4"]) {
    assert.match(visual, new RegExp(`\\b${stage}\\b`));
  }
  assert.match(visual, /设备视觉批准只在适用的 G3/);
  assert.match(visual, /严禁自动启动真机、Standalone 或等价设备验收/);
});
