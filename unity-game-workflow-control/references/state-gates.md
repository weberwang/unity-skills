# 状态、阶段与停止门

## 全局状态

主路径是 `INTAKE → BASELINE → PROPOSAL → REVIEW → IMPLEMENTING → VALIDATING → PASSED`。通过证据后按任务需要进入 `INTEGRATING`、`RELEASE_APPROVAL_REQUIRED`、`RELEASING` 和 `COMPLETE`。`BLOCKED` 表示硬门失败；`RETURN` 表示上游事实或范围真实失效。

`run` 只沿主路径前向推进已满足门禁的安全状态，进入 `IMPLEMENTING` 后停止等待实际实施；它永远不选择 `RETURN`、不批准用户决定、不执行设备/外部/发布操作。

可见 `SCENE` 与 `DISPLAY_LAYER` 在 `scene-production` 内分别推进自己的 V0-V4。V0 只作内部识别与分流，不进入 `stageReviews`；V1–V4 按阶段门推进，V2 必须分别确认拆解图和布局图。`hostSceneId` 仅作为 DISPLAY_LAYER 的上下文依赖；缺少独立 `displayLayerId`、层类型、阶段或状态时直接阻断，不允许把弹窗挂回宿主场景工作项。

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
RETURN                    → BASELINE | PROPOSAL | REVIEW | IMPLEMENTING
BLOCKED                   → BASELINE | PROPOSAL | REVIEW | IMPLEMENTING
COMPLETE                  → (无)
```

`transition` 严格拒绝跳跃和普通回退。进入 `RETURN` 必须记录分类、理由、`affectedScope` 和失效产物；恢复点由控制面根据受影响范围推导，并归档当前执行状态，不接受用户指定 `return-state`。`repair` 和 `revalidate` 不能把 `RETURN` 改成前向状态；`run` 不选择 `RETURN` 或恢复点。

退回记录用 `invalidatedReferences` 保存失效包、证据的路径与身份以及计划版本；再次退回时在 `priorInvalidatedReferences` 累积历史快照。恢复后仍禁止重新绑定这些路径或身份，不能先空引用恢复，再延后复用旧包、旧证据或旧 Result。`RETURN` 必须直接恢复到推导入口，不能借 `BLOCKED` 绕过；重新提交需新包、新证据及当前计划的执行结果。

例如基础规则需求变化时，先执行：

```text
node <skill-dir>/scripts/workflow-control.mjs transition --repo <repo> --work-item <file> --to RETURN --return-category scope-changed --return-reason "基础规则需求变化" --affected-scope stage:foundation-engineering
```

读取返回记录的 `returnState`，按真实修复结果重做失效门和必要阶段确认，不能直接把重置后的 `NOT_RUN` 填成 `PASS`。恢复命令必须附带 `--return-resolution <解决情况说明>`；该参数说明如何解决退回原因，不用于选择恢复点。恢复到 `IMPLEMENTING` 还须显式传入新路径、新身份的实施包；所需 F0/F1/F2 门未重新满足时会继续阻断：

```text
node <skill-dir>/scripts/workflow-control.mjs transition --repo <repo> --work-item <file> --to IMPLEMENTING --return-resolution "已重审规则并完成当前前置门" --implementation-package <new-package-file>
```

BASELINE/PROPOSAL 等恢复入口同样沿用推导结果和解决说明，后续按正常门禁重新推进。控制面只核对已有事实，不会代为执行修复、验收命令或人工确认。

视觉阶段和确认从真实受影响点失效：仅 V4 实现或当前阶段局部产物返修时，保持 V4 并保留已确认的 V1–V3；明确影响 V3 资源时退到 V3 并保留 V1/V2。多个范围取最早入口，退回不得使视觉阶段前进；实施包和机器证据仍须重新形成。

## 迁移门

- `SCENE`、`DISPLAY_LAYER` 的 V1–V4 依次满足[人工确认](stage-confirmation.md)。V0 不要求确认；V2 的拆解与布局须分别确认，且先拆解后布局。`scene-stage --to V1|V2|V3|V4 --work-item <file>` 只允许相邻推进；V3→V4 还要求 Evidence 为 `PASS` 且当前执行单元全部闭环。推进后清除旧阶段消费引用、归档执行状态，将新阶段置为 `PROPOSAL`，重置 F2/F3/F4，并绑定新实施包；之后由 `run` 进入实施。V4 未确认不能进入 COMPLETE，阶段确认不替代 F0–F4 或运行证据。
- 离开 `INTAKE` 必须通过 F0；离开 `BASELINE`/`PROPOSAL` 必须通过 F1；进入生产实施前必须通过 F2。
- 进入 `IMPLEMENTING` 必须绑定当前 Work Item 的实施包；每个单元必须提供非空 `acceptanceCommands`。进入时在当前 `evidenceRoot` 创建 `execution-state.json`。
- 当前单元完成必须提供绑定该工作项、实施包、单元业务身份、验收命令和计划顺序的 `Result`；业务身份包括 `moduleId`、`scopeId`、`sceneId`、`displayLayerId` 和 `hostSceneId`。真实证据文件及命令的 `outputFile` 必须位于 `evidenceRoot`。`unit-check --result <json>` 仅在 `IMPLEMENTING` 状态校验当前单元的结果、`PASS` 和顺序，不执行验收命令。业务资源、布局及其他合同引用按各自 schema 校验，不塞进受限的执行证据文件路径。
- 进入 `VALIDATING` 前重新校验当前 `execution-state.units`，确认全部计划单元都有绑定有效的完成结果，且共享设置与集成单元按声明顺序闭合。Implementation Package 的 `unit.status` 只是冻结计划快照，不改写，也不能代替执行结果；不得以手填状态替代 `Result`。
- 进入 `PASSED` 必须有相同基线和实施包的 Evidence Manifest，且 F0-F3 和适用 Unity 证据为 PASS。
- 骨骼交付还必须通过[角色资产交付门禁](rigging-delivery-gate.md)：当前角色工程报告与目标项目角色播放回归均通过，身份、版本、原始用例和资源时效有效。`check`、`run` 与正常 `transition` 均不能用静态 F3 PASS 绕过；失败诊断按岗位退修，由独立 QA 复验。
- `PASSED` 没有证据时仍是未闭环状态；`status`/`run` 必须返回阻断，不能自动进入 `COMPLETE`。
- A4-A6 的副作用必须通过 F4 精确批准；批准不继承到下一个对象、阶段、基线或发布批次。
- 可见 Work Item 实施前明确 Unity 原生 `responsiveContract`；可见包通过 `responsiveContractRef.path/version` 记录来源，且 `SCENE` 与 `DISPLAY_LAYER` 不能混包。验收以实际完成情况满足用户要求为准，实现调整无需回改合同，不比对合同内容、版本或 SHA。
- V4 PASS 必须由真实 Game View/Screen/backbuffer、CanvasScaler 或 PanelSettings、Camera、`Screen.safeArea`、InputSystem/EventSystem 命中、同进程连续 resize 轨迹和截图共同证明；按 `supportedOrientations` 验证实际支持方向，双方向或自动方向另须 orientation 切换轨迹。静态声明、构建成功或单图均不得替代。

## 三级处置

1. `repair`：补齐字段、路径、所有权或可补的证据，保持候选和阶段不变。
2. `revalidate`：候选和基线身份未变，只重新获取失效或过期的机器证据。
3. `return`：上游事实失效、范围变化或继续推进会绕过硬门；记录 `affectedScope`，由控制面推导最早受影响阶段并归档执行状态，不接受用户指定恢复状态。
