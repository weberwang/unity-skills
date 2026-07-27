# Unity Workflow Toolkit

该 UPM 包为 Unity 6 项目提供工作流基础设施，不复制或修改 CoplayDev/unity-mcp。当前包含：

- Core：安全的项目相对路径解析、JSON Job 读取与 UTF-8 原子报告写入。
- ImagePipeline：已批准 PNG/JPG 的技术校验、无覆盖导入及 TextureImporter 配置。
- ProjectValidation：Unity 6、URP、Windows、构建场景、资源引用、asmdef 循环与 Console 基线检查。
- VisualQA：从指定摄像机生成 1920×1080、版本化且不可覆盖的 Editor 参考 PNG；它不能替代 Windows Standalone 实机视觉证据。
- BuildPipeline：在官方构建前检查 Windows、版本、场景、质量报告、视觉批准与输出保护。
- McpTools：把四项业务服务作为 unity-mcp 短同步自定义工具暴露。
- EditMode 测试：通过 `tests/UnityHost` 最小宿主运行全部模块测试。

## 安装

在目标项目的 `Packages/manifest.json` 中加入本包的本地地址，并先安装固定、已审查版本的 CoplayDev/unity-mcp。当前测试宿主使用 `v10.1.0` 和 `com.unity.nuget.newtonsoft-json` 3.0.2。业务模块只依赖 Core；只有 Editor-only 的 McpTools 薄层依赖 `MCPForUnity.Editor`，并通过版本定义在 unity-mcp 10.x 缺失时停止编译该集成层。

## 自定义工具

- `uwt_validate_project`：消费 `project-profile` Job，返回项目质量报告。
- `uwt_import_image`：消费已批准的 `image-task` Job，执行安全导入与 Importer 复核。
- `uwt_capture_visual`：消费 `visual-capture` Job，生成固定机位证据。
- `uwt_delivery_preflight`：消费 `delivery-preflight` Job，只执行技术构建预检。

每个工具参数为项目内 `job_path`。业务失败返回错误响应并携带结构化结果；响应不包含本机绝对路径。

## 图片导入边界

源文件必须位于 `ArtSource/Generated/<task-id>/processed/`，具有匹配的 SHA-256 与用户批准记录。目标仅允许进入项目契约规定的 `Assets/Art/Runtime/`，已有资源或 `.meta` 一律不会被覆盖。

正式资源不会直接从源目录复制到 `Assets`：管线先写入 `Library/UnityWorkflow/Staging/Images/<transaction-id>/`，复核暂存字节哈希，再获取 `Library/UnityWorkflow/Locks/AssetTargets/` 下的确定性跨进程目标锁，最后以同卷无覆盖移动原子落位。锁内会再次检查目标和 `.meta`，因此并行 Unity 实例不能同时创建同一正式路径。失败只清理当前事务创建的暂存文件、正式资源、对应新 `.meta` 和登记记录，不删除 processed 源文件或调用前已存在的目标。

成功报告包含资产 GUID 和从 Unity 重新读取的 TextureImporter 摘要。每次成功导入还会在 `Artifacts/AssetRegistry/records/<record-id>.json` 写入一份禁止覆盖的资源登记事实，包含资源 ID、来源版本、源哈希、批准证据、正式路径、GUID、许可证待确认状态和 Unity 验证状态。并发任务只新增独立记录，不直接修改 `docs/asset-register.yaml`；集成阶段审查并合并这些记录。

## 交付边界

`uwt_delivery_preflight` 的 `PASS` 只表示技术构建前置检查通过，不包含许可、隐私、签名、上传、发行或用户 G3 放行。正式 Windows 构建仍由 unity-mcp 官方 `manage_build` 执行。

## 测试

设置 `UNITY_PATH` 后从仓库根目录执行：

```powershell
& $env:UNITY_PATH -batchmode -nographics -quit -projectPath tests/UnityHost -runTests -testPlatform EditMode -testResults Artifacts/TestResults/toolkit.xml
```

若环境未安装 Unity，只能完成文件结构、JSON 与 C# 静态检查，不能把 EditMode 测试标记为通过。
