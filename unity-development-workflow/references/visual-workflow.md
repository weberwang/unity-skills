# Unity 视觉工作流

视觉生产嵌入场景 V0-V4，不使用独立 A0-A4 流程。A0-A6 只表示动作风险等级，F0-F4 只表示全局质量门。

V0 仅作内部识别与分流，不请求常规确认。V1 真实目标图、V2 拆解图和布局图、V3 正式资源、V4 实际组合与运行交付按[阶段人工确认](../../unity-game-workflow-control/references/stage-confirmation.md)逐项确认；V2 的两张图分别确认，V4 确认后闭合。

普通图片按[图片优先的确认方式](../../unity-game-workflow-control/references/simplified-workflow.md#图片优先的确认方式)直接制作真实候选；动画素材例外，须先说明设计理念和动作方案、取得用户确认后再制作，完成后仍验收真实素材。分析、技术合同、布局决策和提示词由代理内部维护；已确认目标内的修订直接给修改前后对照，决定性需求歧义才暂停受影响内容。V2 拆解图和布局图分别确认；V3 只验收正式资源与导入，可提供临时组合预览；正式组合和布局校准在 V4。

## 全局视觉基线

首次建立全局视觉基线时，恰好生成三张 `generated` 候选，且使用相同提示条件、目标内容和示例数值。每张候选都记录五项美术质量结果：主题贴合、受众适配、玩法可读、观看舒适、美术完成度；选择必须是用户对已展示候选作出的唯一人工选择，且所选候选五项均为 `PASS`。每张候选的 root generation 记录中，`workItemId` 必须与根证据的 `producerWorkItemId` 匹配。将选择证据写入 `Work.globalVisualBaselineSelectionRef`，对象形如 `{path: "..."}`，路径和内容遵循[视觉基线合同](../../unity-game-workflow-control/scripts/runtime/visual-baseline-contract.mjs)。有效选择证据可被其他 Work 复用，不要求重复生成或重新选择。

全局三候选规则用于建立或替换全局基线，不代替场景 V1 的真实目标图，也不要求每个 Work 都重新生成三张。纯工程 `FOUNDATION` 没有视觉依赖时无需等待选图；只有实施包声明 `visualBaselineRequired=true` 时才要求引用有效的全局选择。

## 场景视觉目标与 Visual Bible

新建且包含可见画面的 `SCENE` 或 `DISPLAY_LAYER` Work Item 必须生成自身的完整 V1 目标图，即使已有有效品牌/视觉规范；按已确认基线制作单个真实目标方案并等待用户确认。只有建立或替换全局基线时采用三张同条件候选的规则。已有有效基线直接复用，不重复选图。

Visual Bible 记录色彩、材质、光照、镜头、字体、图标、动效、可读性、技术预算、允许复用和禁用项，并记录来源版本与位置。验收按实际画面和已确认要求判断，目标内的实现调整无需回改合同；这不授权改变视觉目标，方向真正变化时按既有确认规则处理受影响部分。

V1 为视觉 Work Item 补充主题、目标受众、核心循环、体验目标和主要观看情境，并与玩法角色及 [`unity-game-juice`](../../unity-game-juice/SKILL.md) 确认关键事件的反馈意图。五项美术质量判断和 V4 证据按[美术质量合同](art-quality-contract.md)逐项记录；方向候选数量仍遵循现有规则。

## V1 场景定义

生成全局方向候选、场景完整效果图或显示层宿主上下文图前，按[游戏内文案](game-copy.md#效果图生成)把内部规格与玩家可见表达分开，实际提示词列明允许出现的短标签、图标、数值格式与示例值，禁止自动把功能说明和设计理由绘制到画面。多个候选共用同一内容与示例数值，只变化本次探索的视觉方案；真实生成记录保留完整实际提示词。显示是否正确仍由用户看图确认。

冻结场景或显示层的功能契约、目标视口、相机、状态、输入轨迹和实际可查看的草图/灰盒。新建且包含可见画面的 Work Item 先生成完整 V1 效果图；已确认的 V1 图是 V2 拆解与布局、V3 资源验收、V4 正式接入的持续视觉目标。草图/灰盒用于验证结构与交互，不能替代效果图。同时给出稳定节点 ID、`parentElementId`、语义分组、渲染顺序、Anchor、Pivot、安全区、遮罩、资源槽，以及适用的 UXML/USS/UIDocument、Canvas/RectTransform 或 GameObject/Component 结构。屏幕 UI 按[布局与节点树规则](ui-layout-and-hierarchy.md)区分全屏背景、安全区内容、常驻 HUD 和独立显示层；父子须有实际布局或行为依赖。

独立生产资源是按目标重建部件，不是重新设计；同风格不能代替同目标，后续生成素材、拆解图或阶段确认不得静默替换 V1 基准。禁止裁切、抠取参考图作为正式资产只限制资源取得方式，仍须保留目标的构图、主要轮廓、配色、材质、光影与视觉层级。用户实质改变目标时沿用既有受影响范围确认，保留原目标及真实确认记录，不新增阶段或重复确认。

如果场景基于参考图还原，明确 `usability` 或 `exact`。默认 `usability` 检查边界、裁切、遮挡、可读性、状态和交互，同时保留上述显著视觉特征；未要求逐像素还原不意味着允许改变这些特征。仅用户明确要求精确还原时使用像素容差和完整矩阵，不新增通用像素相似度阈值。

回对功能/场景阶段的[共享资源规划](shared-asset-usage.md)：核实共同消费位置、状态、尺寸、视觉要求和差异；未定项保持候选，明确同一部件才交给 V2 统一生产规划，不因共享功能强行统一不同场景美术。

## V2 拆解与布局确认

先按[文本与色彩拆分路线](visual-decomposition-routes.md)从 V1 的显著文字造型、底板、填充、边框、图标、光影、装饰和空间结构反查覆盖，不能只列功能名称。每项对应稳定编号、生产归属、消费节点及状态；原子资源内部包含的特征也须明确归属，系统文本和原生绘制同样进入编号清单及标注。路线判断及合并边界依该文执行，拆开来源仍保持原功能组件的交互、状态、本地化和布局联动。屏幕 UI 的机器布局包以 `decompositionElementId = splitPlan.items[].id` 对应拆解身份，并以节点 `id` 对应该 item 的 `targetPrefabNodeIds`；Prefab/Scene 结构、正式装配和 V4 实测沿用同一节点 ID、父级、`semanticGrouping` 与完整 `layoutBinding`。当前 `stateId` 和 `displayLayerId` 范围内的节点逐项对账，纯结构容器、原生文本与填充都要进入拆解映射。

再按[公共资源登记与使用](shared-asset-usage.md#v2-查库与绑定)查询已登记字体、贴图、材质、图标和组件。合格复用保留本场景拆解编号并绑定公共资源身份及消费节点；无合格资源才安排独立生产，多个确定消费者共用同一来源和唯一所有者。

### 图片框选与标注交付

向用户展示的 V2 拆解说明只输出可直接查看的图片：在冻结的 V1 完整效果图上逐项框选，以稳定编号对应 `componentId`，用引线连接图内中文标注。标注说明元素用途、资源来源、父子/同组关系、装配方式和生产边界；无需生产的项也须明确标出。框选只表示目标图中的位置，不作为推断父子关系或裁切正式资源的依据。

拆解交付先展示编号框选图及图内说明，用户确认后再生成布局图。布局图应明确参照区域、节点层级、定位与约束、适配行为和关键视口，随后单独提交第二次 V2 确认。两项均通过后才能开始 V3。图例、工作项、阶段、版本、验证结果和待确认范围可写在图内；不得仅交付路径或链接。标注不得遮挡关键画面或相互重叠；内容过密时使用总览图加局部放大图，沿用同一套编号。不同状态或独立显示层分别标注，覆盖拆解项后再提交确认。

### 内部拆解合同

结构化合同用于规划生产目标与边界，内部保存且与标注图使用相同编号，不作为用户侧文本拆解输出。目标内的实际生产调整在交付或验收记录说明，无需回改合同或校验内容摘要；规格与 V1 矛盾属于缺陷，不能据此改变目标。只分析冻结的场景或显示层目标图与结构。对可见元素建立稳定 `componentId` 和状态矩阵，选择 Unity 视觉来源 `IMAGE_ASSET`、`UNITY_NATIVE`、`REUSE`、`MODEL_3D`、`MATERIAL` 或 `VFX`，并记录 `semanticGrouping`、`visualRouteAnalysis`、`assemblyAnalysis` 与 `layoutBinding`：

每个布局计划分别用 `splitPlanRef`、`prefabStructureRef`、`prefabAssemblyRef` 的 `{path}` 指向目标工程的真实工件；路径不替代确认事实，也不得为填字段而新造人工审批。已有 `APPROVED` 拆解及 `USER`/`ASSET_MAP` 确认沿用原记录；Prefab 结构按同一 V2 事实核对，不增加确认门；装配引用从 V4 起纳入检查。`hierarchyRelation` 仅使用 `PARENT_CHILD`，同级节点共享同一实际父节点 ID；`semanticGrouping` 只记录语义归属，整体组合关系使用 `centerAlignment.memberIds`，不因此创建层级。根几何 `viewport`/`safe-area` 是既有逻辑根参照，不假定存在同名 GameObject；除此之外的业务 `parentElementId` 必须是真实直接父节点 ID。

文本节点只登记冻结目标实际存在的玩家可见文字、数值及其来源，不从 GDD 追加说明。图内拆解标注属于审阅辅助层，不能成为正式界面的说明面板；原子资源继续忠实还原所属区域，不能借文案精简删改冻结文字，也不能把动态数值或本地化文本烘焙进固定图片。

屏幕 UI 的 `layoutBinding.uiLayout` 必须说明分组依据、布局控制者、尺寸、溢出、安全区和命中策略。先按[节点树规则](ui-layout-and-hierarchy.md)判断组件根与子节点；底板可兼任根，功能父级与位置参照分别记录。场景 UI 相对场景内容区域大小停靠，弹窗内部默认有底板时相对底板、无底板时相对屏幕。机器引用使用 `positionReferenceId`，`constraints` 与 `resizePolicy` 补充边界理由和重算策略。拆解确认后按[机器布局包](ui-layout-plan.md)派生并检查严格/组合居中、参照依赖和显式越界，布局图消费同一派生结果；不得用效果图距离或元素类型代替依赖证据。

- 目标节点、路径、bounds、逻辑尺寸、Pivot、PPU、Border、透明、色彩空间和状态；
- TextureImporter/SpriteAtlas/Addressables/字体/材质/模型导入约定；
- 资源来源、许可、Unity GUID、复用理由和替换策略；
- 静态特色外观的独立生产结论，以及[文字路线](visual-decomposition-routes.md#文字路线判定)和[填充路线](visual-decomposition-routes.md#色彩填充路线判定)的显著性、变化/复用需求与替代依据；`UNITY_NATIVE` 只能由文本、动态数据、布局、基础几何、进度、粒子或 Shader 的资格证据支持，并完整实现方案要求保留的外观与状态；`REUSE` 的精确 GUID、源路径、实际 Importer 设置和消费节点；
- 基础几何资格只用于 UI/布局、技术占位、碰撞和非模型资产的原生渲染用途，不允许把正式可见 3D 模型从 `MODEL_3D` 改为 Unity 创建；建模、贴图、绑定和动作按[3D 生产流程](3d-asset-workflow.md)分配，不能按图片或原生体块路径替代；
- Scene/Prefab/UXML/UIDocument/Canvas/Transform 的结构化装配；单区域不得使用 `COMPOSITE` 或整屏截图，`fullScreenCapture` 必须为 `false`；
- 图片框选与图内中文标注的 annotated preview、内部完整覆盖记录和生产/验证责任。

存在实质视觉取舍、来源授权或外部生成成本时另行请求精确 `USER_DECISION`；无此类取舍也必须取得 V2 阶段人工确认。未确认生产边界前，不导入正式资源或写入正式 Scene/Prefab/UI。禁止裁切、抠取、放大或轻微修饰参考图/高保真图充当 Sprite/纹理，禁止整图铺底冒充结构化实现。

对需九宫格的 UI 资源，在 V2 标注是否适用；适用时记录源图像素尺寸、Unity `Sprite.border` 四边值（left、bottom、right、top）、最小目标尺寸和内容内边距。动画的动作意图、独立时间轴、关键事件、循环/中断、消费者与资产生产者在内部记录，并随真实拆解交付说明；按[动画意图合同](animation-intent-contract.md)选择序列帧、Unity 原生骨骼、Spine 或 3D 路线，不要求动画灰盒，也不追加文字时间轴确认门。

## V3 正式资源生产与导入验收

3D 资源生产遵循[3D 流程](3d-asset-workflow.md)，不转成图片任务。V3 可创建和验证资产自身的资源级 Prefab；本节禁止的正式 Prefab 接入指宿主场景的装配、交互接线与布局校准，不包含角色资源内部必需的 Renderer/材质/LOD/Avatar/Animator 结构。场景级装配仍在 V4，详见[资源与场景边界](asset-pipeline.md#前置)。

按拆解计划逐项独立生产或复用，图片子代理交接与生成后合格检查按[视觉资产生产规则](../../unity-game-visual-assets/SKILL.md#生产规则)执行，始终携带原始 V1 与所属区域的保留要求。位图、模型、材质、字体、音频和 VFX 使用其真实 Importer 与平台设置；Unity 管理资源与 `.meta` 同步进入所有权和证据。UI/2D 位图生产默认 `sourceScale=1`，平台预算或像素美术合同另有明确批准值时才改变；运行时不使用固定 Web DPR，而读取 Unity 平台、Canvas/PanelSettings、Camera 和动态分辨率事实。SpriteAtlas、压缩、MipMap 和 Addressables 由 Unity 预算决定。

原生文本与填充同样按 V2 编号实现、绑定消费节点并参与组合验收；核对字体/字形覆盖、所需材质效果、表面复用、共同裁切边界及状态同步。不能把原生项从生产覆盖记录中遗漏，也不能在接入时静默用默认字体、纯色矩形或固定进度替代已确认外观与可变行为。

公共资源在本阶段交接时按[登记同步](shared-asset-usage.md#v3-登记同步)由指定单写者合并独立事实到 `docs/asset-register.yaml`，核对许可、实际 GUID/Importer 与场景装配绑定后交给后续消费者；生产者不能并发覆盖总表，也不能把导入技术通过当作可复用或人工视觉通过。

生成式透明位图可采用“生成不透明单一纯色背景 PNG → `unity-game-visual-assets/scripts/remove-background-local.mjs` → 尺寸归一化 → Unity 导入”。必须显式指定背景色和容差，推荐启用 `--require-solid-background`，保留原图、输出图、背景色、容差、删除像素和深浅底预览；只有去背景记录为 `PASS` 的输出才可成为图片任务候选。工具自行生成的 SHA 不参与验收。该路线不适用于参考图裁切/抠取，也不能处理复杂背景、毛发、玻璃、发光或半透明边缘。

完成正式资源生产、导入与资源级验证，核对来源、许可、GUID、Importer 和资源本身的质量。可生产并验证资产自身的资源级 Prefab，用临时预览检查资源关系，但不得在 V3 完成正式宿主 Scene/场景装配 Prefab/UI 接入或布局校准；资源级验证与临时预览不代表场景实现完成。

静态资源直接提供图片画廊或可放大的 V1 相关区域/输出对照。V3 可展示临时资源预览；V4 提供原始 V1 与正式 Unity 组合的并列对照，注明状态、视口及适配差异，必要时补充同编号局部对照，不能只展示最新生成图或返修前后图。文字列出已知未还原项、失败、缺失和仍需处理的差异，完整清单和技术检查内部保留。透明候选并排提供深底、浅底及独立输出；源素材检查与运行截图人工验收分开记录，不以工程通过或预览生成成功推定视觉通过。组合与 V4 运行时沿用同一玩家可见表达、本地化键和真实数据来源，详见[文案接入规则](game-copy.md#资源拆解与界面实现)。

九宫格资源须回读 Unity 实际 Importer/Sprite Border，资源级检查与导入记录在 V3 完成。正式 UI 组合与布局按[布局校准合同](layout-calibration.md)在 V4 用现有 Inspector、UI Builder 与 Undo 校准；需要时使用 Toolkit 测量几何并采集 Editor Game View。截图交由用户检查，不自动分析。详细边界见[九宫格 UI 合同](nine-slice-ui.md)。

## V4 正式实现与运行验收

单写者完成正式 Scene/Prefab/UI/玩法接入，删除灰盒、占位 Mesh/Sprite/Material、临时对象和残留引用。随后在编译、导入和域重载稳定后运行 EditMode/PlayMode、Game View 多分辨率、交互轨迹、性能和资源消费验证；真实记录 Screen/GameView/backbuffer 或 RenderTexture、Camera pixelRect/orthographicSize/projection、CanvasScaler 或 PanelSettings、Screen.safeArea、方向/resize、EventSystem/InputSystem 命中、截图和状态轨迹。截图交由用户检查显示效果；除非用户明确要求自动视觉验证，代理不分析截图或判定视觉通过。

modal、popup、drawer、toast 等显示层在自己的 `DISPLAY_LAYER` Work Item 中验证打开、交互、关闭，以及焦点、输入、时间缩放和底层状态恢复；`hostSceneId` 只作上下文，显示层不阻断场景 V4。研发期不自动启动 Standalone/Player 或真机；设备证据仅在独立发布 Work Item 获明确授权后产生。

正式候选的主题贴合、受众适配、玩法可读、观看舒适和美术完成度须逐项 `PASS`。V4 按适用性覆盖 `normal-play`、`repeated-feedback`、`event-peak`、`overlap-peak`；不适用项必须记录理由，缺少运行证据的适用项为 `NOT_RUN`。美术和动态体验材料绑定当前 Work Item、候选和场景，由控制面 `artExperienceAcceptanceRef` 引用；真实片段或截图由用户人工检查确认。机器侧参数和工程检查不代替视觉验收，具体标准见[美术质量合同](art-quality-contract.md)。

### 文本与响应式合同

程序化文本必须覆盖 `en`、`zh-CN`、`ja`、`ru`、`es`；逐语言声明 single-line 或 wrap，禁止截断。uGUI/TMP 的源字体、String Tables、静态图集、绑定器及可选动态回退按[字体图集流程](tmp-font-atlas-workflow.md)接入。实测必须覆盖 TMP/UI Toolkit 字体回退、字形、基线、容器边界和命中区域，合同与证据通过 `responsiveContractRef` 和 `contractVersions` 绑定。

## 失效规则

- 全局基线变化：只失效依赖该视觉事实的 V1-V4。
- V1 功能或结构变化：失效受影响的 V2-V4。
- V2 拆解、规格、节点或来源变化：失效受影响资源与 V3/V4。
- 资源内容、GUID、Importer、地址或材质槽变化：重验该资源及消费它的 V3/V4。

候选未变而证据过期使用 `revalidate`；字段或绑定错误使用 `repair`；只有上游事实或范围真实变化才 `return`。
