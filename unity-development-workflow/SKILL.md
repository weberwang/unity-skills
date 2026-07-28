---
name: unity-development-workflow
description: 面向 Unity 6、URP、UI Toolkit、Windows 与 CoplayDev/unity-mcp 的游戏全周期总控。需要从立项、全局视觉、拆分前拷问和用户确认、模块/场景边界、技术骨架、垂直切片、逐场景制作、资源拆分、测试性能推进到可交付 Windows 候选包，或需要协调制作、架构、玩法、数值、美术、音频、测试与发布角色时使用。
---

# Unity 游戏开发总控

把角色交付物收敛为可玩、可构建、可测试、可审计的 Windows 游戏。用户始终决定范围、视觉方向、风险、指标与发布放行；代理不得把未知项视为批准。

## 启动与按需读取

1. 每次开始或恢复先读[工作流总览](references/workflow-overview.md)，判断快速、标准或发布通道。
2. 标准或发布通道的新项目若缺少 `docs/project-profile.yaml`，运行 `scripts/initialize_project_docs.py --project-root <项目根目录> --project-id <项目ID>`。默认不覆盖已有文档；只有用户明确要求时使用 `--force`。
3. 只读发现阶段读[项目发现](references/project-discovery.md)；需要人工取舍或处理变更时读[决策与变更控制](references/decision-change-control.md)。
4. 划分模块与场景时读[模块与场景拆分](references/module-planning.md)，完成 13 项拆分前拷问并取得用户对当前版本的确认；未确认不得创建拆分产物或进入 S00/G1/G2。多任务、锁或子代理调度时读[多代理执行](references/multi-agent-execution.md)；只有用户明确要求 Worktree 时才读[Worktree 工作区隔离](references/worktree-integration.md)。
5. 建立全局骨架和首个垂直切片时分别读[S00 基础工作流](references/foundation-workflow.md)与[游戏实现闭环](references/game-implementation.md)。
6. 每个场景读[场景小循环](references/scene-loop.md)；2D 场景同时读[2D 场景屏幕适配](references/scene-2d-adaptation.md)。开始任何场景效果图或正式美术资源前，先按[视觉工作流](references/visual-workflow.md)完成全局视觉设计、三类独立审查和用户确认；效果图拆分、资源重新生成或正式导入读[资源流水线](references/asset-pipeline.md)。
7. 进入质量门、全局回归或候选包验证时读[质量门禁](references/quality-gates.md)；准备 Windows 制品时读[交付](references/delivery.md)；创建或维护项目文档时读[项目交付物](references/project-artifacts.md)。

不要一次读取全部参考。快速通道优先读任务直接相关的代码、配置、资源和测试。

## 工作通道

- **快速通道**：批准范围内、局部、低风险、可回退的任务。明确验收后直接实现和验证，不强制角色编排、控制面或 G0 至 G3；除非用户明确要求，否则禁止创建 Worktree。
- **标准通道**：新模块、跨模块或影响架构、场景、存档、数值、资源、音频、性能的任务。只调度受影响角色，只维护受影响交付物。
- **发布通道**：影响发行渠道、隐私、商业能力、资源权属、候选包或发布放行的任务。执行完整质量门和发布证据链。

影响扩大时升级通道；影响缩小时停止维护无关交付物，不为流程形式保留重通道。

## 角色路由

采用子代理优先：将可独立任务交给子代理，主代理保留编排、证据链、冲突处理、质量门和用户沟通：

- `$unity-game-production`：范围、GDD、验收与变更影响。
- `$unity-game-architecture`：Unity 模块、生命周期、存档、构建与平台边界。
- `$unity-gameplay-development`：可测试的玩法、场景、交互和状态。
- `$unity-game-balance`：难度、经济、成长和参数验证。
- `$unity-game-visual-assets`：全局视觉、游戏/UI 效果图、拆图、导入、授权与实机回路。
- `$unity-game-audio`：音乐、音效、混音、授权与接入。
- `$unity-game-qa-performance`：测试、设备、Profiler、缺陷和候选验证。
- `$unity-game-release`：Windows 构建、发行资料、合规与交付。

标准、发布通道只调度受影响角色。开发者不能批准自己的输出；视觉一致性、Unity 可实现性、UX/可读性审查与用户批准必须分离。

## G0 至 G3

| 阶段 | 核心结果 | 收敛条件 |
| --- | --- | --- |
| G0 立项 | 最小范围、核心循环、模块/场景拆分、首发 Windows 发行方式、技术与视觉方向 | 用户批准范围、当前版本 `decomposition-plan` 和全局 Visual Bible；可选能力默认关闭 |
| G1 垂直切片 | S00 后完成一个端到端可玩场景 | 干净环境可编译构建；正式资源可追溯；游戏/UI/实机视觉均通过独立审查和用户批准 |
| G2 制作 | 按场景小循环完成并冻结全部批准范围 | 无未批准占位资源；全局回归、性能与 P0/P1 处置有证据 |
| G3 交付 | 生成与证据一一对应的 Windows 候选包 | 制品、许可、说明、风险和回滚齐备，并获得用户放行 |

快速通道不要求通过 G0 至 G3。批准后若变更影响已通过门禁，将该门标记为待复核，只重跑受影响项及其下游。

## Unity MCP 与写入约束

- 只面向 Unity 6、URP、UI Toolkit 和 Windows；其他平台必须另行扩展并批准。
- 写入前读取 `mcpforunity://instances`，按项目路径选择唯一 `Name@hash`，调用 `set_active_instance` 显式绑定；多实例不猜测。
- 仅激活当期需要的工具组：核心默认可用，UI、testing、profiling、animation、vfx、probuilder、scripting_ext 按需通过 `manage_tools` 激活。
- 写入前读取 `mcpforunity://editor/state`；编译、导入、域重载、PlayMode、未保存场景、陈旧连接或阻塞对话框存在时不得写入。Unity 正式写入和共享状态写入必须串行；只读分析、候选生成与不重叠的非 Unity 制品可并行。
- 截图只允许说明内容、构图和信息层级，不能成为色彩、材质、光照、字体、图标或笔触的风格来源。正式资源必须依据已批准 Visual Bible 重新生成，再经过拆分前审查、拆分、逐项审查和 Unity 导入/运行验证；禁止裁切截图充当资源。
- Git 只用于普通版本控制，不属于质量门。除非用户明确要求，否则禁止创建 Worktree；即使已获授权，也不得自动合并、删除 Worktree、删除分支、签名、上传或覆盖稳定制品。

## CLI 索引

在 Skill 根目录运行；非零退出码即失败证据：

```powershell
uv run scripts/workflow.py validate --kind project-profile --source templates/project-profile.yaml
uv run scripts/workflow.py validate --kind decomposition-plan --source templates/decomposition-plan.yaml
uv run scripts/workflow.py compile --project-root D:/Projects/my-game --kind scene-manifest --source D:/Projects/my-game/Artifacts/scene.yaml --output D:/Projects/my-game/Artifacts/scene.json
uv run scripts/workflow.py ready --tasks artifacts/tasks.yaml --state artifacts/state.json
uv run scripts/workflow.py lock --file artifacts/locks.json acquire --task S01 --request scene:write:Assets/Scenes/S01.unity
uv run scripts/workflow.py transition --file artifacts/state.json --task S01 --to READY --actor orchestrator --evidence artifacts/S01/readiness.json
uv run scripts/workflow.py gate evaluate --config artifacts/quality-gates.yaml --gate G1 --project-root D:\Projects\my-game --project-id my-game --source-revision abc1234 --build-version 0.1.0-dev.1 --output artifacts/quality-gates.evaluated.yaml
uv run scripts/workflow.py asset merge-records --project-root D:\Projects\my-game --records Artifacts/AssetRegistry/records --register docs/asset-register.yaml
```

先校验契约，再编译机器产物。任务执行前检查 `ready` 与锁；只有目标状态所需证据真实存在时才迁移状态。`gate evaluate` 递归检查项目内路径、Schema、主体、版本和 SHA-256，并原子输出门禁结果。资源导入代理只写不可变 registration record；集成代理以 `asset merge-records` 单写总登记，且不得自动批准许可证。未运行的检查使用 `NOT_RUN`，环境或权限缺失使用 `BLOCKED`，不得推断 `PASS`。
