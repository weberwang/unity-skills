# 场景 V0-V4 闭环

每个场景与独立显示层均遵守[阶段人工确认](../../unity-game-workflow-control/references/stage-confirmation.md)：V0 只作内部识别与分流，无常规人工确认；V1–V4 交付须按各自门禁确认。V2 拆解图和布局图分别确认；V4 完成实际运行验证并经用户确认后闭合。技术 PASS 不代替人工确认，确认只绑定当前工作项和实际交付。

## V0 分流

内部确定场景 ID、宿主 Scene、模块依赖、常驻 HUD、视觉模式、平台约束和验收轨迹。新建且包含可见画面的场景或显示层在 V1 生成真实完整目标图；纯工程模块不伪装成场景，也不等待视觉基线选择，除非实施包声明 `visualBaselineRequired=true`。跨场景入口归 INTEGRATION。modal、popup、drawer、toast 等瞬态层另建 `DISPLAY_LAYER` Work Item，`hostSceneId` 只作运行上下文。

## V1 场景定义

冻结玩家行为、状态、失败/恢复、输入、相机、UI、数据所有权与 Scene/Prefab/UXML 结构，并生成响应式合同。按[布局参照规则](ui-layout-and-hierarchy.md#布局参照选择)确定场景 UI 相对场景大小停靠，弹窗内部有底板时相对底板布局、无底板时相对屏幕布局。视觉工作项先生成并确认一张真实完整目标图，按[持续目标规则](visual-workflow.md#v1-场景定义)贯穿 V2–V4；草图和灰盒只承载结构与交互验证，不能替代效果图，也不注册为正式资源。

视觉任务同时明确主题、受众、核心循环、体验目标与主要观看情境，并由玩法和 [`unity-game-juice`](../../unity-game-juice/SKILL.md) 确认关键事件的反馈意图，按[美术质量合同](art-quality-contract.md)记录目标。

## V2 拆解确认

先在冻结的 V1 效果图上展示带稳定编号、来源、关系、装配与生产边界的拆解图，取得确认后再生成布局图；布局图标明参照、节点约束和关键适配行为，并单独取得第二次 V2 确认。详细展示规则见[视觉工作流](visual-workflow.md#v2-拆解与布局确认)，以下结构化字段作为内部合同保存并与图中编号同步。

冻结组件×状态、`parentElementId`、`semanticGrouping`、`layoutBinding`、视觉来源分析、Scene/Prefab/UXML 装配分析、资源/Importer/GUID/Addressables 约定和验收条件。适用的九宫格资源冻结源图尺寸、border、目标最小尺寸和内容内边距；动作资产冻结设计意图、动作方案、关键事件、消费接口、循环/中断和资产生产者。动画素材制作前先向用户说明理念与动作方案并等待确认；其他图片直接制作真实候选。父子必须由定位、布局、交互、状态、裁切或复用的真实依赖显式决定；无这些依赖时保持同组同级。屏幕 UI 按[节点树规则](ui-layout-and-hierarchy.md)声明每个容器职责和空间不足时的处理。

## V3 正式资源生产与导入验收

正式资源全部生产、导入并完成资源级验证，回读 GUID、Importer 和必要的九宫格 Border；可生产并验证资产自身的资源级 Prefab，用临时组合预览检查资源关系，但 V3 不完成正式宿主 Scene/场景装配 Prefab/UI 接入或布局校准。资源交付可独立并行，但必须持有自身工作项、确认和所有权，不并入场景的完成条件。

## V4 正式实现与运行验收

以新绑定的 V4 Implementation Package 完成正式 Scene/Prefab/UI 接入、布局校准、玩法、视觉、音频、输入、生命周期和清理；在 Editor/PlayMode 中按实际实现采集 Screen/GameView、backbuffer 或 RenderTexture、Camera、Canvas/PanelSettings、安全区、方向/resize、输入命中、截图和状态轨迹。实际完成情况记录在交付和验收报告。缺少真实 Unity 测量时 V4 只能为 `NOT_RUN` 或失败；完成验证后展示真实组合和证据，用户确认后闭合。场景 V4 不等待独立瞬态层。

美术质量五项逐项通过，动态体验按适用性覆盖正常游玩、重复反馈、事件峰值和同屏叠加；不适用项记录理由，适用项必须有真实运行证据。独立验收材料由控制面 `artExperienceAcceptanceRef` 引用，并绑定当前 Work Item、候选及场景/显示层；用户人工检查实际片段/截图后确认，机器侧参数不代表视觉通过。具体检查见[美术质量合同](art-quality-contract.md)。

不同场景可并行只读准备；正式 Unity Editor 写入受单写者约束。完成一个场景不是切换下一个场景的强制前提，只有共享资源、入口或状态所有权存在依赖时才串行。
