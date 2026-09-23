import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Unity 可见工作项的机器枚举；SCENE 与 DISPLAY_LAYER 必须独立闭环。 */
export const WORK_ITEM_TYPES = Object.freeze(['PROJECT', 'FOUNDATION', 'SCENE', 'DISPLAY_LAYER', 'INTEGRATION', 'RELEASE']);

/** Unity 瞬态显示层允许的语义类型。 */
export const DISPLAY_LAYER_TYPES = Object.freeze(['modal', 'popup', 'drawer', 'toast']);

/** Unity 原生响应式合同的唯一版本；版本变化会使运行证据重新测量。 */
export const UNITY_RESPONSIVE_CONTRACT_VERSION = 'unity-responsive/1.0';

/** 程序化文本必须覆盖且只能覆盖的语言集合。 */
export const PROGRAMMATIC_TEXT_LOCALES = Object.freeze(['en', 'zh-CN', 'ja', 'ru', 'es']);

/** 可见工作项的运行证据阶段。 */
export const VISUAL_STAGES = Object.freeze(['V0', 'V1', 'V2', 'V3', 'V4']);

/** V4 必须由真实 Unity 运行事实覆盖的证据槽位。 */
export const UNITY_RESPONSIVE_EVIDENCE_FIELDS = Object.freeze([
  'gameView', 'screen', 'backbuffer', 'canvasScalerOrPanelSettings', 'camera',
  'screenSafeArea', 'inputHit', 'resizeOrientationTrajectory', 'screenshot', 'candidateSha256',
]);

/** 判断是否为不含数组的结构化对象。 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 判断字符串是否具有可审计内容。 */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 判断是否为标准 sha256 身份。 */
function isSha256(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/i.test(value);
}

/** 返回稳定的合同错误消息，供 CLI 和测试共享。 */
function contractError(scope, message, field = '') {
  return `[Unity responsive ${scope || '*'}] ${message}${field ? ` 缺失=${field}` : ''}`;
}

/** 允许结构化合同字段使用显式值，但拒绝空对象、空数组和空字符串。 */
function hasFact(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return nonEmptyString(value) || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
}

/** 校验对象只使用当前 Unity 合同声明的字段。 */
function knownObject(value, allowed, label, errors) {
  if (!isObject(value)) {
    errors.push(contractError(label, '必须为对象'));
    return false;
  }
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(contractError(label, `含未声明字段：${key}`, key));
  return true;
}

/** 校验二维正数尺寸；运行证据中的 backbuffer 还必须是整数像素。 */
function validSize(value, integer = false) {
  return isObject(value)
    && Number.isFinite(value.width) && value.width > 0
    && Number.isFinite(value.height) && value.height > 0
    && (!integer || Number.isInteger(value.width) && Number.isInteger(value.height));
}

/** 生成按键名稳定排序的 JSON，用于比较合同语义而不依赖属性书写顺序。 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** 校验 Unity 原生响应式合同，禁止把浏览器 CSS/DPR 语义带入 Unity。 */
export function validateUnityResponsiveContract(contract, options = {}) {
  const scope = options.scope ?? '*';
  const errors = [];
  if (!knownObject(contract, new Set([
    'version', 'uiSystem', 'logicalSpace', 'backbuffer', 'panel', 'renderTexture',
    'canvasScaler', 'panelSettings', 'camera', 'safeArea', 'inputCoordinates', 'resize',
    'orientation', 'textLocalization', 'resourceResolution', 'performanceBudget',
    'representativeViewports', 'requiredRuntimeEvidence',
  ]), scope, errors)) return errors;
  const required = ['version', 'uiSystem', 'logicalSpace', 'backbuffer', 'panel', 'renderTexture', 'canvasScaler', 'panelSettings', 'camera', 'safeArea', 'inputCoordinates', 'resize', 'orientation', 'textLocalization', 'resourceResolution', 'performanceBudget', 'representativeViewports', 'requiredRuntimeEvidence'];
  for (const field of required) if (contract[field] === undefined || contract[field] === null) errors.push(contractError(scope, `响应式合同缺少 ${field}`, field));
  if (contract.version !== UNITY_RESPONSIVE_CONTRACT_VERSION) errors.push(contractError(scope, `version 必须为 ${UNITY_RESPONSIVE_CONTRACT_VERSION}`, 'version'));
  if (!['UGUI', 'UI Toolkit', 'World Space Canvas'].includes(contract.uiSystem)) errors.push(contractError(scope, 'uiSystem 必须是 UGUI、UI Toolkit 或 World Space Canvas', 'uiSystem'));

  const logical = contract.logicalSpace;
  if (knownObject(logical, new Set(['mode', 'referenceResolution', 'unit']), `${scope}.logicalSpace`, errors)) {
    if (!nonEmptyString(logical.mode) || !['Canvas', 'Panel', 'RenderTexture', 'World'].includes(logical.mode)) errors.push(contractError(scope, 'logicalSpace.mode 无效'));
    if (!validSize(logical.referenceResolution, true)) errors.push(contractError(scope, 'logicalSpace.referenceResolution 必须是正整数尺寸'));
    if (logical.unit !== 'Unity logical units') errors.push(contractError(scope, 'logicalSpace.unit 必须为 Unity logical units'));
  }

  const backbuffer = contract.backbuffer;
  if (knownObject(backbuffer, new Set(['source', 'policy', 'measuredAtRuntime']), `${scope}.backbuffer`, errors)) {
    if (!['Display', 'Screen', 'CameraTarget'].includes(backbuffer.source)) errors.push(contractError(scope, 'backbuffer.source 必须是 Unity 显示输出来源'));
    if (!nonEmptyString(backbuffer.policy)) errors.push(contractError(scope, 'backbuffer.policy 不能为空'));
    if (backbuffer.measuredAtRuntime !== true) errors.push(contractError(scope, 'backbuffer 必须声明运行时实测'));
  }

  const panel = contract.panel;
  if (knownObject(panel, new Set(['mode', 'panelId', 'runtimePanel']), `${scope}.panel`, errors)) {
    if (!['Overlay', 'Camera', 'World'].includes(panel.mode)) errors.push(contractError(scope, 'panel.mode 无效'));
    if (!nonEmptyString(panel.panelId)) errors.push(contractError(scope, 'panel.panelId 不能为空'));
    if (typeof panel.runtimePanel !== 'boolean') errors.push(contractError(scope, 'panel.runtimePanel 必须为布尔值'));
  }

  const renderTexture = contract.renderTexture;
  if (knownObject(renderTexture, new Set(['enabled', 'format', 'resolutionPolicy']), `${scope}.renderTexture`, errors)) {
    if (typeof renderTexture.enabled !== 'boolean') errors.push(contractError(scope, 'renderTexture.enabled 必须为布尔值'));
    if (!nonEmptyString(renderTexture.format)) errors.push(contractError(scope, 'renderTexture.format 不能为空'));
    if (!nonEmptyString(renderTexture.resolutionPolicy)) errors.push(contractError(scope, 'renderTexture.resolutionPolicy 不能为空'));
  }

  for (const [name, allowed] of [
    ['canvasScaler', new Set(['status', 'reason', 'enabled', 'mode', 'screenMatchMode', 'referenceResolution', 'matchWidthOrHeight'])],
    ['panelSettings', new Set(['status', 'reason', 'enabled', 'scaleMode', 'screenMatchMode', 'referenceResolution', 'referenceDpi', 'match'])],
  ]) {
    const value = contract[name];
    if (!knownObject(value, allowed, `${scope}.${name}`, errors)) continue;
    if (value.status === 'not-applicable') {
      if (!nonEmptyString(value.reason)) errors.push(contractError(scope, `${name}=not-applicable 必须说明原因`));
      continue;
    }
    if (value.status !== 'configured') errors.push(contractError(scope, `${name}.status 必须是 configured 或 not-applicable`));
    if (typeof value.enabled !== 'boolean') errors.push(contractError(scope, `${name}.enabled 必须为布尔值`));
    const mode = value.mode ?? value.scaleMode;
    if (!nonEmptyString(mode)) errors.push(contractError(scope, `${name} 必须声明缩放模式`));
    if (!validSize(value.referenceResolution, true)) errors.push(contractError(scope, `${name}.referenceResolution 必须是正整数尺寸`));
    if (name === 'canvasScaler' && (typeof value.matchWidthOrHeight !== 'number' || value.matchWidthOrHeight < 0 || value.matchWidthOrHeight > 1)) errors.push(contractError(scope, 'canvasScaler.matchWidthOrHeight 必须位于 0 到 1'));
    if (name === 'panelSettings' && (typeof value.referenceDpi !== 'number' || value.referenceDpi <= 0)) errors.push(contractError(scope, 'panelSettings.referenceDpi 必须为正数'));
  }
  if ((contract.uiSystem === 'UGUI' || contract.uiSystem === 'UI Toolkit') && contract.panel?.mode !== 'World') {
    // 屏幕 UI 使用方向对应的唯一设计基准；实际输出像素仍由设备和相机决定。
    const reference = logical?.referenceResolution;
    const landscape = reference?.width === 1920 && reference?.height === 1080;
    const portrait = reference?.width === 1080 && reference?.height === 1920;
    if (!landscape && !portrait) errors.push(contractError(scope, '屏幕 UI 参考分辨率必须为横屏 1920×1080 或竖屏 1080×1920'));
    const settings = contract.uiSystem === 'UGUI' ? contract.canvasScaler : contract.panelSettings;
    if (settings?.status === 'configured') {
      const expectedMode = contract.uiSystem === 'UGUI' ? 'Scale With Screen Size' : 'ScaleWithScreenSize';
      if (settings.enabled !== true || (settings.mode ?? settings.scaleMode) !== expectedMode || settings.screenMatchMode !== 'MatchWidthOrHeight') errors.push(contractError(scope, '屏幕 UI 必须启用随屏幕尺寸缩放和 MatchWidthOrHeight 匹配模式'));
      const actual = settings.referenceResolution;
      if (actual?.width !== reference?.width || actual?.height !== reference?.height) errors.push(contractError(scope, 'UI 缩放参考分辨率必须与 logicalSpace 一致'));
      const match = contract.uiSystem === 'UGUI' ? settings.matchWidthOrHeight : settings.match;
      if ((landscape || portrait) && match !== (landscape ? 1 : 0)) errors.push(contractError(scope, '横屏必须适配高（Match=1），竖屏必须适配宽（Match=0）'));
    }
  }
  if (['UGUI', 'World Space Canvas'].includes(contract.uiSystem) && contract.panelSettings?.status !== 'not-applicable') errors.push(contractError(scope, `${contract.uiSystem} 不得伪造 PanelSettings 资产，应声明 not-applicable`));
  if (['UGUI', 'World Space Canvas'].includes(contract.uiSystem) && contract.canvasScaler?.status !== 'configured') errors.push(contractError(scope, `${contract.uiSystem} 必须配置 CanvasScaler`));
  if (contract.uiSystem === 'UI Toolkit' && contract.canvasScaler?.status !== 'not-applicable') errors.push(contractError(scope, 'UI Toolkit 不得伪造 CanvasScaler 资产，应声明 not-applicable'));
  if (contract.uiSystem === 'UI Toolkit' && contract.panelSettings?.status !== 'configured') errors.push(contractError(scope, 'UI Toolkit 必须配置 PanelSettings'));

  const camera = contract.camera;
  if (knownObject(camera, new Set(['id', 'renderMode', 'viewport', 'projection', 'measuredAtRuntime']), `${scope}.camera`, errors)) {
    if (!nonEmptyString(camera.id) || !nonEmptyString(camera.renderMode) || !nonEmptyString(camera.projection)) errors.push(contractError(scope, 'camera 必须声明 id、renderMode 和 projection'));
    if (!validSize(camera.viewport)) errors.push(contractError(scope, 'camera.viewport 必须是正数尺寸'));
    if (camera.measuredAtRuntime !== true) errors.push(contractError(scope, 'camera 必须声明运行时实测'));
  }

  const safeArea = contract.safeArea;
  if (knownObject(safeArea, new Set(['source', 'policy', 'measuredAtRuntime']), `${scope}.safeArea`, errors)) {
    if (safeArea.source !== 'Screen.safeArea') errors.push(contractError(scope, 'safeArea.source 必须为 Screen.safeArea'));
    if (!nonEmptyString(safeArea.policy) || safeArea.measuredAtRuntime !== true) errors.push(contractError(scope, 'safeArea 必须声明策略和运行时实测'));
  }

  const input = contract.inputCoordinates;
  if (knownObject(input, new Set(['inputSystem', 'eventSystem', 'screenToLocal', 'cameraRaycast']), `${scope}.inputCoordinates`, errors)) {
    if (input.inputSystem !== 'InputSystem' || input.eventSystem !== 'EventSystem') errors.push(contractError(scope, 'inputCoordinates 必须明确 InputSystem/EventSystem'));
    if (!nonEmptyString(input.screenToLocal) || !nonEmptyString(input.cameraRaycast)) errors.push(contractError(scope, 'inputCoordinates 必须声明 screenToLocal 和 cameraRaycast'));
  }

  const resize = contract.resize;
  if (knownObject(resize, new Set(['mode', 'events', 'sameProcess']), `${scope}.resize`, errors)) {
    if (!nonEmptyString(resize.mode) || !Array.isArray(resize.events) || resize.events.length === 0) errors.push(contractError(scope, 'resize 必须声明模式和事件'));
    if (resize.sameProcess !== true) errors.push(contractError(scope, 'resize 必须支持同进程重算'));
  }
  const orientation = contract.orientation;
  if (knownObject(orientation, new Set(['supported', 'runtimeReflow']), `${scope}.orientation`, errors)) {
    if (!Array.isArray(orientation.supported) || orientation.supported.length === 0 || orientation.supported.some((item) => !['portrait', 'landscape', 'auto'].includes(item))) errors.push(contractError(scope, 'orientation.supported 必须声明合法方向'));
    if (orientation.runtimeReflow !== true) errors.push(contractError(scope, 'orientation 必须声明运行时重排'));
  }

  const text = contract.textLocalization;
  if (knownObject(text, new Set(['programmatic', 'locales', 'localePolicies']), `${scope}.textLocalization`, errors)) {
    if (typeof text.programmatic !== 'boolean') errors.push(contractError(scope, 'textLocalization.programmatic 必须为布尔值'));
    if (text.programmatic === true) {
      if (JSON.stringify(text.locales) !== JSON.stringify(PROGRAMMATIC_TEXT_LOCALES)) errors.push(contractError(scope, '程序化文本 locales 必须精确为 en、zh-CN、ja、ru、es'));
      if (!knownObject(text.localePolicies, new Set(PROGRAMMATIC_TEXT_LOCALES), `${scope}.textLocalization.localePolicies`, errors)) {
        // 具体语言键的错误已由 knownObject 给出。
      } else {
        for (const locale of PROGRAMMATIC_TEXT_LOCALES) {
          const policy = text.localePolicies[locale];
          if (!knownObject(policy, new Set(['singleLine', 'wrap', 'truncation']), `${scope}.${locale}`, errors)) continue;
          if (typeof policy.singleLine !== 'boolean' || typeof policy.wrap !== 'boolean' || policy.truncation !== 'forbidden') errors.push(contractError(scope, `${locale} 必须声明 singleLine、wrap 且禁止截断`));
        }
      }
    } else if (text.locales !== undefined || text.localePolicies !== undefined) errors.push(contractError(scope, '非程序化文本不得伪造程序化 locales/localePolicies'));
  }

  const resources = contract.resourceResolution;
  if (knownObject(resources, new Set(['sourceScale', 'runtimeScalePolicy', 'platformMeasured', 'override']), `${scope}.resourceResolution`, errors)) {
    if (typeof resources.sourceScale !== 'number' || !Number.isFinite(resources.sourceScale) || resources.sourceScale <= 0) errors.push(contractError(scope, 'resourceResolution.sourceScale 必须为正数'));
    if (resources.sourceScale !== 2) {
      const override = resources.override;
      if (!knownObject(override, new Set(['reason', 'approvalRef', 'evidenceRef']), `${scope}.resourceResolution.override`, errors)
        || !nonEmptyString(override.reason) || (!nonEmptyString(override.approvalRef) && !nonEmptyString(override.evidenceRef))) errors.push(contractError(scope, '非 2x sourceScale 必须提供 reason 和 approvalRef/evidenceRef'));
    }
    if (!nonEmptyString(resources.runtimeScalePolicy) || resources.platformMeasured !== true) errors.push(contractError(scope, '资源运行时缩放必须按平台实测，不能使用运行时 DPR'));
  }

  const budget = contract.performanceBudget;
  if (knownObject(budget, new Set(['frameTimeMs', 'uiDrawCalls', 'renderTexturePixels', 'memoryMb', 'degradationPolicy']), `${scope}.performanceBudget`, errors)) {
    for (const field of ['frameTimeMs', 'uiDrawCalls', 'renderTexturePixels', 'memoryMb']) if (typeof budget[field] !== 'number' || !Number.isFinite(budget[field]) || budget[field] < 0) errors.push(contractError(scope, `performanceBudget.${field} 必须为非负有限数字`));
    if (!nonEmptyString(budget.degradationPolicy)) errors.push(contractError(scope, 'performanceBudget.degradationPolicy 不能为空'));
  }

  if (!Array.isArray(contract.representativeViewports) || contract.representativeViewports.length < 2) errors.push(contractError(scope, 'representativeViewports 至少覆盖两个真实代表性视口'));
  else {
    const ids = new Set();
    for (const [index, viewport] of contract.representativeViewports.entries()) {
      if (!knownObject(viewport, new Set(['id', 'width', 'height', 'orientation']), `${scope}.representativeViewports[${index}]`, errors)) continue;
      if (!nonEmptyString(viewport.id) || ids.has(viewport.id)) errors.push(contractError(scope, `representativeViewports[${index}].id 必须唯一`));
      ids.add(viewport.id);
      if (!Number.isInteger(viewport.width) || viewport.width <= 0 || !Number.isInteger(viewport.height) || viewport.height <= 0) errors.push(contractError(scope, `representativeViewports[${index}] 必须记录正整数尺寸`));
      if (!['portrait', 'landscape', 'square'].includes(viewport.orientation)) errors.push(contractError(scope, `representativeViewports[${index}].orientation 无效`));
    }
  }
  const requiredEvidence = contract.requiredRuntimeEvidence;
  if (!Array.isArray(requiredEvidence) || !UNITY_RESPONSIVE_EVIDENCE_FIELDS.every((field) => requiredEvidence.includes(field))) errors.push(contractError(scope, 'requiredRuntimeEvidence 未覆盖完整 Unity V4 运行证据', 'requiredRuntimeEvidence'));
  return [...new Set(errors)];
}

/** 校验可见工作项的身份分流，避免把宿主字段误当成独立显示层身份。 */
export function validateVisibleWorkItemContract(work) {
  const errors = [];
  const type = work?.workItemType;
  if (!WORK_ITEM_TYPES.includes(type)) return [`Work Item.workItemType 无效：${String(type ?? 'missing')}`];
  const scene = work.scene;
  const layer = work.displayLayer;
  if (type === 'SCENE') {
    if (work.stageId !== 'scene-production') errors.push('SCENE Work Item 必须位于 scene-production');
    if (!isObject(scene) || !nonEmptyString(scene.sceneId)) errors.push('SCENE Work Item 必须提供 scene.sceneId');
    if (isObject(scene) && (!VISUAL_STAGES.includes(scene.stage) || !['NOT_STARTED', 'IN_PROGRESS', 'PASS', 'FAIL', 'NOT_RUN'].includes(scene.status))) errors.push('SCENE.scene 必须同时声明 V0-V4 stage 和 status');
    if (layer !== undefined) errors.push('SCENE Work Item 不得携带 displayLayer 身份');
  } else if (type === 'DISPLAY_LAYER') {
    if (work.stageId !== 'scene-production') errors.push('DISPLAY_LAYER Work Item 必须位于 scene-production');
    if (!isObject(layer) || !nonEmptyString(layer.displayLayerId) || !nonEmptyString(layer.hostSceneId)) errors.push('DISPLAY_LAYER Work Item 必须提供 displayLayerId 和 hostSceneId');
    if (isObject(layer)) {
      knownObject(layer, new Set(['displayLayerId', 'hostSceneId', 'type', 'stage', 'status']), 'Work Item.displayLayer', errors);
      if (!DISPLAY_LAYER_TYPES.includes(layer.type)) errors.push('DISPLAY_LAYER.displayLayer.type 必须是 modal、popup、drawer 或 toast');
    }
    if (layer?.stage === undefined || !VISUAL_STAGES.includes(layer.stage)) errors.push('DISPLAY_LAYER.displayLayer.stage 必须是 V0-V4');
    if (!['NOT_STARTED', 'IN_PROGRESS', 'PASS', 'FAIL', 'NOT_RUN'].includes(layer?.status)) errors.push('DISPLAY_LAYER.displayLayer.status 无效');
    if (scene !== undefined) errors.push('DISPLAY_LAYER Work Item 不得携带 scene 身份；hostSceneId 仅是上下文');
  } else if (scene !== undefined || layer !== undefined) {
    errors.push(`${type} Work Item 不得携带 SCENE/DISPLAY_LAYER 身份字段`);
  }
  if (['SCENE', 'DISPLAY_LAYER'].includes(type)) {
    if (!isSha256(work.candidateSha256)) errors.push(`${type} Work Item 必须绑定 candidateSha256`);
    const contractErrors = validateUnityResponsiveContract(work.responsiveContract, { scope: work.workItemId });
    errors.push(...contractErrors);
  } else if (work.responsiveContract !== undefined) {
    errors.push(`${type} Work Item 不应声明可见响应式合同`);
  }
  return [...new Set(errors)];
}

/** 校验响应式合同引用，绑定仓库内文件的版本和内容 SHA。 */
export function validateResponsiveContractReference(reference, work, repo) {
  const errors = [];
  if (!knownObject(reference, new Set(['path', 'version', 'sha256']), 'Implementation Package.responsiveContractRef', errors)) return errors;
  if (!nonEmptyString(reference.path) || !nonEmptyString(reference.version) || !isSha256(reference.sha256)) errors.push('responsiveContractRef 必须包含 path、version 和 sha256');
  if (reference.version !== work.responsiveContract?.version) errors.push('responsiveContractRef.version 未绑定 Work Item.responsiveContract.version');
  if (!nonEmptyString(reference.path)) return errors;
  const root = resolve(repo);
  const target = resolve(root, reference.path);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath === '..' || relativePath.startsWith('..\\') || relativePath.startsWith('../') || isAbsolute(relativePath)) errors.push('responsiveContractRef.path 必须位于仓库内');
  if (errors.length || !existsSync(target)) {
    if (!existsSync(target)) errors.push('responsiveContractRef.path 指向的合同文件不存在');
    return [...new Set(errors)];
  }
  const actual = `sha256:${createHash('sha256').update(readFileSync(target)).digest('hex')}`;
  if (actual !== reference.sha256) errors.push('responsiveContractRef.sha256 与合同文件内容不一致');
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf8'));
    if (parsed.version !== reference.version) errors.push('responsiveContractRef.version 与合同文件不一致');
    if (canonicalJson(parsed) !== canonicalJson(work.responsiveContract)) errors.push('responsiveContractRef.path 内容未绑定当前 Work Item.responsiveContract');
  } catch (error) {
    errors.push(`responsiveContractRef.path 不是有效 JSON：${error.message}`);
  }
  return [...new Set(errors)];
}

/** 校验实施包类型、可见单元身份和 SCENE/DISPLAY_LAYER 隔离。 */
export function validateVisibleImplementationPackage(pkg, work, repo) {
  const errors = [];
  if (!WORK_ITEM_TYPES.includes(pkg?.workItemType)) errors.push(`Implementation Package.workItemType 无效：${String(pkg?.workItemType ?? 'missing')}`);
  if (pkg?.workItemType !== work.workItemType) errors.push('Implementation Package.workItemType 必须与 Work Item 一致');
  const units = Array.isArray(pkg?.executionUnits) ? pkg.executionUnits : [];
  const sceneUnits = units.filter((unit) => unit.unitType === 'SCENE');
  const layerUnits = units.filter((unit) => unit.unitType === 'DISPLAY_LAYER');
  if (sceneUnits.length && layerUnits.length) errors.push('同一 Implementation Package 禁止混入 SCENE 与 DISPLAY_LAYER 单元');
  const type = work.workItemType;
  if (type === 'SCENE' && !sceneUnits.length) errors.push('SCENE Work Item 的 Implementation Package 必须包含 SCENE 单元');
  if (type === 'DISPLAY_LAYER' && !layerUnits.length) errors.push('DISPLAY_LAYER Work Item 的 Implementation Package 必须包含 DISPLAY_LAYER 单元');
  for (const unit of units) {
    if (unit.unitType === 'SCENE') {
      if (!nonEmptyString(unit.sceneId) || unit.sceneId !== work.scene?.sceneId) errors.push(`SCENE 单元 ${unit.unitId} 必须绑定当前 sceneId`);
      if (unit.displayLayerId !== undefined || unit.hostSceneId !== undefined) errors.push(`SCENE 单元 ${unit.unitId} 不得声明 displayLayerId/hostSceneId`);
    } else if (unit.unitType === 'DISPLAY_LAYER') {
      if (!nonEmptyString(unit.displayLayerId) || unit.displayLayerId !== work.displayLayer?.displayLayerId) errors.push(`DISPLAY_LAYER 单元 ${unit.unitId} 必须绑定当前 displayLayerId`);
      if (!nonEmptyString(unit.hostSceneId) || unit.hostSceneId !== work.displayLayer?.hostSceneId) errors.push(`DISPLAY_LAYER 单元 ${unit.unitId} 必须绑定当前 hostSceneId 上下文`);
      if (unit.sceneId !== undefined) errors.push(`DISPLAY_LAYER 单元 ${unit.unitId} 不得把 hostSceneId 冒充 sceneId`);
    } else if (unit.sceneId !== undefined || unit.displayLayerId !== undefined || unit.hostSceneId !== undefined) {
      errors.push(`非可见单元 ${unit.unitId} 不得声明场景/显示层身份`);
    }
  }
  if (['SCENE', 'DISPLAY_LAYER'].includes(type)) {
    if (!pkg.responsiveContractRef) errors.push('可见 Implementation Package 必须绑定 responsiveContractRef');
    else errors.push(...validateResponsiveContractReference(pkg.responsiveContractRef, work, repo));
  } else if (pkg.responsiveContractRef !== undefined) errors.push(`${type} Implementation Package 不得携带 responsiveContractRef`);
  return [...new Set(errors)];
}

/** 校验证据路径位于仓库内，且声明 SHA 与文件原始字节一致。 */
function validateMeasuredFile(value, repo, scope, field, errors) {
  if (!nonEmptyString(repo)) {
    errors.push(contractError(scope, `${field} 缺少仓库上下文，无法验证真实工件`));
    return;
  }
  const root = resolve(repo);
  const target = resolve(root, value.path);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath === '..' || relativePath.startsWith('..\\') || relativePath.startsWith('../') || isAbsolute(relativePath)) {
    errors.push(contractError(scope, `${field}.path 必须位于仓库内`));
    return;
  }
  if (!existsSync(target)) {
    errors.push(contractError(scope, `${field}.path 指向的运行工件不存在`));
    return;
  }
  const actual = `sha256:${createHash('sha256').update(readFileSync(target)).digest('hex')}`;
  if (actual !== value.sha256) errors.push(contractError(scope, `${field}.sha256 与运行工件内容不一致`));
}

/** 判断一项运行证据是否为结构化且可回读的 Unity 工件。 */
function measuredArtifact(value, source, scope, field, errors, repo) {
  if (!knownObject(value, new Set(['source', 'measured', 'path', 'sha256', 'size', 'orientation']), `${scope}.${field}`, errors)) return;
  if (value.source !== source || value.measured !== true || !nonEmptyString(value.path) || !isSha256(value.sha256)) errors.push(contractError(scope, `${field} 必须是带来源、路径、SHA 的真实运行测量`));
  else validateMeasuredFile(value, repo, scope, field, errors);
}

/** 校验 V4 真实 Game View、Screen、backbuffer、输入和同进程轨迹。 */
export function validateUnityResponsiveEvidence(evidence, work, options = {}) {
  const scope = work?.workItemId ?? '*';
  const errors = [];
  if (!isObject(evidence)) return [contractError(scope, 'responsiveEvidence 必须为对象')];
  measuredArtifact(evidence.gameView, 'GameView', scope, 'gameView', errors, options.repo);
  measuredArtifact(evidence.screen, 'Screen', scope, 'screen', errors, options.repo);
  measuredArtifact(evidence.backbuffer, 'backbuffer', scope, 'backbuffer', errors, options.repo);
  const scaler = evidence.canvasScaler;
  const panel = evidence.panelSettings;
  if (!scaler && !panel) errors.push(contractError(scope, 'V4 必须实测 CanvasScaler 或 PanelSettings'));
  for (const [field, expected] of [['canvasScaler', 'CanvasScaler'], ['panelSettings', 'PanelSettings']]) {
    const value = evidence[field];
    if (value !== undefined) measuredArtifact(value, expected, scope, field, errors, options.repo);
  }
  measuredArtifact(evidence.camera, 'Camera', scope, 'camera', errors, options.repo);
  const safeArea = evidence.safeArea;
  if (!knownObject(safeArea, new Set(['source', 'measured', 'rect']), `${scope}.safeArea`, errors) || safeArea.source !== 'Screen.safeArea' || safeArea.measured !== true || !hasFact(safeArea.rect)) errors.push(contractError(scope, 'safeArea 必须是 Screen.safeArea 的真实测量'));
  const input = evidence.inputHit;
  if (!knownObject(input, new Set(['system', 'eventSystem', 'hit', 'coordinates']), `${scope}.inputHit`, errors) || input.system !== 'InputSystem' || input.eventSystem !== 'EventSystem' || input.hit !== true || !hasFact(input.coordinates)) errors.push(contractError(scope, 'inputHit 必须证明 InputSystem/EventSystem 命中'));
  const trajectory = evidence.resizeOrientationTrajectory;
  if (!knownObject(trajectory, new Set(['sameProcess', 'events']), `${scope}.resizeOrientationTrajectory`, errors) || trajectory.sameProcess !== true || !Array.isArray(trajectory.events) || !trajectory.events.some((item) => item.type === 'resize') || !trajectory.events.some((item) => item.type === 'orientation')) errors.push(contractError(scope, 'resizeOrientationTrajectory 必须记录同进程 resize 和 orientation'));
  measuredArtifact(evidence.screenshot, 'Screenshot', scope, 'screenshot', errors, options.repo);
  if (!isSha256(evidence.candidateSha256)) errors.push(contractError(scope, 'candidateSha256 必须为候选身份 SHA'));
  if (options.candidateSha256 && evidence.candidateSha256 !== options.candidateSha256) errors.push(contractError(scope, 'candidateSha256 未绑定当前候选'));
  return [...new Set(errors)];
}

/** 校验 Evidence Manifest 的可见类型、阶段、版本和 V4 生产合同审计。 */
export function validateVisibleEvidenceContract(evidence, work, repo) {
  const errors = [];
  if (evidence.workItemType !== work.workItemType) errors.push('Evidence Manifest.workItemType 必须与 Work Item 一致');
  if (!VISUAL_STAGES.includes(evidence.visualStage)) errors.push('Evidence Manifest.visualStage 必须是 V0-V4');
  const contractVersion = work.responsiveContract?.version;
  if (!isObject(evidence.contractVersions) || evidence.contractVersions.responsiveContract !== (contractVersion ?? 'not-applicable')) errors.push('Evidence Manifest.contractVersions.responsiveContract 未绑定当前合同版本');
  const visible = ['SCENE', 'DISPLAY_LAYER'].includes(work.workItemType);
  const stage = work.workItemType === 'SCENE' ? work.scene?.stage : work.displayLayer?.stage;
  if (visible && evidence.visualStage !== stage) errors.push('Evidence Manifest.visualStage 未绑定当前可见 Work Item 阶段');
  if (visible && evidence.visualStage === 'V4' && evidence.verdict === 'PASS') {
    errors.push(...validateUnityResponsiveEvidence(evidence.responsiveEvidence, work, { candidateSha256: work.candidateSha256, repo }));
    const audit = evidence.productionContractAudit;
    if (!isObject(audit) || audit.status !== 'PASS' || audit.contractVersion !== contractVersion || audit.candidateSha256 !== evidence.responsiveEvidence?.candidateSha256 || audit.staticDeclarationOnly !== false || audit.buildOnly !== false || audit.singleScreenshotOnly !== false) errors.push('V4 PASS 必须有真实 productionContractAudit，静态声明/构建成功/单图不能替代运行证据');
  }
  return [...new Set(errors)];
}

/** 将可见合同错误转成当前控制面的统一 WorkflowControlError。 */
export function assertVisibleContract(errors, fail) {
  if (errors.length) fail(errors[0], 2, { errorCode: 'VISIBLE_CONTRACT_INVALID' });
}

/** 校验实施包的 Unity 所有权实体结构；依赖主控制面的统一字段错误处理器。 */
export function validateUnityOwnershipShape(ownership, { knownObject: checkObject, stringArray, fail }) {
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) fail('Implementation Package.unityOwnership 必须为对象');
  checkObject(ownership, new Set(['metaPairs', 'guidImporter', 'serializedAssets', 'scenePrefabScriptableObject', 'projectSettingsPackagesBuildSettings']), 'Implementation Package.unityOwnership');
  for (const field of ['guidImporter', 'serializedAssets', 'scenePrefabScriptableObject', 'projectSettingsPackagesBuildSettings']) stringArray(ownership[field], `unityOwnership.${field}`);
  if (ownership.metaPairs !== undefined) {
    if (!Array.isArray(ownership.metaPairs)) fail('unityOwnership.metaPairs 必须为数组');
    for (const pair of ownership.metaPairs) {
      checkObject(pair, new Set(['asset', 'meta']), 'unityOwnership.metaPairs');
      stringArray([pair.asset, pair.meta], 'unityOwnership.metaPairs 条目', true);
    }
  }
  return ownership;
}

/** 校验实施单元依赖存在、无环和完成顺序；保持状态迁移的失败原因稳定。 */
export function validateUnitDependencies(units, { stringArray, fail }) {
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));
  for (const unit of units) {
    const dependencies = stringArray(unit.dependsOn, `实施单元 ${unit.unitId}.dependsOn`);
    if (new Set(dependencies).size !== dependencies.length) fail(`实施单元 dependsOn 不能重复：${unit.unitId}`, 2, { errorCode: 'UNIT_DEPENDENCY_DUPLICATE' });
    if (dependencies.includes(unit.unitId)) fail(`实施单元不能依赖自身：${unit.unitId}`, 2, { errorCode: 'UNIT_SELF_DEPENDENCY' });
    for (const dependency of dependencies) if (!byId.has(dependency)) fail(`实施单元依赖不存在：${unit.unitId} → ${dependency}`, 2, { errorCode: 'UNIT_DEPENDENCY_MISSING' });
    unit.dependsOn = dependencies;
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (unitId) => {
    if (visiting.has(unitId)) fail(`实施单元依赖存在循环：${unitId}`, 2, { errorCode: 'UNIT_DEPENDENCY_CYCLE' });
    if (visited.has(unitId)) return;
    visiting.add(unitId);
    for (const dependency of byId.get(unitId).dependsOn) visit(dependency);
    visiting.delete(unitId);
    visited.add(unitId);
  };
  for (const unit of units) visit(unit.unitId);
  for (const unit of units) if (['IMPLEMENTING', 'COMPLETE'].includes(unit.status) && unit.dependsOn.some((dependency) => byId.get(dependency).status !== 'COMPLETE')) fail(`实施单元 ${unit.unitId} 的依赖尚未 COMPLETE`, 2, { errorCode: 'UNIT_DEPENDENCY_NOT_COMPLETE' });
}
