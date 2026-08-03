# P3-002 人物合同

本文件固定 Star Blogger 玩家人物的当前权威、文件边界、17 项映射和已知失败特征。执行代理必须从项目工作区读取实际文件并重新计算哈希，不得把本文件当作资源副本。

## 权威证据

相对 Star Blogger 工作区读取：

- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/target-board/p3-002-v5-neutral-target-r3.png`
  - 当前批准目标哈希：`3c4da040649bd6f3a52dbd9ee423493ccd063b32619ed25a34a29334bbfb5ce6`
- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/target-board/p3-002-v5-target-user-approval.yaml`
- `Artifacts/Visual/GlobalDirection/visual-bible-v0.9.yaml`
- `Artifacts/Grilling/Visual/p3-002-v5-visual-correction-decision-snapshot.yaml`
- `Artifacts/Grilling/Visual/grilling-p3-002-v5-visual-correction.yaml`
- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/layered-character-production-plan-v5-round1.yaml`

目标哈希变化时，要求新的内容绑定批准；不得静默更新本合同中的哈希。

以下文件只能作为历史诊断证据，不是视觉权威：

- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/reviews/final/three-discipline-review-summary.yaml`
- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/p3-002-v5-static-candidate-host-approval-observation.yaml`
- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/p3-002-v5-unity-static-validation.json`
- `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/unity-capture/p3-002-v5-unity-expression-contact-sheet.png`

这些历史文件可以证明旧候选的技术接入，但不得证明其视觉还原。

## 冻结视觉目标

必须保持以下身份和造型：

- 年轻女性，暖棕中等肤色，友好、自信、自然，不使用模板化娃娃脸。
- 短而自然的额头，脸型偏窄的圆润椭圆，颊部有体积但不得横向膨胀，下颌圆润且收束。
- 暖棕杏仁眼、克制眼白与睫毛；鼻梁、鼻尖和鼻翼可读，禁止只剩漂浮白色高光。
- 自然玫瑰唇；neutral、smile、speaking、frown 必须共享嘴部中心和脸部身份。
- 深咖近黑卷发，前发偏分且非对称，后发为低复杂度大体积，禁止左右完全对称的头盔形轮廓。
- 亮而受控的创作者蓝短外套、奶油内搭、象牙高腰阔腿裤、白色蓝饰厚底运动鞋、暖金配饰。
- 自然肩腰髋，头、手和袖子不得相对目标放大；双臂约外展 22 度，双脚正向平行。
- 主要轮廓使用 Visual Bible 的 Ink Violet `#3B3651`，明暗保持二至三层，不得出现皮肤平涂而头发过密的失衡。

## 已知失败特征

修正时主动搜索并阻断：

- 旧头部轮廓残留在新脸后方，形成横跨额头的深色弧线。
- Body/Base 是完整人体而衣服未扣除覆盖区，导致腋下、袖侧或腰口露出橙色皮肤条。
- 脸过宽、过圆、额头过高，五官位置与目标身份不一致。
- 前后发过度对称、体积像头盔、发丝线密度过高或肩部截断生硬。
- 肩和躯干过宽、手过大、袖子过厚、外套和裤型比例漂移。
- 鼻部几乎不可见，只留下白色高光或孤立像素。
- frown 嘴型过大、过厚；四种表情只替换嘴贴图，没有眉眼协同。
- 肤色过橙、外套过青、候选阴影层次明显少于目标。

这些问题任一存在都必须判定视觉失败。

## 统一生产母版合同

生产母版必须：

- 使用 2048×2048 RGBA 规范画布，人物完整且四角透明。
- 保持目标人物全身比例、正面 A-pose、鞋底基线和头顶留白。
- 不包含背景、文字、UI、第二人物、阴影地台或水印。
- 建立机器可读的几何记录，至少包含 `characterBounds`、`headBounds`、`faceBounds`、`eyesCenter`、`noseCenter`、`mouthCenter`、`shoulders`、`elbows`、`wrists`、`fingertips`、`waist`、`hips`、`crotch`、`knees`、`ankles` 和 `soleBaselineY`。
- 建立允许露出皮肤的区域：脸、耳、颈胸开口、手和明确设计的局部；其余 Body/Base 必须被服装或遮挡蒙版清除。
- 记录主色、次色、轮廓色和阴影阶，所有图层复用同一色板。

禁止仅记录每层外接框。外接框一致不能证明内部身份、比例或遮挡一致。

## 17 项生产顺序

保持现有运行时名称、类别、标签和稳定 ID：

1. `Hair/Back` — `curls-dark-back-v2` — `hair-back-curls-dark-v2.png`
2. `Body/Base` — `skin-warm-medium-v2` — `body-base-skin-warm-medium-v2.png`
3. `Outfit/Bottom` — `ivory-wide-leg-v2` — `outfit-bottom-ivory-wide-leg-v2.png`
4. `Shoes` — `white-sneakers-v2` — `shoes-white-sneakers-v2.png`
5. `Outfit/Top` — `creator-blue-jacket-cream-top-v2` — `outfit-top-creator-blue-jacket-cream-top-v2.png`
6. `Hair/Front` — `curls-dark-front-v2` — `hair-front-curls-dark-v2.png`
7. `Face/Brows` — `neutral-v2` — `face-brows-neutral-v2.png`
8. `Face/Brows` — `raised-v2` — `face-brows-raised-v2.png`
9. `Face/Eyes` — `open-brown-v2` — `face-eyes-open-brown-v2.png`
10. `Face/Eyes` — `blink-v2` — `face-eyes-blink-v2.png`
11. `Face/Nose` — `natural-medium-v2` — `face-nose-natural-medium-v2.png`
12. `Face/Mouth` — `neutral-rose-v2` — `face-mouth-neutral-rose-v2.png`
13. `Face/Mouth` — `smile-v2` — `face-mouth-smile-v2.png`
14. `Face/Mouth` — `open-v2` — `face-mouth-open-v2.png`
15. `Face/Mouth` — `frown-v2` — `face-mouth-frown-v2.png`
16. `Accessory/Necklace` — `simple-chain-v2` — `accessory-necklace-simple-chain-v2.png`
17. `Accessory/Earrings` — `simple-hoops-v2` — `accessory-earrings-simple-hoops-v2.png`

`Accessory/Necklace:none` 与 `Accessory/Earrings:none` 是显式空状态，不生成透明占位文件。

## 输出与稳定路径

生产源目录使用新修订，不覆盖历史来源；最终获批后才写入：

- `Assets/Art/Runtime/Characters/Player/Sprites/`
- `Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteLib`
- `Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteatlasv2`
- `Assets/Prefabs/Characters/Player/PlayerCharacter.prefab`
- `Assets/Prefabs/Characters/Performance/DualCharacterPerformance.prefab`

覆盖 PNG 时保留现有 `.meta`。导入前后都记录 17 个 Sprite GUID，以及 SpriteLibrary、Atlas、Player Prefab 和 Performance Prefab 的稳定 GUID；任何非预期变化都阻断。

## 逐项记录最低字段

每个生产单元至少记录：

- `recordType: CHARACTER_LAYER_ITEM_REVIEW`。
- 项目、资源、类别、标签和修订号。
- 生产母版路径与哈希。
- 生成或重绘提示、引用图、模型或工具、原始输出和处理步骤。
- 正式 2048 RGBA 输出路径、哈希、Alpha 边界和允许可见区域。
- 单图、完整组合、局部放大、三背景和遮挡泄漏证据路径。
- 视觉、技术、UX 结论及阻断项。
- 修订链和被替代输出。

缺少任一来源或审查记录时不得计入 17/17 完成数。

确定性审计要求逐项记录至少包含以下机器可读结构：

```yaml
recordType: CHARACTER_LAYER_ITEM_REVIEW
status: ITEM_VISUAL_TECHNICAL_PASS
category: Hair/Back
label: curls-dark-back-v2
master: {path: path/to/master.png, sha256: 64位小写十六进制}
output: {path: path/to/hair-back-curls-dark-v2.png, sha256: 64位小写十六进制}
evidence:
  layerPreview: path/to/layer-preview.png
  fullComposite: path/to/full-composite.png
  threeBackgrounds: path/to/three-backgrounds.png
  targetDetailComparison: path/to/target-detail-comparison.png
  occlusionLeak: path/to/occlusion-leak.png
reviews: {visual: PASS, technical: PASS, ux: PASS}
```

脚本只验证证据存在、PNG 规格和哈希一致；视觉审阅者仍必须直接看图。

## 必需验收证据

提交完整候选时绑定：

- 目标与候选等高全身对照。
- 脸部原生像素 A/B。
- 头发、肩胸、双手、腰胯、裤鞋边界 A/B。
- 全身和局部轮廓差异图。
- 浅色、深色和透明棋盘背景。
- neutral、smile、speaking、frown 四状态联系表及标签。
- open/blink、neutral/raised、配饰开关证据。
- Body/Base 与 Outfit/Top、Outfit/Bottom、Shoes 的覆盖泄漏图。
- Unity 原生 SpriteRenderer 的同构验收板。

独立审阅者必须直接查看这些图，不得只读取作者摘要或哈希报告。
