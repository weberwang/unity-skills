# 简化工作流视图

本文件是用户入口，只投影控制面已经记录的事实，不替代状态、门禁、实施包或证据。六阶段顺序固定；阶段内仍以 Work Item 的 `globalState` 为唯一可执行状态。

## 六阶段项目视图

| 阶段 ID | 用户阶段 | 聚合产物 | 内部落点 |
| --- | --- | --- | --- |
| `requirements-scope` | 需求与范围 | Work Item 摘要、目标、范围、基线和验收边界 | `INTAKE` |
| `global-baseline` | 全局基线 | 项目事实、GDD/TDD 选择、模块契约和全局质量基线 | `BASELINE`、`PROPOSAL`、`REVIEW` |
| `foundation-engineering` | 基础工程 | SHARED/MODULE 基础实施包、代码和工程验证证据 | `REVIEW`、`IMPLEMENTING`、`VALIDATING`、`PASSED` |
| `scene-production` | 场景与弹窗生产 | 场景或独立显示层契约、V0-V4 证据、Scene/Prefab/UI 正式实现 | `REVIEW`、`IMPLEMENTING`、`VALIDATING`、`PASSED` |
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

V0-V4 是场景和独立显示层证据的顺序，不是绕过全局状态的另一套控制流。`SCENE` 和 `DISPLAY_LAYER` 都必须在 `scene-production` 内推进自己的阶段与状态；V3 未闭合时不能声称 V4，缺少可见合同或运行证据时只显示当前真实全局阶段。

## 场景与显示层

场景 Work Item 只负责自身玩法、场景画面和场景自有常驻 HUD。`modal`、`popup`、`drawer`、`toast` 等瞬态层建立独立 `DISPLAY_LAYER` Work Item，携带 `displayLayerId` 和 `hostSceneId`，并独立完成资源、接线、输入、关闭、恢复和 V4 运行轨迹。`hostSceneId` 是上下文，不是宿主场景完成依赖。

可见 Work Item 必须冻结 Unity 原生 `responsiveContract`；它覆盖 Unity UI 系统、逻辑空间、backbuffer/Panel/RenderTexture、CanvasScaler/PanelSettings/Camera、安全区、InputSystem/EventSystem、resize/方向、文本本地化、资源源密度、性能预算、代表性视口和所需运行证据。实施包通过 `responsiveContractRef` 的 `path`、`version`、`sha256` 绑定同一合同文件；包含 `SCENE` 与 `DISPLAY_LAYER` 的包拒绝执行。

## 输出投影

CLI 的 `stage` 为 `${stageId}/${globalState}`。`metadata.workflowView` 提供 `phaseId`、`phaseLabel`、`sceneStepId`、`sceneStepLabel` 四个稳定字段。缺少可识别的场景阶段时，场景字段为 `null`，不伪造进度。
