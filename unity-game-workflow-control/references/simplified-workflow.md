# 简化工作流视图

本文件是用户入口，只投影控制面已经记录的事实，不替代状态、门禁、实施包或证据。六阶段顺序固定；阶段内仍以 Work Item 的 `globalState` 为唯一可执行状态。

## 六阶段项目视图

| 阶段 ID | 用户阶段 | 聚合产物 | 内部落点 |
| --- | --- | --- | --- |
| `requirements-scope` | 需求与范围 | Work Item 摘要、目标、范围、基线和验收边界 | `INTAKE` |
| `global-baseline` | 全局基线 | 项目事实、GDD/TDD 选择、模块契约和全局质量基线 | `BASELINE`、`PROPOSAL`、`REVIEW` |
| `foundation-engineering` | 基础工程 | SHARED/MODULE 基础实施包、代码和工程验证证据 | `REVIEW`、`IMPLEMENTING`、`VALIDATING`、`PASSED` |
| `scene-production` | 逐场景生产 | 场景契约、V0-V4 证据、Scene/Prefab/ScriptableObject 正式实现 | `REVIEW`、`IMPLEMENTING`、`VALIDATING`、`PASSED` |
| `global-integration-validation` | 全局集成验证 | 跨场景导航、存档、音频、性能和联合回归证据 | `INTEGRATING` |
| `release` | 发布 | 可复现构建、平台资料、合规与精确发布批准 | `RELEASE_APPROVAL_REQUIRED`、`RELEASING` |

## 单场景 V0-V4

| 场景阶段 | 含义 | 最小事实 |
| --- | --- | --- |
| `V0` | 分流 | 判断是否需要场景 Work Item，并记录场景入口和范围 |
| `V1` | 场景定义 | 场景目标、入口、持久化对象和功能契约 |
| `V2` | 拆解确认 | 组件、资源、脚本、状态和所有权拆解 |
| `V3` | 正式资源与组合验收 | 正式资源、Importer 设置、Prefab 组合和同屏预验收 |
| `V4` | 正式实现与运行验收 | 正式 Scene、运行轨迹、功能/视觉/性能联合证据 |

V0-V4 是场景证据的顺序，不是绕过全局状态的另一套控制流。V3 未闭合时不能声称 V4；缺少场景证据时只显示当前真实全局阶段。

## 输出投影

CLI 的 `stage` 为 `${stageId}/${globalState}`。`metadata.workflowView` 提供 `phaseId`、`phaseLabel`、`sceneStepId`、`sceneStepLabel` 四个稳定字段。缺少可识别的场景阶段时，场景字段为 `null`，不伪造进度。
