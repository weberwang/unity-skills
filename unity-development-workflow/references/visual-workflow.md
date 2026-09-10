# Unity 视觉工作流

视觉生产嵌入场景 V0-V4，不使用独立 A0-A4 流程。A0-A6 只表示动作风险等级，F0-F4 只表示全局质量门。

## 全局视觉基线

只有项目确实需要新视觉方向时才生成候选。候选数量由 Work Item 决定；需要探索时推荐三个实质不同的完整方向，用户选择后冻结 Visual Bible。已有有效品牌/视觉规范时直接验证并采用，不强制重新三选一。

Visual Bible 记录色彩、材质、光照、镜头、字体、图标、动效、可读性、技术预算、允许复用和禁用项，并绑定来源版本与文件 SHA。方向变化只使真实依赖它的场景和资源失效。

## V1 场景定义

冻结场景功能契约、目标视口、相机、状态、输入轨迹和实际可查看的草图/灰盒；同时给出稳定节点 ID、父子层级、渲染顺序、Anchor、Pivot、安全区、遮罩、资源槽，以及适用的 UXML/USS/UIDocument 或 GameObject/Component 结构。

如果场景基于参考图还原，明确 `usability` 或 `exact`。默认 `usability` 关注边界、裁切、遮挡、可读性、状态和交互；仅用户明确要求精确还原时使用像素容差和完整矩阵。

## V2 拆解确认

只分析冻结的场景目标图与结构。对可见元素建立稳定 `componentId` 和状态矩阵，选择 `GENERATE`、`AUTHOR`、`REUSE`、`TEXT`、`UI_TOOLKIT`、`MATERIAL`、`VFX`、`MODEL_3D` 或 `PROGRAMMATIC` 路线，并记录：

- 目标节点、路径、bounds、逻辑尺寸、Pivot、PPU、Border、透明、色彩空间和状态；
- TextureImporter/SpriteAtlas/Addressables/字体/材质/模型导入约定；
- 资源来源、许可、Unity GUID、复用理由和替换策略；
- annotated preview、完整覆盖说明和生产/验证责任。

存在实质视觉取舍、来源授权或外部生成成本时请求精确 `USER_DECISION`。未确认生产边界前，不导入正式资源或写入正式 Scene/Prefab/UI。禁止裁切、抠取、放大或轻微修饰参考图/高保真图充当 Sprite/纹理，禁止整图铺底冒充结构化实现。

## V3 正式资源与组合验收

按拆解计划逐项独立生产或复用。位图、模型、材质、字体、音频和 VFX 使用其真实 Importer 与平台设置；Unity 管理资源与 `.meta` 同步进入所有权和证据。不得机械套用浏览器 DPR、Canvas 或“永不使用图集”等 Web 规则，SpriteAtlas、压缩、MipMap 和 Addressables 由 Unity 预算决定。

在宿主 Scene/Prefab/UXML 中完成正式资源同屏组合预验收，核对 GUID、序列化引用、Prefab Variant/Override、布局、状态、遮罩、渲染排序与 Console。V3 通过前不把正式场景实现声明为可验收候选。

## V4 正式实现与运行验收

单写者完成正式 Scene/Prefab/UI/玩法接入，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用。随后在编译、导入和域重载稳定后运行 EditMode/PlayMode、Game View 多分辨率、交互轨迹、视觉、性能和资源消费验证。

modal、popup、drawer、toast 等显示层必须在宿主上下文中验证打开、交互、关闭，以及焦点、输入、时间缩放和底层状态恢复。研发期不自动启动 Standalone/Player 或真机；设备证据仅在独立发布 Work Item 获明确授权后产生。

## 失效规则

- 全局基线变化：只失效依赖该视觉事实的 V1-V4。
- V1 功能或结构变化：失效受影响的 V2-V4。
- V2 拆解、规格、节点或来源变化：失效受影响资源与 V3/V4。
- 资源内容、GUID、Importer、地址或材质槽变化：重验该资源及消费它的 V3/V4。

候选未变而证据过期使用 `revalidate`；字段或绑定错误使用 `repair`；只有上游事实或范围真实变化才 `return`。
