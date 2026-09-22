import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");
const ORCHESTRATOR = resolve(ROOT, "unity-development-workflow");
const CONTROL = resolve(ROOT, "unity-game-workflow-control");

/** 读取编排 Skill 下的 UTF-8 文本。 */
function orchestrationText(path) {
  return readFileSync(resolve(ORCHESTRATOR, path), "utf8");
}

/** 递归枚举普通文件，供语言与配置完整性检查使用。 */
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

test("控制面与领域编排职责分离", () => {
  const skill = orchestrationText("SKILL.md");
  assert.match(skill, /unity-game-workflow-control/);
  assert.match(skill, /唯一全局状态、风险门、任务范围和证据权威/);
  assert.match(skill, /不维护第二套状态机/);
  assert.match(skill, /Implementation Package/);
  assert.match(skill, /同一物理 Unity 项目的正式 Editor 写入保持单写者/);
});

test("Unity 执行层只使用 @Unity 插件与 Pipeline 命令", () => {
  const text = [
    orchestrationText("SKILL.md"),
    orchestrationText("references/project-discovery.md"),
    orchestrationText("references/foundation-workflow.md"),
    orchestrationText("references/delivery.md"),
    orchestrationText("references/unity-plugin-execution.md"),
    orchestrationText("references/workflow-overview.md"),
  ].join("\n");
  assert.match(text, /@Unity/);
  for (const command of ["unity status", "unity list", "unity command", "unity run", "unity test", "unity build"]) {
    assert.ok(text.includes(command), `缺少 @Unity 命令契约：${command}`);
  }
  assert.doesNotMatch(text, /CoplayDev|unity-mcp|mcpforunity:\/\/|manage_build|MCPForUnity/i);
});

test("六阶段与 V0-V4 是稳定用户视图", () => {
  const text = [orchestrationText("SKILL.md"), orchestrationText("references/workflow-overview.md"), orchestrationText("references/scene-loop.md")].join("\n");
  for (const phase of ["需求与范围", "全局基线", "基础工程", "场景与弹窗生产", "全局集成验证", "发布"]) assert.ok(text.includes(phase), `缺少阶段：${phase}`);
  for (const stage of ["V0", "V1", "V2", "V3", "V4"]) assert.ok(text.includes(stage), `缺少场景阶段：${stage}`);
  for (const unit of ["SHARED", "MODULE", "SCENE", "DISPLAY_LAYER", "INTEGRATION", "RELEASE"]) assert.ok(text.includes(unit), `缺少执行单元：${unit}`);
});

test("弹窗、响应式与视觉拆解合同使用 Unity 原生语义", () => {
  const text = [
    orchestrationText("SKILL.md"),
    orchestrationText("references/workflow-overview.md"),
    orchestrationText("references/scene-loop.md"),
    orchestrationText("references/visual-workflow.md"),
    orchestrationText("references/responsive-ui-contract.md"),
  ].join("\n");
  assert.match(text, /独立 `DISPLAY_LAYER` Work Item/);
  assert.match(text, /hostSceneId.*上下文/);
  assert.match(text, /visualRouteAnalysis/);
  assert.match(text, /assemblyAnalysis/);
  assert.match(text, /sourceScale=2/);
  for (const locale of ["en", "zh-CN", "ja", "ru", "es"]) assert.ok(text.includes(`\`${locale}\``), `缺少语言合同：${locale}`);
  assert.doesNotMatch(text, /devicePixelRatio|CSS 像素|deferred_layers/);
});

test("F0-F4 只保留全局质量门语义", () => {
  const text = orchestrationText("references/quality-gates.md");
  for (const gate of ["F0 范围与流程", "F1 规格一致性", "F2 领域质量", "F3 工程验证", "F4 高影响操作"]) assert.ok(text.includes(gate), `缺少门禁：${gate}`);
  assert.doesNotMatch(text, /F0 实际验证|F1 总控分诊|F3 总控收敛|F4 用户决定/);
  assert.match(orchestrationText("references/review-funnel.md"), /领域审查属于 F2/);
});

test("视觉流程使用 V0-V4 且不把动作等级当视觉阶段", () => {
  const text = orchestrationText("references/visual-workflow.md");
  assert.match(text, /视觉生产嵌入场景 V0-V4/);
  assert.match(text, /A0-A6 只表示动作风险等级/);
  assert.doesNotMatch(text, /A0 全局视觉|A1 草图|A2 高保真|A3 资产地图|A4 Unity/);
  assert.match(text, /禁止裁切、抠取、放大或轻微修饰/);
  assert.match(text, /AssetDatabase|\.meta|GUID|Importer/);
});

test("视觉领域审查 schema 不再内嵌旧漏斗", () => {
  const schema = JSON.parse(orchestrationText("schemas/visual-review.schema.json"));
  const template = YAML.parse(orchestrationText("templates/visual-review.yaml"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  assert.equal(schema.properties.schemaVersion.const, "1.0");
  assert.equal(JSON.stringify(schema).includes("F0_ACTUAL_VALIDATION"), false);
  assert.equal(ajv.compile(schema)(template), true);
  assert.equal(template.reviewers.every((reviewer) => reviewer.independent === true && reviewer.reviewerId !== template.authorId), true);
});

test("所有编排 schema 均为有效 JSON，生产目录不含 Python", () => {
  for (const path of listFiles(resolve(ORCHESTRATOR, "schemas")).filter((item) => item.endsWith(".schema.json"))) {
    assert.doesNotThrow(() => JSON.parse(readFileSync(path, "utf8")), `无效 JSON Schema：${path}`);
  }
  assert.equal(listFiles(ORCHESTRATOR).some((path) => path.endsWith(".py")), false);
});

test("新控制 Skill 作为安装时必需入口存在", () => {
  assert.match(readFileSync(resolve(CONTROL, "SKILL.md"), "utf8"), /唯一全局/);
});
