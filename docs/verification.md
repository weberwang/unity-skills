# 验证记录

## 本次验证范围

本记录对应 2026-08-02 的工作流重构，覆盖总控与角色 Skills、严格默认拒绝策略、不可跳关质量门、阶段新证据状态机、拆分前拷问、用户驱动的平台选择、Windows/Android/iOS/iPadOS 独立适配、主开发平台 S00/G1、G2 逐模块与逐平台验收、G3 多平台候选制品及最终设备矩阵、全局视觉、P0 低保真 Prefab/Scene 结构、P1 高保真候选确认、P2 独立审阅、P3 编号资产地图、逐项资源生成、结构化拼装及最终低保真清理、2D 多比例与移动安全区适配、基于 MCP 的 3D 模型与 PBR 纹理流程、YAML/JSON Schema 契约、Python 编译/调度工具、项目文档初始化、Python 与 npx Skill 安装器、Unity Workflow Toolkit 源码与最小测试宿主。

## 已实际通过

### Python 全量测试

命令：

```powershell
rtk proxy uv run pytest -q
```

结果：`427 passed`。覆盖契约校验、确定性 Job 编译、严格策略入口与默认提示、标准检查全集、版本化拷问与候选快照摘要、拆分到模块/场景的精确投影、G0 平台批准与主开发平台约束、Windows/Android/iPhone/iPad 独立设备形态、S00/G1 主平台制品绑定、G2 批准模块/平台/性能报告全集、G3 各平台候选清单与设备档位/批准场景笛卡尔积、逐用例平台制品哈希、平台实机视觉来源、九项分平台性能原始样本回读、极值重算与预算实算、类型化资源登记与 PBR 闭合引用链、阶段新证据状态机、模块/场景 DAG、跨进程锁、CLI、初始化器、Python/npx 安装器、Windows 实机捕获脚本、三次用户视觉确认与实机三学科审阅、P0-P5 视觉资源小循环、低保真清理、2D/安全区适配、3D 模型/贴图角色路由、端到端门禁和 Toolkit 静态结构。

### npx 安装入口

已执行 `node .\scripts\install-project-skills.mjs --help`，确认帮助信息提供 `npx -y github:weberwang/unity-skills` 最短命令。随后执行 `npm pack --dry-run --json`，确认包内包含总控与十一个角色 Skill 的参考文档和代理配置；安装器测试确认 `.agents/skills/` 下精确生成十二个 Skill，且安装内容逐文件来自当前包而不是再次拉取远端默认分支。

另将双进程竞争同一场景锁的测试连续执行 20 次，结果 `20/20` 通过；此前审查代理修复后也完成过 `30/30` 压力验证。

### Skill Creator 校验

使用 Skill Creator 的 `quick_validate.py` 分别校验总控和十一个角色 Skill；Windows 下设置 `PYTHONUTF8=1`，避免校验器按系统 GBK 默认编码读取 UTF-8 文档。

结果：12 个 Skill 全部返回 `Skill is valid!`。

### Toolkit 静态校验

命令：

```powershell
rtk proxy uv run pytest tests\python\test_toolkit_structure.py -q
```

结果：`6 passed`。已确认模块/测试文件齐备、asmdef 可解析且名称唯一、UnityHost 固定 unity-mcp v10.1.0、四个自定义工具名称准确、2D 适配 Runtime/Editor/EditMode 测试结构齐备、C# 文件均小于 1000 行且类型/方法具备中文 XML 摘要，并覆盖新增 Toolkit 安全约束的静态结构。

### MCP API 基线核对

已按 CoplayDev/unity-mcp 当前稳定接口核对 `McpForUnityToolAttribute`、`HandleCommand(JObject)`、`SuccessResponse`、`ErrorResponse`、工具发现、`asset_gen.generate_model`、`import_model_file`、`manage_texture`、`manage_material` 与 asmdef 引用，并在 UnityHost 固定 `v10.1.0`。Toolkit 的正式构建仍调用官方 `manage_build`，没有复制该插件实现；精确 UV 与烘焙所需的第三方 DCC MCP 不由本仓库自动安装或授权。

## 环境阻塞

- `UNITY_PATH` 未设置。
- 常见 Unity Hub/Editor 安装目录未发现 Unity 可执行文件。
- 当前环境没有可绑定的 Unity Editor，因此没有实际执行 Toolkit 编译、EditMode 测试、自定义工具发现、图片导入、固定机位截图、Profiler 或任何目标平台 Player 构建。
- 当前环境没有执行 Android 安装测试，也没有验证 iOS/iPadOS 所需的 macOS、Xcode、证书、IPA 与真机链路；这些平台只能保持 `BLOCKED`，不能由静态测试推断为通过。
- 验证前检查了现有 Unity 进程，没有可复用实例，因此未启动新的 Editor 或服务。

上述项目状态为 `BLOCKED`，不能由 Python 或静态检查推断为 `PASS`。

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
