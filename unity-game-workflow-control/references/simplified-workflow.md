# 简化工作流视图

本文件是用户入口，只投影控制面已经记录的事实，不替代状态、门禁、实施包或证据。六阶段顺序固定；阶段内仍以 Work Item 的 `globalState` 为唯一可执行状态。

## 图片优先的确认方式

普通图片任务按“内部整理 → 直接制作并展示真实候选 → 用户确认”推进，不增加文字方案审批。动画例外：制作动画素材前，先向用户说明设计理念和动作方案，取得明确确认后再制作；真实动画素材仍须单独验收。分析、提示词、技术 JSON、来源和确认回执由代理维护，图片确认不再重复为文字复述确认。

| 任务 | 用户看到的交付 | 内部处理 |
| --- | --- | --- |
| V1 场景目标 | 真实完整效果图；纯工程工作项不虚构图片 | 内部维护状态、节点、父子关系、来源和 Unity 原生响应式合同；存在决定性需求歧义才询问 |
| V2 拆解确认 | 先展示编号框选与中文标注图，确认后再展示独立布局图并确认 | 两项产物分别生成、记录确认；布局图包含参照、约束和关键适配行为 |
| 静态资源 | 图片画廊或可放大的参考/输出对照 | 独立资产与工程检查保留，文字只列失败、缺失和仍需处理的差异 |
| V3 资源验收 | 正式资源画廊、来源与导入结果；可附临时组合预览 | 完成资源生产、导入和资源级验证，可生产资源级 Prefab；不在本阶段实施正式宿主 Scene/场景装配 Prefab/UI 或校准布局 |
| V4 组合与运行 | 实际 Scene/Prefab/UI 组合、运行轨迹及 V1 对照，列出已知未还原项 | 完成正式接入、布局校准和所需运行验证后展示；显示效果由用户人工检查 |
| 返修 | 原始目标、修改前与修改后对照 | 已确认目标范围内直接修复与重验，旧生成图只作辅助，不单独确认文字修复方案 |
| 动画 | 先确认设计理念与动作方案，再展示真实视频、关键帧或 Unity 动画预览 | 取得制作前方案确认后生成；玩法事件、时长或行为边界有决定性歧义时暂停受影响动作 |

V0 是内部识别与分流，不要求常规确认，也不写入 `stageReviews`。V1 的真实目标图确认后才能拆解；V2 先确认拆解图，再单独确认布局图，两项都完成后才能生产正式资源；V3 确认正式资源后进入 V4 正式实现和校准；V4 实际运行交付经用户确认后完成。全局基线首次建立时恰好生成三张同条件候选，每张记录五项美术质量结果；唯一人工选择的候选五项均须 `PASS`。选择证据写入 `Work.globalVisualBaselineSelectionRef.path`，有效证据可由其他 Work 复用，详见 [视觉基线合同](../../unity-development-workflow/references/visual-workflow.md#全局视觉基线)。

纯工程 `FOUNDATION` 没有视觉依赖时不等待全局选图；实施包声明 `visualBaselineRequired=true` 时才要求有效选择证据。已有骨骼拆件/代表动画等专项确认仍保留；这些确认不新增工作流阶段，也不替代阶段确认。

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

V0 仅作内部识别和分流，无常规人工确认。V1–V4 按[阶段人工确认](stage-confirmation.md)推进；场景与显示层分别记录 `stageReviews`，技术验证通过不能代替人工确认。V2 必须分别记录拆解图与布局图确认。

| 场景阶段 | 含义 | 最小事实 |
| --- | --- | --- |
| `V0` | 内部分流 | 内部确定对象身份、范围、上下文、依赖和验收目标，不提交常规人工确认 |
| `V1` | 对象定义 | 视觉工作项的真实完整目标图、功能契约和 Unity 原生响应式合同；目标图经确认后作为持续视觉目标 |
| `V2` | 拆解与布局确认 | 先确认编号拆解图，再独立确认布局图、参照和适配约束；两项均绑定 V2 |
| `V3` | 正式资源生产与导入验收 | 正式资源、来源、Importer 和导入验证；可生产资源级 Prefab、做临时组合预览，不实施正式宿主 Scene/场景装配 Prefab/UI |
| `V4` | 正式实现与运行验收 | 完成 Scene/Prefab/UI 接入、原生布局校准、交互与实际运行证据，用户确认后完成 |

V0-V4 是场景和独立显示层证据的顺序，不是绕过全局状态的另一套控制流。`SCENE` 和 `DISPLAY_LAYER` 都必须在 `scene-production` 内推进自己的阶段与状态；V3 未闭合时不能声称 V4，缺少可见合同或运行证据时只显示当前真实全局阶段。通过 `scene-stage --to V1|V2|V3|V4 --work-item <file>` 逐阶段显式推进同一工作项；当前阶段证据与确认闭合后，清除旧阶段消费引用并归档执行状态，再由 `run` 开始下一阶段实施。

## 场景与显示层

场景 Work Item 只负责自身玩法、场景画面和场景自有常驻 HUD。`modal`、`popup`、`drawer`、`toast` 等瞬态层建立独立 `DISPLAY_LAYER` Work Item，携带 `displayLayerId` 和 `hostSceneId`，并独立完成资源、接线、输入、关闭、恢复和 V4 运行轨迹。`hostSceneId` 是上下文，不是宿主场景完成依赖。

可见 Work Item 实施前用 Unity 原生 `responsiveContract` 明确目标；它覆盖 Unity UI 系统、逻辑空间、backbuffer/Panel/RenderTexture、CanvasScaler/PanelSettings/Camera、安全区、InputSystem/EventSystem、resize/方向、文本本地化、资源源密度、性能预算、代表性视口和所需运行证据。实施包通过 `responsiveContractRef` 的 `path`、`version` 记录合同来源；包含 `SCENE` 与 `DISPLAY_LAYER` 的包拒绝执行。验收依据用户要求和实际完成情况，中途调整无需回改合同，不校验 SHA。

## 输出投影

CLI 的 `stage` 为 `${stageId}/${globalState}`。`metadata.workflowView` 提供 `phaseId`、`phaseLabel`、`sceneStepId`、`sceneStepLabel` 四个稳定字段。缺少可识别的场景阶段时，场景字段为 `null`，不伪造进度。
