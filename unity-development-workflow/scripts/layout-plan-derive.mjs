import { computeTargetBounds } from "./layout-geometry.mjs";
import { validateUiLayoutPlan } from "./layout-plan-validation.mjs";

/** 校验并深拷贝布局计划，再从原始 bounds 派生各节点 targetBounds。 */
export function deriveUiLayoutPlan(plan) {
  const sourceErrors = validateUiLayoutPlan(plan);
  if (sourceErrors.length) throw new Error(sourceErrors.join("；"));

  const derived = structuredClone(plan);
  const targetBounds = computeTargetBounds(plan);
  for (const node of derived.nodes) node.targetBounds = targetBounds.get(node.id);

  // 最终复验再次只读原始 bounds，确保输出里的 targetBounds 无法反过来影响计算。
  const resultErrors = validateUiLayoutPlan(derived, { requireDerived: true });
  if (resultErrors.length) throw new Error(resultErrors.join("；"));
  return derived;
}
