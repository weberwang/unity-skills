/** 返回目标矩形某一轴的对齐锚点坐标。 */
function anchorCoordinate(rect, axis, alignment) {
  if (axis === "horizontal") {
    if (alignment === "left") return rect.x;
    if (alignment === "right") return rect.x + rect.width;
    return rect.x + rect.width / 2;
  }
  if (alignment === "top") return rect.y;
  if (alignment === "bottom") return rect.y + rect.height;
  return rect.y + rect.height / 2;
}

/** 返回矩形内指定对齐锚点相对左上角的偏移。 */
function localAnchorOffset(rect, axis, alignment) {
  if (axis === "horizontal") {
    if (alignment === "left") return 0;
    if (alignment === "right") return rect.width;
    return rect.width / 2;
  }
  if (alignment === "top") return 0;
  if (alignment === "bottom") return rect.height;
  return rect.height / 2;
}

/** 合并成员的原始矩形，为图文整体居中计算一个共用平移量。 */
function unionRect(nodesById, memberIds) {
  const rects = memberIds.map((id) => nodesById.get(id).bounds);
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 从原始 bounds 重新计算每个节点的 targetBounds。
 * bounds 与 roots 使用同一全局坐标空间；每一轴独立解析依赖，避免成员数组顺序改变布局结果。
 */
export function computeTargetBounds(plan) {
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const groupByMember = new Map();
  for (const node of plan.nodes) {
    const memberIds = node.layoutBinding.centerAlignment?.memberIds;
    if (!memberIds) continue;
    const group = { leaderId: node.id, memberIds, node };
    for (const memberId of memberIds) groupByMember.set(memberId, group);
  }

  const axisTargets = { horizontal: new Map(), vertical: new Map() };
  const activeAxes = { horizontal: new Set(), vertical: new Set() };
  const activeGroups = new Set();

  /** 取得一个参照在当前轴的原始与派生矩形。 */
  function referenceRects(referenceId, axis) {
    const source = nodesById.get(referenceId)?.bounds ?? plan.roots[referenceId];
    if (!source) throw new Error("布局位置参照不存在：" + referenceId);
    const targetPosition = nodesById.has(referenceId) ? computeAxis(referenceId, axis) : source[axis === "horizontal" ? "x" : "y"];
    const target = { ...source, [axis === "horizontal" ? "x" : "y"]: targetPosition };
    return { source, target };
  }

  /** 按原始参照间距推导单个节点的一轴，中心策略可覆盖普通锚点。 */
  function deriveAxis(node, axis, refRects) {
    const binding = node.layoutBinding;
    const alignment = binding.axisAlignment[axis];
    const center = binding.centerAlignment?.[axis];
    const size = axis === "horizontal" ? node.bounds.width : node.bounds.height;
    if (center) {
      const offset = center.mode === "strict" ? 0 : center.offset;
      return anchorCoordinate(refRects.target, axis, "center") + offset - size / 2;
    }
    if (alignment === "center") {
      // 普通 center 默认为严格零偏移，补偿只能由 reference 策略显式说明。
      return anchorCoordinate(refRects.target, axis, "center") - size / 2;
    }
    const sourceGap = anchorCoordinate(node.bounds, axis, alignment)
      - anchorCoordinate(refRects.source, axis, alignment);
    return anchorCoordinate(refRects.target, axis, alignment) + sourceGap
      - localAnchorOffset(node.bounds, axis, alignment);
  }

  /** 计算中心成员组共用轴位移，保留组员原始位置与组内间距。 */
  function computeGroupAxis(group, axis) {
    const cache = axisTargets[axis];
    if (cache.has(group.node.id)) return;
    const groupKey = `${group.leaderId}:${axis}`;
    if (activeGroups.has(groupKey)) throw new Error("布局居中成员依赖形成循环：" + group.leaderId);
    activeGroups.add(groupKey);
    const center = group.node.layoutBinding.centerAlignment[axis];
    const referenceId = group.node.layoutBinding.positionReferenceId ?? group.node.parentElementId;
    const refRects = referenceRects(referenceId, axis);
    const union = unionRect(nodesById, group.memberIds);
    const offset = center.mode === "strict" ? 0 : center.offset;
    const shift = anchorCoordinate(refRects.target, axis, "center") + offset
      - anchorCoordinate(union, axis, "center");
    const originKey = axis === "horizontal" ? "x" : "y";
    for (const memberId of group.memberIds) {
      const member = nodesById.get(memberId);
      cache.set(memberId, member.bounds[originKey] + shift);
    }
    activeGroups.delete(groupKey);
  }

  /** 递归解析节点的一轴位置，组内 sibling 参照按依赖关系自然求值。 */
  function computeAxis(id, axis) {
    const cache = axisTargets[axis];
    if (cache.has(id)) return cache.get(id);
    const group = groupByMember.get(id);
    if (group?.node.layoutBinding.centerAlignment?.[axis]) {
      computeGroupAxis(group, axis);
      return cache.get(id);
    }
    const active = activeAxes[axis];
    if (active.has(id)) throw new Error(`布局 ${axis} 位置参照形成循环：${id}`);
    active.add(id);
    const node = nodesById.get(id);
    const referenceId = node.layoutBinding.positionReferenceId ?? node.parentElementId;
    const value = deriveAxis(node, axis, referenceRects(referenceId, axis));
    cache.set(id, value);
    active.delete(id);
    return value;
  }

  /** 合并两轴结果，节点尺寸始终来自原始矩形。 */
  function computeNode(id) {
    const node = nodesById.get(id);
    return {
      x: computeAxis(id, "horizontal"),
      y: computeAxis(id, "vertical"),
      width: node.bounds.width,
      height: node.bounds.height,
    };
  }

  return new Map(plan.nodes.map((node) => [node.id, computeNode(node.id)]));
}
