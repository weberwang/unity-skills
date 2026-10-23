import { computeTargetBounds } from "./layout-geometry.mjs";
import { validateUiLayoutPlanShape } from "./layout-plan-shape.mjs";

const ROOT_IDS = new Set(["viewport", "safe-area"]);
const EPSILON = 1e-6;

/** 检查输入是否仍是可安全遍历的有限 JSON 数据，避免循环引用等异常逃逸。 */
function inspectJsonValue(value, active = new Set()) {
  if (typeof value === "number" && !Number.isFinite(value)) return "布局计划不能包含 NaN 或无穷数值。";
  if (value === null || typeof value !== "object") return null;
  if (active.has(value)) return "布局计划不能包含循环引用。";
  active.add(value);
  for (const child of Object.values(value)) {
    const error = inspectJsonValue(child, active);
    if (error) return error;
  }
  active.delete(value);
  return null;
}

/** 判断 inner 矩形是否完整落在 outer 矩形中。 */
function isContained(inner, outer) {
  return inner.x >= outer.x - EPSILON
    && inner.y >= outer.y - EPSILON
    && inner.x + inner.width <= outer.x + outer.width + EPSILON
    && inner.y + inner.height <= outer.y + outer.height + EPSILON;
}

/** 安全区策略沿功能父链继承，后代不能用 FULL_BLEED 覆盖祖先边界。 */
function requiresSafeArea(node, nodesById) {
  if (node.layoutBinding.uiLayout.safeAreaPolicy === "INSIDE_SAFE_AREA") return true;
  let parentId = node.parentElementId;
  const visited = new Set();
  while (!ROOT_IDS.has(parentId) && nodesById.has(parentId) && !visited.has(parentId)) {
    if (parentId === "safe-area" || nodesById.get(parentId).layoutBinding.uiLayout.safeAreaPolicy === "INSIDE_SAFE_AREA") return true;
    visited.add(parentId);
    parentId = nodesById.get(parentId).parentElementId;
  }
  return parentId === "safe-area";
}

/** 取节点声明的位置参照；未声明时沿用功能父级。 */
function positionReference(node) {
  return node.layoutBinding.positionReferenceId ?? node.parentElementId;
}

/** 检查父节点是否是给定节点的祖先，父级和位置参照共用同一层级事实。 */
function isAncestor(candidateId, node, nodesById) {
  let parentId = node.parentElementId;
  const visited = new Set();
  while (!ROOT_IDS.has(parentId) && nodesById.has(parentId) && !visited.has(parentId)) {
    if (parentId === candidateId) return true;
    visited.add(parentId);
    parentId = nodesById.get(parentId).parentElementId;
  }
  return false;
}

/** 检查父级边和参照边合并后的依赖图，保证派生顺序确定。 */
function validateDependencyCycles(nodes, nodesById, errors) {
  const complete = new Set();
  const active = new Set();
  const reported = new Set();

  /** 沿所有布局依赖递归访问，并报告每个循环中的节点一次。 */
  function visit(nodeId, trail) {
    if (active.has(nodeId)) {
      const start = trail.indexOf(nodeId);
      for (const cyclicId of trail.slice(start)) reported.add(cyclicId);
      return;
    }
    if (complete.has(nodeId)) return;
    active.add(nodeId);
    const node = nodesById.get(nodeId);
    const dependencies = [node.parentElementId, positionReference(node)];
    for (const dependency of new Set(dependencies)) {
      if (nodesById.has(dependency)) visit(dependency, [...trail, nodeId]);
    }
    active.delete(nodeId);
    complete.add(nodeId);
  }

  for (const node of nodes) visit(node.id, []);
  for (const nodeId of reported) errors.push(`节点 ${nodeId} 的父级与位置参照联合形成循环。`);
}

/** 验证输入与派生矩形的父框、viewport 和 safe-area 边界。 */
function validateGeometry(plan, nodesById, errors, targetBounds = null) {
  const viewport = plan.roots.viewport;
  const safeArea = plan.roots["safe-area"];
  if (!isContained(safeArea, viewport)) errors.push("safe-area 必须完整位于 viewport 内。");

  for (const node of plan.nodes) {
    const bounds = targetBounds?.get(node.id) ?? node.bounds;
    const isDerived = targetBounds !== null;
    const parentId = node.parentElementId;
    const parent = nodesById.get(parentId);
    const parentBounds = parent
      ? (isDerived ? targetBounds.get(parentId) : parent.bounds)
      : plan.roots[parentId];
    const overflow = node.layoutBinding.uiLayout.visualOverflow;
    const stage = isDerived ? "派生位置" : "原始位置";

    if (!isContained(bounds, viewport)) errors.push(`节点 ${node.id} 的${stage}超出 viewport；visualOverflow 不能豁免根边界。`);
    if (requiresSafeArea(node, nodesById) && !isContained(bounds, safeArea)) {
      errors.push(`节点 ${node.id} 的${stage}未完整落入 safe-area。`);
    }
    if (!parentBounds) continue;
    if (!isContained(bounds, parentBounds)) {
      if (!parent && overflow) errors.push(`节点 ${node.id} 的 visualOverflow 不能豁免 viewport 或 safe-area 根边界。`);
      else if (parent && !overflow) errors.push(`节点 ${node.id} 超出非根父节点 ${parentId}，需说明 visualOverflow.reason。`);
    }
    if (!parent && overflow) errors.push(`节点 ${node.id} 的父级是根参照 ${parentId}，不能声明 visualOverflow。`);
  }
}

/** 检查参照范围、坐标系统、结构容器职责和居中成员组等跨字段约束。 */
function validatePlanSemantics(plan, errors) {
  const nodesById = new Map();
  for (const node of plan.nodes) {
    if (ROOT_IDS.has(node.id)) errors.push(`节点 ID ${node.id} 与保留根 ID 冲突。`);
    if (nodesById.has(node.id)) errors.push(`节点 ID ${node.id} 重复。`);
    else nodesById.set(node.id, node);
  }

  const expectedLayoutSpace = plan.uiSystem === "UGUI" ? ["CANVAS_LOCAL", "SCREEN_SAFE_AREA"] : ["UI_TOOLKIT_PANEL"];
  const expectedCoordinateSpace = plan.uiSystem === "UGUI" ? "SCREEN_SPACE_PIXELS" : "UI_TOOLKIT_LOGICAL_POINTS";
  if (plan.coordinateSpace !== expectedCoordinateSpace) errors.push(`uiSystem ${plan.uiSystem} 必须使用 ${expectedCoordinateSpace}。`);

  for (const node of plan.nodes) {
    const binding = node.layoutBinding;
    const parentId = node.parentElementId;
    const referenceId = positionReference(node);
    if (binding.parentElementId !== parentId) errors.push(`节点 ${node.id} 的 parentElementId 与 layoutBinding.parentElementId 必须一致。`);
    if (binding.hierarchyRelation !== "PARENT_CHILD") errors.push(`节点 ${node.id} 必须声明 PARENT_CHILD 层级关系。`);
    if (!expectedLayoutSpace.includes(binding.coordinateSpace)) errors.push(`节点 ${node.id} 的 layoutBinding.coordinateSpace 与 ${plan.uiSystem} 不匹配。`);
    if (!ROOT_IDS.has(parentId) && !nodesById.has(parentId)) errors.push(`节点 ${node.id} 的功能父级 ${parentId} 不存在。`);
    const functionalParent = nodesById.get(parentId);
    if (functionalParent?.renderKind === "BACKGROUND") errors.push(`节点 ${node.id} 不能把装饰性 BACKGROUND ${parentId} 当成功能父级。`);
    if (parentId === "safe-area" && binding.uiLayout.safeAreaPolicy !== "INSIDE_SAFE_AREA") {
      errors.push(`节点 ${node.id} 以 safe-area 为父级时必须使用 INSIDE_SAFE_AREA。`);
    }

    if (referenceId === node.id) errors.push(`节点 ${node.id} 不能把自己作为位置参照。`);
    else if (!ROOT_IDS.has(referenceId)) {
      const reference = nodesById.get(referenceId);
      if (!reference) errors.push(`节点 ${node.id} 的位置参照 ${referenceId} 不存在。`);
      else {
        if (reference.renderKind === "BACKGROUND") errors.push(`节点 ${node.id} 不能引用装饰性 BACKGROUND 节点 ${referenceId}。`);
        const sibling = reference.parentElementId === parentId;
        const ancestor = isAncestor(referenceId, node, nodesById);
        if (!sibling && !ancestor) errors.push(`节点 ${node.id} 的位置参照 ${referenceId} 必须是兄弟、祖先或根参照。`);
      }
    }

    for (const axis of ["horizontal", "vertical"]) {
      const center = binding.centerAlignment?.[axis];
      if (center && binding.axisAlignment[axis] !== "center") {
        errors.push(`节点 ${node.id} 的 ${axis} centerAlignment 只能用于 axisAlignment=center。`);
      }
      if (center?.mode === "reference" && center.reason.trim().length === 0) {
        errors.push(`节点 ${node.id} 的 ${axis} reference 居中理由不能为空。`);
      }
      if (center?.mode === "strict" && center.offset !== undefined && center.offset !== 0) {
        errors.push(`节点 ${node.id} 的 ${axis} strict 居中必须使用零偏移。`);
      }
    }
  }

  validateDependencyCycles(plan.nodes, nodesById, errors);
  validateContainerReasons(plan.nodes, errors);
  validateCenterGroups(plan.nodes, nodesById, errors);
  validateGeometry(plan, nodesById, errors);
}

/** 仅在 STRUCTURE 额外包住 SPRITE 底板及内容时要求说明独立职责。 */
function validateContainerReasons(nodes, errors) {
  const childrenByParent = new Map();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentElementId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentElementId, siblings);
  }
  for (const node of nodes) {
    if (node.renderKind !== "STRUCTURE") continue;
    const directChildren = childrenByParent.get(node.id) ?? [];
    const spriteBackings = directChildren.filter((child) => child.renderKind === "SPRITE");
    const wrapsBackingAndContent = spriteBackings.some((sprite) => directChildren.length > 1
      || (childrenByParent.get(sprite.id) ?? []).length > 0);
    const reason = node.layoutBinding.uiLayout.independentContainerReason;
    if (wrapsBackingAndContent && (!reason || reason.trim().length === 0)) {
      errors.push(`STRUCTURE 节点 ${node.id} 额外包住 SPRITE 底板及内容时，需填写 independentContainerReason。`);
    }
  }
}

/** 校验图文整体居中成员的归属、leader 外部参照和单一 leader 规则。 */
function validateCenterGroups(nodes, nodesById, errors) {
  const membershipOwner = new Map();
  for (const leader of nodes) {
    const group = leader.layoutBinding.centerAlignment?.memberIds;
    if (!group) continue;
    const groupSet = new Set(group);
    if (!groupSet.has(leader.id)) errors.push(`居中成员组 leader ${leader.id} 必须包含自身。`);
    const externalReferenceId = positionReference(leader);
    if (groupSet.has(externalReferenceId)) errors.push(`居中成员组 ${leader.id} 的位置参照必须在成员组外。`);
    for (const axis of ["horizontal", "vertical"]) {
      if (leader.layoutBinding.centerAlignment[axis]?.mode === undefined) continue;
      for (const memberId of group) {
        const member = nodesById.get(memberId);
        if (!member) {
          errors.push(`居中成员组 ${leader.id} 引用了不存在的成员 ${memberId}。`);
          continue;
        }
        if (member.parentElementId !== leader.parentElementId) {
          errors.push(`居中成员组 ${leader.id} 与成员 ${memberId} 必须共享功能父级。`);
        }
        if (member.id !== leader.id && member.layoutBinding.centerAlignment?.[axis]) {
          errors.push(`居中成员 ${memberId} 不能覆盖 leader ${leader.id} 的 ${axis} 整体居中策略。`);
        }
        const previousLeader = membershipOwner.get(memberId);
        if (previousLeader && previousLeader !== leader.id) errors.push(`节点 ${memberId} 不能同时属于多个居中成员组。`);
        membershipOwner.set(memberId, leader.id);
      }
    }
  }
}

/** 比较派生结果和计划中已有的 targetBounds，输入值不会成为派生依据。 */
function validateSuppliedTargets(plan, errors, requireDerived) {
  const suppliedCount = plan.nodes.filter((node) => node.targetBounds !== undefined).length;
  if (suppliedCount === 0) {
    if (requireDerived) errors.push("此入口要求布局计划包含由派生器生成的 targetBounds。");
    return;
  }
  if (suppliedCount !== plan.nodes.length) {
    errors.push("targetBounds 必须在所有节点上同时提供，或由派生器统一生成。");
    return;
  }
  const expected = computeTargetBounds(plan);
  for (const node of plan.nodes) {
    const target = expected.get(node.id);
    const supplied = node.targetBounds;
    if (["x", "y", "width", "height"].some((key) => Math.abs(target[key] - supplied[key]) > EPSILON)) {
      errors.push(`节点 ${node.id} 的 targetBounds 与从原始 bounds 重算的结果不一致。`);
    }
  }
  validateGeometry(plan, new Map(plan.nodes.map((node) => [node.id, node])), errors, expected);
}

/** 校验 UI 布局计划并返回中文错误列表；错误输入不会因字段缺失而抛 TypeError。 */
export function validateUiLayoutPlan(plan, options = {}) {
  try {
    const requireDerived = options !== null && typeof options === "object" && options.requireDerived === true;
    const jsonError = inspectJsonValue(plan);
    if (jsonError) return [jsonError];
    const shapeErrors = validateUiLayoutPlanShape(plan);
    if (shapeErrors.length > 0) return shapeErrors;
    const errors = [];
    validatePlanSemantics(plan, errors);
    if (errors.length === 0) validateSuppliedTargets(plan, errors, requireDerived);
    return errors;
  } catch (error) {
    return [`无法安全校验 UI 布局计划：${error instanceof Error ? error.message : String(error)}`];
  }
}
