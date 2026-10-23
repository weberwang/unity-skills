import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 写入用于合同测试的工件，内容不表示正式项目已获人工批准或 Unity 验收通过。 */
function writeJson(repo, path, value) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 按任意布局计划创建同一套拆解、批准快照、Prefab 结构和装配，供文件入口测试复用。 */
export function seedUiHierarchyFixture(repo, plan, {
  projectId = 'ui-layout-gate-test', basePath = 'Artifacts/Fixtures/hierarchy',
} = {}) {
  const splitPlanRef = { path: `${basePath}/split-plan.json` };
  const prefabStructureRef = { path: `${basePath}/prefab-structure.json` };
  const prefabAssemblyRef = { path: `${basePath}/prefab-assembly.json` };
  const identity = {
    schemaVersion: '1.0', projectId, sceneId: plan.sceneId, stateId: plan.stateId,
    ...(plan.displayLayerId ? { displayLayerId: plan.displayLayerId } : {}),
  };
  const items = plan.nodes.map((node, index) => ({
    id: node.decompositionElementId, resourceId: `resource.${node.id}`, itemVersion: 'v1', elementIndex: index + 1,
    targetPrefabNodeIds: [node.id], parentElementId: node.parentElementId,
    semanticGrouping: structuredClone(node.semanticGrouping), layoutBinding: structuredClone(node.layoutBinding),
    stateVariants: [{ id: plan.stateId, description: '合同测试状态' }], bounds: structuredClone(node.bounds),
  }));
  const annotations = items.map((item) => ({
    itemId: item.id, parentElementId: item.parentElementId,
    semanticGrouping: structuredClone(item.semanticGrouping), layoutBinding: structuredClone(item.layoutBinding),
  }));
  const preview = { path: `${basePath}/annotated.png`, annotations };
  const structureEvidence = { type: 'prefab-structure', path: prefabStructureRef.path, subjectId: 'structure.fixture', subjectVersion: 'v1' };
  const splitPlan = {
    ...identity, id: 'split.fixture', sourceVersion: 'v1', status: 'APPROVED',
    prefabStructureEvidence: structureEvidence, items, annotatedPreview: preview,
    userApproval: {
      approvalType: 'ASSET_MAP', authority: 'USER', subjectId: 'split.fixture', subjectVersion: 'v1',
      approvedBy: 'fixture-user', approvedAtUtc: '2026-10-23T00:00:00Z', evidencePath: `${basePath}/approval.json`,
      approvalScope: { annotatedPreview: structuredClone(preview), sourceHighFidelity: { subjectId: 'v1.fixture', subjectVersion: 'v1', path: `${basePath}/v1.png` }, items: structuredClone(items), excludedElements: [] },
    },
  };
  const nodes = plan.nodes.map((node) => ({
    id: node.id, decompositionElementId: node.decompositionElementId, parentId: node.parentElementId,
    name: node.id === 'layout-root' ? 'LayoutRoot' : node.id,
    semanticGrouping: structuredClone(node.semanticGrouping), layoutBinding: structuredClone(node.layoutBinding),
  }));
  // 每个无业务父级的根单独实例化，场景实例是根的挂载镜像，不重复计算业务节点覆盖。
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const roots = nodes.filter((node) => !nodeIds.has(node.parentId));
  const prefabs = roots.map((root) => {
    const owned = new Set([root.id]);
    let previousSize;
    do {
      previousSize = owned.size;
      for (const node of nodes) if (owned.has(node.parentId)) owned.add(node.id);
    } while (owned.size !== previousSize);
    return { id: `prefab.${root.id}`, path: `Assets/UI/${root.id}.prefab`, nodes: nodes.filter((node) => owned.has(node.id)) };
  });
  const instances = roots.map((root) => ({
    ...structuredClone(root), id: `instance.${root.id}`, prefabId: `prefab.${root.id}`, scenePath: plan.scenePath,
  }));
  const structure = { ...identity, id: 'structure.fixture', version: 'v1', status: 'REVIEWING', prefabs, sceneInstances: instances };
  const assembly = {
    ...identity, id: 'assembly.fixture', version: 'v1', status: 'VERIFIED',
    prefabStructureEvidence: structuredClone(structureEvidence),
    splitPlanEvidence: { type: 'split-plan', path: splitPlanRef.path, subjectId: splitPlan.id, subjectVersion: splitPlan.sourceVersion },
    prefabs: structuredClone(prefabs), scene: { path: plan.scenePath, prefabInstances: structuredClone(instances) },
  };
  writeJson(repo, splitPlanRef.path, splitPlan);
  writeJson(repo, prefabStructureRef.path, structure);
  writeJson(repo, prefabAssemblyRef.path, assembly);
  Object.assign(plan, { splitPlanRef, prefabStructureRef, prefabAssemblyRef });
  return { splitPlan, structure, assembly, splitPlanRef, prefabStructureRef, prefabAssemblyRef };
}
