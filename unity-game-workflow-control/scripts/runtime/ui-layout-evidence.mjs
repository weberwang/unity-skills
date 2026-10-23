import { readProjectJson, readCurrentImplementationPackage, readCurrentEvidenceManifest } from './evidence-files.mjs';
import { validateUiLayoutPlan } from '../../../unity-development-workflow/scripts/layout-plan-validation.mjs';
import { validateUiLayoutRuntime } from '../../../unity-development-workflow/scripts/layout-runtime-contract.mjs';
import { readUiHierarchyFiles, assertUiAssemblyMeasurement } from '../../../unity-development-workflow/scripts/layout-hierarchy-files.mjs';

// 这些交付状态必须消费当前真实布局报告，前期计划编制仍只检查计划合同。
const RUNTIME_STATES = new Set(['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE']);

/** 识别需要机器布局包的屏幕UI工作项，不将世界空间合同套入屏幕坐标。 */
function isScreenUi(work) {
  return ['SCENE', 'DISPLAY_LAYER'].includes(work?.workItemType)
    && ['UGUI', 'UI Toolkit'].includes(work.responsiveContract?.uiSystem);
}

/** 从现有工作项取得可见阶段，不创建另一份阶段状态。 */
function visualStage(work) {
  return work.workItemType === 'SCENE' ? work.scene?.stage : work.displayLayer?.stage;
}

/** 校验实施包绑定的布局计划与当前工作项身份，并返回同一份已重算计划。 */
function readLayoutPlan(pkg, work, repo) {
  const required = isScreenUi(work) && ['V2', 'V3', 'V4'].includes(visualStage(work));
  if (!pkg?.uiLayoutPlanRef) {
    if (required) throw new Error('屏幕UI从V2起必须在 Implementation Package 绑定 uiLayoutPlanRef');
    return null;
  }
  if (!isScreenUi(work)) throw new Error('非屏幕UI工作项不得声明 uiLayoutPlanRef');
  const { value: plan } = readProjectJson(repo, pkg.uiLayoutPlanRef, 'uiLayoutPlanRef');
  const errors = validateUiLayoutPlan(plan, { requireDerived: true });
  if (errors.length) throw new Error(errors.join('；'));
  const sceneId = work.workItemType === 'SCENE' ? work.scene.sceneId : work.displayLayer.hostSceneId;
  if (plan.sceneId !== sceneId) throw new Error('uiLayoutPlanRef 未绑定当前场景或显示层宿主');
  if (work.workItemType === 'DISPLAY_LAYER' && plan.displayLayerId !== work.displayLayer.displayLayerId) throw new Error('uiLayoutPlanRef 未绑定当前独立 displayLayerId');
  if (work.workItemType === 'SCENE' && plan.displayLayerId !== undefined) throw new Error('场景布局包不能冒充独立显示层布局');
  const uiSystem = work.responsiveContract.uiSystem === 'UGUI' ? 'UGUI' : 'UI_TOOLKIT';
  if (plan.uiSystem !== uiSystem) throw new Error('uiLayoutPlanRef 的UI系统与当前响应式合同不符');
  if (!plan.scenePath) throw new Error('绑定实施包的布局计划必须明确 scenePath');
  const hierarchy = readUiHierarchyFiles(plan, (reference, label) => readProjectJson(repo, reference, label).value, {
    requireAssembly: visualStage(work) === 'V4', projectId: work.projectId,
  });
  return { plan, ...hierarchy };
}

/** 在实施包校验入口读取机器布局包；错误转换为现有合同诊断。 */
export function validateUiLayoutPackage(pkg, work, repo) {
  try { readLayoutPlan(pkg, work, repo); return []; }
  catch (error) { return [`UI布局计划无效：${error.message}`]; }
}

/** 检查当前计划和同批真实运行证据，不从静态PASS或旧inspect缓存推断成功。 */
export function inspectUiLayoutEvidence({ work, pkg, evidence, repo, forceRuntime = false }) {
  if (!pkg) return [];
  const blockers = [];
  try {
    const hierarchy = readLayoutPlan(pkg, work, repo);
    if (!hierarchy) {
      if (evidence?.uiLayoutMeasurementRef) throw new Error('布局运行证据未绑定 uiLayoutPlanRef');
      return [];
    }
    const { plan, assembly } = hierarchy;
    const needsRuntime = visualStage(work) === 'V4'
      && (forceRuntime || RUNTIME_STATES.has(work.globalState) || evidence?.verdict === 'PASS');
    if (!needsRuntime && !evidence?.uiLayoutMeasurementRef) return [];
    if (!evidence?.uiLayoutMeasurementRef) throw new Error('V4布局缺少 uiLayoutMeasurementRef，不能用计划或人工确认替代真实采集');
    if (typeof work.evidenceRoot !== 'string' || !work.evidenceRoot.trim()) throw new Error('布局运行证据缺少当前 evidenceRoot');
    if (typeof evidence.candidateId !== 'string' || !evidence.candidateId.trim()) throw new Error('布局运行证据必须绑定当前 candidateId');
    const { value: report, path } = readProjectJson(repo, evidence.uiLayoutMeasurementRef, 'uiLayoutMeasurementRef', work.evidenceRoot);
    if (report.outputPath !== path) throw new Error('布局报告 outputPath 与实际证据引用不符');
    const errors = validateUiLayoutRuntime(plan, report, { candidateId: evidence.candidateId, scenePath: plan.scenePath });
    if (errors.length) throw new Error(errors.join('；'));
    if (assembly?.status !== 'VERIFIED') throw new Error('V4 运行交付必须使用 VERIFIED 的正式 Prefab 装配');
    assertUiAssemblyMeasurement(plan, assembly, report);
  } catch (error) {
    blockers.push({ code: 'UI_LAYOUT_EVIDENCE_INVALID', message: error.message, next: '修复当前布局或补齐同批Unity实测后 revalidate' });
  }
  return blockers;
}

/** 直接迁移也重新读取磁盘实施包和采集结果，不能通过清空blockers绕过布局门禁。 */
export function assertUiLayoutHandoff(inspection, target, fail) {
  if (['RETURN', 'BLOCKED'].includes(target)) return;
  try {
    const pkg = readCurrentImplementationPackage(inspection);
    const evidence = readCurrentEvidenceManifest(inspection);
    if (isScreenUi(inspection.work) && RUNTIME_STATES.has(target) && evidence
      && (evidence.workItemId !== inspection.work.workItemId || evidence.packageId !== pkg?.packageId
        || evidence.workItemType !== inspection.work.workItemType)) {
      throw new Error('当前 Evidence Manifest 的工作项或实施包身份不一致');
    }
    if (isScreenUi(inspection.work) && RUNTIME_STATES.has(target) && evidence) {
      const finalDelivery = ['PASSED', 'INTEGRATING', 'COMPLETE'].includes(target);
      const f3 = evidence.gateResults?.F3?.status;
      // 同批实测仍通过也不能覆盖当前候选的失败结论；验证入口可保留尚未形成最终判定的记录。
      if (evidence.verdict === 'FAIL' || f3 === 'FAIL'
        || (finalDelivery && (evidence.verdict !== 'PASS' || f3 !== 'PASS'))) {
        throw new Error('当前 Evidence Manifest 的 verdict 与 F3 必须通过才能交付');
      }
    }
    const blockers = inspectUiLayoutEvidence({ ...inspection, pkg, evidence, forceRuntime: RUNTIME_STATES.has(target) });
    if (blockers.length) fail(blockers[0].message, 2, { errorCode: blockers[0].code });
  } catch (error) {
    fail(`布局交付门禁失败：${error.message}`, 2, { errorCode: 'UI_LAYOUT_EVIDENCE_INVALID' });
  }
}
