import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isValidIsoTimestamp } from './timestamp-contract.mjs';

/** 人工质量项与动态情境的固定身份，机器仅检查记录而不解释画面。 */
export const ART_QUALITY_ITEMS = Object.freeze(['themeFit', 'audienceFit', 'gameplayReadability', 'viewingComfort', 'artCompletion']);
export const ART_SCENARIOS = Object.freeze(['normal-play', 'repeated-feedback', 'event-peak', 'overlap-peak']);

/** 判断结构化记录是否具有可审计内容。 */
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** 判断身份或人工说明是否为空。 */
function text(value) { return typeof value === 'string' && value.trim().length > 0; }

/** 只回读项目内普通文件，逐级拒绝链接；摘要不参与验收。 */
export function readArtEvidenceFile(repo, path, json = false) {
  if (!text(path) || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes('\\')) throw new Error('证据必须使用项目相对路径');
  const root = realpathSync(resolve(repo));
  const target = resolve(root, path);
  const local = relative(root, target);
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('证据路径越出项目');
  let cursor = root;
  for (const part of local.split(sep)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error('证据路径不能经过链接');
  }
  if (!statSync(target).isFile() || statSync(target).size === 0) throw new Error('证据文件必须存在且非空');
  return json ? JSON.parse(readFileSync(target, 'utf8')) : target;
}

/** 严格检查声明字段，避免误拼字段成为事实或绕过适用性。 */
function shape(value, keys, label, errors) {
  if (!record(value)) { errors.push(`${label} 必须是对象`); return false; }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${label} 含未声明字段 ${key}`);
  return true;
}

/** 核对人工五项结果；未验证或失败不能由偏好选图抵消。 */
export function validateArtQualityResults(results, requirePass = false) {
  const errors = [];
  if (!shape(results, ART_QUALITY_ITEMS, 'qualityResults', errors)) return errors;
  for (const key of ART_QUALITY_ITEMS) {
    const item = results[key];
    if (!shape(item, ['status', 'reason'], `qualityResults.${key}`, errors)) continue;
    if (!['PASS', 'FAIL', 'NOT_RUN'].includes(item.status) || !text(item.reason)) errors.push(`${key} 缺少实际人工结果或理由`);
    if (requirePass && item.status !== 'PASS') errors.push(`${key} 人工质量未通过`);
  }
  return errors;
}

/** 验证美术 brief 的必要事实，不指定通用刺激或医学阈值。 */
export function validateArtBrief(brief) {
  const errors = [];
  if (!shape(brief, ['schemaVersion', 'projectId', 'theme', 'audience', 'coreLoop', 'experienceGoals', 'viewingContext', 'visualHierarchy', 'intensityBudget'], 'artBrief', errors)) return errors;
  if (brief.schemaVersion !== '1.0') errors.push('artBrief.schemaVersion 无效');
  for (const key of ['projectId', 'theme', 'coreLoop', 'viewingContext']) if (!text(brief[key])) errors.push(`artBrief.${key} 缺少事实`);
  if (!shape(brief.audience, ['facts', 'assumptions'], 'artBrief.audience', errors)) return errors;
  for (const key of ['facts', 'assumptions']) if (!Array.isArray(brief.audience[key]) || brief.audience[key].some((item) => !text(item))) errors.push(`audience.${key} 必须明确事实与假设`);
  for (const key of ['experienceGoals', 'visualHierarchy']) if (!Array.isArray(brief[key]) || brief[key].length === 0 || brief[key].some((item) => !text(item))) errors.push(`artBrief.${key} 必须是非空事实数组`);
  if (shape(brief.intensityBudget, ['normal', 'operation', 'peak'], 'artBrief.intensityBudget', errors)) {
    for (const key of ['normal', 'operation', 'peak']) if (!text(brief.intensityBudget[key])) errors.push(`intensityBudget.${key} 缺少强度、频率、叠加与收尾约束`);
  }
  return errors;
}

/** 检查 V4 人工美术验收与当前工作项、候选及真实动态文件绑定。 */
export function validateArtExperienceAcceptance(evidence, work, repo) {
  const errors = [];
  const visible = ['SCENE', 'DISPLAY_LAYER'].includes(work.workItemType);
  if (!visible || evidence.visualStage !== 'V4' || evidence.verdict !== 'PASS') return errors;
  if (!text(evidence.candidateId) || !text(evidence.candidateVersion)) errors.push('V4 PASS 必须明确 candidateId 和 candidateVersion');
  let acceptance;
  try { acceptance = readArtEvidenceFile(repo, evidence.artExperienceAcceptanceRef, true); }
  catch { return [...errors, 'V4 PASS 缺少可读取的 artExperienceAcceptanceRef 人工美术验收材料']; }
  if (!shape(acceptance, ['schemaVersion', 'workItemId', 'candidateId', 'candidateVersion', 'sceneId', 'displayLayerId', 'artBriefRef', 'qualityResults', 'scenarios', 'confirmedBy', 'confirmedAt', 'userMessageRef', 'userText'], 'artExperienceAcceptance', errors)) return errors;
  if (acceptance.schemaVersion !== '1.0') errors.push('美术验收 schemaVersion 无效');
  for (const key of ['workItemId', 'candidateId', 'candidateVersion']) if (!text(acceptance[key]) || acceptance[key] !== (key === 'workItemId' ? work.workItemId : evidence[key])) errors.push(`美术验收 ${key} 未绑定当前候选`);
  const sceneId = work.scene?.sceneId ?? work.displayLayer?.hostSceneId;
  if (acceptance.sceneId !== sceneId || (work.displayLayer ? acceptance.displayLayerId !== work.displayLayer.displayLayerId : acceptance.displayLayerId !== undefined)) errors.push('美术验收未绑定当前场景或独立显示层');
  let brief;
  try { brief = readArtEvidenceFile(repo, acceptance.artBriefRef, true); }
  catch { errors.push('美术验收缺少真实 artBriefRef'); }
  if (brief) {
    errors.push(...validateArtBrief(brief));
    if (brief.projectId !== work.projectId) errors.push('美术 brief 未绑定当前项目');
  }
  errors.push(...validateArtQualityResults(acceptance.qualityResults, true));
  for (const key of ['confirmedBy', 'userMessageRef', 'userText']) if (!text(acceptance[key])) errors.push(`美术验收缺少人工 ${key}`);
  if (!isValidIsoTimestamp(acceptance.confirmedAt)) errors.push('美术验收 confirmedAt 必须为有效带时区时间');
  if (!Array.isArray(acceptance.scenarios)) return [...errors, '美术验收缺少动态情境'];
  const seen = new Set();
  for (const scenario of acceptance.scenarios) {
    if (!shape(scenario, ['id', 'required', 'reason', 'status', 'recordingPath', 'durationSeconds', 'startSeconds', 'endSeconds', 'eventCount', 'peakConcurrency', 'viewport', 'observations'], 'scenario', errors)) continue;
    if (!ART_SCENARIOS.includes(scenario.id) || seen.has(scenario.id)) errors.push('动态情境身份无效或重复');
    seen.add(scenario.id);
    if (typeof scenario.required !== 'boolean' || !text(scenario.reason)) errors.push('动态情境必须声明适用性和理由');
    if (scenario.id === 'normal-play' && scenario.required !== true) errors.push('normal-play 必须覆盖实际常态使用');
    if (scenario.required === false) {
      if (scenario.status !== 'NOT_APPLICABLE' || Object.keys(scenario).some((key) => !['id', 'required', 'reason', 'status'].includes(key))) errors.push('不适用情境不得伪造录屏或实测结果');
      continue;
    }
    if (scenario.status !== 'PASS' || !text(scenario.observations)) errors.push('适用动态情境缺少通过的实际人工观察');
    try {
      if (!/\.(mp4|webm|mov|mkv)$/i.test(scenario.recordingPath ?? '')) throw new Error('不是动态文件');
      readArtEvidenceFile(repo, scenario.recordingPath);
    } catch { errors.push('适用动态情境缺少真实项目内录屏'); }
    const { startSeconds: start, endSeconds: end, durationSeconds: duration } = scenario;
    if (![start, end, duration].every(Number.isFinite) || start < 0 || end <= start || end > duration) errors.push('动态片段起止或时长无效');
    for (const key of ['eventCount', 'peakConcurrency']) if (!Number.isInteger(scenario[key]) || scenario[key] < 0) errors.push(`动态情境 ${key} 必须为非负实测整数`);
    if (!shape(scenario.viewport, ['width', 'height'], 'scenario.viewport', errors) || !['width', 'height'].every((key) => Number.isInteger(scenario.viewport?.[key]) && scenario.viewport[key] > 0)) errors.push('动态情境 viewport 无效');
  }
  if (ART_SCENARIOS.some((id) => !seen.has(id))) errors.push('动态情境必须逐一登记 required 或 not-applicable');
  return [...new Set(errors)];
}
