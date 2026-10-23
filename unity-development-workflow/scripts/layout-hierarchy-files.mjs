import { validateUiHierarchyChain, validateUiAssemblyMeasurement } from './layout-hierarchy-contract.mjs';

/** 校验项目相对引用；文件读取由调用入口复用其已有的项目边界与链接检查。 */
function requireReference(plan, name, required) {
  const reference = plan[name];
  if (reference === undefined && !required) return null;
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)
    || Object.keys(reference).length !== 1 || typeof reference.path !== 'string'
    || !reference.path.trim() || reference.path !== reference.path.trim()
    || reference.path.startsWith('/') || /[:\\]/.test(reference.path)
    || reference.path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${name} 必须只声明项目内的 JSON 文件 path`);
  }
  return reference;
}

/** 每次校验重新读取获批拆解及实际结构文件，禁止使用缓存的上游通过结论。 */
export function readUiHierarchyFiles(plan, readJson, {
  requireAssembly = false, requireVerifiedAssembly = false, projectId,
} = {}) {
  const splitRef = requireReference(plan, 'splitPlanRef', true);
  const structureRef = requireReference(plan, 'prefabStructureRef', true);
  const assemblyRef = requireReference(plan, 'prefabAssemblyRef', requireAssembly);
  const references = [splitRef, structureRef, assemblyRef].filter(Boolean);
  if (new Set(references.map(({ path }) => path)).size !== references.length) {
    throw new Error('拆解、Prefab 结构与装配必须绑定不同的工件文件');
  }
  const splitPlan = readJson(splitRef, 'splitPlanRef');
  const structure = readJson(structureRef, 'prefabStructureRef');
  const assembly = assemblyRef ? readJson(assemblyRef, 'prefabAssemblyRef') : undefined;
  const errors = validateUiHierarchyChain(plan, { splitPlan, structure, assembly, requireAssembly });
  if (projectId && [splitPlan, structure, assembly].filter(Boolean).some((value) => value.projectId !== projectId)) {
    errors.push('布局来源工件的 projectId 与当前工作项不一致');
  }
  // 引用身份和路径必须同时相符，不能用内容相似的另一份拆解冒充当前上游。
  if (assembly && (assembly.splitPlanEvidence?.path !== splitRef.path
    || assembly.prefabStructureEvidence?.path !== structureRef.path)) {
    errors.push('Prefab 装配的上游证据路径与布局包引用不一致');
  }
  if (splitPlan?.prefabStructureEvidence?.path !== structureRef.path
    || splitPlan?.prefabStructureEvidence?.subjectId !== structure?.id
    || splitPlan?.prefabStructureEvidence?.subjectVersion !== structure?.version) {
    errors.push('V2 拆解的 prefabStructureEvidence 未绑定当前 Prefab 结构');
  }
  if (requireVerifiedAssembly && assembly?.status !== 'VERIFIED') {
    errors.push('V4 运行交付必须使用 VERIFIED 的正式 Prefab 装配');
  }
  if (errors.length) throw new Error(errors.join('；'));
  return { splitPlan, structure, assembly };
}

/** 将同批实测对象身份接回装配节点，再由既有运行合同核对几何和实际直接父级。 */
export function assertUiAssemblyMeasurement(plan, assembly, report) {
  const errors = validateUiAssemblyMeasurement(plan, assembly, report);
  if (errors.length) throw new Error(errors.join('；'));
}
