import { deriveUiLayoutPlan } from "../../../unity-development-workflow/scripts/layout-plan-derive.mjs";

/** 创建符合布局合同的测试节点，默认保留 uGUI Sprite 的实际资产信息。 */
export function runtimeNode(id, parentElementId, bounds, options = {}) {
  const {
    renderKind = "SPRITE",
    positionDriver = "RECT_TRANSFORM",
    widthDriver = "RECT_TRANSFORM",
    heightDriver = "RECT_TRANSFORM",
    imageSizing = renderKind === "SPRITE" ? { mode: "NATIVE" } : undefined,
    expectedActive,
    nineSlice,
    layoutBinding = {},
  } = options;
  const baseBinding = {
    parentElementId,
    hierarchyRelation: "PARENT_CHILD",
    coordinateSpace: "CANVAS_LOCAL",
    uiLayout: {
      groupingBasis: ["POSITION"],
      layoutOwner: "PARENT",
      positionDriver,
      sizeDrivers: { width: widthDriver, height: heightDriver },
      ...(imageSizing ? { imageSizing } : {}),
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
  const bindingOverrides = layoutBinding;
  const baseUiLayout = baseBinding.uiLayout;
  const uiLayoutOverrides = bindingOverrides.uiLayout ?? {};
  const node = {
    id,
    parentElementId,
    semanticGrouping: { kind: "part", rationale: "该运行时节点由测试夹具明确声明。" },
    renderKind,
    bounds,
    layoutBinding: {
      ...baseBinding,
      ...bindingOverrides,
      uiLayout: { ...baseUiLayout, ...uiLayoutOverrides },
    },
  };
  if (expectedActive !== undefined) node.expectedActive = expectedActive;
  if (nineSlice !== undefined) node.nineSlice = structuredClone(nineSlice);
  return node;
}

/** 构造 Unity 编辑器报告所需的 uGUI 或 UI Toolkit 快照字段。 */
export function componentSnapshot(node, { active = node.expectedActive !== false, imageOverrides, writerOverrides, localSize, uiSystem = "UGUI" } = {}) {
  const size = localSize ?? { width: node.bounds.width, height: node.bounds.height };
  const isUgui = uiSystem === "UGUI";
  const snapshot = {
    active,
    positionWriters: [...(writerOverrides?.positionWriters ?? (active ? [node.layoutBinding.uiLayout.positionDriver] : []))],
    widthWriters: [...(writerOverrides?.widthWriters ?? (active ? [node.layoutBinding.uiLayout.sizeDrivers.width] : []))],
    heightWriters: [...(writerOverrides?.heightWriters ?? (active ? [node.layoutBinding.uiLayout.sizeDrivers.height] : []))],
    observationScope: "ENGINE_COMPONENTS_AND_REGISTERED_WRITERS",
    rectTransform: isUgui ? {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
      sizeDelta: { x: size.width, y: size.height },
      anchoredPosition: { x: node.bounds.x, y: node.bounds.y },
      localSize: structuredClone(size),
      drivenBy: "",
    } : null,
    layoutGroup: null,
    parentLayoutGroup: null,
    contentSizeFitter: null,
    aspectRatioFitter: null,
    image: isUgui && node.renderKind === "SPRITE" ? {
      assetGuid: "test-sprite-guid",
      localId: "21300000",
      assetPath: "Assets/UI/test-sprite.png",
      sourceSize: { width: 256, height: 128 },
      pixelsPerUnit: 200,
      imagePixelsPerUnit: 2,
      referencePixelsPerUnit: 100,
      pixelsPerUnitMultiplier: 7,
      type: "Simple",
      localSize: structuredClone(size),
      nativeSize: { width: 128, height: 64 },
      hasBorder: false,
      preserveAspect: false,
      border: [0, 0, 0, 0],
      ...imageOverrides,
    } : null,
    uiToolkit: isUgui ? null : {
      position: "Relative",
      display: "Flex",
      width: size.width,
      height: size.height,
      flexGrow: 0,
      flexShrink: 1,
      flexDirection: "Column",
      alignItems: "FlexStart",
      justifyContent: "FlexStart",
      backgroundAssetGuid: node.renderKind === "SPRITE" ? "test-background-guid" : "",
      sliceLeft: 8,
      sliceRight: 8,
      sliceTop: 8,
      sliceBottom: 8,
      sliceScale: 1,
    },
    externalWriters: [],
  };
  return snapshot;
}

/** 为实际报告构造同批节点、根框和路径对应关系。 */
export function runtimeFixture(nodes = [
  runtimeNode("panel", "viewport", { x: 100, y: 100, width: 128, height: 64 }),
  runtimeNode("label", "panel", { x: 112, y: 112, width: 100, height: 20 }, { renderKind: "TEXT" }),
], options = {}) {
  const uiSystem = options.uiSystem ?? "UGUI";
  const coordinateSpace = options.coordinateSpace ?? (uiSystem === "UGUI" ? "SCREEN_SPACE_PIXELS" : "UI_TOOLKIT_LOGICAL_POINTS");
  const rawPlan = {
    schemaVersion: "1.0",
    sceneId: "runtime-fixture",
    scenePath: "Assets/Scenes/Menu.unity",
    stateId: "default",
    uiSystem,
    coordinateSpace,
    roots: {
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      "safe-area": { x: 20, y: 20, width: 960, height: 760 },
    },
    nodes,
  };
  const plan = deriveUiLayoutPlan(rawPlan);
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const measurementPath = (id) => uiSystem === "UGUI" ? `Canvas/${id}` : id;
  const measurements = plan.nodes.map((node) => {
    const rect = structuredClone(node.targetBounds);
    const parentNode = byId.get(node.parentElementId);
    const referenceId = node.layoutBinding.positionReferenceId ?? node.parentElementId;
    const referenceNode = byId.get(referenceId);
    const parentRect = parentNode ? structuredClone(parentNode.targetBounds) : structuredClone(plan.roots[node.parentElementId]);
    const referenceRect = referenceNode ? structuredClone(referenceNode.targetBounds) : structuredClone(plan.roots[referenceId]);
    const active = node.expectedActive !== false;
    return {
      id: node.id,
      objectPath: uiSystem === "UGUI" ? measurementPath(node.id) : "",
      elementName: uiSystem === "UGUI" ? "" : node.id,
      parentPath: parentNode ? measurementPath(parentNode.id) : (uiSystem === "UGUI" ? `Canvas/${node.parentElementId}` : "RootElement"),
      actualRect: active ? rect : null,
      parentRect: parentNode?.expectedActive === false ? null : parentRect,
      referenceId,
      referencePath: referenceNode ? measurementPath(referenceNode.id) : referenceId,
      referenceRect: referenceNode?.expectedActive === false ? null : referenceRect,
      margins: active ? { left: 0, top: 0, right: 0, bottom: 0 } : null,
      targetRect: null,
      delta: null,
      tolerance: null,
      status: active ? "MEASURED" : "INACTIVE",
      componentSnapshot: componentSnapshot(node, { active, uiSystem }),
    };
  });
  const report = {
    schemaVersion: "1.0",
    status: "MEASURED",
    taskId: "runtime-test",
    candidateId: "candidate-a",
    scenePath: plan.scenePath,
    uiSystem: plan.uiSystem,
    coordinateSpace: plan.coordinateSpace,
    unit: uiSystem === "UGUI" ? "PIXEL" : "POINT",
    origin: uiSystem === "UGUI" ? "SCREEN_TOP_LEFT" : "UIDOCUMENT_ROOT_TOP_LEFT",
    generatedAtUtc: "2026-10-23T00:00:00.000Z",
    outputPath: "Artifacts/Visual/layout-report.json",
    measurements,
    gapAxis: "",
    gapNote: "",
    gaps: [],
    measurementSource: "UNITY_EDITOR_LOADED_SCENE",
    runId: "run-42",
    frameCount: 42,
    stateId: plan.stateId,
    includesComponentSnapshots: true,
    viewportRect: structuredClone(plan.roots.viewport),
    safeAreaRect: structuredClone(plan.roots["safe-area"]),
  };
  return { plan, report };
}
