import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");
const MODELING_DIR = resolve(ROOT, "unity-game-3d-modeling");
const TEXTURING_DIR = resolve(ROOT, "unity-game-3d-texturing");

/** 以 UTF-8 读取单个 3D Skill 文档，保证断言使用稳定文本。 */
function readText(path) {
  return readFileSync(path, "utf8");
}

/** 解析 Skill 顶部 YAML frontmatter，供入口元数据测试复用。 */
function parseFrontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  assert.ok(match, "3D SKILL.md 必须以完整 YAML frontmatter 开头");
  return YAML.parse(match[1]);
}

test("两个 3D Skill 具备有效入口和代理界面", () => {
  const expectations = {
    "unity-game-3d-modeling": "references/mcp-modeling-workflow.md",
    "unity-game-3d-texturing": "references/pbr-texture-workflow.md",
  };
  for (const [skillName, reference] of Object.entries(expectations)) {
    const skillDir = resolve(ROOT, skillName);
    const skillText = readText(resolve(skillDir, "SKILL.md"));
    const frontmatter = parseFrontmatter(skillText);
    assert.deepEqual(Object.keys(frontmatter).sort(), ["description", "name"]);
    assert.equal(frontmatter.name, skillName);
    assert.match(skillText, new RegExp(reference.replaceAll("/", "\\/")));
    assert.ok(readText(resolve(skillDir, reference)));
    const agent = YAML.parse(readText(resolve(skillDir, "agents/openai.yaml")));
    assert.ok(agent.interface.display_name);
    assert.match(agent.interface.default_prompt, new RegExp(`\\$${skillName}`));
  }
});

test("建模 Skill 定义几何交付和验证", () => {
  const text = readText(resolve(MODELING_DIR, "SKILL.md"));
  for (const term of ["Visual Bible", "DCC MCP", "拓扑", "UV", "LOD", "Collider", "ModelImporter", "SHA-256", "BLOCKED", "$unity-game-3d-texturing", "$unity-game-qa-performance"]) assert.match(text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `建模 Skill 缺少职责或证据约束：${term}`);
  assert.match(text, /不负责 PBR 纹理/);
  assert.match(text, /不自批/);
});

test("贴图 Skill 定义 PBR 交付和验证", () => {
  const text = readText(resolve(TEXTURING_DIR, "SKILL.md"));
  for (const term of ["Visual Bible", "DCC MCP", "模型/UV 哈希", "PBR", "BaseColor", "Normal", "Metallic", "AO", "Smoothness", "sRGB", "URP", "TextureImporter", "Material", "BLOCKED", "$unity-game-3d-modeling"]) assert.match(text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `贴图 Skill 缺少职责或证据约束：${term}`);
  assert.match(text, /不静默修改/);
  assert.match(text, /独立/);
  assert.match(text, /QA/);
});

test("3D Skill 限制高风险 MCP 写入", () => {
  for (const skillDir of [MODELING_DIR, TEXTURING_DIR]) {
    const text = readText(resolve(skillDir, "SKILL.md"));
    for (const term of ["用户确认", "任意代码执行", "操作系统命令", "网络", "环境变量", "版本化派生文件"]) assert.match(text, new RegExp(term), `${skillDir} 缺少 MCP 安全约束：${term}`);
    assert.match(text, /同时只允许一个写代理/);
  }
});

test("3D Unity 写入使用 @Unity，DCC MCP 仅保留专用边界", () => {
  const text = [
    readText(resolve(MODELING_DIR, "SKILL.md")),
    readText(resolve(MODELING_DIR, "references/mcp-modeling-workflow.md")),
    readText(resolve(TEXTURING_DIR, "SKILL.md")),
    readText(resolve(TEXTURING_DIR, "references/pbr-texture-workflow.md")),
  ].join("\n");
  assert.match(text, /@Unity/);
  assert.match(text, /unity status/);
  assert.match(text, /unity list/);
  assert.match(text, /本地 DCC MCP/);
  assert.doesNotMatch(text, /CoplayDev|unity-mcp|mcpforunity:\/\/|manage_texture|manage_material|asset_gen|import_model_file/i);
});
