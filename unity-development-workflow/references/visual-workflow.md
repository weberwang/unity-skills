# Unity 视觉工作流

视觉生产嵌入场景 V0-V4，不使用独立 A0-A4 流程。A0-A6 只表示动作风险等级，F0-F4 只表示全局质量门。

## 全局视觉基线

只有项目确实需要新视觉方向时才生成候选。候选数量由 Work Item 决定；需要探索时推荐三个实质不同的完整方向，用户选择后冻结 Visual Bible。已有有效品牌/视觉规范时直接验证并采用，不强制重新三选一。

Visual Bible 记录色彩、材质、光照、镜头、字体、图标、动效、可读性、技术预算、允许复用和禁用项，并绑定来源版本与文件 SHA。方向变化只使真实依赖它的场景和资源失效。

## V1 场景定义

冻结场景功能契约、目标视口、相机、状态、输入轨迹和实际可查看的草图/灰盒；同时给出稳定节点 ID、`parentElementId`、语义分组、渲染顺序、Anchor、Pivot、安全区、遮罩、资源槽，以及适用的 UXML/USS/UIDocument、Canvas/RectTransform 或 GameObject/Component 结构。屏幕 UI 按[布局与节点树规则](ui-layout-and-hierarchy.md)区分全屏背景、安全区内容、常驻 HUD 和独立显示层；父子须有实际布局或行为依赖。

如果场景基于参考图还原，明确 `usability` 或 `exact`。默认 `usability` 关注边界、裁切、遮挡、可读性、状态和交互；仅用户明确要求精确还原时使用像素容差和完整矩阵。

## V2 拆解确认

只分析冻结的场景目标图与结构。对可见元素建立稳定 `componentId` 和状态矩阵，选择 Unity 视觉来源 `IMAGE_ASSET`、`UNITY_NATIVE`、`REUSE`、`MODEL_3D`、`MATERIAL` 或 `VFX`，并记录 `semanticGrouping`、`visualRouteAnalysis`、`assemblyAnalysis` 与 `layoutBinding`：

屏幕 UI 的 `layoutBinding.uiLayout` 必须说明父子分组依据、布局控制者、尺寸、溢出、安全区和命中策略。先按[节点树规则](ui-layout-and-hierarchy.md)判断组件根与子节点，再冻结拆解 item、Prefab/Scene 节点和装配实例；不得用效果图中的距离或元素类型代替依赖证据。

- 目标节点、路径、bounds、逻辑尺寸、Pivot、PPU、Border、透明、色彩空间和状态；
- TextureImporter/SpriteAtlas/Addressables/字体/材质/模型导入约定；
- 资源来源、许可、Unity GUID、复用理由和替换策略；
- 静态特色外观的独立生产结论；`UNITY_NATIVE` 只能由文本、动态数据、布局、基础几何、进度、粒子或 Shader 的资格证据支持；`REUSE` 的精确 GUID、源 SHA、Importer 指纹和消费节点；
- Scene/Prefab/UXML/UIDocument/Canvas/Transform 的结构化装配；单区域不得使用 `COMPOSITE` 或整屏截图，`fullScreenCapture` 必须为 `false`；
- annotated preview、完整覆盖说明和生产/验证责任。

存在实质视觉取舍、来源授权或外部生成成本时请求精确 `USER_DECISION`。未确认生产边界前，不导入正式资源或写入正式 Scene/Prefab/UI。禁止裁切、抠取、放大或轻微修饰参考图/高保真图充当 Sprite/纹理，禁止整图铺底冒充结构化实现。

## V3 正式资源与组合验收

按拆解计划逐项独立生产或复用。位图、模型、材质、字体、音频和 VFX 使用其真实 Importer 与平台设置；Unity 管理资源与 `.meta` 同步进入所有权和证据。UI/2D 位图生产默认 `sourceScale=2`，平台预算或像素美术合同另有明确批准值时才改变；运行时不使用固定 Web DPR，而读取 Unity 平台、Canvas/PanelSettings、Camera 和动态分辨率事实。SpriteAtlas、压缩、MipMap 和 Addressables 由 Unity 预算决定。

生成式透明位图可采用“生成不透明单一纯色背景 PNG → `unity-game-visual-assets/scripts/remove-background-local.mjs` → 尺寸归一化 → Unity 导入”。必须显式指定背景色和容差，推荐启用 `--require-solid-background`，保留原图、输出图、SHA、背景色、容差、删除像素和深浅底预览；只有去背景记录为 `PASS` 的输出才可成为图片任务候选。该路线不适用于参考图裁切/抠取，也不能处理复杂背景、毛发、玻璃、发光或半透明边缘。

在宿主 Scene/Prefab/UXML 中完成正式资源同屏组合预验收，核对 GUID、序列化引用、Prefab Variant/Override、布局、状态、遮罩、渲染排序与 Console。V3 通过前不把正式场景实现声明为可验收候选。

## V4 正式实现与运行验收

单写者完成正式 Scene/Prefab/UI/玩法接入，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用。随后在编译、导入和域重载稳定后运行 EditMode/PlayMode、Game View 多分辨率、交互轨迹、视觉、性能和资源消费验证；真实记录 Screen/GameView/backbuffer 或 RenderTexture、Camera pixelRect/orthographicSize/projection、CanvasScaler 或 PanelSettings、Screen.safeArea、方向/resize、EventSystem/InputSystem 命中、截图、候选 SHA 和状态轨迹。

modal、popup、drawer、toast 等显示层在自己的 `DISPLAY_LAYER` Work Item 中验证打开、交互、关闭，以及焦点、输入、时间缩放和底层状态恢复；`hostSceneId` 只作上下文，显示层不阻断场景 V4。研发期不自动启动 Standalone/Player 或真机；设备证据仅在独立发布 Work Item 获明确授权后产生。

### 文本与响应式合同

程序化文本必须覆盖 `en`、`zh-CN`、`ja`、`ru`、`es`；逐语言声明 single-line 或 wrap，禁止截断。实测必须覆盖 TMP/UI Toolkit 字体回退、字形、基线、容器边界和命中区域，合同与证据通过 `responsiveContractRef` 和 `contractVersions` 绑定。

## 失效规则

- 全局基线变化：只失效依赖该视觉事实的 V1-V4。
- V1 功能或结构变化：失效受影响的 V2-V4。
- V2 拆解、规格、节点或来源变化：失效受影响资源与 V3/V4。
- 资源内容、GUID、Importer、地址或材质槽变化：重验该资源及消费它的 V3/V4。

候选未变而证据过期使用 `revalidate`；字段或绑定错误使用 `repair`；只有上游事实或范围真实变化才 `return`。
