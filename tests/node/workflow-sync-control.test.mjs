import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  validateEvidence,
  validateImplementationPackage,
  validateWorkItem,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import { validateUnityResponsiveContract } from '../../unity-game-workflow-control/scripts/runtime/visible-contract.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const CANDIDATE = `sha256:${'b'.repeat(64)}`;
const REQUIRED_EVIDENCE = [
  'gameView', 'screen', 'backbuffer', 'canvasScalerOrPanelSettings', 'camera',
  'screenSafeArea', 'inputHit', 'resizeOrientationTrajectory', 'screenshot', 'candidateSha256',
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
    resourceResolution: { sourceScale: 2, runtimeScalePolicy: 'platform-canvas-panel-camera-measured', platformMeasured: true },
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
    responsiveContract: makeContract(),
    candidateSha256: CANDIDATE,
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
    const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    return { source, measured: true, path, sha256, size: { width: 1920, height: 1080 }, orientation: 'landscape' };
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
    candidateSha256: CANDIDATE,
  };
}

/** 创建完整 V4 Evidence Manifest。 */
function makeVisibleEvidence(work, overrides = {}, repo = null) {
  return {
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
    productionContractAudit: { status: 'PASS', contractVersion: work.responsiveContract.version, candidateSha256: CANDIDATE, staticDeclarationOnly: false, buildOnly: false, singleScreenshotOnly: false },
    ...overrides,
  };
}

/** 创建与当前可见 Work Item 对齐的 Implementation Package 和合同文件。 */
function makeVisiblePackage(work, repo, overrides = {}) {
  const contractPath = join(repo, 'responsive-contract.json');
  writeJson(contractPath, work.responsiveContract);
  const sha256 = `sha256:${createHash('sha256').update(readFileSync(contractPath)).digest('hex')}`;
  return {
    schemaVersion: '1.0',
    packageId: 'PKG-VISIBLE',
    workItemId: work.workItemId,
    workItemType: work.workItemType,
    baselineHash: work.baselineHash,
    packageStatus: 'FROZEN',
    responsiveContractRef: { path: 'responsive-contract.json', version: work.responsiveContract.version, sha256 },
    fileOwnership: { 'Assets/UI/Main.cs': 'ui-worker', 'Assets/UI/Main.cs.meta': 'ui-worker' },
    unityOwnership: { metaPairs: [{ asset: 'Assets/UI/Main.cs', meta: 'Assets/UI/Main.cs.meta' }], guidImporter: ['Assets/UI/Main.cs'] },
    executionUnits: [{
      unitId: 'VISIBLE-1', unitType: work.workItemType, moduleId: 'ui', owner: 'ui-worker',
      files: ['Assets/UI/Main.cs', 'Assets/UI/Main.cs.meta'], status: 'READY',
      ...(work.scene ? { sceneId: work.scene.sceneId } : {}),
      ...(work.displayLayer ? { displayLayerId: work.displayLayer.displayLayerId, hostSceneId: work.displayLayer.hostSceneId } : {}),
    }],
    ...overrides,
  };
}

/** 以 Ajv 校验指定控制面 schema，确保 schema 与 runtime 入口都覆盖新字段。 */
function schemaValidator(name) {
  const ajv = new Ajv2020({ strict: false });
  return ajv.compile(JSON.parse(readFileSync(resolve(`unity-game-workflow-control/schemas/${name}`), 'utf8')));
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
    mixed.executionUnits.push({ unitId: 'LAYER-1', unitType: 'DISPLAY_LAYER', moduleId: 'ui', displayLayerId: 'PauseModal', hostSceneId: 'MainScene', owner: 'ui-worker', files: ['Assets/UI/Main.cs'], status: 'READY' });
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

test('V4 PASS 缺少真实响应式证据或候选 SHA 时 fail closed', () => {
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
  const missingRef = makeContract({ resourceResolution: { sourceScale: 1.5, runtimeScalePolicy: 'platform-measured', platformMeasured: true } });
  assert.match(validateUnityResponsiveContract(missingRef).join('\n'), /sourceScale|approvalRef|evidenceRef/);
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

test('响应式合同引用必须绑定当前 Work Item 的完整合同内容', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-contract-'));
  try {
    const work = makeSceneWork();
    const pkg = makeVisiblePackage(work, repo);
    const drifted = { ...work.responsiveContract, performanceBudget: { ...work.responsiveContract.performanceBudget, memoryMb: 256 } };
    writeJson(join(repo, 'responsive-contract.json'), drifted);
    pkg.responsiveContractRef.sha256 = `sha256:${createHash('sha256').update(readFileSync(join(repo, 'responsive-contract.json'))).digest('hex')}`;
    assert.throws(() => validateImplementationPackage(pkg, work, repo), /未绑定当前 Work Item/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 响应式证据候选 SHA 必须绑定当前 Work Item', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-candidate-'));
  try {
    const work = makeSceneWork();
    const evidence = makeVisibleEvidence(work, {}, repo);
    evidence.responsiveEvidence.candidateSha256 = HASH;
    evidence.productionContractAudit.candidateSha256 = HASH;
    assert.throws(() => validateEvidence(evidence, work, null, repo), /未绑定当前候选/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('V4 响应式证据必须回读真实工件并校验内容 SHA', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-sync-artifact-'));
  try {
    const work = makeSceneWork();
    const evidence = makeVisibleEvidence(work, {}, repo);
    writeFileSync(join(repo, evidence.responsiveEvidence.screenshot.path), 'tampered', 'utf8');
    assert.throws(() => validateEvidence(evidence, work, null, repo), /screenshot\.sha256/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
