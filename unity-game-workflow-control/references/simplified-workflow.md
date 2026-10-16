# 简化工作流视图

本文件是用户入口，只投影控制面已经记录的事实，不替代状态、门禁、实施包或证据。六阶段顺序固定；阶段内仍以 Work Item 的 `globalState` 为唯一可执行状态。

## 图片优先的确认方式

图片和动画任务按“阶段内内部整理 → 直接展示真实图片或预览 → 用户确认 → 继续”推进。分析、提示词、技术 JSON、来源和确认回执由代理维护，不要求用户先阅读或确认文字提案；用户主动索要时再展开。实际图片确认只记录一次，不再要求确认同一内容的文字复述。

| 任务 | 用户看到的交付 | 内部处理 |
| --- | --- | --- |
| 场景目标 | 完整效果图或显示层宿主上下文预览 | 依据需求与有效基线推导，存在决定性方向、玩法或结构歧义才询问 |
| V2 拆解与布局 | 编号框选图、图内简短说明与必要局部放大图 | 自动维护状态、节点、父子关系、来源、布局决策和技术合同，直接产图 |
| 静态资源 | 图片画廊或可放大的参考/输出对照 | 独立资产与工程检查保留，文字只列失败、缺失和仍需处理的差异 |
| V3/V4 组合 | V1 与当前实际 Unity Scene/Prefab/UI 组合的可查看对照，列出已知未还原项 | 按既有阶段完成原生布局校准、导入回读和相应验证后展示，不先请求文字布局方案确认 |
| 返修 | 原始目标、修改前与修改后对照 | 已确认目标范围内直接修复与重验，旧生成图只作辅助，不单独确认文字修复方案 |
| 动画 | 真实视频、首尾/关键帧或 Unity 动画预览 | 内部分析时间轴与制作参数后直接制作，玩法事件、时长或行为边界有决定性歧义才暂停受影响动作 |

阶段前置仍须满足：V1 目标图确认后拆解，V2 图像交付确认后生产正式资源，V3 组合确认后进入 V4。Unity 的 V2 合并展示拆解与布局，V3 展示正式原生组合；不新增独立布局审批或制作前文字确认门。已有骨骼拆件/代表动画等实际专项确认仍保留；图片动画在实际父图确认后制作依赖帧，视频路线验收实际抽帧输入后才能抽帧。

Unity 运行截图、预览与观看效果由用户人工检查，未经明确要求代理不自动分析运行截图或代写视觉通过。代理仍须按[追溯与检查边界](../../unity-development-workflow/references/art-quality-contract.md#追溯与检查边界)检查参考设计图、拆解图和独立源素材，不能把生产查漏推给用户；这些检查不代替人工阶段验收。缺少素材或工具时说明真实缺口，不用文字方案、占位图或机器 PASS 冒充视觉候选。费用、外部写入、真机与发布仍受已有操作授权约束。

画面内容按[游戏内文案](../../unity-development-workflow/references/game-copy.md)贯穿策划、效果图和实现：内部规格分开保存，图片、图标、数字、符号和视觉状态优先，文字只补充必要语义。生成前指定实际可见内容，Unity 组合与运行时绑定同一表达，不把策划详细说明复制到画面；拆解标注和编辑器操作说明不属于游戏内文案。

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

每个阶段完成后均须展示产物并取得用户明确确认，再推进下一阶段；V4 也须人工确认后才完成工作项。场景与显示层分别记录 `stageReviews`，技术验证通过不能代替人工确认，详见[阶段人工确认](stage-confirmation.md)。

| 场景阶段 | 含义 | 最小事实 |
| --- | --- | --- |
| `V0` | 分流 | 判断是否需要场景 Work Item，并记录场景入口和范围 |
| `V1` | 场景定义 | 场景目标、入口、持久化对象和功能契约 |
| `V2` | 拆解确认 | 图片框选与图内中文标注展示组件、资源、脚本、状态和所有权拆解；不输出文本拆解说明 |
| `V3` | 正式资源与组合验收 | 正式资源、Importer 设置、Prefab 组合和同屏预验收 |
| `V4` | 正式实现与运行验收 | 正式 Scene、运行轨迹、功能/视觉/性能联合证据 |

V0-V4 是场景和独立显示层证据的顺序，不是绕过全局状态的另一套控制流。`SCENE` 和 `DISPLAY_LAYER` 都必须在 `scene-production` 内推进自己的阶段与状态；V3 未闭合时不能声称 V4，缺少可见合同或运行证据时只显示当前真实全局阶段。

## 场景与显示层

场景 Work Item 只负责自身玩法、场景画面和场景自有常驻 HUD。`modal`、`popup`、`drawer`、`toast` 等瞬态层建立独立 `DISPLAY_LAYER` Work Item，携带 `displayLayerId` 和 `hostSceneId`，并独立完成资源、接线、输入、关闭、恢复和 V4 运行轨迹。`hostSceneId` 是上下文，不是宿主场景完成依赖。

可见 Work Item 实施前用 Unity 原生 `responsiveContract` 明确目标；它覆盖 Unity UI 系统、逻辑空间、backbuffer/Panel/RenderTexture、CanvasScaler/PanelSettings/Camera、安全区、InputSystem/EventSystem、resize/方向、文本本地化、资源源密度、性能预算、代表性视口和所需运行证据。实施包通过 `responsiveContractRef` 的 `path`、`version` 记录合同来源；包含 `SCENE` 与 `DISPLAY_LAYER` 的包拒绝执行。验收依据用户要求和实际完成情况，中途调整无需回改合同，不校验 SHA。

## 输出投影

CLI 的 `stage` 为 `${stageId}/${globalState}`。`metadata.workflowView` 提供 `phaseId`、`phaseLabel`、`sceneStepId`、`sceneStepLabel` 四个稳定字段。缺少可识别的场景阶段时，场景字段为 `null`，不伪造进度。
