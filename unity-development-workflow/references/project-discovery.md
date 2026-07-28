# 项目发现

## 何时读取

首次进入项目、环境变化、Unity 重启、切换项目或任何 Unity 写入之前读取。

## 输入

- Unity 项目绝对路径与预期 Windows 构建目标。
- 可用 MCP 服务、`unity-mcp` 实例清单和工具组。
- 项目文件、包清单、目录树与当前 Editor 状态。

## 执行步骤

1. 读取 `mcpforunity://project/info` 与磁盘项目配置，只读确认 Unity 6、URP 和 Windows 构建目标。
2. 检查包清单、Assets 目录、场景目录、测试目录、UI Toolkit 资源，以及现有模型/贴图/材质/Prefab 目录、模型导入约定、ProBuilder/渲染相关包和 DCC 源索引。
3. 读取 `mcpforunity://editor/state` 并记录 Console 基线，确认编译、导入、域重载、PlayMode、连接陈旧状态是否正在运行或失败。
4. 检查未保存场景、脏资源和可能阻塞自动化的对话框。
5. 读取 `mcpforunity://instances` 发现全部 CoplayDev/unity-mcp 实例，按项目路径匹配稳定的 `Name@hash`。
6. 调用 `set_active_instance` 显式绑定；通过 `manage_tools(action="list_groups")` 检查工具组，只激活当前阶段需要的 `ui`、`testing`、`profiling`、`animation`、`vfx`、`probuilder`、`scripting_ext` 或 `docs`。3D 任务记录工具实际能力、版本与导出边界，未发现的工具不得按名称猜测调用。
7. 若项目声明 DCC 流程，只读记录 DCC 类型/版本、工程和外链资源路径、单位/轴向、导出目录、进程/文件占用与最近有效源版本；不启动 DCC、不保存、不导出。
8. 记录 Packages/manifest.json 中 MCP 包版本和连接方式，避免把插件版本差异误判为项目缺陷。
9. 任一只读检查失败时停止，禁止试探性写入。

## 子代理角色与并行边界

- 环境侦察代理可并行检查磁盘项目与 MCP 能力。
- Unity Editor 状态由一个只读代理串行采样，避免状态快照互相覆盖。
- 主代理只汇总结果并选择唯一实例；存在歧义时不得猜测。

## 所需锁与 Unity 权限

- 仅使用项目文件和 Unity 状态的只读权限，不申请资源写锁。
- 绑定实例不是写入授权；只有发现通过后才能申请后续独占锁。
- DCC 路径发现同样只读；存在写进程、锁归属不明、源/导出路径越界或版本不明时不得申请 DCC 单写锁。

## 机器可读输出

输出 `project-discovery.json`，包含 `unity_version`、`render_pipeline`、`build_target`、`packages`、`mcp_version`、`paths`、`console_baseline`、`editor_state`、`unsaved_scenes`、`unity_instance`、`tool_groups` 和 `status`；3D/DCC 项目另记录模型管线、DCC 类型/版本、单位/轴向、源/导出路径、占用状态和已验证能力。

## 通过条件

- Unity 6、URP、Windows、包与目录检查全部有实际证据。
- Console、编译、导入、PlayMode 和未保存状态均已记录。
- `unity-mcp` 实例唯一、项目匹配且可被显式绑定。

## 失败与恢复出口

- 环境缺失或状态不可读时标记 `BLOCKED` 并列出缺失项。
- 多实例歧义时请求用户指定实例；不得执行任何写调用。
- 等待编译、导入或 PlayMode 稳定后重新执行完整发现。
- DCC 工程被占用、版本不支持或导出边界不可证明时标记 `BLOCKED`，由用户关闭/指定实例或批准替代管线后重新发现；不得强制结束进程或覆盖源文件。
