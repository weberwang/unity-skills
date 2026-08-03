# Unity 游戏协作 Skills

面向 Unity 6、URP、UI Toolkit、Windows、Android、iOS/iPadOS 与 [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) 的全周期游戏开发工作流。入口是 `$unity-development-workflow`，覆盖立项、平台选择、全局视觉、S00 全局骨架、垂直切片、逐场景制作、2D/UI 资源、3D 模型与 PBR 纹理、音频/数值、分平台适配、测试性能和多平台候选交付。最终产品适配哪些平台只能由用户需求决定，模板和开发机环境都不能替用户默认选择。

## 工作通道

- 快速通道：批准范围内、不改变 Unity 场景/Prefab、正式资源、共享登记或批准状态的局部低风险任务，直接实现和验证但不产生 G0-G3 通过状态；触及上述写入时必须升级标准通道。
- 标准通道：新模块、跨模块、场景、存档、数值、资源、音频或性能任务，只调度受影响角色。
- 发布通道：涉及发行、隐私、商业能力、权属或候选包，执行 G0 至 G3 完整门禁。

## 安装 Skills

需要 Node.js 22.20 或更高版本。在目标 Unity 项目根目录执行一条命令，即可把总控、十一个角色与一个 Star Blogger 项目专项 Skill 复制到项目的 `.agents/skills/`：

```powershell
npx -y github:weberwang/unity-skills
```

也可以在任意目录显式指定目标项目：

```powershell
npx -y github:weberwang/unity-skills D:\Projects\my-game
```

安装器直接复制本次 npx 下载包内的全部十三个 Skills，确保安装内容与入口来自同一提交，不依赖本仓库的本地路径。`-y` 仅跳过 npx 的下载执行确认；安装器默认拒绝覆盖项目中已有的同名 Skill。执行前可只读检查远端内容：

```powershell
npx -y skills@1.5.19 add weberwang/unity-skills -l --full-depth
```

已克隆本仓库时，仍可使用本地安装器；它默认拒绝覆盖同名 Skill，只有明确替换时才添加 `--force`：

```powershell
uv run .\scripts\install_project_skills.py --project-root D:\Projects\my-game
```

明确要用当前远端版本替换项目中已安装的同名 Skills 时：

```powershell
npx -y github:weberwang/unity-skills --force
```

## 安装 Unity MCP 与 Toolkit

在 Unity 6 项目的 Package Manager 中先添加已审查基线版本的 CoplayDev/unity-mcp：

```text
https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v10.1.0
```

然后把已安装 Skill 内的 Toolkit 复制到项目 `Packages/com.project.unity-workflow-toolkit`：

```powershell
Copy-Item -Recurse .\.agents\skills\unity-development-workflow\assets\unity-workflow-toolkit\Packages\com.project.unity-workflow-toolkit .\Packages\com.project.unity-workflow-toolkit
```

打开 Unity 后使用 `Window → MCP for Unity → Configure All Detected Clients` 建立连接。工作流会读取 `mcpforunity://instances`，按项目路径选择 `Name@hash` 并调用 `set_active_instance`；UI、测试、Profiler、ProBuilder、VFX 与 Asset Generation 等工具组只在需要时激活。

[Unity MCP v10](https://coplaydev.github.io/unity-mcp/migrations/v10) 的 `asset_gen` 可通过 [`generate_model`](https://coplaydev.github.io/unity-mcp/reference/tools/asset_gen/generate_model) 调用已配置的 Tripo 或 Meshy 供应商，[`import_model_file`](https://coplaydev.github.io/unity-mcp/reference/tools/asset_gen/import_model_file) 可导入本地模型，[`manage_texture`](https://coplaydev.github.io/unity-mcp/reference/tools/vfx/manage_texture) 与 [`manage_material`](https://coplaydev.github.io/unity-mcp/reference/tools/core/manage_material) 用于程序纹理、导入设置和材质接入。Asset Generation 默认关闭；启用供应商、上传参考、产生费用和接受许可前必须逐任务取得用户确认，密钥只保存在 Unity Editor 的安全存储中。

精确拓扑、UV、Cage 和高低模烘焙需要另行安装并经用户批准的本地 DCC MCP（例如 [Blender MCP](https://github.com/ahujasid/blender-mcp)）；本仓库不会自动安装、启动或授予其任意代码执行权限。使用前必须发现真实能力、固定活动源文件和输出目录，并限制脚本访问操作系统、网络、环境变量与项目外文件；能力不足时任务返回 `BLOCKED`。

Toolkit 不复制 `unity-mcp`，也不代替官方 `manage_build`。它只提供项目校验、2D 画面适配、批准图片导入、固定机位视觉取证和交付预检等短操作。

## 角色 Skills

- `$unity-development-workflow`：总控、路由、质量门和用户批准。
- `$unity-game-grilling`：在产品、模块/场景、体验、技术、视觉资源、质量或发布存在关键取舍时逐项拷问并冻结决策。
- `$unity-game-production`：制作策划、范围、验收和变更控制。
- `$unity-game-architecture`：模块、生命周期、存档、构建和 S00 骨架。
- `$unity-gameplay-development`：玩法、场景、交互与状态实现。
- `$unity-game-balance`：难度、经济、成长和参数验证。
- `$unity-game-visual-assets`：全局视觉、低保真结构、高保真效果图、编号资产地图、逐项独立生成、结构化拼装与实机迭代。
- `$unity-game-3d-modeling`：通过 Unity MCP、生成式供应商或经批准的 DCC MCP 制作几何、UV、LOD、碰撞和 Prefab。
- `$unity-game-3d-texturing`：为冻结模型制作与烘焙 PBR 纹理，完成 URP 通道打包、Importer、Material 和场景验证。
- `$unity-game-audio`：音乐、音效、混音、授权和接入。
- `$unity-game-qa-performance`：EditMode/PlayMode、场景、Profiler 和候选验证。
- `$unity-game-release`：Windows 与移动端构建、许可、发行资料和交付放行。

## 项目专项 Skill

- `$unity-game-build-player-character`：为 Star Blogger 的 P3-002 建立玩家角色项目基线，按统一生产母版构建 17 张角色单图，并完成目标 A/B、GUID 保留和 Unity 接入验收。该 Skill 只在任务明确涉及 Star Blogger P3-002 时触发，不属于通用角色路由。

### 严格拷问门禁

`$unity-game-grilling` 不是普通需求访谈，而是受影响写入前的强制门禁。它先以只读证据消除事实问题，再按影响逐项询问；高影响或相互依赖的问题一次只问一个，每题给出二至三个互斥选项、影响、推荐项和理由。模块/场景首次实现或边界变化，以及 Visual Bible、P0、P1、P3、3D brief/外部工具、质量阈值、最终实机和发布授权，均必须触发拷问。

用户明确批准版本化决策摘要前，禁止受影响的 Unity MCP、代码、Scene、Prefab、正式资源或发布写入。批准结果写入 `grilling-record`，绑定真实主体文件、项目、来源修订、项目状态版本和 SHA-256，并由使用该决定的权威契约反向引用；任一绑定变化都会使下游批准失效。代理审查、含糊的“继续”或口头确认不能代替该记录与用户批准。

## 主流程

工作流采用严格默认拒绝策略：失败、阻塞、未运行、未知、缺少当前版本证据或批准时一律停止推进。所有用户确认和代理审查绑定对象 ID、版本、SHA-256、来源修订与结论范围；口头确认和代理结论不能代替用户批准。上游变化会递归作废下游，任何场景必须完成自己的 P0-P5、Editor 固定机位视觉验证和最终批准小循环后才能切换主场景。G2 `PASS` 是研发完成的唯一机器标志；此前禁止安装、启动或验证 Standalone/Player、真机或等价设备。Unity MCP 每次写入都执行实例、Editor、门禁、版本、锁和目标基线的写前校验，以及稳定状态、目标对象、Console、登记和最小验证的写后校验。

1. 先完成项目只读发现、事实核验和证据收集，并绑定唯一 Unity MCP 实例；可从现有文件或工具结果确定的事实不得转问用户。
2. G0 由 `$unity-game-grilling` 逐项确认最小范围、核心循环、模块/场景、关键风险、目标平台集合、主开发平台和各平台发行方式，生成当前版本 `grilling-record`；再生成并由用户确认全局 Visual Bible。Windows、Android、iPhone/iOS 与 iPad/iPadOS 必须分别询问并记录，未被用户批准的平台不得进入交付范围。
3. 在创建模块、场景、目录或程序集前，用 `$unity-game-grilling` 完成拆分拷问，向用户展示模块、场景、共享能力及恢复方案，并等待逐项确认后再生成所有权和任务 DAG。
4. 在 S00 实现全局骨架代码，并为用户批准的主开发平台生成可启动空壳构建。
5. 选择一个代表性场景完成 G1 垂直切片。
6. G2 按场景执行小循环：全局视觉 → 低保真 Prefab/Scene 结构说明 → 用户确认 → 高保真游戏/UI 效果图 → 用户确认送审候选 → 三类独立审阅 → 效果图完整编号框选/分类 → 用户确认资产地图 → 按编号逐项独立生成与审查 → 正式结构化 Prefab/Scene/UXML/USS 拼装 → 删除运行时灰盒/占位并清理引用 → 清理验证 `PASS` → Unity Editor/Game View 验证；3D 场景按条件执行“模型与 UV 冻结 → PBR 纹理与烘焙 → Unity 串行接入”，随后完成音频、自动测试、静态预算和冻结。G2 前不得产生目标设备性能或实机结论。
7. G2 还必须为每个批准平台提交唯一平台适配报告。全部模块、场景、平台适配与全局回归通过后，G3 才能为每个批准平台生成一个与证据一一对应的候选主制品，并执行“各平台设备档位 × 全部批准场景”最终验收矩阵；每个用例绑定所属平台制品哈希，随后才可请求发布放行。

全局 Visual Bible 批准后，每个场景必须先提交低保真灰盒、层级树和 Prefab/Scene 结构说明，明确节点、父子层级、渲染顺序、交互状态、Anchor、Pivot、安全区、遮罩和资源占位 ID；UI Toolkit 同时说明 UXML/USS 与 UIDocument。用户确认结构后才能生成高保真效果图，用户确认效果图送审候选后再进行视觉一致性、Unity 可实现性、UX/可读性三类独立审阅。

审阅要求修改时，必须生成新的高保真版本并重新取得用户送审确认和三类审阅；三类审阅均通过后，才可在该同版本效果图上用稳定编号完整框选全部待生成单图，并将所有可见元素分类为独立图片、批准复用资源、文本、Unity 图元/程序绘制、UXML/USS/矢量、材质/VFX 或 3D 对象。编号、分类、结构节点映射、状态变体和导入规格组成资产地图；存在漏标、未分类或无节点映射时不得请求用户确认。用户确认资产地图后，才可按编号逐项独立生成或重绘并分别审查。

截图和高保真效果图只能参考内容、构图和信息层级，不能照搬色彩、材质、光照、字体、图标、笔触或成品像素。禁止裁切截图或效果图充当 Sprite、纹理或 UI 单图，禁止轻微修饰裁片后冒充独立生成资源，禁止把整张效果图作为游戏或 UI 铺底。开发阶段禁止 PSD、PSB、PSDT、Photoshop 分层文档和分层导出方案；只允许批准的独立成品复用，或使用独立扁平图片、独立遮罩与 Unity 原生结构重新生产。所有单图批准后，按已确认结构拼装正式 Prefab、Scene 或 UXML/USS；正式结构化拼装完成后，删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象并清理引用，同时保留已确认结构节点、稳定 ID 以及 `prefab-structure`、预览、批准记录等审计证据。清理验证为 `PASS` 后才能进入 `ASSEMBLY_VERIFIED` 或 `DONE`，再在 Unity Editor 中验证资源与节点双向映射、层级、Anchor、Pivot、遮罩、状态、黑边和目标分辨率矩阵。上游需要回退时从审计证据重建，不在运行时保留低保真资产。开发代理不能批准自己的输出，用户视觉批准与最终发布放行不可由代理替代。

2D 场景采用确定性适配：竖屏固定设计高度，横屏固定设计宽度；多出的左右或上下区域使用依据全局视觉生成的纯视觉背景填充。背景必须位于交互内容后方，不含 Collider、按钮、玩法信息或其他交互组件，目标分辨率矩阵不得出现黑边。移动端还必须处理安全区、刘海/挖孔、系统栏、旋转、触控、前后台与低内存；Windows 则独立处理窗口模式、DPI、键鼠/手柄和焦点变化。

当 Windows 是批准平台时，可从项目根目录运行 Windows 实机视觉入口；脚本只生成 `CAPTURED` 证据，不会伪造审查或用户批准。Android、iOS 与 iPadOS 必须从所属平台的已安装构建和真实设备/已批准等价设备采集证据，不能复用此脚本推断通过：

```powershell
uv run .\.agents\skills\unity-development-workflow\scripts\capture_windows_runtime.py --project-root . --g2-result Artifacts/Quality/quality-gates.g2.yaml --executable Artifacts/Builds/0.1.0/Game.exe --project-id my-game --scene-id scene.main --build-version 0.1.0 --source-revision a1b2c3d4 --project-state-version project-state-v1 --screenshot Artifacts/Visual/Runtime/scene.main/0.1.0.png --evidence Artifacts/Visual/Runtime/scene.main/0.1.0.json
```

## 初始化项目交付物

默认只创建项目配置、GDD、TDD 和控制面：

```powershell
python .\.agents\skills\unity-development-workflow\scripts\initialize_project_docs.py --project-root D:\Projects\my-game --project-id my-game
```

进入对应阶段后再创建可选文档：

```powershell
python .\.agents\skills\unity-development-workflow\scripts\initialize_project_docs.py --project-root D:\Projects\my-game --project-id my-game --include balance,assets,audio,qa,distribution,release
```

脚本默认拒绝覆盖已有文件；`--force` 只在用户明确要求覆盖时使用。

## 本地验证

Python 契约、DAG、锁、状态和端到端测试：

```powershell
uv run pytest -q
```

安装 Unity 6 并设置 `UNITY_PATH` 后运行 Toolkit EditMode 测试：

```powershell
& $env:UNITY_PATH -batchmode -nographics -quit -projectPath .\tests\UnityHost -runTests -testPlatform EditMode -testResults .\Artifacts\TestResults\all.xml
```

未实际运行 Unity 测试时只能报告 `NOT_RUN` 或 `BLOCKED`，不能根据静态检查推断通过。

本次已执行命令、结果和 Unity 环境阻塞见 [验证记录](docs/verification.md)。

## 并行边界

只读调查、候选图生成、测试设计和不重叠制品可以交给子代理并行。一个物理 Unity 项目的正式写入、共享配置和场景接线必须串行；开发与审查由不同代理承担。工作流不创建 Worktree，除非用户明确要求。
