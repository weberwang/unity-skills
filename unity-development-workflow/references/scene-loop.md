# 场景 V0-V4 闭环

## V0 分流

确定场景 ID、宿主 Scene、模块依赖、常驻 HUD、视觉模式、平台约束和验收轨迹。新建且包含可见画面的场景或显示层在本阶段登记效果图任务。纯工程模块不伪装成场景；跨场景入口归 INTEGRATION。modal、popup、drawer、toast 等瞬态层另建 `DISPLAY_LAYER` Work Item，`hostSceneId` 只作运行上下文。

## V1 场景定义

冻结玩家行为、状态、失败/恢复、输入、相机、UI、数据所有权与 Scene/Prefab/UXML 结构，并生成响应式合同。新建且包含可见画面的场景或显示层先生成至少一张完整效果图作为 V2 目标图；草图和灰盒只承载布局与交互验证，不能替代效果图，也不注册为正式资源。

## V2 拆解确认

冻结组件×状态、`parentElementId`、`semanticGrouping`、`layoutBinding`、视觉来源分析、Scene/Prefab/UXML 装配分析、资源/Importer/GUID/Addressables 约定和验收条件。父子必须由定位、布局、交互、状态、裁切或复用的真实依赖显式决定；无这些依赖时保持同组同级。屏幕 UI 按[节点树规则](ui-layout-and-hierarchy.md)声明每个容器职责和空间不足时的处理。只有真实取舍才请求用户决定；已确认事实不重复询问。

## V3 资源与组合验收

全部必需正式资源在 Unity 中导入并验证，宿主 Scene/Prefab/UI 组合没有缺失引用、孤儿资源、占位或 Console 错误。显示层可并行准备，但必须持有自己的 V2/V3 证据、响应式合同和互斥所有权，不并入场景的完成条件。

## V4 正式实现与运行验收

正式实现绑定当前 V2/V3，完成玩法、视觉、音频、输入、生命周期和清理；在 Editor/PlayMode 中按响应式合同采集 Screen/GameView、backbuffer 或 RenderTexture、Camera、Canvas/PanelSettings、安全区、方向/resize、输入命中、截图、候选 SHA 和状态轨迹。缺少真实 Unity 测量时 V4 只能为 `NOT_RUN` 或失败。场景 V4 不等待独立瞬态层。

不同场景可并行只读准备；正式 Unity Editor 写入受单写者约束。完成一个场景不是切换下一个场景的强制前提，只有共享资源、入口或状态所有权存在依赖时才串行。
