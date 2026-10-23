import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateUiAssemblyMeasurement,
  validateUiHierarchyChain,
} from '../../unity-development-workflow/scripts/layout-hierarchy-contract.mjs';

/** 创建稳定的 UI 节点布局绑定，供层级合同夹具独立使用。 */
function layoutBinding(parentElementId, {
  positionReferenceId,
  groupingBasis = ['LAYOUT', 'POSITION'],
  constraints = ['parent-boundary', 'screen-safe-area'],
  memberIds,
} = {}) {
  return {
    parentElementId,
    ...(positionReferenceId === undefined ? {} : { positionReferenceId }),
    hierarchyRelation: 'PARENT_CHILD',
    coordinateSpace: 'CANVAS_LOCAL',
    anchor: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
    pivot: { x: 0.5, y: 0.5 },
    constraints,
    resizePolicy: 'LAYOUT_REBUILD',
    uiLayout: {
      groupingBasis,
      layoutOwner: 'PARENT',
      positionDriver: 'RECT_TRANSFORM',
      sizeDrivers: { width: 'RECT_TRANSFORM', height: 'RECT_TRANSFORM' },
      sizePolicy: 'FIXED',
      overflowPolicy: 'KEEP_VISIBLE',
      safeAreaPolicy: 'INSIDE_SAFE_AREA',
      interactionPolicy: 'DELEGATE_TO_PARENT',
    },
    ...(memberIds ? { centerAlignment: { memberIds } } : {}),
  };
}

/** 创建一个面板及两个同级成员，显式保留位置参照与分组成员集合。 */
function makePlan({ uiSystem = 'UGUI', sceneId = 'menu', stateId = 'default', displayLayerId } = {}) {
  const panelSemantic = { kind: 'region', rationale: '面板是菜单 UI 的实际根节点。' };
  const memberSemantic = { kind: 'part', rationale: '图标和标题属于同一面板内容。' };
  const panelBinding = layoutBinding('safe-area');
  const iconBinding = layoutBinding('panel', {
    positionReferenceId: 'panel',
    groupingBasis: ['LAYOUT', 'STATE'],
    memberIds: ['label', 'icon'],
  });
  const labelBinding = layoutBinding('panel', {
    positionReferenceId: 'icon',
    groupingBasis: ['POSITION', 'STATE'],
    constraints: ['four-unit-gap', 'same-baseline'],
  });
  return {
    schemaVersion: '1.0',
    sceneId,
    scenePath: 'Assets/Scenes/Menu.unity',
    stateId,
    ...(displayLayerId ? { displayLayerId } : {}),
    uiSystem,
    coordinateSpace: uiSystem === 'UGUI' ? 'SCREEN_SPACE_PIXELS' : 'UI_TOOLKIT_LOGICAL_POINTS',
    roots: {
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      'safe-area': { x: 24, y: 24, width: 1232, height: 672 },
    },
    nodes: [
      { id: 'panel', decompositionElementId: 'item.panel', parentElementId: 'safe-area', semanticGrouping: panelSemantic, renderKind: 'STRUCTURE', bounds: { x: 0, y: 0, width: 500, height: 300 }, layoutBinding: panelBinding },
      { id: 'icon', decompositionElementId: 'item.icon', parentElementId: 'panel', semanticGrouping: memberSemantic, renderKind: 'SPRITE', bounds: { x: 40, y: 60, width: 48, height: 48 }, layoutBinding: iconBinding },
      { id: 'label', decompositionElementId: 'item.label', parentElementId: 'panel', semanticGrouping: memberSemantic, renderKind: 'TEXT', bounds: { x: 96, y: 64, width: 180, height: 40 }, layoutBinding: labelBinding },
    ],
  };
}

/** 创建 V2 拆解项及其在用户确认快照中的完整 UI 注释。 */
function makeSplitItem(node, index, { states = ['default'], coordinateSpace } = {}) {
  const binding = structuredClone(node.layoutBinding);
  if (coordinateSpace) binding.coordinateSpace = coordinateSpace;
  return {
    id: node.decompositionElementId,
    resourceId: `resource.${node.id}`,
    itemVersion: 'v1',
    elementIndex: index + 1,
    targetPrefabNodeIds: [node.id],
    parentElementId: node.parentElementId,
    semanticGrouping: structuredClone(node.semanticGrouping),
    layoutBinding: binding,
    stateVariants: states.map((id) => ({ id, description: `状态 ${id}` })),
    bounds: structuredClone(node.bounds),
  };
}

/** 创建当前计划、拆解确认快照、Prefab 结构和装配工件的纯内存链。 */
function makeChain({ displayLayerId, uiSystem = 'UGUI' } = {}) {
  const plan = makePlan({ displayLayerId, uiSystem });
  const activeItems = plan.nodes.map((node, index) => makeSplitItem(node, index));
  const ghostNode = {
    id: 'hover-badge',
    name: 'HoverBadge',
    nodeType: 'UI',
    decompositionElementId: 'item.hover-badge',
    parentId: 'panel',
    semanticGrouping: { kind: 'part', rationale: '仅在 hover 状态显示的标签。' },
    layoutBinding: layoutBinding('panel'),
  };
  const worldItem = {
    id: 'item.world-marker',
    resourceId: 'resource.world-marker',
    targetPrefabNodeIds: ['world-marker'],
    stateVariants: [{ id: 'default', description: '默认' }],
    layoutBinding: { parentElementId: 'scene-root', hierarchyRelation: 'PARENT_CHILD', coordinateSpace: 'SCENE_LOCAL' },
  };
  const ghostItem = makeSplitItem({
    ...plan.nodes[1], id: ghostNode.id, decompositionElementId: ghostNode.decompositionElementId,
    parentElementId: ghostNode.parentId, semanticGrouping: ghostNode.semanticGrouping, layoutBinding: ghostNode.layoutBinding,
  }, 3, { states: ['hover'] });
  const items = [...activeItems, worldItem, ghostItem];
  const annotations = activeItems.map((item) => ({
    itemId: item.id,
    parentElementId: item.parentElementId,
    semanticGrouping: structuredClone(item.semanticGrouping),
    layoutBinding: structuredClone(item.layoutBinding),
  }));
  const preview = { path: 'Artifacts/Fixtures/menu-annotated.png', annotations };
  const splitPlan = {
    id: 'split.menu',
    projectId: 'sample-game',
    sceneId: plan.sceneId,
    ...(displayLayerId ? { displayLayerId } : {}),
    sourceVersion: 'visual-v1',
    status: 'APPROVED',
    items,
    annotatedPreview: structuredClone(preview),
    userApproval: {
      approvalType: 'ASSET_MAP',
      authority: 'USER',
      subjectId: 'split.menu',
      subjectVersion: 'visual-v1',
      approvedBy: 'fixture-user',
      approvedAtUtc: '2026-10-23T00:00:00Z',
      evidencePath: 'Artifacts/Approvals/split-menu.json',
      approvalScope: {
        annotatedPreview: structuredClone(preview),
        sourceHighFidelity: { subjectId: 'visual.menu', subjectVersion: 'visual-v1', path: 'ArtSource/menu.png' },
        items: structuredClone(items),
        excludedElements: [],
      },
    },
  };
  const structureNodes = plan.nodes.map((node) => ({
    id: node.id,
    name: node.id === 'panel' ? 'MenuPanel' : node.id === 'icon' ? 'MenuIcon' : 'MenuTitle',
    nodeType: node.renderKind === 'STRUCTURE' ? 'CONTAINER' : 'UI',
    decompositionElementId: node.decompositionElementId,
    parentId: node.parentElementId,
    semanticGrouping: structuredClone(node.semanticGrouping),
    layoutBinding: structuredClone(node.layoutBinding),
  }));
  structureNodes.push(ghostNode);
  const rootNode = structureNodes[0];
  const prefab = { id: 'prefab.menu-ui', path: 'Assets/UI/Menu.prefab', nodes: structureNodes };
  const instance = {
    id: 'instance.menu-ui',
    prefabId: prefab.id,
    decompositionElementId: rootNode.decompositionElementId,
    parentId: rootNode.parentId,
    scenePath: plan.scenePath,
    semanticGrouping: structuredClone(rootNode.semanticGrouping),
    layoutBinding: structuredClone(rootNode.layoutBinding),
    name: rootNode.name,
  };
  const structure = {
    id: 'structure.menu', projectId: 'sample-game', sceneId: plan.sceneId, version: 'structure-v1',
    ...(displayLayerId ? { displayLayerId } : {}),
    status: 'REVIEWING', prefabs: [prefab], sceneInstances: [instance],
  };
  const assembly = {
    id: 'assembly.menu', projectId: 'sample-game', sceneId: plan.sceneId, version: 'assembly-v1',
    ...(displayLayerId ? { displayLayerId } : {}),
    status: 'VERIFIED',
    splitPlanEvidence: { subjectId: splitPlan.id, subjectVersion: splitPlan.sourceVersion },
    prefabStructureEvidence: { subjectId: structure.id, subjectVersion: structure.version },
    prefabs: structuredClone(structure.prefabs),
    scene: { path: plan.scenePath, prefabInstances: [structuredClone(instance)] },
  };
  return { plan, splitPlan, structure, assembly };
}

/** 校验完整链并将诊断拼成适合断言的文本。 */
function chainErrors(chain, options = {}) {
  return validateUiHierarchyChain(chain.plan, {
    splitPlan: chain.splitPlan,
    structure: chain.structure,
    assembly: chain.assembly,
    ...options,
  }).join('\n');
}

test('V2 到 Prefab 结构、装配的层级链允许键顺序和集合顺序变化', () => {
  const chain = makeChain();
  const splitPanel = chain.splitPlan.items.find(({ id }) => id === 'item.panel');
  splitPanel.layoutBinding.positionReferenceId = 'safe-area';
  chain.splitPlan.userApproval.approvalScope.items = [...chain.splitPlan.userApproval.approvalScope.items].reverse();
  for (const node of chain.plan.nodes) {
    node.layoutBinding.constraints.reverse();
    node.layoutBinding.uiLayout.groupingBasis.reverse();
    const item = chain.splitPlan.items.find(({ id }) => id === node.decompositionElementId);
    item.layoutBinding.constraints.reverse();
    item.layoutBinding.uiLayout.groupingBasis.reverse();
    const structureNode = chain.structure.prefabs[0].nodes.find(({ id }) => id === node.id);
    structureNode.layoutBinding.constraints.reverse();
    const assemblyNode = chain.assembly.prefabs[0].nodes.find(({ id }) => id === node.id);
    assemblyNode.layoutBinding.constraints.reverse();
  }
  chain.structure.sceneInstances[0].layoutBinding.constraints.reverse();
  chain.assembly.scene.prefabInstances[0].layoutBinding.constraints.reverse();
  const icon = chain.plan.nodes.find(({ id }) => id === 'icon');
  icon.layoutBinding.centerAlignment = { memberIds: ['icon', 'label'] };
  chain.splitPlan.items.find(({ id }) => id === 'item.icon').layoutBinding.centerAlignment = { memberIds: ['label', 'icon'] };
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'icon').layoutBinding.centerAlignment = { memberIds: ['label', 'icon'] };
  chain.assembly.prefabs[0].nodes.find(({ id }) => id === 'icon').layoutBinding.centerAlignment = { memberIds: ['icon', 'label'] };
  for (const annotations of [
    chain.splitPlan.annotatedPreview.annotations,
    chain.splitPlan.userApproval.approvalScope.annotatedPreview.annotations,
  ]) {
    annotations.find(({ itemId }) => itemId === 'item.icon').layoutBinding.centerAlignment = { memberIds: ['label', 'icon'] };
  }
  chain.splitPlan.userApproval.approvalScope.annotatedPreview.annotations
    .find(({ itemId }) => itemId === 'item.panel').layoutBinding.positionReferenceId = 'safe-area';
  chain.splitPlan.annotatedPreview.annotations
    .find(({ itemId }) => itemId === 'item.panel').layoutBinding.positionReferenceId = 'safe-area';
  assert.equal(chainErrors(chain), '');
});

test('UI 形状节点必须使用屏幕 UI 拆解项并声明自身目标 ID', () => {
  const chain = makeChain();
  const borrowedWorldNode = {
    id: 'world-marker', name: 'WorldMarker', nodeType: 'UI', decompositionElementId: 'item.world-marker',
    parentId: 'panel', semanticGrouping: { kind: 'part', rationale: '借用世界拆解身份。' }, layoutBinding: layoutBinding('panel'),
  };
  const unclaimedHoverNode = {
    id: 'hover-alias', name: 'HoverAlias', nodeType: 'UI', decompositionElementId: 'item.hover-badge',
    parentId: 'panel', semanticGrouping: { kind: 'part', rationale: '未列入目标的未来状态节点。' }, layoutBinding: layoutBinding('panel'),
  };
  for (const node of [borrowedWorldNode, unclaimedHoverNode]) {
    chain.structure.prefabs[0].nodes.push(structuredClone(node));
    chain.assembly.prefabs[0].nodes.push(structuredClone(node));
  }
  const errors = chainErrors(chain);
  assert.match(errors, /UI 节点来源拆解项必须声明屏幕 UI 坐标空间/);
  assert.match(errors, /UI 节点必须包含在来源拆解项的 targetPrefabNodeIds 中/);
});

test('批准注释中的当前屏幕 UI 不能通过改为世界坐标并删节点来消失', () => {
  const chain = makeChain();
  chain.splitPlan.items.find(({ id }) => id === 'item.icon').layoutBinding.coordinateSpace = 'SCENE_LOCAL';
  chain.plan.nodes = chain.plan.nodes.filter(({ id }) => id !== 'icon');
  chain.structure.prefabs[0].nodes = chain.structure.prefabs[0].nodes.filter(({ id }) => id !== 'icon');
  chain.assembly.prefabs[0].nodes = chain.assembly.prefabs[0].nodes.filter(({ id }) => id !== 'icon');
  assert.match(chainErrors(chain), /approvalScope\.annotatedPreview\.annotations\.item\.icon\.layoutBinding|完整布局合同不一致/);
});

test('装配阶段不能把合法世界节点改成 UI 形状并借用世界拆解身份', () => {
  const chain = makeChain();
  const worldNode = {
    id: 'world-marker', name: 'WorldMarker', nodeType: 'VISUAL', decompositionElementId: 'item.world-marker',
    parentId: 'panel', semanticGrouping: { kind: 'object', rationale: '场景中的世界空间标记。' },
    layoutBinding: { parentElementId: 'panel', hierarchyRelation: 'PARENT_CHILD', coordinateSpace: 'SCENE_LOCAL' },
  };
  chain.structure.prefabs[0].nodes.push(structuredClone(worldNode));
  chain.assembly.prefabs[0].nodes.push(structuredClone(worldNode));
  const assemblyNode = chain.assembly.prefabs[0].nodes.find(({ id }) => id === 'world-marker');
  assemblyNode.nodeType = 'UI';
  assemblyNode.layoutBinding.coordinateSpace = 'CANVAS_LOCAL';
  assert.match(chainErrors(chain), /assembly\.prefabs.*来源拆解项必须声明屏幕 UI 坐标空间/);
});

test('V2 无装配阶段也会拒绝父级、语义、锚点和位置参照漂移', () => {
  const chain = makeChain();
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'label').parentId = 'icon';
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'label').layoutBinding.parentElementId = 'icon';
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'icon').semanticGrouping.rationale = '被改写的语义';
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'panel').layoutBinding.anchor.min.x = 0.25;
  chain.structure.prefabs[0].nodes.find(({ id }) => id === 'label').layoutBinding.positionReferenceId = 'panel';
  const errors = validateUiHierarchyChain(chain.plan, {
    splitPlan: chain.splitPlan,
    structure: chain.structure,
    requireAssembly: false,
  }).join('\n');
  assert.match(errors, /parentId/);
  assert.match(errors, /语义分组/);
  assert.match(errors, /完整布局合同/);
});

test('拆解项父级和语义漂移会同时被布局与原始批准注释拦截', () => {
  const parentDrift = makeChain();
  const item = parentDrift.splitPlan.items.find(({ id }) => id === 'item.label');
  item.parentElementId = 'icon';
  item.layoutBinding.parentElementId = 'icon';
  assert.match(chainErrors(parentDrift), /实际父节点|父节点不一致/);

  const groupingDrift = makeChain();
  groupingDrift.splitPlan.items.find(({ id }) => id === 'item.label').semanticGrouping.rationale = '改写分组';
  assert.match(chainErrors(groupingDrift), /语义分组不一致/);

  const referenceDrift = makeChain();
  referenceDrift.splitPlan.items.find(({ id }) => id === 'item.label').layoutBinding.positionReferenceId = 'panel';
  assert.match(chainErrors(referenceDrift), /完整布局合同不一致/);
});

test('未确认拆解、旧批准快照和不完整状态范围都会失败', () => {
  const unapproved = makeChain();
  unapproved.splitPlan.status = 'REVIEWING';
  assert.match(chainErrors(unapproved), /必须为 APPROVED/);

  const staleScope = makeChain();
  staleScope.splitPlan.items.find(({ id }) => id === 'item.icon').targetPrefabNodeIds = ['renamed-icon'];
  assert.match(chainErrors(staleScope), /与用户确认的节点目标集合不一致/);

  const unknownState = makeChain();
  unknownState.plan.stateId = 'not-in-any-variant';
  assert.match(chainErrors(unknownState), /未出现在拆解计划任何 stateVariants|没有适用于当前状态/);
});

test('结构新增、删除、重复节点以及拆解目标漏项都会被拒绝', () => {
  const added = makeChain();
  added.structure.prefabs[0].nodes.push({
    id: 'extra-ui', name: 'Extra', nodeType: 'UI', decompositionElementId: 'item.icon', parentId: 'panel',
    semanticGrouping: { kind: 'part', rationale: '额外节点。' }, layoutBinding: layoutBinding('panel'),
  });
  assert.match(chainErrors(added), /未在 V2 布局计划中的 UI 节点/);

  const removed = makeChain();
  removed.structure.prefabs[0].nodes = removed.structure.prefabs[0].nodes.filter(({ id }) => id !== 'label');
  assert.match(chainErrors(removed), /缺少布局计划 UI 节点「label」/);

  const duplicate = makeChain();
  duplicate.structure.prefabs[0].nodes.push(structuredClone(duplicate.structure.prefabs[0].nodes[1]));
  assert.match(chainErrors(duplicate), /重复节点 ID「icon」/);

  const uncovered = makeChain();
  uncovered.splitPlan.items.find(({ id }) => id === 'item.icon').targetPrefabNodeIds = [];
  assert.match(chainErrors(uncovered), /targetPrefabNodeIds|没有被当前状态屏幕 UI 拆解项覆盖/);
});

test('Prefab 根挂载身份、实例父级和重复挂载必须与结构节点一致', () => {
  const reparented = makeChain();
  reparented.structure.sceneInstances[0].parentId = 'panel';
  reparented.structure.sceneInstances[0].layoutBinding.parentElementId = 'panel';
  assert.match(chainErrors(reparented), /Prefab 根和布局计划的实际父节点一致|必须与 Prefab 根节点完整布局合同一致/);

  const missing = makeChain();
  missing.structure.sceneInstances = [];
  assert.match(chainErrors(missing), /必须恰有一个根挂载实例/);

  const duplicate = makeChain();
  duplicate.structure.sceneInstances.push({
    ...structuredClone(duplicate.structure.sceneInstances[0]), id: 'instance.duplicate',
  });
  assert.match(chainErrors(duplicate), /重复挂载同一拆解根实例|必须恰有一个根挂载实例/);
});

test('场景、状态、显示层和项目身份必须保持一致', () => {
  const wrongScene = makeChain();
  wrongScene.assembly.scene.path = 'Assets/Scenes/Other.unity';
  wrongScene.assembly.sceneId = 'other-scene';
  assert.match(chainErrors(wrongScene), /sceneId|scenePath/);

  const wrongState = makeChain();
  wrongState.structure.stateId = 'hover';
  assert.match(chainErrors(wrongState), /stateId/);

  const wrongLayer = makeChain({ displayLayerId: 'pause-menu' });
  delete wrongLayer.structure.displayLayerId;
  assert.match(chainErrors(wrongLayer), /displayLayerId/);

  const wrongProject = makeChain();
  wrongProject.assembly.projectId = 'other-game';
  assert.match(chainErrors(wrongProject), /同一项目/);
});

test('提供装配时校验缺失状态、证据身份、节点增删与重父', () => {
  const missing = makeChain();
  assert.match(chainErrors(missing, { assembly: undefined, requireAssembly: true }), /要求 Prefab 装配工件/);

  const wrongParent = makeChain();
  const node = wrongParent.assembly.prefabs[0].nodes.find(({ id }) => id === 'label');
  node.parentId = 'icon';
  node.layoutBinding.parentElementId = 'icon';
  assert.match(chainErrors(wrongParent), /与结构阶段不一致|实际父节点/);

  const missingState = makeChain();
  delete missingState.assembly.status;
  assert.match(chainErrors(missingState, { requireAssembly: true }), /assembly.status/);

  const wrongEvidence = makeChain();
  wrongEvidence.assembly.splitPlanEvidence.subjectVersion = 'old-version';
  assert.match(chainErrors(wrongEvidence), /splitPlanEvidence/);
});

test('Prefab 版本和拆解来源版本必须完整且证据绑定一致', () => {
  const missingVersions = makeChain();
  delete missingVersions.splitPlan.sourceVersion;
  delete missingVersions.structure.version;
  missingVersions.splitPlan.userApproval.subjectVersion = undefined;
  missingVersions.assembly.splitPlanEvidence.subjectVersion = undefined;
  missingVersions.assembly.prefabStructureEvidence.subjectVersion = undefined;
  const errors = chainErrors(missingVersions);
  assert.match(errors, /sourceVersion/);
  assert.match(errors, /structure.version/);
  assert.match(errors, /subjectVersion/);
});

test('V4 UGUI 与 UI Toolkit 实测对象名称必须绑定装配节点身份', () => {
  const chain = makeChain();
  const report = {
    measurements: chain.plan.nodes.map((node) => {
      const assemblyNode = chain.assembly.prefabs[0].nodes.find(({ id }) => id === node.id);
      const rootPath = node.id === 'panel' ? 'Canvas' : 'Canvas/MenuPanel';
      return { id: node.id, objectPath: `${rootPath}/${assemblyNode.name}` };
    }),
  };
  assert.deepEqual(validateUiAssemblyMeasurement(chain.plan, chain.assembly, report), []);

  // 尺寸可完全相同仍不能冒用另一个 Unity 对象的节点 ID。
  report.measurements[1].objectPath = 'Canvas/MenuPanel/WrongIcon';
  report.measurements[1].actualRect = { x: 40, y: 60, width: 48, height: 48 };
  assert.match(validateUiAssemblyMeasurement(chain.plan, chain.assembly, report).join('\n'), /末段名称必须与装配节点名称/);

  const toolkit = makeChain({ uiSystem: 'UI_TOOLKIT' });
  const toolkitReport = {
    measurements: toolkit.plan.nodes.map((node) => ({
      id: node.id,
      elementName: toolkit.assembly.prefabs[0].nodes.find(({ id }) => id === node.id).name,
    })),
  };
  assert.deepEqual(validateUiAssemblyMeasurement(toolkit.plan, toolkit.assembly, toolkitReport), []);
  toolkitReport.measurements[2].elementName = 'WrongTitle';
  assert.match(validateUiAssemblyMeasurement(toolkit.plan, toolkit.assembly, toolkitReport).join('\n'), /elementName/);
});

test('非法对象类型和缺失工件会返回诊断而不抛出异常', () => {
  const chain = makeChain();
  chain.structure.prefabs = null;
  assert.doesNotThrow(() => validateUiHierarchyChain(chain.plan, {
    splitPlan: chain.splitPlan,
    structure: chain.structure,
    assembly: chain.assembly,
  }));
  assert.match(chainErrors({ ...chain, structure: null }), /structure 必须是对象/);
  assert.match(validateUiAssemblyMeasurement(chain.plan, chain.assembly, { measurements: [null] }).join('\n'), /必须是对象/);
});
