import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");
const WORKFLOW = resolve(ROOT, "unity-development-workflow");
const SCHEMA_DIR = resolve(WORKFLOW, "schemas");
const SHA = "a".repeat(64);
const TEMPLATE_SCHEMA_PAIRS = [
  ["templates/split-plan.yaml", "split-plan.schema.json"],
  ["templates/prefab-structure.yaml", "prefab-structure.schema.json"],
  ["templates/prefab-assembly.yaml", "prefab-assembly.schema.json"],
  ["templates/scene-manifest.yaml", "scene-manifest.schema.json"],
  ["templates/runtime-visual-evidence.yaml", "runtime-visual-evidence.schema.json"],
  ["templates/runtime-visual-evidence-mobile.yaml", "runtime-visual-evidence.schema.json"],
  ["templates/scene-2d-adaptation.yaml", "scene-2d-adaptation.schema.json"],
];

/** 返回最小的可追溯证据，所有合同 fixture 共用同一格式。 */
function evidence(type = "test-evidence") {
  return { type, path: "Artifacts/test.json", sha256: SHA };
}

/** 创建显式的 Unity 布局绑定；测试禁止依靠几何字段推断父子关系。 */
function layoutBinding(parentElementId = "root") {
  return {
    parentElementId,
    hierarchyRelation: "PARENT_CHILD",
    coordinateSpace: "CANVAS_LOCAL",
    uiLayout: {
      groupingBasis: ["POSITION", "LAYOUT"],
      layoutOwner: "PARENT",
      sizePolicy: "CONTENT",
      overflowPolicy: "KEEP_VISIBLE",
      safeAreaPolicy: "INSIDE_SAFE_AREA",
      interactionPolicy: "NON_INTERACTIVE",
      minimumSize: { width: 44, height: 44 },
    },
    anchor: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
    pivot: { x: 0.5, y: 0.5 },
    constraints: ["safe-area"],
    resizePolicy: "SCALE_WITH_PARENT",
  };
}

/** 创建带资格证据的 Unity 视觉来源分析。 */
function visualRouteAnalysis(route = "UNITY_NATIVE") {
  return {
    elementType: "text",
    distinctiveVisual: {
      isDistinctive: false,
      observedFeatures: ["dynamic text"],
      assetFirstDecision: "NATIVE_ALLOWED",
    },
    selectedRoute: route,
    routeReason: "文本由运行时数据驱动，使用 Unity 原生文本组件。",
    sourceKind: "ATOMIC",
    fullScreenCapture: false,
    nativeSuitability: {
      eligible: route === "UNITY_NATIVE",
      primitiveBasis: ["TEXT"],
      reason: "文本属于允许的 Unity 原生路线。",
      evidence: evidence("native-route-review"),
    },
    reuseSuitability: {
      eligible: route !== "REUSE",
      reason: "当前元素不复用已有资产。",
      evidence: evidence("reuse-route-review"),
    },
    productionMethod: "UNITY_NATIVE",
    deliveryKind: "UNITY_COMPONENT",
    finalOwner: "RUNTIME_DATA",
  };
}

/** 创建只描述 Scene/Prefab/UI 结构化装配的分析。 */
function assemblyAnalysis(nodeId = "hud-title") {
  return {
    strategy: "STRUCTURED_UNITY_ASSEMBLY",
    unityAssetType: "UIDOCUMENT",
    nodeId,
    parentNodeId: "hud-root",
    layoutSystem: "UI_TOOLKIT",
    fullScreenCapture: false,
    evidence: evidence("assembly-analysis"),
  };
}

/** 返回响应式合同引用和版本集合。 */
function responsiveContracts() {
  return {
    responsiveContractRef: {
      contractId: "scene-responsive",
      version: "1.0",
      path: "Artifacts/Contracts/responsive-ui.json",
      sha256: SHA,
      scope: "SCENE",
    },
    contractVersions: { responsive: "1.0", layout: "1.0", visualBaseline: "1.0", schema: "2.0" },
  };
}

/** 返回 Unity 真实运行测量 fixture，覆盖 Screen、Camera、Canvas、输入和状态轨迹。 */
function runtimeMeasurement() {
  return {
    runtimeMeasured: true,
    measuredAtUtc: "2026-09-22T12:00:00Z",
    screen: { width: 1920, height: 1080 },
    gameView: { width: 1920, height: 1080 },
    backbuffer: { width: 1920, height: 1080 },
    camera: {
      pixelRect: { x: 0, y: 0, width: 1920, height: 1080 },
      orthographicSize: 5,
      projection: "ORTHOGRAPHIC",
    },
    canvas: { kind: "PANEL_SETTINGS", panelSettings: { scaleMode: "ScaleWithScreenSize" } },
    safeArea: { x: 0, y: 0, width: 1920, height: 1080 },
    orientation: "LANDSCAPE",
    resize: { observed: true, trajectory: [{ width: 1280, height: 720, orientation: "LANDSCAPE" }] },
    inputHitTests: [{ system: "BOTH", targetNodeId: "hud-title", hit: true, position: { x: 100, y: 100 } }],
    screenshot: {
      path: "Artifacts/Visual/Runtime/scene.png",
      sha256: SHA,
      width: 1920,
      height: 1080,
      capturedAtUtc: "2026-09-22T12:00:00Z",
    },
    candidateSha256: SHA,
    stateTrace: [{ stateId: "menu", action: "open" }],
    verificationStatus: "PASS",
  };
}

/** 建立 Ajv 2020 实例并注册工作流所有 schema，使相对引用可被真实解析。 */
function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of readdirSync(SCHEMA_DIR).filter((item) => item.endsWith(".schema.json"))) {
    ajv.addSchema(JSON.parse(readFileSync(resolve(SCHEMA_DIR, name), "utf8")));
  }
  return ajv;
}

/** 使用已注册的 schema 校验 fixture，并返回验证错误供断言失败时定位。 */
function validate(ajv, fileName, payload) {
  const schema = JSON.parse(readFileSync(resolve(SCHEMA_DIR, fileName), "utf8"));
  const validator = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const valid = validator(payload);
  return { valid, errors: validator.errors };
}

/** 组装包含视觉来源、结构装配和布局绑定的拆解计划。 */
function splitPlan() {
  const annotation = {
    elementIndex: 1,
    itemId: "menu-title-item",
    coordinateSpace: "EFFECT_IMAGE_PIXELS",
    bounds: { x: 0, y: 0, width: 320, height: 64 },
    label: "Menu title",
    productionRoute: "PROGRAMMATIC",
    brief: "Unity UI Toolkit 动态标题",
    parentElementId: "menu-root",
    semanticGrouping: { kind: "part", rationale: "标题依赖菜单容器的位置布局。" },
    visualRouteAnalysis: visualRouteAnalysis(),
    assemblyAnalysis: assemblyAnalysis(),
    layoutBinding: layoutBinding("menu-root"),
  };
  return {
    schemaVersion: "1.0",
    id: "menu-split",
    projectId: "demo-game",
    sceneId: "menu",
    sourceRevision: "main@abc",
    projectStateVersion: "state-1",
    sourceVersion: "source-1",
    visualBibleVersion: "visual-1",
    sourceOrigin: "REVIEW_FUNNEL_APPROVED",
    visualBibleEvidence: { ...evidence("visual-bible"), subjectId: "visual-bible", subjectVersion: "1", sourceRevision: "main@abc", projectStateVersion: "state-1" },
    prefabStructureEvidence: { ...evidence("prefab-structure"), subjectId: "prefab-structure", subjectVersion: "1" },
    highFidelityGenerationEvidence: {
      ...evidence("image-generation"), subjectId: "source", subjectVersion: "1", candidateId: "candidate-1",
      candidatePath: "Artifacts/Visual/candidate.png", candidateSha256: SHA, candidateVisualVersion: "1",
    },
    highFidelityReviewEvidence: { ...evidence("visual-review"), subjectId: "visual-review", subjectVersion: "1" },
    sourceImage: { ...evidence("confirmed-high-fidelity-visual"), subjectId: "source", subjectVersion: "1" },
    sourceDimensions: { width: 1920, height: 1080 },
    annotatedPreview: {
      type: "annotated-split-preview", path: "Artifacts/Visual/annotated.png", sha256: SHA,
      sourcePath: "Artifacts/Visual/source.png", sourceSha256: SHA, sourceVersion: "1", width: 1920, height: 1080,
      annotations: [annotation],
    },
    coverageDeclaration: { allRequiredVisualElementsMapped: true, declaredItemCount: 1, excludedElements: [] },
    splitQuestions: [{ id: "q1", question: "标题是否动态？", answer: "是", decisionImpact: "使用 Unity 原生文本" }],
    items: [{
      id: "menu-title-item", resourceId: "menu-title-resource", itemVersion: "1", itemSpecSha256: SHA,
      elementIndex: 1, assetType: "TEXT", purpose: "菜单标题", generationBrief: "动态标题", splitRationale: "数据驱动文本",
      targetPrefabNodeIds: ["hud-title"], targetPath: "Assets/UI/MenuTitle.uxml", stateVariants: [{ id: "default", description: "默认" }],
      bounds: { x: 0, y: 0, width: 320, height: 64 }, delivery: "NOT_APPLICABLE", action: "PROGRAMMATIC",
      parentElementId: "menu-root", semanticGrouping: { kind: "part", rationale: "标题依赖菜单容器的位置布局。" },
      visualRouteAnalysis: visualRouteAnalysis(), assemblyAnalysis: assemblyAnalysis(), layoutBinding: layoutBinding("menu-root"),
    }],
    reviews: [],
    status: "DRAFT",
  };
}

/** 创建最小 Prefab 结构合同，节点身份同时绑定拆解元素、父级、语义和布局。 */
function prefabStructure() {
  const node = {
    id: "hud-title", name: "HudTitle", nodeType: "UI", interactive: false, parentId: "hud-root",
    decompositionElementId: "menu-title-item", semanticGrouping: { kind: "part", rationale: "标题是 HUD 组件的一部分。" },
    layoutBinding: layoutBinding("hud-root"), position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, components: ["UIDocument"],
  };
  return {
    schemaVersion: "1.0", id: "menu-prefab-structure", projectId: "demo-game", sceneId: "menu", version: "1",
    sourceRevision: "main@abc", projectStateVersion: "state-1", visualBibleVersion: "visual-1",
    visualBibleEvidence: { ...evidence("visual-bible"), subjectId: "visual-bible", subjectVersion: "1" },
    prefabs: [{ id: "menu-prefab", path: "Assets/UI/Menu.prefab", purpose: "菜单", nodes: [node] }],
    sceneInstances: [{ id: "menu-prefab-instance", prefabId: "menu-prefab", scenePath: "Assets/Scenes/Menu.unity", parentId: "scene-root", decompositionElementId: "menu-root", semanticGrouping: { kind: "region", rationale: "菜单根节点是场景区域。" }, layoutBinding: layoutBinding("scene-root"), position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
    lowFidelityPreview: { ...evidence("low-fidelity-prefab-preview"), subjectId: "prefab-structure", subjectVersion: "1" },
    status: "DRAFT",
  };
}

/** 创建最小 Prefab 装配合同，资产消费节点与拆解身份保持显式绑定。 */
function prefabAssembly() {
  const node = {
    id: "hud-title", name: "HudTitle", decompositionElementId: "menu-title-item", parentId: "hud-root",
    resourceId: "menu-title-resource", components: ["UIDocument"],
    semanticGrouping: { kind: "part", rationale: "标题是 HUD 组件的一部分。" }, layoutBinding: layoutBinding("hud-root"),
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
  };
  return {
    schemaVersion: "1.0", id: "menu-prefab-assembly", projectId: "demo-game", sceneId: "menu", version: "1",
    prefabStructureEvidence: { ...evidence("prefab-structure"), subjectId: "prefab-structure", subjectVersion: "1" },
    splitPlanEvidence: { ...evidence("split-plan"), subjectId: "menu-split", subjectVersion: "1" },
    assetBindings: [{
      itemId: "menu-title-item", resourceId: "menu-title-resource", decompositionElementId: "menu-title-item",
      productionType: "PROGRAMMATIC", productionEvidence: evidence("production"), assetPath: "Assets/UI/MenuTitle.uxml", assetGuid: "a".repeat(32), consumerNodeIds: ["hud-title"],
    }],
    prefabs: [{ id: "menu-prefab", path: "Assets/UI/Menu.prefab", nodes: [node] }],
    scene: {
      path: "Assets/Scenes/Menu.unity",
      prefabInstances: [{ id: "menu-prefab-instance", prefabId: "menu-prefab", decompositionElementId: "menu-root", parentId: "scene-root", semanticGrouping: { kind: "region", rationale: "菜单根节点是场景区域。" }, layoutBinding: layoutBinding("scene-root"), position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }],
    },
    lowFidelityCleanup: { removedItems: [], remainingPlaceholderCount: 0, structurePreserved: true, referencesClean: true, evidence: [{ ...evidence("cleanup"), subjectId: "menu", subjectVersion: "1" }], status: "PASS" },
    unityValidation: "NOT_RUN", evidence: [evidence("prefab-assembly")], status: "PLANNED",
  };
}

/** 创建尚未完成 V4 的场景 manifest，验证响应式合同在场景层可被引用。 */
function sceneManifest() {
  const sceneEvidence = (type) => ({ ...evidence(type), subjectId: "menu", subjectVersion: "1", sourceRevision: "main@abc", projectStateVersion: "state-1" });
  return {
    schemaVersion: "1.0", projectId: "demo-game", sourceRevision: "main@abc", projectStateVersion: "state-1", id: "menu", version: "1",
    dimension: "3D", purpose: "菜单", lifecycle: "MENU", decompositionPlan: sceneEvidence("decomposition-plan"),
    entryConditions: ["boot"], exitConditions: ["start-game"], dependencies: [], moduleDependencies: ["ui"], sharedCapabilities: [],
    ownedAssets: ["Assets/Scenes/Menu.unity"], gameplayVisualTasks: ["menu-background"], uiVisualTasks: ["menu-title"],
    prefabStructure: sceneEvidence("prefab-structure"), highFidelityVisualReview: sceneEvidence("visual-review"), assetMap: sceneEvidence("split-plan"), prefabAssembly: sceneEvidence("prefab-assembly"),
    qualityGate: { minimumFps: 60, maximumLoadTimeSeconds: 3 }, status: "DRAFT", approvals: [], qualityReportPaths: [], editorCapturePaths: [], qualityReports: [], editorCaptures: [],
    visualReviews: { game: sceneEvidence("visual-review"), ui: sceneEvidence("visual-review"), runtime: sceneEvidence("visual-review") }, evidence: [evidence("scene-manifest")],
    ...responsiveContracts(),
  };
}

test("视觉合同 schema 可加载且合法拆解具备来源与装配证据", () => {
  const ajv = createAjv();
  const result = validate(ajv, "split-plan.schema.json", splitPlan());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const structure = validate(ajv, "prefab-structure.schema.json", prefabStructure());
  assert.equal(structure.valid, true, JSON.stringify(structure.errors));
  const assembly = validate(ajv, "prefab-assembly.schema.json", prefabAssembly());
  assert.equal(assembly.valid, true, JSON.stringify(assembly.errors));
  const scene = validate(ajv, "scene-manifest.schema.json", sceneManifest());
  assert.equal(scene.valid, true, JSON.stringify(scene.errors));
});

test("V2 布局绑定要求 UI 布局策略并拒绝重复分组依据", () => {
  const ajv = createAjv();
  const missingUiLayout = splitPlan();
  delete missingUiLayout.items[0].layoutBinding.uiLayout;
  assert.equal(validate(ajv, "split-plan.schema.json", missingUiLayout).valid, false);

  const duplicatedGroupingBasis = splitPlan();
  // 分组依据用于描述不同的父子组织原因，重复项不能提供额外布局语义。
  duplicatedGroupingBasis.items[0].layoutBinding.uiLayout.groupingBasis = ["LAYOUT", "LAYOUT"];
  assert.equal(validate(ajv, "split-plan.schema.json", duplicatedGroupingBasis).valid, false);

  const sameLevel = splitPlan();
  sameLevel.items[0].layoutBinding.hierarchyRelation = "SAME_LEVEL";
  sameLevel.items[0].layoutBinding.uiLayout.groupingBasis = [];
  assert.equal(validate(ajv, "split-plan.schema.json", sameLevel).valid, true);
  sameLevel.items[0].layoutBinding.uiLayout.groupingBasis = ["POSITION"];
  assert.equal(validate(ajv, "split-plan.schema.json", sameLevel).valid, false);

  const uiItemWithPrefabCoordinates = splitPlan();
  uiItemWithPrefabCoordinates.items[0].layoutBinding.coordinateSpace = "PREFAB_LOCAL";
  delete uiItemWithPrefabCoordinates.items[0].layoutBinding.uiLayout;
  assert.equal(validate(ajv, "split-plan.schema.json", uiItemWithPrefabCoordinates).valid, false);

  const uiNodeWithPrefabCoordinates = prefabStructure();
  uiNodeWithPrefabCoordinates.prefabs[0].nodes[0].layoutBinding.coordinateSpace = "PREFAB_LOCAL";
  delete uiNodeWithPrefabCoordinates.prefabs[0].nodes[0].layoutBinding.uiLayout;
  assert.equal(validate(ajv, "prefab-structure.schema.json", uiNodeWithPrefabCoordinates).valid, false);

  const uiAssemblyWithPrefabCoordinates = prefabAssembly();
  uiAssemblyWithPrefabCoordinates.prefabs[0].nodes[0].layoutBinding.coordinateSpace = "PREFAB_LOCAL";
  delete uiAssemblyWithPrefabCoordinates.prefabs[0].nodes[0].layoutBinding.uiLayout;
  assert.equal(validate(ajv, "prefab-assembly.schema.json", uiAssemblyWithPrefabCoordinates).valid, false);
});

test("视觉合同拒绝整屏来源、缺父级和缺 REUSE 精确绑定", () => {
  const ajv = createAjv();
  const invalidCapture = splitPlan();
  invalidCapture.items[0].assemblyAnalysis.fullScreenCapture = true;
  assert.equal(validate(ajv, "split-plan.schema.json", invalidCapture).valid, false);

  const invalidParent = splitPlan();
  delete invalidParent.items[0].parentElementId;
  assert.equal(validate(ajv, "split-plan.schema.json", invalidParent).valid, false);

  const invalidReuse = splitPlan();
  invalidReuse.items[0].visualRouteAnalysis = visualRouteAnalysis("REUSE");
  assert.equal(validate(ajv, "split-plan.schema.json", invalidReuse).valid, false);
});

test("V4/PASS 必须绑定真实 Unity 运行测量，缺测量不得通过", () => {
  const ajv = createAjv();
  const payload = {
    schemaVersion: "1.0", projectId: "demo-game", sceneId: "menu", buildVersion: "build-1", sourceRevision: "main@abc",
    projectStateVersion: "state-1", platformId: "WINDOWS", developmentCompletionEvidence: {
      ...evidence("quality-gates"), projectId: "demo-game", subjectId: "g2.development-complete", subjectVersion: "1", sourceRevision: "main@abc", projectStateVersion: "state-1",
    },
    buildArtifactSha256: SHA, candidateSha256: SHA, captureSource: "WINDOWS_STANDALONE",
    screenshot: { path: "Artifacts/Visual/Runtime/scene.png", sha256: SHA, width: 1920, height: 1080, capturedAtUtc: "2026-09-22T12:00:00Z" },
    ...responsiveContracts(), runtimeMeasurement: runtimeMeasurement(), v4Status: "PASS", status: "APPROVED",
    candidateSnapshot: { ...evidence("grilling-subject-snapshot"), projectId: "demo-game", subjectId: "menu", subjectVersion: "1", sourceRevision: "main@abc", projectStateVersion: "state-1" },
    grillingEvidence: { ...evidence("grilling-record"), projectId: "demo-game", subjectId: "menu", subjectVersion: "1", sourceRevision: "main@abc", projectStateVersion: "state-1" },
    reviews: ["VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"].map((discipline) => ({
      approvalType: "RUNTIME_VISUAL", authority: "INDEPENDENT_REVIEWER", subjectId: "menu", subjectVersion: "1", approvedBy: "reviewer",
      approvedAtUtc: "2026-09-22T12:00:00Z", evidencePath: "Artifacts/review.json", evidenceSha256: SHA, reviewTaskId: "review-menu", reviewDiscipline: discipline,
    })),
    userApprovals: [{ approvalType: "RUNTIME_VISUAL", authority: "USER", subjectId: "menu", subjectVersion: "1", approvedBy: "user", approvedAtUtc: "2026-09-22T12:00:00Z", evidencePath: "Artifacts/approval.json", evidenceSha256: SHA }],
  };
  assert.equal(validate(ajv, "runtime-visual-evidence.schema.json", payload).valid, true);
  const missingMeasurement = structuredClone(payload);
  delete missingMeasurement.runtimeMeasurement;
  assert.equal(validate(ajv, "runtime-visual-evidence.schema.json", missingMeasurement).valid, false);
});

test("V4/PASS 拒绝失败的 resize、输入命中和错误 Canvas 路线", () => {
  const ajv = createAjv();
  const validateMeasurement = ajv.compile({
    type: "object",
    required: ["runtimeMeasurement"],
    properties: { runtimeMeasurement: { $ref: "https://codex.local/unity-workflow/schemas/common.schema.json#/$defs/runtimeMeasurement" } },
  });
  for (const mutate of [
    (candidate) => { candidate.runtimeMeasurement.resize.observed = false; },
    (candidate) => { candidate.runtimeMeasurement.inputHitTests[0].hit = false; },
    (candidate) => { candidate.runtimeMeasurement.canvas = { kind: "CANVAS_SCALER", panelSettings: { asset: "Assets/UI/PanelSettings.asset" } }; },
  ]) {
    const candidate = { runtimeMeasurement: runtimeMeasurement() };
    mutate(candidate);
    assert.equal(validateMeasurement(candidate), false, JSON.stringify(validateMeasurement.errors));
  }
});

test("七个视觉与响应式 YAML 模板均符合对应 AJV Schema", () => {
  const ajv = createAjv();
  for (const [templateFile, schemaFile] of TEMPLATE_SCHEMA_PAIRS) {
    const payload = YAML.parse(readFileSync(resolve(WORKFLOW, templateFile), "utf8"));
    const result = validate(ajv, schemaFile, payload);
    assert.equal(result.valid, true, `${templateFile}: ${JSON.stringify(result.errors)}`);
    if (schemaFile === "runtime-visual-evidence.schema.json") {
      assert.equal(payload.status, "REVIEWING", `${templateFile} 不应伪造已批准运行证据`);
      assert.equal(payload.v4Status, "NOT_RUN", `${templateFile} 缺少明确的 V4 NOT_RUN 状态`);
      assert.equal(payload.runtimeMeasurement, undefined, `${templateFile} 未运行时不得伪造运行测量`);
    }
  }
});

test("参考文档同步 Unity 响应式合同与独立显示层语义", () => {
  const text = [
    "references/workflow-overview.md", "references/scene-loop.md", "references/module-planning.md",
    "references/visual-workflow.md", "references/asset-pipeline.md", "references/platform-adaptation.md",
    "references/responsive-ui-contract.md",
  ].map((file) => readFileSync(resolve(WORKFLOW, file), "utf8")).join("\n");
  for (const token of ["responsiveContractRef", "contractVersions", "sourceScale=2", "Screen.safeArea", "EventSystem/InputSystem", "DISPLAY_LAYER", "hostSceneId"]) assert.match(text, new RegExp(token.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /未就绪层登记为 deferred.*阻止宿主.*V4/);
  assert.doesNotMatch(text, /显示层子任务.*阻断.*场景 V4/);
});
