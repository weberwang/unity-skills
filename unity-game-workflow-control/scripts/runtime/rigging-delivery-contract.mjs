/** 绑定正式 2D 角色资产报告与独立 Editor PlayMode 回归证据。 */

import { readFileSync, statSync } from 'node:fs';
import { canonicalizePosixPath } from './io.mjs';
import { readArtEvidenceFile } from './art-experience-contract.mjs';
import { isValidIsoTimestamp } from './timestamp-contract.mjs';

/** 角色交付所需的岗位身份。 */
export const RIGGING_DELIVERY_ROLES = Object.freeze(['technicalArt', 'rigging', 'visualAssets', 'gameplay', 'qa']);

/** 角色运行回归必须覆盖的最低场景。 */
export const REQUIRED_RIGGING_RUNTIME_CASES = Object.freeze(['runtime-instantiation', 'animation-playback']);

/** 角色工程报告必须包含的关键检查。 */
const REQUIRED_ASSET_CHECKS = Object.freeze([
  'prefab-load',
  'sprite-skin-presence',
  'animator-presence',
  'animator-controller',
  'asset-source-evidence',
  'engineering-only-scope',
]);

/** 需要开放骨骼资产交付的状态。 */
export const RIGGING_DELIVERY_STATES = Object.freeze(['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE']);

/** 将机器角色键映射为交接说明中的正式岗位名称。 */
const ROLE_LABELS = Object.freeze({
  technicalArt: '2D 动画技术美术',
  rigging: '2D 骨骼动画',
  visualAssets: '视觉资源',
  gameplay: '玩法实现',
  qa: '独立 QA',
});

/** 判断值是否为非空字符串。 */
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 判断值是否为不含数组的对象。 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 按控制器已有语义读取字符串、布尔或 status 对象形式的 Unity 证据。 */
function readEvidenceStatus(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  if (typeof value === 'string') return value;
  if (isRecord(value)) return value.status;
  return 'NOT_RUN';
}

/** 校验对象是否只包含声明字段，并记录易读的合同错误。 */
function checkObject(value, allowed, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} 必须为对象`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${label} 含未声明字段 ${key}`);
  }
  return true;
}

/** 确认字符串数组非空、值有效且按场景要求不重复。 */
function checkStringArray(value, label, errors, options = {}) {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0) || value.some((item) => !hasText(item))) {
    errors.push(`${label} 必须为${options.nonEmpty ? '非空' : ''}字符串数组`);
    return false;
  }
  if (options.unique && new Set(value).size !== value.length) errors.push(`${label} 不能重复`);
  return true;
}

/** 检查项目内 POSIX 路径格式，绝不把输入路径拼入诊断。 */
function isSafeProjectPath(value, options = {}) {
  if (!hasText(value)) return false;
  try {
    const canonical = canonicalizePosixPath(value, '项目路径');
    if (canonical !== value) return false;
    if (options.prefix && !canonical.startsWith(options.prefix)) return false;
    if (options.extension && !canonical.endsWith(options.extension)) return false;
    return true;
  } catch {
    return false;
  }
}

/** 正式角色 Prefab 不能落在公共检查工具的临时夹具目录。 */
function isSafeRiggingPrefabPath(value) {
  return isSafeProjectPath(value, { prefix: 'Assets/', extension: '.prefab' }) &&
    !value.split('/').some((segment) => segment.startsWith('__UwtRiggingTests_'));
}

/** 验证 Work Item 中 2D 骨骼资产交付责任与正式角色清单。 */
export function validateRiggingDeliveryShape(delivery) {
  const errors = [];
  if (!checkObject(delivery, ['owners', 'characters'], 'riggingDelivery', errors)) return errors;

  if (checkObject(delivery.owners, RIGGING_DELIVERY_ROLES, 'riggingDelivery.owners', errors)) {
    for (const role of RIGGING_DELIVERY_ROLES) {
      if (!hasText(delivery.owners[role])) errors.push(`riggingDelivery.owners.${role} 必须为非空负责人 ID`);
    }
    const producers = RIGGING_DELIVERY_ROLES.filter((role) => role !== 'qa').map((role) => delivery.owners[role]);
    if (hasText(delivery.owners.qa) && producers.includes(delivery.owners.qa)) errors.push('riggingDelivery.owners.qa 必须独立于生产负责人');
  }

  if (!Array.isArray(delivery.characters) || delivery.characters.length === 0) {
    errors.push('riggingDelivery.characters 必须为非空角色数组');
    return errors;
  }

  const ids = new Set();
  const paths = new Set();
  const guids = new Set();
  for (const [index, character] of delivery.characters.entries()) {
    const label = `riggingDelivery.characters[${index}]`;
    if (!checkObject(character, ['characterId', 'prefabPath', 'prefabGuid', 'sourceRevision', 'updatedAt', 'requiredRuntimeCases'], label, errors)) continue;
    if (!hasText(character.characterId)) errors.push(`${label}.characterId 必须为非空字符串`);
    else if (ids.has(character.characterId)) errors.push('骨骼资产 characterId 不能重复');
    else ids.add(character.characterId);
    if (!isSafeRiggingPrefabPath(character.prefabPath)) errors.push(`${label}.prefabPath 必须为正式 Assets .prefab，不能使用骨骼检查夹具`);
    else if (paths.has(character.prefabPath)) errors.push('骨骼资产 prefabPath 不能重复');
    else paths.add(character.prefabPath);
    if (!/^[0-9a-f]{32}$/.test(character.prefabGuid ?? '')) errors.push(`${label}.prefabGuid 必须是 32 位小写十六进制 GUID`);
    else if (guids.has(character.prefabGuid)) errors.push('骨骼资产 prefabGuid 不能重复');
    else guids.add(character.prefabGuid);
    if (!hasText(character.sourceRevision)) errors.push(`${label}.sourceRevision 必须为非空版本标识`);
    if (!isValidIsoTimestamp(character.updatedAt)) errors.push(`${label}.updatedAt 必须为有效带时区时间`);
    if (checkStringArray(character.requiredRuntimeCases, `${label}.requiredRuntimeCases`, errors, { nonEmpty: true, unique: true })) {
      for (const required of REQUIRED_RIGGING_RUNTIME_CASES) {
        if (!character.requiredRuntimeCases.includes(required)) errors.push(`${label}.requiredRuntimeCases 缺少 ${required}`);
      }
    }
  }
  return errors;
}

/** 验证 Work Item 的岗位清单，并要求目标骨骼资产任务不可漏标。 */
export function validateRiggingDeliveryWorkItem(work, actionType) {
  if (work.riggingDelivery === undefined) {
    return work.domain === '2d-rigging' && actionType === 'unity-asset-change'
      ? ['2d-rigging 的 unity-asset-change 工作项必须声明 riggingDelivery']
      : [];
  }
  return validateRiggingDeliveryShape(work.riggingDelivery);
}

/** 验证 Evidence Manifest 中的角色报告、QA 复核与回归结果结构。 */
export function validateRiggingDeliveryEvidenceShape(value) {
  const errors = [];
  if (!checkObject(value, ['characters'], 'Evidence Manifest.riggingDelivery', errors)) return errors;
  if (!Array.isArray(value.characters) || value.characters.length === 0) {
    errors.push('Evidence Manifest.riggingDelivery.characters 必须为非空数组');
    return errors;
  }

  const seen = new Set();
  for (const [index, character] of value.characters.entries()) {
    const label = `Evidence Manifest.riggingDelivery.characters[${index}]`;
    const fields = ['characterId', 'prefabPath', 'prefabGuid', 'sourceRevision', 'assetReportPath', 'reviewedBy', 'reviewedAt', 'regression', 'findings'];
    if (!checkObject(character, fields, label, errors)) continue;
    for (const field of fields.slice(0, 8)) {
      if (field === 'regression') continue;
      if (!hasText(character[field])) errors.push(`${label}.${field} 必须为非空字符串`);
    }
    if (!hasText(character.characterId) || seen.has(character.characterId)) errors.push(`${label}.characterId 缺失或重复`);
    else seen.add(character.characterId);
    if (!isSafeRiggingPrefabPath(character.prefabPath)) errors.push(`${label}.prefabPath 必须为正式 Assets .prefab，不能使用骨骼检查夹具`);
    if (!/^[0-9a-f]{32}$/.test(character.prefabGuid ?? '')) errors.push(`${label}.prefabGuid 无效`);
    if (!isSafeProjectPath(character.assetReportPath, { extension: '.json' })) errors.push(`${label}.assetReportPath 必须为项目内 JSON 路径`);
    if (!isValidIsoTimestamp(character.reviewedAt)) errors.push(`${label}.reviewedAt 必须为有效带时区时间`);
    errors.push(...validateRegressionShape(character.regression, `${label}.regression`));
    if (character.findings !== undefined) errors.push(...validateFindingsShape(character.findings, `${label}.findings`));
  }
  return errors;
}

/** 校验角色级回归记录的场景标识、版本和逐项结果。 */
function validateRegressionShape(regression, label) {
  const errors = [];
  const fields = ['scope', 'executedIn', 'status', 'editorVersion', 'animationPackageVersion', 'completedAt', 'rawReportPath', 'cases'];
  if (!checkObject(regression, fields, label, errors)) return errors;
  if (regression.scope !== 'project-character') errors.push(`${label}.scope 必须为 project-character`);
  if (regression.executedIn !== 'EditorPlayMode') errors.push(`${label}.executedIn 必须为 EditorPlayMode`);
  if (!['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(regression.status)) errors.push(`${label}.status 无效`);
  for (const field of ['editorVersion', 'animationPackageVersion']) {
    if (!hasText(regression[field])) errors.push(`${label}.${field} 必须为非空实际版本`);
  }
  if (!isValidIsoTimestamp(regression.completedAt)) errors.push(`${label}.completedAt 必须为有效带时区时间`);
  if (!isSafeProjectPath(regression.rawReportPath, { extension: '.json' })) errors.push(`${label}.rawReportPath 必须为项目内 JSON 路径`);
  if (!Array.isArray(regression.cases) || regression.cases.length === 0) {
    errors.push(`${label}.cases 必须为非空数组`);
    return errors;
  }
  const ids = new Set();
  for (const [index, item] of regression.cases.entries()) {
    const itemLabel = `${label}.cases[${index}]`;
    if (!checkObject(item, ['id', 'testName', 'status'], itemLabel, errors)) continue;
    if (!hasText(item.id) || ids.has(item.id)) errors.push(`${itemLabel}.id 缺失或重复`);
    else ids.add(item.id);
    if (!hasText(item.testName)) errors.push(`${itemLabel}.testName 必须为非空字符串`);
    if (!['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(item.status)) errors.push(`${itemLabel}.status 无效`);
  }
  return errors;
}

/** 校验可选的岗位责任诊断；诊断会阻止放行而不能豁免报告失败。 */
function validateFindingsShape(findings, label) {
  const errors = [];
  if (!Array.isArray(findings)) return [`${label} 必须为数组`];
  for (const [index, finding] of findings.entries()) {
    const itemLabel = `${label}[${index}]`;
    if (!checkObject(finding, ['role', 'reason', 'affectedPaths'], itemLabel, errors)) continue;
    if (!RIGGING_DELIVERY_ROLES.includes(finding.role)) errors.push(`${itemLabel}.role 无效`);
    if (!hasText(finding.reason)) errors.push(`${itemLabel}.reason 必须为非空说明`);
    if (!Array.isArray(finding.affectedPaths) || finding.affectedPaths.length === 0 || finding.affectedPaths.some((path) => !isSafeProjectPath(path))) {
      errors.push(`${itemLabel}.affectedPaths 必须是非空安全项目路径数组`);
    } else if (new Set(finding.affectedPaths).size !== finding.affectedPaths.length) {
      errors.push(`${itemLabel}.affectedPaths 不能重复`);
    }
  }
  return errors;
}

/** 判断当前 Work Item 是否必须声明正式骨骼资产交付清单。 */
export function requiresRiggingDelivery(work) {
  const actionType = work?.pendingApproval?.actionType ?? work?.actionType ?? 'unity-inspect';
  return work?.domain === '2d-rigging' && actionType === 'unity-asset-change';
}

/** 评估交付证据并给出阻断与岗位派发建议，不写回 Work Item。 */
export function evaluateRiggingDelivery({ work, evidence, repo }) {
  const delivery = work?.riggingDelivery;
  if (!delivery) return null;

  const blockers = [];
  const repairs = [];
  const evidenceCharacters = new Map();
  const addBlocker = (code, message) => {
    const safeMessage = sanitizeReason(message);
    if (!blockers.some((item) => item.code === code && item.message === safeMessage)) blockers.push({ code, message: safeMessage });
  };
  const addRepair = (character, role, disposition, reason, affectedPaths = []) => {
    const paths = [...new Set(affectedPaths.filter((path) => isSafeProjectPath(path)))];
    if (paths.length === 0) paths.push(character.prefabPath);
    const key = `${character.characterId}|${role}|${disposition}|${reason}|${paths.join('|')}`;
    if (repairs.some((item) => item._key === key)) return;
    repairs.push({
      _key: key,
      characterId: character.characterId,
      role,
      assignee: delivery.owners[role],
      disposition,
      reason: sanitizeReason(reason),
      affectedPaths: paths,
    });
  };
  const addQaRevalidation = (character, reason, paths = []) => addRepair(character, 'qa', 'revalidate', reason, paths);

  if (!evidence || evidence.riggingDelivery === undefined) {
    for (const character of delivery.characters) addQaRevalidation(character, '缺少绑定当前角色的自动检查与运行回归证据');
    addBlocker('RIGGING_DELIVERY_EVIDENCE_MISSING', '缺少正式角色骨骼资产检查与 Editor PlayMode 回归证据');
  } else {
    const shapeErrors = validateRiggingDeliveryEvidenceShape(evidence.riggingDelivery);
    if (shapeErrors.length) {
      for (const character of delivery.characters) addQaRevalidation(character, '角色交付证据格式无效，需重新采集并复核');
      addBlocker('RIGGING_DELIVERY_EVIDENCE_INVALID', '正式角色骨骼资产交付证据格式无效');
    } else {
      if (readEvidenceStatus(evidence.unityEvidence?.playMode) !== 'PASS') {
        for (const character of delivery.characters) addQaRevalidation(character, '现有 F3 的 unityEvidence.playMode 缺失或未通过');
        addBlocker('RIGGING_UNITY_PLAYMODE_REQUIRED', '骨骼资产交付要求现有 unityEvidence.playMode 为 PASS');
      }
      for (const item of evidence.riggingDelivery.characters) evidenceCharacters.set(item.characterId, item);
      const expectedIds = new Set(delivery.characters.map((item) => item.characterId));
      const exactSet = expectedIds.size === evidenceCharacters.size && [...expectedIds].every((id) => evidenceCharacters.has(id));
      if (!exactSet) {
        for (const character of delivery.characters) addQaRevalidation(character, 'Evidence Manifest 角色集合与当前 Work Item 不完全一致');
        addBlocker('RIGGING_DELIVERY_CHARACTER_SET', '骨骼交付证据必须逐项绑定当前 Work Item 的角色集合');
      }

      for (const character of delivery.characters) {
        const record = evidenceCharacters.get(character.characterId);
        if (!record) continue;
        const bindingErrors = validateCharacterBinding(record, character, delivery);
        if (bindingErrors.length) {
          addQaRevalidation(character, '角色身份、版本或独立 QA 复核记录未绑定当前候选');
          addBlocker('RIGGING_DELIVERY_BINDING', '骨骼交付证据与当前角色版本或独立 QA 身份不匹配');
          continue;
        }

        const asset = inspectAssetReport(repo, record, work, character);
        if (!asset.valid) {
          addQaRevalidation(character, '工程报告或来源文件证据缺失、无效或已过期');
          addBlocker('RIGGING_ASSET_REPORT_INVALID', '角色骨骼资产工程报告或来源资源证据无效或已过期');
        } else if (asset.status !== 'PASS') {
          const finding = findCharacterFinding(record);
          const role = finding?.role ?? (asset.failedToolCheck ? 'technicalArt' : 'rigging');
          const label = finding?.reason ?? (asset.failedToolCheck ? '公共骨骼检查工具存在失败项' : '角色骨骼资产工程检查存在失败项');
          addRepair(character, role, role === 'qa' ? 'revalidate' : 'repair', label, finding?.affectedPaths ?? asset.failedPaths);
          addBlocker('RIGGING_ASSET_REPORT_FAILED', '角色骨骼资产工程检查存在失败项');
        }

        const runtime = inspectRuntimeReport(repo, record, character, asset);
        if (!runtime.valid) {
          addQaRevalidation(character, '角色级 Editor PlayMode 回归证据缺失、无效或与正式测试结果不一致');
          addBlocker('RIGGING_RUNTIME_REPORT_INVALID', '角色级 Editor PlayMode 回归证据缺失、无效或不完整');
        } else if (runtime.status !== 'PASS') {
          const finding = findCharacterFinding(record);
          const role = finding?.role ?? 'rigging';
          const reason = finding?.reason ?? '角色级运行回归存在失败或未通过项';
          addRepair(character, role, role === 'qa' ? 'revalidate' : 'repair', reason, finding?.affectedPaths ?? [character.prefabPath]);
          addBlocker('RIGGING_RUNTIME_REPORT_FAILED', '角色级 Editor PlayMode 回归未通过');
        }
      }

      for (const character of delivery.characters) {
        const record = evidenceCharacters.get(character.characterId);
        if (!record || !Array.isArray(record.findings) || record.findings.length === 0) continue;
        for (const finding of record.findings) {
          // finding 已嵌在角色记录下，受影响路径仅作诊断，不能据此扩派到其他角色。
          const disposition = finding.role === 'qa' ? 'revalidate' : 'repair';
          addRepair(character, finding.role, disposition, finding.reason, finding.affectedPaths);
          addBlocker('RIGGING_DELIVERY_FINDING', 'Evidence Manifest 仍记录未闭环的岗位问题');
        }
      }
    }
  }

  for (const repair of repairs) delete repair._key;
  return {
    handoffAllowed: blockers.length === 0 && repairs.length === 0,
    repairs,
    blockers,
  };
}

/** 提取在当前角色正式 Prefab 或递归输入资源上登记的责任诊断。 */
function findCharacterFinding(record) {
  return record.findings?.[0] ?? null;
}

/** 在交付态生成当前门禁结果，并把返修建议转为稳定阻断记录。 */
export function inspectRiggingDelivery({ work, evidence, repo }) {
  if (!RIGGING_DELIVERY_STATES.includes(work.globalState) || !work.riggingDelivery) return null;
  const result = evaluateRiggingDelivery({ work, evidence, repo });
  const next = riggingDeliveryNext(result);
  return { ...result, blockers: result.blockers.map((item) => ({ ...item, next })) };
}

/** 直接迁移也要重新读取证据并校验目标交付态，不能依赖先前的 inspect。 */
export function assertRiggingDeliveryHandoff(inspection, target, fail) {
  if (!RIGGING_DELIVERY_STATES.includes(target) || !inspection.work.riggingDelivery) return;
  const result = evaluateRiggingDelivery({ work: inspection.work, evidence: inspection.evidence, repo: inspection.repo });
  if (result.handoffAllowed) return;
  const first = result.blockers[0];
  fail(first?.message ?? '正式角色骨骼资产交付门禁未通过', 2, {
    errorCode: first?.code ?? 'RIGGING_DELIVERY_BLOCKED',
    next: riggingDeliveryNext(result),
  });
}

/** 构造不含主机路径的岗位退修或 QA 补证指引。 */
function riggingDeliveryNext(result) {
  if (!result.repairs.length) return `交接前由独立 QA（${ROLE_LABELS.qa}）确认角色证据闭环`;
  const routes = [...new Set(result.repairs.map((item) => `${ROLE_LABELS[item.role]}${item.disposition === 'repair' ? '修复' : '补证复验'}`))];
  const routeText = routes.join('、');
  return result.repairs.some((item) => item.disposition === 'repair')
    ? `先按岗位完成${routeText}，再由独立 QA（${ROLE_LABELS.qa}）复验后交接`
    : `由独立 QA（${ROLE_LABELS.qa}）补齐角色证据并重新复验后交接`;
}

/** 仅将工作流摘要字段写入稳定 CLI metadata。 */
export function summarizeRiggingDelivery(result) {
  return result ? { handoffAllowed: result.handoffAllowed, repairs: result.repairs } : null;
}

/** 绑定报告条目到当前 Work Item，并保证复核人确实独立。 */
function validateCharacterBinding(record, character, delivery) {
  const errors = [];
  for (const field of ['characterId', 'prefabPath', 'prefabGuid', 'sourceRevision']) {
    if (record[field] !== character[field]) errors.push(field);
  }
  if (record.reviewedBy !== delivery.owners.qa || record.reviewedBy === delivery.owners.technicalArt ||
      record.reviewedBy === delivery.owners.rigging || record.reviewedBy === delivery.owners.visualAssets ||
      record.reviewedBy === delivery.owners.gameplay) errors.push('reviewedBy');
  if (Date.parse(record.reviewedAt) < Date.parse(character.updatedAt)) errors.push('reviewedAt');
  return errors;
}

/** 读取只读工程报告，验证真实 Prefab 与所有 Assets 依赖的 GUID 和修改时间。 */
function inspectAssetReport(repo, record, work, character) {
  try {
    const report = readProjectJson(repo, record.assetReportPath);
    if (!isRecord(report) || report.schemaVersion !== '1.0' || report.taskId !== work.workItemId ||
        report.projectId !== work.projectId || report.sourceRevision !== character.sourceRevision ||
        !isValidIsoTimestamp(report.generatedAtUtc) || !['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(report.status)) return invalidAssetReport();
    const reportTime = Date.parse(report.generatedAtUtc);
    const reviewedTime = Date.parse(record.reviewedAt);
    const updatedTime = Date.parse(character.updatedAt);
    if (reportTime < updatedTime || reportTime > reviewedTime) return invalidAssetReport();
    if (!Array.isArray(report.checks) || report.checks.length === 0) return invalidAssetReport();
    const ids = new Set();
    for (const check of report.checks) {
      if (!isRecord(check) || !hasText(check.id) || ids.has(check.id) || !['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].includes(check.status) || !hasText(check.environment)) return invalidAssetReport();
      ids.add(check.id);
    }
    if (REQUIRED_ASSET_CHECKS.some((id) => !ids.has(id))) return invalidAssetReport();
    const environments = new Set(report.checks.map((check) => check.environment));
    if (environments.size !== 1) return invalidAssetReport();
    const environment = parseUnityEnvironment([...environments][0]);
    if (!environment) return invalidAssetReport();
    const evidence = report.evidence;
    if (!Array.isArray(evidence)) return invalidAssetReport();
    const prefabEntries = evidence.filter((item) => item?.type === 'rigging-prefab');
    const dependencies = evidence.filter((item) => item?.type === 'rigging-dependency');
    if (prefabEntries.length !== 1 || dependencies.length === 0) return invalidAssetReport();
    const prefab = prefabEntries[0];
    if (!validSourceEvidence(prefab, character, 'rigging-prefab') || !isSafeRiggingPrefabPath(prefab.path) || prefab.path !== character.prefabPath || prefab.subjectId !== character.prefabGuid) return invalidAssetReport();
    const seenPaths = new Set([character.prefabPath]);
    const sourcePaths = [character.prefabPath];
    let latestAssetTime = 0;
    latestAssetTime = Math.max(latestAssetTime, validateSourceFile(repo, prefab.path, prefab.subjectId, reportTime));
    for (const dependency of dependencies) {
      if (!validSourceEvidence(dependency, character, 'rigging-dependency') ||
          !isSafeProjectPath(dependency.path, { prefix: 'Assets/' }) || seenPaths.has(dependency.path)) return invalidAssetReport();
      seenPaths.add(dependency.path);
      sourcePaths.push(dependency.path);
      latestAssetTime = Math.max(latestAssetTime, validateSourceFile(repo, dependency.path, dependency.subjectId, reportTime));
    }
    if (latestAssetTime > reportTime || latestAssetTime > Date.parse(record.regression.completedAt)) return invalidAssetReport();
    const failedChecks = report.checks.filter((check) => check.status === 'FAIL');
    const nonPassingChecks = report.checks.filter((check) => check.status !== 'PASS');
    if ((report.status === 'PASS' && nonPassingChecks.length > 0) ||
        (report.status === 'FAIL' && failedChecks.length === 0) ||
        ['BLOCKED', 'NOT_RUN'].includes(report.status)) return invalidAssetReport();
    if (report.status === 'FAIL') {
      const failedToolCheck = failedChecks.some(isToolFailure);
      const failedPaths = failedChecks.flatMap((check) => check.evidence ?? []).map((item) => item?.path).filter(isSafeProjectPath);
      return { valid: true, status: report.status, environment, sourcePaths, failedToolCheck, failedPaths };
    }
    return { valid: true, status: 'PASS', environment, sourcePaths, failedToolCheck: false, failedPaths: [] };
  } catch {
    return invalidAssetReport();
  }
}

/** 创建不含路径细节的无效工程报告结果。 */
function invalidAssetReport() {
  return { valid: false, status: 'INVALID', environment: null, sourcePaths: [], failedToolCheck: false, failedPaths: [] };
}

/** 检查报告证据是否绑定当前的资源修订。 */
function validSourceEvidence(item, character, expectedType) {
  const safePath = expectedType === 'rigging-prefab'
    ? isSafeRiggingPrefabPath(item?.path)
    : isSafeProjectPath(item?.path, { prefix: 'Assets/' });
  return isRecord(item) && item.type === expectedType && safePath &&
    /^[0-9a-f]{32}$/.test(item.subjectId ?? '') && item.subjectVersion === character.sourceRevision &&
    item.sourceRevision === character.sourceRevision;
}

/** 读取真实项目文件及 Unity .meta，返回两者中较晚的修改时间。 */
function validateSourceFile(repo, path, expectedGuid, reportTime) {
  const assetPath = readProjectFile(repo, path);
  const metaPath = readProjectFile(repo, `${path}.meta`);
  const meta = readFileSync(metaPath, 'utf8');
  const match = /^guid: ([0-9a-f]{32})$/m.exec(meta);
  if (!match || match[1] !== expectedGuid) throw new Error('源资源 GUID 无效');
  const latest = Math.max(statSync(assetPath).mtimeMs, statSync(metaPath).mtimeMs);
  if (latest > reportTime) throw new Error('源资源晚于工程报告生成时间');
  return latest;
}

/** 读取安全的项目内 JSON 文件；路径规范错误统一转换成脱敏异常。 */
function readProjectJson(repo, path) {
  const file = readProjectFile(repo, path, '.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 校验路径合同后复用现有拒绝链接与越界的只读证据读取器。 */
function readProjectFile(repo, path, extension = '') {
  if (!isSafeProjectPath(path, { extension })) throw new Error('项目证据路径无效');
  return readArtEvidenceFile(repo, path);
}

/** 解析报告中的真实 Unity Editor 与 Animation 包版本。 */
function parseUnityEnvironment(value) {
  const match = /^Unity Editor ([^;]+); com\.unity\.2d\.animation ([^;\s]+)$/.exec(value ?? '');
  if (!match) return null;
  return { editorVersion: match[1], animationPackageVersion: match[2] };
}

/** 从检查类别或稳定 ID 判断是否为公共工具本身的失败。 */
function isToolFailure(check) {
  const id = String(check?.id ?? '').toLowerCase();
  const category = String(check?.category ?? '').toLowerCase();
  return ['tool', 'tooling', 'infrastructure'].includes(category) || /^(tool|pipeline|validator)-/.test(id);
}

/** 验证 Pipeline test_status 原始信封以及实际 NUnit 结果集合。 */
function inspectRuntimeReport(repo, record, character, asset) {
  try {
    const regression = record.regression;
    const outer = readProjectJson(repo, regression.rawReportPath);
    const result = parsePipelineTestResult(outer);
    if (!result.valid) return { valid: false, status: 'INVALID' };
    const completedTime = Date.parse(regression.completedAt);
    const updatedTime = Date.parse(character.updatedAt);
    if (completedTime < updatedTime || Date.parse(record.reviewedAt) < completedTime) return { valid: false, status: 'INVALID' };
    if (!asset.environment || regression.editorVersion !== asset.environment.editorVersion ||
        regression.animationPackageVersion !== asset.environment.animationPackageVersion) return { valid: false, status: 'INVALID' };

    if (regression.status === 'FAIL' && result.failed > 0) {
      const failedNames = new Set(result.results.filter((item) => item.Status === 'Failed').map((item) => item.FullName));
      const recordedFailure = regression.cases.some((item) => character.requiredRuntimeCases.includes(item.id) &&
        item.status === 'FAIL' && failedNames.has(item.testName) && !isRiggingFixtureTest(item.testName));
      return recordedFailure ? { valid: true, status: 'FAIL' } : { valid: false, status: 'INVALID' };
    }
    if (regression.status !== 'PASS' || !result.passed) return { valid: false, status: 'INVALID' };
    if (result.results.some((item) => item.Status !== 'Passed' || !hasText(item.FullName))) return { valid: false, status: 'INVALID' };
    const actualNames = new Set(result.results.map((item) => item.FullName));
    for (const required of character.requiredRuntimeCases) {
      const matches = regression.cases.filter((item) => item.id === required);
      if (matches.length !== 1 || matches[0].status !== 'PASS' || !actualNames.has(matches[0].testName) || isRiggingFixtureTest(matches[0].testName)) {
        return { valid: false, status: 'INVALID' };
      }
    }
    if (regression.cases.some((item) => item.status !== 'PASS' || !actualNames.has(item.testName) || isRiggingFixtureTest(item.testName))) {
      return { valid: false, status: 'INVALID' };
    }
    return { valid: true, status: 'PASS' };
  } catch {
    return { valid: false, status: 'INVALID' };
  }
}

/** 解析 Pipeline 外层 data.result，允许其为对象或 JSON 字符串。 */
function parsePipelineTestResult(outer) {
  if (!isRecord(outer) || outer.success !== true || !isRecord(outer.data) || outer.data.command !== 'test_status') return { valid: false };
  let result = outer.data.result;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return { valid: false }; }
  }
  if (!isRecord(result) || result.status !== 'completed' || !isRecord(result.summary) || !Array.isArray(result.results)) return { valid: false };
  const { total, passed, failed, skipped, inconclusive } = result.summary;
  const counts = [total, passed, failed, skipped, inconclusive];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0) || total === 0 ||
      passed + failed + skipped + inconclusive !== total || result.results.length !== total) return { valid: false };
  const actualCounts = { Passed: 0, Failed: 0, Skipped: 0, Inconclusive: 0 };
  for (const item of result.results) {
    if (!isRecord(item) || !hasText(item.FullName) || !Object.hasOwn(actualCounts, item.Status)) return { valid: false };
    actualCounts[item.Status] += 1;
  }
  if (actualCounts.Passed !== passed || actualCounts.Failed !== failed || actualCounts.Skipped !== skipped || actualCounts.Inconclusive !== inconclusive) return { valid: false };
  return { valid: true, passed, failed, results: result.results };
}

/** 排除仓库自带骨骼测试夹具，避免其结果冒充当前项目角色回归。 */
function isRiggingFixtureTest(testName) {
  return testName === 'Project.UnityWorkflow.Tests.Rigging' || testName.startsWith('Project.UnityWorkflow.Tests.Rigging.');
}

/** 将人工责任说明中的绝对路径替换为固定标记，保护共享门禁输出。 */
function sanitizeReason(value) {
  return String(value)
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>|]*/g, '[已隐藏绝对路径]')
    .replace(/\\\\[^\r\n"'<>|]*/g, '[已隐藏绝对路径]')
    // 允许中文/英文标点紧邻绝对路径，同时排除 URL 中的双斜线。
    .replace(/(^|[^A-Za-z0-9_\/])\/(?!\/)[^\r\n"'<>|)\]）】]*/g, '$1[已隐藏绝对路径]');
}
