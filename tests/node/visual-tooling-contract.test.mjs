import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

/** 将公共定义与本任务的两个可执行契约装入同一个 Draft 2020-12 验证器。 */
function validators() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const directory = resolve('unity-development-workflow/schemas');
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.schema.json'))) {
    ajv.addSchema(JSON.parse(readFileSync(join(directory, name), 'utf8')));
  }

  return {
    layout: ajv.getSchema('https://codex.local/unity-workflow/schemas/layout-measurement.schema.json'),
    layoutReport: ajv.compile({ $ref: 'https://codex.local/unity-workflow/schemas/layout-measurement.schema.json#/$defs/report' }),
    capture: ajv.getSchema('https://codex.local/unity-workflow/schemas/game-view-capture.schema.json'),
    captureReport: ajv.compile({ $ref: 'https://codex.local/unity-workflow/schemas/game-view-capture.schema.json#/$defs/captureReport' }),
  };
}

/** 构造只声明目标路径和期望值的 uGUI 测量请求，不注入实际几何。 */
function layoutRequest(overrides = {}) {
  return {
    schemaVersion: '1.0',
    taskId: 'layout-check',
    scenePath: 'Assets/Scenes/Menu.unity',
    uiSystem: 'UGUI',
    coordinateSpace: 'SCREEN_SPACE_PIXELS',
    outputPath: 'Artifacts/Visual/layout-check/report.json',
    targets: [{
      id: 'main-card',
      objectPath: 'Canvas/Panel/Card',
      parentObjectPath: 'Canvas/Panel',
      targetRect: { x: 20, y: 40, width: 320, height: 180 },
      tolerance: { maxAbsDelta: 2 },
    }],
    ...overrides,
  };
}

/** 构造由 Unity 实际写入的终态采集报告示例。 */
function captureReport(overrides = {}) {
  return {
    schemaVersion: '1.0',
    status: 'PASS',
    errorCode: '',
    message: 'Game View 实际帧与采集报告已写入。',
    taskId: 'capture-check',
    candidateId: 'candidate-a',
    scenePath: 'Assets/Scenes/Menu.unity',
    requestedOutputPath: 'Artifacts/Visual/capture-check/frame.png',
    generatedAtUtc: '2026-10-13T00:00:00.000Z',
    captureScope: 'EDITOR_GAME_VIEW_END_OF_FRAME',
    screenshot: {
      path: 'Artifacts/Visual/capture-check/frame.png',
      width: 1280,
      height: 720,
      sizeBytes: 14400,
      capturedAtUtc: '2026-10-13T00:00:00.000Z',
      frameCount: 42,
    },
    uiCoverage: {
      status: 'CAPTURED_UNANALYZED',
      scope: 'FINAL_GAME_VIEW_FRAME',
      pixelAnalysis: 'NOT_PERFORMED',
      screenSpaceOverlayCanvasCount: 1,
      screenSpaceCameraCanvasCount: 0,
      worldSpaceCanvasCount: 0,
      unclassifiedCanvasCount: 0,
      includedRuntimePanelCount: 1,
      unclassifiedRuntimePanelCount: 0,
      note: '已采集并记录活动 UI 渲染入口；未执行像素分析。',
    },
    ...overrides,
  };
}

test('布局测量接受两类单一坐标空间并保留仅测量模式', () => {
  const { layout } = validators();
  assert.equal(layout(layoutRequest()), true, JSON.stringify(layout.errors));
  assert.equal(layout(layoutRequest({
    uiSystem: 'UI_TOOLKIT',
    coordinateSpace: 'UI_TOOLKIT_LOGICAL_POINTS',
    targets: [{ id: 'label', documentPath: 'Canvas/UIDocument', elementName: 'title', parentElementName: 'header' }],
  })), true, JSON.stringify(layout.errors));
  assert.equal(layout(layoutRequest({
    targets: [{ id: 'observed', objectPath: 'Canvas/Panel/Card', parentObjectPath: 'Canvas/Panel' }],
  })), true, JSON.stringify(layout.errors));
  assert.equal(layout(layoutRequest({ gapAxis: 'horizontal' })), true, JSON.stringify(layout.errors));
  assert.equal(layout(layoutRequest({ gapAxis: 'vertical' })), true, JSON.stringify(layout.errors));
});

test('布局测量拒绝混合坐标、手填实测值、无目标的容差与非法容差', () => {
  const { layout } = validators();
  const invalid = [
    layoutRequest({ coordinateSpace: 'UI_TOOLKIT_LOGICAL_POINTS' }),
    layoutRequest({ targets: [{ id: 'mixed', objectPath: 'Canvas/Card', parentObjectPath: 'Canvas', documentPath: 'Canvas/UIDocument', elementName: 'title', parentElementName: 'header' }] }),
    layoutRequest({ targets: [{ id: 'actual-bounds', objectPath: 'Canvas/Card', parentObjectPath: 'Canvas', actualRect: { x: 0, y: 0, width: 100, height: 50 } }] }),
    layoutRequest({ targets: [{ id: 'orphan-tolerance', objectPath: 'Canvas/Card', parentObjectPath: 'Canvas', tolerance: { maxAbsDelta: 1 } }] }),
    layoutRequest({ targets: [{ id: 'negative-tolerance', objectPath: 'Canvas/Card', parentObjectPath: 'Canvas', targetRect: { x: 0, y: 0, width: 1, height: 1 }, tolerance: { maxAbsDelta: -1 } }] }),
    layoutRequest({ outputPath: '../outside.json' }),
    layoutRequest({ gapAxis: 'diagonal' }),
  ];

  for (const request of invalid) {
    assert.equal(layout(request), false, JSON.stringify(layout.errors));
  }
});

test('布局报告区分未声明阈值与实际容差失败', () => {
  const { layout, layoutReport } = validators();
  const report = {
    schemaVersion: '1.0',
    status: 'FAIL',
    errorCode: '',
    message: '至少一个节点超出已声明的矩形容差。',
    taskId: 'layout-check',
    candidateId: 'candidate-a',
    scenePath: 'Assets/Scenes/Menu.unity',
    uiSystem: 'UGUI',
    coordinateSpace: 'SCREEN_SPACE_PIXELS',
    unit: 'PIXEL',
    origin: 'SCREEN_TOP_LEFT',
    generatedAtUtc: '2026-10-13T00:00:00.000Z',
    outputPath: 'Artifacts/Visual/layout-check/report.json',
    gapAxis: '',
    gapNote: '',
    gaps: [],
    measurements: [{
      id: 'main-card',
      objectPath: 'Canvas/Panel/Card',
      elementName: '',
      parentPath: 'Canvas/Panel',
      actualRect: { x: 24, y: 40, width: 320, height: 180 },
      parentRect: { x: 0, y: 0, width: 1280, height: 720 },
      margins: { left: 24, top: 40, right: 936, bottom: 500 },
      targetRect: { x: 20, y: 40, width: 320, height: 180 },
      delta: { x: 4, y: 0, width: 0, height: 0 },
      tolerance: { maxAbsDelta: 2 },
      status: 'FAIL',
    }],
  };
  assert.equal(layoutReport(report), true, JSON.stringify(layoutReport.errors));
  report.measurements[0].targetRect = null;
  report.measurements[0].delta = null;
  report.measurements[0].tolerance = null;
  report.measurements[0].status = 'MEASURED';
  report.status = 'MEASURED';
  assert.equal(layoutReport(report), true, JSON.stringify(layoutReport.errors));

  const uiToolkitReport = structuredClone(report);
  uiToolkitReport.uiSystem = 'UI_TOOLKIT';
  uiToolkitReport.coordinateSpace = 'UI_TOOLKIT_LOGICAL_POINTS';
  uiToolkitReport.unit = 'POINT';
  uiToolkitReport.origin = 'UIDOCUMENT_ROOT_TOP_LEFT';
  uiToolkitReport.measurements[0].objectPath = 'Canvas/UIDocument';
  uiToolkitReport.measurements[0].elementName = 'title';
  uiToolkitReport.measurements[0].parentPath = 'header';
  assert.equal(layoutReport(uiToolkitReport), true, JSON.stringify(layoutReport.errors));
  uiToolkitReport.origin = 'SCREEN_TOP_LEFT';
  assert.equal(layoutReport(uiToolkitReport), false, 'UI Toolkit 坐标必须相对 UIDocument 根左上角。');

  const gapReport = structuredClone(report);
  gapReport.gapAxis = 'horizontal';
  gapReport.gapNote = '仅报告所选节点的同父级相邻间距。';
  gapReport.gaps = [{
    parentPath: 'Canvas/Panel',
    fromId: 'main-card',
    toId: 'secondary-card',
    actualGap: -8,
    targetGap: { value: 4 },
    deltaGap: { value: -12 },
  }];
  assert.equal(layoutReport(gapReport), true, JSON.stringify(layoutReport.errors));
  assert.equal(layoutReport({ ...gapReport, gapAxis: '', gaps: gapReport.gaps }), false);
  assert.equal(layoutReport({ ...gapReport, gaps: [{ ...gapReport.gaps[0], targetGap: null, deltaGap: { value: 2 } }] }), true);
});

test('Game View 报告只在 PASS 时携带实际截图和 UI 覆盖证据', () => {
  const { capture, captureReport: validateCaptureReport } = validators();
  const request = {
    schemaVersion: '1.0',
    taskId: 'capture-check',
    candidateId: 'candidate-a',
    scenePath: 'Assets/Scenes/Menu.unity',
    outputPath: 'Artifacts/Visual/capture-check/frame.png',
  };
  assert.equal(capture(request), true, JSON.stringify(capture.errors));
  assert.equal(validateCaptureReport(captureReport()), true, JSON.stringify(validateCaptureReport.errors));

  const pending = JSON.parse(JSON.stringify(captureReport({
    status: 'PENDING',
    captureScope: undefined,
    screenshot: undefined,
    uiCoverage: undefined,
  })));
  assert.equal(validateCaptureReport(pending), true, JSON.stringify(validateCaptureReport.errors));
  assert.equal(validateCaptureReport({ ...pending, captureScope: null, screenshot: null, uiCoverage: null }), true);
  assert.equal(validateCaptureReport({ ...pending, captureScope: 'EDITOR_GAME_VIEW_END_OF_FRAME' }), false);
  assert.equal(validateCaptureReport({ ...captureReport(), screenshot: undefined }), false);
  assert.equal(validateCaptureReport({ ...captureReport(), captureScope: null }), false);
  assert.equal(validateCaptureReport({ ...captureReport(), screenshot: null }), false);
  assert.equal(validateCaptureReport({ ...captureReport(), uiCoverage: null }), false);
  assert.equal(validateCaptureReport({ ...captureReport(), uiCoverage: { ...captureReport().uiCoverage, pixelAnalysis: 'PASS' } }), false);
});
