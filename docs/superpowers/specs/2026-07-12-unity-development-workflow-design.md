# Unity 项目开发工作流设计

## 1. 目标

本项目交付一个可直接安装使用的 Codex Unity 工作流 Skill，以及一个依赖 `CoplayDev/unity-mcp` 的 Unity Workflow Toolkit 配套 UPM 包。工作流覆盖需求设计、全局视觉确认、全局骨架实现、按场景迭代、自动出图、Unity 集成、质量验收、Windows 构建和交付。

工作流的核心目标是把自然语言需求转化为可追踪、可并行、可验证和可恢复的 Unity 生产流程：

```text
设计意图
  → 模块和任务契约
  → 子代理并行执行
  → Unity 串行集成
  → 自动验证与独立审查
  → 用户确认
  → 可复现构建与交付证据
```

## 2. 首版范围

- Unity 基线：Unity 6。
- 渲染管线：URP。
- 交付平台：Windows 桌面端。
- MCP 基础设施：`CoplayDev/unity-mcp`。
- 自动出图：Codex 内置 ImageGen，预留生成器适配接口。
- UI 实现：UI Toolkit。
- 交付内容：Codex Skill、任务 Schema 与模板、Unity Workflow Toolkit UPM 包、Editor 测试和工作流文档。
- 不附带示例游戏项目。

## 3. 非目标

首版不包含：

- Unity 2021.3、Unity 2022 LTS 或 Built-in/HDRP 兼容层。
- Android、iOS、WebGL 或主机平台构建。
- 常驻工作流服务、数据库或分布式锁服务。
- 自动发布到商店或生产环境。
- 完整 DCC、3D 模型生成或骨骼动画生产管线。
- 用生成图片替代可维护的 UI Toolkit 结构。
- 自动批准视觉效果、删除正式资产或覆盖现有 `.meta`。

## 4. 总体架构

系统由三层组成：

```text
Codex Workflow Skill
  ├─ 需求分析、模块拆分和任务 DAG
  ├─ 子代理调度、资源锁和审批
  ├─ 自动出图与视觉审查循环
  └─ 质量门禁与交付编排
             │
             ▼
CoplayDev/unity-mcp
  ├─ Unity 实例发现与路由
  ├─ 场景、Prefab、资源与脚本操作
  ├─ Console、测试、Profiler
  └─ 构建控制与自定义工具入口
             │
             ▼
Unity Workflow Toolkit
  ├─ Manifest 和报告
  ├─ 图片导入与 Importer 配置
  ├─ 项目和资产校验
  ├─ 视觉取证
  └─ Windows 构建门禁
```

### 4.1 Codex Skill 职责

| 模块 | 职责 | Unity 写权限 |
|---|---|---|
| `discovery` | 检查版本、URP、包、目录、MCP 实例和项目状态 | 只读 |
| `design` | 生成设计说明、场景清单和验收标准 | 无 |
| `module-planner` | 生成模块边界、所有权和依赖 DAG | 无 |
| `task-orchestrator` | 创建任务、调度子代理、维护状态和资源锁 | 无 |
| `unity-executor` | 通过 `unity-mcp` 执行限定范围的 Unity 变更 | 有限写入 |
| `image-pipeline` | 生成图片任务、候选图、审查和版本记录 | 仅生成区 |
| `integration` | 接入正式资源、Prefab、UI 和场景 | 串行写入 |
| `quality-gates` | 编译、Console、测试、视觉和性能检查 | 原则上只读 |
| `delivery` | Windows 构建、制品和发布资料 | 构建权限 |
| `evidence` | 汇总日志、截图、报告和哈希 | 无 |

### 4.2 Unity Workflow Toolkit 职责

Toolkit 是独立 UPM 包，不复制或修改 `unity-mcp`。它通过 `unity-mcp` 的通用工具或自定义工具扩展入口被调用。

```text
Packages/com.project.unity-workflow-toolkit/
├─ Editor/
│  ├─ Core/
│  │  ├─ Manifest/
│  │  ├─ Paths/
│  │  └─ Reporting/
│  ├─ ImagePipeline/
│  │  ├─ Import/
│  │  ├─ Validation/
│  │  └─ Metadata/
│  ├─ ProjectValidation/
│  ├─ VisualQA/
│  ├─ BuildPipeline/
│  └─ McpTools/
├─ Tests/
│  └─ Editor/
└─ package.json
```

依赖方向固定为：

```text
McpTools ───────┐
VisualQA ───────┤
ImagePipeline ──┼──→ Core
Validation ─────┤
BuildPipeline ──┘
```

业务模块不得依赖 `McpTools`，保证核心能力可以脱离 MCP 执行 EditMode 测试。

## 5. 项目模块拆分

工作流处理实际 Unity 项目时，默认划分以下模块：

1. `Foundation`：项目设置、URP、输入、包依赖和启动流程。
2. `Shared`：通用类型、事件、工具和基础组件。
3. `Gameplay`：按玩法功能继续拆分，例如 Player、Combat、Inventory。
4. `Presentation`：UI、摄像机、动画、音频和 VFX。
5. `Content`：场景、关卡、配置数据和正式美术资源。
6. `QA`：测试、验证规则、测试夹具和质量报告。
7. `Delivery`：构建配置、版本、制品和发布材料。

模块必须声明允许修改的目录、场景、Prefab、依赖和公共接口。同一文件或 Unity 资源只能由一个任务持有写锁。禁止跨模块直接引用对方的 Editor 实现。

## 6. 总体阶段

```text
需求与项目范围确认
  ├─ 全局视觉探索与确认
  └─ 全局技术架构与模块边界确认
             ↓
S00 Foundation：全局骨架实现
             ↓
S01 场景小循环
             ↓
S02 场景小循环
             ↓
更多场景小循环
             ↓
全局回归、Windows 构建与交付
```

## 7. S00 Foundation 全局骨架

全局骨架在全局设计确认后、第一个正式场景循环前实现。

### 7.1 实现内容

- Unity 6 + URP 项目基线。
- 包依赖、目录结构和 Assembly Definition。
- Bootstrap 启动场景。
- 场景加载与切换框架。
- 全局游戏状态接口。
- 输入抽象。
- 配置与 ScriptableObject 基础约定。
- 日志、错误报告和开发模式开关。
- 通用事件或消息接口。
- 测试程序集和基础测试工具。
- Windows 构建配置。
- `unity-mcp` 连接与实例检查。
- Toolkit 安装和配置。
- 图片任务、导入、视觉取证和质量报告基础能力。

具体玩法系统不得提前进入骨架，除非需求已经确认至少两个场景共同依赖该能力。

### 7.2 执行方式

Toolkit Core、图片任务 Schema、导入模块、校验器、构建管线和测试基础设施可以由子代理并行实现。Package Manager、ProjectSettings、URP、Bootstrap、程序集最终接线、全量编译和集成验证必须串行。

### 7.3 完成门禁

- Bootstrap 可以启动。
- 场景切换框架可用。
- 所有程序集编译通过且无循环依赖。
- Console 没有新增错误。
- 基础 EditMode 测试通过。
- Windows 空壳构建成功。
- 图片任务能进入暂存区并生成 Manifest。
- Toolkit 能完成测试图片导入和固定机位截图。
- 子代理任务锁和交付报告格式验证通过。

## 8. 全局视觉确认

全局视觉确认是所有正式场景效果图的前置门禁。

### 8.1 输入

- 游戏类型、核心体验和目标用户。
- 世界观、时代背景和情绪关键词。
- 摄像机视角和空间尺度。
- 角色、敌人、交互物与环境比例。
- 色彩、光照、天气、材质和表面语言。
- UI 视觉语言。
- 必须避免的风格和内容。

### 8.2 视觉探索产物

首轮提供两到三个有明确差异的视觉方向。每个方向分别生成清晰的独立图片：

1. 世界与环境关键帧。
2. 典型游戏视角效果图。
3. 角色、道具和环境比例参考。
4. 材质、光照和色彩参考。
5. UI 主界面风格效果图。
6. HUD 与游戏画面结合效果图。

独立图片生成完成后再制作联系表，不使用一张低分辨率拼图替代各项正式参考。

### 8.3 审查和确认

三个只读子代理并行审查：

- 美术一致性代理：色彩、材质、光照和风格统一性。
- 游戏可读性代理：角色、敌人、交互物和背景区分度。
- 技术可行性代理：Unity 6 URP 实现成本和性能风险。

主代理合并为单一修改清单，效果图按清单定向修改。只有用户可以批准全局视觉基线。批准后生成：

- `ArtDirection.md`
- `visual-bible.yaml`
- `global-palette.json`
- `lighting-reference.yaml`
- `ui-visual-language.yaml`

后续场景必须以这些文件为强制输入。改变全局风格必须建立基线变更任务并重新评估已确认场景。

## 9. 按场景划分的小循环

场景是最小可展示、可测试、可确认和可交付单元。同一时间只有一个场景处于最终验收阶段。

```text
选择场景
  → 场景需求与验收标准
  → 模块和任务拆分
  → Unity 灰盒与固定机位
  → 游戏效果图审查修改循环
  → 用户确认游戏效果图
  → 场景功能与美术实现
  → UI 效果图审查修改循环
  → 用户确认 UI 效果图
  → UI Toolkit 实现
  → Unity 实机截图
  → 效果图与实机对比
  → 修改 Unity 实现
  → 测试与性能门禁
  → 用户确认场景
  → 冻结场景基线
```

### 9.1 场景目录

```text
Scenes/
└─ <scene-id>/
   ├─ scene-manifest.yaml
   ├─ design/
   ├─ visual/
   │  ├─ gameplay/
   │  ├─ ui/
   │  └─ reviews/
   ├─ tasks/
   ├─ captures/
   ├─ tests/
   └─ delivery/
```

### 9.2 游戏效果图循环

```text
灰盒截图
  → 多候选生成
  → 美术一致性审查
  → 玩法可读性审查
  → URP 可实现性审查
  → 汇总修改意见
  → 单目标定向修改
  → 用户确认
```

效果图必须使用实际游戏摄像机和灰盒空间关系。已有灰盒截图时，保持摄像机、主要空间、玩法区域、角色位置和交互物位置，仅调整材质、光照、环境和视觉表现。

### 9.3 游戏实现循环

独立模块由子代理并行实现，集成代理串行接入正式场景。Unity 实现完成后使用固定机位截图，由审查代理比较构图、空间、色彩、曝光、光照、材质、可读性和 URP 后处理。原则上修改 Unity 实现以匹配已确认效果图；确实不可实现时必须请求用户变更视觉目标。

### 9.4 UI 小循环

```text
场景状态
  → 信息架构和线框
  → 用户确认交互结构
  → UI 视觉效果图
  → UX 与视觉审查
  → 定向修改
  → 用户确认效果图
  → UI Toolkit 实现
  → Game View 截图
  → 对比和修改
  → 用户确认实机 UI
```

ImageGen 产物是视觉目标，不作为完整 UI 贴图。按钮、文字、布局和交互必须由 UI Toolkit 实现。

### 9.5 场景冻结门禁

- 游戏效果图和 UI 效果图均由用户确认。
- Unity 实现与效果图差异在批准范围内。
- 没有新增编译错误和 Console 错误。
- EditMode、PlayMode 和场景冒烟测试通过。
- 场景性能符合预算。
- 缺失引用检查通过。
- 实机截图和审查报告齐全。
- 用户确认 Unity 内最终效果。

冻结后输出场景交付 Manifest、批准的效果图、Unity 实机截图、视觉差异报告、测试报告和性能报告。

## 10. 子代理编排

主代理只负责需求理解、DAG、任务契约、资源锁、审查调度、集成门禁和交付汇总。实际设计、编码、资源准备、测试、审查和文档任务尽量交给子代理执行。

### 10.1 角色

| 角色 | 产物 | 权限 |
|---|---|---|
| 设计代理 | 设计说明和验收标准 | 无 Unity 写权限 |
| 模块规划代理 | 模块 Manifest 和 DAG | 无 Unity 写权限 |
| 开发代理 | 限定模块的代码或资源 | 限定路径 |
| 出图代理 | 候选图和生成元数据 | 仅生成区 |
| Unity 导入代理 | 正式图片和 Importer 设置 | 串行授权 |
| 测试代理 | 测试代码和报告 | 测试目录 |
| 审查代理 | 代码、视觉和资源审查 | 只读 |
| 集成代理 | Prefab、UI、场景和跨模块接线 | 串行授权 |
| 性能代理 | Profiler 报告 | 原则上只读 |
| 交付代理 | 构建和交付资料 | 构建权限 |

### 10.2 并发等级

- `L0` 完全并行：设计、规划、Prompt、测试设计、审查和文档。
- `L1` 隔离并行：独立 Git worktree、Unity 项目目录和 Unity 实例中的代码、Prefab、资源和测试任务。
- `L2` 项目串行：AssetDatabase、Importer、Package Manager、ProjectSettings、正式场景、PlayMode、平台切换和构建。

### 10.3 锁类型

- `path`
- `scene`
- `prefab`
- `project_settings`
- `package_manager`
- `asset_database`
- `unity_instance`
- `build_target`

读锁可以共享，写锁排他。父目录写锁覆盖子路径。场景和 Prefab 锁同时覆盖对应 `.meta`。代理完成、失败、取消或超时后必须释放锁。

### 10.4 生命周期

```text
BLOCKED
  → READY
  → ASSIGNED
  → RUNNING
  → SELF_VERIFIED
  → REVIEWING
  → APPROVED
  → INTEGRATED
  → VERIFIED
  → DONE
```

异常状态包括 `RETRYABLE_FAILED`、`REJECTED`、`CONFLICTED`、`BLOCKED` 和 `CANCELLED`。开发代理最多提交至 `SELF_VERIFIED`，不得自行把任务标记为完成。

### 10.5 重试规则

MCP 临时断连、Domain Reload、编译或导入进行中、异步测试等待和临时文件占用允许最多自动重试两次。编译错误、断言失败、修改越界、视觉不符、正式资产覆盖和配置不明确禁止自动重试，必须返回主代理重新规划。

## 11. 自动出图流程

### 11.1 目录隔离

```text
ArtSource/Generated/<task-id>/
├─ brief/
├─ references/
├─ candidates/
├─ selected/
├─ processed/
└─ manifest.json

Assets/Game/Art/Generated/<module>/

Artifacts/VisualQA/<task-id>/
├─ contact-sheet.png
├─ unity-capture.png
├─ comparison.png
└─ report.json
```

生成区保存原稿、候选、Prompt、参考图来源和生成元数据。正式资产区只接受批准并完成转换的图片。证据区不作为运行时依赖。

### 11.2 支持范围

支持概念图、背景、加载图、宣传插画、卡牌或物品插画、简单 Sprite、材质视觉参考、UI 风格稿和界面背景。

不把严格矢量图标、大量精确文字 UI、物理准确技术贴图、高一致性序列帧和版权不明衍生资产作为自动化正式产物。

### 11.3 流程

```text
场景视觉任务
  → image-task.yaml
  → Prompt 编译
  → 独立候选并行生成
  → 技术检查
  → 联系表和独立审查
  → 用户批准
  → 转换和版本化
  → Unity 导入队列
  → Importer 配置
  → 场景、Prefab 或 UI 接入
  → 固定机位截图
  → 视觉差异审查
  → 用户确认
```

### 11.4 ImageGen 规则

- 默认使用 Codex 内置 ImageGen。
- 不把默认生成目录作为项目正式引用位置。
- 每个独立资产或候选使用独立生成调用。
- 图片编辑默认保存新版本。
- 每次返修只改变一个明确问题，并声明保持不变的内容。
- 未经批准不得覆盖正式资产。

简单不透明主体可以使用纯色背景生成和本地 Chroma Key 移除。毛发、烟雾、玻璃、液体等复杂透明内容不能自动降级到需要 API Key 的其他模型，必须由用户显式授权。

### 11.5 审查循环

```text
DRAFT
  → AGENT_REVIEW
  → REVISION_REQUIRED
  → REVISED
  → USER_REVIEW
  → APPROVED
```

子代理分别审查美术一致性、游戏可读性和技术可行性。主代理将意见合并成单一修改清单，避免不同代理同时修改同一图片。所有版本、审查报告和批准记录必须保留。

## 12. 数据契约

首版包含：

- `project-profile.yaml`：Unity、URP、Windows 和项目约束。
- `module-manifest.yaml`：模块目录、所有权、依赖和公共接口。
- `task-contract.yaml`：子代理输入、依赖、锁、权限、验收和输出。
- `scene-manifest.yaml`：场景目标、状态、资源、任务和门禁。
- `image-task.yaml`：图片简报、参考图、候选、导入配置和审批状态。
- `visual-bible.yaml`：全局风格、色彩、光照、材质、构图和 UI 语言。
- `quality-report.json`：编译、Console、测试、视觉和性能结果。
- `delivery-manifest.json`：版本、构建产物、哈希和交付证据。

所有契约必须提供 JSON Schema 或等价的机器校验规则。禁止使用未定义自由文本代替关键状态、锁、路径或验收结果。

## 13. 质量门禁

### 13.1 静态门禁

- Schema 校验通过。
- 路径、命名和模块所有权正确。
- `.meta` 和 GUID 保持稳定。
- 不存在越界修改、缺失引用和禁止依赖。

### 13.2 编译门禁

- Unity 刷新完成。
- 脚本编译完成。
- 没有新增 Error。
- 新增 Warning 必须在报告中解释并获得批准。

### 13.3 测试门禁

- Toolkit EditMode 测试。
- 项目 EditMode 测试。
- PlayMode 测试。
- 当前场景冒烟测试。
- Windows 构建后启动检查。

### 13.4 视觉门禁

- 全局 Visual Bible 一致性。
- 游戏可读性。
- UI 层级、文字和安全区。
- 效果图与实机截图差异。
- 用户最终确认。

### 13.5 性能门禁

每个项目通过 `project-profile.yaml` 定义帧率、CPU、GPU、内存、GC、Draw Call、纹理内存、包体和加载时间预算。场景冻结和最终交付均必须检查对应预算。

## 14. Windows 构建与交付

交付代理在全局回归通过后执行：

1. 验证构建场景、URP 配置、Scripting Define 和版本号。
2. 执行完整 EditMode、PlayMode 和场景冒烟测试。
3. 执行性能预算检查。
4. 生成 Windows 构建。
5. 启动构建产物并执行基本检查。
6. 计算文件哈希。
7. 生成测试、性能、视觉和构建报告。
8. 生成版本说明、已知问题和回滚信息。
9. 等待用户最终交付批准。

正式签名、上传、发布、删除旧制品和覆盖稳定版本均需要单独授权。

## 15. 证据与可追踪性

每个子代理任务必须输出：

- 任务状态。
- 变更文件清单。
- 使用的 Unity 实例。
- Console 增量错误。
- 测试命令与结果。
- 生成或修改的资产。
- 截图或其他证据。
- 偏离任务契约的内容。
- 剩余风险。
- 建议的下一任务。

每个视觉任务保留生成 Prompt、参考图角色、模型路径、候选版本、审查意见、批准记录、文件哈希、Unity Importer 配置和实机截图。

## 16. 安全边界

以下操作必须显式审批：

- 删除、移动或覆盖正式资源。
- 删除或重建 `.meta`。
- 修改 ProjectSettings。
- 安装、删除或升级 Package。
- 执行任意 C#。
- 切换或修改正式构建配置。
- 使用外部 API Key。
- 读取签名密钥。
- 正式签名、上传和发布。

所有代理必须遵循任务契约的路径、Unity 实例和工具权限，禁止自行扩大范围。

## 17. 成功标准

首版工作流完成后应满足：

- Codex 能从项目简报生成合法的项目、模块、场景和任务契约。
- 无依赖任务能够分发给子代理并行执行。
- 同一 Unity 资源不会发生并发写入。
- Toolkit 能通过 `unity-mcp` 执行图片导入、校验、截图和构建前检查。
- 全局视觉、场景效果图、UI 效果图和实机画面均有审查修改循环与用户门禁。
- S00 全局骨架必须在第一个场景前通过编译、测试和空壳构建。
- 每个场景能独立冻结并生成完整交付证据。
- 干净工作区能够按照同一契约复现 Windows 构建及其报告。
