---
name: unity-game-workflow-control
description: Unity 游戏仓库的唯一全局工作流控制面；以六阶段、A0-A6 风险、F0-F4 门禁、实施包和证据清单控制从需求到发布的可执行状态。
---

# Unity 游戏全局工作流控制

本 Skill 是 Unity 项目的唯一流程状态、风险门、范围和证据控制面。它只负责读取与校验 Work Item、Implementation Package、Evidence Manifest，以及在门禁满足时推进控制状态；它不启动 Unity Editor、服务、设备或发布流程。

## 主闭环

1. 创建或读取 Work Item，冻结用户目标、范围、基线、阶段、`workItemType`、允许路径和验收边界；`SCENE` 与 `DISPLAY_LAYER` 必须在 `scene-production` 独立闭环。
2. 按当前阶段读取对应 reference，使用 `status`/`check` 诊断；缺少事实时先完成只读调查。
3. 实施前冻结 Implementation Package。每个单元必须有类型、所有者、路径、顺序和 Unity 序列化资源所有权；`SCENE` 与 `DISPLAY_LAYER` 不得混包，身份字段必须精确绑定。
4. 可见 `SCENE`/`DISPLAY_LAYER` 必须冻结 Unity 原生 `responsiveContract`；可见实施包必须绑定合同文件 `path/version/sha256`，不使用 CSS、DOM 或运行时 DPR 语义。
5. 实施后记录候选变更和 Evidence Manifest，证据必须绑定相同的 Work Item、基线和实施包；V4 PASS 必须有真实 Game View/Screen/backbuffer、CanvasScaler 或 PanelSettings、Camera、Screen.safeArea、InputSystem/EventSystem 命中、同进程 resize/orientation、截图和候选 SHA。
6. 失败只选择 `repair`、`revalidate` 或显式 `RETURN`；控制面不会自动回退、扩大范围或伪造设备/发布证据。
7. 仅对当前精确对象、影响和范围授予 A4-A6 的明确批准；`run` 不替用户作出决定，也不执行副作用。

用户阶段依次为 `requirements-scope`、`global-baseline`、`foundation-engineering`、`scene-production`、`global-integration-validation`、`release`；场景证据使用 V0-V4，内部状态使用 INTAKE、BASELINE、PROPOSAL、REVIEW、IMPLEMENTING、VALIDATING、PASSED 及按需接入的集成/发布状态。

## 稳定 CLI

```text
node <skill-dir>/scripts/workflow-control.mjs status --repo <repo> --work-item <file>
node <skill-dir>/scripts/workflow-control.mjs check --repo <repo> --work-item <file> [--implementation-package <file>] [--evidence <file>]
node <skill-dir>/scripts/workflow-control.mjs run --repo <repo> --work-item <file> [--implementation-package <file>] [--evidence <file>]
node <skill-dir>/scripts/workflow-control.mjs transition --repo <repo> --work-item <file> --to <state>
node <skill-dir>/scripts/workflow-control.mjs lint
```

`status` 和 `check` 绝不写文件。`run` 只沿合法的安全前向状态迁移，并在 `IMPLEMENTING`、`RETURN`、用户决定、缺少证据、实施包未完成或带副作用的 A4-A6 精确审批处停止。`transition` 是唯一的显式迁移入口，禁止跳过实施包、验证证据或 `RETURN` 记录。

所有稳定输出都包含 `status`、`stage`、`changed`、`blocking`、`next`、`metadata` 六个字段。执行结果是诊断记录，不代表 Unity Editor、真机或发布系统已经运行。

## 参考资料

- [简化六阶段与场景视图](references/simplified-workflow.md)：用户可理解的项目阶段和 V0-V4 场景阶段。
- [控制模型](references/control-model.md)：A0-A6、F0-F4、动作和实施包边界。
- [状态门禁](references/state-gates.md)：合法迁移、停止条件和 repair/revalidate/return。
- [Unity 证据](references/unity-evidence.md)：Editor、编译、域重载、Console、测试、资源和构建证据要求。
- 可见合同：`workItemType`、独立 `displayLayer`、Unity 原生 `responsiveContract` 和 V4 `responsiveEvidence` 是可机器校验的唯一身份与响应式证据闭环。
- [Work Item schema](schemas/work-item.schema.json)、[Implementation Package schema](schemas/implementation-package.schema.json)、[Evidence Manifest schema](schemas/evidence-manifest.schema.json)：唯一支持的 `schemaVersion: "1.0"` 数据合同。

不解析任何旧版状态、旧版审查漏斗或非 Unity 游戏流程。所有函数、状态定义和实体字段以本 Skill 的 schema 与脚本为准。
