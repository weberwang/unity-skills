# Unity 游戏协作 Skills

面向 Unity 6、URP、UI Toolkit、Windows 与 [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) 的全周期游戏开发工作流。入口是 `$unity-development-workflow`，覆盖立项、全局视觉、S00 全局骨架、垂直切片、逐场景制作、效果图生成与拆分、音频/数值、测试性能和 Windows 候选交付。

## 工作通道

- 快速通道：批准范围内的局部低风险任务，直接实现和验证。
- 标准通道：新模块、跨模块、场景、存档、数值、资源、音频或性能任务，只调度受影响角色。
- 发布通道：涉及发行、隐私、商业能力、权属或候选包，执行 G0 至 G3 完整门禁。

## 安装 Skills

需要 Node.js 22.20 或更高版本。在目标 Unity 项目根目录执行一条命令，即可把总控与八个角色 Skill 复制到项目的 `.agents/skills/`：

```powershell
npx -y github:weberwang/unity-skills
```

也可以在任意目录显式指定目标项目：

```powershell
npx -y github:weberwang/unity-skills D:\Projects\my-game
```

安装器直接复制本次 npx 下载包内的全部九个 Skills，确保安装内容与入口来自同一提交，不依赖本仓库的本地路径。`-y` 仅跳过 npx 的下载执行确认；安装器默认拒绝覆盖项目中已有的同名 Skill。执行前可只读检查远端内容：

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

打开 Unity 后使用 `Window → MCP for Unity → Configure All Detected Clients` 建立连接。工作流会读取 `mcpforunity://instances`，按项目路径选择 `Name@hash` 并调用 `set_active_instance`；UI、测试、Profiler 等工具组只在需要时激活。

Toolkit 不复制 `unity-mcp`，也不代替官方 `manage_build`。它只提供项目校验、2D 画面适配、批准图片导入、固定机位视觉取证和交付预检等短操作。

## 角色 Skills

- `$unity-development-workflow`：总控、路由、质量门和用户批准。
- `$unity-game-production`：制作策划、范围、验收和变更控制。
- `$unity-game-architecture`：模块、生命周期、存档、构建和 S00 骨架。
- `$unity-gameplay-development`：玩法、场景、交互与状态实现。
- `$unity-game-balance`：难度、经济、成长和参数验证。
- `$unity-game-visual-assets`：全局视觉确认、游戏/UI 效果图、风格重生、拆分、导入与实机迭代。
- `$unity-game-audio`：音乐、音效、混音、授权和接入。
- `$unity-game-qa-performance`：EditMode/PlayMode、场景、Profiler 和候选验证。
- `$unity-game-release`：Windows 构建、许可、发行资料和交付放行。

## 主流程

1. G0 明确最小范围、核心循环和 Windows 发行方式；先生成并由用户确认全局 Visual Bible。
2. 项目只读发现并绑定唯一 Unity MCP 实例。
3. 在创建模块、场景、目录或程序集前完成拆分拷问，向用户展示模块、场景、共享能力及恢复方案，并等待逐项确认后再生成所有权和任务 DAG。
4. 在 S00 实现全局骨架代码和可启动 Windows 空壳构建。
5. 选择一个代表性场景完成 G1 垂直切片。
6. G2 按场景执行小循环：灰盒、基于全局视觉重绘游戏效果图、正式资源拆分、玩法/资源、UI 效果图/UI Toolkit、2D 多比例适配、音频、实机对比、独立审查、用户批准、测试性能、冻结。
7. 全部场景冻结后执行全局回归，G3 生成与证据一一对应的 Windows 候选包。

先完成全局视觉设计、三类独立审查和用户确认，再开始场景效果图与正式美术资源。截图只能参考内容、构图和信息层级，不能照搬色彩、材质、光照、字体、图标或笔触；正式素材必须依据已批准 Visual Bible 重新生成，再完成稳定 ID 登记、拆分前审查、拆分、逐项审查、Unity 导入与场景验证、权属记录。开发代理不能批准自己的输出，用户视觉批准与最终发布放行不可由代理替代。

2D 场景采用确定性适配：竖屏固定设计高度，横屏固定设计宽度；多出的左右或上下区域使用依据全局视觉生成的纯视觉背景填充。背景必须位于交互内容后方，不含 Collider、按钮、玩法信息或其他交互组件，目标分辨率矩阵不得出现黑边。

Windows 构建完成后，可从项目根目录运行实机视觉入口；脚本只生成 `CAPTURED` 证据，不会伪造审查或用户批准：

```powershell
uv run .\.agents\skills\unity-development-workflow\scripts\capture_windows_runtime.py --project-root . --executable Artifacts/Builds/0.1.0/Game.exe --project-id my-game --scene-id scene.main --build-version 0.1.0 --source-revision a1b2c3d4 --screenshot Artifacts/Visual/Runtime/scene.main/0.1.0.png --evidence Artifacts/Visual/Runtime/scene.main/0.1.0.json
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
