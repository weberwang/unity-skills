/** 控制面公共枚举、参数与路径合同；供入口及运行时复用，避免循环依赖。 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { canonicalizePosixPath as canonicalizePosixPathRuntime } from './io.mjs';

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
  RETURN: ['BASELINE', 'PROPOSAL', 'REVIEW', 'IMPLEMENTING'],
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
export const SCENE_LABELS = Object.freeze({ V0: '分流', V1: '场景定义', V2: '拆解与布局确认', V3: '正式资源验收', V4: '正式实现与运行验收' });
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
export function values(value) {
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
export function normalizePattern(pattern) {
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
export function stringArray(value, label, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) fail(`${label} 必须为${required ? '非空' : ''}字符串数组`);
  return [...value];
}

/** 确认对象只包含 schema 已声明的字段，拒绝旧版或拼写错误字段。 */
export function knownObject(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须为对象`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} 含未声明字段：${key}`, 2, { errorCode: 'UNKNOWN_FIELD', field: key });
}

/** 校验 schemaVersion，避免控制面静默接受旧数据。 */
export function schemaVersion(value, label) {
  if (value?.schemaVersion !== SCHEMA_VERSION) fail(`${label}.schemaVersion 必须为 ${SCHEMA_VERSION}`);
}

/** 校验枚举值。 */
export function enumValue(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} 无效：${value}`);
}

/** 返回有效的 gate 状态对象。 */
export function gateStatuses(value, label) {
  if (value === undefined) return {};
  knownObject(value, new Set(GATES), label);
  for (const [gate, status] of Object.entries(value)) enumValue(status, ['PASS', 'FAIL', 'NOT_RUN'], `${label}.${gate}`);
  return { ...value };
}

/** 从嵌套 pendingApproval 或扁平动作字段生成统一的待处理动作快照。 */
export function approvalSnapshot(work) {
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
