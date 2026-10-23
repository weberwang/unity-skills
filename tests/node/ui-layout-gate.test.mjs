import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  check,
  inspect,
  run,
  status,
  transitionWorkItem,
  validateImplementationPackage,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import {
  inspectUiLayoutEvidence,
  validateUiLayoutPackage,
} from '../../unity-game-workflow-control/scripts/runtime/ui-layout-evidence.mjs';
import { validateUiLayoutRuntime } from '../../unity-development-workflow/scripts/layout-runtime-contract.mjs';
import { makeArtFixture } from './helpers/art-experience-fixture.mjs';
import { seedVisualBaseline } from './helpers/workflow-evidence-fixture.mjs';
import {
  makeUiLayoutMeasurementFixture,
  makeUiLayoutPlanFixture,
  seedUiLayoutFixture,
} from './helpers/ui-layout-fixture.mjs';

const HASH = `sha256:${'b'.repeat(64)}`;
const RESPONSIVE_EVIDENCE_FIELDS = [
  'gameView', 'screen', 'backbuffer', 'canvasScalerOrPanelSettings', 'camera',
  'screenSafeArea', 'inputHit', 'resizeOrientationTrajectory', 'screenshot', 'supportedOrientations',
];

/** 写入测试 JSON，保留稳定换行以便在失败时检查原始输入。 */
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 创建通过响应式合同校验的最小屏幕 UI Work Item。 */
function makeResponsiveContract() {
  return {
    version: 'unity-responsive/1.0',
    uiSystem: 'UGUI',
    logicalSpace: { mode: 'Canvas', referenceResolution: { width: 1920, height: 1080 }, unit: 'Unity logical units' },
    backbuffer: { source: 'Display', policy: 'platform-measured-display-size', measuredAtRuntime: true },
    panel: { mode: 'Overlay', panelId: 'MainCanvas', runtimePanel: false },
    renderTexture: { enabled: false, format: 'not-used', resolutionPolicy: 'camera-target-policy' },
    canvasScaler: { status: 'configured', enabled: true, mode: 'Scale With Screen Size', screenMatchMode: 'MatchWidthOrHeight', referenceResolution: { width: 1920, height: 1080 }, matchWidthOrHeight: 1 },
    panelSettings: { status: 'not-applicable', reason: '该测试使用 uGUI。' },
    camera: { id: 'GameplayCamera', renderMode: 'ScreenSpaceCamera', viewport: { width: 1920, height: 1080 }, projection: 'Orthographic', measuredAtRuntime: true },
    safeArea: { source: 'Screen.safeArea', policy: 'inset-ui-root', measuredAtRuntime: true },
    inputCoordinates: { inputSystem: 'InputSystem', eventSystem: 'EventSystem', screenToLocal: 'RectTransformUtility.ScreenPointToLocalPointInRectangle', cameraRaycast: 'Camera.ScreenPointToRay' },
    resize: { mode: 'recalculate-canvas-camera-input', events: ['screen-resize', 'canvas-rebuild', 'camera-viewport'], sameProcess: true },
    orientation: { supported: ['portrait', 'landscape'], runtimeReflow: true },
    textLocalization: {
      programmatic: true,
      locales: ['en', 'zh-CN', 'ja', 'ru', 'es'],
      localePolicies: Object.fromEntries(['en', 'zh-CN', 'ja', 'ru', 'es'].map((locale) => [locale, { singleLine: false, wrap: true, truncation: 'forbidden' }])),
    },
    resourceResolution: { sourceScale: 1, runtimeScalePolicy: 'platform-canvas-panel-camera-measured', platformMeasured: true },
    performanceBudget: { frameTimeMs: 16.67, uiDrawCalls: 80, renderTexturePixels: 2000000, memoryMb: 512, degradationPolicy: 'explicit-quality-tier-after-measurement' },
    representativeViewports: [
      { id: 'portrait-phone', width: 1080, height: 1920, orientation: 'portrait' },
      { id: 'landscape-desktop', width: 1920, height: 1080, orientation: 'landscape' },
    ],
    requiredRuntimeEvidence: RESPONSIVE_EVIDENCE_FIELDS,
  };
}

/** 创建包含当前阶段确认与同批证据根的屏幕 UI 工作项。 */
function makeScreenWork({ workItemId = 'WI-SCENE', stage = 'V4', state = 'VALIDATING' } = {}) {
  const work = {
    schemaVersion: '1.0',
    workItemId,
    projectId: 'ui-layout-gate-test',
    workItemType: 'SCENE',
    moduleIds: ['ui'],
    stageId: 'scene-production',
    globalState: state,
    scene: { sceneId: 'MainScene', stage, status: 'IN_PROGRESS' },
    responsiveContract: makeResponsiveContract(),
    evidenceRoot: `.workflow-control/evidence/${workItemId}`,
    baselineHash: HASH,
    revision: 0,
    objective: '验证屏幕 UI 布局运行证据门禁',
    actionLevel: 'A1',
    actionType: 'unity-spec-candidate',
    allowedActions: ['unity-spec-candidate'],
    allowedPaths: ['Assets/**'],
    forbiddenPaths: ['Library/**'],
    gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' },
    stageReviews: ['V1', 'V2', 'V3', 'V4'].map((reviewStage) => ({
      stage: reviewStage,
      ...(reviewStage === 'V2' ? {
        decompositionConfirmation: confirmation(workItemId, reviewStage, '2026-10-20T10:00:00+08:00'),
        layoutConfirmation: confirmation(workItemId, reviewStage, '2026-10-20T10:01:00+08:00'),
      } : { confirmation: confirmation(workItemId, reviewStage, '2026-10-20T10:00:00+08:00') }),
    })),
  };
  return work;
}

/** 创建对应阶段确认记录，避免 UI 门禁测试被其他阶段规则遮挡。 */
function confirmation(workItemId, stage, confirmedAt) {
  return { workItemId, stage, confirmedBy: 'test-user', confirmedAt, userMessageRef: `fixture:${workItemId}:${stage}` };
}

/** 写入完整 V4 响应式证据工件，仅供 Node 控制面测试消费。 */
function makeResponsiveEvidence(repo) {
  const artifact = (source) => {
    const path = `${source}.evidence`;
    writeFileSync(join(repo, path), `fixture-only:${source}`, 'utf8');
    return { source, measured: true, path, size: { width: 1920, height: 1080 }, orientation: 'landscape' };
  };
  return {
    gameView: artifact('GameView'),
    screen: artifact('Screen'),
    backbuffer: artifact('backbuffer'),
    canvasScaler: artifact('CanvasScaler'),
    camera: artifact('Camera'),
    safeArea: { source: 'Screen.safeArea', measured: true, rect: { x: 0, y: 0, width: 1920, height: 1080 } },
    inputHit: { system: 'InputSystem', eventSystem: 'EventSystem', hit: true, coordinates: { screen: { x: 20, y: 20 }, local: { x: 20, y: 20 } } },
    resizeOrientationTrajectory: { sameProcess: true, events: [{ type: 'resize', path: 'resize.evidence' }, { type: 'orientation', path: 'orientation.evidence' }] },
    screenshot: artifact('Screenshot'),
    supportedOrientations: ['portrait', 'landscape'],
  };
}

/** 创建绑定当前候选的 V4 PASS Evidence Manifest 测试夹具。 */
function makeScreenEvidence(work, repo, measurementRef) {
  const art = makeArtFixture(repo, work);
  return {
    ...art.evidenceFields,
    schemaVersion: '1.0',
    evidenceId: 'EV-UI-LAYOUT',
    workItemId: work.workItemId,
    packageId: 'PKG-UI-LAYOUT',
    workItemType: work.workItemType,
    visualStage: work.scene.stage,
    contractVersions: { responsiveContract: work.responsiveContract.version },
    baselineHash: work.baselineHash,
    recordedAt: '2026-10-20T00:00:00Z',
    verdict: 'PASS',
    gateResults: Object.fromEntries(['F0', 'F1', 'F2', 'F3', 'F4'].map((gate) => [gate, { status: gate === 'F4' ? 'NOT_RUN' : 'PASS' }])),
    unityEvidence: { editorStable: 'PASS', compile: 'PASS', domainReload: 'PASS', console: 'PASS', editMode: 'PASS', playMode: 'PASS', scenePrefabImporterGuid: 'PASS', build: 'PASS', device: 'NOT_RUN', release: 'NOT_RUN' },
    responsiveEvidence: makeResponsiveEvidence(repo),
    uiLayoutMeasurementRef: measurementRef,
    productionContractAudit: { status: 'PASS', contractVersion: work.responsiveContract.version, staticDeclarationOnly: false, buildOnly: false, singleScreenshotOnly: false },
  };
}

/** 写入工作项、包、证据及布局文件，供 inspect/status/run 的端到端门禁测试复用。 */
function seedControlFixture(repo, { stage = 'V4', state = 'VALIDATING', reportPath } = {}) {
  const work = makeScreenWork({ stage, state });
  seedVisualBaseline(repo, work);
  writeJson(join(repo, 'responsive-contract.json'), work.responsiveContract);
  const layout = seedUiLayoutFixture(repo, {
    sceneId: work.scene.sceneId,
    scenePath: 'Assets/Scenes/Main.unity',
    evidenceRoot: work.evidenceRoot,
    candidateId: 'candidate-test',
    ...(reportPath ? { reportPath } : {}),
  });
  const pkg = {
    schemaVersion: '1.0',
    packageId: 'PKG-UI-LAYOUT',
    workItemId: work.workItemId,
    workItemType: 'SCENE',
    baselineHash: work.baselineHash,
    packageStatus: 'FROZEN',
    responsiveContractRef: { path: 'responsive-contract.json', version: work.responsiveContract.version },
    uiLayoutPlanRef: layout.planRef,
    fileOwnership: { 'Assets/UI/Main.cs': 'ui-worker', 'Assets/UI/Main.cs.meta': 'ui-worker' },
    unityOwnership: { metaPairs: [{ asset: 'Assets/UI/Main.cs', meta: 'Assets/UI/Main.cs.meta' }], guidImporter: ['Assets/UI/Main.cs'] },
    executionUnits: [{ unitId: 'SCENE-1', unitType: 'SCENE', moduleId: 'ui', sceneId: work.scene.sceneId, owner: 'ui-worker', files: ['Assets/UI/Main.cs', 'Assets/UI/Main.cs.meta'], acceptanceCommands: ['fixture-only-check'], status: 'READY' }],
  };
  const evidence = makeScreenEvidence(work, repo, layout.measurementRef);
  const workPath = join(repo, 'work.json');
  const packagePath = join(repo, 'package.json');
  const evidencePath = join(repo, 'evidence.json');
  writeJson(workPath, work);
  writeJson(packagePath, pkg);
  writeJson(evidencePath, evidence);
  return {
    repo,
    work,
    pkg,
    evidence,
    layout,
    workPath,
    packagePath,
    evidencePath,
    args: { repo, 'work-item': workPath, 'implementation-package': packagePath, evidence: evidencePath },
  };
}

/** 创建唯一临时项目目录，测试结束后由调用方删除。 */
function temporaryRepo() {
  return mkdtempSync(join(tmpdir(), 'unity-ui-layout-gate-'));
}

/** 构造 V2 或 V4 最小布局检查上下文，便于直接覆盖布局包规则。 */
function directLayoutContext(repo, stage = 'V2') {
  const work = {
    workItemId: 'WI-SCENE',
    workItemType: 'SCENE',
    scene: { sceneId: 'MainScene', stage },
    responsiveContract: { uiSystem: 'UGUI' },
    evidenceRoot: '.workflow-control/evidence/WI-SCENE',
    globalState: stage === 'V4' ? 'VALIDATING' : 'IMPLEMENTING',
  };
  const layout = seedUiLayoutFixture(repo, { sceneId: 'MainScene', evidenceRoot: work.evidenceRoot, candidateId: 'candidate-test' });
  const pkg = { uiLayoutPlanRef: layout.planRef };
  const evidence = { verdict: 'NOT_RUN', candidateId: 'candidate-test' };
  return { work, pkg, evidence, layout, repo };
}

// 布局包从 V2 起是屏幕 UI 的实施输入，非屏幕类型不继承该约束。
test('V2 屏幕 UI 必须绑定派生计划，非屏幕工作项不受该合同扩围', () => {
  const repo = temporaryRepo();
  try {
    const context = directLayoutContext(repo, 'V2');
    assert.match(validateUiLayoutPackage({}, context.work, repo).join('\n'), /V2.*uiLayoutPlanRef/);
    assert.deepEqual(validateUiLayoutPackage(context.pkg, context.work, repo), []);
    assert.deepEqual(inspectUiLayoutEvidence({ ...context, pkg: context.pkg, evidence: { verdict: 'NOT_RUN' } }), []);

    const foundation = { workItemType: 'FOUNDATION', responsiveContract: undefined, stageId: 'foundation-engineering' };
    assert.deepEqual(validateUiLayoutPackage({}, foundation, repo), []);
    assert.match(validateUiLayoutPackage(context.pkg, foundation, repo).join('\n'), /非屏幕UI/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// V4 运行证据必须绑定计划、候选、场景和状态，并完整覆盖计划节点快照。
test('V4 有效同批报告通过，缺报告、旧候选、错误场景状态和部分快照被阻断', () => {
  const repo = temporaryRepo();
  try {
    const context = directLayoutContext(repo, 'V4');
    const inspectEvidence = (report) => inspectUiLayoutEvidence({ ...context, evidence: { verdict: 'PASS', candidateId: 'candidate-test', uiLayoutMeasurementRef: { path: context.layout.reportPath } }, repo });
    assert.deepEqual(inspectEvidence(context.layout.report), []);

    const toolkitPlan = makeUiLayoutPlanFixture({ uiSystem: 'UI_TOOLKIT' });
    const toolkitReport = makeUiLayoutMeasurementFixture(toolkitPlan);
    const toolkitLayout = toolkitPlan.nodes[0].layoutBinding.uiLayout;
    assert.equal(toolkitLayout.positionDriver, 'UITOOLKIT_STYLE');
    assert.deepEqual(toolkitLayout.sizeDrivers, { width: 'UITOOLKIT_LAYOUT', height: 'UITOOLKIT_LAYOUT' });
    assert.deepEqual(validateUiLayoutRuntime(toolkitPlan, toolkitReport, { candidateId: 'candidate-test', scenePath: toolkitPlan.scenePath }), []);

    const staleCandidate = structuredClone(context.layout.report);
    staleCandidate.candidateId = 'candidate-old';
    writeJson(join(repo, context.layout.reportPath), staleCandidate);
    assert.match(inspectEvidence(staleCandidate).map((item) => item.message).join('\n'), /candidateId/);

    const wrongScene = structuredClone(context.layout.report);
    wrongScene.scenePath = 'Assets/Scenes/Other.unity';
    writeJson(join(repo, context.layout.reportPath), wrongScene);
    assert.match(inspectEvidence(wrongScene).map((item) => item.message).join('\n'), /scenePath/);

    const wrongState = structuredClone(context.layout.report);
    wrongState.stateId = 'another-state';
    writeJson(join(repo, context.layout.reportPath), wrongState);
    assert.match(inspectEvidence(wrongState).map((item) => item.message).join('\n'), /stateId/);

    const partialSnapshot = structuredClone(context.layout.report);
    delete partialSnapshot.measurements[0].componentSnapshot.widthWriters;
    writeJson(join(repo, context.layout.reportPath), partialSnapshot);
    assert.match(inspectEvidence(partialSnapshot).map((item) => item.message).join('\n'), /widthWriters/);

    const missingNode = structuredClone(context.layout.report);
    missingNode.measurements = [];
    writeJson(join(repo, context.layout.reportPath), missingNode);
    assert.match(inspectEvidence(missingNode).map((item) => item.message).join('\n'), /缺少计划节点/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// 包与计划身份的跨字段规则区分场景与独立显示层。
test('布局计划绑定当前 sceneId 与 displayLayerId，场景计划不能携带显示层身份', () => {
  const repo = temporaryRepo();
  try {
    const context = directLayoutContext(repo, 'V2');
    const wrongScenePlan = makeUiLayoutPlanFixture({ sceneId: 'OtherScene' });
    writeJson(join(repo, 'Artifacts/Fixtures/wrong-scene.json'), wrongScenePlan);
    assert.match(validateUiLayoutPackage({ uiLayoutPlanRef: { path: 'Artifacts/Fixtures/wrong-scene.json' } }, context.work, repo).join('\n'), /当前场景/);

    const displayPlan = makeUiLayoutPlanFixture({ sceneId: 'MainScene', displayLayerId: 'PauseModal' });
    writeJson(join(repo, 'Artifacts/Fixtures/display-layer.json'), displayPlan);
    const layerWork = {
      workItemType: 'DISPLAY_LAYER',
      displayLayer: { hostSceneId: 'MainScene', displayLayerId: 'PauseModal', stage: 'V2' },
      responsiveContract: { uiSystem: 'UGUI' },
    };
    assert.deepEqual(validateUiLayoutPackage({ uiLayoutPlanRef: { path: 'Artifacts/Fixtures/display-layer.json' } }, layerWork, repo), []);
    layerWork.displayLayer.displayLayerId = 'OtherModal';
    assert.match(validateUiLayoutPackage({ uiLayoutPlanRef: { path: 'Artifacts/Fixtures/display-layer.json' } }, layerWork, repo).join('\n'), /displayLayerId/);
    assert.match(validateUiLayoutPackage({ uiLayoutPlanRef: { path: 'Artifacts/Fixtures/display-layer.json' } }, context.work, repo).join('\n'), /不能冒充/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// 控制面每次检查都要读取当前文件，删除和修复必须立即反映在结果中。
test('inspect 对布局报告删除与原地修复重新读取，不缓存通过结论', () => {
  const repo = temporaryRepo();
  try {
    const fixture = seedControlFixture(repo);
    assert.deepEqual(inspect(fixture.args).blockers.filter((item) => item.code === 'UI_LAYOUT_EVIDENCE_INVALID'), []);
    rmSync(join(repo, fixture.layout.reportPath));
    assert.ok(inspect(fixture.args).blockers.some((item) => item.code === 'UI_LAYOUT_EVIDENCE_INVALID'));
    const repaired = makeUiLayoutMeasurementFixture(fixture.layout.plan, {
      candidateId: fixture.evidence.candidateId,
      outputPath: fixture.layout.reportPath,
    });
    writeJson(join(repo, fixture.layout.reportPath), repaired);
    assert.deepEqual(inspect(fixture.args).blockers.filter((item) => item.code === 'UI_LAYOUT_EVIDENCE_INVALID'), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// 工作流的只读入口和自动推进入口都必须保留布局阻断，直接迁移会重读报告。
test('VALIDATING 与 PASSED 的 inspect/check/status/run 及直接迁移不能绕过布局门禁', () => {
  for (const state of ['VALIDATING', 'PASSED', 'INTEGRATING']) {
    const repo = temporaryRepo();
    try {
      const fixture = seedControlFixture(repo, { state });
      rmSync(join(repo, fixture.layout.reportPath));
      for (const result of [inspect(fixture.args), check(fixture.args), status(fixture.args)]) {
        assert.ok(result.blockers?.some((item) => item.code === 'UI_LAYOUT_EVIDENCE_INVALID')
          || (Array.isArray(result.blockers) && result.blockers.some((message) => /布局|ENOENT/.test(String(message))))
          || result.blocking?.some((message) => /布局|ENOENT/.test(message)), `${state} 应报告布局阻断：${JSON.stringify(result.blockers ?? result.blocking)}`);
      }
      const before = readFileSync(fixture.workPath, 'utf8');
      const blockedRun = run(fixture.args);
      assert.equal(blockedRun.status, 'BLOCKED');
      assert.deepEqual(blockedRun.changed, []);
      assert.equal(readFileSync(fixture.workPath, 'utf8'), before);

      const forgedInspection = inspect(fixture.args);
      forgedInspection.blockers = [];
      const target = state === 'VALIDATING' ? 'PASSED' : state === 'PASSED' ? 'COMPLETE' : 'COMPLETE';
      assert.throws(() => transitionWorkItem(forgedInspection, target), /布局交付门禁失败/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

// JSON 引用必须留在项目内、当前证据根内，且逐级拒绝符号链接。
test('布局报告拒绝缺失文件、路径越界和符号链接', () => {
  const repo = temporaryRepo();
  try {
    const context = directLayoutContext(repo, 'V4');
    const evidence = { verdict: 'PASS', candidateId: 'candidate-test', uiLayoutMeasurementRef: { path: context.layout.reportPath } };
    const inspectCurrent = (currentEvidence = evidence, currentPkg = context.pkg) => inspectUiLayoutEvidence({ work: context.work, pkg: currentPkg, evidence: currentEvidence, repo });

    evidence.uiLayoutMeasurementRef.path = `${context.work.evidenceRoot}/missing.json`;
    assert.ok(inspectCurrent().length > 0);
    evidence.uiLayoutMeasurementRef.path = '../outside.json';
    assert.match(inspectCurrent().map((item) => item.message).join('\n'), /非法|路径|evidenceRoot/);

    const missingPlan = validateUiLayoutPackage({ uiLayoutPlanRef: { path: 'Artifacts/Fixtures/missing-plan.json' } }, context.work, repo);
    assert.match(missingPlan.join('\n'), /ENOENT|不存在/);
    const escapedPlan = validateUiLayoutPackage({ uiLayoutPlanRef: { path: '../outside-plan.json' } }, context.work, repo);
    assert.match(escapedPlan.join('\n'), /非法|路径/);

    const outsideDir = mkdtempSync(join(tmpdir(), 'unity-ui-layout-link-target-'));
    try {
      const outsideReport = join(outsideDir, 'report.json');
      writeJson(outsideReport, context.layout.report);
      const linkPath = join(repo, context.work.evidenceRoot, 'linked-report');
      mkdirSync(dirname(linkPath), { recursive: true });
      symlinkSync(outsideDir, linkPath, 'junction');
      assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
      evidence.uiLayoutMeasurementRef.path = `${context.work.evidenceRoot}/linked-report/report.json`;
      assert.match(inspectCurrent().map((item) => item.message).join('\n'), /符号链接/);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }

    const linkedPlan = join(repo, 'Artifacts/Fixtures/linked-plan');
    mkdirSync(dirname(linkedPlan), { recursive: true });
    symlinkSync(join(repo, 'Artifacts/Fixtures'), linkedPlan, 'junction');
    const linkedPkg = { uiLayoutPlanRef: { path: 'Artifacts/Fixtures/linked-plan/ui-layout-plan.json' } };
    assert.match(validateUiLayoutPackage(linkedPkg, context.work, repo).join('\n'), /符号链接/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// 可检查实施包引用存在、衍生状态有效且导出的机器计划可重复解析。
test('合法工作流包只在同一候选和当前 evidenceRoot 内通过 V4 布局检查', () => {
  const repo = temporaryRepo();
  try {
    const fixture = seedControlFixture(repo);
    assert.doesNotThrow(() => validateImplementationPackage(fixture.pkg, fixture.work, repo));
    const wrongCandidate = structuredClone(fixture.evidence);
    wrongCandidate.candidateId = 'candidate-next';
    writeJson(join(repo, fixture.layout.reportPath), { ...fixture.layout.report, candidateId: 'candidate-test' });
    const blockers = inspectUiLayoutEvidence({
      work: fixture.work,
      pkg: fixture.pkg,
      evidence: { ...wrongCandidate, uiLayoutMeasurementRef: fixture.layout.measurementRef },
      repo,
    });
    assert.match(blockers.map((item) => item.message).join('\n'), /candidateId/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
