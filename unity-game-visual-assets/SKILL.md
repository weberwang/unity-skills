---
name: unity-game-visual-assets
description: 在 Unity 场景 V0-V4 中建立视觉基线、结构草图、资源拆解、2D/UI 资源和正式 Scene/Prefab/UXML 组合，并提交 Unity 领域审查与运行证据；不负责生产级 3D 模型或 PBR 贴图。
---

# Unity 视觉与资源接入

本角色消费 `$unity-game-workflow-control` 的 Work Item 和 `$unity-development-workflow` 的场景计划。视觉生产使用 V0-V4；A0-A6 只表示动作风险，F2 记录领域质量，F3 记录 Unity 工程验证。

## 输入与边界

读取 Visual Bible、场景契约、结构草图、资源登记、性能预算和当前 V 阶段。只有存在实质视觉取舍、授权、外部生成成本或替代策略时，才把精确问题交给 `$unity-game-grilling`；已有有效决定不重复询问。

生产级 3D 模型与 PBR 贴图分别交给 `$unity-game-3d-modeling` 和 `$unity-game-3d-texturing`。现有 Spine 角色仅换皮且 Bone、Slot、Attachment、Mesh、约束与动画固定时交给 `$unity-game-spine-reskin`。

具体 Unity 操作使用插件专项：UI 先交给 `unity:ui` 路由；Sprite、Atlas、Tilemap、像素渲染分别使用 `unity:sprite-editor`、`unity:manage-sprite-atlas`、适用的 `unity:tilemap-*` 与 `unity:2d-pixel-perfect`；本地化/TMP、URP 后处理和 Shader Graph 分别使用对应 `unity:*` Skill。本角色只维护视觉基线、拆解、来源/装配决策、资源身份和验收证据。

## V0-V4

1. **V0 分流**：识别全局基线、场景、显示层、参考图使用边界和实际交付类型。场景只包含自身画面与常驻 HUD；modal、popup、drawer、toast 建立独立 `DISPLAY_LAYER` Work Item。已有有效视觉规范时直接消费；需要方向探索时生成由任务决定数量的实质不同候选，并让用户选择。
2. **V1 对象定义**：提交可查看草图/灰盒和 Scene/Prefab/UXML 结构，覆盖稳定节点 ID、位置依赖、语义分组、父子层级、渲染顺序、状态、Anchor、Pivot、安全区、遮罩、资源槽和 Unity 原生响应式合同。
3. **V2 拆解确认**：对可见元素建立稳定编号和组件×状态。先按位置依赖确定父子关系；共同表达同一信息但无位置依赖的元素归入同一语义组并保持同级，禁止按距离、最小包含矩形或元素类型猜父级。再分别记录 `visualRouteAnalysis` 与 `assemblyAnalysis`：前者决定独立图片、复用、Unity 原生绘制、模型、材质或 VFX 来源，后者决定 Scene/Prefab/UXML/UIDocument/Canvas/Transform 装配。单一区域不得用 `COMPOSITE` 混合外观和行为，也不得用整屏图冒充结构化装配。需要用户取舍时绑定精确版本确认；确认前不生产或导入正式资源。
4. **V3 资源与组合验收**：按编号独立生产、创作或复用，在 Unity 中验证 TextureImporter、SpriteAtlas、字体、材质、模型、VFX、GUID、Addressables 和宿主同屏组合。资源与 `.meta` 同属一个所有权单元。
5. **V4 正式接入**：由单写者按冻结结构拼装 Scene、Prefab 或 UXML/USS，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用；在编译/域重载稳定后提交 Game View、EditMode/PlayMode、交互、布局、Console 与性能证据。

## 生产规则

- 参考图和高保真图只用于内容、构图和信息层级；禁止裁切、抠取、放大或轻微修饰后充当 Sprite/纹理，也禁止整图铺底冒充结构化实现。
- 生成式透明位图如果先产出不透明单一纯色背景 PNG，使用 `scripts/remove-background-local.mjs` 从画布边缘执行纯色去背景；显式记录背景色、容差、源/输出 SHA、删除像素和深浅底预览，只有 `PASS` 输出才能进入 Unity 导入。该脚本不得用于参考图抠取，也不适合复杂背景、毛发、玻璃、发光或半透明边缘。
- 静态特色外观优先交付独立图片、模型、材质或 VFX；程序化路线只用于文本、动态数据、布局、基础几何、进度、粒子/Shader 等具有资格证据的内容。`REUSE` 必须绑定源路径/SHA、Unity GUID、许可、Importer、消费节点和最近验证证据，不能以“看起来相似”代替身份。
- UI/2D 位图默认以目标最大显示尺寸的 `sourceScale=2` 规划源像素密度，像素美术或已批准平台预算可明确覆盖。它不是浏览器 DPR；运行时缩放必须读取 CanvasScaler、PanelSettings、Camera、Screen、动态分辨率和 Importer 的真实配置。SpriteAtlas、压缩、MipMap、Read/Write、色彩空间和 Addressables 仍由 Unity 平台预算决定。
- 程序化文本必须覆盖 `en`、`zh-CN`、`ja`、`ru`、`es`，逐语言声明 `single-line` 或 `wrap`，验证 TMP/UI Toolkit 字体回退、真实字形宽度、基线和容器；禁止截断。
- 独立 DISPLAY_LAYER 在宿主上下文中验证打开、交互、关闭和焦点/输入/底层状态恢复；其失败或延期不回写为宿主场景未完成。
- 研发阶段只做 Editor/Game View/PlayMode 视觉验证。未经用户明确要求，不启动 Standalone/Player 或真机。

向玩法交付当前资源 ID、GUID/地址、路径、规格、导入约定和限制；向 QA 交付逐项检查、清理、Editor 画面和预算证据；向发布交付来源、许可与生成记录。复杂透明边缘缺少独立遮罩或干净背景时必须补绘或重新生成，不伪造透明结果。
