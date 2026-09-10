---
name: unity-development-workflow
description: Unity 6 游戏领域编排角色；在 unity-game-workflow-control 已建立 Work Item 后，按六阶段项目视图和 V0-V4 场景闭环协调架构、玩法、视觉、资源、音频、QA 与发布交付。
---

# Unity 游戏开发编排

以 [`unity-game-workflow-control`](../unity-game-workflow-control/SKILL.md) 为唯一全局状态、风险门、任务范围和证据权威。本 Skill 负责 Unity 领域拆分、交接物冻结、Editor 写入编排和证据收敛；不维护第二套状态机，不代替用户批准有副作用的操作。

## 最短流程

1. 读取 Work Item、当前阶段、工程基线和适用门禁；需要字段时按需读取[工作流总览](references/workflow-overview.md)、[项目发现](references/project-discovery.md)、[模块规划](references/module-planning.md)、[游戏实现](references/game-implementation.md)与[交付](references/delivery.md)。
2. 以“需求与范围 → 全局基线 → 基础工程 → 逐场景生产 → 全局集成验证 → 发布”展示项目进度。纯局部任务只建立一个 Work Item，并直接落到最早受影响阶段，不强制重走无关阶段。
3. A3 生产实现前冻结 Implementation Package，明确基线、文件所有权、Unity 对象所有权、执行单元、验证命令和停止条件。任务内方案、路径或资源清单变化时更新包并重验受影响范围。
4. 实施后记录候选差异，推荐 T0-T3 测试等级后自动执行；证据失败优先原地 `repair`，上游事实未变时 `revalidate`，仅在上游失效、范围真实变化或将绕过硬门时 `return`。
5. 阶段完成后回到控制面运行 `check`/`run`。外部写入、付费、真机、破坏性删除、签名、上传和发布必须由控制面建立精确对象审批。

## Unity 原生执行约束

- Unity 写入前发现实例，按规范化项目路径绑定唯一 Editor，并等待导入、编译和域重载稳定；写后复读目标对象、Console、Scene/Prefab、Importer、GUID 与登记结果。
- `Assets/` 中由 Unity 管理的文件与 `.meta` 视为一个所有权单元。禁止脱离 AssetDatabase 生成或猜测 GUID；移动/重命名资源优先使用 Unity API，避免引用断裂。
- `ProjectSettings/`、`Packages/`、Build Settings、Addressables 全局配置、共享 asmdef 与跨场景入口只能串行修改。同一物理 Unity 项目的正式 Editor 写入保持单写者。
- Runtime 程序集不得引用 Editor 程序集；Scene、Prefab、ScriptableObject 与 UXML/USS 修改必须保存并在域重载后重新验证序列化引用。
- 研发验证优先 EditMode、PlayMode、Game View、静态预算和无设备构建。未经用户明确要求，不启动 Standalone/Player 或真机；发布动作也不因构建成功而自动获批。

## 场景 V0-V4

场景按 `V0 分流 → V1 场景定义 → V2 拆解确认 → V3 正式资源与组合验收 → V4 正式实现与运行验收` 闭环。视觉任务读取[视觉工作流](references/visual-workflow.md)和[场景闭环](references/scene-loop.md)。

- V1 冻结玩法契约、Scene/Prefab/UI 结构、稳定节点 ID、宿主上下文、布局、安全区和验收轨迹。
- V2 冻结资源拆解、组件状态、生产路线、Importer/GUID/地址约定和用户必须决定的视觉边界。
- V3 验证正式资源、Prefab/Scene/UXML 组合、序列化引用与宿主同屏效果；不得以灰盒或整张效果图冒充正式资源。
- V4 在 Editor/PlayMode 中完成正式接入、交互轨迹、清理、Console、响应式与性能证据。显示层可作为宿主场景子任务并行准备，但必须在 V4 联合验收前关闭。

## 领域协作

制作、架构、玩法、视觉、3D、音频、数值、QA 和发布 Skill 只提交领域提议、实施结果或证据。现有 Spine 角色仅换皮时调用 `$unity-game-spine-reskin`。开发者不得审查自己的交付；F2 领域质量审查和 F3 工程验证分开记录。并行规则见[多代理执行](references/multi-agent-execution.md)。

## 工具入口

项目文档与 JSON Job 仍由最小文件工具处理；控制状态由 `unity-game-workflow-control` 处理，Unity 事实由 MCP 与随附 Toolkit 处理：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs init-docs --project-root D:\Projects\my-game --project-id my-game
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs status --repo D:\Projects\my-game --work-item D:\Projects\my-game\.workflow-control\work-items\current.json
```

Node 不替代 Unity 对 Scene、Prefab、Importer、AssetDatabase、编译、测试或构建的事实验证。除非用户明确要求，不创建 worktree、分支，不签名、上传、发布或发起真机验收。
