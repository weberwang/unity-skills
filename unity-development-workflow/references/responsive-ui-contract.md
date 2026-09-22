# Unity 原生响应式 UI 合同

## 何时读取

在场景 V1 冻结目标视口、相机和 UI 结构时创建；在 V2 把合同绑定到拆解 item、Prefab/Scene 节点和独立 `DISPLAY_LAYER`；在 V4 运行测量时按合同逐项取证。合同通过 `responsiveContractRef` 和 `contractVersions` 绑定当前候选，不允许用旧候选的测量替代当前证据。

## 实现边界

合同描述 Unity 原生事实，而不是浏览器实现：

- Screen/GameView 与 backbuffer 或 RenderTexture 尺寸；
- Camera 的 `pixelRect`、`orthographicSize` 和 projection；
- CanvasScaler 或 UI Toolkit PanelSettings 的缩放、参考分辨率和匹配策略；
- `Screen.safeArea`、方向、旋转、连续 resize 和动态分辨率；
- EventSystem/InputSystem 命中结果、目标节点、状态轨迹与截图。

运行时禁止读取固定 Web DPR 作为布局依据。UI/2D 位图生产默认 `sourceScale=2`；平台预算或像素美术合同另有批准值时，必须把覆盖值和理由写入资产合同，不能把它当成运行时 DPR。

## 文本合同

程序化文本必须覆盖 `en`、`zh-CN`、`ja`、`ru`、`es`。每个文本节点逐语言声明 `single-line` 或 `wrap`，禁止截断、静默省略或溢出容器。V4 必须验证 TMP 与 UI Toolkit 的字体回退链、目标字形、基线、行高、容器边界和输入命中；字体缺字、基线漂移或容器不满足合同都应失败。

## 取证格式

`runtime-visual-evidence` 和 `scene-manifest` 必须包含 `responsiveContractRef`、`contractVersions` 与真实 `runtimeMeasurement`。测量包含 Screen/GameView、backbuffer 或 RenderTexture、Camera、Canvas/PanelSettings、安全区、方向/resize、EventSystem/InputSystem 命中、截图、候选 SHA 和状态轨迹。`runtimeMeasured=true` 只表示测量确实来自 Unity 运行实例，不能用静态配置、推导值或文件存在代替。

V4/PASS 需要当前候选的完整测量和 `verificationStatus=PASS`；缺失测量只能标记失败或 `NOT_RUN`。Editor 研发期不自动启动 Standalone/Player 或真机，未获授权时不生成设备证据。

## 失败与失效

- 合同版本、父节点、Canvas/PanelSettings、Camera 或候选 SHA 变化，使依赖它们的 V2-V4 证据标记 `stale`。
- 只改变显示层不回写宿主场景；独立 `DISPLAY_LAYER` 使用 `hostSceneId` 记录上下文，并拥有自己的响应式合同和打开/交互/关闭/恢复轨迹。
- modal、popup、drawer、toast 等瞬态层不阻断宿主场景 V4；场景只拥有玩法、画面和常驻 HUD。
