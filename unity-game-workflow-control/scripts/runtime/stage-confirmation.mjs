/** Unity 场景与显示层五阶段的人工作业确认合同。 */

import { VISUAL_STAGES } from './visible-contract.mjs';

export { VISUAL_STAGES };

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const VISIBLE_TYPES = new Set(['SCENE', 'DISPLAY_LAYER']);
const REVIEW_FIELDS = new Set(['stage', 'deliverableSha256', 'confirmation']);
const CONFIRMATION_FIELDS = new Set([
  'workItemId', 'baselineHash', 'stage', 'deliverableSha256', 'confirmedBy', 'confirmedAt', 'userMessageRef',
]);

/** 判断值是否为不含数组的普通记录。 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 判断字符串是否包含可审计内容。 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 验证带时区且日历日期真实存在的 ISO 8601 时间。 */
function isValidIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== 'Z') {
    const [offsetHour, offsetMinute] = zone.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

/** 检查阶段确认字段的严格形状；绑定当前工作项的语义由门禁单独检查。 */
export function validateStageReviewsShape(work) {
  const errors = [];
  if (work.stageReviews === undefined) return errors;
  if (!VISIBLE_TYPES.has(work.workItemType)) return ['只有 SCENE 和 DISPLAY_LAYER Work Item 可以声明 stageReviews'];
  if (!Array.isArray(work.stageReviews)) return ['Work Item.stageReviews 必须为数组'];
  const seenStages = new Set();
  for (const [index, review] of work.stageReviews.entries()) {
    const label = `Work Item.stageReviews[${index}]`;
    if (!isRecord(review)) {
      errors.push(`${label} 必须为对象`);
      continue;
    }
    for (const key of Object.keys(review)) if (!REVIEW_FIELDS.has(key)) errors.push(`${label} 含未声明字段：${key}`);
    if (!VISUAL_STAGES.includes(review.stage)) errors.push(`${label}.stage 必须是 V0-V4`);
    else if (seenStages.has(review.stage)) errors.push(`Work Item.stageReviews 不能重复阶段：${review.stage}`);
    else seenStages.add(review.stage);
    if (!HASH_PATTERN.test(review.deliverableSha256 ?? '')) errors.push(`${label}.deliverableSha256 必须是 sha256 摘要`);
    if (review.confirmation !== undefined) {
      const confirmation = review.confirmation;
      if (!isRecord(confirmation)) {
        errors.push(`${label}.confirmation 必须为对象`);
        continue;
      }
      for (const key of Object.keys(confirmation)) if (!CONFIRMATION_FIELDS.has(key)) errors.push(`${label}.confirmation 含未声明字段：${key}`);
      for (const field of ['workItemId', 'baselineHash', 'confirmedBy', 'userMessageRef']) {
        if (!isNonEmptyString(confirmation[field])) errors.push(`${label}.confirmation.${field} 必须为非空字符串`);
      }
      if (!VISUAL_STAGES.includes(confirmation.stage)) errors.push(`${label}.confirmation.stage 必须是 V0-V4`);
      if (!HASH_PATTERN.test(confirmation.deliverableSha256 ?? '')) errors.push(`${label}.confirmation.deliverableSha256 必须是 sha256 摘要`);
      if (!isValidIsoTimestamp(confirmation.confirmedAt)) errors.push(`${label}.confirmation.confirmedAt 必须是有效 ISO 8601 时间`);
    }
  }
  return errors;
}

/** 计算不可绕过的前序确认和当前阶段确认阻断。 */
export function stageConfirmationBlockers(work, evidence = null, targetState = work.globalState) {
  if (!VISIBLE_TYPES.has(work.workItemType)) return [];
  const currentStage = work.workItemType === 'SCENE' ? work.scene?.stage : work.displayLayer?.stage;
  const currentIndex = VISUAL_STAGES.indexOf(currentStage);
  if (currentIndex < 0) return [];
  const currentStatus = work.workItemType === 'SCENE' ? work.scene?.status : work.displayLayer?.status;
  const currentNeedsConfirmation = currentStatus === 'PASS'
    || evidence?.verdict === 'PASS' && evidence?.visualStage === currentStage
    || ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState)
    || ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(targetState);
  const blockers = [];
  if ((work.globalState === 'COMPLETE' || targetState === 'COMPLETE') && currentStage !== 'V4') {
    blockers.push({ code: 'STAGE_COMPLETE_REQUIRES_V4', message: '可见 Work Item 必须到达 V4 并完成全部阶段确认后才能 COMPLETE', next: '推进到 V4 并完成逐阶段人工确认' });
  }
  const reviews = new Map((work.stageReviews ?? []).map((review) => [review.stage, review]));
  const lastRequiredIndex = currentNeedsConfirmation ? currentIndex : currentIndex - 1;
  for (let index = 0; index <= lastRequiredIndex; index += 1) {
    const stage = VISUAL_STAGES[index];
    const review = reviews.get(stage);
    if (!review?.confirmation) {
      blockers.push({ code: 'STAGE_CONFIRMATION_PENDING', message: `等待 ${stage} 人工确认`, next: `由编排者根据用户确认更新 ${stage} 的 stageReviews 后重新 check` });
      continue;
    }
    const confirmation = review.confirmation;
    const bindingsMatch = confirmation.workItemId === work.workItemId
      && confirmation.baselineHash === work.baselineHash
      && confirmation.stage === stage
      && confirmation.deliverableSha256 === review.deliverableSha256;
    if (!bindingsMatch) {
      blockers.push({ code: 'STAGE_CONFIRMATION_STALE', message: `${stage} 人工确认与当前 Work Item、基线或阶段摘要不匹配`, next: `取得当前 ${stage} 摘要的用户确认并更新 stageReviews` });
      continue;
    }
    if (stage === currentStage && currentNeedsConfirmation && review.deliverableSha256 !== work.candidateSha256) {
      blockers.push({ code: 'STAGE_CANDIDATE_STALE', message: `${stage} 人工确认未绑定当前 candidateSha256`, next: `取得当前候选摘要的用户确认并更新 ${stage} stageReviews` });
    }
  }
  return blockers;
}

/** 对状态迁移重做阶段确认检查，避免调用方伪造空 inspect 阻断列表绕过门禁。 */
export function assertStageConfirmationGate(work, evidence, targetState, fail) {
  const first = stageConfirmationBlockers(work, evidence, targetState)[0];
  if (first) fail(first.message, 2, { errorCode: first.code, next: first.next });
}
