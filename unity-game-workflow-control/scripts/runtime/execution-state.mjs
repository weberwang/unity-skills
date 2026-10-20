/** Unity 执行单元状态与结果证据闭环；只记录和校验证据，不执行验收命令。 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';

const STATE_SCHEMA_VERSION = '1.0';
const UNIT_TYPES = new Set(['SHARED', 'MODULE', 'SCENE', 'DISPLAY_LAYER', 'INTEGRATION', 'RELEASE']);
const SPECIAL_SERIAL_TYPES = new Set(['SHARED', 'INTEGRATION', 'RELEASE']);
const EDITOR_WRITE_TYPES = new Set(['SHARED', 'MODULE', 'SCENE', 'DISPLAY_LAYER', 'INTEGRATION']);
const UNIT_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETE']);

/** 抛出带稳定错误码的执行状态异常，供控制器转换为统一 CLI 错误。 */
function fail(message, code = 'EXECUTION_STATE_INVALID') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

/** 严格校验 POSIX 项目相对路径，拒绝绝对路径、反斜杠和路径穿越。 */
function posixPath(value, label, { allowGlob = false } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    fail(`${label} 必须是非空 POSIX 项目相对路径`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /^[A-Za-z]:$/.test(segment) || (!allowGlob && /[*?\[\]]/.test(segment)))) fail(`${label} 含空段、通配符或非法 . / .. 段：${value}`);
  return segments.join('/');
}

/** 验证 work.evidenceRoot，并返回其规范的 POSIX 相对路径。 */
function evidenceRootOf(work) {
  if (!work || typeof work !== 'object') fail('Work Item 必须为对象');
  return posixPath(work.evidenceRoot, 'Work Item.evidenceRoot');
}

/** 返回执行状态在项目中的稳定 POSIX 路径。 */
export function executionStatePath(work) {
  return `${evidenceRootOf(work)}/execution-state.json`;
}

/** 验证路径是否位于指定根目录下，避免仅靠字符串前缀造成边界误判。 */
function assertWithin(root, absolute, label) {
  const rel = relative(root, absolute);
  const parentSegment = `..${String.fromCharCode(92)}`;
  if (!rel || rel === '.' || rel === '..' || rel.startsWith(parentSegment) || rel.startsWith('../') || isAbsolute(rel)) {
    fail(`${label} 必须位于根目录内：${absolute}`);
  }
}

/** 逐段验证真实路径，拒绝证据路径中的符号链接及目录替换。 */
function resolveSafePath(repo, pathValue, label, { mustExist = true } = {}) {
  const root = realpathSync(resolve(repo));
  const normalized = posixPath(pathValue, label);
  const segments = normalized.split('/');
  let cursor = root;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = resolve(cursor, segments[index]);
    assertWithin(root, cursor, label);
    if (!existsSync(cursor)) {
      if (mustExist) fail(`${label} 不存在：${normalized}`, 'EXECUTION_EVIDENCE_MISSING');
      continue;
    }
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`${label} 不允许经过符号链接：${normalized}`, 'EXECUTION_SYMLINK_FORBIDDEN');
    if (index < segments.length - 1 && !stat.isDirectory()) fail(`${label} 的上级路径不是目录：${normalized}`);
    if (index === segments.length - 1 && mustExist && !stat.isFile()) fail(`${label} 必须是普通文件：${normalized}`);
  }
  if (mustExist) {
    const real = realpathSync(cursor);
    assertWithin(root, real, label);
  }
  return cursor;
}

/** 创建缺失目录时逐层检查，防止递归 mkdir 跟随被替换成符号链接的路径。 */
function ensureSafeDirectory(repo, pathValue, label) {
  const root = realpathSync(resolve(repo));
  const normalized = posixPath(pathValue, label);
  let cursor = root;
  for (const segment of normalized.split('/')) {
    cursor = resolve(cursor, segment);
    assertWithin(root, cursor, label);
    if (!existsSync(cursor)) {
      try {
        mkdirSync(cursor);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} 必须是无符号链接的目录：${normalized}`, 'EXECUTION_SYMLINK_FORBIDDEN');
  }
  return cursor;
}

/** 以同目录临时文件和 rename 原子写 JSON，避免留下半写状态。 */
function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** 将 JSON 文件读为对象并给出路径明确的错误。 */
function readJsonFile(path, label) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${label} 不是可读的有效 JSON：${error.message}`, 'EXECUTION_EVIDENCE_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${label} 必须为 JSON 对象`, 'EXECUTION_EVIDENCE_INVALID');
  return parsed;
}

/** 校验非空字符串数组，并返回副本。 */
function stringArray(value, label, { required = false, nonempty = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${label} 必须为${required ? '非空' : ''}字符串数组`);
  }
  if (nonempty && !value.length) fail(`${label} 不得为空`);
  return [...value];
}

/** 将实施包单元归一化为不含执行状态的计划快照。 */
function planUnits(pkg) {
  if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.executionUnits) || !pkg.executionUnits.length) fail('Implementation Package.executionUnits 必须为非空数组');
  const seenIds = new Set();
  const units = pkg.executionUnits.map((unit, index) => {
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) fail(`实施单元[${index}] 必须为对象`);
    const { unitId, unitType, owner } = unit;
    if (typeof unitId !== 'string' || !unitId.trim() || seenIds.has(unitId)) fail(`实施单元[${index}].unitId 无效或重复`);
    seenIds.add(unitId);
    if (!UNIT_TYPES.has(unitType)) fail(`实施单元 ${unitId}.unitType 无效`);
    if (typeof owner !== 'string' || !owner.trim()) fail(`实施单元 ${unitId}.owner 必须为非空字符串`);
    const identity = {};
    for (const field of ['moduleId', 'scopeId', 'sceneId', 'displayLayerId', 'hostSceneId']) {
      const value = unit[field] ?? null;
      if (value !== null && (typeof value !== 'string' || !value.trim())) fail(`实施单元 ${unitId}.${field} 必须是非空字符串或缺省`);
      identity[field] = value;
    }
    const files = stringArray(unit.files, `实施单元 ${unitId}.files`, { required: true });
    if (new Set(files).size !== files.length) fail(`实施单元 ${unitId}.files 不得重复`);
    files.forEach((file) => posixPath(file, `实施单元 ${unitId}.files`, { allowGlob: true }));
    const dependsOn = stringArray(unit.dependsOn ?? [], `实施单元 ${unitId}.dependsOn`);
    if (new Set(dependsOn).size !== dependsOn.length) fail(`实施单元 ${unitId}.dependsOn 不得重复`);
    const acceptanceCommands = stringArray(unit.acceptanceCommands, `实施单元 ${unitId}.acceptanceCommands`, { required: true, nonempty: true });
    if (new Set(acceptanceCommands).size !== acceptanceCommands.length) fail(`实施单元 ${unitId}.acceptanceCommands 不得重复`);
    const parallelGroup = unit.parallelGroup ?? null;
    if (parallelGroup !== null && (typeof parallelGroup !== 'string' || !parallelGroup.trim())) fail(`实施单元 ${unitId}.parallelGroup 必须为非空字符串或 null`);
    if (SPECIAL_SERIAL_TYPES.has(unitType) && parallelGroup !== null) fail(`${unitType} 单元必须串行，不能声明 parallelGroup：${unitId}`);
    if (unit.serial !== undefined && typeof unit.serial !== 'boolean') fail(`实施单元 ${unitId}.serial 必须为布尔值`);
    if (unit.editorWrite !== undefined && typeof unit.editorWrite !== 'boolean') fail(`实施单元 ${unitId}.editorWrite 必须为布尔值`);
    if (SPECIAL_SERIAL_TYPES.has(unitType) && unit.serial === false) fail(`${unitType} 单元不能关闭 serial：${unitId}`);
    const editorWrite = unit.editorWrite !== false && EDITOR_WRITE_TYPES.has(unitType);
    const serial = SPECIAL_SERIAL_TYPES.has(unitType) || unit.serial === true;
    return {
      unitId,
      unitType,
      ...identity,
      owner,
      editorWrite,
      serial,
      files,
      dependsOn,
      parallelGroup,
      acceptanceCommands,
    };
  });
  const known = new Set();
  for (const unit of units) {
    if (unit.dependsOn.some((id) => !known.has(id))) fail(`实施单元 ${unit.unitId}.dependsOn 必须引用数组中更早的单元`);
    known.add(unit.unitId);
  }
  return units;
}

/** 将相邻同名并行组划分为批次，并拒绝含 Editor 写入的并行批次。 */
function planBatches(units) {
  const batches = [];
  let index = 0;
  while (index < units.length) {
    const unit = units[index];
    const group = unit.parallelGroup;
    let end = index + 1;
    if (group !== null) {
      while (end < units.length && units[end].parallelGroup === group) end += 1;
      const batch = units.slice(index, end);
      const editorWrites = batch.filter((entry) => entry.editorWrite);
      if (batch.length > 1 && editorWrites.length) fail(`并行组 ${group} 含 Editor 写入单元，必须拆为串行单元：${editorWrites.map((entry) => entry.unitId).join(', ')}`);
      const serialUnits = batch.filter((entry) => entry.serial);
      if (batch.length > 1 && serialUnits.length) fail(`并行组 ${group} 含串行单元，必须拆分：${serialUnits.map((entry) => entry.unitId).join(', ')}`);
      if (batch.some((entry) => entry.parallelGroup !== group)) fail(`并行组 ${group} 的成员必须连续`);
      batches.push(batch.map((entry) => entry.unitId));
    } else {
      batches.push([unit.unitId]);
    }
    index = end;
  }
  return batches;
}

/** 固定对象键顺序序列化计划身份，不依赖文件内容 SHA 或基线摘要。 */
function makePlanVersion(packageId, stageId, sceneStage, displayLayerStage, units) {
  return JSON.stringify({
    packageId,
    stageId,
    sceneStage,
    displayLayerStage,
    units: units.map((unit) => ({
      unitId: unit.unitId,
      unitType: unit.unitType,
      moduleId: unit.moduleId,
      scopeId: unit.scopeId,
      sceneId: unit.sceneId,
      displayLayerId: unit.displayLayerId,
      hostSceneId: unit.hostSceneId,
      owner: unit.owner,
      editorWrite: unit.editorWrite,
      serial: unit.serial,
      files: unit.files,
      dependsOn: unit.dependsOn,
      parallelGroup: unit.parallelGroup,
      acceptanceCommands: unit.acceptanceCommands,
    })),
  });
}

/** 从当前 Work Item 和实施包生成稳定计划身份与执行批次。 */
function currentPlan(work, pkg) {
  const evidenceRoot = evidenceRootOf(work);
  if (typeof work.workItemId !== 'string' || !work.workItemId.trim()) fail('Work Item.workItemId 必须为非空字符串');
  if (typeof work.baselineHash !== 'string' || !work.baselineHash.trim()) fail('Work Item.baselineHash 必须为非空字符串');
  if (typeof work.stageId !== 'string' || !work.stageId.trim()) fail('Work Item.stageId 必须为非空字符串');
  if (!pkg || typeof pkg.packageId !== 'string' || !pkg.packageId.trim()) fail('Implementation Package.packageId 必须为非空字符串');
  if (pkg.workItemId !== work.workItemId) fail('Implementation Package 未绑定当前 Work Item');
  if (pkg.stageId !== undefined && pkg.stageId !== work.stageId) fail('Implementation Package.stageId 与 Work Item 不一致');
  if (work.scene !== undefined && (!work.scene || typeof work.scene !== 'object' || Array.isArray(work.scene) || typeof work.scene.stage !== 'string')) fail('Work Item.scene.stage 缺失或无效');
  if (work.displayLayer !== undefined && (!work.displayLayer || typeof work.displayLayer !== 'object' || Array.isArray(work.displayLayer) || typeof work.displayLayer.stage !== 'string')) fail('Work Item.displayLayer.stage 缺失或无效');
  const sceneStage = work.scene?.stage ?? null;
  const displayLayerStage = work.displayLayer?.stage ?? null;
  if (sceneStage !== null && !['V0', 'V1', 'V2', 'V3', 'V4'].includes(sceneStage)) fail('Work Item.scene.stage 无效');
  if (displayLayerStage !== null && !['V0', 'V1', 'V2', 'V3', 'V4'].includes(displayLayerStage)) fail('Work Item.displayLayer.stage 无效');
  if (sceneStage !== null && displayLayerStage !== null) fail('单个 Work Item 不能同时绑定 scene 与 displayLayer 阶段');
  const units = planUnits(pkg);
  const batches = planBatches(units);
  const batchByUnit = new Map();
  batches.forEach((batch, index) => batch.forEach((unitId) => batchByUnit.set(unitId, index)));
  for (const unit of units) {
    const currentBatch = batchByUnit.get(unit.unitId);
    for (const dependency of unit.dependsOn) {
      if (batchByUnit.get(dependency) >= currentBatch) fail(`实施单元 ${unit.unitId} 的依赖必须属于更早的执行批次`);
    }
  }
  return {
    evidenceRoot,
    workItemId: work.workItemId,
    packageId: pkg.packageId,
    baselineHash: work.baselineHash,
    stageId: pkg.stageId ?? work.stageId,
    sceneStage,
    displayLayerStage,
    units,
    batches,
    planVersion: makePlanVersion(pkg.packageId, pkg.stageId ?? work.stageId, sceneStage, displayLayerStage, units),
  };
}

/** 根据当前计划创建初始执行状态；不读文件、不写磁盘，可重复生成相同计划。 */
export function createExecutionState(work, pkg) {
  const plan = currentPlan(work, pkg);
  const firstBatch = new Set(plan.batches[0] ?? []);
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: 0,
    workItemId: plan.workItemId,
    packageId: plan.packageId,
    baselineHash: plan.baselineHash,
    stageId: plan.stageId,
    sceneStage: plan.sceneStage,
    displayLayerStage: plan.displayLayerStage,
    planVersion: plan.planVersion,
    units: plan.units.map((unit) => ({
      ...unit,
      status: firstBatch.has(unit.unitId) ? 'IN_PROGRESS' : 'PENDING',
    })),
  };
}

/** 验证状态对象的字段、计划快照和状态序列，不访问磁盘。 */
function validateStateShape(state, plan) {
  const allowed = new Set(['schemaVersion', 'revision', 'workItemId', 'packageId', 'baselineHash', 'stageId', 'sceneStage', 'displayLayerStage', 'planVersion', 'units']);
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('Execution State 必须为对象');
  for (const field of Object.keys(state)) if (!allowed.has(field)) fail(`Execution State 含未声明字段：${field}`);
  for (const field of ['schemaVersion', 'revision', 'workItemId', 'packageId', 'baselineHash', 'stageId', 'sceneStage', 'displayLayerStage', 'planVersion', 'units']) {
    if (!(field in state)) fail(`Execution State 缺少必需字段：${field}`);
  }
  if (state.schemaVersion !== STATE_SCHEMA_VERSION) fail('Execution State.schemaVersion 必须为 1.0');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) fail('Execution State.revision 必须为不小于 0 的安全整数');
  if (state.workItemId !== plan.workItemId || state.packageId !== plan.packageId || state.stageId !== plan.stageId) fail('Execution State 未绑定当前 Work Item、Package 或阶段');
  if (state.sceneStage !== plan.sceneStage || state.displayLayerStage !== plan.displayLayerStage) fail('Execution State 场景/弹窗阶段与当前计划不一致');
  if (typeof state.baselineHash !== 'string' || !state.baselineHash.trim()) fail('Execution State.baselineHash 必须为非空字符串');
  if (state.planVersion !== plan.planVersion) fail('执行计划身份已变化，必须先归档旧状态再初始化新计划', 'STALE_EXECUTION_PLAN');
  if (!Array.isArray(state.units) || state.units.length !== plan.units.length) fail('Execution State.units 与当前计划长度不一致');
    const allowedUnit = new Set(['unitId', 'unitType', 'moduleId', 'scopeId', 'sceneId', 'displayLayerId', 'hostSceneId', 'owner', 'editorWrite', 'serial', 'files', 'dependsOn', 'parallelGroup', 'acceptanceCommands', 'status', 'resultPath']);
  for (let index = 0; index < state.units.length; index += 1) {
    const actual = state.units[index];
    const expected = plan.units[index];
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) fail(`Execution State.units[${index}] 必须为对象`);
    for (const key of Object.keys(actual)) if (!allowedUnit.has(key)) fail(`Execution State 单元含未声明字段：${key}`);
    for (const key of ['unitId', 'unitType', 'moduleId', 'scopeId', 'sceneId', 'displayLayerId', 'hostSceneId', 'owner', 'editorWrite', 'serial', 'files', 'dependsOn', 'parallelGroup', 'acceptanceCommands', 'status']) if (!(key in actual)) fail(`Execution State 单元缺少字段：${key}`);
    const snapshot = {
      unitId: actual.unitId,
      unitType: actual.unitType,
      moduleId: actual.moduleId,
      scopeId: actual.scopeId,
      sceneId: actual.sceneId,
      displayLayerId: actual.displayLayerId,
      hostSceneId: actual.hostSceneId,
      owner: actual.owner,
      editorWrite: actual.editorWrite,
      serial: actual.serial,
      files: actual.files,
      dependsOn: actual.dependsOn,
      parallelGroup: actual.parallelGroup,
      acceptanceCommands: actual.acceptanceCommands,
    };
    if (JSON.stringify(snapshot) !== JSON.stringify(expected)) fail(`Execution State 单元计划快照被修改：${expected.unitId}`);
    if (!UNIT_STATUSES.has(actual.status)) fail(`Execution State 单元状态无效：${actual.unitId}`);
    if (actual.status === 'COMPLETE' && typeof actual.resultPath !== 'string') fail(`已完成单元缺少 resultPath：${actual.unitId}`);
    if (actual.status !== 'COMPLETE' && 'resultPath' in actual) fail(`未完成单元不得绑定 resultPath：${actual.unitId}`);
  }
  validateStatusSequence(state, plan.batches);
  return state;
}

/** 确保完成批次连续，且最多只有一个当前活动批次。 */
function validateStatusSequence(state, batches) {
  let activeSeen = false;
  let pendingSeen = false;
  let incompleteBatchSeen = false;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const statuses = batch.map((unitId) => state.units.find((unit) => unit.unitId === unitId)?.status);
    if (statuses.every((status) => status === 'COMPLETE')) {
      if (incompleteBatchSeen) fail(`前序执行批次未完成，后续批次不得 COMPLETE：${batch.join(', ')}`);
      continue;
    }
    if (statuses.some((status) => status === 'PENDING')) {
      pendingSeen = true;
      if (statuses.some((status) => status !== 'PENDING')) fail(`未激活执行批次状态不一致：${batch.join(', ')}`);
      if (!activeSeen) fail(`下一个执行批次未激活：${batch.join(', ')}`);
      continue;
    }
    if (pendingSeen) fail(`后续批次已激活，但前序批次尚未完成：${batch.join(', ')}`);
    if (activeSeen || statuses.some((status) => status !== 'IN_PROGRESS' && status !== 'COMPLETE')) fail(`执行批次状态不一致：${batch.join(', ')}`);
    activeSeen = true;
    incompleteBatchSeen = true;
  }
}

/** 确保一个结果附件是 evidenceRoot 内无符号链接的可读普通文件。 */
function validateEvidenceFile(repo, plan, pathValue, label, { readable = true } = {}) {
  const normalized = posixPath(pathValue, label);
  if (!normalized.startsWith(`${plan.evidenceRoot}/`)) fail(`${label} 必须位于 Work Item.evidenceRoot 内：${normalized}`);
  const absolute = resolveSafePath(repo, normalized, label);
  if (readable) {
    try {
      readFileSync(absolute);
    } catch (error) {
      fail(`${label} 不可读：${normalized}（${error.message}）`, 'EXECUTION_EVIDENCE_INVALID');
    }
  }
  return normalized;
}

/** 校验单元结果与当前执行计划的身份、命令退出码和附件引用。 */
function validateUnitResult(repo, work, pkg, plan, unit, resultPath) {
  const normalizedResultPath = validateEvidenceFile(repo, plan, resultPath, 'Execution Unit Result');
  if (!normalizedResultPath.toLowerCase().endsWith('.json')) fail('Execution Unit Result 必须是 JSON 文件');
  const result = readJsonFile(resolveSafePath(repo, normalizedResultPath, 'Execution Unit Result'), 'Execution Unit Result');
  const allowed = new Set(['schemaVersion', 'resultId', 'workItemId', 'packageId', 'planVersion', 'unitId', 'verdict', 'commands', 'files', 'recordedAt']);
  for (const key of Object.keys(result)) if (!allowed.has(key)) fail(`Execution Unit Result 含未声明字段：${key}`);
  for (const key of allowed) if (!(key in result)) fail(`Execution Unit Result 缺少必需字段：${key}`);
  if (result.schemaVersion !== STATE_SCHEMA_VERSION || typeof result.resultId !== 'string' || !result.resultId.trim()) fail('Execution Unit Result 版本或 resultId 无效');
  if (result.workItemId !== work.workItemId || result.packageId !== pkg.packageId || result.planVersion !== plan.planVersion || result.unitId !== unit.unitId) fail('Execution Unit Result 未绑定当前 Work Item、Package、计划或单元', 'STALE_EXECUTION_RESULT');
  if (result.verdict !== 'PASS') fail('只有 verdict=PASS 的单元结果可以完成执行单元', 'EXECUTION_RESULT_NOT_PASS');
  if (typeof result.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(result.recordedAt) || !Number.isFinite(Date.parse(result.recordedAt))) fail('Execution Unit Result.recordedAt 必须是有效 ISO 日期时间');
  if (!Array.isArray(result.commands) || result.commands.length !== unit.acceptanceCommands.length) fail(`单元 ${unit.unitId} 的实际命令数与验收计划不一致`);
  const outputFiles = [];
  for (let index = 0; index < result.commands.length; index += 1) {
    const entry = result.commands[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`Execution Unit Result.commands[${index}] 必须为对象`);
    for (const key of Object.keys(entry)) if (!['command', 'exitCode', 'outputFile'].includes(key)) fail(`Execution Unit Result.commands[${index}] 含未声明字段：${key}`);
    for (const key of ['command', 'exitCode', 'outputFile']) if (!(key in entry)) fail(`Execution Unit Result.commands[${index}] 缺少字段：${key}`);
    if (entry.command !== unit.acceptanceCommands[index]) fail(`单元 ${unit.unitId} 的验收命令与冻结计划不一致`);
    if (entry.exitCode !== 0) fail(`单元 ${unit.unitId} 的验收命令未通过：${entry.command}`, 'EXECUTION_COMMAND_FAILED');
    outputFiles.push(validateEvidenceFile(repo, plan, entry.outputFile, `命令 ${index + 1} outputFile`));
  }
  if (outputFiles.includes(normalizedResultPath)) fail('验收命令输出不得指向 Result 自身');
  if (!Array.isArray(result.files) || !result.files.length) fail('Execution Unit Result.files 必须包含至少一个证据附件');
  const files = result.files.map((path) => validateEvidenceFile(repo, plan, path, 'Execution Unit Result.files[]'));
  if (new Set(files).size !== files.length) fail('Execution Unit Result.files 不得重复');
  for (const outputFile of outputFiles) if (!files.includes(outputFile)) fail(`命令输出必须列入 Result.files：${outputFile}`);
  return { resultPath: normalizedResultPath, result };
}

/** 从状态文件读取并校验已完成单元绑定的真实结果和附件。 */
function readCurrentState(repo, work, pkg, plan) {
  const path = executionStatePath(work);
  const absolute = resolveSafePath(repo, path, 'Execution State');
  const state = readJsonFile(absolute, 'Execution State');
  validateStateShape(state, plan);
  for (const unit of state.units) {
    if (unit.status !== 'COMPLETE') continue;
    const validated = validateUnitResult(repo, work, pkg, plan, unit, unit.resultPath);
    if (validated.result.verdict !== 'PASS') fail(`已完成单元的 Result 不再为 PASS：${unit.unitId}`);
  }
  return state;
}

/** 在执行状态专用文件锁内运行同步操作，避免两个单元结果并发覆盖。 */
function withStateLock(repo, work, operation) {
  const stateRelative = executionStatePath(work);
  const directory = dirname(stateRelative).replaceAll('\\', '/');
  const absoluteDirectory = ensureSafeDirectory(repo, directory, 'Execution State 目录');
  const stateFile = resolve(absoluteDirectory, 'execution-state.json');
  const lockFile = `${stateFile}.lock`;
  let acquired = false;
  try {
    writeFileSync(lockFile, `${JSON.stringify({ pid: process.pid, lockedAt: new Date().toISOString() })}\n`, { encoding: 'utf8', flag: 'wx' });
    acquired = true;
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`Execution State 已被其他进程锁定：${stateRelative}.lock`, 'EXECUTION_STATE_LOCKED');
    throw error;
  }
  try {
    return operation(stateFile, stateRelative);
  } finally {
    if (acquired) rmSync(lockFile, { force: true });
  }
}

/** 校验执行状态的现有证据后只读返回，不执行命令或修改文件。 */
export function loadExecutionState(repo, work, pkg) {
  const plan = currentPlan(work, pkg);
  return readCurrentState(repo, work, pkg, plan);
}

/** 用 revision CAS 原子写执行状态；相同计划的重复初始化返回现有状态。 */
export function writeExecutionState(repo, work, pkg, state, { capturePrevious } = {}) {
  const plan = currentPlan(work, pkg);
  validateStateShape(state, plan);
  return withStateLock(repo, work, (stateFile) => {
    if (!existsSync(stateFile)) {
      const initial = createExecutionState(work, pkg);
      validateStateShape(state, plan);
      if (state.revision !== 0 || !isInitialState(state, initial)) fail('首次写入必须是当前计划的初始执行状态');
      capturePrevious?.(null);
      writeJsonAtomic(stateFile, state);
      return state;
    }
    const current = readCurrentState(repo, work, pkg, plan);
    if (state.revision === 0 && state.planVersion === current.planVersion) {
      capturePrevious?.(structuredClone(current));
      return current;
    }
    if (state.revision !== current.revision + 1) fail('Execution State revision CAS 冲突，拒绝陈旧写入', 'STALE_EXECUTION_STATE');
    if (state.baselineHash !== current.baselineHash) fail('Execution State.baselineHash 是创建时的 Git 身份，不能在写入时改写');
    validateStateTransition(current, state, plan, repo, work, pkg);
    capturePrevious?.(structuredClone(current));
    writeJsonAtomic(stateFile, state);
    return state;
  });
}

/** 对象键顺序不影响初始化幂等性，但状态和数组顺序必须与计划一致。 */
function isInitialState(state, initial) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  };
  return JSON.stringify(normalize(state)) === JSON.stringify(normalize(initial));
}

/** 只允许单调推进的单元状态变化，并为新增 COMPLETE 重新核验证据。 */
function validateStateTransition(current, next, plan, repo, work, pkg) {
  validateStateShape(next, plan);
  for (let index = 0; index < current.units.length; index += 1) {
    const before = current.units[index];
    const after = next.units[index];
    const valid = before.status === after.status
      || (before.status === 'PENDING' && after.status === 'IN_PROGRESS')
      || (before.status === 'IN_PROGRESS' && after.status === 'COMPLETE');
    if (!valid) fail(`单元状态只能顺序前进：${before.unitId} ${before.status} → ${after.status}`);
    if (before.status === 'COMPLETE' && before.resultPath !== after.resultPath) fail(`已完成单元的 Result 绑定不可替换：${before.unitId}`);
    if (after.status === 'COMPLETE') validateUnitResult(repo, work, pkg, plan, after, after.resultPath);
  }
}

/** 完成一个当前活动单元，验证 Result 后推进其批次和后续执行批次。 */
export function completeExecutionUnit(repo, work, pkg, resultPath, { capturePrevious } = {}) {
  const plan = currentPlan(work, pkg);
  return withStateLock(repo, work, (stateFile) => {
    if (!existsSync(stateFile)) fail('Execution State 尚未初始化', 'EXECUTION_STATE_MISSING');
    const current = readCurrentState(repo, work, pkg, plan);
    const normalizedResultPath = validateEvidenceFile(repo, plan, resultPath, 'Execution Unit Result');
    const preliminary = resolveSafePath(repo, normalizedResultPath, 'Execution Unit Result');
    const rawResult = readJsonFile(preliminary, 'Execution Unit Result');
    const unit = current.units.find((entry) => entry.unitId === rawResult.unitId);
    if (!unit) fail(`Execution Unit Result 指向未知单元：${rawResult.unitId}`);
    if (unit.status !== 'IN_PROGRESS') fail(`只有当前 IN_PROGRESS 单元可以完成：${unit.unitId}=${unit.status}`, 'EXECUTION_UNIT_NOT_ACTIVE');
    const validated = validateUnitResult(repo, work, pkg, plan, unit, normalizedResultPath);
    const next = structuredClone(current);
    const target = next.units.find((entry) => entry.unitId === unit.unitId);
    target.status = 'COMPLETE';
    target.resultPath = validated.resultPath;
    const batchIndex = plan.batches.findIndex((batch) => batch.includes(unit.unitId));
    const activeBatch = plan.batches[batchIndex];
    if (activeBatch.every((unitId) => next.units.find((entry) => entry.unitId === unitId).status === 'COMPLETE')) {
      const nextBatch = plan.batches[batchIndex + 1];
      if (nextBatch) for (const unitId of nextBatch) {
        const entry = next.units.find((candidate) => candidate.unitId === unitId);
        if (entry.status !== 'PENDING') fail(`下一执行批次必须全为 PENDING：${unitId}`);
        entry.status = 'IN_PROGRESS';
      }
    }
    next.revision = current.revision + 1;
    validateStateTransition(current, next, plan, repo, work, pkg);
    capturePrevious?.(structuredClone(current));
    writeJsonAtomic(stateFile, next);
    return next;
  });
}

/** 重读执行状态和所有 Result，确认当前计划的整个数组顺序均已完成。 */
export function assertExecutionComplete(repo, work, pkg) {
  const state = loadExecutionState(repo, work, pkg);
  const pending = state.units.filter((unit) => unit.status !== 'COMPLETE').map((unit) => unit.unitId);
  if (pending.length) fail(`执行单元尚未全部完成：${pending.join(', ')}`, 'EXECUTION_UNITS_INCOMPLETE');
  return state;
}

/** 将当前状态归档到 evidenceRoot/history，保留 Result 和其附件供审计。 */
export function archiveExecutionState(repo, work, { capturePrevious } = {}) {
  return withStateLock(repo, work, (stateFile, stateRelative) => {
    if (!existsSync(stateFile)) fail('没有可归档的 Execution State', 'EXECUTION_STATE_MISSING');
    const state = readJsonFile(resolveSafePath(repo, stateRelative, 'Execution State'), 'Execution State');
    if (state.schemaVersion !== STATE_SCHEMA_VERSION || !Number.isSafeInteger(state.revision) || !Array.isArray(state.units)) fail('待归档 Execution State 结构无效');
    if (state.workItemId !== work.workItemId) fail('Execution State.workItemId 与当前 Work Item 不一致，拒绝归档', 'STALE_EXECUTION_STATE');
    const root = evidenceRootOf(work);
    const historyDirectory = `${root}/history`;
    const historyAbsolute = ensureSafeDirectory(repo, historyDirectory, 'Execution State history 目录');
    const time = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const baseName = `execution-state-${time}-r${state.revision}`;
    let index = 0;
    let archiveName;
    let archiveAbsolute;
    do {
      archiveName = `${baseName}${index ? `-${index}` : ''}.json`;
      archiveAbsolute = resolve(historyAbsolute, archiveName);
      index += 1;
    } while (existsSync(archiveAbsolute));
    capturePrevious?.(structuredClone(state));
    renameSync(stateFile, archiveAbsolute);
    return `${historyDirectory}/${archiveName}`;
  });
}

/** 工作项提交失败时，在同一执行状态锁内做 CAS 恢复，不能覆盖其他单元的新结果。 */
export function restoreExecutionMutation(repo, work, { expected = null, previous = null, archivedPath = null }) {
  return withStateLock(repo, work, (stateFile, stateRelative) => {
    if (archivedPath) {
      const normalized = posixPath(archivedPath, '归档恢复路径');
      if (!normalized.startsWith(`${evidenceRootOf(work)}/history/`)) fail('恢复来源必须位于当前 evidenceRoot/history');
      if (existsSync(stateFile)) fail('执行状态已被其他写入者创建，拒绝覆盖恢复', 'STALE_EXECUTION_STATE');
      const archived = resolveSafePath(repo, normalized, '归档恢复路径');
      const actual = readJsonFile(archived, '归档执行状态');
      if (actual.workItemId !== work.workItemId || !isDeepStrictEqual(actual, previous)) fail('归档状态已变化，拒绝以旧快照恢复', 'STALE_EXECUTION_STATE');
      renameSync(archived, stateFile);
      return;
    }
    const current = readJsonFile(resolveSafePath(repo, stateRelative, '执行状态恢复目标'), 'Execution State');
    if (current.workItemId !== work.workItemId || !isDeepStrictEqual(current, expected)) fail('执行状态已变化，拒绝以旧快照恢复', 'STALE_EXECUTION_STATE');
    if (previous !== null) {
      if (previous.workItemId !== work.workItemId) fail('恢复快照不属于当前工作项');
      writeJsonAtomic(stateFile, previous);
    } else rmSync(stateFile);
  });
}
