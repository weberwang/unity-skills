/** 同一场景工作项的相邻视觉阶段入口；不以实施包完成冒充视觉生命周期完成。 */
import { fail } from './control-primitives.mjs';
import { assertStageConfirmationGate } from './stage-confirmation.mjs';
import { assertExecutionComplete } from './execution-state.mjs';
import { validateVisualBaseline } from './visual-baseline-contract.mjs';

/** 生成已完成阶段之后的新阶段工作项；实际写入仍由工作项锁与 CAS 负责。 */
export function nextSceneStage(inspection, target) {
  const { work, pkg, evidence, repo } = inspection;
  const key = work.workItemType === 'SCENE' ? 'scene' : work.workItemType === 'DISPLAY_LAYER' ? 'displayLayer' : null;
  if (!key) fail('scene-stage 只适用于 SCENE 或 DISPLAY_LAYER');
  if (['RETURN', 'BLOCKED', 'COMPLETE'].includes(work.globalState) || work.userDecisionRequired) fail('当前状态或未决用户选择不允许推进视觉阶段');
  const stages = ['V0', 'V1', 'V2', 'V3', 'V4'];
  if (stages.indexOf(target) !== stages.indexOf(work[key].stage) + 1 || !stages.includes(target)) fail('scene-stage 只能推进一个相邻视觉阶段');
  if (work[key].status !== 'PASS') fail('必须先完成当前视觉阶段，再提交相邻阶段入口');
  assertStageConfirmationGate(work, evidence, work.globalState, fail);
  if (inspection.blockers.length) fail(`阶段推进前存在阻断：${inspection.blockers[0].message}`);
  if (work[key].stage === 'V3') {
    if (!pkg || evidence?.verdict !== 'PASS') fail('V3→V4 必须消费当前资源实施包及 PASS 证据');
    assertExecutionComplete(repo, work, pkg);
  }
  const next = { ...work, revision: work.revision + 1, globalState: 'PROPOSAL', [key]: { ...work[key], stage: target, status: 'IN_PROGRESS' } };
  for (const field of ['implementationPackage', 'implementationPackagePath', 'evidenceManifest', 'evidenceManifestPath', 'approval', 'pendingApproval']) delete next[field];
  // 新阶段只复用范围与规格事实；领域审查、工程证据及高影响批准须针对新交付重新形成。
  next.gateStatus = { F0: work.gateStatus.F0 ?? 'NOT_RUN', F1: work.gateStatus.F1 ?? 'NOT_RUN', F2: 'NOT_RUN', F3: 'NOT_RUN', F4: 'NOT_RUN' };
  const errors = validateVisualBaseline(next, null, repo);
  if (errors.length) fail(errors[0], 2, { errorCode: 'VISUAL_BASELINE_INVALID' });
  return next;
}
