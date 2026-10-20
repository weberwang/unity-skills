/** Unity 场景与显示层五阶段的人工作业确认合同。 */

import { VISUAL_STAGES } from './visible-contract.mjs';
import { isValidIsoTimestamp } from './timestamp-contract.mjs';

export { VISUAL_STAGES };

const VISIBLE_TYPES = new Set(['SCENE', 'DISPLAY_LAYER']);
const REVIEW_STAGES = Object.freeze(['V1', 'V2', 'V3', 'V4']);
const REVIEW_FIELDS = new Set(['stage', 'confirmation', 'decompositionConfirmation', 'layoutConfirmation']);
const CONFIRMATION_FIELDS = new Set([
  'workItemId', 'stage', 'confirmedBy', 'confirmedAt', 'userMessageRef',
]);

/** 判断值是否为不含数组的普通记录。 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 判断字符串是否包含可审计内容。 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 校验一条用户确认记录；时间戳只用于比较先后顺序，不依赖文件摘要。 */
function validateConfirmation(confirmation, label, expectedStage, errors) {
  if (!isRecord(confirmation)) {
    errors.push(`${label} 必须为对象`);
    return null;
  }
  for (const key of Object.keys(confirmation)) if (!CONFIRMATION_FIELDS.has(key)) errors.push(`${label} 含未声明字段：${key}`);
  for (const field of ['workItemId', 'confirmedBy', 'userMessageRef']) {
    if (!isNonEmptyString(confirmation[field])) errors.push(`${label}.${field} 必须为非空字符串`);
  }
  if (confirmation.stage !== expectedStage) errors.push(`${label}.stage 必须是 ${expectedStage}`);
  if (!isValidIsoTimestamp(confirmation.confirmedAt)) errors.push(`${label}.confirmedAt 必须是有效 ISO 8601 时间`);
  return confirmation;
}

/** 检查阶段确认字段的严格形状；V0 是内部路由，不保存用户阶段确认。 */
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
    if (!REVIEW_STAGES.includes(review.stage)) errors.push(`${label}.stage 只能是 V1、V2、V3 或 V4`);
    else if (seenStages.has(review.stage)) errors.push(`Work Item.stageReviews 不能重复阶段：${review.stage}`);
    else seenStages.add(review.stage);
    if (review.stage === 'V2') {
      if (review.confirmation !== undefined) errors.push(`${label}.V2 必须分别使用 decompositionConfirmation 和 layoutConfirmation`);
      const decomposition = review.decompositionConfirmation === undefined
        ? null
        : validateConfirmation(review.decompositionConfirmation, `${label}.decompositionConfirmation`, 'V2', errors);
      const layout = review.layoutConfirmation === undefined
        ? null
        : validateConfirmation(review.layoutConfirmation, `${label}.layoutConfirmation`, 'V2', errors);
      if (decomposition && layout && Date.parse(layout.confirmedAt) < Date.parse(decomposition.confirmedAt)) {
        errors.push(`${label}.layoutConfirmation 不能早于 decompositionConfirmation`);
      }
    } else if (review.stage !== 'V0') {
      if (review.decompositionConfirmation !== undefined || review.layoutConfirmation !== undefined) errors.push(`${label}.${review.stage} 只能使用 confirmation`);
      if (review.confirmation !== undefined) validateConfirmation(review.confirmation, `${label}.confirmation`, review.stage, errors);
    }
  }
  return errors;
}

/** 计算不可绕过的前序确认和当前阶段确认阻断。 */
export function stageConfirmationBlockers(work, evidence = null, targetState = work.globalState) {
  if (!VISIBLE_TYPES.has(work.workItemType)) return [];
  const currentStage = work.workItemType === 'SCENE' ? work.scene?.stage : work.displayLayer?.stage;
  const blockers = [];
  if ((work.globalState === 'COMPLETE' || targetState === 'COMPLETE') && currentStage !== 'V4') {
    blockers.push({ code: 'STAGE_COMPLETE_REQUIRES_V4', message: '可见 Work Item 必须到达 V4 并完成全部阶段确认后才能 COMPLETE', next: '推进到 V4 并完成逐阶段人工确认' });
  }
  // V0 只做内部路由；即使阶段状态为 PASS，也不要求用户阶段确认。
  if (!REVIEW_STAGES.includes(currentStage)) return blockers;
  const currentStatus = work.workItemType === 'SCENE' ? work.scene?.status : work.displayLayer?.status;
  const currentNeedsConfirmation = currentStatus === 'PASS'
    || evidence?.verdict === 'PASS' && evidence?.visualStage === currentStage
    || ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(work.globalState)
    || ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(targetState);
  const reviews = new Map((work.stageReviews ?? []).map((review) => [review.stage, review]));
  const currentReviewIndex = REVIEW_STAGES.indexOf(currentStage);
  const lastRequiredIndex = currentNeedsConfirmation ? currentReviewIndex : currentReviewIndex - 1;
  for (let index = 0; index <= lastRequiredIndex; index += 1) {
    const stage = REVIEW_STAGES[index];
    const review = reviews.get(stage);
    const fields = stage === 'V2'
      ? [['decompositionConfirmation', 'V2 拆解'], ['layoutConfirmation', 'V2 布局']]
      : [['confirmation', stage]];
    for (const [field, confirmationLabel] of fields) {
      const confirmation = review?.[field];
      if (!isRecord(confirmation)) {
        blockers.push({ code: 'STAGE_CONFIRMATION_PENDING', message: `等待 ${confirmationLabel} 人工确认`, next: `由编排者根据用户确认更新 ${stage} 的 stageReviews 后重新 check` });
        continue;
      }
      const bindingsMatch = confirmation.workItemId === work.workItemId && confirmation.stage === stage;
      if (!bindingsMatch) {
        blockers.push({ code: 'STAGE_CONFIRMATION_STALE', message: `${confirmationLabel} 人工确认与当前 Work Item 或阶段不匹配`, next: `由原确认人确认当前 ${confirmationLabel}，或记录对应阶段的用户确认` });
      }
    }
    if (stage === 'V2') {
      const decomposition = review?.decompositionConfirmation;
      const layout = review?.layoutConfirmation;
      if (isRecord(decomposition) && isRecord(layout)
        && isValidIsoTimestamp(decomposition.confirmedAt) && isValidIsoTimestamp(layout.confirmedAt)
        && Date.parse(layout.confirmedAt) < Date.parse(decomposition.confirmedAt)) {
        blockers.push({ code: 'STAGE_CONFIRMATION_ORDER_INVALID', message: 'V2 布局确认不得早于拆解确认', next: '在拆解确认之后重新取得布局确认并更新 V2 记录' });
      }
    }
  }
  return blockers;
}

/** 对状态迁移重做阶段确认检查，避免调用方伪造空 inspect 阻断列表绕过门禁。 */
export function assertStageConfirmationGate(work, evidence, targetState, fail) {
  const first = stageConfirmationBlockers(work, evidence, targetState)[0];
  if (first) fail(first.message, 2, { errorCode: first.code, next: first.next });
}
