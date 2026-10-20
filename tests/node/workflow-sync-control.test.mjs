import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  check,
  inspect,
  run,
  transitionWorkItem,
  validateEvidence,
  validateImplementationPackage,
  validateWorkItem,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import { validateUnityResponsiveContract } from '../../unity-game-workflow-control/scripts/runtime/visible-contract.mjs';
import { stageConfirmationBlockers } from '../../unity-game-workflow-control/scripts/runtime/stage-confirmation.mjs';
import { makeArtFixture } from './helpers/art-experience-fixture.mjs';
import { seedVisualBaseline } from './helpers/workflow-evidence-fixture.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const REQUIRED_EVIDENCE = [
  'gameView', 'screen', 'backbuffer', 'canvasScalerOrPanelSettings', 'camera',
  'screenSafeArea', 'inputHit', 'resizeOrientationTrajectory', 'screenshot', 'supportedOrientations',
];

/** 写入 JSON 工件，保证合同文件和临时测试仓库可复现。 */
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 构造不携带浏览器 CSS/DPR 语义的 Unity 原生响应式合同。 */
function makeContract(overrides = {}) {
  const contract = {
    version: 'unity-responsive/1.0',
    uiSystem: 'UGUI',
    logicalSpace: { mode: 'Canvas', referenceResolution: { width: 1920, height: 1080 }, unit: 'Unity logical units' },
    backbuffer: { source: 'Display', policy: 'platform-measured-display-size', measuredAtRuntime: true },
    panel: { mode: 'Overlay', panelId: 'MainCanvas', runtimePanel: false },
    renderTexture: { enabled: false, format: 'not-used', resolutionPolicy: 'camera-target-policy' },
    canvasScaler: { status: 'configured', enabled: true, mode: 'Scale With Screen Size', screenMatchMode: 'MatchWidthOrHeight', referenceResolution: { width: 1920, height: 1080 }, matchWidthOrHeight: 1 },
    panelSettings: { status: 'not-applicable', reason: 'UGUI does not use UI Toolkit PanelSettings' },
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
    requiredRuntimeEvidence: REQUIRED_EVIDENCE,
  };
  return { ...contract, ...overrides };
}

/** 创建一个 V4 SCENE Work Item，供身份、合同和证据测试复用。 */
function makeSceneWork(overrides = {}) {
  return {
    schemaVersion: '1.0',
    workItemId: 'WI-SCENE',
    projectId: 'unity-sync-test',
    workItemType: 'SCENE',
    moduleIds: ['ui'],
    stageId: 'scene-production',
    globalState: 'VALIDATING',
    scene: { sceneId: 'MainScene', stage: 'V4', status: 'IN_PROGRESS' },
    globalVisualBaselineSelectionRef: { path: 'baseline/selection.json' },
    responsiveContract: makeContract(),
    baselineHash: HASH,
    revision: 0,
    objective: '验证场景响应式闭环',
    allowedActions: ['unity-code-change'],
    actionLevel: 'A3',
    actionType: 'unity-code-change',
    allowedPaths: ['Assets/**'],
    forbiddenPaths: ['Library/**'],
    gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' },
    ...overrides,
  };
}

/** 创建一个 V4 DISPLAY_LAYER Work Item，验证弹窗不依赖宿主实现身份。 */
function makeDisplayLayerWork(overrides = {}) {
  const scene = makeSceneWork();
  delete scene.scene;
  return {
    ...scene,
    workItemId: 'WI-LAYER',
    workItemType: 'DISPLAY_LAYER',
    displayLayer: { displayLayerId: 'PauseModal', hostSceneId: 'MainScene', type: 'modal', stage: 'V4', status: 'IN_PROGRESS' },
    ...overrides,
  };
}

/** 创建满足 V4 运行时证据门的真实测量形状；测试不启动 Unity。 */
function makeResponsiveEvidence(repo = null) {
  const artifact = (source) => {
    const path = `${source}.evidence`;
    const bytes = `runtime-evidence:${source}`;
    if (repo) writeFileSync(join(repo, path), bytes, 'utf8');
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
    resizeOrientationTrajectory: { sameProcess: true, events: [{ type: 'resize', path: 'evidence/resize.json' }, { type: 'orientation', path: 'evidence/orientation.json' }] },
    screenshot: artifact('Screenshot'),
    supportedOrientations: ['portrait', 'landscape'],
  };
}

/** 创建完整 V4 Evidence Manifest。 */
function makeVisibleEvidence(work, overrides = {}, repo = null) {
  return {
    ...makeArtFixture(repo, work).evidenceFields,
    schemaVersion: '1.0',
    evidenceId: 'EV-V4',
    workItemId: work.workItemId,
    packageId: 'PKG-VISIBLE',
    workItemType: work.workItemType,
    visualStage: 'V4',
    contractVersions: { responsiveContract: work.responsiveContract.version },
    baselineHash: work.baselineHash,
    recordedAt: '2026-09-22T00:00:00Z',
    verdict: 'PASS',
    gateResults: { F0: { status: 'PASS' }, F1: { status: 'PASS' }, F2: { status: 'PASS' }, F3: { status: 'PASS' }, F4: { status: 'NOT_RUN' } },
    unityEvidence: { editorStable: 'PASS', compile: 'PASS', domainReload: 'PASS', console: 'PASS', editMode: 'PASS', playMode: 'PASS', scenePrefabImporterGuid: 'PASS', build: 'PASS', device: 'NOT_RUN', release: 'NOT_RUN' },
    responsiveEvidence: makeResponsiveEvidence(repo),
    productionContractAudit: { status: 'PASS', contractVersion: work.responsiveContract.version, staticDeclarationOnly: false, buildOnly: false, singleScreenshotOnly: false },
    ...overrides,
  };
}

/** 创建与当前可见 Work Item 对齐的 Implementation Package 和合同文件。 */
function makeVisiblePackage(work, repo, overrides = {}) {
  const contractPath = join(repo, 'responsive-contract.json');
  writeJson(contractPath, work.responsiveContract);
  return {
    schemaVersion: '1.0',
    packageId: 'PKG-VISIBLE',
    workItemId: work.workItemId,
    workItemType: work.workItemType,
    baselineHash: work.baselineHash,
    packageStatus: 'FROZEN',
    responsiveContractRef: { path: 'responsive-contract.json', version: work.responsiveContract.version },
    fileOwnership: { 'Assets/UI/Main.cs': 'ui-worker', 'Assets/UI/Main.cs.meta': 'ui-worker' },
    unityOwnership: { metaPairs: [{ asset: 'Assets/UI/Main.cs', meta: 'Assets/UI/Main.cs.meta' }], guidImporter: ['Assets/UI/Main.cs'] },
    executionUnits: [{
      unitId: 'VISIBLE-1', unitType: work.workItemType, moduleId: 'ui', owner: 'ui-worker',
      files: ['Assets/UI/Main.cs', 'Assets/UI/Main.cs.meta'], acceptanceCommands: ['fixture-only-check'], status: 'READY',
      ...(work.scene ? { sceneId: work.scene.sceneId } : {}),
      ...(work.displayLayer ? { displayLayerId: work.displayLayer.displayLayerId, hostSceneId: work.displayLayer.hostSceneId } : {}),
    }],
    ...overrides,
  };
}

/** 以 Ajv 校验指定控制面 schema，确保 schema 与 runtime 入口都覆盖新字段。 */
function schemaValidator(name) {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(resolve(`unity-game-workflow-control/schemas/${name}`), 'utf8')));
}

/** 为某阶段构造绑定当前工作项和人工确认记录的测试数据。 */
function makeStageReview(work, stage, options = {}) {
  const review = { stage };
  const confirmation = (confirmedAt, overrides = {}) => ({
      workItemId: work.workItemId,
      stage,
      confirmedBy: 'project-owner',
      confirmedAt,
      userMessageRef: `user-message:${work.workItemId}:${stage}`,
      ...overrides,
    });
  if (stage === 'V2') {
    if (options.decompositionConfirmation !== null) {
      review.decompositionConfirmation = confirmation('2026-09-30T10:00:00+08:00', options.decompositionConfirmation);
    }
    if (options.layoutConfirmation !== null) {
      review.layoutConfirmation = confirmation('2026-09-30T10:01:00+08:00', options.layoutConfirmation);
    }
  } else if (options.confirmation !== null) {
    review.confirmation = confirmation('2026-09-30T10:00:00+08:00', options.confirmation);
  }
  return review;
}

/** 按给定阶段生成独立记录；历史阶段摘要与当前候选摘要可不同。 */
function makeStageReviews(work, stages) {
  return stages.map((stage) => makeStageReview(work, stage));
}

test('合法 SCENE/DISPLAY_LAYER Work Item 必须具备独立身份和 Unity 响应式合同', () => {
  const scene = makeSceneWork();
  const layer = makeDisplayLayerWork();
  assert.doesNotThrow(() => validateWorkItem(scene));
  assert.doesNotThrow(() => validateWorkItem(layer));
  assert.deepEqual(validateUnityResponsiveContract(scene.responsiveContract, { scope: scene.workItemId }), []);
  assert.equal(schemaValidator('work-item.schema.json')(scene), true);
  assert.equal(schemaValidator('work-item.schema.json')(layer), true);
});

test('stageReviews 严格拒绝重复阶段、错误时间和非可见工作项', () => {
  const work = makeSceneWork();
  const review = makeStageReview(work, 'V1');
  const valid = { ...work, stageReviews: [review] };
  assert.doesNotThrow(() => validateWorkItem(valid));
  assert.equal(schemaValidator('work-item.schema.json')(valid), true);

  const duplicateStages = { ...work, stageReviews: [review, structuredClone(review)] };
  assert.throws(() => validateWorkItem(duplicateStages), /不能重复阶段/);
  assert.equal(schemaValidator('work-item.schema.json')(duplicateStages), false);
  const invalidTime = { ...work, stageReviews: [{ ...review, confirmation: { ...review.confirmation, confirmedAt: '2026-02-30T25:00:00Z' } }] };
  assert.throws(() => validateWorkItem(invalidTime), /有效 ISO 8601/);
  assert.equal(schemaValidator('work-item.schema.json')(invalidTime), false);
  const obsoleteV0 = { ...work, stageReviews: [makeStageReview(work, 'V0')] };
  assert.throws(() => validateWorkItem(obsoleteV0), /只能是 V1、V2、V3 或 V4/);
  assert.equal(schemaValidator('work-item.schema.json')(obsoleteV0), false);
  const invalidV2Order = { ...work, stageReviews: [makeStageReview(work, 'V2', {
    decompositionConfirmation: { confirmedAt: '2026-09-30T10:02:00+08:00' },
    layoutConfirmation: { confirmedAt: '2026-09-30T10:01:00+08:00' },
  })] };
  assert.throws(() => validateWorkItem(invalidV2Order), /不能早于/);
  // 两条时间戳的先后由运行时交叉校验，JSON Schema 只校验字段形状。
  assert.equal(schemaValidator('work-item.schema.json')(invalidV2Order), true);
  const legacyV2 = { ...work, stageReviews: [makeStageReview(work, 'V2')] };
  legacyV2.stageReviews[0].confirmation = review.confirmation;
  assert.throws(() => validateWorkItem(legacyV2), /V2 必须分别使用 decompositionConfirmation 和 layoutConfirmation/);
  assert.equal(schemaValidator('work-item.schema.json')(legacyV2), false);
  const nonVisible = { ...work, workItemType: 'FOUNDATION', stageId: 'foundation-engineering' };
  delete nonVisible.scene;
  delete nonVisible.responsiveContract;
  assert.throws(() => validateWorkItem({ ...nonVisible, stageReviews: [] }), /只有 SCENE 和 DISPLAY_LAYER/);
  assert.equal(schemaValidator('work-item.schema.json')({ ...nonVisible, stageReviews: [] }), false);
  assert.doesNotThrow(() => validateWorkItem(nonVisible));
});

test('阶段门要求全部前序人工确认，并允许当前 V0 继续进行', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-stage-history-'));
  try {
    const work = makeSceneWork({
      scene: { sceneId: 'MainScene', stage: 'V2', status: 'IN_PROGRESS' },
      actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    });
    work.stageReviews = [makeStageReview(work, 'V1', { confirmation: null })];
    seedVisualBaseline(repo, work);
    const workPath = join(repo, 'work.json');
    writeJson(workPath, work);
    const inspection = inspect({ repo, 'work-item': workPath });
    assert.ok(inspection.blockers.some((item) => item.code === 'STAGE_CONFIRMATION_PENDING' && item.message === '等待 V1 人工确认'));

    const initial = makeSceneWork({
      globalState: 'REVIEW', scene: { sceneId: 'MainScene', stage: 'V0', status: 'IN_PROGRESS' },
      actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    });
    assert.deepEqual(stageConfirmationBlockers(initial), []);

    const missingLayoutReview = makeSceneWork({
      scene: { sceneId: 'MainScene', stage: 'V3', status: 'IN_PROGRESS' },
      actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    });
    missingLayoutReview.stageReviews = [
      makeStageReview(missingLayoutReview, 'V1'),
      makeStageReview(missingLayoutReview, 'V2', { layoutConfirmation: null }),
    ];
    assert.ok(stageConfirmationBlockers(missingLayoutReview).some((item) => item.message === '等待 V2 布局 人工确认'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V1+ SCENE 必须引用真实的三候选全局视觉基线', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-visible-baseline-'));
  try {
    const work = makeSceneWork({
      globalState: 'REVIEW',
      scene: { sceneId: 'MainScene', stage: 'V1', status: 'IN_PROGRESS' },
      actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    });
    const workPath = join(repo, 'work.json');
    writeJson(workPath, work);
    assert.ok(inspect({ repo, 'work-item': workPath }).blockers.some((item) => item.code === 'VISUAL_BASELINE_INVALID'));

    seedVisualBaseline(repo, work);
    writeJson(workPath, work);
    const selectionPath = join(repo, work.globalVisualBaselineSelectionRef.path);
    const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
    assert.equal(selection.candidates.length, 3);
    assert.equal(inspect({ repo, 'work-item': workPath }).blockers.some((item) => item.code === 'VISUAL_BASELINE_INVALID'), false);

    selection.candidates.pop();
    writeJson(selectionPath, selection);
    assert.ok(inspect({ repo, 'work-item': workPath }).blockers.some((item) => item.code === 'VISUAL_BASELINE_INVALID'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('当前 PASS 证据不能替代人工确认，run/check 阻断后确认齐备才能完成', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-stage-current-'));
  try {
    const work = makeSceneWork({
      actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    });
    work.stageReviews = makeStageReviews(work, ['V1', 'V2', 'V3']);
    seedVisualBaseline(repo, work);
    const workPath = join(repo, 'work.json');
    const evidencePath = join(repo, 'evidence.json');
    writeJson(workPath, work);
    writeJson(evidencePath, makeVisibleEvidence(work, {}, repo));
    const args = { repo, 'work-item': workPath, evidence: evidencePath };

    const checked = check(args);
    assert.equal(checked.status, 'BLOCKED');
    assert.ok(checked.blocking.includes('等待 V4 人工确认'));
    const blockedRun = run(args);
    assert.equal(blockedRun.status, 'BLOCKED');
    assert.deepEqual(blockedRun.changed, []);

    work.stageReviews.push(makeStageReview(work, 'V4'));
    writeJson(workPath, work);
    const completed = run(args);
    assert.equal(completed.status, 'COMPLETE');
    assert.deepEqual(completed.changed, ['VALIDATING → PASSED', 'PASSED → COMPLETE']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('直接迁移重算阶段门；F4 或 userDecisionRequired=false 不能绕过，RETURN/BLOCKED 可进入修复', () => {
  const work = makeSceneWork({
    globalState: 'REVIEW', scene: { sceneId: 'MainScene', stage: 'V1', status: 'PASS' },
    actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
    userDecisionRequired: false, gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'PASS' },
  });
  const forgedInspection = { work, blockers: [], evidence: null, pkg: null };
  assert.throws(() => transitionWorkItem(forgedInspection, 'VALIDATING'), /等待 V1 人工确认/);

  const returned = transitionWorkItem(forgedInspection, 'RETURN', {
    'return-category': 'scope-changed', 'return-reason': '需重新确认', 'affected-scope': 'scene:MainScene',
  });
  assert.equal(returned.globalState, 'RETURN');
  assert.equal(returned.returnRecord.returnState, 'PROPOSAL');
  assert.deepEqual(returned.returnRecord.invalidatedArtifacts, ['implementationPackage', 'executionState', 'evidenceManifest', 'approval']);
  assert.deepEqual(returned.returnRecord.invalidatedReferences, {
    implementationPackagePath: null, evidenceManifestPath: null, packageId: null, evidenceId: null, planVersion: null,
  });
  assert.throws(() => transitionWorkItem({ ...forgedInspection, work: returned }, 'IMPLEMENTING', { 'return-resolution': '重新实施' }), /只能恢复到影响范围确定的 PROPOSAL/);
  assert.throws(() => transitionWorkItem({ ...forgedInspection, work: returned }, 'BLOCKED', { reason: '绕过恢复点' }), /非法状态迁移/);
  assert.equal(transitionWorkItem(forgedInspection, 'BLOCKED', { reason: '待用户确认' }).globalState, 'BLOCKED');
});

test('COMPLETE 必须处于 V4；实现调整不使既有阶段确认失效', () => {
  const v3 = makeSceneWork({
    globalState: 'INTEGRATING', scene: { sceneId: 'MainScene', stage: 'V3', status: 'PASS' },
    actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
  });
  v3.stageReviews = makeStageReviews(v3, ['V1', 'V2', 'V3']);
  assert.throws(() => transitionWorkItem({ work: v3, blockers: [], evidence: null, pkg: null }, 'COMPLETE'), /必须到达 V4/);

  const changedCandidate = makeSceneWork({
    globalState: 'VALIDATING', scene: { sceneId: 'MainScene', stage: 'V0', status: 'PASS' },
    actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'],
  });
  changedCandidate.stageReviews = [];
  // 阶段完成后允许实现和预算细节继续微调，既有用户确认仍按工作项身份和阶段有效。
  changedCandidate.responsiveContract.performanceBudget.memoryMb += 128;
  assert.deepEqual(stageConfirmationBlockers(changedCandidate), []);
});

test('确认绑定工作项和阶段身份；不绑定基线摘要，DISPLAY_LAYER 不继承宿主 SCENE 确认', () => {
  const scene = makeSceneWork({ scene: { sceneId: 'MainScene', stage: 'V1', status: 'IN_PROGRESS' } });
  scene.stageReviews = [makeStageReview(scene, 'V1')];
  const layer = makeDisplayLayerWork({
    displayLayer: { displayLayerId: 'PauseModal', hostSceneId: 'MainScene', type: 'modal', stage: 'V2', status: 'IN_PROGRESS' },
    stageReviews: scene.stageReviews,
  });
  const layerPath = join(mkdtempSync(join(tmpdir(), 'unity-layer-review-')), 'work.json');
  seedVisualBaseline(resolve(layerPath, '..'), layer);
  writeJson(layerPath, layer);
  const inspection = inspect({ repo: resolve(layerPath, '..'), 'work-item': layerPath });
  assert.ok(inspection.blockers.some((item) => item.code === 'STAGE_CONFIRMATION_STALE'));

  const changedBaseline = makeSceneWork({ scene: { sceneId: 'MainScene', stage: 'V1', status: 'IN_PROGRESS' } });
  changedBaseline.stageReviews = [makeStageReview(changedBaseline, 'V1')];
  changedBaseline.baselineHash = `sha256:${'c'.repeat(64)}`;
  assert.deepEqual(stageConfirmationBlockers(changedBaseline), []);
  rmSync(resolve(layerPath, '..'), { recursive: true, force: true });
});

test('缺失 workItemType、场景身份或 DISPLAY_LAYER 宿主身份时 fail closed', () => {
  const missingType = makeSceneWork();
  delete missingType.workItemType;
  assert.throws(() => validateWorkItem(missingType), /workItemType/);
  const missingScene = makeSceneWork({ scene: { stage: 'V4', status: 'IN_PROGRESS' } });
  assert.throws(() => validateWorkItem(missingScene), /sceneId/);
  const missingHost = makeDisplayLayerWork({ displayLayer: { displayLayerId: 'PauseModal', type: 'modal', stage: 'V4', status: 'IN_PROGRESS' } });
  assert.throws(() => validateWorkItem(missingHost), /hostSceneId/);
});

test('SCENE 与 DISPLAY_LAYER 不能混包，宿主依赖不能冒充 sceneId', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-package-'));
  try {
    const scene = makeSceneWork();
    const pkg = makeVisiblePackage(scene, repo);
    const mixed = structuredClone(pkg);
    mixed.executionUnits.push({ unitId: 'LAYER-1', unitType: 'DISPLAY_LAYER', moduleId: 'ui', displayLayerId: 'PauseModal', hostSceneId: 'MainScene', owner: 'ui-worker', files: ['Assets/UI/Main.cs'], acceptanceCommands: ['fixture-only-check'], status: 'READY' });
    assert.throws(() => validateImplementationPackage(mixed, scene, repo), /混入 SCENE 与 DISPLAY_LAYER/);
    const misplaced = structuredClone(pkg);
    misplaced.executionUnits[0].hostSceneId = 'MainScene';
    assert.throws(() => validateImplementationPackage(misplaced, scene, repo), /不得声明 displayLayerId\/hostSceneId/);
    assert.equal(schemaValidator('implementation-package.schema.json')(pkg), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('合法 DISPLAY_LAYER 包绑定 displayLayerId/hostSceneId 和合同引用', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-layer-'));
  try {
    const work = makeDisplayLayerWork();
    const pkg = makeVisiblePackage(work, repo);
    assert.doesNotThrow(() => validateImplementationPackage(pkg, work, repo));
    assert.equal(schemaValidator('implementation-package.schema.json')(pkg), true);
    const wrongHost = structuredClone(pkg);
    wrongHost.executionUnits[0].hostSceneId = 'OtherScene';
    assert.throws(() => validateImplementationPackage(wrongHost, work, repo), /hostSceneId/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 PASS 缺少真实响应式证据时 fail closed，SHA 字段不再是验收输入', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-evidence-'));
  try {
    const work = makeSceneWork();
    const missing = makeVisibleEvidence(work, { responsiveEvidence: undefined }, repo);
    assert.throws(() => validateEvidence(missing, work, null, repo), /responsiveEvidence|V4/);
    const bad = makeVisibleEvidence(work, { responsiveEvidence: { ...makeResponsiveEvidence(repo), inputHit: { system: 'InputSystem', eventSystem: 'EventSystem', hit: false, coordinates: { x: 1 } } } }, repo);
    assert.throws(() => validateEvidence(bad, work, null, repo), /inputHit/);
    assert.equal(schemaValidator('evidence-manifest.schema.json')(makeVisibleEvidence(work)), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('程序化文本精确五语言，非程序化文本允许不声明 localePolicies', () => {
  const valid = makeContract({ textLocalization: { programmatic: false } });
  assert.deepEqual(validateUnityResponsiveContract(valid), []);
  const invalidExtra = makeContract({ textLocalization: { programmatic: false, locales: ['en'], localePolicies: {} } });
  assert.match(validateUnityResponsiveContract(invalidExtra).join('\n'), /不得伪造/);
  const invalidLocales = makeContract({ textLocalization: { ...makeContract().textLocalization, locales: ['en', 'zh-CN', 'ja', 'ru', 'de'] } });
  assert.match(validateUnityResponsiveContract(invalidLocales).join('\n'), /精确/);
});

test('Unity UI 路线不伪造另一套原生资产，sourceScale 覆盖必须有审计引用', () => {
  const toolkit = makeContract({
    uiSystem: 'UI Toolkit',
    canvasScaler: { status: 'not-applicable', reason: 'UI Toolkit does not use CanvasScaler' },
    panelSettings: { status: 'configured', enabled: true, scaleMode: 'ScaleWithScreenSize', screenMatchMode: 'MatchWidthOrHeight', referenceResolution: { width: 1920, height: 1080 }, referenceDpi: 96, match: 1 },
  });
  assert.deepEqual(validateUnityResponsiveContract(toolkit), []);
  const fakePanel = makeContract({ panelSettings: { status: 'configured', enabled: true, scaleMode: 'Scale With Screen Size', referenceResolution: { width: 1920, height: 1080 }, referenceDpi: 96 } });
  assert.match(validateUnityResponsiveContract(fakePanel).join('\n'), /不得伪造 PanelSettings/);
  const missingScaler = makeContract({ canvasScaler: { status: 'not-applicable', reason: '错误地跳过当前 UI 系统' } });
  assert.match(validateUnityResponsiveContract(missingScaler).join('\n'), /必须配置 CanvasScaler/);
  const override = makeContract({ resourceResolution: { sourceScale: 1.5, runtimeScalePolicy: 'platform-measured', platformMeasured: true, override: { reason: 'pixel-art source', evidenceRef: 'evidence/source-scale.json' } } });
  assert.deepEqual(validateUnityResponsiveContract(override), []);
  const validateSchema = schemaValidator('work-item.schema.json');
  assert.equal(validateSchema(makeSceneWork({ responsiveContract: override })), true);
  const missingRef = makeContract({ resourceResolution: { sourceScale: 2, runtimeScalePolicy: 'platform-measured', platformMeasured: true } });
  assert.match(validateUnityResponsiveContract(missingRef).join('\n'), /sourceScale|approvalRef|evidenceRef/);
  // 旧两倍值不再是免审计默认值，Schema 与运行时必须同时拒绝无依据的覆盖。
  assert.equal(validateSchema(makeSceneWork({ responsiveContract: missingRef })), false);
});

test('屏幕 UI 使用固定设计分辨率和方向对应的 Match', () => {
  const portraitReference = { width: 1080, height: 1920 };
  const portrait = makeContract({
    logicalSpace: { mode: 'Canvas', referenceResolution: portraitReference, unit: 'Unity logical units' },
    canvasScaler: { ...makeContract().canvasScaler, referenceResolution: portraitReference, matchWidthOrHeight: 0 },
  });
  assert.deepEqual(validateUnityResponsiveContract(portrait), []);
  assert.match(validateUnityResponsiveContract(makeContract({ canvasScaler: { ...makeContract().canvasScaler, matchWidthOrHeight: 0 } })).join('\n'), /Match=1/);
  assert.match(validateUnityResponsiveContract(makeContract({ logicalSpace: { mode: 'Canvas', referenceResolution: { width: 1280, height: 720 }, unit: 'Unity logical units' } })).join('\n'), /1920×1080/);
  assert.match(validateUnityResponsiveContract(makeContract({ canvasScaler: { ...makeContract().canvasScaler, mode: 'Constant Pixel Size' } })).join('\n'), /随屏幕尺寸缩放/);
  assert.match(validateUnityResponsiveContract(makeContract({ canvasScaler: { ...makeContract().canvasScaler, enabled: false } })).join('\n'), /随屏幕尺寸缩放/);
  assert.match(validateUnityResponsiveContract(makeContract({ canvasScaler: { ...makeContract().canvasScaler, screenMatchMode: 'Expand' } })).join('\n'), /MatchWidthOrHeight/);
});

test('响应式合同引用记录来源版本，合同内容和版本变动不阻塞实施', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-contract-'));
  try {
    const work = makeSceneWork();
    const pkg = makeVisiblePackage(work, repo);
    const drifted = { ...work.responsiveContract, performanceBudget: { ...work.responsiveContract.performanceBudget, memoryMb: 256 } };
    drifted.version = 'unity-responsive/2.0';
    writeJson(join(repo, 'responsive-contract.json'), drifted);
    pkg.responsiveContractRef.version = 'unity-responsive/legacy-source';
    assert.doesNotThrow(() => validateImplementationPackage(pkg, work, repo));

    writeFileSync(join(repo, 'responsive-contract.json'), '{invalid json', 'utf8');
    assert.throws(() => validateImplementationPackage(pkg, work, repo), /不是有效 JSON/);
    writeJson(join(repo, 'responsive-contract.json'), null);
    assert.throws(() => validateImplementationPackage(pkg, work, repo), /必须是 JSON 对象/);
    writeJson(join(repo, 'responsive-contract.json'), ['not', 'a', 'contract']);
    assert.throws(() => validateImplementationPackage(pkg, work, repo), /必须是 JSON 对象/);
    pkg.responsiveContractRef.path = '../outside.json';
    assert.throws(() => validateImplementationPackage(pkg, work, repo), /必须位于仓库内/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 真实工件无需 SHA，内容变化可继续验收，缺失或越界工件仍失败', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-artifact-'));
  try {
    const work = makeSceneWork();
    const evidence = makeVisibleEvidence(work, {}, repo);
    assert.equal(schemaValidator('evidence-manifest.schema.json')(evidence), true);
    assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
    evidence.contractVersions.responsiveContract = 'historical-source-version';
    evidence.productionContractAudit.contractVersion = 'different-audit-source';
    assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
    delete evidence.productionContractAudit.contractVersion;
    assert.equal(schemaValidator('evidence-manifest.schema.json')(evidence), false);
    assert.throws(() => validateEvidence(evidence, work, null, repo), /productionContractAudit/);
    evidence.productionContractAudit.contractVersion = 'different-audit-source';
    writeFileSync(join(repo, evidence.responsiveEvidence.screenshot.path), 'tampered content', 'utf8');
    assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));

    evidence.responsiveEvidence.screenshot.path = 'missing.evidence';
    assert.throws(() => validateEvidence(evidence, work, null, repo), /指向的运行工件不存在/);
    evidence.responsiveEvidence.screenshot.path = '../outside.evidence';
    assert.throws(() => validateEvidence(evidence, work, null, repo), /必须位于仓库内/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 单方向布局无需跨方向事件，双方向和自动方向仍需切换证据', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-orientation-'));
  try {
    // 同进程两次 resize 保留连续适配覆盖，不能用单张静态视口替代。
    for (const supported of [['landscape'], ['portrait'], ['portrait', 'landscape'], ['auto']]) {
      const work = makeSceneWork({ responsiveContract: makeContract({ orientation: { supported, runtimeReflow: true } }) });
      const evidence = makeVisibleEvidence(work, {}, repo);
      evidence.responsiveEvidence.supportedOrientations = supported;
      evidence.responsiveEvidence.resizeOrientationTrajectory.events = [{ type: 'resize' }, { type: 'resize' }];
      assert.equal(schemaValidator('evidence-manifest.schema.json')(evidence), true);
      if (supported.length === 1 && supported[0] !== 'auto') {
        assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
        evidence.responsiveEvidence.resizeOrientationTrajectory.sameProcess = false;
        assert.throws(() => validateEvidence(evidence, work, null, repo), /同进程/);
        evidence.responsiveEvidence.resizeOrientationTrajectory.sameProcess = true;
        evidence.responsiveEvidence.resizeOrientationTrajectory.events = [{ type: 'resize' }];
        assert.throws(() => validateEvidence(evidence, work, null, repo), /连续 resize/);
      } else {
        assert.throws(() => validateEvidence(evidence, work, null, repo), /resize 和 orientation/);
        evidence.responsiveEvidence.resizeOrientationTrajectory.events.push({ type: 'orientation' });
        assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 响应式证据按本次支持方向决定是否要求方向切换轨迹', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-artifact-'));
  try {
    const work = makeSceneWork();
    work.responsiveContract = makeContract({ orientation: { supported: ['landscape'], runtimeReflow: true } });
    const evidence = makeVisibleEvidence(work, {}, repo);
    evidence.responsiveEvidence.supportedOrientations = ['landscape'];
    evidence.responsiveEvidence.resizeOrientationTrajectory.events = [{ type: 'resize' }, { type: 'resize' }];
    assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
    // 即使合同只记载横屏，本次运行显示支持双方向时仍必须记录方向切换。
    evidence.responsiveEvidence.supportedOrientations = ['landscape', 'portrait'];
    assert.throws(() => validateEvidence(evidence, work, null, repo), /resize 和 orientation/);
    evidence.responsiveEvidence.resizeOrientationTrajectory.events.push({ type: 'orientation' });
    assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
    evidence.responsiveEvidence.supportedOrientations = ['landscape', 'landscape'];
    assert.throws(() => validateEvidence(evidence, work, null, repo), /supportedOrientations/);
    assert.equal(schemaValidator('evidence-manifest.schema.json')(evidence), false);
    delete evidence.responsiveEvidence.supportedOrientations;
    assert.equal(schemaValidator('evidence-manifest.schema.json')(evidence), false);
    assert.throws(() => validateEvidence(evidence, work, null, repo), /supportedOrientations/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('直接完成迁移也重读美术材料，不能用伪造 inspect 的 PASS 绕过', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-art-transition-'));
  try {
    const work = makeSceneWork({ globalState: 'PASSED', actionLevel: 'A1', actionType: 'unity-spec-candidate', allowedActions: ['unity-spec-candidate'] });
    work.stageReviews = makeStageReviews(work, ['V1', 'V2', 'V3', 'V4']);
    seedVisualBaseline(repo, work);
    const evidence = makeVisibleEvidence(work, {}, repo);
    const inspection = { repo, work, evidence, pkg: null, blockers: [] };
    assert.equal(transitionWorkItem(inspection, 'COMPLETE').globalState, 'COMPLETE');
    delete evidence.artExperienceAcceptanceRef;
    assert.throws(() => transitionWorkItem(inspection, 'COMPLETE'), /artExperienceAcceptanceRef/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
