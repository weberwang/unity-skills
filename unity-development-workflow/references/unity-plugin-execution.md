# @Unity 执行契约

Unity 的命令语法、Editor 连接、Safe Mode 恢复、项目创建、测试和构建以 `unity:unity-cli` 的当前说明为唯一操作来源；UPM 改动使用 `unity:unity-package-management`。本仓库不复制这些插件教程，只补充项目级控制约束和自定义命令。

执行前必须把规范化项目绝对路径绑定到 Work Item，并从插件发现的实例与命令目录选择唯一目标。任何 `eval`、项目命令、包修改、测试或构建都受 Implementation Package 的路径、动作等级和单写者限制；插件不可达、目标不唯一、Safe Mode 或命令不存在时保持 `BLOCKED`，不得猜测或换用旧执行桥接。

场景保存与模态弹窗按[场景保存与弹窗恢复](scene-save-recovery.md)处理。优先使用插件实际发现的保存能力；桌面 Unity 仅在命令被弹窗阻断且保存范围、来源与按钮均已核实时参与恢复。

`com.project.unity-workflow-toolkit` 通过 `com.unity.pipeline` 额外登记：

- `uwt_validate_project`
- `uwt_import_image`
- `uwt_capture_visual`
- `uwt_delivery_preflight`

消费 Toolkit 结果时同时检查 Unity CLI 外层结果和业务信封 `result.Success`、`result.Message`、`result.Data`。命令成功不能替代 AssetDatabase/GUID/Importer 回读、Scene/Prefab 序列化、Console、EditMode、PlayMode、构建、设备或发布证据。

桌面 Unity 自动化遵循[插件能力路由](unity-plugin-routing.md)：仅用于明确的可见 UI 交互或命令目录没有等价能力的步骤，不得替代结构化写入、测试和证据。未经用户明确要求，不启动 Standalone/Player 或真机，不签名、上传、发布或调用付费供应商。
