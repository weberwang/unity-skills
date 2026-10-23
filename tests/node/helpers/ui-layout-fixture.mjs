import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deriveUiLayoutPlan } from '../../../unity-development-workflow/scripts/layout-plan-derive.mjs';
import { seedUiHierarchyFixture } from './ui-hierarchy-fixture.mjs';

const VIEWPORT = { x: 0, y: 0, width: 1920, height: 1080 };
const SAFE_AREA = { x: 24, y: 32, width: 1872, height: 1016 };
const NODE_RECT = { x: 180, y: 140, width: 120, height: 64 };

/** 写入仅供自动化合同测试使用的 JSON 夹具，不代表 Unity 实际采集结果。 */
function writeJson(repo, path, value) {
  const absolutePath = join(repo, ...path.split('/'));
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 创建能覆盖运行证据路径、候选绑定与组件快照字段的单节点布局计划。 */
export function makeUiLayoutPlanFixture({
  sceneId = 'MainScene',
  scenePath = 'Assets/Scenes/Main.unity',
  stateId = 'default',
  uiSystem = 'UGUI',
  displayLayerId,
} = {}) {
  const isToolkit = uiSystem === 'UI_TOOLKIT';
  const coordinateSpace = isToolkit ? 'UI_TOOLKIT_LOGICAL_POINTS' : 'SCREEN_SPACE_PIXELS';
  const layoutCoordinateSpace = isToolkit ? 'UI_TOOLKIT_PANEL' : 'CANVAS_LOCAL';
  return deriveUiLayoutPlan({
    schemaVersion: '1.0',
    sceneId,
    scenePath,
    stateId,
    ...(displayLayerId ? { displayLayerId } : {}),
    uiSystem,
    coordinateSpace,
    roots: { viewport: { ...VIEWPORT }, 'safe-area': { ...SAFE_AREA } },
    nodes: [{
      id: 'layout-root',
      decompositionElementId: 'element.layout-root',
      parentElementId: 'safe-area',
      semanticGrouping: { kind: 'region', rationale: '测试用的屏幕 UI 根节点。' },
      renderKind: 'STRUCTURE',
      bounds: { ...NODE_RECT },
      layoutBinding: {
        parentElementId: 'safe-area',
        hierarchyRelation: 'PARENT_CHILD',
        coordinateSpace: layoutCoordinateSpace,
        axisAlignment: { horizontal: 'left', vertical: 'top' },
        uiLayout: {
          groupingBasis: ['LAYOUT'],
          layoutOwner: 'SELF',
          positionDriver: isToolkit ? 'UITOOLKIT_STYLE' : 'RECT_TRANSFORM',
          sizeDrivers: {
            width: isToolkit ? 'UITOOLKIT_LAYOUT' : 'RECT_TRANSFORM',
            height: isToolkit ? 'UITOOLKIT_LAYOUT' : 'RECT_TRANSFORM',
          },
          sizePolicy: 'FIXED',
          overflowPolicy: 'KEEP_VISIBLE',
          safeAreaPolicy: 'INSIDE_SAFE_AREA',
          interactionPolicy: 'NON_INTERACTIVE',
        },
        anchor: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
        pivot: { x: 0.5, y: 0.5 },
        constraints: ['测试夹具保持节点位于安全区内'],
        resizePolicy: 'FIXED',
      },
    }],
  });
}

/** 按派生计划构造确定性的报告形状，用于验证门禁读取与字段绑定。 */
export function makeUiLayoutMeasurementFixture(plan, {
  candidateId = 'candidate-test',
  outputPath = '.workflow-control/evidence/WI-SCENE/ui-layout-measurement.json',
} = {}) {
  const node = plan.nodes[0];
  const rect = { ...node.targetBounds };
  const isToolkit = plan.uiSystem === 'UI_TOOLKIT';
  const componentSnapshot = {
    active: true,
    positionWriters: [isToolkit ? 'UITOOLKIT_STYLE' : 'RECT_TRANSFORM'],
    widthWriters: [isToolkit ? 'UITOOLKIT_LAYOUT' : 'RECT_TRANSFORM'],
    heightWriters: [isToolkit ? 'UITOOLKIT_LAYOUT' : 'RECT_TRANSFORM'],
    observationScope: 'ENGINE_COMPONENTS_AND_REGISTERED_WRITERS',
    rectTransform: isToolkit ? null : {
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
      sizeDelta: { x: rect.width, y: rect.height },
      anchoredPosition: { x: rect.x, y: rect.y },
      localSize: { width: rect.width, height: rect.height },
      drivenBy: '',
    },
    layoutGroup: null,
    parentLayoutGroup: null,
    contentSizeFitter: null,
    aspectRatioFitter: null,
    image: null,
    uiToolkit: isToolkit ? {
      position: 'Absolute',
      display: 'Flex',
      width: rect.width,
      height: rect.height,
      flexGrow: 0,
      flexShrink: 1,
      flexDirection: 'Row',
      alignItems: 'FlexStart',
      justifyContent: 'FlexStart',
      backgroundAssetGuid: '',
      sliceLeft: 0,
      sliceRight: 0,
      sliceTop: 0,
      sliceBottom: 0,
      sliceScale: 1,
    } : null,
    externalWriters: [],
  };
  return {
    schemaVersion: '1.0',
    status: 'PASS',
    taskId: 'ui-layout-gate-test',
    candidateId,
    measurementSource: 'UNITY_EDITOR_LOADED_SCENE',
    runId: 'fixture-run-1',
    generatedAtUtc: '2026-10-20T00:00:00Z',
    frameCount: 2,
    stateId: plan.stateId,
    includesComponentSnapshots: true,
    scenePath: plan.scenePath,
    uiSystem: plan.uiSystem,
    coordinateSpace: plan.coordinateSpace,
    unit: isToolkit ? 'POINT' : 'PIXEL',
    origin: isToolkit ? 'UIDOCUMENT_ROOT_TOP_LEFT' : 'SCREEN_TOP_LEFT',
    outputPath,
    viewportRect: { ...plan.roots.viewport },
    safeAreaRect: { ...plan.roots['safe-area'] },
    measurements: [{
      id: node.id,
      objectPath: isToolkit ? '' : 'Canvas/LayoutRoot',
      elementName: isToolkit ? 'LayoutRoot' : '',
      parentPath: node.parentElementId,
      actualRect: rect,
      parentRect: { ...plan.roots['safe-area'] },
      referenceId: node.layoutBinding.positionReferenceId ?? node.parentElementId,
      referencePath: node.layoutBinding.positionReferenceId ?? node.parentElementId,
      referenceRect: { ...plan.roots['safe-area'] },
      componentSnapshot,
      margins: { left: 156, top: 108, right: 1596, bottom: 812 },
      targetRect: rect,
      delta: { x: 0, y: 0, width: 0, height: 0 },
      tolerance: { maxAbsDelta: 0 },
      status: 'PASS',
    }],
    gapAxis: '',
    gapNote: '',
    gaps: [],
  };
}

/** 写入当前工作项的测试计划和同批测量报告，并返回项目相对引用。 */
export function seedUiLayoutFixture(repo, options = {}) {
  const planPath = options.planPath ?? 'Artifacts/Fixtures/ui-layout-plan.json';
  const evidenceRoot = options.evidenceRoot ?? '.workflow-control/evidence/WI-SCENE';
  const reportPath = options.reportPath ?? `${evidenceRoot}/ui-layout-measurement.json`;
  const plan = makeUiLayoutPlanFixture(options);
  const hierarchy = seedUiHierarchyFixture(repo, plan, { projectId: options.projectId });
  const report = makeUiLayoutMeasurementFixture(plan, {
    candidateId: options.candidateId,
    outputPath: reportPath,
  });
  writeJson(repo, planPath, plan);
  writeJson(repo, reportPath, report);
  return {
    plan,
    report,
    planRef: { path: planPath },
    measurementRef: { path: reportPath },
    planPath,
    reportPath,
    hierarchy,
  };
}
