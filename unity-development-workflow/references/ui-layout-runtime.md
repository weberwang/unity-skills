# 布局控制权与真实组件快照

V2 制定执行策略、V3 导入核对、V4 正式组合校准时读取。复用 `uwt_measure_layout` 采集实际几何和组件配置；不另建运行账本，不用计划、静态参数、截图或自报 PASS 代替实际读取。

## 每个属性只有一个写入者

在 `layoutBinding.uiLayout` 明确 `positionDriver` 与 `sizeDrivers.width/height`。位置、宽度、高度可由不同机制管理；同一时段同一属性只能有一个有效写入者。`layoutOwner` 仍表示责任归属，不能证明某原生组件存在。

| 机制 | 实际核验 |
| --- | --- |
| RECT_TRANSFORM | uGUI 的固定锚点、偏移和尺寸配置；不是持续执行 SetNativeSize 的组件。 |
| LAYOUT_GROUP | 活动父 LayoutGroup 负责子项位置；宽高按实际 childControl 与 Grid 规则判断。ignoreLayout 子项不计入父布局写入。 |
| CONTENT_SIZE_FITTER | 仅在相应轴 Fit 非 Unconstrained 时控制自身尺寸。 |
| ASPECT_RATIO_FITTER | WidthControlsHeight 仅写高度，HeightControlsWidth 仅写宽度；FitInParent/EnvelopeParent 同时写位置与双轴尺寸，None 不写。 |
| UITOOLKIT_LAYOUT | UI Toolkit 相对流位置和原生计算宽高，覆盖 USS/inline 固定尺寸、Auto、内容与 Flex；样式作为约束输入。 |
| UITOOLKIT_STYLE | UI Toolkit 的绝对定位。不能仅凭 inline style 推断 USS 尺寸来源。 |
| SCRIPT / ANIMATION | 实际安装并登记的脚本或动画组件，在活动时拥有声明属性。 |

例如父布局控制宽度、ContentSizeFitter 控制高度可以合法分工；两者同时写宽度则失败。布局和动画按明确状态交接控制权，不采用每帧互相覆盖后恰好看起来正确的做法。视口、安全区、文字和成员变化进入同一幂等布局入口，先计算内容尺寸，再按已声明位置机制定位；无需每帧重排。

## 原图与显示尺寸

SPRITE 节点通过 `uiLayout.imageSizing` 明确尺寸意图：

- `NATIVE`：uGUI Image 使用正式 Sprite 的原生尺寸。采集 Sprite.rect、Sprite PPU、Canvas reference PPU、Image.pixelsPerUnit 和实际 RectTransform 本地尺寸。原生宽高按 `sprite.rect / image.pixelsPerUnit` 核对；`pixelsPerUnitMultiplier` 不进入这个 SetNativeSize 换算。屏幕 bounds、节点缩放与本地内容尺寸分开，不以屏幕像素反写 Sprite 尺寸。
- `EXPLICIT`：明确的设计尺寸/缩放，填写具体 `reason`，防止无意拉伸被包装为适配。
- `SLICED`：沿既有 `nineSlice` 冻结源尺寸与四边 Border；uGUI 读取实际 Sliced/Image Border，UI Toolkit 读取实际切片样式。切片最小中心与消费者验证仍使用[九宫格合同](nine-slice-ui.md)。

UI Toolkit 背景图和 VisualElement 的布局尺寸独立，不拥有 uGUI Image/SetNativeSize 语义，不能直接套用 Cocos RAW 或源像素等于逻辑点的规则。纯结构和文字节点不伪造图片尺寸计划。

## 同批采集

从 V2 布局包为当前目标视口与状态准备 `layout-measurement` Job，设置：

- `includeComponentSnapshots: true`、当前 `stateId` 和实际 Work Item 的 `evidenceRoot`；`outputPath` 必须位于该根内，使用新版本文件名。
- 每个目标记录稳定 `id` 与实际父路径，另写 `referenceId`；实际参照使用 `referenceObjectPath`、`referenceElementName` 或 `referenceRoot` 三者之一。逻辑根使用小写 `viewport`/`safe-area`；默认实际参照为父节点，但稳定参照 ID 仍须明确。
- 同批业务节点全部覆盖，包含当前状态下不活动的节点。计划 `expectedActive` 省略时为 true，隐藏节点显式为 false。

Toolkit 只读加载场景，从实际 Screen/Canvas/Panel 取得同批 viewport、安全区、节点、父框和参照框，生成 `measurementSource`、`runId`、`generatedAtUtc`、`frameCount`、状态与实际组件快照。安全区换算只应用一次。不能混 Canvas、Panel 或坐标单位，不把缺少安全区快照当作全屏。

非活动节点保留组件实际配置，`positionWriters/widthWriters/heightWriters` 为空；无可用几何时记录空矩形和 `INACTIVE`，不伪造正尺寸或零边距。父节点不活动时后代不能自称活动。

## 外部写入登记的边界

uGUI 目标或 UIDocument 上的 `LayoutWriterRegistration` 只登记取证事实，不执行布局。每项绑定真实 `Behaviour writer`、SCRIPT/ANIMATION、负责的属性；UI Toolkit 还用 `elementName` 绑定具体元素。采集器核对真实组件身份与 `isActiveAndEnabled`，禁用组件不计作有效写入者。

该机制覆盖原生组件和已登记写入者，不能证明任意未登记脚本没有写布局。实现负责人仍须审查脚本、动画曲线与生命周期入口，补齐登记；不能把组件类型扫描当作完整行为证明。重复登记或多个实际机制争写属性必须暴露为冲突。

UI Toolkit 的外部尺寸交接按实际 Flex 控制轴和明确 inline 固定尺寸判断；`resolvedStyle` 不提供 USS 规则来源，本检查器不解析整套 USS。依赖复杂 USS 与脚本共同约束的尺寸仍需审查实际交接，不能用宽高快照证明所有样式来源都已排除。

## 校验与控制面

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs layout-runtime-check --project-root . --plan docs/layout-plan.json --source .workflow-control/evidence/current/layout-run-1.json
```

文件工具和控制面调用同一校验器：核对当前 scene/state/candidate、同批根、完整节点覆盖、实际父/参照绑定、属性控制权、原生尺寸，以及实际严格/偏移/图文联合中心。几何直接读取正式对象，不能仅靠 anchor/flag 或计划中的零偏移自证居中。报告或节点为 FAIL 时阻断交付。声明 targetRect/tolerance 的节点必须以派生 targetBounds 为目标，从实际矩形重新计算 delta 并检查 maxAbsDelta；未声明像素容差的节点仍按当前结构、边界、中心与尺寸意图检查，不把默认 usability 升级为整屏 exact。

屏幕 UI 从 V2 起在 Implementation Package 绑定 `uiLayoutPlanRef: {path}`；V4 在 Evidence Manifest 绑定 `uiLayoutMeasurementRef: {path}`，报告须位于当前 evidenceRoot，且 outputPath、候选、场景与状态相符。独立 DISPLAY_LAYER 的计划同时绑定自己的 displayLayerId 和 hostSceneId 对应的 sceneId。`check/status/run` 和直接完成迁移都重新读取证据；缺失或失败时修复并重验，不自动 return V2、不改历史确认、不要求 SHA。

本合同的测试夹具只验证工具，不能用作正式场景运行证据。截图仍由用户人工检查；工程与几何通过不代表显示效果已验收。
