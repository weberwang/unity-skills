# 验证记录

## 本次验证范围

本记录更新于 2026-08-15，覆盖总控与角色 Skills、严格默认拒绝策略、不可跳关质量门、开发阶段禁止 PSD/PSB/PSDT 与分层导出、G1/G2 禁止设备验证、G2 `DEVELOPMENT_COMPLETE`、G3 独占候选设备视觉与性能验证、Windows/Android/iOS/iPadOS 独立适配、模块与场景小循环、全局视觉、P0-P5、低保真清理、2D/3D 资源流程、YAML/JSON Schema、Node.js 校验工具、npx 安装器和 Unity Workflow Toolkit。

## 已实际通过

### Node.js 全量测试

命令：

```powershell
rtk npm test
```

结果：Node.js `node:test` 测试通过。覆盖全部可安装 Skill 的 `unity-` 命名空间约束、`$unity-game-build-player-character` 命名、玩家角色专项资源名、项目基线 Schema、固定检查/视觉区域/状态矩阵、全绑定重算与漂移阻断，以及既有契约、资源、2D/3D、P0-P5、低保真清理、并发锁和 Toolkit 静态结构测试。

### npx 安装入口

已执行 `node .\scripts\install-project-skills.mjs --help`，确认帮助信息提供 `npx -y github:weberwang/unity-skills` 最短命令。随后执行 `npm pack --dry-run --json`，确认包内包含总控、十一个角色与一个 Star Blogger 项目专项 Skill 的参考文档和代理配置；安装器测试确认 `.agents/skills/` 下精确生成十三个 Skill，且安装内容逐文件来自当前包而不是再次拉取远端默认分支。

另将双进程竞争同一场景锁的测试连续执行 20 次，结果 `20/20` 通过；此前审查代理修复后也完成过 `30/30` 压力验证。

### Skill 入口校验

Node.js 测试会检查总控、角色 Skill 的入口、frontmatter、参考文档和代理配置；不依赖外部 Python 校验器。

### Toolkit 静态校验

命令：

```powershell
rtk node --test tests/node/toolkit-structure.test.mjs
```

结果：Node.js Toolkit 静态测试通过。已确认模块/测试文件齐备、asmdef 可解析且名称唯一、UnityHost 固定 unity-mcp v10.1.0、四个自定义工具名称准确、C# 文件均小于 1000 行且类型/方法具备中文 XML 摘要，并覆盖 Toolkit 安全约束的静态结构。

### MCP API 基线核对

已按 CoplayDev/unity-mcp 当前稳定接口核对 `McpForUnityToolAttribute`、`HandleCommand(JObject)`、`SuccessResponse`、`ErrorResponse`、工具发现、`asset_gen.generate_model`、`import_model_file`、`manage_texture`、`manage_material` 与 asmdef 引用，并在 UnityHost 固定 `v10.1.0`。Toolkit 的正式构建仍调用官方 `manage_build`，没有复制该插件实现；精确 UV 与烘焙所需的第三方 DCC MCP 不由本仓库自动安装或授权。

## 环境阻塞

- 本次验证发现已有 Unity Editor 进程，但未确认其中任何实例绑定当前 `tests/UnityHost`；按单实例与项目归属规则，没有复用或启动 Editor，也没有实际执行 Toolkit 编译、EditMode 测试、自定义工具发现、图片导入或固定机位截图。
- 当前环境没有执行 Android 安装测试，也没有验证 iOS/iPadOS 所需的 macOS、Xcode、证书、IPA 与真机链路；这些平台只能保持 `BLOCKED`，不能由静态测试推断为通过。
- 验证前检查了现有进程；由于没有可证明属于测试宿主的可复用实例，因此未启动新的 Editor 或服务。

上述项目状态为 `BLOCKED`，不能由 Node.js 或静态检查推断为 `PASS`。

## 获得 Unity 环境后的复验

设置 Unity 6 可执行文件路径后运行：

```powershell
& $env:UNITY_PATH -batchmode -nographics -quit -projectPath .\tests\UnityHost -runTests -testPlatform EditMode -testResults .\Artifacts\TestResults\all.xml
```

还必须在已打开的测试项目中完成：

1. 读取 `mcpforunity://instances` 并显式绑定测试项目实例。
2. 读取 `mcpforunity://custom-tools`，确认四个 `uwt_*` 工具唯一注册。
3. 逐一编译并调用 project-profile、image-task、visual-capture、delivery-preflight Job。
4. 核对失败结果不泄露绝对路径、不覆盖资源或截图，图片导入回滚不删除源文件。
5. 按用户批准的平台集合分别验证 Build Profile；Windows/Android 使用可用的官方 `manage_build`，iOS/iPadOS 在 macOS/Xcode 与签名条件具备时导出并安装 IPA。
6. 为每个平台执行其设备档位与批准场景矩阵，核对平台主制品、实机视觉和性能原始样本哈希。
