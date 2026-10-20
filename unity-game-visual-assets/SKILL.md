---
name: unity-game-visual-assets
description: 在 Unity 场景 V0-V4 中建立视觉基线、结构草图、资源拆解、2D/UI 资源和正式 Scene/Prefab/UXML 组合，并提交 Unity 领域审查与运行证据；不负责生产级 3D 模型或 PBR 贴图。
---

# Unity 视觉与资源接入

本角色消费 `$unity-game-workflow-control` 的 Work Item 和 `$unity-development-workflow` 的场景计划。视觉生产使用 V0-V4；A0-A6 只表示动作风险，F2 记录领域质量，F3 记录 Unity 工程验证。

## 输入与边界

读取 Visual Bible、场景契约、结构草图、资源登记、性能预算和当前 V 阶段。只有存在实质视觉取舍、授权、外部生成成本或替代策略时，才把精确问题交给 `$unity-game-grilling`；已有有效决定不重复询问。

公共字体、贴图、材质、图标、九宫格和 Prefab 遵守[公共资源登记与使用](../unity-development-workflow/references/shared-asset-usage.md)：V2 先查库，合格资源按真实身份复用；V3 提交独立生产/导入事实，由指定单写者同步总表，交付各场景的消费绑定，不重复生产或私改共享源。

生产级 3D 模型与 PBR 贴图分别交给 `$unity-game-3d-modeling` 和 `$unity-game-3d-texturing`。现有 Spine 角色仅换皮且 Bone、Slot、Attachment、Mesh、约束与动画固定时交给 `$unity-game-spine-reskin`。美术 brief 和 V4 体验验收遵循[美术质量合同](../unity-development-workflow/references/art-quality-contract.md)：主题、受众、玩法可读、观看舒适、美术完成度逐项通过。动画与反馈事件交给 [`$unity-game-juice`](../unity-game-juice/SKILL.md) 协调；具体资产生产者按[动画意图合同](../unity-development-workflow/references/animation-intent-contract.md)明确。

Unity 原生 2D 骨骼角色交给 [`$unity-game-2d-rigging`](../unity-game-2d-rigging/SKILL.md)；本角色消费其已确认的视角与拆件合同，独立生产部件、遮挡补全和连接区，不直接裁切完整效果图充当 Sprite。交付稳定部件 ID、视角/方向、画布与 Pivot、角色局部位置、层叠、源图位置、导入规格和资源身份；骨架、网格、权重与动画由骨骼角色负责，图片生成或编辑委派给图片子代理。

骨骼部件按[制作与交接合同](../unity-game-2d-rigging/references/production-contract.md)保证运动范围内的无缝组合：依据实际动作幅度留足关节覆盖与遮挡补全，统一连接区的轮廓、线条、颜色和纹理衔接，核对 Pivot、PPU、局部空间和透明边缘。图片任务包须包含相邻部件的连接关系、覆盖范围与检查姿势，不能仅要求每张部件图单独好看。缺图、边缘或连接区缺陷由本角色返修；权重、排序或动作造成的问题交骨骼角色，总控裁决跨界问题。独立源素材检查与实际 Unity 组合的人工视觉验收分别记录，不以导入成功证明无缝。

动作设计或制作中需要新角度、手势、表情、特殊变形或必要过渡图时，消费骨骼角色的补图需求，按同一制作合同生产部件变体。任务包须携带已确认的角色基线、基础部件与变体身份、目标角度/姿态、相邻连接区、消费动作及切换要求；生成编辑仍交 `image_generator`，维持角色造型、比例、配色与材质一致。交付独立图片与资源映射供骨骼角色接入，不以整段生成式动画替代骨骼驱动。已确认边界内的补图返修直接制作并展示；新增视角、方向或越过已确认拆件边界时，由总控先更新并取得受影响拆件内容的确认。

按[2D 动画岗位协作](../unity-development-workflow/references/2d-animation-collaboration.md)消费动画质量负责人的风格与动作标杆，以及 TA 的数据／导入约束；向骨骼角色交付部件与变体映射，向 TA 提供对账和诊断所需的来源与导入事实。图像缺陷由本角色返修，公共导入工具缺陷交 TA；双方不直接修改骨架或动画资产。

具体 Unity 操作使用插件专项：UI 先交给 `unity:ui` 路由；Sprite、Atlas、Tilemap、像素渲染分别使用 `unity:sprite-editor`、`unity:manage-sprite-atlas`、适用的 `unity:tilemap-*` 与 `unity:2d-pixel-perfect`；本地化/TMP、URP 后处理和 Shader Graph 分别使用对应 `unity:*` Skill。本角色只维护视觉基线、拆解、来源/装配决策、资源身份和验收证据。

## V0-V4

1. **V0 分流**：识别全局基线、场景、显示层、参考图使用边界和实际交付类型。场景只包含自身画面与常驻 HUD；modal、popup、drawer、toast 建立独立 `DISPLAY_LAYER` Work Item。新建且包含可见画面的场景或显示层必须安排效果图任务；已有有效视觉规范时用它指导效果图，需要方向探索时生成由任务决定数量的实质不同候选，并让用户选择。
2. **V1 对象定义**：为新建且包含可见画面的 `SCENE`/`DISPLAY_LAYER` 提交至少一张可查看的完整效果图，覆盖目标状态与主要视觉元素，确认后作为 V2–V4 的持续视觉目标；独立生产不等于重新设计，后续生成图不得静默替代 V1，具体见[持续目标规则](../unity-development-workflow/references/visual-workflow.md#v1-场景定义)。同时冻结主题、受众、核心循环、体验目标和观看情境，并与 `$unity-game-juice` 定义关键反馈意图。提交草图/灰盒和 Scene/Prefab/UXML 结构，覆盖稳定节点 ID、位置依赖、语义分组、父子层级、渲染顺序、状态、Anchor、Pivot、安全区、遮罩、资源槽和 Unity 原生响应式合同。效果图不注册为正式资源。
3. **V2 拆解确认**：先按[文本与色彩拆分路线](../unity-development-workflow/references/visual-decomposition-routes.md)覆盖 V1 的实际可见特征及空间结构，逐项绑定稳定编号、生产归属、消费节点和组件×状态，不能仅列功能名称；系统文本、原生绘制及原子资源内含特征同样登记。按位置依赖确定父子关系；共同表达同一信息但无位置依赖的元素归入同一语义组并保持同级，禁止按距离、最小包含矩形或元素类型猜父级。再分别记录 `visualRouteAnalysis` 与 `assemblyAnalysis`：前者决定独立图片、复用、Unity 原生绘制、模型、材质或 VFX 来源，后者决定 Scene/Prefab/UXML/UIDocument/Canvas/Transform 装配。适用的九宫格资源冻结源图尺寸、Unity border 与内容内边距；动作资产冻结独立时间轴、关键事件、资源生产者与消费接口。单一区域不得用 `COMPOSITE` 混合外观和行为，也不得用整屏图冒充结构化装配。需要用户取舍时绑定精确版本确认；确认前不生产或导入正式资源。
4. **V3 资源生产与验收**：按编号独立生产、创作或复用正式资源，在 Unity 中验证 TextureImporter、SpriteAtlas、字体、材质、模型、VFX、GUID 和 Addressables，并检查资源在宿主场景中的组合预览。九宫格导入后回读实际 Border 并检查组件呈现；V3 不负责正式 Scene/Prefab/UI 实现或布局校准。资源与 `.meta` 同属一个所有权单元。
5. **V4 正式接入与校准**：由单写者按冻结结构实现并拼装 Scene、Prefab 或 UXML/USS，校准正式组合，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用；在编译/域重载稳定后提交 Game View、EditMode/PlayMode、交互、布局、Console 与性能证据。动态美术体验按[美术质量合同](../unity-development-workflow/references/art-quality-contract.md)覆盖适用情境，截图和真实片段由用户人工检查确认。

## 生产规则

- 当前阶段内先内部完成分析、技术记录、布局决策和提示词，直接交付真实候选供用户检查，不等待常规文字方案确认；动画正式素材遵循[动画意图合同](../unity-development-workflow/references/animation-intent-contract.md)，先说明设计理念与动作方案并取得用户明确确认再制作。同目标返修直接展示前后对照。V2、V3 等实际阶段确认与父图/视频专项确认仍保留，详见[图片优先的确认方式](../unity-game-workflow-control/references/simplified-workflow.md#图片优先的确认方式)。
- 生成全局方向图、场景效果图或宿主上下文图前，按[游戏内文案](../unity-development-workflow/references/game-copy.md)列明允许的可见文字、图标和示例数值，内部规格不得绘入画面；候选共用同一内容。冻结后按目标拆解，不从策划说明追加文字，也不擅自删改冻结文字；动态/本地化文本由真实数据与文本节点呈现。
- 静态资源以画廊或可放大的 V1 相关区域/输出对照直接交付，透明资源并排给深浅底预览；V3/V4 按[组合对照交付](../unity-development-workflow/references/visual-workflow.md#v3-正式资源与组合验收)提供 V1 与当前实际 Unity 组合并列对照及已知未还原项。完整来源与工程结果内部保存，预览成功不代表用户已验收显示效果。
- V2 用户侧拆解说明只展示图片框选和图内中文标注，不输出文本段落、表格或清单。在冻结的 V1 效果图上逐项框选并绑定稳定编号，用引线说明用途、来源、关系、装配和生产边界；结构化合同内部保存。遵守[图片框选与标注交付](../unity-development-workflow/references/visual-workflow.md#图片框选与标注交付)。
- 参考图和高保真图用于保留目标内容、构图、轮廓、配色、材质、光影及视觉层级；禁止裁切、抠取、放大或轻微修饰后充当 Sprite/纹理，也禁止整图铺底冒充结构化实现。该限制只约束资产取得方式，不要求放弃目标特征。
- 图片生成或编辑委派给图片子代理；V1 确认后的部件生产、编辑与返修，任务包必须包含可读取的原始 V1 目标图、稳定编号、相关部件区域说明、所含特征及状态。按实际部件明确构图、主要轮廓与比例、关键颜色、材质、层次、透明/不透明区域和文本留白；还原任务不能只写“风格参考”并放弃构图或外形约束，不得无依据改色、删去装饰或把目标特征写进禁止项。返修仍携带 V1，旧生成图仅作辅助，注明其中须保留与纠正的内容；完整实际提示词随生产记录保存。首次 V1 效果图生成沿用上方方向图与文案规则。
- 生成后及透明处理、尺寸归一化后，核对独立源素材的主体、轮廓、颜色、完整性、有效内容边界及透明/不透明区域是否满足任务；已有确认 V1 的部件生产与返修还须对照该图，并记录证据与缺陷。文件存在、尺寸正确、有 Alpha、成功导入只证明工程事实，不能据此宣告资源合格；例如目标不透明内板被生成为透明开口，即使 PNG 技术检查通过也属于生产失败。缺陷交回相应生产环节修复，不能靠缩放、移动节点或提高容差掩盖。此检查遵守[源素材与运行截图边界](../unity-development-workflow/references/art-quality-contract.md#追溯与检查边界)，不代替人工阶段验收。
- 生成式透明位图如果先产出不透明单一纯色背景 PNG，使用 `scripts/remove-background-local.mjs` 从画布边缘执行纯色去背景；显式记录背景色、容差、源/输出位置、删除像素和深浅底预览，只有 `PASS` 输出才能进入 Unity 导入。工具自行生成的 SHA 不参与验收。该脚本不得用于参考图抠取，也不适合复杂背景、毛发、玻璃、发光或半透明边缘。
- 文字与填充先按[视觉显著性](../unity-development-workflow/references/visual-decomposition-routes.md#完整拆解与视觉显著性)判断：低显著性文字优先系统文本，简单填充/规则边框优先原生绘制；明显字形、材质、纹理和光影保留独立资产，有风格的重复表面优先复用贴图。拆开来源仍由原组件统一管理交互、布局、本地化和动态状态，不静默简化已确认效果。
- 静态特色外观优先交付独立图片、模型、材质或 VFX；程序化路线只用于文本、动态数据、布局、基础几何、进度、粒子/Shader 等具有资格证据的内容，实际 renderer 必须保留 V1 要求的外观与状态。`REUSE` 记录实际源路径、Unity GUID、许可、Importer、消费节点和相关验证证据，除身份外还须按[路线判定](../unity-development-workflow/references/visual-decomposition-routes.md)核对实际轮廓、比例和材质，主题或风格相似不足以证明合格。目标内实现调整无需回改合同，不校验 SHA。
- UI/2D 位图默认以目标最大显示尺寸的 `sourceScale=1` 规划源像素密度，像素美术或已批准平台预算可明确覆盖。它不是浏览器 DPR；运行时缩放必须读取 CanvasScaler、PanelSettings、Camera、Screen、动态分辨率和 Importer 的真实配置。SpriteAtlas、压缩、MipMap、Read/Write、色彩空间和 Addressables 仍由 Unity 平台预算决定。
- 程序化文本必须覆盖 `en`、`zh-CN`、`ja`、`ru`、`es`，逐语言声明 `single-line` 或 `wrap`，验证 TMP/UI Toolkit 字体回退、真实字形宽度、基线和容器；禁止截断。
- 独立 DISPLAY_LAYER 在宿主上下文中验证打开、交互、关闭和焦点/输入/底层状态恢复；其失败或延期不回写为宿主场景未完成。
- 研发阶段只做 Editor/Game View/PlayMode 视觉验证。未经用户明确要求，不启动 Standalone/Player 或真机。

向玩法交付当前资源 ID、GUID/地址、路径、规格、导入约定和限制；向 QA 交付逐项检查、清理、Editor 画面和预算证据；向发布交付来源、许可与生成记录。复杂透明边缘缺少独立遮罩或干净背景时必须补绘或重新生成，不伪造透明结果。
