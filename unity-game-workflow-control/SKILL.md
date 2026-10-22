---
name: unity-game-workflow-control
description: Unity 游戏仓库的唯一全局工作流控制面；以六阶段、A0-A6 风险、F0-F4 门禁、实施包和证据清单控制从需求到发布的可执行状态。
---

# Unity 游戏全局工作流控制

本 Skill 是 Unity 项目的唯一流程状态、风险门、范围和证据控制面。它只负责读取与校验 Work Item、Implementation Package、Evidence Manifest，以及在门禁满足时推进控制状态；它不启动 Unity Editor、服务、设备或发布流程。

验收以用户要求、实际完成情况、当前运行证据和人工确认是否满足完成条件为准。合同用于实施前明确目标与边界；已授权且保持目标的实现调整无需回改合同，也不因合同内容、版本或文件变化要求重新确认。这不授权静默替换已确认的视觉目标或改写历史确认。验收不计算、不要求、不比对 SHA；只有实际需求未满足、证据缺失或失效、范围改变及授权不足才阻断。

## 主闭环

1. 创建或读取 Work Item，冻结用户目标、范围、基线、阶段、`workItemType`、允许路径和验收边界；`SCENE` 与 `DISPLAY_LAYER` 必须在 `scene-production` 独立闭环。
2. 按当前阶段读取对应 reference，使用 `status`/`check` 诊断；缺少事实时先完成只读调查。
3. 实施前冻结 Implementation Package。每个单元必须有类型、所有者、路径、顺序和 Unity 序列化资源所有权；`SCENE` 与 `DISPLAY_LAYER` 不得混包，身份字段必须精确绑定。
4. 可见 `SCENE`/`DISPLAY_LAYER` 实施前明确 Unity 原生 `responsiveContract`；可见实施包用合同文件 `path/version` 记录来源，不强制与当前实现逐字段一致，不使用 CSS、DOM 或运行时 DPR 语义。
5. 实施后记录实际完成情况和 Evidence Manifest，证据必须属于相同的 Work Item、基线和实施包；V4 PASS 必须有真实 Game View/Screen/backbuffer、CanvasScaler 或 PanelSettings、Camera、Screen.safeArea、InputSystem/EventSystem 命中、同进程连续 resize 和截图。`responsiveEvidence.supportedOrientations` 记录实际支持方向，验收核对其满足用户要求；横屏无需验证竖屏，竖屏无需验证横屏，实际双方向或自动方向另须 orientation 切换轨迹。
6. 失败只选择 `repair`、`revalidate` 或显式 `RETURN`；控制面不会自动回退、扩大范围或伪造设备/发布证据。
7. 仅对当前精确对象、影响和范围授予 A4-A6 的明确批准；`run` 不替用户作出决定，也不执行副作用。
8. `SCENE` 与 `DISPLAY_LAYER` 的 V0 只作内部识别与分流，不要求确认也不写入 `stageReviews`；V1–V4 按[阶段人工确认](references/stage-confirmation.md)闭环。V2 先确认拆解图，再单独确认布局图；V1、V3、V4 使用 `confirmation`，V2 分别使用 `decompositionConfirmation` 和 `layoutConfirmation`。

V4 可见候选的 `PASS` 还需通过[人工美术与动态体验证据](references/unity-evidence.md#可见-v4-美术与动态体验)：Manifest 明确 `candidateId`、`candidateVersion`、`artExperienceAcceptanceRef`，机器只核对材料与文件，不代替用户观看判断。该材料复用现有 V4 阶段确认；纯工程工作项不适用。

骨骼资产正式交付按[2D 骨骼交付门禁](references/rigging-delivery-gate.md)填写现有 Work Item/Evidence Manifest 的 `riggingDelivery`。`domain: 2d-rigging` 与 `unity-asset-change` 必须声明当前角色；F3 回读工程报告和目标角色的真实播放回归，失败、缺失、未执行或陈旧证据阻断交接。按输出岗位责任修复，由独立 QA 复验，不用公共技术夹具代替正式角色，不自动选择 `RETURN`。

用户阶段依次为 `requirements-scope`、`global-baseline`、`foundation-engineering`、`scene-production`、`global-integration-validation`、`release`；场景证据使用 V0-V4，内部状态使用 INTAKE、BASELINE、PROPOSAL、REVIEW、IMPLEMENTING、VALIDATING、PASSED 及按需接入的集成/发布状态。

## 视觉任务交付

遵守[图片优先的确认方式](references/simplified-workflow.md#图片优先的确认方式)：普通图片直接制作真实候选；动画素材制作前须先说明设计理念和动作方案，等待用户明确确认，完成后仍验收真实素材。全局视觉基线建立时生成恰好三张同条件候选，每张记录五项美术质量结果；唯一人工选择的候选五项必须全部 `PASS`，通过 `Work.globalVisualBaselineSelectionRef.path` 引用，有效选择证据可跨 Work 复用。纯工程 `FOUNDATION` 无视觉依赖时不等待选图，实施包声明 `visualBaselineRequired=true` 时必须满足。V3 完成正式资源生产与导入，可生产资源级 Prefab 并展示临时组合预览；正式宿主 Scene/场景装配 Prefab/UI 实现及布局校准在 V4。工程 `PASS` 不代表视觉验收完成。

## 稳定 CLI

```text
node <skill-dir>/scripts/workflow-control.mjs status --repo <repo> --work-item <file>
node <skill-dir>/scripts/workflow-control.mjs check --repo <repo> --work-item <file> [--implementation-package <file>] [--evidence <file>]
node <skill-dir>/scripts/workflow-control.mjs run --repo <repo> --work-item <file> [--implementation-package <file>] [--evidence <file>]
node <skill-dir>/scripts/workflow-control.mjs transition --repo <repo> --work-item <file> --to <state>
node <skill-dir>/scripts/workflow-control.mjs scene-stage --repo <repo> --work-item <file> --to <V1|V2|V3|V4>
node <skill-dir>/scripts/workflow-control.mjs unit-check --repo <repo> --work-item <file> --result <json>
node <skill-dir>/scripts/workflow-control.mjs lint
```

`status` 和 `check` 绝不写文件。`run` 只沿合法的安全前向状态迁移，并在 `IMPLEMENTING`、`RETURN`、阶段人工确认、用户决定、缺少证据、实施包未完成或带副作用的 A4-A6 精确审批处停止。`transition` 处理全局状态；`scene-stage` 仅将同一场景工作项相邻推进，闭合阶段证据和确认后清除旧消费引用、归档执行状态、将新阶段置为 `PROPOSAL`、重置 F2/F3/F4；编排者随后冻结并显式绑定新阶段实施包，补齐当前门禁后再由 `run` 进入实施；V3→V4 还要求 Evidence `PASS` 与执行闭环。`unit-check` 仅校验 `IMPLEMENTING` 当前单元已提交的结果，不执行验收命令。单元必须声明非空 `acceptanceCommands`；实际证据文件和命令 `outputFile` 均受 `evidenceRoot` 限制，结果同时绑定单元业务身份和计划顺序。`RETURN` 恢复点由 `affectedScope` 推导，不接受手动 `return-state`。

`unit-check --result` 的参数，以及 Result 的 `files`、命令 `outputFile`，均使用相对于 `--repo` 的 POSIX 路径（`/` 分隔），不能传绝对路径或 `..`。先实际执行实施包中的验收命令并保存原始输出，再记录退出码和结果；文件门通过只证明已提交材料符合合同，不能证明代理真正执行过命令。RETURN 的进入、修复和恢复参数见[状态门禁示例](references/state-gates.md)。

所有稳定输出都包含 `status`、`stage`、`changed`、`blocking`、`next`、`metadata` 六个字段。执行结果是诊断记录，不代表 Unity Editor、真机或发布系统已经运行。

## 参考资料

- [简化六阶段与场景视图](references/simplified-workflow.md)：用户可理解的项目阶段和 V0-V4 场景阶段。
- [阶段人工确认](references/stage-confirmation.md)：V0 内部分流、V1–V4 交付确认、V2 双确认以及阶段失效规则。
- [控制模型](references/control-model.md)：A0-A6、F0-F4、动作和实施包边界。
- [状态门禁](references/state-gates.md)：合法迁移、停止条件和 repair/revalidate/return。
- [Unity 证据](references/unity-evidence.md)：Editor、编译、域重载、Console、测试、资源和构建证据要求。
- [2D 骨骼交付门禁](references/rigging-delivery-gate.md)：当前角色双报告、独立 QA、失败阻断、岗位退修与复验。
- 可见合同：`workItemType`、独立 `displayLayer`、Unity 原生 `responsiveContract` 和 V4 `responsiveEvidence` 是可机器校验的唯一身份与响应式证据闭环。
- [Work Item schema](schemas/work-item.schema.json)、[Implementation Package schema](schemas/implementation-package.schema.json)、[Evidence Manifest schema](schemas/evidence-manifest.schema.json)：唯一支持的 `schemaVersion: "1.0"` 数据合同。
- [Execution State schema](schemas/execution-state.schema.json)、[单元 Result schema](schemas/execution-unit-result.schema.json)：当前实施计划、执行批次和验收命令结果的文件合同。
- [全局视觉基线 schema](schemas/global-visual-baseline.schema.json)、[候选模板](../unity-development-workflow/templates/global-visual-baseline.yaml)：三候选、唯一人工选择与跨工作项复用。
- [最小 Git 规则](references/minimal-git.md)：递归忽略验证中间产物，按已授权阶段整理最小提交。

不解析任何旧版状态、旧版审查漏斗或非 Unity 游戏流程。所有函数、状态定义和实体字段以本 Skill 的 schema 与脚本为准。
