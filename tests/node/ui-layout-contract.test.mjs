import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { deriveUiLayoutPlan } from "../../unity-development-workflow/scripts/layout-plan-derive.mjs";
import { validateUiLayoutPlan } from "../../unity-development-workflow/scripts/layout-plan-validation.mjs";
import { compileJsonJob, main } from "../../unity-development-workflow/scripts/workflow-files.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_DIRECTORY = resolve(ROOT, "unity-development-workflow/schemas");
const INSTALLER_PATH = resolve(ROOT, "scripts/install-project-skills.mjs");

/** 生成坐标系统一的简单布局节点，测试只覆盖与布局合同相关的字段。 */
function layoutNode(id, parentElementId, bounds, overrides = {}) {
  const { layoutBinding: bindingOverrides = {}, ...nodeOverrides } = overrides;
  const baseBinding = {
    parentElementId,
    hierarchyRelation: "PARENT_CHILD",
    coordinateSpace: "CANVAS_LOCAL",
    uiLayout: {
      groupingBasis: ["POSITION"],
      layoutOwner: "PARENT",
      sizePolicy: "FIXED",
      overflowPolicy: "KEEP_VISIBLE",
      safeAreaPolicy: "FULL_BLEED",
      interactionPolicy: "NON_INTERACTIVE",
    },
    anchor: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    pivot: { x: 0.5, y: 0.5 },
    constraints: ["position-reference"],
    axisAlignment: { horizontal: "left", vertical: "top" },
  };
  return {
    id,
    parentElementId,
    semanticGrouping: { kind: "part", rationale: "该节点独立接受布局测量。" },
    renderKind: "SPRITE",
    bounds,
    layoutBinding: {
      ...baseBinding,
      ...bindingOverrides,
      uiLayout: { ...baseBinding.uiLayout, ...bindingOverrides.uiLayout },
    },
    ...nodeOverrides,
  };
}

/** 构造位于安全区内的基础布局计划。 */
function layoutPlan(nodes = [layoutNode("panel", "viewport", { x: 100, y: 100, width: 600, height: 500 })], overrides = {}) {
  return {
    schemaVersion: "1.0",
    sceneId: "menu",
    scenePath: "Assets/Scenes/Menu.unity",
    stateId: "default",
    uiSystem: "UGUI",
    coordinateSpace: "SCREEN_SPACE_PIXELS",
    roots: {
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      "safe-area": { x: 20, y: 20, width: 960, height: 760 },
    },
    nodes,
    ...overrides,
  };
}

/** 在独立临时 Unity 项目中执行同步 CLI 并清理现场。 */
function withProject(callback) {
  const projectRoot = mkdtempSync(resolve(tmpdir(), "unity-ui-layout-contract-"));
  mkdirSync(resolve(projectRoot, "Assets"));
  try {
    callback(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("公共 schema 与布局计划 schema 拒绝未声明字段并接入扩展定义", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const name of ["common.schema.json", "ui-layout-plan.schema.json"]) {
    ajv.addSchema(JSON.parse(readFileSync(resolve(SCHEMA_DIRECTORY, name), "utf8")));
  }
  const validator = ajv.getSchema("https://codex.local/unity-workflow/schemas/ui-layout-plan.schema.json");
  const validPlan = layoutPlan();
  assert.equal(validator(validPlan), true, JSON.stringify(validator.errors));

  const invalidPlan = structuredClone(validPlan);
  invalidPlan.nodes[0].layoutBinding.axisAlignment.depth = "center";
  assert.equal(validator(invalidPlan), false);
  assert.match(validateUiLayoutPlan(invalidPlan).join("；"), /未声明字段/);

  const missingAlignment = structuredClone(validPlan);
  delete missingAlignment.nodes[0].layoutBinding.axisAlignment;
  assert.match(validateUiLayoutPlan(missingAlignment).join("；"), /axisAlignment/);
  assert.throws(() => deriveUiLayoutPlan(missingAlignment), /axisAlignment/);

  const invalidScene = structuredClone(validPlan);
  invalidScene.scenePath = "Packages/Menu.unity";
  assert.equal(validator(invalidScene), false);

  const malformedScene = structuredClone(validPlan);
  malformedScene.scenePath = null;
  assert.match(validateUiLayoutPlan(malformedScene).join("；"), /scenePath.*必须是字符串/);
});

test("兄弟位置参照合法，父级移动经参照只传播一次", () => {
  const container = layoutNode("container", "viewport", { x: 100, y: 100, width: 400, height: 400 }, {
    layoutBinding: {
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" } },
    },
  });
  const icon = layoutNode("icon", "container", { x: 150, y: 180, width: 40, height: 40 });
  const label = layoutNode("label", "container", { x: 210, y: 180, width: 100, height: 40 }, {
    layoutBinding: { positionReferenceId: "icon" },
  });
  const plan = layoutPlan([container, icon, label]);
  const derived = deriveUiLayoutPlan(plan);

  assert.deepEqual(derived.nodes.map(({ id, targetBounds }) => [id, targetBounds.x]), [
    ["container", 300], ["icon", 350], ["label", 410],
  ]);
  assert.deepEqual(plan.nodes.map((node) => node.bounds.x), [100, 150, 210]);
  assert.equal(validateUiLayoutPlan(derived, { requireDerived: true }).length, 0);
});

test("父级与兄弟参照的联合依赖循环会返回中文诊断", () => {
  const left = layoutNode("left", "panel", { x: 120, y: 120, width: 40, height: 40 }, {
    layoutBinding: { positionReferenceId: "right" },
  });
  const right = layoutNode("right", "panel", { x: 180, y: 120, width: 40, height: 40 }, {
    layoutBinding: { positionReferenceId: "left" },
  });
  const errors = validateUiLayoutPlan(layoutPlan([
    layoutNode("panel", "viewport", { x: 100, y: 100, width: 400, height: 400 }), left, right,
  ]));
  assert.match(errors.join("；"), /联合形成循环/);
  assert.throws(() => deriveUiLayoutPlan(layoutPlan([left, right])), /联合形成循环/);
});

test("装饰性 BACKGROUND 不能作为位置参照或功能父级", () => {
  const backdrop = layoutNode("backdrop", "viewport", { x: 0, y: 0, width: 1000, height: 800 }, { renderKind: "BACKGROUND" });
  const child = layoutNode("child", "viewport", { x: 100, y: 100, width: 60, height: 40 }, {
    layoutBinding: { positionReferenceId: "backdrop" },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([backdrop, child])).join("；"), /不能引用装饰性 BACKGROUND/);

  const invalidParentChild = layoutNode("child", "backdrop", { x: 100, y: 100, width: 60, height: 40 });
  assert.match(validateUiLayoutPlan(layoutPlan([backdrop, invalidParentChild])).join("；"), /不能把装饰性 BACKGROUND/);
});

test("SPRITE 底板可以直接拥有内容，额外 STRUCTURE 包装需说明职责", () => {
  const panel = layoutNode("panel", "viewport", { x: 100, y: 100, width: 500, height: 400 });
  const title = layoutNode("title", "panel", { x: 140, y: 130, width: 160, height: 40 }, { renderKind: "TEXT" });
  assert.deepEqual(validateUiLayoutPlan(layoutPlan([panel, title])), []);

  const structure = layoutNode("wrapper", "viewport", { x: 100, y: 100, width: 500, height: 400 }, { renderKind: "STRUCTURE" });
  const backing = layoutNode("backing", "wrapper", { x: 120, y: 120, width: 450, height: 350 });
  const content = layoutNode("content", "wrapper", { x: 150, y: 150, width: 160, height: 40 }, { renderKind: "TEXT" });
  assert.match(validateUiLayoutPlan(layoutPlan([structure, backing, content])).join("；"), /independentContainerReason/);

  structure.layoutBinding.uiLayout.independentContainerReason = "负责独立裁切动画和点击热区布局";
  assert.deepEqual(validateUiLayoutPlan(layoutPlan([structure, backing, content])), []);
});

test("visualOverflow 只豁免非根父框，仍遵守 viewport 与 safe-area", () => {
  const panel = layoutNode("panel", "viewport", { x: 100, y: 100, width: 100, height: 100 });
  const child = layoutNode("child", "panel", { x: 170, y: 130, width: 50, height: 30 }, {
    layoutBinding: { uiLayout: { visualOverflow: { reason: "装饰边缘需越出卡片外框" } } },
  });
  assert.deepEqual(validateUiLayoutPlan(layoutPlan([panel, child])), []);

  const rootOverflow = layoutNode("root-overflow", "viewport", { x: 980, y: 100, width: 40, height: 30 }, {
    layoutBinding: { uiLayout: { visualOverflow: { reason: "声明不能豁免根边界" } } },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([rootOverflow])).join("；"), /不能豁免根边界/);

  const unsafe = layoutNode("unsafe", "viewport", { x: 50, y: 10, width: 100, height: 40 }, {
    layoutBinding: { uiLayout: { safeAreaPolicy: "INSIDE_SAFE_AREA" } },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([unsafe])).join("；"), /safe-area/);

  const safePanel = layoutNode("safe-panel", "safe-area", { x: 800, y: 100, width: 160, height: 150 }, {
    layoutBinding: { uiLayout: { safeAreaPolicy: "INSIDE_SAFE_AREA" } },
  });
  const escapedChild = layoutNode("escaped-child", "safe-panel", { x: 950, y: 120, width: 40, height: 30 }, {
    layoutBinding: {
      uiLayout: {
        safeAreaPolicy: "FULL_BLEED",
        visualOverflow: { reason: "装饰阴影越出面板边缘" },
      },
    },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([safePanel, escapedChild])).join("；"), /safe-area/);

  const badRoots = layoutPlan();
  badRoots.roots["safe-area"].x = -1;
  assert.match(validateUiLayoutPlan(badRoots).join("；"), /safe-area 必须完整位于 viewport/);
});

test("严格居中、带理由补偿与图文联合包围框居中保持几何约束", () => {
  const strictNode = layoutNode("strict", "viewport", { x: 100, y: 110, width: 100, height: 80 }, {
    layoutBinding: { axisAlignment: { horizontal: "center", vertical: "center" } },
  });
  const compensated = layoutNode("compensated", "viewport", { x: 100, y: 250, width: 100, height: 40 }, {
    layoutBinding: {
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "reference", offset: 16, reason: "视觉重心略偏左" } },
    },
  });
  const panel = layoutNode("panel", "viewport", { x: 0, y: 0, width: 1000, height: 800 });
  const icon = layoutNode("icon", "panel", { x: 400, y: 280, width: 40, height: 40 }, {
    layoutBinding: {
      positionReferenceId: "panel",
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["label", "icon"] },
    },
  });
  const label = layoutNode("label", "panel", { x: 450, y: 282, width: 120, height: 30 }, {
    renderKind: "TEXT",
    layoutBinding: { positionReferenceId: "icon" },
  });
  const plan = layoutPlan([strictNode, compensated, label, panel, icon]);
  const original = structuredClone(plan);
  const derived = deriveUiLayoutPlan(plan);
  const byId = new Map(derived.nodes.map((node) => [node.id, node.targetBounds]));

  assert.equal(byId.get("strict").x + byId.get("strict").width / 2, 500);
  assert.equal(byId.get("strict").y + byId.get("strict").height / 2, 400);
  assert.equal(byId.get("compensated").x + byId.get("compensated").width / 2, 516);
  assert.equal(byId.get("icon").x, 415);
  assert.equal(byId.get("label").x, 465);
  assert.equal(byId.get("label").y, byId.get("icon").y + 2);
  assert.deepEqual(plan, original);

  const invalidCenter = layoutNode("invalid-center", "viewport", { x: 100, y: 100, width: 40, height: 40 }, {
    layoutBinding: { centerAlignment: { horizontal: { mode: "strict" } } },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([invalidCenter])).join("；"), /只能用于 axisAlignment=center/);

  const tampered = structuredClone(derived);
  tampered.nodes.find((node) => node.id === "label").targetBounds.x += 1;
  assert.match(validateUiLayoutPlan(tampered, { requireDerived: true }).join("；"), /从原始 bounds 重算/);
});

test("成员数组与节点数组乱序时按引用拓扑派生，成员可有重叠显示矩形", () => {
  const panel = layoutNode("panel", "viewport", { x: 0, y: 0, width: 1000, height: 800 });
  const icon = layoutNode("icon", "panel", { x: 400, y: 280, width: 50, height: 40 }, {
    layoutBinding: {
      positionReferenceId: "panel",
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["label", "icon"] },
    },
  });
  const label = layoutNode("label", "panel", { x: 440, y: 282, width: 120, height: 30 }, {
    renderKind: "TEXT",
    layoutBinding: { positionReferenceId: "icon" },
  });
  const plan = layoutPlan([label, panel, icon]);
  const derived = deriveUiLayoutPlan(plan);
  const byId = new Map(derived.nodes.map((node) => [node.id, node.targetBounds]));
  assert.equal(byId.get("icon").x, 420);
  assert.equal(byId.get("label").x, 460);
  assert.equal(byId.get("label").y, byId.get("icon").y + 2);
});

test("居中成员不能跨父级或重复加入多个组", () => {
  const panel = layoutNode("panel", "viewport", { x: 100, y: 100, width: 600, height: 400 });
  const otherPanel = layoutNode("other-panel", "viewport", { x: 100, y: 520, width: 600, height: 200 });
  const icon = layoutNode("icon", "panel", { x: 200, y: 150, width: 40, height: 40 }, {
    layoutBinding: {
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["icon", "label"] },
    },
  });
  const label = layoutNode("label", "other-panel", { x: 250, y: 150, width: 100, height: 40 });
  const crossParent = validateUiLayoutPlan(layoutPlan([panel, otherPanel, icon, label]));
  assert.match(crossParent.join("；"), /必须共享功能父级/);

  label.parentElementId = "panel";
  label.layoutBinding.parentElementId = "panel";
  const duplicateLeader = layoutNode("badge", "panel", { x: 350, y: 160, width: 30, height: 30 }, {
    layoutBinding: {
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["badge", "icon"] },
    },
  });
  assert.match(validateUiLayoutPlan(layoutPlan([panel, icon, label, duplicateLeader])).join("；"), /不能同时属于多个/);
});

test("workflow-files 的派生、检查和 compile-json 统一执行布局校验", () => withProject((projectRoot) => {
  const sourcePath = resolve(projectRoot, "Artifacts/layout.json");
  const outputPath = resolve(projectRoot, "Artifacts/layout-derived.json");
  const jobPath = resolve(projectRoot, "Artifacts/layout.job.json");
  mkdirSync(resolve(projectRoot, "Artifacts"));
  const sourcePlan = layoutPlan();
  writeFileSync(sourcePath, JSON.stringify(sourcePlan, null, 2));

  const derivedFile = main([
    "layout-plan", "--project-root", projectRoot,
    "--source", "Artifacts/layout.json", "--output", "Artifacts/layout-derived.json",
  ]);
  assert.equal(derivedFile, outputPath);
  assert.equal(JSON.parse(readFileSync(sourcePath, "utf8")).nodes[0].targetBounds, undefined);
  assert.ok(JSON.parse(readFileSync(outputPath, "utf8")).nodes[0].targetBounds);
  const reviewedOutput = readFileSync(outputPath, "utf8");
  assert.throws(() => main([
    "layout-plan", "--project-root", projectRoot,
    "--source", "Artifacts/layout.json", "--output", "Artifacts/layout-derived.json",
  ]), /拒绝覆盖已有/);
  assert.equal(readFileSync(outputPath, "utf8"), reviewedOutput);
  assert.throws(() => main([
    "layout-plan", "--project-root", projectRoot,
    "--source", "Artifacts/layout.json", "--output", "Artifacts/layout.json",
  ]), /不能覆盖 source/);

  assert.throws(() => main([
    "layout-check", "--project-root", projectRoot, "--source", "Artifacts/layout.json",
  ]), /要求布局计划包含.*targetBounds/);
  assert.match(main([
    "layout-check", "--project-root", projectRoot, "--source", "Artifacts/layout-derived.json",
  ]), /校验通过/);
  assert.throws(() => compileJsonJob({ projectRoot, kind: "ui-layout-plan", source: sourcePath, output: jobPath }), /要求布局计划包含.*targetBounds/);
  compileJsonJob({ projectRoot, kind: "ui-layout-plan", source: outputPath, output: jobPath });
  assert.equal(JSON.parse(readFileSync(jobPath, "utf8")).kind, "ui-layout-plan");
}));

test("安装到仓库外且无 node_modules 的项目仍可运行布局 CLI 与文档初始化", () => withProject((projectRoot) => {
  const installedOutsideRepository = spawnSync(process.execPath, [INSTALLER_PATH, projectRoot], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(installedOutsideRepository.status, 0, installedOutsideRepository.stderr);
  assert.equal(existsSync(resolve(projectRoot, "node_modules")), false);

  const workflowFiles = resolve(projectRoot, ".agents/skills/unity-development-workflow/scripts/workflow-files.mjs");
  const runInstalled = (args) => spawnSync(process.execPath, [workflowFiles, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const init = runInstalled(["init-docs", "--project-root", projectRoot, "--project-id", "layout-smoke"]);
  assert.equal(init.status, 0, init.stderr);

  mkdirSync(resolve(projectRoot, "Artifacts"));
  writeFileSync(resolve(projectRoot, "Artifacts/layout.json"), JSON.stringify(layoutPlan(), null, 2));
  const derive = runInstalled([
    "layout-plan", "--project-root", projectRoot,
    "--source", "Artifacts/layout.json", "--output", "Artifacts/layout-derived.json",
  ]);
  assert.equal(derive.status, 0, derive.stderr);

  const check = runInstalled([
    "layout-check", "--project-root", projectRoot, "--source", "Artifacts/layout-derived.json",
  ]);
  assert.equal(check.status, 0, check.stderr);

  const compile = runInstalled([
    "compile-json", "--project-root", projectRoot, "--kind", "ui-layout-plan",
    "--source", "Artifacts/layout-derived.json", "--output", "Artifacts/layout.job.json",
  ]);
  assert.equal(compile.status, 0, compile.stderr);
  assert.ok(existsSync(resolve(projectRoot, "Artifacts/layout.job.json")));
}));

test("仓库 UI 布局示例可经过同一派生与最终复验", () => {
  const examplePath = resolve("unity-development-workflow/templates/ui-layout-plan.json");
  const example = JSON.parse(readFileSync(examplePath, "utf8"));
  const derived = deriveUiLayoutPlan(example);
  assert.deepEqual(validateUiLayoutPlan(derived, { requireDerived: true }), []);
});
