# 工作流总览

## 控制面与执行面

`unity-game-workflow-control` 保存 Work Item、状态、风险门、实施包和证据索引；本 Skill 负责 Unity 领域编排；[@Unity](plugin://unity@openai-curated-remote)、`com.unity.pipeline` 与 C# Toolkit 负责 Scene、Prefab、Importer、AssetDatabase、Editor、截图、测试与构建事实。三层不得相互伪造结果。

## 六阶段项目视图

| 阶段 | 主要产物 | Unity 完成事实 |
| --- | --- | --- |
| 需求与范围 | Work Item、目标、范围、验收、风险 | 项目路径和需求边界明确 |
| 全局基线 | GDD/TDD、技术/视觉基线、平台集合 | Unity/包/渲染管线/输入/存档/资源策略已冻结 |
| 基础工程 | SHARED/MODULE 实施包 | asmdef、Composition Root、测试入口和最小可构建骨架有效 |
| 场景与弹窗生产 | SCENE/DISPLAY_LAYER 实施包与 V0-V4 证据 | 场景只闭环玩法、画面和常驻 HUD；瞬态显示层独立验收 |
| 全局集成验证 | INTEGRATION 单元和联合证据 | 导航、存档、音频、平台适配、性能与回归绑定同一候选 |
| 发布 | 独立 RELEASE Work Item | 候选包、合规、回滚和精确外部操作批准 |

内部 G0-G3 可作为里程碑标签：G0 对应基线，G1 对应基础工程/场景生产，G2 对应全局集成验证，G3 对应发布。它们不是另一套状态机。

## 阶段任务

每个阶段任务必须声明 `taskId`、依赖、输入、输出、所有权、验收、验证命令和状态。只有依赖与证据真实满足才进入 READY；目录接近、代理空闲或文件存在都不是 READY 证据。

纯局部修改从最早受影响阶段开始。模块/场景/资源互不相关时不得强制重跑全项目；共享配置、序列化引用、全局基线或发布候选变化时，才扩展失效范围。

## 视觉来源与结构装配

场景使用 V0-V4。每个拆解注释和 item 必须声明 `parentElementId`、`semanticGrouping`、`visualRouteAnalysis`、`assemblyAnalysis` 与 `layoutBinding`。父子关系必须有显式节点事实和真实的定位、布局、交互、状态、裁切或复用依赖；没有这些依赖的共同信息保持同组同级，不能按距离、bounds 或类型猜测。屏幕 UI 的 V2 布局字段按[节点树规则](ui-layout-and-hierarchy.md)冻结。

视觉来源在 Unity 中只允许 `IMAGE_ASSET`、`UNITY_NATIVE`、`REUSE`、`MODEL_3D`、`MATERIAL`、`VFX`。静态特色外观默认独立生产资产；`UNITY_NATIVE` 必须持有文本、动态数据、布局、基础几何、进度、粒子或 Shader 的资格证据。`REUSE` 必须绑定精确 GUID、源 SHA、Importer 指纹和消费节点。单区域禁止使用 `COMPOSITE` 或整屏截图来源；`assemblyAnalysis.fullScreenCapture` 必须为 `false`。

## 场景与显示层

场景只包含玩法、画面和常驻 HUD。modal、popup、drawer、toast 等瞬态层是独立 `DISPLAY_LAYER` Work Item，`hostSceneId` 只表示运行上下文，不表示实现归属，也不阻断宿主场景 V4。显示层拥有自己的结构、响应式合同、打开/交互/关闭/恢复轨迹和运行证据。

## 失败处置

- `repair`：字段、路径、绑定或可补证据错误，留在当前阶段修复。
- `revalidate`：候选未变，重新执行当前门验证。
- `return`：上游事实失效、范围真实变化或继续会绕过硬门；只回到最早受影响阶段。

控制层不自动选择 `return`，也不自动回滚共享工作区。
