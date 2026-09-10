# 状态、阶段与停止门

## 全局状态

主路径是 `INTAKE → BASELINE → PROPOSAL → REVIEW → IMPLEMENTING → VALIDATING → PASSED`。通过证据后按任务需要进入 `INTEGRATING`、`RELEASE_APPROVAL_REQUIRED`、`RELEASING` 和 `COMPLETE`。`BLOCKED` 表示硬门失败；`RETURN` 表示上游事实或范围真实失效。

`run` 只沿主路径前向推进已满足门禁的安全状态，进入 `IMPLEMENTING` 后停止等待实际实施；它永远不选择 `RETURN`、不批准用户决定、不执行设备/外部/发布操作。

## 合法迁移

```text
INTAKE                    → BASELINE | BLOCKED
BASELINE                  → PROPOSAL | BLOCKED
PROPOSAL                  → REVIEW | BLOCKED | RETURN
REVIEW                    → IMPLEMENTING | VALIDATING | BLOCKED | RETURN
IMPLEMENTING              → VALIDATING | BLOCKED | RETURN
VALIDATING                → PASSED | BLOCKED | RETURN
PASSED                    → INTEGRATING | RELEASE_APPROVAL_REQUIRED | COMPLETE | BLOCKED | RETURN
INTEGRATING               → COMPLETE | RELEASE_APPROVAL_REQUIRED | BLOCKED | RETURN
RELEASE_APPROVAL_REQUIRED → RELEASING | BLOCKED | RETURN
RELEASING                 → COMPLETE | BLOCKED
RETURN                    → BASELINE | PROPOSAL | REVIEW | IMPLEMENTING | BLOCKED
BLOCKED                   → BASELINE | PROPOSAL | REVIEW | IMPLEMENTING
COMPLETE                  → (无)
```

`transition` 严格拒绝跳跃和普通回退。进入 `RETURN` 只能显式提供分类、理由、最小受影响范围和失效产物；从 `RETURN` 恢复也必须显式指定目标状态。`run` 对这两类状态只输出阻断，不写入恢复状态。

## 迁移门

- 离开 `INTAKE` 必须通过 F0；离开 `BASELINE`/`PROPOSAL` 必须通过 F1；进入生产实施前必须通过 F2。
- 进入 `IMPLEMENTING` 必须绑定当前 Work Item 的实施包；A3 不能只靠一句“已完成”跳过实施包。
- 进入 `VALIDATING` 前，实施包所有单元必须为 `COMPLETE`，共享设置与集成单元必须按声明顺序闭合。
- 进入 `PASSED` 必须有相同基线和实施包的 Evidence Manifest，且 F0-F3 和适用 Unity 证据为 PASS。
- `PASSED` 没有证据时仍是未闭环状态；`status`/`run` 必须返回阻断，不能自动进入 `COMPLETE`。
- A4-A6 的副作用必须通过 F4 精确批准；批准不继承到下一个对象、阶段、基线或发布批次。

## 三级处置

1. `repair`：补齐字段、路径、所有权或可补的证据，保持候选和阶段不变。
2. `revalidate`：候选和基线身份未变，只重新获取失效或过期的机器证据。
3. `return`：上游事实失效、范围变化或继续推进会绕过硬门；显式记录最小影响范围，再从指定前序状态重新开始。

