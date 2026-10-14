# 屏幕 UI 布局与节点树

## 适用范围

在 V1 定义屏幕 UI 结构、V2 冻结拆解与装配合同、V3 组合预验收、V4 多视口验证时使用。适用于 uGUI 的 Canvas/RectTransform 和 UI Toolkit 的 UIDocument/UXML；World Space Canvas 按世界尺寸、相机距离和像素密度另行设计。

## 布局基准与分层

HUD、按钮、弹窗和奖励反馈先按[游戏内文案](game-copy.md)确定最小必要可见表达，再安排节点与布局。图标、数值和符号已表达的信息不重复写成解释句；数值与对应图标及语境形成同一信息组，必要条件、引导、操作后果和无障碍名称仍保留。内部规格、拆解标注和编辑器说明不加入正式 UI。

- 横屏设计基准 `1920×1080`，CanvasScaler/PanelSettings 使用随屏幕尺寸缩放、Match Width Or Height、`Match = 1`；竖屏 `1080×1920`，`Match = 0`。设计基准不是实际输出分辨率。
- 全屏背景可延伸到安全区之外并裁切边缘；关键文字、按钮、玩法信息以实时 `Screen.safeArea` 为边界。弹窗遮罩可覆盖全屏，弹窗内容必须留在安全区内。
- 基础模块的 `SafeAreaRectTransform` 只挂在全屏 Canvas 的直接子节点 `SafeAreaRoot`；UI Toolkit 使用 `SafeAreaVisualElement` 作用于全屏 `UIDocument` 根节点的同名直接子节点。两者共享实时安全区换算；不得给背景或遮罩挂安全区组件，也不得在已经收缩的父节点内重复应用。
- 常驻 HUD、当前页面和 modal/popup/drawer/toast 使用独立根节点；瞬态层属于独立 `DISPLAY_LAYER` Work Item，不能混入宿主 HUD 的所有权。
- 背景填满可见区域；保持图片比例时按源图比例覆盖并接受装饰边缘裁切。窄屏空间不足时重排或滚动内容，不通过缩小关键控件或固定相机视口掩盖问题。

## 布局参照选择

在 V1 确定布局参照，V2 冻结到 `layoutBinding`，V3/V4 沿用同一参照：

| UI 所属范围 | 布局参照与行为 |
| --- | --- |
| 场景中的 UI（常驻 HUD、场景页面） | 相对场景内容区域的实际大小停靠。顶部、底部、角落与居中控件分别跟随场景对应边缘或中心；场景区域尺寸变化时重算锚点位置、边距和拉伸范围。 |
| 有底板的弹窗内部 UI | 相对底板的内容区域布局。标题、正文、按钮、关闭控件等跟随底板的尺寸、内边距和缩放，不各自锚定屏幕。底板装饰外沿、阴影不作为内容边界。 |
| 无底板的弹窗内部 UI | 相对屏幕布局。以全屏显示层为参照，按屏幕边缘或中心停靠，并受实时安全区约束。 |

场景内容区域由 V1 的场景尺寸与相机合同确定，并换算到 Canvas/Panel 坐标；它不是 Unity 场景中所有物体 bounds 的并集，也不能直接用扩展后的屏幕或装饰边带替代。场景内容区域与屏幕重合时可以共用边界，存在边带或裁切时必须保留区别。关键 UI 的可停靠范围取场景内容区域与实时屏幕安全区的交集；空间不足时重排或滚动，不把控件移入装饰边带。

弹窗底板本身相对屏幕定位并约束在安全区内，内部 UI 再相对底板布局；全屏遮罩仍独立覆盖屏幕。底板可以是图片或原生面板，但必须有明确的布局容器。无底板时使用屏幕参照容器，不为布局凭空增加可见底板。

uGUI 用场景区域或底板容器的 RectTransform 承担停靠参照，UI Toolkit 用对应容器的布局矩形与 Flex/定位规则实现。`parentElementId` 仍记录实际直接父节点，嵌套组件逐级继承参照；在 `constraints` 中明确场景区域、底板内容区域或屏幕的参照节点、边界来源、停靠边与边距，在 `resizePolicy` 中声明参照尺寸变化后的重算策略。安全区组件仍只应用一次，区域换算不得再次收缩父容器。

```text
UIRoot
├── BackgroundRoot                 # 全屏、无交互
├── SafeAreaRoot                   # 关键内容
│   └── SceneLayoutRoot            # 场景内容区域与安全区的交集
│       ├── HUDRoot
│       │   ├── TopBar
│       │   ├── CenterIndicators
│       │   └── BottomActions
│       └── PageRoot
└── DisplayLayerRoot               # 独立显示层的全屏 Canvas/UIDocument
    ├── FullscreenDimmer
    └── SafeAreaRoot               # 显示层根的直接子节点，应用一次安全区
        └── PopupPanelRoot         # 有底板时：底板定位与内部布局
            ├── PanelVisual       # 底板外观
            └── PanelContent      # 标题、正文、按钮等相对底板布局
```

无底板的弹窗省去 `PopupPanelRoot`，内容直接放在显示层的 `SafeAreaRoot` 或其有实际职责的子容器内，相对屏幕布局。显示层与宿主使用各自全屏 Canvas/UIDocument 时分别换算安全区；共用同一根时复用已有安全区结果，不重复挂载安全区组件。

## 细组件分组

一个父节点必须拥有可解释的职责：共同定位、布局控制、交互命中、状态或生命周期、裁切边界、组件复用。只有共同主题、外观相近或图上距离近，不构成父子关系；没有依赖的元素保持同组同级。容器本身无布局或行为职责时删除空层。

按[文本与色彩拆分路线](visual-decomposition-routes.md)拆开的字图/系统文本、填充、边框和装饰分别登记视觉来源，仍归属原功能组件。视觉子节点共用实际布局、裁切及状态来源，输入交给原组件根节点；原生文本和填充不因无需图片而从拆解清单遗漏，不能为拆分增加重叠命中目标或破坏进度、本地化更新。

- **交互单位**：一次点击作用于整个按钮或背包格，就用一个组件根节点；视觉子节点交由根节点接收输入，避免多个重叠命中目标。
- **布局控制**：TopBar、网格、列表等容器管理子项尺寸或间距。受 Layout Group/Flex 控制的属性不再手动写死；动画放入内部 VisualRoot，避免与父布局控制相争。
- **状态与复用**：同时显示/隐藏、播放状态动画或重复实例化的内容形成独立组件根。仅更新频率不同不足以建立业务父子关系；uGUI 是否分 Canvas 依据重建成本实测决定。
- **裁切边界**：ScrollView/Viewport/Content 或血条 FillArea 只包含应裁切的内容；文字、受伤预览等需要保持完整的元素放在裁切容器的同级。
- **定位基准**：场景角落控件锚定场景可停靠范围的对应边缘，底栏沿其底边横向拉伸；有底板弹窗的内部控件锚定底板内容边缘，无底板时锚定屏幕安全边缘。居中弹窗设置最大宽度并在高度不足时滚动正文。

```text
InventorySlot                  # 唯一点击区域、布局项
├── VisualRoot                 # 点击反馈动画
│   ├── Background
│   ├── ItemIcon
│   ├── CountBadge
│   │   ├── BadgeBackground
│   │   └── CountText
│   └── SelectionOutline
└── DisabledOverlay

HealthBar
├── BarTrack
│   └── FillArea
│       └── Fill
├── DamagePreview              # 不随 Fill 裁切
└── ValueText                  # 不随 Fill 宽度压缩
```

## V2 布局合同

父子关系、布局职责和对齐决策由代理内部推导后，直接展示当前编号拆解图及必要布局标注供 V2 确认，不先请求用户确认文字布局方案。确认后的调整仍在既定目标内直接修复、重验并展示对照；正式原生组合在 V3 提交，不另建布局审批。

每个拆解 item、Prefab/Scene 节点与装配实例沿用同一 `layoutBinding`：`parentElementId` 指向实际直接父节点，`hierarchyRelation` 声明父子或同级，`coordinateSpace`、`anchor`、`pivot`、`constraints` 和 `resizePolicy` 描述定位。`constraints` 必须说明上述布局参照及其依赖链，不能把效果图像素坐标当作运行时停靠依据。屏幕 UI 节点还必须声明 `uiLayout`：

| 字段 | 必须回答的问题 |
| --- | --- |
| `groupingBasis` | 为什么存在该父子关系：`POSITION`、`LAYOUT`、`INTERACTION`、`STATE`、`CLIP` 或 `REUSE`？父子关系至少声明一个真实依赖；`SAME_LEVEL` 时填写空数组 `[]`。 |
| `layoutOwner` | 尺寸和位置由父容器、自身还是外部布局决定？ |
| `sizePolicy` | 固定、拉伸、按内容尺寸还是弹性分配？ |
| `overflowPolicy` | 内容必须完整、可裁切装饰、需要重排还是允许滚动？ |
| `safeAreaPolicy` | 可全屏延伸，还是必须留在安全区内？ |
| `interactionPolicy` | 自身是命中目标、把输入交给父节点，还是完全无交互？ |
| `minimumSize` | 可选的最小可读或可点击尺寸；声明后不能靠缩小突破该下限。 |

`semanticGrouping.kind` 仍描述区域、组件或部件的语义层级；`uiLayout.groupingBasis` 说明实际层级依赖，两者不能互相代替。V2 必须核对 item、节点和装配实例的父级、职责与布局绑定一致；变更任一项使受影响的 V2-V4 证据失效。

例如背包格根节点由网格控制尺寸并作为唯一点击目标，可在 V2 写为：

```yaml
layoutBinding:
  parentElementId: inventory-grid
  hierarchyRelation: PARENT_CHILD
  coordinateSpace: CANVAS_LOCAL
  anchor:
    min: {x: 0, y: 0}
    max: {x: 0, y: 0}
  pivot: {x: 0.5, y: 0.5}
  constraints: [inventory-grid-cell]
  resizePolicy: LAYOUT_REBUILD
  uiLayout:
    groupingBasis: [LAYOUT, INTERACTION, REUSE]
    layoutOwner: PARENT
    sizePolicy: FIXED
    overflowPolicy: KEEP_VISIBLE
    safeAreaPolicy: INSIDE_SAFE_AREA
    interactionPolicy: HIT_TARGET
    minimumSize: {width: 96, height: 96}
```

格子内部节点的 `parentElementId` 指向树中实际的直接父节点：图标和选中框属于 `VisualRoot`，数量文字属于 `CountBadge`。这些视觉子节点的 `interactionPolicy` 为 `DELEGATE_TO_PARENT`，点击最终由祖先 `InventorySlot` 处理。需要滚动的背包内容把 `overflowPolicy` 声明在列表容器上，单个格子仍需保持完整可见。

## 九宫格资源与 V3 校准

需要保持面板边角的资源在 V2 先判断九宫格是否适用；适用时冻结源图像素尺寸、Unity `Sprite.border` 四边值（`left, bottom, right, top`）、目标最小尺寸与内容内边距。文字、图标、交互和装饰仍按实际布局职责作为独立节点，不合并进面板图。导入与呈现按[九宫格 UI 合同](nine-slice-ui.md)检查。

V3 在正式 Prefab、Scene 或 UXML/USS 组合上，用现有 Inspector、Rect 工具、UI Builder 与 Undo 校准实际几何。Toolkit 的 `uwt_measure_layout` 读取目标视口下的节点矩形、边距/间距及差值；`uwt_capture_game_view` 只采集 Unity Editor Game View。使用和差异归因规则见[布局校准合同](layout-calibration.md)。几何测量与图像采集不自动改布局、不分析截图，也不代替用户对显示效果的检查确认。

## 代表性检查

下表按已批准方向选取，不要求交叉覆盖：横屏项目仅检查横屏行，竖屏项目仅检查竖屏行；双方向项目分别检查两组并验证方向切换。单方向仍须覆盖该方向内的尺寸、宽高比和安全区变化。

| 视口 | 应检查的布局结果 |
| --- | --- |
| 横屏 `1920×1080` | 参考布局、命中区域和安全区。 |
| 横屏 `2560×1080` | 顶栏左右控件仍贴场景可停靠范围的边缘，中央指示器保持场景居中；背景覆盖新增侧边，场景 UI 不进入装饰边带。 |
| 横屏 `1600×1200` | 边缘关键内容不因固定高度而被裁切；必要时重排或滚动。 |
| 竖屏 `1080×1920` | 参考布局及底部操作栏位置。 |
| 竖屏 `1080×2400` | 底栏跟随场景可停靠范围的底边；新增高度若属于装饰边带，不扩张场景 UI 布局区域。 |
| 竖屏 `900×1920` | 背包列数可减少，格子保持最小尺寸并可滚动；不产生不可见按钮。 |

V4 在 Game View/Screen 和安全区实际值下检查裁切、遮挡、文字换行、命中目标、弹窗打开与关闭、resize 后的重排；分别测量场景区域变化后的 UI 停靠、有底板弹窗改变底板尺寸后的内部布局、无底板弹窗改变屏幕尺寸后的停靠。跨方向旋转后的重排仅在双方向范围内检查。只记录真实 Unity 测量，不以 V2 静态声明代替运行结果。截图显示效果由用户人工检查并确认，未经明确要求不自动分析截图或据此判定视觉通过。
