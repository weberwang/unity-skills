const SCREEN_UI_SPACES = new Set(["CANVAS_LOCAL", "SCREEN_SAFE_AREA", "UI_TOOLKIT_PANEL"]);
const PLAN_ROOT_IDS = new Set(["viewport", "safe-area"]);
const SET_ARRAY_KEYS = new Set(["groupingBasis", "constraints", "memberIds"]);

/** 判断值是否为可按字段安全读取的普通对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 判断字符串是否包含有效的非空身份。 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 追加统一格式的中文合同诊断。 */
function addError(errors, path, message) {
  errors.push(`${path} ${message}。`);
}

/** 检查必需对象，非法对象由调用方短路后续字段读取。 */
function requireRecord(value, path, errors) {
  if (!isRecord(value)) {
    addError(errors, path, "必须是对象");
    return false;
  }
  return true;
}

/** 校验稳定 ID 字符串，阻止缺失值进入 Map 或节点对账。 */
function requireId(value, path, errors) {
  if (!isNonEmptyString(value)) {
    addError(errors, path, "必须是非空字符串 ID");
    return false;
  }
  return true;
}

/** 校验字符串集合的元素类型和唯一性。 */
function validateStringSet(value, path, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    addError(errors, path, "必须是字符串数组");
    return null;
  }
  if (!allowEmpty && value.length === 0) addError(errors, path, "不能为空");
  const values = new Set();
  value.forEach((entry, index) => {
    if (!requireId(entry, `${path}[${index}]`, errors)) return;
    if (values.has(entry)) addError(errors, path, `包含重复值「${entry}」`);
    values.add(entry);
  });
  return values;
}

/** 校验语义分组结构，避免错误数据进入跨工件深比较。 */
function validateSemanticGrouping(value, path, errors) {
  if (!requireRecord(value, path, errors)) return false;
  let valid = true;
  if (!new Set(["region", "component", "part", "standalone"]).has(value.kind)) {
    addError(errors, `${path}.kind`, "必须是受支持的语义分组类型");
    valid = false;
  }
  if (!requireId(value.rationale, `${path}.rationale`, errors)) valid = false;
  return valid;
}

/** 校验 UI 布局合同中跨阶段要读取的父级、参照及集合字段。 */
function validateLayoutBinding(value, path, expectedParentId, errors) {
  if (!requireRecord(value, path, errors)) return false;
  let valid = true;
  if (!requireId(value.parentElementId, `${path}.parentElementId`, errors)) valid = false;
  if (isNonEmptyString(expectedParentId) && value.parentElementId !== expectedParentId) {
    addError(errors, `${path}.parentElementId`, `必须指向实际父节点「${expectedParentId}」`);
  }
  if (value.hierarchyRelation !== "PARENT_CHILD") {
    addError(errors, `${path}.hierarchyRelation`, "必须使用 PARENT_CHILD 表达直接父子关系");
  }
  if (!isNonEmptyString(value.coordinateSpace)) {
    addError(errors, `${path}.coordinateSpace`, "必须是非空坐标空间");
    valid = false;
  }
  if (value.positionReferenceId !== undefined && !requireId(value.positionReferenceId, `${path}.positionReferenceId`, errors)) valid = false;
  if (!validateStringSet(value.constraints, `${path}.constraints`, errors)) valid = false;

  if (!requireRecord(value.uiLayout, `${path}.uiLayout`, errors)) {
    valid = false;
  } else if (!validateStringSet(value.uiLayout.groupingBasis, `${path}.uiLayout.groupingBasis`, errors)) {
    valid = false;
  }

  if (!requireRecord(value.anchor, `${path}.anchor`, errors)) valid = false;
  else {
    for (const edge of ["min", "max"]) {
      if (!requireRecord(value.anchor[edge], `${path}.anchor.${edge}`, errors)) valid = false;
      else {
        for (const axis of ["x", "y"]) {
          if (typeof value.anchor[edge][axis] !== "number" || !Number.isFinite(value.anchor[edge][axis])) {
            addError(errors, `${path}.anchor.${edge}.${axis}`, "必须是有限数字");
            valid = false;
          }
        }
      }
    }
  }
  if (!requireRecord(value.pivot, `${path}.pivot`, errors)) valid = false;
  else {
    for (const axis of ["x", "y"]) {
      if (typeof value.pivot[axis] !== "number" || !Number.isFinite(value.pivot[axis])) {
        addError(errors, `${path}.pivot.${axis}`, "必须是有限数字");
        valid = false;
      }
    }
  }
  const members = value.centerAlignment?.memberIds;
  if (members !== undefined && !validateStringSet(members, `${path}.centerAlignment.memberIds`, errors)) valid = false;
  return valid;
}

/** 深比较 JSON 数据；仅合同声明为集合的数组忽略排列顺序。 */
function equalContractValue(left, right, key = "", depth = 0, activeLeft = new Set(), activeRight = new Set()) {
  if (depth > 128) return false;
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (SET_ARRAY_KEYS.has(key)) {
      if (left.length !== right.length) return false;
      const leftValues = new Set(left);
      const rightValues = new Set(right);
      return leftValues.size === left.length && rightValues.size === right.length
        && [...leftValues].every((entry) => rightValues.has(entry));
    }
    if (left.length !== right.length) return false;
    if (activeLeft.has(left) || activeRight.has(right)) return false;
    activeLeft.add(left);
    activeRight.add(right);
    const equal = left.every((entry, index) => equalContractValue(entry, right[index], "", depth + 1, activeLeft, activeRight));
    activeLeft.delete(left);
    activeRight.delete(right);
    return equal;
  }

  if (typeof left === "object") {
    if (!isRecord(left) || !isRecord(right) || activeLeft.has(left) || activeRight.has(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((entry, index) => entry !== rightKeys[index])) return false;
    activeLeft.add(left);
    activeRight.add(right);
    const equal = leftKeys.every((entry) => equalContractValue(left[entry], right[entry], entry, depth + 1, activeLeft, activeRight));
    activeLeft.delete(left);
    activeRight.delete(right);
    return equal;
  }
  return false;
}

/** 比较完整布局合同，将省略的位置参照解释为实际父级。 */
function equalLayoutBinding(left, right, parentId) {
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftNormalized = { ...left, positionReferenceId: left.positionReferenceId ?? parentId };
  const rightNormalized = { ...right, positionReferenceId: right.positionReferenceId ?? parentId };
  return equalContractValue(leftNormalized, rightNormalized);
}

/** 检查工件的场景、状态、显示层和项目上下文。 */
function validateStageContext(stage, path, plan, errors, { requireId: requireStageId = true } = {}) {
  if (!requireRecord(stage, path, errors)) return;
  if (requireStageId) requireId(stage.id, `${path}.id`, errors);
  requireId(stage.projectId, `${path}.projectId`, errors);
  requireId(stage.sceneId, `${path}.sceneId`, errors);
  if (stage.sceneId !== plan.sceneId) addError(errors, `${path}.sceneId`, `必须与布局计划 sceneId「${plan.sceneId}」一致`);
  if (stage.displayLayerId !== plan.displayLayerId) {
    addError(errors, `${path}.displayLayerId`, `必须与布局计划 displayLayerId「${plan.displayLayerId ?? "未声明"}」一致`);
  }
  if (stage.displayLayerId !== undefined) requireId(stage.displayLayerId, `${path}.displayLayerId`, errors);
  if (stage.stateId !== undefined) {
    requireId(stage.stateId, `${path}.stateId`, errors);
    if (stage.stateId !== plan.stateId) addError(errors, `${path}.stateId`, `必须与布局计划 stateId「${plan.stateId}」一致`);
  }
}

/** 校验拆解批准的身份和必需的用户确认字段。 */
function validateSplitApproval(splitPlan, errors) {
  if (splitPlan.status !== "APPROVED") addError(errors, "splitPlan.status", "必须为 APPROVED 才能作为已确认的 V2 来源");
  const approval = splitPlan.userApproval;
  if (!requireRecord(approval, "splitPlan.userApproval", errors)) return;
  if (approval.authority !== "USER") addError(errors, "splitPlan.userApproval.authority", "必须为 USER");
  if (approval.approvalType !== "ASSET_MAP") addError(errors, "splitPlan.userApproval.approvalType", "必须为 ASSET_MAP");
  if (approval.subjectId !== splitPlan.id) addError(errors, "splitPlan.userApproval.subjectId", "必须与拆解计划 id 一致");
  if (approval.subjectVersion !== splitPlan.sourceVersion) addError(errors, "splitPlan.userApproval.subjectVersion", "必须与拆解计划 sourceVersion 一致");
  requireId(approval.subjectVersion, "splitPlan.userApproval.subjectVersion", errors);
  for (const key of ["approvedBy", "approvedAtUtc", "evidencePath"]) {
    requireId(approval[key], `splitPlan.userApproval.${key}`, errors);
  }
  if (!requireRecord(approval.approvalScope, "splitPlan.userApproval.approvalScope", errors)) return;
  validateApprovalScopeItems(splitPlan, approval.approvalScope.items, errors);
}

/** 对账用户确认快照中的拆解项身份、目标节点和状态范围。 */
function validateApprovalScopeItems(splitPlan, approvedItems, errors) {
  if (!Array.isArray(approvedItems)) {
    addError(errors, "splitPlan.userApproval.approvalScope.items", "必须是数组");
    return;
  }
  const currentItems = Array.isArray(splitPlan.items) ? splitPlan.items : [];
  const approvedById = new Map();
  approvedItems.forEach((item, index) => {
    const path = `approvalScope.items[${index}]`;
    if (!requireRecord(item, path, errors)) return;
    if (!requireId(item.id, `${path}.id`, errors)) return;
    if (approvedById.has(item.id)) addError(errors, `${path}.id`, `重复拆解项「${item.id}」`);
    approvedById.set(item.id, item);
    validateStringSet(item.targetPrefabNodeIds, `${path}.targetPrefabNodeIds`, errors);
    validateStateVariants(item.stateVariants, `${path}.stateVariants`, errors);
  });

  const currentById = new Map();
  currentItems.forEach((item, index) => {
    if (!requireRecord(item, `splitPlan.items[${index}]`, errors) || !requireId(item.id, `splitPlan.items[${index}].id`, errors)) return;
    currentById.set(item.id, item);
  });
  for (const id of currentById.keys()) {
    if (!approvedById.has(id)) addError(errors, "approvalScope.items", `缺少已确认拆解项「${id}」`);
  }
  for (const id of approvedById.keys()) {
    if (!currentById.has(id)) addError(errors, "approvalScope.items", `包含未在当前拆解计划中的项「${id}」`);
  }
  for (const [id, item] of currentById) {
    const approved = approvedById.get(id);
    if (!approved) continue;
    const approvedTargets = validateStringSet(approved.targetPrefabNodeIds, `approvalScope.items.${id}.targetPrefabNodeIds`, errors);
    const currentTargets = validateStringSet(item.targetPrefabNodeIds, `splitPlan.items.${id}.targetPrefabNodeIds`, errors);
    if (approvedTargets && currentTargets && !equalContractValue([...approvedTargets].sort(), [...currentTargets].sort())) {
      addError(errors, `approvalScope.items.${id}.targetPrefabNodeIds`, "与用户确认的节点目标集合不一致");
    }
    const approvedStates = normalizeStateVariants(approved.stateVariants, `approvalScope.items.${id}.stateVariants`, errors);
    const currentStates = normalizeStateVariants(item.stateVariants, `splitPlan.items.${id}.stateVariants`, errors);
    if (approvedStates && currentStates && !equalContractValue(approvedStates, currentStates)) {
      addError(errors, `approvalScope.items.${id}.stateVariants`, "与用户确认的状态范围不一致");
    }
  }
}

/** 校验并标准化拆解项状态集合，顺序不影响确认身份。 */
function normalizeStateVariants(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, path, "必须是状态数组");
    return null;
  }
  if (value.length === 0) addError(errors, path, "至少需要一个状态范围");
  const byId = new Map();
  value.forEach((variant, index) => {
    const variantPath = `${path}[${index}]`;
    if (!requireRecord(variant, variantPath, errors)) return;
    if (!requireId(variant.id, `${variantPath}.id`, errors)) return;
    if (!requireId(variant.description, `${variantPath}.description`, errors)) return;
    if (byId.has(variant.id)) addError(errors, `${variantPath}.id`, `重复状态「${variant.id}」`);
    byId.set(variant.id, { id: variant.id, description: variant.description });
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

/** 校验状态数组字段并返回其有效状态 ID 集合。 */
function validateStateVariants(value, path, errors) {
  const variants = normalizeStateVariants(value, path, errors);
  return variants ? new Set(variants.map((variant) => variant.id)) : null;
}

/** 对账批准或拆解图注释中的 UI 父级、语义分组和完整布局合同。 */
function validateUiAnnotations(annotations, path, expectedItems, errors) {
  if (!Array.isArray(annotations)) {
    addError(errors, path, "必须是数组");
    return;
  }
  const byItemId = new Map();
  annotations.forEach((annotation, index) => {
    const annotationPath = `${path}[${index}]`;
    if (!requireRecord(annotation, annotationPath, errors)) return;
    if (!requireId(annotation.itemId, `${annotationPath}.itemId`, errors)) return;
    if (byItemId.has(annotation.itemId)) addError(errors, `${annotationPath}.itemId`, `重复注释「${annotation.itemId}」`);
    byItemId.set(annotation.itemId, annotation);
  });
  for (const [itemId, item] of expectedItems) {
    const annotation = byItemId.get(itemId);
    if (!annotation) {
      addError(errors, path, `缺少当前屏幕 UI 拆解项「${itemId}」的已确认注释`);
      continue;
    }
    if (annotation.parentElementId !== item.parentElementId) {
      addError(errors, `${path}.${itemId}.parentElementId`, "与当前拆解项的实际父节点不一致");
    }
    validateSemanticGrouping(annotation.semanticGrouping, `${path}.${itemId}.semanticGrouping`, errors);
    if (!equalContractValue(annotation.semanticGrouping, item.semanticGrouping)) {
      addError(errors, `${path}.${itemId}.semanticGrouping`, "与当前拆解项语义分组不一致");
    }
    validateLayoutBinding(annotation.layoutBinding, `${path}.${itemId}.layoutBinding`, item.parentElementId, errors);
    if (!equalLayoutBinding(annotation.layoutBinding, item.layoutBinding, item.parentElementId)) {
      addError(errors, `${path}.${itemId}.layoutBinding`, "与当前拆解项完整布局合同不一致");
    }
  }
}

/** 将批准快照中当前状态的屏幕 UI 注释并入期待集合，防止通过改坐标分类逃避复核。 */
function collectExpectedUiAnnotationItems(plan, allItemsById, activeItemsById, approvalScope) {
  const expectedItems = new Map(activeItemsById);
  if (!isRecord(approvalScope) || !Array.isArray(approvalScope.items)) return expectedItems;
  const approvedItemsById = new Map(
    approvalScope.items
      .filter((item) => isRecord(item) && isNonEmptyString(item.id))
      .map((item) => [item.id, item]),
  );
  const annotations = approvalScope.annotatedPreview?.annotations;
  if (!Array.isArray(annotations)) return expectedItems;

  for (const annotation of annotations) {
    if (!isRecord(annotation) || !isNonEmptyString(annotation.itemId)) continue;
    if (!SCREEN_UI_SPACES.has(annotation.layoutBinding?.coordinateSpace)) continue;
    const approvedItem = approvedItemsById.get(annotation.itemId);
    const appliesToState = Array.isArray(approvedItem?.stateVariants)
      && approvedItem.stateVariants.some((variant) => isRecord(variant) && variant.id === plan.stateId);
    if (!appliesToState) continue;
    const currentItem = allItemsById.get(annotation.itemId);
    if (currentItem) expectedItems.set(annotation.itemId, currentItem);
  }
  return expectedItems;
}

/** 收集当前布局计划节点，检查稳定 ID、拆解 ID 与真实父节点。 */
function collectPlanNodes(plan, errors) {
  if (!Array.isArray(plan.nodes)) {
    addError(errors, "plan.nodes", "必须是节点数组");
    return new Map();
  }
  const nodesById = new Map();
  plan.nodes.forEach((node, index) => {
    const path = `plan.nodes[${index}]`;
    if (!requireRecord(node, path, errors)) return;
    if (!requireId(node.id, `${path}.id`, errors)) return;
    if (nodesById.has(node.id)) addError(errors, `${path}.id`, `重复实际节点 ID「${node.id}」`);
    nodesById.set(node.id, node);
    requireId(node.decompositionElementId, `${path}.decompositionElementId`, errors);
    requireId(node.parentElementId, `${path}.parentElementId`, errors);
    validateSemanticGrouping(node.semanticGrouping, `${path}.semanticGrouping`, errors);
    validateLayoutBinding(node.layoutBinding, `${path}.layoutBinding`, node.parentElementId, errors);
  });
  for (const node of nodesById.values()) {
    if (node.parentElementId === node.id) addError(errors, `plan.nodes.${node.id}.parentElementId`, "不能引用节点自身");
    else if (!PLAN_ROOT_IDS.has(node.parentElementId) && !nodesById.has(node.parentElementId)) {
      addError(errors, `plan.nodes.${node.id}.parentElementId`, `未指向当前布局计划节点或根「viewport/safe-area」`);
    }
  }
  return nodesById;
}

/** 校验拆解项身份、目标 ID、状态过滤及 UI 节点的拆解映射。 */
function collectActiveUiItems(plan, splitPlan, nodesById, errors) {
  if (!Array.isArray(splitPlan.items)) {
    addError(errors, "splitPlan.items", "必须是拆解项数组");
    return { allItemsById: new Map(), activeItemsById: new Map() };
  }
  const allItemsById = new Map();
  const activeItemsById = new Map();
  const targetToItem = new Map();
  let stateExists = false;

  splitPlan.items.forEach((item, index) => {
    const path = `splitPlan.items[${index}]`;
    if (!requireRecord(item, path, errors)) return;
    if (!requireId(item.id, `${path}.id`, errors)) return;
    if (allItemsById.has(item.id)) addError(errors, `${path}.id`, `重复拆解项 ID「${item.id}」`);
    allItemsById.set(item.id, item);
    const targets = validateStringSet(item.targetPrefabNodeIds, `${path}.targetPrefabNodeIds`, errors);
    const states = validateStateVariants(item.stateVariants, `${path}.stateVariants`, errors);
    if (states?.has(plan.stateId)) stateExists = true;
    const space = item.layoutBinding?.coordinateSpace;
    if (!isNonEmptyString(space)) {
      addError(errors, `${path}.layoutBinding.coordinateSpace`, "必须声明坐标空间以区分屏幕 UI 与其他拆解项");
      return;
    }
    if (!SCREEN_UI_SPACES.has(space)) return;
    if (!states?.has(plan.stateId)) return;

    if (!requireId(item.parentElementId, `${path}.parentElementId`, errors)) return;
    validateSemanticGrouping(item.semanticGrouping, `${path}.semanticGrouping`, errors);
    validateLayoutBinding(item.layoutBinding, `${path}.layoutBinding`, item.parentElementId, errors);

    activeItemsById.set(item.id, item);
    if (item.layoutBinding.hierarchyRelation !== "PARENT_CHILD") {
      addError(errors, `${path}.layoutBinding.hierarchyRelation`, "同级节点必须通过共享实际父节点表达");
    }
    if (!item.layoutBinding.uiLayout?.groupingBasis?.length) {
      addError(errors, `${path}.layoutBinding.uiLayout.groupingBasis`, "分组依据不能为空");
    }
    for (const nodeId of targets ?? []) {
      if (targetToItem.has(nodeId)) {
        addError(errors, `${path}.targetPrefabNodeIds`, `节点「${nodeId}」被多个当前状态拆解项声明`);
      }
      targetToItem.set(nodeId, item);
    }
  });

  if (!stateExists) addError(errors, "plan.stateId", `未出现在拆解计划任何 stateVariants 中：「${plan.stateId}」`);
  if (activeItemsById.size === 0) addError(errors, "splitPlan.items", `没有适用于当前状态「${plan.stateId}」的屏幕 UI 拆解项`);

  for (const [nodeId, node] of nodesById) {
    const item = targetToItem.get(nodeId);
    if (!item) {
      addError(errors, `plan.nodes.${nodeId}`, "没有被当前状态屏幕 UI 拆解项覆盖");
      continue;
    }
    if (node.decompositionElementId !== item.id) {
      addError(errors, `plan.nodes.${nodeId}.decompositionElementId`, `必须绑定拆解项「${item.id}」`);
    }
    if (node.parentElementId !== item.parentElementId) {
      addError(errors, `plan.nodes.${nodeId}.parentElementId`, `与拆解项「${item.id}」的实际父节点不一致`);
    }
    if (!equalContractValue(node.semanticGrouping, item.semanticGrouping)) {
      addError(errors, `plan.nodes.${nodeId}.semanticGrouping`, `与拆解项「${item.id}」的语义分组不一致`);
    }
    if (!equalLayoutBinding(node.layoutBinding, item.layoutBinding, node.parentElementId)) {
      addError(errors, `plan.nodes.${nodeId}.layoutBinding`, `与拆解项「${item.id}」的完整布局合同不一致`);
    }
  }
  for (const nodeId of targetToItem.keys()) {
    if (!nodesById.has(nodeId)) addError(errors, "splitPlan.items.targetPrefabNodeIds", `当前状态拆解项声明了布局计划外节点「${nodeId}」`);
  }
  return { allItemsById, activeItemsById };
}

/** 校验 Prefab 阶段的 ID、路径、节点集合和单文件节点索引。 */
function collectPrefabStage(stage, prefabsKey, path, errors) {
  const prefabsById = new Map();
  const nodesById = new Map();
  const nodesByPrefabId = new Map();
  if (!Array.isArray(stage[prefabsKey])) {
    addError(errors, `${path}.${prefabsKey}`, "必须是 Prefab 数组");
    return { prefabsById, nodesById, nodesByPrefabId };
  }
  const prefabPaths = new Set();
  stage[prefabsKey].forEach((prefab, index) => {
    const prefabPath = `${path}.${prefabsKey}[${index}]`;
    if (!requireRecord(prefab, prefabPath, errors)) return;
    if (!requireId(prefab.id, `${prefabPath}.id`, errors)) return;
    if (prefabsById.has(prefab.id)) addError(errors, `${prefabPath}.id`, `重复 Prefab ID「${prefab.id}」`);
    if (!isNonEmptyString(prefab.path)) addError(errors, `${prefabPath}.path`, "必须是非空路径");
    if (prefabPaths.has(prefab.path)) addError(errors, `${prefabPath}.path`, `重复 Prefab 路径「${prefab.path}」`);
    prefabPaths.add(prefab.path);
    prefabsById.set(prefab.id, prefab);
    const localNodes = new Map();
    nodesByPrefabId.set(prefab.id, localNodes);
    if (!Array.isArray(prefab.nodes)) {
      addError(errors, `${prefabPath}.nodes`, "必须是节点数组");
      return;
    }
    prefab.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${prefabPath}.nodes[${nodeIndex}]`;
      if (!requireRecord(node, nodePath, errors)) return;
      if (!requireId(node.id, `${nodePath}.id`, errors)) return;
      requireId(node.decompositionElementId, `${nodePath}.decompositionElementId`, errors);
      requireId(node.parentId, `${nodePath}.parentId`, errors);
      if (nodesById.has(node.id)) addError(errors, `${nodePath}.id`, `跨 Prefab 重复节点 ID「${node.id}」`);
      if (localNodes.has(node.id)) addError(errors, `${nodePath}.id`, `Prefab 内重复节点 ID「${node.id}」`);
      nodesById.set(node.id, { node, prefab, prefabId: prefab.id, path: nodePath });
      localNodes.set(node.id, node);
    });
  });
  return { prefabsById, nodesById, nodesByPrefabId };
}

/** 判断 Prefab 阶段节点是否属于 UI 或其业务容器祖先。 */
function collectRelevantStructureNodeIds(structureData, planNodes, allItemsById, activeItemsById, errors, stagePath = "structure") {
  const relevant = new Set(planNodes.keys());
  const entries = [...structureData.nodesById.entries()];
  const activeTargetIds = new Set();
  for (const item of activeItemsById.values()) {
    if (Array.isArray(item.targetPrefabNodeIds)) item.targetPrefabNodeIds.forEach((id) => activeTargetIds.add(id));
  }
  for (const [id, entry] of entries) {
    const node = entry.node;
    if (node.nodeType !== undefined && !["CONTAINER", "VISUAL", "UI", "INTERACTION", "CAMERA", "LIGHT"].includes(node.nodeType)) {
      addError(errors, `${entry.path}.nodeType`, "不是支持的 Prefab 节点类型");
    }
    const hasUiShape = node.nodeType === "UI" || SCREEN_UI_SPACES.has(node.layoutBinding?.coordinateSpace);
    const item = allItemsById.get(node.decompositionElementId);
    if (hasUiShape && !item) {
      addError(errors, `${entry.path}.decompositionElementId`, "UI 节点没有任何拆解项身份，不能作为未知业务节点放行");
    } else if (hasUiShape) {
      if (!SCREEN_UI_SPACES.has(item.layoutBinding?.coordinateSpace)) {
        addError(errors, `${entry.path}.decompositionElementId`, "UI 节点来源拆解项必须声明屏幕 UI 坐标空间");
      }
      if (!Array.isArray(item.targetPrefabNodeIds) || !item.targetPrefabNodeIds.includes(node.id)) {
        addError(errors, `${entry.path}.decompositionElementId`, "UI 节点必须包含在来源拆解项的 targetPrefabNodeIds 中");
      }
      if (activeItemsById.has(node.decompositionElementId)) relevant.add(id);
    }
    if (activeTargetIds.has(id)) relevant.add(id);
  }

  // 业务容器祖先也必须来自 V2，避免装配阶段静默添加包装层。
  const pending = [...relevant];
  const visited = new Set();
  while (pending.length > 0) {
    const id = pending.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const entry = structureData.nodesById.get(id);
    const parentId = entry?.node.parentId;
    const parent = structureData.nodesById.get(parentId);
    if (!parent) continue;
    if (parent.node.nodeType === "CONTAINER" || SCREEN_UI_SPACES.has(parent.node.layoutBinding?.coordinateSpace)) {
      if (!relevant.has(parentId)) {
        relevant.add(parentId);
        pending.push(parentId);
      }
    }
  }

  for (const id of relevant) {
    if (!structureData.nodesById.has(id)) addError(errors, "structure.prefabs[].nodes", `缺少布局计划 UI 节点「${id}」`);
  }
  for (const id of relevant) {
    if (!planNodes.has(id)) addError(errors, `${stagePath}.prefabs[].nodes`, `存在未在 V2 布局计划中的 UI 节点或容器「${id}」`);
  }
  return relevant;
}

/** 比较结构与装配阶段所有 Prefab 身份、路径和节点集合。 */
function comparePrefabStages(structureData, assemblyData, planNodes, splitById, errors) {
  for (const [prefabId, structurePrefab] of structureData.prefabsById) {
    const assemblyPrefab = assemblyData.prefabsById.get(prefabId);
    if (!assemblyPrefab) {
      addError(errors, "assembly.prefabs", `缺少结构阶段 Prefab「${prefabId}」`);
      continue;
    }
    if (assemblyPrefab.path !== structurePrefab.path) addError(errors, `assembly.prefabs.${prefabId}.path`, "与结构阶段 Prefab 路径不一致");
    const structureNodes = structureData.nodesByPrefabId.get(prefabId) ?? new Map();
    const assemblyNodes = assemblyData.nodesByPrefabId.get(prefabId) ?? new Map();
    for (const id of structureNodes.keys()) {
      if (!assemblyNodes.has(id)) addError(errors, `assembly.prefabs.${prefabId}.nodes`, `缺少结构节点「${id}」`);
    }
    for (const id of assemblyNodes.keys()) {
      if (!structureNodes.has(id)) addError(errors, `assembly.prefabs.${prefabId}.nodes`, `存在结构阶段未知节点「${id}」`);
    }
  }
  for (const prefabId of assemblyData.prefabsById.keys()) {
    if (!structureData.prefabsById.has(prefabId)) addError(errors, "assembly.prefabs", `存在结构阶段未知 Prefab「${prefabId}」`);
  }

  for (const [id, structureEntry] of structureData.nodesById) {
    const assemblyEntry = assemblyData.nodesById.get(id);
    if (!assemblyEntry) continue;
    const structureNode = structureEntry.node;
    const assemblyNode = assemblyEntry.node;
    if (structureEntry.prefabId !== assemblyEntry.prefabId) addError(errors, `assembly.nodes.${id}`, "所属 Prefab 与结构阶段不一致");
    for (const key of ["parentId", "decompositionElementId"]) {
      if (assemblyNode[key] !== structureNode[key]) addError(errors, `assembly.nodes.${id}.${key}`, "与 Prefab 结构阶段不一致");
    }
    if (assemblyNode.name !== structureNode.name) addError(errors, `assembly.nodes.${id}.name`, "节点名称与 Prefab 结构阶段不一致");
    const planNode = planNodes.get(id);
    if (!planNode) continue;
    const splitItem = splitById.get(planNode.decompositionElementId);
    if (!splitItem || structureNode.decompositionElementId !== splitItem.id || assemblyNode.decompositionElementId !== splitItem.id) {
      addError(errors, `assembly.nodes.${id}.decompositionElementId`, "与 V2 拆解项身份不一致");
    }
    if (structureNode.parentId !== planNode.parentElementId || assemblyNode.parentId !== planNode.parentElementId) {
      addError(errors, `assembly.nodes.${id}.parentId`, "与布局计划中的实际父节点不一致");
    }
    validateSemanticGrouping(structureNode.semanticGrouping, `structure.nodes.${id}.semanticGrouping`, errors);
    validateSemanticGrouping(assemblyNode.semanticGrouping, `assembly.nodes.${id}.semanticGrouping`, errors);
    if (!equalContractValue(structureNode.semanticGrouping, planNode.semanticGrouping)
      || !equalContractValue(assemblyNode.semanticGrouping, planNode.semanticGrouping)) {
      addError(errors, `assembly.nodes.${id}.semanticGrouping`, "语义分组与布局计划不一致");
    }
    validateLayoutBinding(structureNode.layoutBinding, `structure.nodes.${id}.layoutBinding`, structureNode.parentId, errors);
    validateLayoutBinding(assemblyNode.layoutBinding, `assembly.nodes.${id}.layoutBinding`, assemblyNode.parentId, errors);
    if (!equalLayoutBinding(structureNode.layoutBinding, planNode.layoutBinding, planNode.parentElementId)
      || !equalLayoutBinding(assemblyNode.layoutBinding, planNode.layoutBinding, planNode.parentElementId)) {
      addError(errors, `assembly.nodes.${id}.layoutBinding`, "完整布局合同与布局计划不一致");
    }
  }
}

/** 计算 Prefab 内唯一根节点，根父级允许位于 Prefab 外。 */
function getPrefabRoot(prefabId, stageData, errors, stagePath) {
  const prefab = stageData.prefabsById.get(prefabId);
  if (!prefab) return null;
  const localNodes = stageData.nodesByPrefabId.get(prefabId) ?? new Map();
  const roots = [...localNodes.values()].filter((node) => !localNodes.has(node.parentId));
  if (roots.length !== 1) {
    addError(errors, `${stagePath}.${prefabId}.nodes`, `Prefab 必须有且仅有一个可识别根节点，当前为 ${roots.length} 个`);
    return null;
  }
  return roots[0];
}

/** 校验场景实例是否精确镜像 Prefab 根节点和拆解身份。 */
function collectSceneInstances(stage, stageData, instancesKey, stagePath, plan, splitById, errors) {
  const instances = stage[instancesKey];
  const byId = new Map();
  const byPrefabDecomposition = new Map();
  if (!Array.isArray(instances)) {
    addError(errors, `${stagePath}.${instancesKey}`, "必须是场景实例数组");
    return { byId, byPrefabDecomposition, instances: [] };
  }
  instances.forEach((instance, index) => {
    const path = `${stagePath}.${instancesKey}[${index}]`;
    if (!requireRecord(instance, path, errors)) return;
    if (!requireId(instance.id, `${path}.id`, errors)) return;
    if (byId.has(instance.id)) addError(errors, `${path}.id`, `重复场景实例 ID「${instance.id}」`);
    byId.set(instance.id, instance);
    if (!requireId(instance.prefabId, `${path}.prefabId`, errors)) return;
    if (!requireId(instance.decompositionElementId, `${path}.decompositionElementId`, errors)) return;
    if (!requireId(instance.parentId, `${path}.parentId`, errors)) return;

    const prefab = stageData.prefabsById.get(instance.prefabId);
    if (!prefab) {
      addError(errors, `${path}.prefabId`, `引用未知 Prefab「${instance.prefabId}」`);
      return;
    }
    const root = getPrefabRoot(instance.prefabId, stageData, errors, `${stagePath}.prefabs`);
    if (!root) return;
    if (instance.decompositionElementId !== root.decompositionElementId) {
      addError(errors, `${path}.decompositionElementId`, "必须对应该 Prefab 唯一根节点的拆解身份");
    }
    if (instance.parentId !== root.parentId) addError(errors, `${path}.parentId`, "必须与 Prefab 根和布局计划的实际父节点一致");
    if (instance.layoutBinding !== undefined
      && (!isRecord(instance.layoutBinding) || instance.layoutBinding.parentElementId !== instance.parentId)) {
      addError(errors, `${path}.layoutBinding.parentElementId`, "必须与实例的实际父节点一致");
    }
    if (stagePath === "structure") {
      if (instance.scenePath !== plan.scenePath) addError(errors, `${path}.scenePath`, "必须与布局计划 scenePath 一致");
    }
    const rootItem = splitById.get(root.decompositionElementId);
    if (!rootItem || !Array.isArray(rootItem.targetPrefabNodeIds) || !rootItem.targetPrefabNodeIds.includes(root.id)) {
      addError(errors, `${path}.decompositionElementId`, "Prefab 根节点没有被对应拆解项 targetPrefabNodeIds 覆盖");
    }
    if (!splitById.has(instance.decompositionElementId)) {
      addError(errors, `${path}.decompositionElementId`, "没有对应的拆解项");
    }
    const pairKey = `${instance.prefabId}\u0000${instance.decompositionElementId}`;
    if (byPrefabDecomposition.has(pairKey)) addError(errors, path, "重复挂载同一拆解根实例");
    byPrefabDecomposition.set(pairKey, instance);
  });
  return { byId, byPrefabDecomposition, instances };
}

/** 核对结构阶段与装配阶段场景实例的集合及真实父级。 */
function compareSceneInstances(structureInstances, assemblyInstances, errors) {
  for (const [id, structureInstance] of structureInstances.byId) {
    const assemblyInstance = assemblyInstances.byId.get(id);
    if (!assemblyInstance) {
      addError(errors, "assembly.scene.prefabInstances", `缺少结构实例「${id}」`);
      continue;
    }
    for (const key of ["prefabId", "decompositionElementId", "parentId"]) {
      if (assemblyInstance[key] !== structureInstance[key]) addError(errors, `assembly.scene.prefabInstances.${id}.${key}`, "与结构阶段场景实例不一致");
    }
    if (assemblyInstance.name !== undefined && structureInstance.name !== undefined && assemblyInstance.name !== structureInstance.name) {
      addError(errors, `assembly.scene.prefabInstances.${id}.name`, "与结构阶段场景实例名称不一致");
    }
    if (!equalContractValue(assemblyInstance.semanticGrouping, structureInstance.semanticGrouping)) {
      addError(errors, `assembly.scene.prefabInstances.${id}.semanticGrouping`, "与结构阶段场景实例不一致");
    }
    if (!equalLayoutBinding(assemblyInstance.layoutBinding, structureInstance.layoutBinding, structureInstance.parentId)) {
      addError(errors, `assembly.scene.prefabInstances.${id}.layoutBinding`, "与结构阶段场景实例布局合同不一致");
    }
  }
  for (const id of assemblyInstances.byId.keys()) {
    if (!structureInstances.byId.has(id)) addError(errors, "assembly.scene.prefabInstances", `存在结构阶段未知场景实例「${id}」`);
  }
}

/** 要求每个包含当前 UI 状态节点的 Prefab 根在场景中恰有一个挂载实例。 */
function validateCurrentUiRootInstances(instanceStage, currentPrefabIds, stageData, planNodes, stagePath, errors) {
  for (const prefabId of currentPrefabIds) {
    const matching = instanceStage.instances.filter((instance) => instance?.prefabId === prefabId);
    if (matching.length !== 1) {
      addError(errors, `${stagePath}.instances`, `当前状态 UI Prefab「${prefabId}」必须恰有一个根挂载实例，当前为 ${matching.length} 个`);
      continue;
    }
    const root = getPrefabRoot(prefabId, stageData, errors, `${stagePath}.prefabs`);
    if (!root) continue;
    const rootNode = [...planNodes.values()].find((node) => node.id === root.id);
    if (!rootNode) {
      addError(errors, `${stagePath}.prefabs.${prefabId}`, "当前状态 UI Prefab 根节点必须纳入布局计划和拆解覆盖");
      continue;
    }
    const instance = matching[0];
    if (!equalContractValue(instance.semanticGrouping, rootNode.semanticGrouping)) {
      addError(errors, `${stagePath}.instances.${instance.id}.semanticGrouping`, "必须与当前状态 Prefab 根节点语义分组一致");
    }
    validateLayoutBinding(instance.layoutBinding, `${stagePath}.instances.${instance.id}.layoutBinding`, rootNode.parentElementId, errors);
    if (!equalLayoutBinding(instance.layoutBinding, rootNode.layoutBinding, rootNode.parentElementId)) {
      addError(errors, `${stagePath}.instances.${instance.id}.layoutBinding`, "必须与 Prefab 根节点完整布局合同一致");
    }
    const structureRoot = stageData.nodesById.get(root.id)?.node;
    if (instance.name !== undefined && structureRoot?.name !== undefined && instance.name !== structureRoot.name) {
      addError(errors, `${stagePath}.instances.${instance.id}.name`, "必须与 Prefab 根节点名称一致");
    }
  }
}

/** 对账当前计划及 V2、Prefab 结构、Prefab 装配之间的 UI 层级事实。 */
export function validateUiHierarchyChain(plan, options = {}) {
  const errors = [];
  try {
    if (!requireRecord(plan, "plan", errors)) return errors;
    const config = isRecord(options) ? options : {};
    if (options !== undefined && !isRecord(options)) addError(errors, "options", "必须是对象");
    const splitPlan = config.splitPlan;
    const structure = config.structure;
    const assembly = config.assembly;
    const requireAssembly = config.requireAssembly === true;
    const requireApproved = config.requireApproved !== false;

    for (const key of ["sceneId", "stateId", "scenePath"]) requireId(plan[key], `plan.${key}`, errors);
    const planNodes = collectPlanNodes(plan, errors);
    if (!requireRecord(splitPlan, "splitPlan", errors)) return errors;
    if (!requireRecord(structure, "structure", errors)) return errors;
    if (requireAssembly && assembly === undefined) addError(errors, "assembly", "当前校验要求 Prefab 装配工件");
    if (assembly !== undefined && !requireRecord(assembly, "assembly", errors)) return errors;

    validateStageContext(splitPlan, "splitPlan", plan, errors, { requireId: true });
    validateStageContext(structure, "structure", plan, errors, { requireId: true });
    if (assembly !== undefined) validateStageContext(assembly, "assembly", plan, errors, { requireId: true });
    requireId(splitPlan.sourceVersion, "splitPlan.sourceVersion", errors);
    requireId(structure.version, "structure.version", errors);
    if (assembly !== undefined) requireId(assembly.version, "assembly.version", errors);
    if (requireApproved) validateSplitApproval(splitPlan, errors);

    const projectIds = [splitPlan, structure, ...(assembly === undefined ? [] : [assembly])]
      .map((stage, index) => {
        if (!isNonEmptyString(stage.projectId)) addError(errors, `projectContexts[${index}].projectId`, "必须是非空字符串");
        return stage.projectId;
      });
    if (new Set(projectIds).size > 1) addError(errors, "projectId", "拆解、结构和装配工件必须属于同一项目");

    const { allItemsById, activeItemsById } = collectActiveUiItems(plan, splitPlan, planNodes, errors);
    const approvalScope = splitPlan.userApproval?.approvalScope;
    const expectedAnnotationItems = requireApproved
      ? collectExpectedUiAnnotationItems(plan, allItemsById, activeItemsById, approvalScope)
      : activeItemsById;
    if (requireApproved && isRecord(splitPlan.userApproval?.approvalScope)) {
      validateUiAnnotations(
        approvalScope.annotatedPreview?.annotations,
        "approvalScope.annotatedPreview.annotations",
        expectedAnnotationItems,
        errors,
      );
    }
    if (splitPlan.annotatedPreview !== undefined) {
      if (!requireRecord(splitPlan.annotatedPreview, "splitPlan.annotatedPreview", errors)) {
        // 错误已记录；继续校验其他独立阶段。
      } else {
        validateUiAnnotations(splitPlan.annotatedPreview.annotations, "splitPlan.annotatedPreview.annotations", expectedAnnotationItems, errors);
      }
    }

    const structureData = collectPrefabStage(structure, "prefabs", "structure", errors);
    collectRelevantStructureNodeIds(structureData, planNodes, allItemsById, activeItemsById, errors);
    const currentPrefabIds = new Set([...planNodes.keys()]
      .map((nodeId) => structureData.nodesById.get(nodeId)?.prefabId)
      .filter(isNonEmptyString));
    for (const [nodeId, node] of planNodes) {
      const structureEntry = structureData.nodesById.get(nodeId);
      if (!structureEntry) continue;
      if (structureEntry.node.decompositionElementId !== node.decompositionElementId) {
        addError(errors, `structure.nodes.${nodeId}.decompositionElementId`, "必须与布局计划和 V2 拆解身份一致");
      }
      if (structureEntry.node.parentId !== node.parentElementId) {
        addError(errors, `structure.nodes.${nodeId}.parentId`, "必须与布局计划的实际父节点一致");
      }
      validateSemanticGrouping(structureEntry.node.semanticGrouping, `structure.nodes.${nodeId}.semanticGrouping`, errors);
      if (!equalContractValue(structureEntry.node.semanticGrouping, node.semanticGrouping)) {
        addError(errors, `structure.nodes.${nodeId}.semanticGrouping`, "与布局计划的语义分组不一致");
      }
      validateLayoutBinding(structureEntry.node.layoutBinding, `structure.nodes.${nodeId}.layoutBinding`, node.parentElementId, errors);
      if (!equalLayoutBinding(structureEntry.node.layoutBinding, node.layoutBinding, node.parentElementId)) {
        addError(errors, `structure.nodes.${nodeId}.layoutBinding`, "完整布局合同与布局计划不一致");
      }
      const item = allItemsById.get(node.decompositionElementId);
      if (!item || !item.targetPrefabNodeIds?.includes(nodeId)) {
        addError(errors, `structure.nodes.${nodeId}.decompositionElementId`, "没有被对应拆解项 targetPrefabNodeIds 覆盖");
      }
    }

    const structureInstances = collectSceneInstances(structure, structureData, "sceneInstances", "structure", plan, allItemsById, errors);
    validateCurrentUiRootInstances(structureInstances, currentPrefabIds, structureData, planNodes, "structure", errors);
    let assemblyData = null;
    if (assembly !== undefined && isRecord(assembly)) {
      assemblyData = collectPrefabStage(assembly, "prefabs", "assembly", errors);
      collectRelevantStructureNodeIds(assemblyData, planNodes, allItemsById, activeItemsById, errors, "assembly");
      if (!["PLANNED", "ASSEMBLED", "VERIFIED"].includes(assembly.status)) {
        addError(errors, "assembly.status", "已绑定的装配工件必须为 PLANNED、ASSEMBLED 或 VERIFIED");
      }
      if (!isRecord(assembly.scene)) addError(errors, "assembly.scene", "必须是场景对象");
      else {
        if (assembly.scene.path !== plan.scenePath) addError(errors, "assembly.scene.path", "必须与布局计划 scenePath 一致");
        const splitEvidence = assembly.splitPlanEvidence;
        if (!requireRecord(splitEvidence, "assembly.splitPlanEvidence", errors)) {
          // 错误已记录。
        } else {
          requireId(splitEvidence.subjectVersion, "assembly.splitPlanEvidence.subjectVersion", errors);
          if (splitEvidence.subjectId !== splitPlan.id || splitEvidence.subjectVersion !== splitPlan.sourceVersion) {
            addError(errors, "assembly.splitPlanEvidence", "必须绑定当前拆解计划 id 和 sourceVersion");
          }
        }
        const structureEvidence = assembly.prefabStructureEvidence;
        if (!requireRecord(structureEvidence, "assembly.prefabStructureEvidence", errors)) {
          // 错误已记录。
        } else {
          requireId(structureEvidence.subjectVersion, "assembly.prefabStructureEvidence.subjectVersion", errors);
          if (structureEvidence.subjectId !== structure.id || structureEvidence.subjectVersion !== structure.version) {
            addError(errors, "assembly.prefabStructureEvidence", "必须绑定当前 Prefab 结构 id 和 version");
          }
        }
        const assemblyInstances = collectSceneInstances(assembly.scene, assemblyData, "prefabInstances", "assembly.scene", plan, allItemsById, errors);
        validateCurrentUiRootInstances(assemblyInstances, currentPrefabIds, assemblyData, planNodes, "assembly.scene", errors);
        compareSceneInstances(structureInstances, assemblyInstances, errors);
      }
      comparePrefabStages(structureData, assemblyData, planNodes, allItemsById, errors);
    } else if (requireAssembly) {
      addError(errors, "assembly", "当前校验要求 Prefab 装配工件");
    }
    return errors;
  } catch (error) {
    // 外部 JSON 可能形状损坏；将异常转成诊断，保证验证器自身不抛出 TypeError。
    addError(errors, "uiHierarchyChain", `无法安全完成对账：${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }
}

/** 将 Prefab 装配节点按稳定实际 ID 建索引，拒绝重复或缺失名称。 */
function collectAssemblyNodes(assembly, errors) {
  const nodesById = new Map();
  if (!isRecord(assembly) || !Array.isArray(assembly.prefabs)) {
    addError(errors, "assembly.prefabs", "必须是 Prefab 数组");
    return nodesById;
  }
  assembly.prefabs.forEach((prefab, prefabIndex) => {
    const path = `assembly.prefabs[${prefabIndex}]`;
    if (!requireRecord(prefab, path, errors)) return;
    if (!Array.isArray(prefab.nodes)) {
      addError(errors, `${path}.nodes`, "必须是节点数组");
      return;
    }
    prefab.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${path}.nodes[${nodeIndex}]`;
      if (!requireRecord(node, nodePath, errors)) return;
      if (!requireId(node.id, `${nodePath}.id`, errors)) return;
      requireId(node.name, `${nodePath}.name`, errors);
      if (nodesById.has(node.id)) addError(errors, `${nodePath}.id`, `重复装配节点 ID「${node.id}」`);
      nodesById.set(node.id, node);
    });
  });
  return nodesById;
}

/** 将 V4 实测对象名称绑定到对应装配节点，防止仅复用布局节点 ID。 */
export function validateUiAssemblyMeasurement(plan, assembly, report) {
  const errors = [];
  try {
    if (!requireRecord(plan, "plan", errors)) return errors;
    const planNodes = collectPlanNodes(plan, errors);
    const assemblyNodes = collectAssemblyNodes(assembly, errors);
    if (!requireRecord(report, "report", errors)) return errors;
    if (!Array.isArray(report.measurements)) {
      addError(errors, "report.measurements", "必须是实测数组");
      return errors;
    }
    if (!["UGUI", "UI_TOOLKIT"].includes(plan.uiSystem)) addError(errors, "plan.uiSystem", "必须是 UGUI 或 UI_TOOLKIT");

    const measurementsById = new Map();
    report.measurements.forEach((measurement, index) => {
      const path = `report.measurements[${index}]`;
      if (!requireRecord(measurement, path, errors)) return;
      if (!requireId(measurement.id, `${path}.id`, errors)) return;
      if (measurementsById.has(measurement.id)) addError(errors, `${path}.id`, `重复实测 ID「${measurement.id}」`);
      measurementsById.set(measurement.id, measurement);
    });

    for (const nodeId of planNodes.keys()) {
      const node = planNodes.get(nodeId);
      const assemblyNode = assemblyNodes.get(nodeId);
      if (!assemblyNode) {
        addError(errors, "assembly.prefabs[].nodes", `缺少布局节点「${nodeId}」对应的装配节点`);
        continue;
      }
      if (!isNonEmptyString(assemblyNode.name)) {
        addError(errors, `assembly.nodes.${nodeId}.name`, "必须是非空节点名称");
        continue;
      }
      const measurement = measurementsById.get(nodeId);
      if (!measurement) {
        addError(errors, "report.measurements", `缺少布局节点「${nodeId}」的 V4 实测`);
        continue;
      }
      if (plan.uiSystem === "UGUI") {
        if (!isNonEmptyString(measurement.objectPath)) {
          addError(errors, `report.measurements.${nodeId}.objectPath`, "UGUI 实测必须提供实际对象路径");
          continue;
        }
        const pathParts = measurement.objectPath.split("/");
        const actualName = pathParts[pathParts.length - 1];
        if (actualName !== assemblyNode.name) {
          addError(errors, `report.measurements.${nodeId}.objectPath`, `末段名称必须与装配节点名称「${assemblyNode.name}」一致`);
        }
      } else if (measurement.elementName !== assemblyNode.name) {
        addError(errors, `report.measurements.${nodeId}.elementName`, `必须与装配节点名称「${assemblyNode.name}」一致`);
      }
      if (node.id !== nodeId) addError(errors, `plan.nodes.${nodeId}.id`, "实测 ID 与布局节点身份不一致");
    }
    for (const measurementId of measurementsById.keys()) {
      if (!planNodes.has(measurementId)) addError(errors, "report.measurements", `包含布局计划未知的实测 ID「${measurementId}」`);
    }
    return errors;
  } catch (error) {
    // 报告来自外部工具；损坏输入应被报告为失败而不是让校验流程异常退出。
    addError(errors, "uiAssemblyMeasurement", `无法安全完成对账：${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }
}
