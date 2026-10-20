import assert from 'node:assert/strict';
import test from 'node:test';
import { stageConfirmationBlockers, validateStageReviewsShape } from '../../unity-game-workflow-control/scripts/runtime/stage-confirmation.mjs';

/** 构造带用户消息引用的阶段确认记录；测试中不使用文件摘要。 */
function confirmation(stage, confirmedAt = '2026-10-20T10:00:00+08:00') {
  return { workItemId: 'WI-STAGE', stage, confirmedBy: 'test-user', confirmedAt, userMessageRef: `message-${stage}-${confirmedAt}` };
}

/** 为指定阶段创建当前可见工作项，避免测试依赖控制器和外部文件。 */
function workAt(stage, status = 'IN_PROGRESS', stageReviews = [], globalState = 'ACTIVE') {
  return {
    workItemId: 'WI-STAGE', workItemType: 'SCENE', globalState,
    scene: { sceneId: 'scene-test', stage, status }, stageReviews,
  };
}

/** 为门禁用例提供各阶段的完整确认事实。 */
const v1 = { stage: 'V1', confirmation: confirmation('V1') };
const v2 = {
  stage: 'V2',
  decompositionConfirmation: confirmation('V2', '2026-10-20T10:00:00+08:00'),
  layoutConfirmation: confirmation('V2', '2026-10-20T10:01:00+08:00'),
};
const v3 = { stage: 'V3', confirmation: confirmation('V3') };
const v4 = { stage: 'V4', confirmation: confirmation('V4') };

test('确认记录只接受 V1-V4，且 V2 必须分别记录拆解和布局确认', () => {
  assert.deepEqual(validateStageReviewsShape(workAt('V4', 'IN_PROGRESS', [v1, v2, v3, v4])), []);
  assert.ok(validateStageReviewsShape(workAt('V1', 'IN_PROGRESS', [{ stage: 'V0', confirmation: confirmation('V0') }])).length > 0);
  assert.ok(validateStageReviewsShape(workAt('V2', 'IN_PROGRESS', [{ stage: 'V2', confirmation: confirmation('V2') }])).length > 0);
  assert.ok(validateStageReviewsShape(workAt('V2', 'IN_PROGRESS', [{ stage: 'V2', decompositionConfirmation: confirmation('V2') }])).length === 0);
});

test('布局确认不得早于拆解确认，且两条确认都绑定 V2 用户消息', () => {
  const earlierLayout = {
    stage: 'V2',
    decompositionConfirmation: confirmation('V2', '2026-10-20T10:02:00+08:00'),
    layoutConfirmation: confirmation('V2', '2026-10-20T10:01:00+08:00'),
  };
  assert.ok(validateStageReviewsShape(workAt('V2', 'IN_PROGRESS', [earlierLayout])).length > 0);
  const wrongBinding = structuredClone(v2);
  wrongBinding.layoutConfirmation.userMessageRef = '';
  assert.ok(validateStageReviewsShape(workAt('V2', 'IN_PROGRESS', [wrongBinding])).length > 0);
});

test('确认记录必须属于当前工作项且匹配记录阶段', () => {
  const stale = structuredClone(v1);
  stale.confirmation.workItemId = 'WI-OTHER';
  const mismatchedStage = structuredClone(v3);
  mismatchedStage.confirmation.stage = 'V2';
  assert.ok(stageConfirmationBlockers(workAt('V3', 'IN_PROGRESS', [stale, mismatchedStage])).some((item) => item.code === 'STAGE_CONFIRMATION_STALE'));
  assert.ok(stageConfirmationBlockers(workAt('V3', 'IN_PROGRESS', [stale, mismatchedStage])).some((item) => item.code === 'STAGE_CONFIRMATION_PENDING'));
});

test('V0 PASS 不需要用户确认，V1 启动也不要求 V0 确认', () => {
  assert.deepEqual(stageConfirmationBlockers(workAt('V0', 'PASS')), []);
  assert.deepEqual(stageConfirmationBlockers(workAt('V1')), []);
});

test('当前阶段 PASS 要确认当前阶段，V2 两项确认缺一不能推进 V3', () => {
  const v1Work = workAt('V1', 'PASS');
  assert.equal(stageConfirmationBlockers(v1Work)[0]?.code, 'STAGE_CONFIRMATION_PENDING');
  assert.deepEqual(stageConfirmationBlockers(workAt('V1', 'PASS', [v1])), []);

  const v2Work = workAt('V2', 'PASS', [v1, { stage: 'V2', decompositionConfirmation: v2.decompositionConfirmation }]);
  const missingLayout = stageConfirmationBlockers(v2Work);
  assert.equal(missingLayout.length, 1);
  assert.equal(missingLayout[0].code, 'STAGE_CONFIRMATION_PENDING');
  assert.deepEqual(stageConfirmationBlockers(workAt('V3', 'IN_PROGRESS', [v1, v2])), []);
});

test('V3 的 V2 前置确认按先后顺序校验，V4 和 COMPLETE 仍要求最终确认', () => {
  const reversed = {
    stage: 'V2',
    decompositionConfirmation: confirmation('V2', '2026-10-20T10:02:00+08:00'),
    layoutConfirmation: confirmation('V2', '2026-10-20T10:01:00+08:00'),
  };
  assert.ok(stageConfirmationBlockers(workAt('V3', 'IN_PROGRESS', [v1, reversed])).some((item) => item.code === 'STAGE_CONFIRMATION_ORDER_INVALID'));

  const beforeV4Confirm = stageConfirmationBlockers(workAt('V4', 'PASS', [v1, v2, v3]));
  assert.ok(beforeV4Confirm.some((item) => item.code === 'STAGE_CONFIRMATION_PENDING'));
  assert.deepEqual(stageConfirmationBlockers(workAt('V4', 'IN_PROGRESS', [v1, v2, v3, v4]), null, 'COMPLETE'), []);
});
