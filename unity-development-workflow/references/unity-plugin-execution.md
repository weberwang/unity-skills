# @Unity 执行契约

## 适用范围

所有 Unity Editor、Scene、Prefab、AssetDatabase、Importer、测试和构建操作均通过 [@Unity](plugin://unity@openai-curated-remote) 插件的 Unity CLI 能力执行。本工作流不安装、配置或调用其他 Unity 执行桥接，也不保留其工具名或资源 URI。

## 项目目标与能力发现

1. 先运行 `unity status --format json`，确认目标 Editor 可达且项目绝对路径与 Work Item 一致。
2. 多个 Editor 存在时，每次 `unity command`、`unity list`、`unity test` 和 `unity build` 都显式传递项目路径；不得依赖当前目录或名称模糊匹配。
3. 运行 `unity list --project-path <项目路径> --format json` 读取当前命令和参数 Schema。命令不存在、Editor 处于 Safe Mode、连接不可达或参数不匹配时标记 `BLOCKED`，不得猜测命令。
4. 项目必须安装 `com.unity.pipeline`。安装或升级包会修改 `Packages/manifest.json`，只能在 Work Item 已授权该路径时执行。

## 稳定命令分工

| 命令 | 用途 | 证据要求 |
| --- | --- | --- |
| `unity status` | Editor 发现、目标选择和可达性检查 | 项目路径、Editor 版本、状态快照 |
| `unity list` | 发现项目登记的 Pipeline 命令与参数 | 命令名、参数 Schema、Pipeline 版本 |
| `unity command` | 驱动已打开的 Editor，调用 Toolkit 或项目命令 | 输入 Job 哈希、结构化结果、写后回读 |
| `unity run --command` | 在无可复用 Editor 时执行一次性登记命令 | 启动日志、命令结果、退出码；不得自动启动真机或 Player |
| `unity test` | 执行 EditMode 或 PlayMode | 测试报告、退出码、源码与项目状态绑定 |
| `unity build` | 生成批准平台的构建候选 | BuildReport、输出清单、制品哈希、构建配置 |

Toolkit 通过 `com.unity.pipeline` 登记以下命令：

- `uwt_validate_project`
- `uwt_import_image`
- `uwt_capture_visual`
- `uwt_delivery_preflight`

调用示例：

```powershell
unity command uwt_validate_project --project-path D:\Projects\my-game --job_path Artifacts/Jobs/project-profile.json
```

命令返回成功只证明调用完成。消费 Toolkit 命令结果时必须读取业务信封的 `result.Success`、`result.Message` 和 `result.Data`，不能只读取 Unity CLI 的外层 `success` 或进程退出码。F3 仍须核对适用的 AssetDatabase、GUID/`.meta`、Importer、Scene/Prefab 序列化回读、Console、EditMode、PlayMode 和构建证据；`result.Success` 为 `false` 时不得写成 `PASS`。

## 安全边界

- `unity command eval`、`eval_file` 与任意项目命令都视为代码执行，只允许 Work Item 和 Implementation Package 明确列出的输入、目标与写入范围。
- 同一物理项目的 Editor 写入、BuildTarget 切换与构建保持单写者；报告审阅可以只读并行。
- 未经用户明确要求，不启动 Standalone、Player 或真机，不签名、上传、发布或调用付费供应商。
- Editor 因编译错误进入 Safe Mode 时，只读取最窄范围的编译错误并修复源码；不得把连接失败误判为项目不存在，也不得按进程名称终止所有 Unity 实例。
