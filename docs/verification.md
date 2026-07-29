# 验证记录

## 本次验证范围

本记录对应 2026-07-29 的工作流重构，覆盖总控与角色 Skills、严格默认拒绝策略、不可跳关质量门、阶段新证据状态机、拆分前拷问、模块/场景契约、全局视觉、P0 低保真 Prefab/Scene 结构、P1 高保真候选确认、P2 独立审阅、P3 编号资产地图、逐项资源生成、结构化拼装及最终低保真清理、2D 多比例适配、基于 MCP 的 3D 模型与 PBR 纹理流程、YAML/JSON Schema 契约、Python 编译/调度工具、项目文档初始化、Python 与 npx Skill 安装器、Unity Workflow Toolkit 源码与最小测试宿主。

## 已实际通过

### Python 全量测试

命令：

```powershell
rtk uv run pytest -q
```

结果：`239 passed`。覆盖契约校验、确定性 Job 编译、严格策略入口与默认提示、标准检查全集、前置门禁深验、证据类型与主体版本绑定、阶段新证据状态机、模块/场景 DAG 与当前拆分版本门禁、证据缓存身份复核、跨进程锁、CLI、初始化器、Python/npx 安装器、Windows 实机捕获脚本、三次用户视觉确认与实机三学科审阅、`prefab-structure`、高保真候选与独立审阅、同源同尺寸编号资产地图、P3 节点映射、逐项生成、`prefab-assembly` 层级/Transform/场景实例深验、低保真清理状态与审计证据保护、场景全集与 2D 适配覆盖、3D 模型/贴图角色路由与高风险 MCP 边界、适配数学复算与逐分辨率深验、深度质量门求值、不可变资源登记合并、端到端视觉门禁和 Toolkit 静态结构。

### npx 安装入口

已执行 `node .\scripts\install-project-skills.mjs --help`，确认帮助信息提供 `npx -y github:weberwang/unity-skills` 最短命令。随后执行 `npm pack --dry-run --json`，确认包内包含总控、十个角色 Skill、两个新增 3D Skill 的参考文档和代理配置；安装器测试确认 `.agents/skills/` 下精确生成十一个 Skill，且安装内容逐文件来自当前包而不是再次拉取远端默认分支。

另将双进程竞争同一场景锁的测试连续执行 20 次，结果 `20/20` 通过；此前审查代理修复后也完成过 `30/30` 压力验证。

### Skill Creator 校验

使用 Skill Creator 的 `quick_validate.py` 分别校验总控和十个角色 Skill；Windows 下设置 `PYTHONUTF8=1`，避免校验器按系统 GBK 默认编码读取 UTF-8 文档。

结果：11 个 Skill 全部返回 `Skill is valid!`。

### Toolkit 静态校验

命令：

```powershell
rtk uv run pytest tests\python\test_toolkit_structure.py -q
```

结果：`6 passed`。已确认模块/测试文件齐备、asmdef 可解析且名称唯一、UnityHost 固定 unity-mcp v10.1.0、四个自定义工具名称准确、2D 适配 Runtime/Editor/EditMode 测试结构齐备、C# 文件均小于 1000 行且类型/方法具备中文 XML 摘要，并覆盖新增 Toolkit 安全约束的静态结构。

### MCP API 基线核对

已按 CoplayDev/unity-mcp 当前稳定接口核对 `McpForUnityToolAttribute`、`HandleCommand(JObject)`、`SuccessResponse`、`ErrorResponse`、工具发现、`asset_gen.generate_model`、`import_model_file`、`manage_texture`、`manage_material` 与 asmdef 引用，并在 UnityHost 固定 `v10.1.0`。Toolkit 的正式构建仍调用官方 `manage_build`，没有复制该插件实现；精确 UV 与烘焙所需的第三方 DCC MCP 不由本仓库自动安装或授权。

## 环境阻塞

- `UNITY_PATH` 未设置。
- 常见 Unity Hub/Editor 安装目录未发现 Unity 可执行文件。
- 当前环境没有可绑定的 Unity Editor，因此没有实际执行 Toolkit 编译、EditMode 测试、自定义工具发现、图片导入、固定机位截图、Profiler 或 Windows 构建。
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
5. 使用官方 `manage_build` 生成 Windows 开发构建并执行启动检查。
