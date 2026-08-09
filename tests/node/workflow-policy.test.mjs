import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW = resolve(ROOT, "unity-development-workflow");
const CORE_DOCUMENTS = [
  "SKILL.md",
  "references/workflow-overview.md",
  "references/review-funnel.md",
  "references/visual-workflow.md",
  "references/scene-loop.md",
];

/** 递归枚举目录中的普通文件。 */
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** 根据 Schema 中当前候选策略的数组约束校验 F3/F4 候选数。 */
function validateReviewCardinality(review, schema) {
  const policyRule = schema.allOf.find((rule) => rule.if?.properties?.candidatePolicy?.const === review.candidatePolicy);
  assert.ok(policyRule, "Schema 缺少候选策略条件：" + review.candidatePolicy);
  const stageRules = policyRule.then.properties.funnel.properties.stages.prefixItems;
  const issues = [];
  for (let index = 0; index < stageRules.length; index += 1) {
    const properties = stageRules[index].properties ?? {};
    for (const field of ["inputCandidateIds", "outputCandidateIds"]) {
      const constraint = properties[field];
      if (constraint === undefined) continue;
      const count = review.funnel.stages[index][field].length;
      if (constraint.minItems !== undefined && count < constraint.minItems) issues.push(`${index}.${field}.minItems`);
      if (constraint.maxItems !== undefined && count > constraint.maxItems) issues.push(`${index}.${field}.maxItems`);
    }
  }
  return issues;
}

/** 创建只关注候选数约束的五级漏斗夹具。 */
function reviewFixture(candidatePolicy, f3Output, f4Input, f4Output) {
  const emptyStage = { inputCandidateIds: [], outputCandidateIds: [] };
  return {
    candidatePolicy,
    funnel: {
      stages: [emptyStage, emptyStage, emptyStage, { ...emptyStage, outputCandidateIds: f3Output }, { inputCandidateIds: f4Input, outputCandidateIds: f4Output }],
    },
  };
}

test("核心文档统一 F0-F4 与 A0-A4", () => {
  const text = CORE_DOCUMENTS.map((path) => readFileSync(resolve(WORKFLOW, path), "utf8")).join("\n");
  for (const token of ["F0 实际验证", "F1 总控分诊", "F2 独立非作者审核", "F3 总控收敛", "F4 用户决定"]) {
    assert.match(text, new RegExp(token));
  }
  for (const token of ["A0", "A1", "A2", "A3", "A4", "恰好三个", "三选一", "实际可查看", "结构化还原"]) {
    assert.ok(text.includes(token), "缺少流程语义：" + token);
  }
});

test("美术链包含三个独立用户门和像素复用禁令", () => {
  const text = readFileSync(resolve(WORKFLOW, "references/visual-workflow.md"), "utf8");
  assert.match(text, /A1[\s\S]*F4/);
  assert.match(text, /A2[\s\S]*F4/);
  assert.match(text, /A3[\s\S]*F4/);
  assert.match(text, /严禁从高保真效果图裁切/);
  assert.match(text, /严禁将整张效果图作为游戏或 UI 铺底/);
  assert.match(text, /删除全部草图、灰盒、占位/);
});

test("工作流生产目录不再包含 Python", () => {
  assert.equal(listFiles(WORKFLOW).filter((path) => path.endsWith(".py")).length, 0);
  assert.ok(existsSync(resolve(WORKFLOW, "scripts/workflow-files.mjs")));
  assert.ok(statSync(resolve(WORKFLOW, "scripts/workflow-files.mjs")).isFile());
});

test("视觉 Schema 是有效 JSON 且固定五级漏斗", () => {
  const schemaDirectory = resolve(WORKFLOW, "schemas");
  for (const path of listFiles(schemaDirectory).filter((item) => item.endsWith(".schema.json"))) {
    assert.doesNotThrow(() => JSON.parse(readFileSync(path, "utf8")), "无效 JSON Schema：" + path);
  }
  const review = JSON.parse(readFileSync(resolve(schemaDirectory, "visual-review.schema.json"), "utf8"));
  const bible = JSON.parse(readFileSync(resolve(WORKFLOW, "schemas/visual-bible.schema.json"), "utf8"));
  assert.equal(review.properties.schemaVersion.const, "3.0");
  assert.equal(review.properties.funnel.properties.stages.minItems, 5);
  assert.equal(review.properties.funnel.properties.stages.maxItems, 5);
  assert.equal(bible.allOf[0].then.properties.directionCandidates.minItems, 3);
  assert.equal(bible.allOf[0].then.properties.directionCandidates.maxItems, 3);
});

test("全局三选一与普通唯一候选使用不同的机器候选数约束", () => {
  const schema = JSON.parse(readFileSync(resolve(WORKFLOW, "schemas/visual-review.schema.json"), "utf8"));
  const globalIds = ["direction.a", "direction.b", "direction.c"];
  assert.deepEqual(validateReviewCardinality(reviewFixture("GLOBAL_EXACTLY_THREE", globalIds, globalIds, ["direction.b"]), schema), []);
  assert.match(validateReviewCardinality(reviewFixture("GLOBAL_EXACTLY_THREE", ["direction.a"], globalIds, ["direction.a"]), schema).join(","), /3\.outputCandidateIds\.minItems/);
  assert.match(validateReviewCardinality(reviewFixture("GLOBAL_EXACTLY_THREE", globalIds, globalIds, ["direction.a", "direction.b"]), schema).join(","), /4\.outputCandidateIds\.maxItems/);

  assert.deepEqual(validateReviewCardinality(reviewFixture("STANDARD", ["scene.v1"], ["scene.v1"], ["scene.v1"]), schema), []);
  assert.match(validateReviewCardinality(reviewFixture("STANDARD", ["scene.v1", "scene.v2"], ["scene.v1"], ["scene.v1"]), schema).join(","), /3\.outputCandidateIds\.maxItems/);
  assert.match(validateReviewCardinality(reviewFixture("STANDARD", ["scene.v1"], ["scene.v1", "scene.v2"], ["scene.v1"]), schema).join(","), /4\.inputCandidateIds\.maxItems/);
});

test("Visual Bible 方向证据要求稳定主体和来源修订", () => {
  const bible = JSON.parse(readFileSync(resolve(WORKFLOW, "schemas/visual-bible.schema.json"), "utf8"));
  assert.deepEqual(bible.$defs.directionEvidence.allOf[1].required, ["subjectId", "subjectVersion", "sourceRevision"]);
  assert.equal(bible.properties.directionCandidates.items.$ref, "#/$defs/directionEvidence");
  assert.equal(bible.properties.selectedDirection.$ref, "#/$defs/directionEvidence");

  const template = readFileSync(resolve(WORKFLOW, "templates/visual-bible.yaml"), "utf8");
  assert.equal((template.match(/subjectId: global-direction\.[abc]/g) ?? []).length, 3);
  assert.equal((template.match(/subjectVersion: direction-[abc]-v1/g) ?? []).length, 3);
  assert.ok((template.match(/sourceRevision: working-tree-snapshot-20260727/g) ?? []).length >= 4);
});
