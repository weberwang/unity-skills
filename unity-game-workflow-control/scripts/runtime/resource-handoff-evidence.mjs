import { readProjectJson, readCurrentImplementationPackage } from './evidence-files.mjs';
import { validateResourceLoading } from '../../../unity-development-workflow/scripts/resource-loading-contract.mjs';
import { validateFrameAnimationHandoff } from '../../../unity-development-workflow/scripts/frame-animation-contract.mjs';

// 声明资源交接的工作项进入工程验收与交付时必须消费实际读回。
const DELIVERY_STATES = new Set(['VALIDATING', 'PASSED', 'INTEGRATING', 'COMPLETE']);

/** 读取实施包明确声明的当前交接材料，不扩展无资源交接的工作项范围。 */
function readHandoffMaterials(pkg, repo) {
  const handoff = pkg?.resourceHandoff;
  if (handoff === undefined) return null;
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)
    || !Object.keys(handoff).length
    || Object.keys(handoff).some((key) => !['assetRegisterRef', 'frameAnimationPlanRef'].includes(key))) {
    throw new Error('resourceHandoff 必须至少绑定 assetRegisterRef 或 frameAnimationPlanRef');
  }
  const register = handoff.assetRegisterRef === undefined ? null
    : readProjectJson(repo, handoff.assetRegisterRef, 'assetRegisterRef').value;
  const framePlan = handoff.frameAnimationPlanRef === undefined ? null
    : readProjectJson(repo, handoff.frameAnimationPlanRef, 'frameAnimationPlanRef').value;
  if (register && (register.schemaVersion !== '1.0' || !Array.isArray(register.assets))) throw new Error('assetRegisterRef 必须指向当前资源总表的JSON执行快照');
  if (framePlan && (framePlan.schemaVersion !== '1.0' || !Array.isArray(framePlan.animations) || !framePlan.animations.length)) throw new Error('frameAnimationPlanRef 必须包含当前序列帧交接合同');
  return { register, framePlan };
}

/** 实施前检查资源材料引用与文件存在性，实际资产事实在交付时读回核验。 */
export function validateResourceHandoffPackage(pkg, repo) {
  try { readHandoffMaterials(pkg, repo); return []; }
  catch (error) { return [`资源交接材料无效：${error.message}`]; }
}

/** 按当前资源加载与动画合同消费同一份真实Unity读回报告。 */
export function inspectResourceHandoffEvidence({ work, pkg, evidence, repo, forceRuntime = false }) {
  try {
    const materials = readHandoffMaterials(pkg, repo);
    if (!materials) {
      if (evidence?.resourceHandoffInspectionRef) throw new Error('资源读回证据缺少实施包 resourceHandoff 绑定');
      return [];
    }
    if (!forceRuntime && !DELIVERY_STATES.has(work.globalState)
      && evidence?.verdict !== 'PASS' && !evidence?.resourceHandoffInspectionRef) return [];
    if (!evidence?.resourceHandoffInspectionRef) throw new Error('资源交接缺少 resourceHandoffInspectionRef，不能以静态PASS代替实际读回');
    if (typeof work.evidenceRoot !== 'string' || !work.evidenceRoot.trim()) throw new Error('资源交接缺少当前 evidenceRoot');
    const { value: report, path } = readProjectJson(repo, evidence.resourceHandoffInspectionRef, 'resourceHandoffInspectionRef', work.evidenceRoot);
    if (report.outputPath !== path) throw new Error('资源报告 outputPath 与实际证据引用不符');
    if (report.taskId !== work.workItemId) throw new Error('资源报告 taskId 未绑定当前 Work Item');
    const errors = [
      ...(materials.register ? validateResourceLoading(materials.register, report) : []),
      ...(materials.framePlan ? validateFrameAnimationHandoff(materials.framePlan, report) : []),
    ];
    if (errors.length) throw new Error(errors.join('；'));
    return [];
  } catch (error) {
    return [{ code: 'RESOURCE_HANDOFF_INVALID', message: error.message, next: '修复加载声明或Clip/消费者后重新读回并 revalidate' }];
  }
}

/** 直接交付也重读磁盘材料与报告，防止清空inspect阻断项绕过资源门禁。 */
export function assertResourceHandoff(inspection, target, fail) {
  if (['RETURN', 'BLOCKED'].includes(target)) return;
  try {
    const pkg = readCurrentImplementationPackage(inspection);
    const blockers = inspectResourceHandoffEvidence({ ...inspection, pkg, forceRuntime: DELIVERY_STATES.has(target) });
    if (blockers.length) fail(blockers[0].message, 2, { errorCode: blockers[0].code });
  } catch (error) {
    fail(`资源交付门禁失败：${error.message}`, 2, { errorCode: 'RESOURCE_HANDOFF_INVALID' });
  }
}
