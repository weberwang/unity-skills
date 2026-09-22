# Unity 阶段化工作流设计

## 目标

以 `unity-game-workflow-control` 作为唯一全局控制面，以 `unity-development-workflow` 作为 Unity 领域编排层，以 [@Unity](plugin://unity@openai-curated-remote)、`com.unity.pipeline` 与随附 C# Toolkit 作为事实执行层。流程不保留旧版通道、视觉 A0-A4 或 F0-F4 审核漏斗兼容语义。

## 用户阶段

项目按六阶段展示：需求与范围、全局基线、基础工程、场景与弹窗生产、全局集成验证、发布。SCENE 与 DISPLAY_LAYER 分别按 V0 分流、V1 对象定义、V2 拆解确认、V3 正式资源与组合验收、V4 正式实现与运行验收闭环。场景只负责自身玩法、画面和常驻 HUD；modal、popup、drawer、toast 使用独立 Work Item 与 Implementation Package，`hostSceneId` 只绑定运行上下文和公开接口，不构成宿主完成依赖。

内部 G0-G3 只作为领域里程碑标签，不建立第二套状态机。纯局部任务直接落到最早受影响阶段，不重走无关项目流程。

## 控制模型

- A0-A6：Unity 生命周期动作风险；仅带外部写入、付费、真机、破坏性删除、签名、上传或发布副作用的 A4-A6 需要精确批准。
- F0-F4：范围流程、规格一致性、领域质量、工程验证、高影响操作批准。
- A3 前冻结 Implementation Package，记录基线、路径/Unity 对象所有权、执行单元、验证与停止条件。
- 证据绑定 Work Item、基线、候选摘要、命令、环境、文件 SHA 和门禁结果。
- 可见对象在 V1 冻结 Unity 原生响应式合同；V2 先确认位置依赖、语义分组与父子关系，再分别冻结视觉来源和 Scene/Prefab/UI 装配；V4 PASS 必须绑定 Screen/Game View、Camera、CanvasScaler/PanelSettings、安全区、输入命中、resize/orientation、截图和候选身份的真实运行测量。
- 失败优先 `repair`，候选未变时 `revalidate`；只有上游事实失效、范围变化或硬门将被绕过时显式 `return`。

## Unity 原生边界

同一物理 Unity 项目的正式 Editor 写入为单写者。资源与 `.meta` 同属一个所有权单元；移动、重命名、导入和 GUID 由 AssetDatabase/Importer 管理。`ProjectSettings`、`Packages`、Build Settings、Addressables 全局配置、共享 asmdef 与 INTEGRATION 单元串行。

每次写入前后验证唯一实例、Editor 稳定、编译/导入/域重载、Scene/Prefab/ScriptableObject 序列化、GUID/Importer、Console 和最小 EditMode/PlayMode。构建成功不替代玩法、视觉、性能、设备或发布证据。

## 存储

机器控制状态位于项目 `.workflow-control/`：

```text
.workflow-control/
  work-items/
  implementation-packages/
  evidence/
  approvals/
  change-requests/
```

`docs/control-plane.md` 只是只读投影。可再生成截图、Profiler 日志和构建产物继续放在 `Artifacts/`，不得充当全局状态权威。

## 安全边界

未经用户明确要求，不创建 worktree/分支，不自动启动 Standalone/Player 或真机，不调用付费供应商，不上传用户资产，不签名、发布、覆盖稳定制品或删除外部数据。控制 CLI 只管理控制记录，不直接执行 Unity、测试、设备或发布操作。
