import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateUiLayoutRuntime } from "../../unity-development-workflow/scripts/layout-runtime-contract.mjs";
import { componentSnapshot, runtimeFixture, runtimeNode } from "./helpers/ui-layout-runtime-fixture.mjs";

const SCHEMA_DIRECTORY = resolve(import.meta.dirname, "../../unity-development-workflow/schemas");

/** 加载工作流所有公开 schema，保证纯函数检查与数据格式合同保持一致。 */
function schemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of readdirSync(SCHEMA_DIRECTORY).filter((entry) => entry.endsWith(".schema.json"))) {
    ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, name), "utf8")));
  }
  return {
    plan: ajv.getSchema("https://codex.local/unity-workflow/schemas/ui-layout-plan.schema.json"),
    report: ajv.getSchema("https://codex.local/unity-workflow/schemas/layout-measurement.schema.json#/$defs/report"),
  };
}

/** 查找指定测量项，测试通过修改实际观测值模拟不同 Unity 回读结果。 */
function measurement(report, id) {
  return report.measurements.find((entry) => entry.id === id);
}

test("同批完整快照覆盖通过，且计划与测量报告符合公开 schema", () => {
  const { plan, report } = runtimeFixture();
  const schemas = schemaValidators();

  assert.deepEqual(validateUiLayoutRuntime(plan, report, { candidateId: "candidate-a" }), []);
  assert.equal(schemas.plan(plan), true, JSON.stringify(schemas.plan.errors));
  assert.equal(schemas.report(report), true, JSON.stringify(schemas.report.errors));
});

test("运行报告少测、多测、重复测量或混用批次身份会被拒绝", () => {
  const missing = runtimeFixture();
  missing.report.measurements.pop();
  assert.match(validateUiLayoutRuntime(missing.plan, missing.report).join("；"), /缺少计划节点/);

  const extra = runtimeFixture();
  extra.report.measurements.push({ ...extra.report.measurements[0], id: "unexpected" });
  assert.match(validateUiLayoutRuntime(extra.plan, extra.report).join("；"), /计划之外/);

  const duplicate = runtimeFixture();
  duplicate.report.measurements.push(structuredClone(duplicate.report.measurements[0]));
  assert.match(validateUiLayoutRuntime(duplicate.plan, duplicate.report).join("；"), /重复测量/);

  const identity = runtimeFixture();
  identity.report.stateId = "other-state";
  identity.report.scenePath = "Assets/Scenes/Other.unity";
  identity.report.candidateId = "candidate-b";
  identity.report.runId = "";
  const identityErrors = validateUiLayoutRuntime(identity.plan, identity.report, { candidateId: "candidate-a" }).join("；");
  for (const field of ["stateId", "scenePath", "candidateId", "runId"]) assert.match(identityErrors, new RegExp(field));
});

test("父级和位置参照必须是本批实际路径及对应实测矩形", () => {
  const wrongParentPath = runtimeFixture();
  measurement(wrongParentPath.report, "label").parentPath = "Canvas/Other";
  assert.match(validateUiLayoutRuntime(wrongParentPath.plan, wrongParentPath.report).join("；"), /parentPath/);

  const wrongReference = runtimeFixture();
  const label = measurement(wrongReference.report, "label");
  label.referenceId = "viewport";
  label.referencePath = "viewport";
  label.referenceRect = structuredClone(wrongReference.plan.roots.viewport);
  assert.match(validateUiLayoutRuntime(wrongReference.plan, wrongReference.report).join("；"), /referenceId.*referencePath.*referenceRect/);
});

test("PASS 标志不能掩盖实际矩形偏离严格居中", () => {
  const node = runtimeNode("centered", "viewport", { x: 100, y: 110, width: 100, height: 80 }, {
    renderKind: "STRUCTURE",
    layoutBinding: {
      axisAlignment: { horizontal: "center", vertical: "center" },
      centerAlignment: {
        horizontal: { mode: "strict" },
        vertical: { mode: "strict" },
      },
    },
  });
  const { plan, report } = runtimeFixture([node]);
  report.status = "PASS";
  measurement(report, "centered").actualRect.x += 3;

  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /实际 horizontal 中心未按声明策略对齐/);
});

test("图文组以所有活动成员的联合包围框居中", () => {
  const panel = runtimeNode("panel", "viewport", { x: 0, y: 0, width: 1000, height: 800 }, { renderKind: "STRUCTURE" });
  panel.layoutBinding.uiLayout.independentContainerReason = "容器独立管理组合定位和活动状态";
  const icon = runtimeNode("icon", "panel", { x: 400, y: 200, width: 40, height: 40 }, {
    imageSizing: { mode: "EXPLICIT", reason: "图标按组合视觉尺寸呈现" },
    layoutBinding: {
      positionReferenceId: "panel",
      axisAlignment: { horizontal: "center", vertical: "top" },
      centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["icon", "label"] },
    },
  });
  const label = runtimeNode("label", "panel", { x: 450, y: 205, width: 100, height: 30 }, {
    renderKind: "TEXT",
    layoutBinding: { positionReferenceId: "icon" },
  });
  const { plan, report } = runtimeFixture([panel, icon, label]);
  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);

  measurement(report, "label").actualRect.x += 6;
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /联合包围框未按声明策略居中/);
});

test("隐藏的居中组 leader 不能跳过活动成员验证，全组隐藏时可跳过几何", () => {
  const createGroup = (allInactive) => {
    const icon = runtimeNode("icon", "viewport", { x: 420, y: 200, width: 40, height: 40 }, {
      expectedActive: false,
      layoutBinding: {
        axisAlignment: { horizontal: "center", vertical: "top" },
        centerAlignment: { horizontal: { mode: "strict" }, memberIds: ["icon", "label"] },
      },
    });
    const label = runtimeNode("label", "viewport", { x: 460, y: 205, width: 120, height: 30 }, {
      renderKind: "TEXT",
      expectedActive: allInactive ? false : undefined,
    });
    return runtimeFixture([icon, label]);
  };
  const partlyActive = createGroup(false);
  assert.match(validateUiLayoutRuntime(partlyActive.plan, partlyActive.report).join("；"), /居中成员组 icon 的 horizontal 轴缺少活动成员的实际矩形/);

  const allInactive = createGroup(true);
  assert.deepEqual(validateUiLayoutRuntime(allInactive.plan, allInactive.report), []);
});

test("逐属性分工合法，任一属性双写都会被拒绝", () => {
  const node = runtimeNode("panel", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    positionDriver: "SCRIPT",
    widthDriver: "RECT_TRANSFORM",
    heightDriver: "ANIMATION",
  });
  const { plan, report } = runtimeFixture([node]);
  const snapshot = measurement(report, "panel").componentSnapshot;
  snapshot.externalWriters = [
    { driver: "SCRIPT", ownerType: "PanelController", ownerPath: "Canvas/PanelController", active: true, elementName: "", position: true, width: false, height: false },
    { driver: "ANIMATION", ownerType: "Animator", ownerPath: "Canvas/Panel/Animator", active: true, elementName: "", position: false, width: false, height: true },
  ];
  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);

  snapshot.positionWriters.push("RECT_TRANSFORM");
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /position 必须恰有一个实际写入者/);
});

test("非活动父级不能有活动子节点，非活动快照不伪造写入者", () => {
  const panel = runtimeNode("panel", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "STRUCTURE",
    expectedActive: false,
  });
  const label = runtimeNode("label", "panel", { x: 112, y: 112, width: 80, height: 20 }, { renderKind: "TEXT" });
  const { plan, report } = runtimeFixture([panel, label]);

  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /父级 panel 非活动时，子节点不能活动/);
  const inactiveSnapshot = measurement(report, "panel").componentSnapshot;
  assert.deepEqual(inactiveSnapshot.positionWriters, []);
  assert.deepEqual(inactiveSnapshot.widthWriters, []);
  assert.deepEqual(inactiveSnapshot.heightWriters, []);
});

test("非活动 Sprite 可保留零局部尺寸而不伪造原生显示尺寸", () => {
  const { plan, report } = runtimeFixture([runtimeNode("hidden-sprite", "viewport", {
    x: 100, y: 100, width: 128, height: 64,
  }, { expectedActive: false })]);
  const snapshot = measurement(report, "hidden-sprite").componentSnapshot;
  snapshot.aspectRatioFitter = { enabled: true, aspectMode: "FitInParent", aspectRatio: 2 };
  snapshot.rectTransform.localSize = { width: 0, height: 0 };
  snapshot.image.localSize = { width: 0, height: 0 };

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
});

test("原图像素、本地原生尺寸与屏幕测量框相互独立，PPU multiplier 不参与原生尺寸", () => {
  const node = runtimeNode("scaled-panel", "viewport", { x: 100, y: 100, width: 256, height: 128 });
  const { plan, report } = runtimeFixture([node]);
  const row = measurement(report, "scaled-panel");
  row.actualRect.width = 512;
  row.actualRect.height = 256;
  row.componentSnapshot.rectTransform.localSize = { width: 128, height: 64 };
  row.componentSnapshot.image.localSize = { width: 128, height: 64 };
  row.componentSnapshot.image.nativeSize = { width: 128, height: 64 };
  row.componentSnapshot.image.pixelsPerUnitMultiplier = 19;

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
  row.componentSnapshot.image.nativeSize.width = 256;
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /nativeSize 必须按 sourceSize\/imagePixelsPerUnit/);
});

test("畸形输入返回中文诊断而不抛出 TypeError", () => {
  for (const [plan, report] of [[null, null], [{}, {}], ["{invalid", "{invalid"]]) {
    const result = validateUiLayoutRuntime(plan, report);
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    assert.ok(result.every((message) => typeof message === "string"));
  }

  const circularPlan = runtimeFixture().plan;
  circularPlan.loop = circularPlan;
  assert.doesNotThrow(() => validateUiLayoutRuntime(circularPlan, {}));
});

test("可选执行字段按计划 schema 检查，但运行报告要求每个节点明确声明", () => {
  const { plan, report } = runtimeFixture();
  delete plan.nodes[0].layoutBinding.uiLayout.positionDriver;
  delete plan.nodes[0].layoutBinding.uiLayout.sizeDrivers;
  assert.deepEqual(schemaValidators().plan(plan), true);
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /必须显式声明有效 positionDriver.*sizeDrivers/);
});

test("空白 EXPLICIT 理由被计划结构校验拒绝", () => {
  const { plan, report } = runtimeFixture();
  plan.nodes[0].layoutBinding.uiLayout.imageSizing = { mode: "EXPLICIT", reason: "   " };
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /不能为空或仅包含空白字符/);
});

test("组件快照会拒绝不可能的写入者和非 SPRITE 的伪造 Image", () => {
  const disabledGroup = runtimeFixture([runtimeNode("panel", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    positionDriver: "LAYOUT_GROUP",
  })]);
  assert.match(validateUiLayoutRuntime(disabledGroup.plan, disabledGroup.report).join("；"), /没有启用的父 LayoutGroup/);

  const fakeImage = runtimeFixture([runtimeNode("background", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "BACKGROUND",
  })]);
  const backgroundSnapshot = measurement(fakeImage.report, "background").componentSnapshot;
  backgroundSnapshot.image = structuredClone(componentSnapshot(runtimeNode("background", "viewport", {
    x: 100, y: 100, width: 128, height: 64,
  })).image);
  assert.deepEqual(validateUiLayoutRuntime(fakeImage.plan, fakeImage.report), []);

  const structuralImage = runtimeFixture([runtimeNode("structure", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "STRUCTURE",
  })]);
  measurement(structuralImage.report, "structure").componentSnapshot.image = structuredClone(backgroundSnapshot.image);
  assert.match(validateUiLayoutRuntime(structuralImage.plan, structuralImage.report).join("；"), /STRUCTURE 节点 structure 不能伪造 Image 快照/);
});

test("drivenBy 是整体提示，不覆盖合法的逐轴 RectTransform 与 ContentSizeFitter 分工", () => {
  const node = runtimeNode("mixed-size", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "STRUCTURE",
    widthDriver: "RECT_TRANSFORM",
    heightDriver: "CONTENT_SIZE_FITTER",
  });
  const { plan, report } = runtimeFixture([node]);
  const snapshot = measurement(report, "mixed-size").componentSnapshot;
  snapshot.rectTransform.drivenBy = "ContentSizeFitter";
  snapshot.contentSizeFitter = {
    enabled: true,
    horizontalFit: "Unconstrained",
    verticalFit: "PreferredSize",
  };

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
  snapshot.contentSizeFitter.verticalFit = "Unconstrained";
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /ContentSizeFitter height 写入者与实际启用轴不一致/);
});

test("AspectRatioFitter 按模式核对尺寸轴，不以 drivenBy 推断控制轴", () => {
  const node = runtimeNode("aspect-height", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "STRUCTURE",
    heightDriver: "ASPECT_RATIO_FITTER",
  });
  const { plan, report } = runtimeFixture([node]);
  const snapshot = measurement(report, "aspect-height").componentSnapshot;
  snapshot.aspectRatioFitter = { enabled: true, aspectMode: "WidthControlsHeight", aspectRatio: 2 };
  snapshot.rectTransform.drivenBy = "";

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
  snapshot.aspectRatioFitter.aspectMode = "None";
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /AspectRatioFitter.*height 写入者与实际 aspectMode 不一致/);
});

test("LayoutGroup 的 ForceExpand 不等于实际尺寸写入", () => {
  const node = runtimeNode("expanded-child", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    renderKind: "STRUCTURE",
    positionDriver: "LAYOUT_GROUP",
    widthDriver: "LAYOUT_GROUP",
  });
  const { plan, report } = runtimeFixture([node]);
  measurement(report, "expanded-child").componentSnapshot.parentLayoutGroup = {
    type: "HorizontalLayoutGroup",
    enabled: true,
    childControlWidth: false,
    childControlHeight: false,
    childForceExpandWidth: true,
    childForceExpandHeight: false,
    cellSize: null,
  };

  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /父 LayoutGroup 未控制 width 尺寸轴/);
});

test("FitInParent 与父 LayoutGroup 同写 position 时保留并拒绝双写", () => {
  const node = runtimeNode("panel", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    positionDriver: "LAYOUT_GROUP",
    widthDriver: "ASPECT_RATIO_FITTER",
    heightDriver: "ASPECT_RATIO_FITTER",
  });
  const { plan, report } = runtimeFixture([node]);
  const snapshot = measurement(report, "panel").componentSnapshot;
  snapshot.aspectRatioFitter = { enabled: true, aspectMode: "FitInParent", aspectRatio: 2 };
  snapshot.rectTransform.drivenBy = "HorizontalOrVerticalLayoutGroup";
  snapshot.parentLayoutGroup = {
    type: "HorizontalLayoutGroup",
    enabled: true,
    childControlWidth: true,
    childControlHeight: true,
    childForceExpandWidth: false,
    childForceExpandHeight: false,
    cellSize: null,
  };
  snapshot.positionWriters = ["LAYOUT_GROUP", "ASPECT_RATIO_FITTER"];
  snapshot.widthWriters = ["ASPECT_RATIO_FITTER"];
  snapshot.heightWriters = ["ASPECT_RATIO_FITTER"];

  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /position 必须恰有一个实际写入者/);
});

test("UI Toolkit 的切片图由真实 style 快照验证，宽高统一由 UITK_LAYOUT 控制", () => {
  const node = runtimeNode("toolkit-sprite", "viewport", { x: 120, y: 100, width: 80, height: 60 }, {
    positionDriver: "UITOOLKIT_LAYOUT",
    widthDriver: "UITOOLKIT_LAYOUT",
    heightDriver: "UITOOLKIT_LAYOUT",
    imageSizing: { mode: "SLICED" },
    nineSlice: {
      mode: "stretch",
      reason: "UI Toolkit 背板按冻结源图边框切片",
      sourceSize: { width: 64, height: 64 },
      border: [8, 8, 8, 8],
    },
    layoutBinding: { coordinateSpace: "UI_TOOLKIT_PANEL" },
  });
  const { plan, report } = runtimeFixture([node], { uiSystem: "UI_TOOLKIT" });

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
  plan.nodes[0].layoutBinding.uiLayout.sizeDrivers.width = "UITOOLKIT_STYLE";
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /width 尺寸不能声明 UITK_STYLE 写入者/);
});

test("uGUI Sliced 图像类型使用 Unity 实际枚举大小写", () => {
  const node = runtimeNode("sliced-sprite", "viewport", { x: 100, y: 100, width: 128, height: 64 }, {
    imageSizing: { mode: "SLICED" },
    nineSlice: {
      mode: "stretch",
      reason: "按冻结源图边框拉伸",
      sourceSize: { width: 256, height: 128 },
      border: [8, 8, 8, 8],
    },
  });
  const { plan, report } = runtimeFixture([node]);
  const image = measurement(report, "sliced-sprite").componentSnapshot.image;
  image.type = "Sliced";
  image.hasBorder = true;
  image.border = [8, 8, 8, 8];

  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);
  image.type = "SLICED";
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /实际 uGUI Image 必须启用 Sliced 与边框/);
});

test("显式 targetRect 与 tolerance 按实际矩形重算，FAIL 不能作为交付通过", () => {
  const { plan, report } = runtimeFixture();
  const node = plan.nodes.find((entry) => entry.id === "panel");
  const row = measurement(report, "panel");
  row.targetRect = structuredClone(node.targetBounds);
  row.delta = { x: 0, y: 0, width: 0, height: 0 };
  row.tolerance = { maxAbsDelta: 0.5 };
  row.status = "PASS";
  report.status = "PASS";
  assert.deepEqual(validateUiLayoutRuntime(plan, report), []);

  row.actualRect.x += 2;
  row.delta.x = 2;
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /超出显式 tolerance/);

  row.status = "FAIL";
  report.status = "FAIL";
  assert.match(validateUiLayoutRuntime(plan, report).join("；"), /status 为 FAIL/);
});
