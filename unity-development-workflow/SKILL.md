---
name: unity-development-workflow
description: 面向 Unity 6、URP、UI Toolkit 与 Unity MCP 的全周期总控；编排范围、全局视觉三选一、逐场景视觉门、结构化实现、研发完成和多平台候选交付。
---

# Unity 游戏开发总控

以 Skill/Codex 作为控制面，以 Unity MCP 和随附 C# Toolkit 作为 Unity 执行面；Node 只负责项目文档初始化、文件哈希和 JSON Job 封装。用户决定范围、平台、全局视觉、场景草图、高保真精确版本、资产地图和发布放行。

## 按需读取

1. 每次开始或恢复先读[严格执行策略](references/strict-execution-policy.md)和[工作流总览](references/workflow-overview.md)。
2. 标准或发布通道缺少项目文档时，用 `node scripts/workflow-files.mjs init-docs` 初始化；规则见[项目交付物](references/project-artifacts.md)。
3. 范围、模块、场景或关键取舍不明确时调用 `$unity-game-grilling`，再读[模块与场景拆分](references/module-planning.md)。
4. G0-G3 读[质量门禁](references/quality-gates.md)；S00/G1 读[基础工作流](references/foundation-workflow.md)和[游戏实现闭环](references/game-implementation.md)。
5. 任何视觉任务先读[多级漏斗审核](references/review-funnel.md)和[视觉工作流](references/visual-workflow.md)；逐场景同时读[场景小循环](references/scene-loop.md)。2D、3D、资源和交付再按需读取对应参考。现有 Spine 角色在 Skeleton、Slot、Attachment、Mesh、约束、动画和玩法挂点全部固定、仅替换外观时调用 `$unity-game-spine-reskin`；需要改变任一固定项时升级为更高范围角色任务。

不要一次读取全部参考。控制面不维护本地流程状态机或锁文件；Codex 依据当前证据直接编排，并保证同一 Unity 项目正式写入单写者。

## 工作通道

- **快速通道**：批准范围内、局部、低风险且不改变 Scene、Prefab、正式资源、共享登记或批准状态的任务；直接实现和验证，不产生 G0-G3 通过结论。
- **标准通道**：新模块、跨模块或影响架构、场景、资源、音频、数值、性能的任务。
- **发布通道**：影响候选包、设备、发行、隐私、商业能力、权属或发布放行的任务。

所有通道默认拒绝：`FAIL`、`BLOCKED`、`NOT_RUN`、未知、证据缺失、版本或哈希不一致均不得推进。

## 审核漏斗 F0-F4

| 层级 | 唯一职责 |
| --- | --- |
| F0 实际验证 | 对真实对象运行确定性检查，保存原始证据 |
| F1 总控分诊 | 检查范围、证据和送审资格，不作专业自批 |
| F2 独立非作者审核 | 由所需学科审查当前对象，作者不得审核自己 |
| F3 总控收敛 | 合并意见、处理阻塞并组成送用户决定的包 |
| F4 用户决定 | 用户对精确对象、版本和内容明确选择、确认或要求修改 |

`GLOBAL_DIRECTION` 是唯一候选数专项例外：F0-F2 分别审查三个具有实质差异的完整方向；失败方向必须替换或修订，并从 F0 重跑，直到 F3 形成恰好三个有效候选的三选一包。F3 可以推荐其中一个，但不得先收敛成唯一候选；F4 用户必须明确选择一个。其他对象（包括场景高保真）可在 F3 收敛为唯一推荐后交 F4 确认。

## 生命周期 G0-G3

| 阶段 | 核心结果 | 收敛条件 |
| --- | --- | --- |
| G0 范围与方向 | 范围、平台、模块/场景、全局技术和全局视觉 | 平台与拆分已确认；A0 三选一完成并冻结 Visual Bible |
| G1 骨架与垂直切片 | S00 共享骨架和一个 Editor 垂直切片 | Editor/PlayMode 可玩；主开发平台构建可生成；不安装或启动设备 |
| G2 研发完成 | 全部场景、模块、Editor 验证和无设备平台适配 | 所有必需报告实际 `PASS`；这是唯一 `DEVELOPMENT_COMPLETE` 标志 |
| G3 候选与设备 | 绑定 G2 的逐平台候选包和设备矩阵 | 仅在用户要求/授权后执行设备验收；严禁自动发起真机验收 |

G2 之前不得安装、启动或验证 Standalone/Player、真机或等价设备。G3 也不得因流程自动触发真机；缺少用户指令、工具链或设备时保持 `NOT_RUN`/`BLOCKED`。

## 美术 A0-A4 不可跳过主链

### A0 全局视觉三选一

生成恰好三个完整、可查看、具有实质差异的全局方向。每个方向绑定独立 ID、版本、SHA-256、`sourceRevision` 与生成证据，分别通过 F0-F2。F3 只在三个都有效时提交三选一包；F4 用户明确选择一个后，才从该选择冻结 Visual Bible。不得用“唯一推荐候选”规则剥夺三选一。

### A1 草图/灰盒确认

每个场景或界面先产出实际可查看的草图或灰盒草图，并一起提交结构说明：稳定节点 ID、父子层级、渲染顺序、元素类型、交互/状态、布局、Anchor、Pivot、安全区、遮罩和资源槽。UI Toolkit 同时给出 UXML/USS/UIDocument 结构。F4 未确认该精确草图和结构版本前，不得进入 A2。

### A2 高保真精确版本确认

只依据冻结 Visual Bible 和已确认 A1 生成高保真效果图。完成 F0 实际预检、F1 分诊、F2 独立视觉一致性/Unity 可实现性/UX 可读性审核及 F3 收敛后，必须在 F4 请求用户确认当前精确高保真 ID、版本、SHA-256 和 `sourceRevision`。送审后任何像素或结构变化均产生新版本并重跑。

### A3 元素分析、资产地图与单图生产（必须人工确认）

只分析 F4 已确认的高保真原图。对全部可见元素完整编号，并分类为：独立位图、批准复用、文本、Unity 图元/程序绘制、UXML/USS/矢量、材质/VFX、3D。每项记录结构节点、目标路径、状态变体、`bounds`、`targetSize`、透明要求、Pivot、PPU、Border、导入和验证规格，并写明复用或排除理由；漏标、未分类或无节点映射不得送审。

资产地图 F4 是不可跳过的人工确认门。送用户确认的对象必须同时展示带框选、稳定序号和简要说明的 annotated split preview、完整 `items`、逐项分类、上述几何与导入规格、状态变体、目标节点/路径、复用/排除理由，以及源高保真图的 ID、版本和 SHA-256；标注必须清楚呈现“序号 + 路线 + 简要说明”，例如 `[01][GENERATE] 竞技场背景`，让用户从图上区分生成、复用和程序实现。缺标、错号、框选越界或说明缺失不得送审。只有用户对该精确版本留下 `USER`/`ASSET_MAP` 批准记录后，才可进入正式位图生成、导入或 Scene/Prefab/UI 写入；代理、脚本、哈希存在、默认同意或含糊的“继续”均不得代批。拆解项增删、合并、分类、尺寸、边界、节点映射或源高保真身份变化，都会使批准和下游产物失效并要求重新人工确认。F4 确认资产地图后，才逐项独立生成或重绘、导入并验证单图。

标记为 `REUSE` 的项必须填写完整 `reuseResourcePlan`（含 `existingAssetId`、`reuseReason`、安全 `reuseMode`、源路径/SHA、Unity GUID、资产登记、许可/权属、风格兼容、Importer 和 Unity 验证证据）；其中 `effectImagePixelReuse: FORBIDDEN` 只表示不得从高保真效果图取像素，按 `sourcePath`/`sourceSha256` 复用已登记源资源是允许的。人工确认资产地图后，复用前还要核对全部证据。高保真效果图的裁切、抠取或修饰结果不得标记为复用。

`PROGRAMMATIC`、`CODE`、`MATERIAL`、`VFX` 和 `MODEL_3D` 项转 Unity 图元、UXML/USS、Shader、代码或对应结构化责任通道，不创建图片生成任务；只有位图交付项填写 targetSize、透明、Pivot、PPU 和 Border。

禁止裁切高保真图充当 Sprite/纹理/UI 单图，禁止轻微修饰裁片冒充独立生产，禁止将整张高保真效果图作为游戏或 UI 铺底。效果图只提供内容、构图和信息层级参考。

### A4 Unity 结构化还原

按已确认 A1 结构和 A3 资产地图，在 Scene、Prefab、UXML、USS、材质、VFX 或 3D 结构中还原。全部正式项接入后删除草图、灰盒、占位 Mesh/Sprite/Material、临时对象和临时低保真资产，并清理序列化、场景、Prefab、地址和资源登记中的残留引用。随后用 Unity MCP/C# Toolkit 完成 Editor 稳定性、结构、Console、资源映射、多分辨率、安全区和交互验证；不得以 MCP 调用成功代替 `PASS` 证据。

A0 变化使受影响 A1-A4 失效；A1 变化使 A2-A4 失效；A2 变化使 A3-A4 失效；A3 变化至少使受影响单项和 A4 失效。旧批准只作历史证据。

## 证据和 Unity 写入

- 所有确认与审查绑定对象 ID、版本、SHA-256、`sourceRevision`、上游证据和结论范围；含糊“继续”、旧确认或代理判断不算用户批准。
- Unity 写入前发现实例并按项目路径显式绑定，检查 Editor 稳定、当前门、上游批准、目标基线和单写者所有权；写后等待稳定并复读对象、场景、Console、登记和最小验证。
- Unity 相关确定性检查优先使用 MCP 和 Toolkit 的 `ValidateProject`、`CaptureVisual`、`ImportImage`、`DeliveryPreflight` 等短操作。Node 不替代 Unity 对 Scene/Prefab/Importer/构建的事实验证。
- 未获用户明确要求时不创建 Worktree；严禁自动签名、上传、发布、覆盖稳定制品或发起真机验收。

## 最小 Node 文件工具

在 Skill 根目录运行：

```powershell
node scripts/workflow-files.mjs init-docs --project-root D:/Projects/my-game --project-id my-game
node scripts/workflow-files.mjs init-docs --project-root D:/Projects/my-game --project-id my-game --include assets,qa
node scripts/workflow-files.mjs sha256 --file D:/Projects/my-game/Artifacts/Visual/scene-v2.png
node scripts/workflow-files.mjs compile-json --project-root D:/Projects/my-game --kind image-task --source D:/Projects/my-game/Artifacts/image-task.json --output D:/Projects/my-game/Artifacts/image-task.job.json
```

工具只处理文件系统边界、哈希和 JSON Job 封装；Schema/语义由控制面核对，Unity 实际事实由 MCP/Toolkit 验证。`--force` 仅在用户明确授权覆盖文档时使用。
