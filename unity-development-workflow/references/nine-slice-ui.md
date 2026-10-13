# 九宫格 UI 资源合同

在 V2 拆解和 V3 导入、组合 UI 时使用。适用于需要在不同尺寸下保持边角形状的面板、按钮或条幅；不适用于没有切片需求的图片。

## V2 决策与规格

对每个候选资源先记录是否采用九宫格及理由。采用时冻结：

- 资源 ID、源图路径与 `sourceSize`（源图像素宽高）；
- `border` 四边像素值，顺序为 Unity `Sprite.border` 的 `left, bottom, right, top`；
- 目标显示尺寸范围、目标最小宽高和内容安全内边距；
- 中心区域允许拉伸的视觉意图，以及文字、图标、装饰相对面板的独立布局节点。

结构化 `nineSlice` 使用 `mode: stretch`、`reason`、`sourceSize` 和 `border`；不适用时仅记录 `mode: not-applicable` 与理由。明确分类为 `assetType: UI_SKIN` 的拆解项必须记录正反决策。本合同只处理拉伸九宫格，平铺需要独立呈现合同。图片任务的 `nineSlice.sourceSize` 是小图源尺寸，导入时与实际解码纹理核对；`unityImport.border` 非零时必须提供相同的 stretch 声明，不以目标显示框尺寸生产大图。

四边宽度必须落在源图范围内且彼此不发生无效交叉；内容内边距不因切片边界自动推定。文字、图标、计数和可交互区域保留为独立组件，不烘焙进九宫格面板图。

## V3 导入与实际呈现

Unity 导入后回读 Sprite 的实际尺寸、Sprite Mode、Border 和资源身份，记录读回值及与 V2 目标的差异。仅检查导入参数或 YAML 不能证明实际显示正确。

stretch Sprite 使用 `Single` 与 `Full Rect` 网格，登记前检查实际纹理尺寸、完整 Sprite.rect、纹理引用和 Sprite.border；保留未裁切源画布。Unity 官方九宫格步骤要求 Full Rect，Tight 网格可能使切片错误，见[Unity 6 九宫格设置](https://docs.unity3d.com/6000.0/Documentation/Manual/sprite/9-slice/set-sprite-9slicing.html)。SpriteAtlas 接入时继续检查打包后的固定角边、透明留白与切片呈现，不能用导入通过代替组合验收。

- **uGUI**：使用设置了有效 Border 的 Sprite，并在目标 `Image` 上选择 `Sliced`；在 Prefab/Scene 的实际尺寸范围检查四边与中心区域。
- **UI Toolkit**：使用项目当前 Unity/UI Toolkit 版本支持的切片呈现方式，按 `unity:ui-uitk` 操作并在实际 UIDocument/USS 组合中核对四边、中心、内边距与目标尺寸。不要仅凭样式属性存在判定通过。

参数回读、Prefab 引用和结构检查可作为工程证据；拉伸、接缝、边缘、文字与图标布局的显示效果由用户人工检查并确认。机器参数通过不能记为视觉通过。

## 跨阶段核对

使用 `workflow-files.mjs nine-slice-check --project-root <项目> --source <项目内 JSON>` 核对传递。JSON 的 `item`、`task`、`registration`、`binding` 分别引用当前 V2 项、图片任务、真实 Unity 登记与正式组合绑定，`placements` 记录消费者实测。每项包含 `nodeId`、`measured: true`、`presentation`（`UGUI_SLICED` 或 `UITOOLKIT_SLICED`）、实际源像素 `border`、显示 `size`、`coordinateSpace`（`SCREEN_PIXELS` 或 `UNITY_LOGICAL_UNITS`）与 `borderPixelsToUnits`。最后一项表示每个源像素对应多少显示单位，须从实际 Sprite PPU、Canvas 比例/PPU multiplier 或 Panel 切片比例推导，不能默认 1。必须完整覆盖 `binding.consumerNodeIds`，不可手填虚假实测或以截图推测参数。

工具检查资源身份、GUID/路径、源尺寸、Border 和每个显示框的正尺寸中心；源图尺寸与显示尺寸分别核对，Importer 缩小源纹理或消费者改为整图拉伸都不能放行。显示效果仍使用既有 V3/V4 人工确认。

当前跨合同检查只支持四边使用统一的源像素转换比例；存在非均匀变换、各边不同切片缩放或无法取得实际比例时，不提交虚构的统一值，应先修正呈现方案或补充对应的实际四边测量能力。
