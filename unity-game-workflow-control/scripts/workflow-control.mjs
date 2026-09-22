#!/usr/bin/env node
/** Unity 游戏全局工作流控制 CLI；只操作控制面记录，不启动 Unity、服务、设备或发布流程。 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalizePosixPath as canonicalizePosixPathRuntime, commitWithLock } from './runtime/io.mjs';
import { assertVisibleContract, validateUnitDependencies, validateUnityOwnershipShape, validateVisibleEvidenceContract, validateVisibleImplementationPackage, validateVisibleWorkItemContract } from './runtime/visible-contract.mjs';
/** 唯一接受的数据合同版本；旧字段不会被迁移或解释。 */
export const SCHEMA_VERSION = '1.0';
/** 用户可见的六个项目阶段。 */
export const STAGES = Object.freeze(['requirements-scope', 'global-baseline', 'foundation-engineering', 'scene-production', 'global-integration-validation', 'release']);
/** 单场景证据阶段。 */
export const SCENE_STAGES = Object.freeze(['V0', 'V1', 'V2', 'V3', 'V4']);
/** 工作项全局状态。 */
export const STATES = Object.freeze(['INTAKE', 'BASELINE', 'PROPOSAL', 'REVIEW', 'IMPLEMENTING', 'VALIDATING', 'PASSED', 'INTEGRATING', 'RELEASE_APPROVAL_REQUIRED', 'RELEASING', 'COMPLETE', 'RETURN', 'BLOCKED']);
/** 控制门集合。 */
export const GATES = Object.freeze(['F0', 'F1', 'F2', 'F3', 'F4']);
/** 实施包单元类型。 */
export const UNIT_TYPES = Object.freeze(['SHARED', 'MODULE', 'SCENE', 'DISPLAY_LAYER', 'INTEGRATION', 'RELEASE']);

/** 合法前向迁移图；RETURN/BLOCKED 的恢复路径只能由显式 transition 使用。 */
export const TRANSITIONS = Object.freeze({
  INTAKE: ['BASELINE', 'BLOCKED'],
  BASELINE: ['PROPOSAL', 'BLOCKED'],
  PROPOSAL: ['REVIEW', 'BLOCKED', 'RETURN'],
  REVIEW: ['IMPLEMENTING', 'VALIDATING', 'BLOCKED', 'RETURN'],
  IMPLEMENTING: ['VALIDATING', 'BLOCKED', 'RETURN'],
  VALIDATING: ['PASSED', 'BLOCKED', 'RETURN'],
  PASSED: ['INTEGRATING', 'RELEASE_APPROVAL_REQUIRED', 'COMPLETE', 'BLOCKED', 'RETURN'],
  INTEGRATING: ['COMPLETE', 'RELEASE_APPROVAL_REQUIRED', 'BLOCKED', 'RETURN'],
  RELEASE_APPROVAL_REQUIRED: ['RELEASING', 'BLOCKED', 'RETURN'],
  RELEASING: ['COMPLETE', 'BLOCKED'],
  RETURN: ['BASELINE', 'PROPOSAL', 'REVIEW', 'IMPLEMENTING', 'BLOCKED'],
  BLOCKED: ['BASELINE', 'PROPOSAL', 'REVIEW', 'IMPLEMENTING'],
  COMPLETE: [],
});

/** Unity 动作白名单及唯一风险等级。未知 unity-* 动作也不能旁路控制面。 */
export const ACTION_LEVEL = Object.freeze({
  'unity-inspect': 'A0',
  'unity-spec-candidate': 'A1',
  'unity-prototype': 'A2',
  'unity-code-change': 'A3',
  'unity-asset-change': 'A3',
  'unity-scene-change': 'A3',
  'unity-display-layer-change': 'A3',
  'unity-qa-build': 'A3',
  'unity-integration': 'A4',
  'unity-migration': 'A4',
  'unity-project-settings': 'A4',
  'unity-external-config': 'A5',
  'unity-device-test': 'A5',
  'unity-build-upload': 'A5',
  'unity-release': 'A6',
  'unity-store-submit': 'A6',
  'unity-rollback': 'A6',
});

/** 阶段中文标签仅用于稳定展示，不参与门禁判断。 */
export const STAGE_LABELS = Object.freeze({
  'requirements-scope': '需求与范围', 'global-baseline': '全局基线', 'foundation-engineering': '基础工程',
  'scene-production': '场景与弹窗生产', 'global-integration-validation': '全局集成验证',
  release: '发布',
});
/** 场景阶段中文标签仅用于稳定展示。 */
export const SCENE_LABELS = Object.freeze({ V0: '分流', V1: '场景定义', V2: '拆解确认', V3: '正式资源与组合验收', V4: '正式实现与运行验收' });
/** 控制面异常；CLI 入口会把它转换为稳定 JSON 错误。 */
export class WorkflowControlError extends Error {
  /** 创建带机器可读错误码的控制面异常。 */
  constructor(message, code = 2, details = {}) {
    super(String(message));
    this.name = 'WorkflowControlError';
    this.code = code;
    this.details = details;
  }
}

/** 抛出统一控制面异常。 */
export function fail(message, code = 2, details = {}) {
  throw new WorkflowControlError(message, code, details);
}
/** 解析 CLI 参数；重复选项保留为数组，便于绑定多个输入文件。 */
export function parseArgs(argv = []) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const equal = token.indexOf('=');
    const rawKey = equal >= 0 ? token.slice(2, equal) : token.slice(2);
    const key = rawKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    let value = equal >= 0 ? token.slice(equal + 1) : undefined;
    if (value === undefined && index + 1 < argv.length && !String(argv[index + 1]).startsWith('--')) value = String(argv[++index]);
    if (value === undefined) value = true;
    if (args[key] === undefined) args[key] = value;
    else args[key] = Array.isArray(args[key]) ? [...args[key], value] : [args[key], value];
  }
  return args;
}
/** 将单值或重复 CLI 值统一成数组。 */
function values(value) {
  if (value === undefined || value === null || value === true) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => String(item));
}
/** 读取 JSON 控制工件并给出包含文件名的错误。 */
export function readJson(file, label = 'JSON') {
  if (!file) fail(`${label} 路径不能为空`);
  const path = resolve(String(file));
  if (!existsSync(path) || !statSync(path).isFile()) fail(`${label} 不存在：${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} 不是有效 JSON：${path}（${error.message}）`);
  }
}
/** 把路径统一为仓库相对 POSIX 表示，并拒绝越出仓库。 */
export function normalizeRepoPath(repo, input) {
  const base = resolve(repo);
  const absolute = resolve(base, String(input));
  const rel = relative(base, absolute);
  if (!rel || rel === '.') return '.';
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) fail(`路径越出 Unity 仓库：${input}`);
  return rel.replaceAll('\\', '/');
}
/** 将 Unity 文件或 glob 模式规范化为严格 POSIX 相对路径。 */
export function canonicalizePosixPath(input, label = '路径') {
  return canonicalizePosixPathRuntime(input, label, fail);
}
/** 规范化路径模式，不把通配符当作真实文件解析。 */
function normalizePattern(pattern) {
  return canonicalizePosixPath(pattern);
}

/** 以最小 glob 语义匹配路径，支持 *、? 和 **。 */
export function pathMatches(path, pattern) {
  const value = normalizePattern(path);
  const source = normalizePattern(pattern);
  let expression = '^';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '*' && source[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
  }
  return new RegExp(`${expression}$`).test(value);
}
/** 确认数组内容均为非空字符串。 */
function stringArray(value, label, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) fail(`${label} 必须为${required ? '非空' : ''}字符串数组`);
  return [...value];
}

/** 确认对象只包含 schema 已声明的字段，拒绝旧版或拼写错误字段。 */
function knownObject(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须为对象`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} 含未声明字段：${key}`, 2, { errorCode: 'UNKNOWN_FIELD', field: key });
}

/** 校验 schemaVersion，避免控制面静默接受旧数据。 */
function schemaVersion(value, label) {
  if (value?.schemaVersion !== SCHEMA_VERSION) fail(`${label}.schemaVersion 必须为 ${SCHEMA_VERSION}`);
}

/** 校验枚举值。 */
function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} 无效：${value}`);
}

/** 返回有效的 gate 状态对象。 */
function gateStatuses(value, label) {
  if (value === undefined) return {};
  knownObject(value, new Set(GATES), label);
  for (const [gate, status] of Object.entries(value)) enumValue(status, ['PASS', 'FAIL', 'NOT_RUN'], `${label}.${gate}`);
  return { ...value };
}

/** 从嵌套 pendingApproval 或扁平动作字段生成统一的待处理动作快照。 */
function approvalSnapshot(work) {
  const pending = work.pendingApproval && typeof work.pendingApproval === 'object' ? { ...work.pendingApproval } : {};
  const actionType = pending.actionType ?? work.actionType ?? 'unity-inspect';
  const actionLevel = pending.actionLevel ?? work.actionLevel ?? ACTION_LEVEL[actionType];
  return {
    ...pending,
    approvalId: pending.approvalId ?? null,
    actionType,
    actionLevel,
    gate: pending.gate ?? 'F0',
    object: pending.object ?? work.objective,
    impact: Array.isArray(pending.impact) ? [...pending.impact] : [],
    target: Array.isArray(pending.target) ? [...pending.target] : [],
  };
}

/** 校验并返回 Work Item 的只读规范化视图。 */
export function validateWorkItem(work) {
  const allowed = new Set(['schemaVersion', 'workItemId', 'projectId', 'workItemType', 'moduleIds', 'domain', 'stageId', 'globalState', 'scene', 'displayLayer', 'responsiveContract', 'candidateSha256', 'baselineId', 'baselineVersion', 'baselineHash', 'revision', 'objective', 'userOriginalText', 'inScope', 'outOfScope', 'approvedRequirements', 'allowedActions', 'allowedActionLevels', 'explicitApprovalActionLevels', 'prohibitedActions', 'allowedPaths', 'forbiddenPaths', 'allowedExternalTargets', 'protectedExternalTargets', 'requiredGates', 'gateStatus', 'assignedAgent', 'delegatedAgents', 'expectedOutputs', 'validationPlan', 'exitCriteria', 'nextGate', 'evidenceRoot', 'implementationPackage', 'implementationPackagePath', 'evidenceManifest', 'evidenceManifestPath', 'actionLevel', 'actionType', 'sideEffects', 'userDecisionRequired', 'decisionId', 'editorWriter', 'pendingApproval', 'approval', 'returnRecord', 'metadata']);
  knownObject(work, allowed, 'Work Item');
  schemaVersion(work, 'Work Item');
  for (const field of ['workItemId', 'projectId', 'baselineHash', 'objective']) if (typeof work[field] !== 'string' || !work[field].trim()) fail(`Work Item.${field} 必须为非空字符串`);
  if (!Number.isSafeInteger(work.revision) || work.revision < 0) fail('Work Item.revision 必须为不小于 0 的安全整数');
  enumValue(work.stageId, STAGES, 'Work Item.stageId');
  enumValue(work.globalState, STATES, 'Work Item.globalState');
  const moduleIds = stringArray(work.moduleIds, 'Work Item.moduleIds');
  const allowedPaths = stringArray(work.allowedPaths, 'Work Item.allowedPaths', true).map(normalizePattern);
  const forbiddenPaths = stringArray(work.forbiddenPaths, 'Work Item.forbiddenPaths').map(normalizePattern);
  for (const field of ['inScope', 'outOfScope', 'approvedRequirements', 'allowedActions', 'prohibitedActions', 'allowedExternalTargets', 'protectedExternalTargets', 'delegatedAgents', 'expectedOutputs', 'validationPlan', 'exitCriteria', 'sideEffects']) stringArray(work[field], `Work Item.${field}`);
  if (work.editorWriter !== undefined && (typeof work.editorWriter !== 'string' || !work.editorWriter.trim())) fail('Work Item.editorWriter 必须为非空字符串');
  const actionLists = [...stringArray(work.allowedActions, 'Work Item.allowedActions'), ...stringArray(work.prohibitedActions, 'Work Item.prohibitedActions')];
  for (const action of actionLists) {
    if (!/^unity-[a-z0-9-]+$/.test(action) || !ACTION_LEVEL[action]) fail(`未受控 Unity 动作：${action}`);
  }
  const actionLevelLists = stringArray(work.allowedActionLevels, 'Work Item.allowedActionLevels');
  const explicitLevels = stringArray(work.explicitApprovalActionLevels, 'Work Item.explicitApprovalActionLevels');
  for (const level of actionLevelLists) enumValue(level, ['A0', 'A1', 'A2', 'A3'], 'Work Item.allowedActionLevels');
  for (const level of explicitLevels) enumValue(level, ['A4', 'A5', 'A6'], 'Work Item.explicitApprovalActionLevels');
  const gates = gateStatuses(work.gateStatus, 'Work Item.gateStatus');
  const snapshot = approvalSnapshot(work);
  enumValue(snapshot.actionLevel, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 'Work Item.actionLevel');
  if (ACTION_LEVEL[snapshot.actionType] && ACTION_LEVEL[snapshot.actionType] !== snapshot.actionLevel) fail(`动作等级与动作类型不一致：${snapshot.actionType} 只能使用 ${ACTION_LEVEL[snapshot.actionType]}`);
  if (work.allowedActions?.length && !work.allowedActions.includes(snapshot.actionType)) fail('当前 pending actionType 不在 Work Item.allowedActions 内');
  if (work.prohibitedActions?.includes(snapshot.actionType)) fail('当前 pending actionType 命中 prohibitedActions');
  if (work.scene !== undefined) {
    knownObject(work.scene, new Set(['sceneId', 'stage', 'status']), 'Work Item.scene');
    enumValue(work.scene.stage, SCENE_STAGES, 'Work Item.scene.stage');
    if (work.scene.status !== undefined) enumValue(work.scene.status, ['NOT_STARTED', 'IN_PROGRESS', 'PASS', 'FAIL', 'NOT_RUN'], 'Work Item.scene.status');
  }
  assertVisibleContract(validateVisibleWorkItemContract(work), fail);
  const approvalContext = { ...work, actionType: snapshot.actionType, actionLevel: snapshot.actionLevel };
  if (work.pendingApproval !== undefined) validateApprovalShape(work.pendingApproval, 'Work Item.pendingApproval', approvalContext, { pending: true });
  if (work.approval !== undefined) validateApprovalShape(work.approval, 'Work Item.approval', approvalContext);
  if (work.globalState === 'RETURN') validateReturnRecord(work.returnRecord, 'Work Item.returnRecord');
  return {
    ...work,
    moduleIds,
    allowedPaths,
    forbiddenPaths,
    gateStatus: gates,
    actionLevel: snapshot.actionLevel,
    actionType: snapshot.actionType,
    // 没有待审批动作时不把推导快照持久化为 approval 对象，避免 A0-A3 被误判为缺少 approvalId。
    ...(work.pendingApproval !== undefined ? { pendingApproval: snapshot } : {}),
    sideEffects: Array.isArray(work.sideEffects) ? [...work.sideEffects] : [],
  };
}

/** 校验待审批或已批准对象；两者合同分离，避免把意向误当成真实批准。 */
function validateApprovalShape(approval, label, context = null, options = {}) {
  const pending = options.pending === true;
  const allowed = new Set(['approvalId', 'workItemId', 'baselineHash', 'stageId', 'actionLevel', 'gate', 'actionType', 'object', 'impact', 'target', ...(pending ? [] : ['approvedAt', 'approvedBy'])]);
  knownObject(approval, allowed, label);
  for (const field of ['approvalId', 'workItemId', 'baselineHash', 'stageId', 'actionType', 'object']) if (typeof approval[field] !== 'string' || !approval[field].trim()) fail(`${label}.${field} 必须为非空字符串`);
  if (!pending) for (const field of ['approvedAt', 'approvedBy']) if (typeof approval[field] !== 'string' || !approval[field].trim()) fail(`${label}.${field} 必须为非空字符串`);
  enumValue(approval.actionLevel, ['A4', 'A5', 'A6'], `${label}.actionLevel`);
  if (approval.gate !== 'F4') fail(`${label}.gate 必须为 F4`);
  stringArray(approval.impact, `${label}.impact`, true);
  stringArray(approval.target, `${label}.target`, true);
  if (!ACTION_LEVEL[approval.actionType] || ACTION_LEVEL[approval.actionType] !== approval.actionLevel) fail(`${label}.actionType 与 actionLevel 不一致`);
  if (context) {
    for (const field of ['workItemId', 'baselineHash', 'stageId']) if (approval[field] !== context[field]) fail(`${label}.${field} 未绑定当前 Work Item`);
    if (approval.actionType !== context.actionType || approval.actionLevel !== context.actionLevel) fail(`${label} 动作未绑定当前 pending action`);
  }
}

/** 校验 RETURN 记录，保证回退范围和理由可审计。 */
function validateReturnRecord(record, label = 'returnRecord') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`${label} 是 RETURN 必需的对象`);
  knownObject(record, new Set(['classification', 'reason', 'affectedScope', 'fromState', 'toState', 'recordedAt', 'resolvedAt']), label);
  enumValue(record.classification, ['upstream-fact-invalidated', 'scope-changed', 'hard-gate-would-be-bypassed'], `${label}.classification`);
  if (typeof record.reason !== 'string' || !record.reason.trim()) fail(`${label}.reason 不能为空`);
  if (record.toState !== 'RETURN') fail(`${label}.toState 必须为 RETURN`);
  stringArray(record.affectedScope, `${label}.affectedScope`, true);
  if (typeof record.fromState !== 'string' || !STATES.includes(record.fromState)) fail(`${label}.fromState 无效`);
  return record;
}

/** 判断路径是否在允许模式内且没有命中禁止模式。 */
export function assertPathOwnership(path, allowed, forbidden, label = '文件') {
  const normalized = normalizePattern(path);
  if (forbidden.some((pattern) => pathMatches(normalized, pattern))) fail(`${label} 命中 forbiddenPaths：${normalized}`, 2, { errorCode: 'FORBIDDEN_PATH', path: normalized });
  if (!allowed.some((pattern) => pathMatches(normalized, pattern))) fail(`${label} 不在 allowedPaths：${normalized}`, 2, { errorCode: 'PATH_OUT_OF_SCOPE', path: normalized });
  return normalized;
}

/** 将单元中声明的所有文件展平并去重。 */
function packageFiles(pkg) {
  const files = [...(Array.isArray(pkg.expectedFiles) ? pkg.expectedFiles : [])];
  for (const unit of pkg.executionUnits ?? []) files.push(...(unit.files ?? []));
  return [...new Set(files.map(normalizePattern))].sort();
}

/** 保守判断实施包路径模式是否只能收窄 Work Item 模式。 */
function pathPatternSubset(child, parent) {
  const nested = normalizePattern(child);
  const scope = normalizePattern(parent);
  if (scope === '**') return true;
  if (nested === scope || (!nested.includes('*') && !nested.includes('?') && pathMatches(nested, scope))) return true;
  if (scope.endsWith('/**')) {
    const prefix = scope.slice(0, -3);
    return nested === prefix || nested.startsWith(`${prefix}/`);
  }
  return false;
}

/** Unity 工程级共享路径必须由 SHARED/INTEGRATION 单元串行持有。 */
function isSharedUnityPath(file) {
  const normalized = normalizePattern(file);
  const lower = normalized.toLowerCase();
  const sharedAsmdef = lower.endsWith('.asmdef') && (lower.includes('/shared/') || lower.endsWith('/shared.asmdef') || lower.includes('shared'));
  return normalized.startsWith('ProjectSettings/') || normalized.startsWith('Packages/') || normalized.startsWith('Build/') || normalized.startsWith('BuildSettings/') || normalized.includes('/AddressableAssetsData/') || normalized.startsWith('Assets/AddressableAssetsData/') || sharedAsmdef;
}

/** 校验 Unity 实施包、路径所有权、.meta/GUID/Importer 和单写者约束。 */
export function validateImplementationPackage(pkg, work, repo = process.cwd()) {
  const allowed = new Set(['schemaVersion', 'packageId', 'workItemId', 'workItemType', 'baselineHash', 'stageId', 'approvedRequirements', 'allowedPaths', 'forbiddenPaths', 'editorWriter', 'fileOwnership', 'unityOwnership', 'responsiveContractRef', 'expectedFiles', 'executionUnits', 'packageStatus', 'metadata']);
  knownObject(pkg, allowed, 'Implementation Package');
  schemaVersion(pkg, 'Implementation Package');
  for (const field of ['packageId', 'workItemId', 'baselineHash']) if (typeof pkg[field] !== 'string' || !pkg[field].trim()) fail(`Implementation Package.${field} 必须为非空字符串`);
  if (pkg.editorWriter !== undefined && (typeof pkg.editorWriter !== 'string' || !pkg.editorWriter.trim())) fail('Implementation Package.editorWriter 必须为非空字符串');
  enumValue(pkg.packageStatus, ['FROZEN', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED'], 'Implementation Package.packageStatus');
  if (pkg.workItemId !== work.workItemId || pkg.baselineHash !== work.baselineHash) fail('Implementation Package 未绑定当前 Work Item 或基线');
  if (pkg.stageId !== undefined && pkg.stageId !== work.stageId) fail('Implementation Package.stageId 与 Work Item 不一致');
  if (!Array.isArray(pkg.executionUnits) || pkg.executionUnits.length === 0) fail('Implementation Package.executionUnits 不能为空');
  if (!pkg.fileOwnership || typeof pkg.fileOwnership !== 'object' || Array.isArray(pkg.fileOwnership) || !Object.keys(pkg.fileOwnership).length) fail('Implementation Package.fileOwnership 必须为非空对象');
  for (const [file, owner] of Object.entries(pkg.fileOwnership)) if (typeof owner !== 'string' || !owner.trim()) fail(`fileOwnership 所有者无效：${file}`);
  validateUnityOwnershipShape(pkg.unityOwnership, { knownObject, stringArray, fail });
  const packageAllowed = stringArray(pkg.allowedPaths, 'Implementation Package.allowedPaths');
  if (pkg.allowedPaths !== undefined && packageAllowed.length === 0) fail('Implementation Package.allowedPaths 显式提供时必须为非空数组');
  const allowedPaths = packageAllowed.length ? packageAllowed.map(normalizePattern) : work.allowedPaths;
  const packageForbidden = stringArray(pkg.forbiddenPaths, 'Implementation Package.forbiddenPaths');
  const forbiddenPaths = packageForbidden.map(normalizePattern);
  for (const pattern of packageAllowed) if (!work.allowedPaths.some((scope) => pathPatternSubset(pattern, scope))) fail(`Implementation Package.allowedPaths 不能扩大 Work Item 范围：${pattern}`, 2, { errorCode: 'PACKAGE_PATH_SCOPE_EXPANDED' });
  const units = [];
  const unitIds = new Set();
  const fileOwners = new Map();
  const editorOwners = new Set();
  const specialParallel = new Set();
  for (const unit of pkg.executionUnits) {
    const unitAllowed = new Set(['unitId', 'unitType', 'scopeId', 'moduleId', 'sceneId', 'displayLayerId', 'hostSceneId', 'owner', 'files', 'status', 'parallelGroup', 'editorWrite', 'serial', 'dependsOn']);
    knownObject(unit, unitAllowed, 'Implementation Package.executionUnit');
    for (const field of ['unitId', 'moduleId', 'owner']) if (typeof unit[field] !== 'string' || !unit[field].trim()) fail(`实施单元.${field} 必须为非空字符串`);
    if (unitIds.has(unit.unitId)) fail(`实施单元 ID 重复：${unit.unitId}`);
    unitIds.add(unit.unitId);
    enumValue(unit.unitType, UNIT_TYPES, `实施单元 ${unit.unitId}.unitType`);
    enumValue(unit.status, ['PLANNED', 'READY', 'IMPLEMENTING', 'COMPLETE', 'BLOCKED', 'NOT_RUN'], `实施单元 ${unit.unitId}.status`);
    if (work.moduleIds.length && !work.moduleIds.includes(unit.moduleId)) fail(`实施单元 ${unit.unitId} 的 moduleId 不属于 Work Item`);
    const files = stringArray(unit.files, `实施单元 ${unit.unitId}.files`, true);
    const sharedFiles = files.filter(isSharedUnityPath);
    if (sharedFiles.length && !['SHARED', 'INTEGRATION'].includes(unit.unitType)) fail(`工程级 Unity 文件必须归 SHARED/INTEGRATION 单元：${unit.unitId}`, 2, { errorCode: 'UNITY_SHARED_UNIT_REQUIRED' });
    if (sharedFiles.length && unit.editorWrite === false) fail(`工程级 Unity 文件必须声明正式 Editor 写入：${unit.unitId}`);
    const formalEditorWrite = unit.editorWrite !== false && (['SHARED', 'MODULE', 'SCENE', 'DISPLAY_LAYER', 'INTEGRATION'].includes(unit.unitType) || sharedFiles.length > 0);
    if (formalEditorWrite) editorOwners.add(unit.owner);
    if (['SHARED', 'INTEGRATION', 'RELEASE'].includes(unit.unitType)) {
      if (unit.parallelGroup !== undefined && unit.parallelGroup !== null) fail(`${unit.unitType} 单元必须串行，不能声明 parallelGroup`);
      if (unit.serial === false) fail(`${unit.unitType} 单元不能关闭 serial`);
    }
    if (['SHARED', 'INTEGRATION', 'RELEASE'].includes(unit.unitType) && unit.parallelGroup) specialParallel.add(unit.parallelGroup);
    for (const file of files) {
      const normalized = assertPathOwnership(file, work.allowedPaths, work.forbiddenPaths, `实施单元 ${unit.unitId} Work Item 文件`);
      if (packageAllowed.length) assertPathOwnership(normalized, allowedPaths, forbiddenPaths, `实施单元 ${unit.unitId} Package 文件`);
      else if (packageForbidden.some((pattern) => pathMatches(normalized, pattern))) fail(`Package forbiddenPaths 命中：${normalized}`);
      const absolute = resolve(repo, normalized);
      const relativeToRepo = relative(resolve(repo), absolute);
      if (!relativeToRepo || relativeToRepo === '..' || relativeToRepo.startsWith('..\\') || relativeToRepo.startsWith('../') || isAbsolute(relativeToRepo)) fail(`实施包文件越出仓库：${normalized}`);
      const declaredOwner = pkg.fileOwnership[normalized] ?? pkg.fileOwnership[file];
      if (!declaredOwner) fail(`缺少文件所有权：${normalized}`, 2, { errorCode: 'FILE_OWNERSHIP_MISSING', path: normalized });
      if (declaredOwner !== unit.owner) fail(`文件所有者与实施单元不一致：${normalized}`);
      if (fileOwners.has(normalized) && fileOwners.get(normalized) !== unit.owner) fail(`文件被多个所有者声明：${normalized}`);
      fileOwners.set(normalized, unit.owner);
    }
    units.push({ ...unit, files: files.map(normalizePattern), formalEditorWrite, dependsOn: stringArray(unit.dependsOn, `实施单元 ${unit.unitId}.dependsOn`) });
  }
  validateUnitDependencies(units, { stringArray, fail });
  if (pkg.packageStatus === 'COMPLETE' && units.some((unit) => unit.status !== 'COMPLETE')) fail('packageStatus=COMPLETE 时所有实施单元必须为 COMPLETE', 2, { errorCode: 'PACKAGE_STATUS_INCONSISTENT' });
  const declaredOwnership = Object.entries(pkg.fileOwnership);
  for (const [file, owner] of declaredOwnership) {
    const normalized = assertPathOwnership(file, work.allowedPaths, work.forbiddenPaths, 'fileOwnership Work Item 文件');
    if (packageAllowed.length) assertPathOwnership(normalized, allowedPaths, forbiddenPaths, 'fileOwnership Package 文件');
    else if (packageForbidden.some((pattern) => pathMatches(normalized, pattern))) fail(`Package forbiddenPaths 命中：${normalized}`);
    if (!fileOwners.has(normalized)) fail(`fileOwnership 未绑定任何实施单元：${normalized}`);
    if (fileOwners.get(normalized) !== owner) fail(`fileOwnership 所有者不一致：${normalized}`);
  }
  const files = packageFiles(pkg);
  for (const file of files) if (!fileOwners.has(file)) fail(`实施包文件未绑定所有者：${file}`);
  if (editorOwners.size > 1) fail(`同一 Unity 项目的正式 Editor 写入必须单写者：${[...editorOwners].sort().join(', ')}`, 2, { errorCode: 'UNITY_SINGLE_WRITER' });
  if (pkg.editorWriter !== undefined && editorOwners.size && (!editorOwners.has(pkg.editorWriter) || editorOwners.size !== 1)) fail('Implementation Package.editorWriter 与正式 Editor 写入所有者不一致');
  if (work.editorWriter !== undefined) {
    if (pkg.editorWriter !== work.editorWriter) fail('Work Item.editorWriter 与 Implementation Package.editorWriter 不一致');
    if (editorOwners.size !== 1 || !editorOwners.has(work.editorWriter)) fail('Work Item.editorWriter 未覆盖唯一正式 Editor 写入者');
  }
  assertVisibleContract(validateVisibleImplementationPackage(pkg, work, repo), fail);
  if (specialParallel.size) fail('共享设置、集成和发布单元不得使用并行组');
  validateUnityOwnership(pkg, files, packageAllowed.length ? allowedPaths : work.allowedPaths, packageForbidden);
  return { ...pkg, executionUnits: units, expectedFiles: files, allowedPaths, forbiddenPaths, fileOwners };
}

/** 校验 Unity 资产的 .meta、GUID/Importer、序列化资源和工程设置覆盖。 */
function validateUnityOwnership(pkg, files, allowedPaths, forbiddenPaths) {
  const ownership = pkg.unityOwnership ?? {};
  const metaPairs = new Map();
  for (const pair of ownership.metaPairs ?? []) {
    knownObject(pair, new Set(['asset', 'meta']), 'unityOwnership.metaPairs');
    const asset = normalizePattern(pair.asset);
    const meta = normalizePattern(pair.meta);
    if (meta !== `${asset}.meta`) fail(`.meta 配对不正确：${asset} ↔ ${meta}`);
    metaPairs.set(asset, meta);
  }
  const guidImporter = new Set((ownership.guidImporter ?? []).map(normalizePattern));
  const serialized = new Set([...(ownership.serializedAssets ?? []), ...(ownership.scenePrefabScriptableObject ?? [])].map(normalizePattern));
  const projectConfig = new Set((ownership.projectSettingsPackagesBuildSettings ?? []).map(normalizePattern));
  for (const file of files) {
    if (file.startsWith('Assets/')) {
      if (file.endsWith('.meta')) continue;
      if (!files.includes(`${file}.meta`)) fail(`Unity 资产缺少 .meta 配对：${file}`);
      if (!metaPairs.has(file)) fail(`Unity 资产缺少 metaPairs 所有权：${file}`);
      if (!guidImporter.has(file)) fail(`Unity 资产缺少 GUID/Importer 所有权：${file}`);
      if (/\.(unity|prefab|asset)$/i.test(file) && !serialized.has(file)) fail(`序列化 Unity 资源缺少 Scene/Prefab/ScriptableObject 所有权：${file}`);
    }
    if (file.startsWith('ProjectSettings/') || file.startsWith('Packages/') || /^Build(Settings)?\//i.test(file)) {
      if (!projectConfig.has(file)) fail(`工程设置/Packages/Build Settings 缺少所有权：${file}`);
    }
    assertPathOwnership(file, allowedPaths, forbiddenPaths, 'Unity 所有权文件');
  }
  for (const [asset, meta] of metaPairs) {
    if (!files.includes(asset) || !files.includes(meta)) fail(`metaPairs 未覆盖实施包文件：${asset}`);
  }
}

/** 校验证据清单结构并绑定当前 Work Item 与实施包。 */
export function validateEvidence(evidence, work, pkg = null, repo = process.cwd()) {
  const allowed = new Set(['schemaVersion', 'evidenceId', 'workItemId', 'packageId', 'workItemType', 'visualStage', 'contractVersions', 'baselineHash', 'recordedAt', 'verdict', 'gateResults', 'unityEvidence', 'responsiveEvidence', 'productionContractAudit', 'artifacts', 'approval', 'metadata']);
  knownObject(evidence, allowed, 'Evidence Manifest');
  schemaVersion(evidence, 'Evidence Manifest');
  for (const field of ['evidenceId', 'workItemId', 'packageId', 'baselineHash', 'recordedAt']) if (typeof evidence[field] !== 'string' || !evidence[field].trim()) fail(`Evidence Manifest.${field} 必须为非空字符串`);
  if (evidence.workItemId !== work.workItemId || evidence.baselineHash !== work.baselineHash) fail('Evidence Manifest 未绑定当前 Work Item 或基线');
  if (pkg && evidence.packageId !== pkg.packageId) fail('Evidence Manifest 未绑定当前 Implementation Package');
  enumValue(evidence.verdict, ['PASS', 'FAIL', 'NOT_RUN'], 'Evidence Manifest.verdict');
  const gates = evidence.gateResults;
  knownObject(gates, new Set(GATES), 'Evidence Manifest.gateResults');
  for (const gate of GATES) {
    if (!gates[gate] || typeof gates[gate] !== 'object') fail(`Evidence Manifest.gateResults.${gate} 必须存在`);
    knownObject(gates[gate], new Set(['status', 'summary', 'evidenceRefs']), `Evidence Manifest.gateResults.${gate}`);
    enumValue(gates[gate].status, ['PASS', 'FAIL', 'NOT_RUN'], `Evidence Manifest.gateResults.${gate}.status`);
  }
  if (evidence.unityEvidence !== undefined) validateUnityEvidence(evidence.unityEvidence);
  if (evidence.approval !== undefined) {
    const pending = approvalSnapshot(work);
    validateApprovalShape(evidence.approval, 'Evidence Manifest.approval', { ...work, actionType: pending.actionType, actionLevel: pending.actionLevel });
  }
  assertVisibleContract(validateVisibleEvidenceContract(evidence, work, repo), fail);
  if (evidence.verdict === 'PASS' && GATES.slice(0, 4).some((gate) => gates[gate].status !== 'PASS')) fail('Evidence Manifest.verdict=PASS 必须使 F0-F3 全部 PASS');
  if (evidence.verdict === 'PASS' && gates.F4.status === 'FAIL') fail('Evidence Manifest.verdict=PASS 不能包含 FAIL 的 F4 门');
  if (evidence.verdict === 'PASS' && evidence.unityEvidence) {
    for (const [field, value] of Object.entries(evidence.unityEvidence)) {
      if (statusOf(value) === 'FAIL') fail(`Evidence Manifest.verdict=PASS 不能包含 FAIL 的 Unity 子证据：${field}`);
    }
  }
  if (evidence.verdict === 'PASS') validateImplementationEvidence(evidence, work);
  // 设备和发布是外部结果；没有当前精确批准时，禁止把 NOT_RUN 伪造成 PASS。
  for (const field of ['device', 'release']) {
    if (evidence.unityEvidence && statusOf(evidence.unityEvidence[field]) === 'PASS' && (evidence.gateResults.F4.status !== 'PASS' || !evidence.approval || !approvalMatches(work, evidence.approval))) fail(`unityEvidence.${field}=PASS 缺少当前 F4 精确批准`);
  }
  return { ...evidence, gateResults: { ...gates } };
}

/** 校验 Unity 证据字段的状态值。 */
function validateUnityEvidence(value) {
  knownObject(value, new Set(['editorStable', 'compile', 'domainReload', 'console', 'editMode', 'playMode', 'scenePrefabImporterGuid', 'build', 'device', 'release']), 'Evidence Manifest.unityEvidence');
  for (const item of Object.values(value)) {
    const status = statusOf(item);
    enumValue(status, ['PASS', 'FAIL', 'NOT_RUN'], 'Unity evidence status');
  }
}

/** A2-A4 的实现/集成证据必须覆盖稳定 Editor、编译、域重载、Console 和资源绑定。 */
function validateImplementationEvidence(evidence, work) {
  if (!['A2', 'A3', 'A4'].includes(work.actionLevel)) return;
  const unity = evidence.unityEvidence;
  if (!unity) fail(`${work.actionLevel} PASS 证据缺少 unityEvidence`);
  for (const field of ['editorStable', 'compile', 'domainReload', 'console', 'scenePrefabImporterGuid']) if (statusOf(unity[field]) !== 'PASS') fail(`${work.actionLevel} PASS 证据 ${field} 必须为 PASS`);
  const plan = (work.validationPlan ?? []).join(' ').toLowerCase();
  if (/(editmode|edit mode|编辑模式)/.test(plan) && statusOf(unity.editMode) !== 'PASS') fail('validationPlan 声明 EditMode，但 unityEvidence.editMode 不是 PASS');
  if (/(playmode|play mode|播放模式)/.test(plan) && statusOf(unity.playMode) !== 'PASS') fail('validationPlan 声明 PlayMode，但 unityEvidence.playMode 不是 PASS');
  if (/(build|构建)/.test(plan) && statusOf(unity.build) !== 'PASS') fail('validationPlan 声明 build，但 unityEvidence.build 不是 PASS');
}

/** 将布尔、字符串或带 status 的证据值规范化。 */
export function statusOf(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.status;
  return 'NOT_RUN';
}

/** 判断 Work Item 当前动作是否需要 F4 精确批准。 */
export function requiresExactApproval(work) {
  const pending = work.pendingApproval ?? approvalSnapshot(work);
  if (pending.actionLevel === 'A5' || pending.actionLevel === 'A6') return true;
  if (pending.actionLevel === 'A4') return Boolean(pending.approvalId || work.sideEffects?.length || work.approval || work.userDecisionRequired);
  return false;
}

/** 逐字段比较当前 pending 与批准，避免“批准其他动作”被复用。 */
export function approvalMatches(work, approval) {
  const pending = work.pendingApproval ?? approvalSnapshot(work);
  const candidate = approval ?? work.approval ?? null;
  if (!candidate || !pending.approvalId) return false;
  validateApprovalShape(candidate, 'Approval', { ...work, actionType: pending.actionType, actionLevel: pending.actionLevel });
  for (const field of ['approvalId', 'workItemId', 'baselineHash', 'stageId', 'actionType', 'actionLevel', 'gate', 'object']) if (candidate[field] !== (field === 'workItemId' ? work.workItemId : field === 'baselineHash' ? work.baselineHash : field === 'stageId' ? work.stageId : pending[field])) return false;
  if (JSON.stringify(candidate.impact) !== JSON.stringify(pending.impact)) return false;
  if (JSON.stringify(candidate.target) !== JSON.stringify(pending.target)) return false;
  return Boolean(candidate.approvedAt && candidate.approvedBy);
}

/** 判断实施包是否所有单元都已完成。 */
export function packageComplete(pkg) {
  return Boolean(pkg && pkg.executionUnits?.length && pkg.executionUnits.every((unit) => unit.status === 'COMPLETE') && pkg.packageStatus !== 'BLOCKED');
}

/** 判断实施包是否包含 A4 集成所需的串行 INTEGRATION 单元。 */
function hasIntegrationUnit(pkg) {
  return Boolean(pkg?.executionUnits?.some((unit) => unit.unitType === 'INTEGRATION'));
}

/** 将 Work Item、实施包和证据路径加载成只读检查快照。 */
export function inspect(args = {}, command = 'status') {
  const repo = resolve(String(args.repo ?? process.cwd()));
  const workPath = resolve(repo, String(args['work-item'] ?? ''));
  const work = validateWorkItem(readJson(workPath, 'Work Item'));
  const blockers = [];
  let pkg = null;
  let evidence = null;
  const packagePath = args['implementation-package'] ?? args.package ?? work.implementationPackagePath ?? work.implementationPackage ?? findInput(args.input, repo, (value) => value && value.executionUnits && value.packageId);
  const evidencePath = args.evidence ?? args['evidence-manifest'] ?? work.evidenceManifestPath ?? work.evidenceManifest ?? findInput(args.input, repo, (value) => value && value.gateResults && value.evidenceId);
  if (work.globalState === 'RETURN') blockers.push(blocker('RETURN_STATE', 'Work Item 处于 RETURN 恢复状态，不能自动继续', '显式记录恢复目标后使用 transition'));
  if (work.globalState === 'BLOCKED') blockers.push(blocker('BLOCKED_STATE', 'Work Item 处于 BLOCKED 状态，需显式恢复', '检查失败门并使用 transition'));
  if (packagePath) {
    try { pkg = validateImplementationPackage(readJson(resolve(repo, String(packagePath)), 'Implementation Package'), work, repo); } catch (error) { blockers.push(errorBlock(error, 'Implementation Package 校验失败')); }
  }
  const packageRequired = ['A2', 'A3'].includes(work.actionLevel) && ['REVIEW', 'IMPLEMENTING', 'VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState);
  if (packageRequired && !packagePath) blockers.push(blocker('IMPLEMENTATION_PACKAGE_MISSING', '当前状态缺少 Implementation Package，不能跳过实施包', '冻结并绑定当前阶段 Implementation Package'));
  if (packageRequired && packagePath && !pkg) blockers.push(blocker('IMPLEMENTATION_PACKAGE_INVALID', '当前 Implementation Package 无法通过 Unity 所有权校验', '修复实施包后重新运行 check'));
  // IMPLEMENTING 本身就是 run 的安全停点；只有离开实施阶段时才把未完成单元视为硬阻断。
  if (pkg && ['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState) && !packageComplete(pkg)) blockers.push(blocker('IMPLEMENTATION_INCOMPLETE', '实施包仍有未完成单元', '完成当前实施单元并重新验证'));
  if (work.actionLevel === 'A4' && ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState) && (!pkg || !hasIntegrationUnit(pkg))) blockers.push(blocker('INTEGRATION_PACKAGE_MISSING', 'A4 集成或完成必须绑定含 INTEGRATION 单元的实施包', '冻结并绑定当前集成实施包'));
  if (evidencePath) {
    try { evidence = validateEvidence(readJson(resolve(repo, String(evidencePath)), 'Evidence Manifest'), work, pkg, repo); } catch (error) { blockers.push(errorBlock(error, 'Evidence Manifest 校验失败')); }
  }
  if (['VALIDATING', 'PASSED', 'INTEGRATING', 'RELEASING', 'COMPLETE'].includes(work.globalState) && !evidencePath) blockers.push(blocker('EVIDENCE_MISSING', '当前状态缺少 Evidence Manifest', '记录并绑定当前候选验证证据'));
  if (evidence && evidence.verdict !== 'PASS') blockers.push(blocker('EVIDENCE_NOT_PASS', 'Evidence Manifest verdict 不是 PASS', '按证据选择 repair 或 revalidate'));
  if (evidence && work.globalState !== 'RETURN' && !gatePassed(evidence, 'F3') && ['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState)) blockers.push(blocker('F3_NOT_PASS', 'F3 工程验证证据未通过', '补齐编译、域重载、Console、测试、资源和构建证据'));
  if (work.userDecisionRequired) blockers.push(blocker('USER_DECISION_REQUIRED', '存在未决用户选择，控制面不会替用户决定', '澄清选择并更新 Work Item'));
  const releaseApprovalPending = ['PASSED', 'INTEGRATING'].includes(work.globalState) && ['A5', 'A6'].includes(work.actionLevel);
  if (requiresExactApproval(work) && !releaseApprovalPending && !approvalMatches(work, evidence?.approval)) blockers.push(blocker('EXACT_APPROVAL_REQUIRED', '当前 A4-A6 副作用缺少与对象、影响、目标和基线精确匹配的 F4 批准', '展示当前精确审批点并等待用户批准'));
  const planFingerprint = stableFingerprint(work, pkg, evidence);
  const inspection = { repo, workPath, work, pkg, evidence, packagePath: packagePath ? resolve(repo, String(packagePath)) : null, evidencePath: evidencePath ? resolve(repo, String(evidencePath)) : null, blockers, planFingerprint, command };
  return { ...inspection, next: nextAction(inspection) };
}

/** 在重复 --input 中识别当前实施包或证据清单，兼容脚本化交接包入口。 */
function findInput(input, repo, predicate) {
  for (const candidate of values(input)) {
    try {
      const value = readJson(resolve(repo, candidate), 'Input');
      if (predicate(value)) return candidate;
    } catch {
      // 非目标输入由后续显式参数或 Work Item 路径处理，不把探测失败当作当前阻断。
    }
  }
  return null;
}

/** 创建统一阻断记录。 */
function blocker(code, message, next = null) {
  return { code, message, next };
}

/** 把控制面异常压缩为单一根因，避免输出动态堆栈。 */
function errorBlock(error, fallback) {
  return blocker(error?.details?.errorCode ?? 'VALIDATION_FAILED', error?.message ?? fallback, error?.details?.next ?? '修复当前门禁后重新运行 check');
}

/** 读取 gate 状态，证据优先于 Work Item 中的静态快照。 */
function gatePassed(inspectionOrEvidence, gate) {
  const gates = inspectionOrEvidence?.gateResults ?? inspectionOrEvidence?.gateStatus ?? {};
  return gates[gate]?.status === 'PASS' || gates[gate] === 'PASS';
}

/** 返回动作、证据和审批绑定的稳定摘要指纹；不含时间和绝对路径。 */
function stableFingerprint(work, pkg, evidence) {
  const value = JSON.stringify({ workItemId: work.workItemId, state: work.globalState, stage: work.stageId, baselineHash: work.baselineHash, packageId: pkg?.packageId ?? null, evidenceId: evidence?.evidenceId ?? null });
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** 计算用户视图的稳定元数据。 */
export function workflowView(work) {
  const sceneStage = work.scene?.stage ?? null;
  return { phaseId: work.stageId, phaseLabel: STAGE_LABELS[work.stageId], sceneStepId: sceneStage, sceneStepLabel: sceneStage ? SCENE_LABELS[sceneStage] : null };
}

/** 推导当前唯一下一动作文案。 */
function nextAction(inspection) {
  const { work, blockers, pkg, evidence } = inspection;
  if (blockers.length) return blockers[0].next ?? '修复当前阻断后重新运行 check';
  if (work.globalState === 'INTAKE') return '通过 F0 后推进全局基线';
  if (work.globalState === 'BASELINE') return '完成规格候选并通过 F1';
  if (work.globalState === 'PROPOSAL') return '完成审查并通过 F1/F2';
  if (work.globalState === 'REVIEW') return ['A2', 'A3'].includes(work.actionLevel) && !pkg ? '冻结当前阶段 Implementation Package' : '运行 run 推进到实施或验证';
  if (work.globalState === 'IMPLEMENTING') return packageComplete(pkg) ? '显式迁移到 VALIDATING' : '完成当前实施单元';
  if (work.globalState === 'VALIDATING') return evidence ? '通过 F3 后进入 PASSED' : '提交当前候选验证证据';
  if (work.globalState === 'PASSED') return requiresExactApproval(work) ? '展示当前精确 F4 审批点' : work.actionLevel === 'A4' ? '进入本地集成验证' : '闭合当前 Work Item';
  if (work.globalState === 'INTEGRATING') return '完成集成证据并进入 COMPLETE';
  if (work.globalState === 'RELEASE_APPROVAL_REQUIRED') return '等待当前发布精确批准';
  if (work.globalState === 'RELEASING') return '完成已批准发布步骤并记录证据';
  if (work.globalState === 'RETURN') return '显式选择最小受影响前序状态';
  if (work.globalState === 'BLOCKED') return '修复阻断后显式恢复';
  return '等待下一项 Work Item';
}

/** 生成稳定六字段结果；blocking 对外只暴露消息，详细码放入 metadata。 */
export function resultRecord(inspection, status, changed = [], extra = {}) {
  const first = inspection.blockers?.[0] ?? null;
  const metadata = {
    schemaVersion: SCHEMA_VERSION,
    workItemId: inspection.work.workItemId,
    baselineHash: inspection.work.baselineHash,
    revision: inspection.work.revision,
    actionLevel: inspection.work.actionLevel,
    planFingerprint: inspection.planFingerprint,
    workflowView: workflowView(inspection.work),
    ...(first ? { errorCode: first.code } : {}),
    ...extra,
  };
  return {
    status,
    stage: `${inspection.work.stageId}/${inspection.work.globalState}`,
    changed: [...changed],
    blocking: (inspection.blockers ?? []).map((item) => item.message),
    next: inspection.next ?? nextAction(inspection),
    metadata,
  };
}

/** 只读 status/check 入口。 */
export function check(args = {}, command = 'check') {
  const inspection = inspect(args, command);
  const status = inspection.work.globalState === 'COMPLETE' && !inspection.blockers.length ? 'COMPLETE' : inspection.blockers.length ? 'BLOCKED' : 'READY';
  return resultRecord(inspection, status);
}

/** status 与 check 共享只读逻辑，但保留独立函数便于调用方测试。 */
export function status(args = {}) {
  return check(args, 'status');
}

/** 判断一个迁移需要的全部门禁；恢复路径按目标状态重新执行门禁。 */
function transitionGates(from, to) {
  if (from === 'INTAKE' && to === 'BASELINE') return ['F0'];
  if (['BASELINE', 'PROPOSAL'].includes(from) && ['PROPOSAL', 'REVIEW'].includes(to)) return ['F1'];
  if (from === 'REVIEW' && to === 'IMPLEMENTING') return ['F2'];
  if (from === 'REVIEW' && to === 'VALIDATING') return ['F2', 'F3'];
  if (from === 'IMPLEMENTING' && to === 'VALIDATING') return ['F3'];
  if (from === 'VALIDATING' && to === 'PASSED') return ['F3'];
  if (['PASSED', 'INTEGRATING'].includes(from) && ['INTEGRATING', 'COMPLETE'].includes(to)) return ['F3'];
  if (['PASSED', 'INTEGRATING'].includes(from) && to === 'RELEASE_APPROVAL_REQUIRED') return ['F3'];
  if (['RELEASE_APPROVAL_REQUIRED', 'RELEASING'].includes(from)) return ['F4'];
  if (['RETURN', 'BLOCKED'].includes(from)) {
    if (to === 'BASELINE') return ['F0'];
    if (to === 'PROPOSAL') return ['F1'];
    if (to === 'REVIEW') return ['F1', 'F2'];
    if (to === 'IMPLEMENTING') return ['F2'];
  }
  return [];
}

/** 合并 Work Item 和 Evidence 的门禁状态。 */
function gateAvailable(inspection, gate) {
  // Evidence 是当前候选的事实优先源；明确 FAIL/NOT_RUN 时不能被 Work Item 的静态 PASS 覆盖。
  if (inspection.evidence) return inspection.evidence.verdict === 'PASS' && gatePassed(inspection.evidence, gate);
  return gatePassed(inspection.work, gate);
}

/** 确认当前实施单元和证据均满足显式迁移。 */
function assertTransitionPreconditions(inspection, target, args) {
  const { work, pkg, evidence } = inspection;
  const from = work.globalState;
  for (const gate of transitionGates(from, target)) if (!gateAvailable(inspection, gate)) fail(`${from} → ${target} 缺少 ${gate} PASS`, 2, { errorCode: `${gate}_NOT_PASS` });
  if (['A5', 'A6'].includes(work.actionLevel)) {
    if (from === 'PASSED' && target !== 'RELEASE_APPROVAL_REQUIRED') fail('A5/A6 必须先进入 RELEASE_APPROVAL_REQUIRED，不能绕过发布审批状态', 2, { errorCode: 'RELEASE_APPROVAL_STATE_REQUIRED' });
    if (from === 'RELEASE_APPROVAL_REQUIRED' && target !== 'RELEASING') fail('A5/A6 只能从 RELEASE_APPROVAL_REQUIRED 进入 RELEASING', 2, { errorCode: 'RELEASING_REQUIRED' });
    if (target === 'COMPLETE' && from !== 'RELEASING') fail('A5/A6 完成前必须经过 RELEASE_APPROVAL_REQUIRED → RELEASING', 2, { errorCode: 'RELEASING_REQUIRED' });
  }
  if (target === 'IMPLEMENTING') {
    if (!pkg) fail('进入 IMPLEMENTING 必须绑定 Implementation Package', 2, { errorCode: 'IMPLEMENTATION_PACKAGE_REQUIRED' });
    if (!['A2', 'A3'].includes(work.actionLevel)) fail('当前动作等级不能进入生产 IMPLEMENTING');
  }
  if (['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE'].includes(target) && ['A2', 'A3'].includes(work.actionLevel) && !pkg) fail(`${target} 不能绕过 Implementation Package`, 2, { errorCode: 'IMPLEMENTATION_PACKAGE_REQUIRED' });
  if (['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE'].includes(target) && ['A2', 'A3'].includes(work.actionLevel) && !packageComplete(pkg)) fail(`${target} 前必须完成实施包所有单元`, 2, { errorCode: 'IMPLEMENTATION_INCOMPLETE' });
  if (work.actionLevel === 'A4' && ['INTEGRATING', 'COMPLETE'].includes(target)) {
    if (!pkg || !hasIntegrationUnit(pkg)) fail('A4 进入 INTEGRATING/COMPLETE 必须绑定含 INTEGRATION 单元的实施包', 2, { errorCode: 'INTEGRATION_PACKAGE_MISSING' });
    if (target === 'COMPLETE' && !packageComplete(pkg)) fail('A4 完成前必须完成 INTEGRATION 单元', 2, { errorCode: 'INTEGRATION_INCOMPLETE' });
    if (from === 'PASSED' && target === 'COMPLETE') fail('A4 必须先经过 INTEGRATING', 2, { errorCode: 'INTEGRATING_REQUIRED' });
  }
  if (target === 'PASSED' || target === 'COMPLETE' || target === 'INTEGRATING') {
    if (!evidence || evidence.verdict !== 'PASS') fail(`${target} 必须绑定 PASS Evidence Manifest`, 2, { errorCode: 'EVIDENCE_REQUIRED' });
    if (!gateAvailable(inspection, 'F3')) fail(`${target} 必须通过 F3`, 2, { errorCode: 'F3_NOT_PASS' });
  }
  if (target === 'RELEASING' || (target === 'INTEGRATING' && requiresExactApproval(work)) || requiresExactApproval(work) && target === 'COMPLETE') {
    if (!approvalMatches(work, args.approval ?? evidence?.approval)) fail(`${target} 需要当前 F4 精确批准`, 2, { errorCode: 'EXACT_APPROVAL_REQUIRED' });
    if (!gateAvailable(inspection, 'F4')) fail(`${target} 需要 F4 PASS`, 2, { errorCode: 'F4_NOT_PASS' });
  }
}

/** 恢复时失效下游包、证据、批准和门状态，防止旧候选跨 RETURN 复用。 */
function invalidateDownstreamReferences(next, args, fromState, inspection) {
  const oldPackageRef = inspection.work.implementationPackagePath ?? inspection.work.implementationPackage;
  const oldEvidenceRef = inspection.work.evidenceManifestPath ?? inspection.work.evidenceManifest;
  const rejectReuse = (candidate, previous, label) => {
    if (candidate === undefined || previous === undefined || typeof previous !== 'string') return;
    if (resolve(inspection.repo, String(candidate)) === resolve(inspection.repo, String(previous))) fail(`恢复不能复用旧 ${label} 引用`, 2, { errorCode: 'STALE_RECOVERY_REFERENCE' });
  };
  const packageInput = args['implementation-package'] ?? args.package;
  const evidenceInput = args.evidence ?? args['evidence-manifest'];
  rejectReuse(packageInput, oldPackageRef, 'Implementation Package');
  rejectReuse(evidenceInput, oldEvidenceRef, 'Evidence Manifest');
  for (const field of ['implementationPackage', 'implementationPackagePath', 'evidenceManifest', 'evidenceManifestPath', 'approval', 'pendingApproval']) delete next[field];
  next.gateStatus = Object.fromEntries(GATES.map((gate) => [gate, 'NOT_RUN']));
  next.metadata = { ...(next.metadata ?? {}), invalidatedFrom: fromState, invalidatedAtState: next.globalState };
  if (packageInput !== undefined) next.implementationPackagePath = String(packageInput);
  if (evidenceInput !== undefined) next.evidenceManifestPath = String(evidenceInput);
}

/** 构造显式 RETURN 记录。 */
function returnRecord(fromState, args) {
  const classification = String(args['return-category'] ?? args.classification ?? '');
  const reason = String(args['return-reason'] ?? args.reason ?? '');
  const affectedScope = values(args['affected-scope'] ?? args.scope);
  if (!['upstream-fact-invalidated', 'scope-changed', 'hard-gate-would-be-bypassed'].includes(classification) || !reason.trim() || !affectedScope.length) fail('RETURN 必须提供有效分类、理由和 affected-scope', 2, { errorCode: 'RETURN_RECORD_REQUIRED' });
  return { classification, reason, affectedScope, fromState, toState: 'RETURN', recordedAt: new Date().toISOString(), resolvedAt: null };
}

/** 为一次内存迁移分配下一个版本；真正写盘时仍由 CAS 再次核对。 */
function nextRevision(work, next) {
  return { ...next, revision: work.revision + 1 };
}

/** 恢复只豁免 RETURN/BLOCKED 自身状态提示，其余硬阻断仍必须先解决。 */
function assertRecoveryBlockers(inspection, from, args = {}) {
  const ownCode = from === 'RETURN' ? 'RETURN_STATE' : 'BLOCKED_STATE';
  const blockers = inspection.blockers.filter((item) => item.code !== ownCode && !(item.code === 'EXACT_APPROVAL_REQUIRED' && args.approval && approvalMatches(inspection.work, args.approval)));
  if (blockers.length) {
    const first = blockers[0];
    fail(`恢复前存在硬阻断：${first.message}`, 2, { errorCode: first.code, next: first.next });
  }
}

/** 在内存中执行一次严格迁移；CLI 负责成功后写回。 */
export function transitionWorkItem(inspection, target, args = {}) {
  const { work } = inspection;
  enumValue(target, STATES, 'transition target');
  const from = work.globalState;
  if (target === from) fail('transition 不接受同状态迁移');
  if (target === 'RETURN') {
    if (!TRANSITIONS[from]?.includes('RETURN')) fail(`非法 RETURN 迁移：${from} → RETURN`, 2, { errorCode: 'RETURN_NOT_ALLOWED' });
    const next = nextRevision(work, { ...work, globalState: 'RETURN', returnRecord: returnRecord(from, args) });
    validateWorkItem(next);
    return next;
  }
  if (!TRANSITIONS[from]?.includes(target)) fail(`非法状态迁移：${from} → ${target}`, 2, { errorCode: 'ILLEGAL_TRANSITION' });
  if (target === 'BLOCKED') {
    if (!String(args.reason ?? '').trim()) fail('进入 BLOCKED 必须显式提供 reason', 2, { errorCode: 'BLOCK_REASON_REQUIRED' });
    if (from === 'RETURN') assertRecoveryBlockers(inspection, from, args);
    const next = nextRevision(work, { ...work, globalState: 'BLOCKED', metadata: { ...(work.metadata ?? {}), blockingReason: String(args.reason) } });
    if (from === 'RETURN') {
      next.returnRecord = { ...work.returnRecord, resolvedAt: new Date().toISOString() };
      invalidateDownstreamReferences(next, args, from, inspection);
    }
    return validateWorkItem(next);
  }
  if (from === 'RETURN' && !args['return-resolution'] && !args.reason) fail('从 RETURN 恢复必须显式提供 return-resolution');
  if (['RETURN', 'BLOCKED'].includes(from) && target === 'IMPLEMENTING' && !args['implementation-package'] && !args.package) fail('恢复到 IMPLEMENTING 必须显式绑定新的 Implementation Package', 2, { errorCode: 'IMPLEMENTATION_PACKAGE_REQUIRED' });
  if (['RETURN', 'BLOCKED'].includes(from)) assertRecoveryBlockers(inspection, from, args);
  // CLI 的 inspect 尚未看到本次 approval；只预验证当前精确审批对应的 EXACT blocker，其他阻断不豁免。
  const exactApprovalValid = args.approval && inspection.blockers.some((item) => item.code === 'EXACT_APPROVAL_REQUIRED') && approvalMatches(work, args.approval);
  const transitionBlockers = inspection.blockers.filter((item) => !(exactApprovalValid && item.code === 'EXACT_APPROVAL_REQUIRED'));
  if (!['RETURN', 'BLOCKED'].includes(from) && transitionBlockers.length) {
    const first = transitionBlockers[0];
    fail(`迁移前存在 inspect 阻断：${first.message}`, 2, { errorCode: first.code, next: first.next });
  }
  assertTransitionPreconditions(inspection, target, args);
  const next = nextRevision(work, { ...work, globalState: target });
  if (from === 'RETURN' || from === 'BLOCKED') {
    if (from === 'RETURN') next.returnRecord = { ...work.returnRecord, resolvedAt: new Date().toISOString() };
    invalidateDownstreamReferences(next, args, from, inspection);
  }
  if (!['RETURN', 'BLOCKED'].includes(from) && (args.approval ?? inspection.evidence?.approval)) next.approval = args.approval ?? inspection.evidence.approval;
  validateWorkItem(next);
  return next;
}

/** 通过运行时 IO 模块提交一次 Work Item mutation，并注入当前合同校验器。 */
export function commitWorkMutation(inspection, next) {
  return commitWithLock({
    workPath: inspection.workPath,
    expected: inspection.work,
    next,
    readCurrent: (path) => readJson(path, 'Work Item'),
    validate: validateWorkItem,
    fail,
  });
}

/** 串行自动推进已满足的安全前置状态，进入 IMPLEMENTING 后立刻停止。 */
export function run(args = {}) {
  const changed = [];
  let inspection = inspect(args, 'run');
  if (inspection.blockers.length) return resultRecord(inspection, 'BLOCKED', changed);
  const maxSteps = 12;
  for (let step = 0; step < maxSteps; step += 1) {
    const target = safeTarget(inspection);
    if (!target) return resultRecord(inspection, inspection.work.globalState === 'COMPLETE' ? 'COMPLETE' : 'READY', changed);
    if (target === 'RETURN') return resultRecord(inspection, 'BLOCKED', changed);
    let next;
    try {
      next = transitionWorkItem(inspection, target, args);
      commitWorkMutation(inspection, next);
    } catch (error) {
      inspection = { ...inspection, blockers: [errorBlock(error, '安全迁移前置条件未满足')] };
      inspection.next = nextAction(inspection);
      return resultRecord(inspection, 'BLOCKED', changed);
    }
    const from = inspection.work.globalState;
    changed.push(`${from} → ${target}`);
    inspection = inspect(args, 'run');
    if (target === 'IMPLEMENTING' || target === 'RELEASE_APPROVAL_REQUIRED' || target === 'RELEASING') return resultRecord(inspection, inspection.blockers.length ? 'BLOCKED' : 'READY', changed);
    if (inspection.blockers.length) return resultRecord(inspection, 'BLOCKED', changed);
  }
  const loopInspection = { ...inspection, blockers: [blocker('SAFE_RUN_STEP_LIMIT', 'run 达到安全迁移步数上限，已停止', '检查当前 Work Item 状态')] };
  return resultRecord(loopInspection, 'BLOCKED', changed);
}

/** 只允许安全状态自动前进；用户选择、实施和外部动作永远返回 null。 */
function safeTarget(inspection) {
  const { work, pkg, evidence } = inspection;
  if (inspection.blockers.length || work.globalState === 'RETURN' || work.globalState === 'BLOCKED' || work.userDecisionRequired || requiresExactApproval(work)) return null;
  if (work.globalState === 'INTAKE' && gateAvailable(inspection, 'F0')) return 'BASELINE';
  if (work.globalState === 'BASELINE' && gateAvailable(inspection, 'F1')) return 'PROPOSAL';
  if (work.globalState === 'PROPOSAL' && gateAvailable(inspection, 'F1') && gateAvailable(inspection, 'F2')) return 'REVIEW';
  if (work.globalState === 'REVIEW') {
    if (['A2', 'A3'].includes(work.actionLevel) && pkg) return 'IMPLEMENTING';
    if (['A0', 'A1'].includes(work.actionLevel) && gateAvailable(inspection, 'F3')) return 'VALIDATING';
    return null;
  }
  if (work.globalState === 'IMPLEMENTING') return null;
  if (work.globalState === 'VALIDATING' && evidence?.verdict === 'PASS' && gateAvailable(inspection, 'F3')) return 'PASSED';
  if (work.globalState === 'PASSED' && evidence?.verdict === 'PASS') {
    if (work.actionLevel === 'A4') return 'INTEGRATING';
    if (['A5', 'A6'].includes(work.actionLevel)) return 'RELEASE_APPROVAL_REQUIRED';
    return 'COMPLETE';
  }
  if (work.globalState === 'INTEGRATING' && evidence?.verdict === 'PASS') return ['A5', 'A6'].includes(work.actionLevel) ? 'RELEASE_APPROVAL_REQUIRED' : 'COMPLETE';
  return null;
}

/** 显式 transition CLI 入口。 */
export function transition(args = {}) {
  const repo = resolve(String(args.repo ?? process.cwd()));
  const workPath = resolve(repo, String(args['work-item'] ?? ''));
  const inspection = inspect({ ...args, repo, 'work-item': workPath }, 'transition');
  const target = String(args.to ?? '');
  const approval = loadApproval(args, inspection.work);
  const next = transitionWorkItem({ ...inspection, approval }, target, { ...args, approval });
  commitWorkMutation(inspection, next);
  const postInspection = inspect({ ...args, repo, 'work-item': workPath }, 'transition');
  const postStatus = postInspection.blockers.length ? 'BLOCKED' : next.globalState === 'COMPLETE' ? 'COMPLETE' : 'READY';
  const output = resultRecord(postInspection, postStatus, [`${inspection.work.globalState} → ${target}`], { transition: true });
  return output;
}

/** 从文件或精确 CLI 字段读取批准对象；没有完整对象就保持未批准。 */
function loadApproval(args, work) {
  if (args.approval && args.approval !== true) return readJson(args.approval, 'Approval');
  if (!args['approval-id']) return work.approval ?? null;
  const pending = work.pendingApproval ?? approvalSnapshot(work);
  return {
    approvalId: String(args['approval-id']),
    workItemId: work.workItemId,
    baselineHash: work.baselineHash,
    stageId: work.stageId,
    actionLevel: String(args['approval-level'] ?? pending.actionLevel),
    actionType: String(args['approval-type'] ?? pending.actionType),
    gate: 'F4',
    object: String(args['approval-object'] ?? pending.object),
    impact: values(args['approval-impact'] ?? pending.impact),
    target: values(args['approval-target'] ?? pending.target),
    approvedAt: args['approved-at'] === undefined ? null : String(args['approved-at']),
    approvedBy: args['approved-by'] === undefined ? null : String(args['approved-by']),
  };
}

/** Skill 自检：schema、入口文档、状态/风险标识和文件规模必须齐全。 */
export function lint(args = {}) {
  const root = args.skill ? resolve(String(args.skill)) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const required = ['SKILL.md', 'agents/openai.yaml', 'references/simplified-workflow.md', 'references/control-model.md', 'references/state-gates.md', 'references/unity-evidence.md', 'schemas/work-item.schema.json', 'schemas/implementation-package.schema.json', 'schemas/evidence-manifest.schema.json', 'scripts/workflow-control.mjs', 'scripts/runtime/io.mjs', 'scripts/runtime/visible-contract.mjs'];
  const checked = [];
  for (const item of required) {
    const path = join(root, item);
    if (!existsSync(path) || !statSync(path).isFile()) fail(`Skill 入口缺少文件：${item}`, 2, { errorCode: 'SKILL_FILE_MISSING' });
    checked.push(item);
    if (statSync(path).isFile() && !item.endsWith('.json') && readFileSync(path, 'utf8').split(/\r?\n/).length > 1000) fail(`文件超过 1000 行：${item}`);
  }
  for (const schemaName of ['work-item.schema.json', 'implementation-package.schema.json', 'evidence-manifest.schema.json']) {
    const schema = JSON.parse(readFileSync(join(root, 'schemas', schemaName), 'utf8'));
    if (schema.type !== 'object' || schema.additionalProperties !== false || schema.properties?.schemaVersion?.const !== SCHEMA_VERSION || !schema.required?.includes('schemaVersion')) fail(`schema 不符合统一严格合同：${schemaName}`, 2, { errorCode: 'SCHEMA_CONTRACT_INVALID' });
  }
  const entryText = readFileSync(join(root, 'SKILL.md'), 'utf8');
  const controlText = readFileSync(join(root, 'references', 'control-model.md'), 'utf8');
  const simplifiedText = readFileSync(join(root, 'references', 'simplified-workflow.md'), 'utf8');
  const entryDocs = `${entryText}\n${controlText}\n${simplifiedText}`;
  for (const token of [...STAGES, ...SCENE_STAGES, ...GATES, 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']) if (!entryDocs.includes(token)) fail(`Skill 文档缺少控制入口标识：${token}`);
  return { ok: true, command: 'lint', status: 'READY', stage: 'skill/lint', changed: [], blocking: [], next: '按 schema 和参考文档使用控制面', metadata: { schemaVersion: SCHEMA_VERSION, checked } };
}

/** CLI 入口；稳定查询失败使用 JSON stderr，避免把堆栈泄露给工作流调用方。 */
export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  try {
    let output;
    if (command === 'status') output = status(args);
    else if (command === 'check') output = check(args);
    else if (command === 'run') output = run(args);
    else if (command === 'transition') output = transition(args);
    else if (command === 'lint') output = lint(args);
    else fail(`未知命令：${command ?? '(空)'}`);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (['check', 'run', 'status'].includes(command) && output.status === 'BLOCKED') process.exitCode = 2;
    return output;
  } catch (error) {
    const code = Number.isInteger(error?.code) ? error.code : 2;
    const details = error?.details ?? {};
    const output = { status: 'BLOCKED', stage: `${args.stage ?? 'unknown'}/${args.state ?? 'unknown'}`, changed: [], blocking: [error?.message ?? String(error)], next: details.next ?? '修复当前控制面错误后重试', metadata: { schemaVersion: SCHEMA_VERSION, errorCode: details.errorCode ?? 'CONTROL_ERROR', ...(details.field ? { field: details.field } : {}) } };
    process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = code;
    return output;
  }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('workflow-control.mjs')) main();
