# 视觉工作流

## 何时读取

定义全局视觉方向，使用截图参考，生成或编辑游戏/UI 候选，处理透明素材，或进行效果图与实机审批时读取。

## 输入

- 用户视觉目标、平台限制、内容边界与已有品牌资产。
- Codex ImageGen 可用能力、候选图片、场景 manifest 和 UI 信息架构。
- 已批准版本、审查意见与实机截图；截图必须标注来源、哈希和允许参考的维度。

## 执行步骤

1. 先写全局视觉设计简报，明确受众、情绪、设计支柱、内容边界、目标设备、渲染预算和可读性要求。此时只能生成全局方向候选，不能开始场景效果图或正式资源。
2. 以 `image-generation` 的 `GLOBAL_DIRECTION` 模式生成多张相互独立的全局方向图，再制作仅用于比较的联系表。已有截图只能提供内容、构图和信息层级，不得提供色彩、材质、光照、字体、图标、笔触或成品像素。
3. 把选定方向固化为版本化 Visual Bible：记录设计支柱、世界与资源语言、色彩、材质、光照、构图、镜头、字体、图标、UI 密度、动效、可读性规则、禁用项和截图参考政策。
4. 由视觉一致性、游戏可实现性、UX/可读性三个审查代理分别评估 Visual Bible；主代理合并为无冲突、可执行且标明优先级的修改清单，按清单生成新修订并重新审查。
5. 三类审查通过后，先用 `$unity-game-grilling` 对当前 Visual Bible 候选逐项确认方向取舍并生成绑定记录，再请求用户确认全局视觉。只有当前 Visual Bible 的最终审查、拷问记录与用户批准均有效，才可把状态设为 `APPROVED`；后续风格变更必须创建新版本并使受影响场景回到待复核。
6. 每个场景按 P0-P5 严格串行推进，任何阶段不得越级，也不得以口头确认替代绑定版本与 SHA-256 的状态证据：
   - **P0 结构确认**：以低模 Prefab 层级图、灰盒构图和文字说明表达对象职责、父子关系、镜头、游戏空间、UI 区域及交互边界；请求用户确认前先用 `$unity-game-grilling` 冻结当前结构取舍，状态只允许 `STRUCTURE_DRAFT -> STRUCTURE_AWAITING_USER -> STRUCTURE_APPROVED`。用户确认前不得生成高保真图。
   - **P1 高保真候选确认**：游戏内画面与 UI 可分别出图，但必须共享同一场景结构版本和 Visual Bible；请求用户选择候选前先用 `$unity-game-grilling` 固化取舍，状态只允许 `HIGH_FIDELITY_DRAFT -> HIGH_FIDELITY_AWAITING_USER -> HIGH_FIDELITY_CONFIRMED`。该确认只表示候选方向可送审，不等于最终视觉批准。
   - **P2 独立审查**：视觉一致性、Unity 可实现性、UX/可读性三个代理针对 P1 的精确候选独立审查，状态为 `INDEPENDENT_REVIEWING -> REVIEW_APPROVED | CHANGES_REQUIRED`。出现 `CHANGES_REQUIRED` 必须生成新的 P1 修订、重新请求用户确认并重做全部三类审查。
   - **P3 完整资产地图确认**：只能在 P2 通过的原图上框选并编号，状态为 `ASSET_MAP_DRAFT -> ASSET_MAP_AWAITING_USER -> ASSET_MAP_APPROVED`。拆分前由 `$unity-game-grilling` 逐项拷问用途、独立生成必要性、复用边界、轮廓、遮挡补全、尺寸、透明、枢轴/锚点、PPU、九宫格、动画帧、交付形式、性能代价和目标槽位；地图必须覆盖每个可见生产元素及明确排除项，每项只能绑定一个生产通道。绑定当前地图的拷问记录和用户确认未完成前不得开始正式资源生成。
   - **P4 逐项生产与验证**：每项独立经历 `PLANNED -> GENERATING -> REVIEWING -> APPROVED -> IMPORTED -> VALIDATED`；聚合状态只有在完整地图的全部生产项均为当前版本 `VALIDATED` 时才可写为 `ALL_ITEMS_VALIDATED`。
   - **P5 结构化装配与清理**：状态只允许 `ASSEMBLY_BLOCKED -> ASSEMBLY_READY -> ASSEMBLY_RUNNING -> ASSEMBLY_VERIFIED`；仅 `ALL_ITEMS_VALIDATED` 可解除阻塞。装配必须按已批准 P0 层级和 P3 槽位构建 Prefab/Scene，不得用整张效果图、联系表或未登记对象替代结构化实现。正式拼装完成后，在 `ASSEMBLY_RUNNING` 内删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象，清理所有残留引用；保留已确认结构节点、稳定 ID 以及 `prefab-structure`、预览、批准记录等审计证据。清理验证不是 `PASS` 时不得进入 `ASSEMBLY_VERIFIED`。
7. P3 的资产分类覆盖 2D、3D 与混合场景。`SPRITE`、`UI_BITMAP`、`NINE_SLICE`、`BACKGROUND`、`ANIMATION_FRAME`、`DECAL`、`BILLBOARD` 和位图 VFX 进入独立图片任务；`MODEL_GEOMETRY` 进入建模；`PBR_TEXTURE_SET`、`MATERIAL` 进入贴图材质；`LIGHT`、`CAMERA`、`POST_PROCESS`、`SHADER`、`UI_TOOLKIT` 和 `CODE` 进入实现任务。混合场景只维护一张完整地图，任何项目不得重复路由或遗漏。
8. 使用截图时逐张声明用途：只可选择 `CONTENT`、`COMPOSITION`、`INFORMATION_HIERARCHY`。高保真图和 P4 图片的提示词必须明确“依据 Visual Bible 重新设计，不复制截图风格、不裁切截图或效果图成品像素”；框选区域是规格与槽位证据，不是裁切许可。
9. 使用 Codex ImageGen 生成或编辑位图；每个 P4 图片项生成一张独立、边界完整、可导入的资源图，并保留提示词、参考证据、全局视觉版本、场景视觉版本、资产地图条目、模型、输出版本与用途。生成候选与任何截图参考或效果图裁切结果的 SHA-256 相同即视为直接复用并阻塞。
10. 简单纯色背景可做透明色键处理；复杂边缘、半透明、毛发或混合背景必须阻塞并请求合适源素材，不得伪造透明结果。UI 效果图只定义视觉目标，交互 UI 必须用 UI Toolkit 实现。
11. P5 的清理验证 `PASS` 并进入 `ASSEMBLY_VERIFIED` 后，读取 `mcpforunity://scene/cameras` 核对固定机位，只在 Unity Editor/Game View 的批准参考分辨率与状态下生成 Editor 视觉证据；按三个独立代理审查、修改、重新捕获，对最终实现候选调用 `$unity-game-grilling` 后请求用户批准。研发阶段禁止安装或启动 Standalone/Player、真机或等价设备；G2 `PASS` 后才由 G3 生成候选包、捕获 `runtime-visual-evidence` 并执行设备视觉审查。
12. 所有门禁证据必须绑定 Visual Bible 版本、场景结构版本、效果图版本、资产地图版本、资源版本和 SHA-256。P0 变化使 P1-P5 失效；P1 变化使 P2-P5 失效；P2 要求修改时退回 P1；P3 变化使受影响 P4 项及 P5 失效；任一 P4 项内容、规格、导入 GUID/地址或槽位绑定变化都会清除 `ALL_ITEMS_VALIDATED` 并使 P5 失效；Visual Bible 变化使所有受影响场景从 P1 重新开始。旧批准只能保留为历史，不能继承到新版本；上游回退所需灰盒必须从审计证据重建，禁止在运行时保留低保真 Prefab/Scene 或占位资源。

## 子代理角色与并行边界

- 全局方向候选可并行；全局视觉批准前，场景 P0 之后的视觉和资源任务不得启动。每个候选必须是独立图片，联系表不能作为生产源图。
- 三个 P2 审查代理独立输出，不能互相覆盖结论；主代理只合并修改清单，开发代理不得批准自己的候选。
- 同一批准 Visual Bible 下，不同场景的只读规格和候选可并行；单个场景内部 P0-P5 严格串行。P3 通过后，不同资产条目可并行生产，但同一资源 ID 只有一个写入者。
- P4 离线生成可与已批准结构下的非写入准备并行；P5 只能由一个 Unity 集成代理在 `ALL_ITEMS_VALIDATED` 后执行。

## 所需锁与 Unity 权限

- 图片生成只锁定各自输出路径，不需要 Unity 写权限。
- 导入已批准素材或捕获 Editor 效果前，显式绑定 `unity-mcp` 实例并取得目标资源锁；实机捕获还必须先验证 G2 `PASS`。
- 用户视觉批准是外部门禁，任何代理均无权代替。

## 机器可读输出

研发阶段输出 `visual-bible.yaml`、P0 `prefab-structure.yaml`、P1 `image-generation.yaml`、P2 `visual-review.yaml`、P3 `split-plan.yaml`、P4 聚合验证、P5 `prefab-assembly.yaml`、清理验证与 Editor 固定机位 `visual-capture.yaml`。带平台身份的 `runtime-visual-evidence.yaml` 只能在 G2 `PASS` 后由 G3 输出，并必须引用当前 `g2.development-complete`。

## 通过条件

- Visual Bible 已完成三类独立审查和用户批准；当前场景严格完成 P0-P5，清理验证为 `PASS`，且每道门禁引用同一条未失效版本链。
- 所有截图引用均只用于内容、构图或信息层级，没有复制风格或直接复用像素。
- P3 地图完整覆盖 2D、3D 或混合场景的可见生产元素和排除项；每项分类唯一、生产通道唯一、槽位明确。
- 正式图片资源依据全局视觉逐项独立生成，而非裁切截图或效果图；全部生产项达到 `VALIDATED` 后才进行结构化装配。
- 运行时 Prefab/Scene 不含灰盒组件、占位 Mesh/Sprite/Material 或临时低保真对象及其残留引用；已确认结构节点、稳定 ID 和审计证据保持完整。
- 游戏效果图、UI 效果图和 Editor 实现效果完成规定的独立审查及用户门禁；G3 另行审查设备实机效果。复杂透明素材未被自动降级，交互 UI 最终由 UI Toolkit 实现。

## 失败与恢复出口

- 用户在 P0、P1、P3 或最终实机门禁拒绝时保留版本与原因，回到对应阶段产生新修订，并按失效规则重跑全部下游阶段。
- 三方意见冲突时主代理先消歧；无法消歧则向用户展示明确取舍。
- 资产地图有漏项、重叠路由、未分类项或无法绑定装配槽位时停在 P3；任何条目未达到当前版本 `VALIDATED` 时保持 `ASSEMBLY_BLOCKED`。
- 清理发现灰盒、占位、临时低保真对象或残留引用时保持 `ASSEMBLY_RUNNING` 并修复；不得跳过清理验证标记 `ASSEMBLY_VERIFIED` 或 `DONE`。
- 无法证明截图只作允许用途、无法证明资源由批准基线逐项重新生成，或参考图授权不明时，将任务标为 `BLOCKED`，不得降级为人工目测通过。
- 复杂透明处理阻塞时请求独立遮罩、干净背景、补绘或重新生成；禁止引入 Photoshop 分层文档。
