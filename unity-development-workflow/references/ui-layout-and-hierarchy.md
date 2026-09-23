# 屏幕 UI 布局与节点树

## 适用范围

在 V1 定义屏幕 UI 结构、V2 冻结拆解与装配合同、V3 组合预验收、V4 多视口验证时使用。适用于 uGUI 的 Canvas/RectTransform 和 UI Toolkit 的 UIDocument/UXML；World Space Canvas 按世界尺寸、相机距离和像素密度另行设计。

## 布局基准与分层

- 横屏设计基准 `1920×1080`，CanvasScaler/PanelSettings 使用随屏幕尺寸缩放、Match Width Or Height、`Match = 1`；竖屏 `1080×1920`，`Match = 0`。设计基准不是实际输出分辨率。
- 全屏背景可延伸到安全区之外并裁切边缘；关键文字、按钮、玩法信息以实时 `Screen.safeArea` 为边界。弹窗遮罩可覆盖全屏，弹窗内容必须留在安全区内。
- 基础模块的 `SafeAreaRectTransform` 只挂在全屏 Canvas 的直接子节点 `SafeAreaRoot`；UI Toolkit 使用 `SafeAreaVisualElement` 作用于全屏 `UIDocument` 根节点的同名直接子节点。两者共享实时安全区换算；不得给背景或遮罩挂安全区组件，也不得在已经收缩的父节点内重复应用。
- 常驻 HUD、当前页面和 modal/popup/drawer/toast 使用独立根节点；瞬态层属于独立 `DISPLAY_LAYER` Work Item，不能混入宿主 HUD 的所有权。
- 背景填满可见区域；保持图片比例时按源图比例覆盖并接受装饰边缘裁切。窄屏空间不足时重排或滚动内容，不通过缩小关键控件或固定相机视口掩盖问题。

```text
UIRoot
├── BackgroundRoot                 # 全屏、无交互
├── SafeAreaRoot                   # 关键内容
│   ├── HUDRoot
│   │   ├── TopBar
│   │   ├── CenterIndicators
│   │   └── BottomActions
│   └── PageRoot
└── DisplayLayerRoot               # 独立显示层的宿主槽位
    ├── FullscreenDimmer
    └── SafeAreaContent
```

## 细组件分组

一个父节点必须拥有可解释的职责：共同定位、布局控制、交互命中、状态或生命周期、裁切边界、组件复用。只有共同主题、外观相近或图上距离近，不构成父子关系；没有依赖的元素保持同组同级。容器本身无布局或行为职责时删除空层。

- **交互单位**：一次点击作用于整个按钮或背包格，就用一个组件根节点；视觉子节点交由根节点接收输入，避免多个重叠命中目标。
- **布局控制**：TopBar、网格、列表等容器管理子项尺寸或间距。受 Layout Group/Flex 控制的属性不再手动写死；动画放入内部 VisualRoot，避免与父布局控制相争。
- **状态与复用**：同时显示/隐藏、播放状态动画或重复实例化的内容形成独立组件根。仅更新频率不同不足以建立业务父子关系；uGUI 是否分 Canvas 依据重建成本实测决定。
- **裁切边界**：ScrollView/Viewport/Content 或血条 FillArea 只包含应裁切的内容；文字、受伤预览等需要保持完整的元素放在裁切容器的同级。
- **定位基准**：角落控件锚定对应安全边缘；底栏沿安全区底边横向拉伸；居中弹窗设置最大宽度并在高度不足时滚动正文。

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

每个拆解 item、Prefab/Scene 节点与装配实例沿用同一 `layoutBinding`：`parentElementId` 指向实际布局参照节点，`hierarchyRelation` 声明父子或同级，`coordinateSpace`、`anchor`、`pivot`、`constraints` 和 `resizePolicy` 描述定位。屏幕 UI 节点还必须声明 `uiLayout`：

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

## 代表性检查

| 视口 | 应检查的布局结果 |
| --- | --- |
| 横屏 `1920×1080` | 参考布局、命中区域和安全区。 |
| 横屏 `2560×1080` | 顶栏左右控件仍贴各自安全边缘，中央指示器保持居中，背景覆盖新增侧边。 |
| 横屏 `1600×1200` | 边缘关键内容不因固定高度而被裁切；必要时重排或滚动。 |
| 竖屏 `1080×1920` | 参考布局及底部操作栏位置。 |
| 竖屏 `1080×2400` | 新增高度分配给内容区，底栏跟随安全区底边。 |
| 竖屏 `900×1920` | 背包列数可减少，格子保持最小尺寸并可滚动；不产生不可见按钮。 |

V4 在 Game View/Screen 和安全区实际值下检查裁切、遮挡、文字换行、命中目标、弹窗打开与关闭、resize/旋转后的重排。只记录真实 Unity 测量，不以 V2 静态声明代替运行结果。
