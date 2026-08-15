import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

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

/** 创建带完整拆解范围的用户批准记录，测试 A3 F4 门禁而不伪造模糊同意。 */
function approvalScopeItemFixture(item) {
  const scopeItem = {
    id: item.id,
    resourceId: item.resourceId,
    itemVersion: item.itemVersion,
    itemSpecSha256: item.itemSpecSha256,
    elementIndex: item.elementIndex,
    assetType: item.assetType,
    purpose: item.purpose,
    generationBrief: item.generationBrief,
    bounds: item.bounds,
    stateVariants: item.stateVariants,
    targetPrefabNodeIds: item.targetPrefabNodeIds,
    targetPath: item.targetPath,
    delivery: item.delivery,
    action: item.action,
    splitRationale: item.splitRationale,
  };
  if (item.delivery !== "NOT_APPLICABLE") {
    Object.assign(scopeItem, {
      targetSize: item.targetSize,
      alphaRequired: item.alphaRequired,
      pivot: item.pivot,
      pixelsPerUnit: item.pixelsPerUnit,
      border: item.border,
    });
  }
  if (item.action === "REUSE") {
    Object.assign(scopeItem, {
      existingAssetId: item.existingAssetId,
      reuseReason: item.reuseReason,
      reuseResourcePlan: item.reuseResourcePlan,
    });
  }
  return scopeItem;
}

/** 创建带完整拆解范围的用户批准记录，测试 A3 F4 门禁而不伪造模糊同意。 */
function splitPlanApprovalFixture(plan) {
  return {
    approvalType: "ASSET_MAP",
    authority: "USER",
    subjectId: plan.id,
    subjectVersion: plan.sourceVersion,
    approvedBy: "user",
    approvedAtUtc: "2026-07-27T09:00:00Z",
    evidencePath: "Artifacts/Visual/Approvals/split-plan-user-approval.yaml",
    evidenceSha256: "1".repeat(64),
    approvalScope: {
      annotatedPreview: {
        type: "annotated-split-preview",
        path: plan.annotatedPreview.path,
        sha256: plan.annotatedPreview.sha256,
        sourcePath: plan.annotatedPreview.sourcePath,
        sourceSha256: plan.annotatedPreview.sourceSha256,
        sourceVersion: plan.annotatedPreview.sourceVersion,
        width: plan.annotatedPreview.width,
        height: plan.annotatedPreview.height,
        annotations: plan.annotatedPreview.annotations,
      },
      sourceHighFidelity: {
        subjectId: plan.sourceImage.subjectId,
        subjectVersion: plan.sourceImage.subjectVersion,
        path: plan.sourceImage.path,
        sha256: plan.sourceImage.sha256,
      },
      items: plan.items.map(approvalScopeItemFixture),
      excludedElements: plan.coverageDeclaration.excludedElements,
    },
  };
}

/** 校验效果图框选标注与拆解项的一一对应及坐标边界。 */
function assertAnnotationMappings(preview, items) {
  assert.ok(Array.isArray(preview.annotations) && preview.annotations.length > 0);
  const itemIds = new Set(items.map((item) => item.id));
  const annotationIds = new Set();
  assert.equal(preview.annotations.length, items.length);
  for (const annotation of preview.annotations) {
    assert.ok(itemIds.has(annotation.itemId));
    assert.equal(annotationIds.has(annotation.itemId), false);
    annotationIds.add(annotation.itemId);
    const item = items.find((candidate) => candidate.id === annotation.itemId);
    assert.equal(annotation.elementIndex, item.elementIndex);
    assert.deepEqual(annotation.bounds, item.bounds);
    assert.equal(annotation.productionRoute, item.action);
    assert.match(annotation.label, new RegExp(`\\[${String(item.elementIndex).padStart(2, "0")}\\]\\[${item.action}\\]`));
    assert.ok(annotation.brief.trim().length > 0);
    assert.ok(annotation.bounds.x + annotation.bounds.width <= preview.width);
    assert.ok(annotation.bounds.y + annotation.bounds.height <= preview.height);
  }
  assert.deepEqual(annotationIds, itemIds);
}

/** 加载工作流 Schema 并使用项目统一的 2020-12 校验器。 */
function createWorkflowValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of ["reuse-resource-plan.schema.json", "common.schema.json", "split-plan.schema.json", "image-generation.schema.json", "image-task.schema.json"]) {
    const path = resolve(WORKFLOW, "schemas", name);
    ajv.addSchema(JSON.parse(readFileSync(path, "utf8")));
  }
  return ajv;
}

/** 校验工作流样例并把机器错误转成可读断言。 */
function assertWorkflowPayload(ajv, schemaId, payload, expected = true) {
  const valid = ajv.validate(`https://codex.local/unity-workflow/schemas/${schemaId}.schema.json`, payload);
  assert.equal(valid, expected, expected ? JSON.stringify(ajv.errors) : "缺少预期的 Schema 门禁");
}

/** 校验拆解证据与用户批准是否绑定到同一份当前方案。 */
function hasCurrentSplitPlanBinding(payload) {
  const evidence = payload.splitPlanEvidence;
  const approval = payload.splitPlanApproval;
  return Boolean(
    evidence && approval &&
    approval.approvalType === "ASSET_MAP" &&
    approval.authority === "USER" &&
    approval.subjectId === evidence.subjectId &&
    approval.subjectVersion === evidence.subjectVersion &&
    typeof approval.evidencePath === "string" &&
    /^[a-fA-F0-9]{64}$/.test(approval.evidenceSha256 ?? ""),
  );
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

test("A3 APPROVED 必须是 USER/ASSET_MAP 且覆盖完整拆解对象", () => {
  const ajv = createWorkflowValidator();
  const plan = YAML.parse(readFileSync(resolve(WORKFLOW, "templates/split-plan.yaml"), "utf8"));
  assertWorkflowPayload(ajv, "split-plan", plan);
  assertAnnotationMappings(plan.annotatedPreview, plan.items);

  const withoutAnnotations = structuredClone(plan);
  delete withoutAnnotations.annotatedPreview.annotations;
  assertWorkflowPayload(ajv, "split-plan", withoutAnnotations, false);

  const withoutBrief = structuredClone(plan);
  delete withoutBrief.annotatedPreview.annotations[0].brief;
  assertWorkflowPayload(ajv, "split-plan", withoutBrief, false);

  const withoutLabel = structuredClone(plan);
  delete withoutLabel.annotatedPreview.annotations[0].label;
  assertWorkflowPayload(ajv, "split-plan", withoutLabel, false);

  const withoutRoute = structuredClone(plan);
  delete withoutRoute.annotatedPreview.annotations[0].productionRoute;
  assertWorkflowPayload(ajv, "split-plan", withoutRoute, false);

  const mismatchedRoute = structuredClone(plan);
  mismatchedRoute.annotatedPreview.annotations[0].productionRoute = "REUSE";
  assert.throws(() => assertAnnotationMappings(mismatchedRoute.annotatedPreview, mismatchedRoute.items));

  const approved = structuredClone(plan);
  approved.status = "APPROVED";
  approved.userApproval = splitPlanApprovalFixture(approved);
  assertWorkflowPayload(ajv, "split-plan", approved);

  const missingApprovalScope = structuredClone(approved);
  delete missingApprovalScope.userApproval.approvalScope;
  assertWorkflowPayload(ajv, "split-plan", missingApprovalScope, false);

  const wrongAuthority = structuredClone(approved);
  wrongAuthority.userApproval.authority = "INDEPENDENT_REVIEWER";
  assertWorkflowPayload(ajv, "split-plan", wrongAuthority, false);

  const requiredScope = ajv.getSchema("https://codex.local/unity-workflow/schemas/common.schema.json").schema.$defs.splitPlanApprovalScope.required;
  for (const field of ["annotatedPreview", "sourceHighFidelity", "items", "excludedElements"]) assert.ok(requiredScope.includes(field));
  const scopeItemSchema = ajv.getSchema("https://codex.local/unity-workflow/schemas/common.schema.json").schema.$defs.splitPlanApprovalScope.properties.items.items;
  for (const field of ["elementIndex", "assetType", "purpose", "generationBrief", "bounds", "stateVariants", "targetPrefabNodeIds", "targetPath", "delivery", "action", "splitRationale"]) assert.ok(scopeItemSchema.required.includes(field));
  for (const field of ["targetSize", "alphaRequired", "pivot", "pixelsPerUnit", "border"]) assert.equal(scopeItemSchema.required.includes(field), false);
  const bitmapRule = scopeItemSchema.allOf.find((rule) => rule.if?.properties?.delivery?.const === "NOT_APPLICABLE");
  assert.ok(bitmapRule);
  assert.deepEqual(bitmapRule.else.required.sort(), ["alphaRequired", "border", "pivot", "pixelsPerUnit", "targetSize"].sort());
});

test("资源复用计划必须冻结完整来源和 Unity 证据", () => {
  const ajv = createWorkflowValidator();
  const plan = YAML.parse(readFileSync(resolve(WORKFLOW, "templates/split-plan.yaml"), "utf8"));
  const reuseItem = plan.items.find((item) => item.action === "REUSE");
  const programmaticItem = plan.items.find((item) => item.action === "PROGRAMMATIC");
  assert.ok(reuseItem?.reuseResourcePlan);
  assert.equal(reuseItem.reuseResourcePlan.effectImagePixelReuse, "FORBIDDEN");
  assert.equal(Object.hasOwn(reuseItem.reuseResourcePlan, "pixelReuse"), false);
  assert.equal(programmaticItem.delivery, "NOT_APPLICABLE");
  for (const field of ["targetSize", "alphaRequired", "pivot", "pixelsPerUnit", "border"]) assert.equal(Object.hasOwn(programmaticItem, field), false);

  for (const field of ["effectImagePixelReuse", "sourceSha256", "unityGuid", "assetRegisterEvidence", "licenseEvidence", "visualBibleStyleReview", "importerEvidence", "unityValidationEvidence"]) {
    const invalid = structuredClone(plan);
    delete invalid.items.find((item) => item.action === "REUSE").reuseResourcePlan[field];
    assertWorkflowPayload(ajv, "split-plan", invalid, false);
  }

  const legacyName = structuredClone(plan);
  legacyName.items.find((item) => item.action === "REUSE").reuseResourcePlan.pixelReuse = "FORBIDDEN";
  assertWorkflowPayload(ajv, "split-plan", legacyName, false);

  const disguised = structuredClone(plan);
  disguised.items[0].reuseResourcePlan = structuredClone(reuseItem.reuseResourcePlan);
  assertWorkflowPayload(ajv, "split-plan", disguised, false);
});

test("RUNTIME_ASSET_ITEM 缺少当前拆解批准不能进入生成", () => {
  const ajv = createWorkflowValidator();
  const item = YAML.parse(readFileSync(resolve(WORKFLOW, "templates/image-generation-item.yaml"), "utf8"));
  assertWorkflowPayload(ajv, "image-generation", item);
  assert.equal(hasCurrentSplitPlanBinding(item), true);
  assertAnnotationMappings(item.splitPlanApproval.approvalScope.annotatedPreview, item.splitPlanApproval.approvalScope.items);

  const withoutApproval = structuredClone(item);
  delete withoutApproval.splitPlanApproval;
  assertWorkflowPayload(ajv, "image-generation", withoutApproval, false);

  const withoutApprovalScope = structuredClone(item);
  delete withoutApprovalScope.splitPlanApproval.approvalScope;
  assertWorkflowPayload(ajv, "image-generation", withoutApprovalScope, false);

  const withoutScopeAnnotations = structuredClone(item);
  delete withoutScopeAnnotations.splitPlanApproval.approvalScope.annotatedPreview.annotations;
  assertWorkflowPayload(ajv, "image-generation", withoutScopeAnnotations, false);

  const withoutScopeBrief = structuredClone(item);
  delete withoutScopeBrief.splitPlanApproval.approvalScope.annotatedPreview.annotations[0].brief;
  assertWorkflowPayload(ajv, "image-generation", withoutScopeBrief, false);

  const staleBinding = structuredClone(item);
  staleBinding.splitPlanApproval.subjectVersion = "old-v0";
  assert.equal(hasCurrentSplitPlanBinding(staleBinding), false);
});

test("image-task 只有 DRAFT/终止状态可缺少拆解批准", () => {
  const ajv = createWorkflowValidator();
  const task = YAML.parse(readFileSync(resolve(WORKFLOW, "templates/image-task.yaml"), "utf8"));
  assertWorkflowPayload(ajv, "image-task", task);
  assert.equal(hasCurrentSplitPlanBinding(task), true);
  assertAnnotationMappings(task.splitPlanApproval.approvalScope.annotatedPreview, task.splitPlanApproval.approvalScope.items);

  const draft = structuredClone(task);
  draft.status = "DRAFT";
  delete draft.splitPlanEvidence;
  delete draft.splitPlanApproval;
  assertWorkflowPayload(ajv, "image-task", draft);

  for (const status of ["GENERATING", "REVIEWING", "IMPORTED", "VALIDATED"]) {
    const active = structuredClone(task);
    active.status = status;
    const activeWithoutApproval = structuredClone(active);
    delete activeWithoutApproval.splitPlanApproval;
    assertWorkflowPayload(ajv, "image-task", activeWithoutApproval, false);

    const activeWithoutApprovalScope = structuredClone(active);
    delete activeWithoutApprovalScope.splitPlanApproval.approvalScope;
    assertWorkflowPayload(ajv, "image-task", activeWithoutApprovalScope, false);
  }

  for (const status of ["BLOCKED", "REJECTED"]) {
    const terminal = structuredClone(task);
    terminal.status = status;
    delete terminal.splitPlanEvidence;
    delete terminal.splitPlanApproval;
    assertWorkflowPayload(ajv, "image-task", terminal);
  }
});

test("模板和文档声明位图拆解人工门禁", () => {
  const templates = [
    readFileSync(resolve(WORKFLOW, "templates/split-plan.yaml"), "utf8"),
    readFileSync(resolve(WORKFLOW, "templates/image-generation-item.yaml"), "utf8"),
    readFileSync(resolve(WORKFLOW, "templates/image-task.yaml"), "utf8"),
  ].join("\n");
  assert.match(templates, /annotatedPreview:/);
  assert.match(templates, /annotations:/);
  assert.match(templates, /coordinateSpace: EFFECT_IMAGE_PIXELS/);
  assert.match(templates, /\[01\]\[GENERATE\]/);
  assert.match(templates, /\[02\]\[REUSE\]/);
  assert.match(templates, /\[03\]\[PROGRAMMATIC\]/);
  assert.equal((templates.match(/effectImagePixelReuse: FORBIDDEN/g) ?? []).length, 3);
  assert.match(templates, /splitPlanApproval:/);
  assert.match(templates, /authority: USER/);

  const docs = [
    readFileSync(resolve(WORKFLOW, "SKILL.md"), "utf8"),
    readFileSync(resolve(WORKFLOW, "references/visual-workflow.md"), "utf8"),
    readFileSync(resolve(WORKFLOW, "references/asset-pipeline.md"), "utf8"),
    readFileSync(resolve(WORKFLOW, "references/scene-loop.md"), "utf8"),
  ].join("\n");
  for (const phrase of ["annotated split preview", "框选", "稳定序号", "简要说明", "productionRoute", "缺标", "框选越界", "existingAssetId", "reuseResourcePlan", "effectImagePixelReuse", "sourcePath", "sourceSha256", "USER", "ASSET_MAP", "批准前禁止", "含糊“继续”", "拆解项增删", "Scene/Prefab/UI"]) assert.ok(docs.includes(phrase), `缺少门禁文档语义：${phrase}`);
});
