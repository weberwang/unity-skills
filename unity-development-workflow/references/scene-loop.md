# 场景小循环

## 何时读取

S00 通过后，为每个场景进行需求、实现、视觉、测试、审批与冻结时读取。

## 输入

- 当前场景 manifest、其引用的已批准拆分决策、场景需求、依赖状态和 Visual Bible。
- S00 公共接口、资源所有权与当前用户批准记录。
- 游戏效果图、UI 效果图和实机捕获的候选或证据。
- 3D 场景还需模型清单、单位/轴向、观察距离、拓扑/贴图/LOD/Collider 预算、DCC 源与 MCP 能力快照。

## 执行步骤

1. 先应用严格执行策略，校验场景 manifest 与 `decompositionPlan` 引用，确认场景 ID、版本、生命周期、模块依赖、共享能力和拥有路径仍在用户批准范围；不一致、未知或缺证时返回拆分拷问，不得进入 G1/G2 实现。
2. 执行 **P0 结构确认**：创建低模 Prefab 层级、灰盒构图和文字说明，验证最小交互路径，并冻结本场景资源依赖、UI 信息架构、镜头与验收测试；请求确认前由 `$unity-game-grilling` 对当前结构候选逐项拷问并绑定批准记录。状态必须依次为 `STRUCTURE_DRAFT -> STRUCTURE_AWAITING_USER -> STRUCTURE_APPROVED`；用户确认前不得进入高保真视觉。
3. 若为 2D 场景，按总控已加载的 2D 场景屏幕适配规则建立契约：竖屏固定高度且 UI Toolkit `match=1`，横屏固定宽度且 `match=0`；产生的左右或上下边带必须由无交互纯视觉背景覆盖。场景小循环完成数学、EditMode 与参考环境验证后才可把适配契约标记为 `VERIFIED`；该技术状态不等于跨设备验收，完整设备矩阵仍留到 G2 全部通过后的 G3。
4. 若为 3D 场景，按总控已加载的 3D 资产规则冻结模型/材质任务：`$unity-game-3d-modeling` 负责 Blockout、几何、LOD、Collider 与模型 Prefab，拓扑/UV 边界冻结后 `$unity-game-3d-texturing` 负责 UV、PBR 贴图、URP 材质和变体；复杂有机或工具无法可靠完成的资产转 DCC 移交。
5. 执行 **P1 高保真候选生成**：基于 P0 和已批准 Visual Bible 分别生成游戏画面与 UI 候选集，状态依次为 `HIGH_FIDELITY_DRAFT -> HIGH_FIDELITY_GENERATING -> HIGH_FIDELITY_GENERATED`。P1 不请求用户先选送审候选；生成契约只记录全部候选和证据。
6. 执行 **P2 多级漏斗审核**：F0 对全部 P1 候选执行自动预检，F1 主责筛选至多三个候选，F2 由视觉一致性、Unity 可实现性、UX/可读性三个不同审查者收敛到唯一推荐候选；随后用 `$unity-game-grilling` 固化 F0-F2 结论，F3 只向用户提交该唯一候选、合并意见与未消除风险。状态依次为 `SCREENING -> SPECIALIST_REVIEWING -> AWAITING_USER -> APPROVED | CHANGES_REQUIRED`。候选内容变化必须返回 P1 并从 F0 重跑；仅审查证据或排序变化时返回最早受影响漏斗级。
7. 执行 **P3 完整资产地图确认**：在 P2 通过的游戏/UI 原图上框选所有可见生产元素，赋予唯一条目 ID；拆分前由 `$unity-game-grilling` 逐项拷问用途、独立生成必要性、复用边界、轮廓、遮挡补全、尺寸、透明、枢轴/锚点、PPU、九宫格、动画帧、交付形式、性能代价和目标槽位，并绑定唯一生产通道及列出无需生产的排除项。状态依次为 `ASSET_MAP_DRAFT -> ASSET_MAP_AWAITING_USER -> ASSET_MAP_APPROVED`；地图、绑定当前版本的拷问记录和用户确认未完成时不得生产正式资源。
8. 执行 **P4 逐项生产与验证**：2D/位图项逐张依据 Visual Bible 独立生成，模型项走建模，PBR/材质项走贴图材质，灯光、相机、后处理、Shader、UI Toolkit 和代码项走实现；每项依次为 `PLANNED -> GENERATING -> REVIEWING -> APPROVED -> IMPORTED -> VALIDATED`，其中实现类的 `IMPORTED` 表示已写入并可由 Unity 加载。只有地图全部生产项处于当前版本 `VALIDATED`，聚合状态才可设为 `ALL_ITEMS_VALIDATED`。
9. 执行 **P5 结构化装配与清理**：初始状态为 `ASSEMBLY_BLOCKED`，仅 `ALL_ITEMS_VALIDATED` 可转为 `ASSEMBLY_READY`，再由单写 Unity 集成代理进入 `ASSEMBLY_RUNNING`。严格按 P0 层级与 P3 槽位装配 Prefab/Scene；不得把效果图、整张背景合成图、联系表、占位图或未登记对象当作正式实现。玩法、内容与 UI Toolkit 交互接线在该结构中串行完成。正式结构化拼装完成后，删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象，并清理序列化、场景、Prefab、地址和登记引用；保留已确认结构节点及稳定 ID，并保留 `prefab-structure`、预览和批准记录等审计证据。只有清理验证为 `PASS` 后，才可从 `ASSEMBLY_RUNNING` 进入 `ASSEMBLY_VERIFIED`。
10. 研发阶段只用 Unity Editor/Game View 在批准参考分辨率、方向、安全区和交互状态下捕获固定机位实现画面；与 P1 目标对比并交由视觉一致性、Unity 可实现性、UX/可读性三个独立审查子代理，修复并重新捕获，对当前实现候选执行 `$unity-game-grilling` 后请求用户批准。禁止安装或启动 Standalone/Player、真机或等价设备，也不得调用 `capture_windows_runtime.py`。只有全部场景、模块和平台适配完成且 G2 `PASS` 后，G3 才能生成候选包并开始设备验证。
11. 执行场景测试、冒烟、可访问性、视觉与性能门禁；2D 场景还必须完成参考、边带、裁切三类适配检查。此处只验证场景实现与适配契约，不得执行或标记完整设备矩阵为 `PASS`。P0 变化使 P1-P5 失效；P1 变化使 P2-P5 失效；P2 退回时重做 P1；P3 变化使受影响 P4 和 P5 失效；P4 任一资源内容、规格、GUID/地址、导入设置或槽位变化都会清除 `ALL_ITEMS_VALIDATED` 并使 P5 失效；Visual Bible 变化使受影响场景从 P1 重启。上游需要回退时，从结构、预览、批准记录等审计证据重建灰盒，不在运行时保留低保真资产。所有证据重建、清理验证 `PASS` 且用户最终批准后才能冻结场景或标记 `DONE`。
12. 可提前只读准备下一场景，但禁止提前写其正式共享状态；当前场景冻结后再切换主场景。

P0-P5、Editor 实现视觉验证和场景批准构成不可跨越的小循环。每次状态迁移必须解析当前版本的全部前置证据；失败、阻塞、未运行、确认未绑定精确版本或证据失效时保持原状态。任何代理不得以审查结论代替 P0、P2/F3、P3 或实现视觉的用户批准。G2 `PASS` 标志研发完成；此前不得开始任何设备验证，之后才由 G3 对同一候选包执行设备验收。

## 子代理角色与并行边界

- 需求、资源盘点和下场景只读准备可并行；当前场景 P0-P5 不得跨门禁并行。
- 当前场景的 Unity 正式写入串行；玩法开发与 UI 写入不得同时修改场景。
- P3 通过后，不同地图条目可并行生产；3D 建模与贴图规格可并行准备，但正式贴图等待拓扑/UV 冻结。同一资源 ID、DCC 工程、模型、材质、Prefab 和场景接线采用单写者。
- 视觉审查、QA 审查与开发代理相互独立；同一时刻只验收一个主场景。
- 当前主场景未冻结前，下一场景不得产生 Unity 写入、正式资源导入、共享状态迁移或验收结论。

## 所需锁与 Unity 权限

- 灰盒和实现持有当前场景及其资源路径独占锁。
- 写调用前显式绑定项目对应的 `unity-mcp` 实例。
- 冻结时持有场景状态锁；下一场景不得占用正式共享状态锁。
- DCC 工程/源文件/导出目录持有独占单写锁；释放后再由 Unity 单写代理取得 Mesh、Texture、Material、Prefab、AssetDatabase 和场景锁，禁止交叉持锁。

## 机器可读输出

更新 `scene-manifest.yaml`，输出 P0 `prefab-structure.yaml`、P1 高保真候选集、P2 `visual-review.yaml` 2.0 漏斗记录、P3 `split-plan.yaml` 完整资产地图、P4 条目状态与 `ALL_ITEMS_VALIDATED` 聚合证据、P5 `prefab-assembly.yaml` 及清理验证，以及 `scene-report`、Editor 固定机位证据与最终实现审查。2D 场景必须引用当前 `VERIFIED` 适配契约，但该状态只证明 Editor 配置与参考分辨率检查通过；G3 设备报告另行证明跨设备矩阵。每份引用均带 Visual Bible、场景、结构、视觉、地图、资源版本和 SHA-256；`DONE` 必须深度解析完整未失效链、清理验证 `PASS`、`ASSEMBLY_VERIFIED`、质量报告、Editor 证据与用户最终批准。`runtime-visual-evidence` 只能在 G2 `PASS` 后生成。

## 通过条件

- P0-P5 按严格顺序完成，P3 无漏项或重复路由，P4 为 `ALL_ITEMS_VALIDATED`，P5 清理验证为 `PASS` 且状态为 `ASSEMBLY_VERIFIED`，整条版本链未失效。
- 运行时灰盒组件、占位 Mesh/Sprite/Material、临时低保真 Prefab/Scene 对象及其引用全部清零；结构化实现、UI Toolkit、测试和性能证据全部通过。
- 已确认结构节点和稳定 ID 未因清理改变，`prefab-structure`、预览与批准记录等审计证据完整可用于重建。
- 2D 场景的高度/宽度基准、纯视觉边带、无黑边和交互安全区已通过本场景适配检查；跨设备最终结论留到 G3。
- 3D 场景的模型比例、拓扑、法线、UV、贴图、材质、LOD、Collider、Prefab 和性能均有当前版本证据。
- 游戏效果图、UI 效果图和 Editor 实现效果均经过独立审查、修改闭环与用户批准；设备实机效果留到 G3。
- 场景没有未声明共享写入，冻结状态可追溯。

## 失败与恢复出口

- P0、P2/F3、P3 或 Editor 实现视觉被拒绝时回到最早受影响阶段，新修订按版本失效规则清除下游有效状态。
- P2 修改候选内容时必须返回 P1 并重跑 F0；只修改审查证据时返回最早受影响漏斗级。P3 漏项或路由冲突时停在资产地图；任何 P4 项未验证时不得解除 `ASSEMBLY_BLOCKED`。
- P5 清理验证失败时保持 `ASSEMBLY_RUNNING`，删除残留低保真对象或引用后重验；不得以保留运行时灰盒支持潜在回退。
- 实现或测试失败时解除冻结意图，修复当前场景后重跑受影响门禁。
- 发现共享需求时回到模块规划；未满足“两场景共同需要”则留在场景内。
- 3D 工具能力不足时停止并生成 DCC 移交包；拓扑、UV 或材质槽变化时作废受影响贴图、材质和场景证据，不复用旧批准。
