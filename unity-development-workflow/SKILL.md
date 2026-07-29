---
name: unity-development-workflow
description: 面向 Unity 6、URP、UI Toolkit、Windows 与 CoplayDev/unity-mcp 的游戏全周期总控。需要从立项、强制决策拷问、全局视觉、模块/场景边界、技术骨架、垂直切片、逐场景制作、低保真结构、高保真效果图、编号资产地图、2D 单图生成与结构化拼装、3D 建模与贴图、测试性能推进到可交付 Windows 候选包，或需要协调拷问、制作、架构、玩法、数值、美术、3D、音频、测试与发布角色时使用。
---

# Unity 游戏开发总控

把角色交付物收敛为可玩、可构建、可测试、可审计的 Windows 游戏。用户始终决定范围、视觉方向、风险、指标与发布放行；代理不得把未知项视为批准。

## 启动与按需读取

1. 每次开始或恢复先读[严格执行策略](references/strict-execution-policy.md)与[工作流总览](references/workflow-overview.md)，判断快速、标准或发布通道。所有通道均按失败即阻塞、默认拒绝和无证据不通过执行。
2. 标准或发布通道的新项目若缺少 `docs/project-profile.yaml`，运行 `scripts/initialize_project_docs.py --project-root <项目根目录> --project-id <项目ID>`。默认不覆盖已有文档；只有用户明确要求时使用 `--force`。
3. 只读发现阶段读[项目发现](references/project-discovery.md)；出现无法由证据确定的产品、体验、技术、模块、视觉资源、质量或发布取舍，模块首次实现或边界变化，或用户要求“拷问/grill/压力测试”时，必须调用 `$unity-game-grilling` 并按[决策与变更控制](references/decision-change-control.md)记录当前版本 `grilling-record`。
4. 划分模块与场景时读[模块与场景拆分](references/module-planning.md)，由 `$unity-game-grilling` 完成 13 项拆分前拷问并取得用户对当前版本的确认；未确认不得创建拆分产物或进入 S00/G1/G2。多任务、锁或子代理调度时读[多代理执行](references/multi-agent-execution.md)；只有用户明确要求 Worktree 时才读[Worktree 工作区隔离](references/worktree-integration.md)。
5. 建立全局骨架和首个垂直切片时分别读[S00 基础工作流](references/foundation-workflow.md)与[游戏实现闭环](references/game-implementation.md)。
6. 每个场景读[场景小循环](references/scene-loop.md)；2D 场景同时读[2D 场景屏幕适配](references/scene-2d-adaptation.md)，3D 场景或模型/材质任务同时读[3D 资产工作流](references/3d-asset-workflow.md)。开始任何场景效果图或正式美术资源前，先按[视觉工作流](references/visual-workflow.md)执行“全局视觉 → 低保真 Prefab/Scene 结构说明 → 用户确认 → 高保真效果图 → 用户确认送审候选 → 三类独立审阅 → 效果图完整编号框选/分类 → 用户确认资产地图 → 逐项独立生成/审查 → 正式结构化 Prefab/Scene/UXML/USS 拼装 → 清理运行时灰盒与占位 → Unity 验证”；2D 单图重新生成、正式导入和登记读[资源流水线](references/asset-pipeline.md)。
7. 进入质量门、全局回归或候选包验证时读[质量门禁](references/quality-gates.md)；准备 Windows 制品时读[交付](references/delivery.md)；创建或维护项目文档时读[项目交付物](references/project-artifacts.md)。

不要一次读取全部参考。快速通道优先读任务直接相关的代码、配置、资源和测试。

## 工作通道

- **快速通道**：批准范围内、局部、低风险、可回退且不改变 Unity 场景/Prefab、正式资源、共享登记或批准状态的任务。明确验收后直接实现和验证，不产生 G0 至 G3 通过状态；一旦需要上述写入或扩大批准范围，先升级标准通道。除非用户明确要求，否则禁止创建 Worktree。
- **标准通道**：新模块、跨模块或影响架构、场景、存档、数值、资源、音频、性能的任务。只调度受影响角色，只维护受影响交付物。
- **发布通道**：影响发行渠道、隐私、商业能力、资源权属、候选包或发布放行的任务。执行完整质量门和发布证据链。

影响扩大时升级通道；影响缩小时停止维护无关交付物，不为流程形式保留重通道。

通道只决定是否进入某个完整生命周期门，不降低门禁强度。开始任务前必须通过版本化通道决策列出适用门禁；任何未判定项默认适用。进入 G0-G3 后必须保留该门的完整标准 `requiredChecks`，不得删减、增补、错配或标记为不适用；`FAIL`、`BLOCKED`、`NOT_RUN`、证据缺失、版本不符或状态未知均禁止推进。

## 角色路由

采用子代理优先：将可独立任务交给子代理，主代理保留编排、证据链、冲突处理、质量门和用户沟通：

- `$unity-game-grilling`：逐项澄清关键取舍，形成用户批准的版本化 `grilling-record`；不替用户作答。
- `$unity-game-production`：范围、GDD、验收与变更影响。
- `$unity-game-architecture`：Unity 模块、生命周期、存档、构建与平台边界。
- `$unity-gameplay-development`：可测试的玩法、场景、交互和状态。
- `$unity-game-balance`：难度、经济、成长和参数验证。
- `$unity-game-visual-assets`：全局视觉、低保真结构、高保真效果图、编号资产地图、逐图生成、结构化拼装与实机回路。
- `$unity-game-3d-modeling`：通过 MCP 制作或修改 3D 几何、拓扑、Pivot、LOD、Collider 与 Prefab，并处理 DCC 建模移交。
- `$unity-game-3d-texturing`：通过 MCP 制作或接入 UV、PBR 贴图、URP 材质与材质变体，并验证渲染和纹理预算。
- `$unity-game-audio`：音乐、音效、混音、授权与接入。
- `$unity-game-qa-performance`：测试、设备、Profiler、缺陷和候选验证。
- `$unity-game-release`：Windows 构建、发行资料、合规与交付。

标准、发布通道只调度受影响角色。开发者不能批准自己的输出；视觉一致性、Unity 可实现性、UX/可读性审查与用户批准必须分离。

## G0 至 G3

| 阶段 | 核心结果 | 收敛条件 |
| --- | --- | --- |
| G0 立项 | 最小范围、核心循环、模块/场景拆分、首发 Windows 发行方式、技术与视觉方向 | 当前版本 `grilling-record`、用户批准范围、`decomposition-plan` 和全局 Visual Bible 全部通过；可选能力默认关闭 |
| G1 垂直切片 | S00 后完成一个端到端可玩场景 | 干净环境可编译构建；正式资源可追溯；游戏/UI/实机视觉均通过独立审查和用户批准 |
| G2 制作 | 按场景小循环完成并冻结全部批准范围 | 无未批准占位资源；全局回归、性能与 P0/P1 处置有证据 |
| G3 交付 | 生成与证据一一对应的 Windows 候选包 | 制品、许可、说明、风险和回滚齐备，并获得用户放行 |

快速通道不要求通过 G0 至 G3。批准后若变更影响已通过门禁，将该门标记为待复核，只重跑受影响项及其下游。

## 美术主流程硬门禁

1. 全局 Visual Bible 批准后，先为每个场景提交低保真 Prefab/Scene 灰盒、层级树和结构说明；说明必须覆盖稳定节点 ID、父子关系、渲染顺序、元素类型、交互状态、Anchor、Pivot、安全区、遮罩和资源占位 ID。UI Toolkit 同时定义 UXML/USS 与 UIDocument 结构。用户未确认当前结构版本时，不得生成高保真效果图。
2. 高保真效果图必须依据已批准全局视觉和结构版本生成。用户首次确认只将其指定为送审候选；候选随后分别接受视觉一致性、Unity 可实现性、UX/可读性三类独立审阅，开发者不得批准自己的输出。
3. 审阅要求修改时，必须生成新的高保真版本并重新取得用户送审确认和三类审阅；三类审阅均通过后，才可在该同版本效果图上用稳定编号完整框选待生产单图，并将所有可见元素分类为独立图片、批准复用资源、文本、Unity 图元/程序绘制、UXML/USS/矢量、材质/VFX 或 3D 对象。编号、分类、结构节点、状态变体和导入规格共同组成资产地图；存在漏标、未分类或无节点映射时不得请求批准。
4. 用户确认资产地图后，按编号逐项独立生成或重绘并分别审查。截图与效果图只能作为内容、构图和信息层级参考；禁止裁切截图或效果图充当资源，禁止轻微修饰裁片后冒充独立生成，禁止将整张效果图作为游戏或 UI 铺底。只有已批准的原始独立资源或具有可验证独立图层身份的源文件可以复用或导出。
5. 全部单项资源批准后，按已确认结构拼装正式 Prefab、Scene，或 UI Toolkit 的 UXML/USS、VisualTreeAsset 与 UIDocument。正式结构化拼装完成后，删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象，清理其序列化、场景、Prefab、地址和登记引用，再执行 Unity 多分辨率、多宽高比、安全区和交互状态验证。已确认结构节点及稳定 ID 必须保留，`prefab-structure`、预览、批准记录等审计证据必须继续可追溯；只有清理验证为 `PASS`，并且资源与节点双向映射、父子层级、渲染顺序、Anchor、Pivot、遮罩、状态、黑边和孤儿资源均通过后，才可标记 `ASSEMBLY_VERIFIED` 或 `DONE`。

低保真结构变化会使高保真候选、审阅、资产地图、单项资源和拼装批准失效；高保真候选变化会使审阅、资产地图及其下游批准失效；资产地图变化至少使受影响单项资源和拼装批准失效。总控必须回退到最早受影响关卡，不得沿用旧批准。需要恢复灰盒时，从保留的结构、预览和批准记录等审计证据重建，不得在运行时 Prefab/Scene 中保留低保真资产作为回退副本。

所有用户确认和代理审查必须绑定精确对象 ID、版本、SHA-256、`sourceRevision`、上游证据与结论范围；口头认可、未指明对象的“继续”、旧版本确认和代理判断均不得写成用户批准。任何上游内容、版本、哈希、来源修订或批准范围变化，都必须递归作废受影响下游状态与证据。

## Unity MCP 与写入约束

- 只面向 Unity 6、URP、UI Toolkit 和 Windows；其他平台必须另行扩展并批准。
- 写入前读取 `mcpforunity://instances`，按项目路径选择唯一 `Name@hash`，调用 `set_active_instance` 显式绑定；多实例不猜测。
- 仅激活当期需要的工具组：核心默认可用，UI、testing、profiling、animation、vfx、probuilder、scripting_ext 按需通过 `manage_tools` 激活。
- 3D 任务先发现实际可用 MCP/DCC 能力再选路径，不臆造工具或导出格式。Unity 与 DCC 正式写入均采用单写者：同一模型源、DCC 工程、Mesh、材质、Prefab 或依赖场景不得被两个代理同时修改。
- 写入前读取 `mcpforunity://editor/state`；编译、导入、域重载、PlayMode、未保存场景、陈旧连接或阻塞对话框存在时不得写入。Unity 正式写入和共享状态写入必须串行；只读分析、候选生成与不重叠的非 Unity 制品可并行。
- 每次 MCP 写入前还必须校验当前门禁、上游版本/批准、目标基线和独占锁并保存写前证据；写入后等待 Editor 稳定，重新读取目标对象、场景、Console 与登记，运行最小验证并保存当前版本证据。任一后置检查失败时阻塞，不得以 MCP 调用成功代替验证。
- 截图和高保真效果图只允许说明内容、构图和信息层级，不能成为色彩、材质、光照、字体、图标、笔触或成品像素的来源。正式资源必须依据已批准 Visual Bible 和资产地图逐项独立生成或重绘，再经过逐项审查和 Unity 导入/运行验证；禁止裁切截图或效果图充当资源，禁止整张效果图铺底冒充结构化场景或 UI。
- Git 只用于普通版本控制，不属于质量门。除非用户明确要求，否则禁止创建 Worktree；即使已获授权，也不得自动合并、删除 Worktree、删除分支、签名、上传或覆盖稳定制品。

## CLI 索引

在 Skill 根目录运行；非零退出码即失败证据：

```powershell
uv run scripts/workflow.py validate --kind project-profile --source templates/project-profile.yaml
uv run scripts/workflow.py validate --kind grilling-record --source templates/grilling-record.yaml
uv run scripts/workflow.py validate --kind decomposition-plan --source templates/decomposition-plan.yaml
uv run scripts/workflow.py compile --project-root D:/Projects/my-game --kind scene-manifest --source D:/Projects/my-game/Artifacts/scene.yaml --output D:/Projects/my-game/Artifacts/scene.json
uv run scripts/workflow.py ready --tasks artifacts/tasks.yaml --state artifacts/state.json
uv run scripts/workflow.py lock --file artifacts/locks.json acquire --task S01 --request scene:write:Assets/Scenes/S01.unity
uv run scripts/workflow.py transition --file artifacts/state.json --task S01 --to READY --actor orchestrator --evidence artifacts/S01/readiness.json
uv run scripts/workflow.py gate evaluate --config artifacts/quality-gates.yaml --gate G1 --project-root D:\Projects\my-game --project-id my-game --source-revision abc1234 --build-version 0.1.0-dev.1 --output artifacts/quality-gates.evaluated.yaml
uv run scripts/workflow.py asset merge-records --project-root D:\Projects\my-game --records Artifacts/AssetRegistry/records --register docs/asset-register.yaml
```

先校验契约，再编译机器产物。任务执行前检查 `ready` 与锁；只有目标状态所需证据真实存在时才迁移状态。`gate evaluate` 递归检查项目内路径、Schema、主体、版本和 SHA-256，并原子输出门禁结果。资源导入代理只写不可变 registration record；集成代理以 `asset merge-records` 单写总登记，且不得自动批准许可证。未运行的检查使用 `NOT_RUN`，环境或权限缺失使用 `BLOCKED`，不得推断 `PASS`。
