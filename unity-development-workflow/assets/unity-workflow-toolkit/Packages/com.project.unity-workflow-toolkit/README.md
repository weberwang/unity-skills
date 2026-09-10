# Unity Workflow Toolkit

该 UPM 包为 Unity 6 项目提供工作流基础设施，通过 [@Unity](plugin://unity@openai-curated-remote) 与官方 `com.unity.pipeline` 提供 Editor CLI 命令。当前包含：

- Core：安全的项目相对路径解析、JSON Job 读取与 UTF-8 原子报告写入。
- ImagePipeline：已批准 PNG/JPG 的技术校验、无覆盖导入及 TextureImporter 配置。
- ProjectValidation：Unity 6、URP、主开发平台 BuildTarget、构建场景、资源引用、asmdef 循环与 Console 基线检查。
- Runtime：`Adaptive2DViewport` 为 2D 场景提供竖屏高度适配、横屏宽度适配、UI Toolkit match 配置和无交互装饰边带布局。
- VisualQA：从指定摄像机生成 1920×1080、版本化且不可覆盖的 Editor 参考 PNG；它不能替代任一目标平台 Player 实机视觉证据。
- BuildPipeline：当前只为 Windows 分支在官方构建前检查目标、版本、场景、质量报告、视觉批准与输出保护；移动端执行各自平台工具链预检。
- PipelineCommands：把四项业务服务作为 Unity Pipeline CLI 自定义命令暴露。
- EditMode 测试：通过 `tests/UnityHost` 最小宿主运行全部模块测试。

## 安装

在目标项目的 `Packages/manifest.json` 中加入本包的本地地址，并固定官方 Registry 的 `com.unity.pipeline` `0.6.0-exp.1`、`com.unity.inputsystem` `1.20.0` 与 `com.unity.nuget.newtonsoft-json` `3.0.2`。也可在 Work Item 已授权修改 `Packages/manifest.json` 时运行 `unity pipeline install --project-path <项目路径>`。业务模块只依赖 Core；Editor-only 的 PipelineCommands 程序集通过 `Unity.Pipeline` 引用和版本约束编译。

## 自定义 Pipeline 命令

- `uwt_validate_project`：消费 `project-profile` Job，返回项目质量报告。
- `uwt_import_image`：消费已批准的 `image-task` Job，执行安全导入与 Importer 复核。
- `uwt_capture_visual`：消费 `visual-capture` Job，生成固定机位证据。
- `uwt_delivery_preflight`：消费 `delivery-preflight` Job，只执行技术构建预检。

每个命令参数为项目内 `job_path`。命令返回包含 `Success`、`Message`、`Data` 的统一结果信封；业务失败会明确返回 `Success: false` 并携带结构化结果，不包含本机绝对路径。

先用 `unity status --format json` 确认 Editor，再运行 `unity list --project-path <项目路径> --format json` 发现命令。调用示例：

```powershell
unity command uwt_validate_project --project-path D:\Projects\my-game --job_path Artifacts/Jobs/project-profile.json
```

## 图片导入边界

源文件必须位于 `ArtSource/Generated/<task-id>/processed/`，具有匹配的 SHA-256 与用户批准记录。目标仅允许进入项目契约规定的 `Assets/Art/Runtime/`，已有资源或 `.meta` 一律不会被覆盖。

正式资源不会直接从源目录复制到 `Assets`：管线先写入 `Library/UnityWorkflow/Staging/Images/<transaction-id>/`，复核暂存字节哈希，再获取 `Library/UnityWorkflow/Locks/AssetTargets/` 下的确定性跨进程目标锁，最后以同卷无覆盖移动原子落位。锁内会再次检查目标和 `.meta`，因此并行 Unity 实例不能同时创建同一正式路径。失败只清理当前事务创建的暂存文件、正式资源、对应新 `.meta` 和登记记录，不删除 processed 源文件或调用前已存在的目标。

成功报告包含资产 GUID 和从 Unity 重新读取的 TextureImporter 摘要。每次成功导入还会在 `Artifacts/AssetRegistry/records/<record-id>.json` 写入一份禁止覆盖的资源登记事实，包含资源 ID、来源版本、源哈希、批准证据、正式路径、GUID、许可证待确认状态和 Unity 验证状态。并发任务只新增独立记录，不直接修改 `docs/asset-register.yaml`；集成阶段审查并合并这些记录。

## 交付边界

`uwt_delivery_preflight` 只适用于 Windows；其 `PASS` 仅表示技术构建前置检查通过，不包含许可、隐私、签名、上传、发行或用户 G3 放行。正式 Windows 构建仍由 Unity 官方构建链执行，Android、iOS 和 iPadOS 不得复用该结论。

## 测试

安装 [@Unity](plugin://unity@openai-curated-remote) 对应的 Unity CLI 后，从仓库根目录执行：

```powershell
unity test .\tests\UnityHost --mode EditMode --report-format junit --output .\Artifacts\TestResults\toolkit.xml --timeout 600
```

若环境未安装 Unity，只能完成文件结构、JSON 与 C# 静态检查，不能把 EditMode 测试标记为通过。

## 2D 场景适配

竖屏使用固定 `Camera.orthographicSize = referenceHeight / pixelsPerUnit / 2`，并把 PanelSettings 的 Match Width or Height 设为 `1`；横屏按目标 aspect 反算正交半高以固定参考宽度，并把 match 设为 `0`。目标比例产生额外可见区域时，组件只启用对应的 LEFT/RIGHT 或 TOP/BOTTOM 两张 SpriteRenderer。

边带对象必须是无父级的独立对象，且层级中只能含 Transform 与 SpriteRenderer；任何 Collider、Collider2D、脚本或其他组件都会令严格校验失败。Renderer 与材质 Alpha 必须至少为 0.99，材质需受当前平台支持，边带位于摄像机 Culling Mask 内，并使用严格低于玩法内容的 Sorting Layer/Order。纹理需开启 Read/Write，Editor 校验会扫描 Sprite 实际区域并要求至少 99% 像素达到可见 Alpha，防止透明图片绕过检查。边带资源只负责视觉延展，不得放置按钮、提示或玩法信息。场景还必须使用 `scene-2d-adaptation` 契约验证参考、边带、裁切三类分辨率。
