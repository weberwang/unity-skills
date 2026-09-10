---
name: unity-game-visual-assets
description: 在 Unity 场景 V0-V4 中建立视觉基线、结构草图、资源拆解、2D/UI 资源和正式 Scene/Prefab/UXML 组合，并提交 Unity 领域审查与运行证据；不负责生产级 3D 模型或 PBR 贴图。
---

# Unity 视觉与资源接入

本角色消费 `$unity-game-workflow-control` 的 Work Item 和 `$unity-development-workflow` 的场景计划。视觉生产使用 V0-V4；A0-A6 只表示动作风险，F2 记录领域质量，F3 记录 Unity 工程验证。

## 输入与边界

读取 Visual Bible、场景契约、结构草图、资源登记、性能预算和当前 V 阶段。只有存在实质视觉取舍、授权、外部生成成本或替代策略时，才把精确问题交给 `$unity-game-grilling`；已有有效决定不重复询问。

生产级 3D 模型与 PBR 贴图分别交给 `$unity-game-3d-modeling` 和 `$unity-game-3d-texturing`。现有 Spine 角色仅换皮且 Bone、Slot、Attachment、Mesh、约束与动画固定时交给 `$unity-game-spine-reskin`。

## V0-V4

1. **V0 分流**：识别全局基线、场景、显示层、参考图使用边界和实际交付类型。已有有效视觉规范时直接消费；需要方向探索时生成由任务决定数量的实质不同候选，并让用户选择。
2. **V1 场景定义**：提交可查看草图/灰盒和 Scene/Prefab/UXML 结构，覆盖稳定节点 ID、父子层级、渲染顺序、状态、Anchor、Pivot、安全区、遮罩和资源槽。
3. **V2 拆解确认**：对可见元素建立稳定编号、组件×状态与生产路线，记录 bounds、尺寸、透明、Pivot、PPU、Border、Importer、GUID/地址、目标节点、来源、许可与验证规格。需要用户取舍时绑定精确版本确认；确认前不生产或导入正式资源。
4. **V3 资源与组合验收**：按编号独立生产、创作或复用，在 Unity 中验证 TextureImporter、SpriteAtlas、字体、材质、模型、VFX、GUID、Addressables 和宿主同屏组合。资源与 `.meta` 同属一个所有权单元。
5. **V4 正式接入**：由单写者按冻结结构拼装 Scene、Prefab 或 UXML/USS，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用；在编译/域重载稳定后提交 Game View、EditMode/PlayMode、交互、布局、Console 与性能证据。

## 生产规则

- 参考图和高保真图只用于内容、构图和信息层级；禁止裁切、抠取、放大或轻微修饰后充当 Sprite/纹理，也禁止整图铺底冒充结构化实现。
- `REUSE` 必须绑定源路径/SHA、Unity GUID、许可、风格、Importer 和最近验证证据。程序图元、文本、UXML/USS、材质、VFX 和 3D 走各自结构化通道。
- SpriteAtlas、压缩、MipMap、Read/Write、色彩空间和 Addressables 根据 Unity 平台预算决定，不照搬浏览器 DPR 或 Canvas 约束。
- 显示层在宿主上下文中验证打开、交互、关闭和焦点/输入/底层状态恢复；全部必需显示层关闭后场景 V4 才完成。
- 研发阶段只做 Editor/Game View/PlayMode 视觉验证。未经用户明确要求，不启动 Standalone/Player 或真机。

向玩法交付当前资源 ID、GUID/地址、路径、规格、导入约定和限制；向 QA 交付逐项检查、清理、Editor 画面和预算证据；向发布交付来源、许可与生成记录。复杂透明边缘缺少独立遮罩或干净背景时必须补绘或重新生成，不伪造透明结果。
