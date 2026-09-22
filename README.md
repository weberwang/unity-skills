# Unity 游戏协作 Skills

面向 Unity 6、URP、UI Toolkit 与 [@Unity](plugin://unity@openai-curated-remote) 插件的阶段化开发工作流。`$unity-game-workflow-control` 是唯一全局控制面，`$unity-development-workflow` 负责 Unity 领域编排，其余 Skills 负责制作、架构、玩法、视觉、3D、音频、数值、QA 和发布。

## 流程模型

用户视图采用六阶段：

1. 需求与范围
2. 全局基线
3. 基础工程
4. 场景与弹窗生产
5. 全局集成验证
6. 发布

场景与瞬态弹窗分别使用 `V0 分流 → V1 对象定义 → V2 拆解确认 → V3 正式资源与组合验收 → V4 正式实现与运行验收`。场景只负责自身玩法、画面与常驻 HUD；modal、popup、drawer、toast 使用独立 `DISPLAY_LAYER` Work Item，`hostSceneId` 只绑定运行上下文。内部状态、动作风险、质量门、实施包与证据均由控制面维护：

- A0-A3：调查、规格、隔离原型与生产实现；当前用户任务提供执行边界。
- A4-A6：本地集成、外部状态/设备与发布。只有外部写入、付费、真机、破坏性删除、签名、上传和发布需要精确逐对象批准。
- F0-F4：范围流程、规格一致性、领域质量、工程验证与高影响操作批准。
- A3 前冻结 Implementation Package；失败优先 `repair`，候选未变时 `revalidate`，仅上游失效或范围真实变化时 `return`。

Unity 写入遵循原生约束：唯一 Editor 实例、编译/导入/域重载稳定、单写者、AssetDatabase、资源与 `.meta` 配对、GUID/Importer/序列化回读，以及 EditMode/PlayMode/构建证据。未经用户明确要求，不启动 Standalone/Player 或真机，不签名、上传或发布。

## 安装

需要 Node.js 22.20 或更高版本。在目标 Unity 项目根目录执行：

```powershell
npx -y github:weberwang/unity-skills
```

也可以显式指定项目目录：

```powershell
npx -y github:weberwang/unity-skills D:\Projects\my-game
```

安装器把十五个 Skills 复制到 `.agents/skills/`，默认拒绝覆盖同名目录；明确替换时使用 `--force`。已克隆仓库时可运行：

```powershell
node .\scripts\install-project-skills.mjs D:\Projects\my-game
```

## 使用控制面

项目控制记录建议保存在 `.workflow-control/`，与可再生成的 `Artifacts/` 分离：

```text
.workflow-control/
  work-items/
  implementation-packages/
  evidence/
  approvals/
  change-requests/
```

控制命令：

```powershell
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs status --repo . --work-item .\.workflow-control\work-items\current.json
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs check --repo . --work-item .\.workflow-control\work-items\current.json
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs run --repo . --work-item .\.workflow-control\work-items\current.json
```

`status` 和 `check` 只读；`run` 只推进已满足的安全控制状态，不执行 Unity 写入、测试、设备或发布动作，也不自动选择 `RETURN`。

项目文档仍由编排 Skill 的文件工具初始化：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs init-docs --project-root D:\Projects\my-game --project-id my-game
```

## @Unity 与 Toolkit

启用 [@Unity](plugin://unity@openai-curated-remote) 插件，并用其 Unity CLI 为目标项目安装 Pipeline 包，再复制 Toolkit：

```powershell
unity pipeline install --project-path D:\Projects\my-game
Copy-Item -Recurse .\.agents\skills\unity-development-workflow\assets\unity-workflow-toolkit\Packages\com.project.unity-workflow-toolkit .\Packages\com.project.unity-workflow-toolkit
```

先用 `unity status --format json` 确认目标 Editor，再用 `unity list --project-path <项目路径> --format json` 发现命令。Toolkit 通过 `com.unity.pipeline` 暴露项目验证、批准图片导入、固定机位取证和交付预检命令，由 `unity command <命令> --project-path <项目路径>` 调用。正式测试和构建分别使用 `unity test`、`unity build`；命令返回成功不能代替 AssetDatabase 回读、Console、EditMode/PlayMode、设备或发布证据。外部模型生成、上传参考图、付费供应商和 DCC 任意代码执行仍需独立批准。

## 角色

- `$unity-game-workflow-control`：全局状态、范围、风险门、实施包与证据。
- `$unity-development-workflow`：六阶段和 V0-V4 Unity 领域编排。
- `$unity-game-production`、`$unity-game-architecture`、`$unity-gameplay-development`：制作、架构与玩法。
- `$unity-game-visual-assets`、`$unity-game-3d-modeling`、`$unity-game-3d-texturing`、`$unity-game-spine-reskin`：视觉与资产生产。
- `$unity-game-audio`、`$unity-game-balance`：音频与数值。
- `$unity-game-qa-performance`、`$unity-game-release`：质量、性能、候选与发布。
- `$unity-game-grilling`：仅在事实无法消除且确需用户作实质取舍时提问和记录决定。

## 验证

```powershell
npm test
```

安装 Unity 6 并设置 `UNITY_PATH` 后，可运行 Toolkit EditMode 测试：

```powershell
& $env:UNITY_PATH -batchmode -nographics -quit -projectPath .\tests\UnityHost -runTests -testPlatform EditMode -testResults .\Artifacts\TestResults\all.xml
```

未实际运行 Unity 测试时只能报告 `NOT_RUN` 或 `BLOCKED`，不能从静态检查推断通过。
