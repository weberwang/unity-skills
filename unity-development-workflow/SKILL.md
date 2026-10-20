---
name: unity-development-workflow
description: Unity 6 游戏领域编排角色；在 unity-game-workflow-control 已建立 Work Item 后，按六阶段项目视图和 V0-V4 场景闭环协调架构、玩法、视觉、资源、音频、QA 与发布交付。
---

# Unity 游戏开发编排

以 [`unity-game-workflow-control`](../unity-game-workflow-control/SKILL.md) 为唯一全局状态、风险门、任务范围和证据权威。本 Skill 负责 Unity 领域拆分、交接物冻结、Editor 写入编排和证据收敛；不维护第二套状态机，不代替用户批准有副作用的操作。

验收以用户要求和实际完成情况为准，合同作为目标与实施边界的参考。已授权范围内的方案、结构或资源调整无需为了验收回改合同；在实际交付记录或验收报告说明调整及其验证即可。不要求、不计算、不比对 SHA，也不因合同版本或内容差异重开已完成阶段。实际需求变化、质量问题、证据缺失和外部授权仍按对应规则处理。

## 最短流程

1. 读取 Work Item、当前阶段、工程基线和适用门禁；先按[Unity 插件能力路由](references/unity-plugin-routing.md)选择插件 Skill，再按需读取[工作流总览](references/workflow-overview.md)、[@Unity 执行契约](references/unity-plugin-execution.md)、[项目发现](references/project-discovery.md)、[模块规划](references/module-planning.md)、[SDK 统一初始化](references/sdk-initialization.md)、[产物存放与证据边界](references/artifact-storage.md)、[响应式 UI 合同](references/responsive-ui-contract.md)、[屏幕 UI 布局与节点树](references/ui-layout-and-hierarchy.md)、[TMP 多语言字体图集](references/tmp-font-atlas-workflow.md)、[视觉工作流](references/visual-workflow.md)、[美术质量合同](references/art-quality-contract.md)、[动画意图合同](references/animation-intent-contract.md)、[九宫格 UI 合同](references/nine-slice-ui.md)、[布局校准](references/layout-calibration.md)、[游戏实现](references/game-implementation.md)与[交付](references/delivery.md)。
2. 以“需求与范围 → 全局基线 → 基础工程 → 场景与弹窗生产 → 全局集成验证 → 发布”展示项目进度。纯局部任务只建立一个 Work Item，并直接落到最早受影响阶段，不强制重走无关阶段。
3. A3 生产实现前明确 Implementation Package 的基线、文件所有权、Unity 对象所有权、执行单元、非空 `acceptanceCommands` 和停止条件。进入 `IMPLEMENTING` 后由控制面创建 `evidenceRoot/execution-state.json`；单元结果记录真实证据并绑定计划顺序，`unit-check` 只校验结果，不运行验收命令。
4. 实施后记录候选差异，推荐 T0-T3 测试等级后自动执行；证据失败优先原地 `repair`，上游事实未变时 `revalidate`，仅在上游失效、范围真实变化或将绕过硬门时 `return`。`RETURN` 由 `affectedScope` 推导恢复点并归档执行状态，不手选恢复状态。
5. 阶段完成后回到控制面运行 `check`/`run`；场景工作项通过 `scene-stage` 相邻推进，V3→V4 还必须有 PASS Evidence 和执行闭环，推进后切回 `PROPOSAL`、重置 F2/F3/F4 并绑定新实施包。验收通过后，由主代理按[最小 Git 提交集](../unity-game-workflow-control/references/minimal-git.md)递归检查必要引用并自动创建本地阶段提交。外部写入、付费、真机、破坏性删除、签名、上传和发布必须由控制面建立精确对象审批。

图片与动画采用[图片优先的确认方式](../unity-game-workflow-control/references/simplified-workflow.md#图片优先的确认方式)：阶段内技术分析、布局决策和制作参数内部维护，直接展示真实候选；已有阶段或专项交付确认后不再请求文字复述确认，同目标返修直接展示前后对照。玩家画面按[游戏内文案](references/game-copy.md)维护同一可见表达，内部规格、效果图与运行数据来源分清归属。

## Unity 原生执行约束

- 首次建立工程、规划模块或新增目录时遵守[项目结构约束](references/project-structure.md)，目录映射、asmdef、场景生命周期与所有权在 TDD 和实施包中保持一致。
- Unity 写入前发现实例，按规范化项目路径绑定唯一 Editor，并等待导入、编译和域重载稳定；写后复读目标对象、Console、Scene/Prefab、Importer、GUID 与登记结果。切换场景及其他可能触发保存提示的命令之前，先按[场景保存前置检查](references/scene-save-recovery.md)只检查当前任务修改的场景，并通过 Unity 场景保存命令保存。
- `Assets/` 中由 Unity 管理的文件与 `.meta` 视为一个所有权单元。禁止脱离 AssetDatabase 生成或猜测 GUID；移动/重命名资源优先使用 Unity API，避免引用断裂。
- `ProjectSettings/`、`Packages/`、Build Settings、Addressables 全局配置、共享 asmdef 与跨场景入口只能串行修改。同一物理 Unity 项目的正式 Editor 写入保持单写者。
- Runtime 程序集不得引用 Editor 程序集；Scene、Prefab、ScriptableObject 与 UXML/USS 修改必须保存并在域重载后重新验证序列化引用。
- 项目采用的 SDK 由 Foundation 中映射的[唯一初始化入口](references/sdk-initialization.md)独立启动和追踪；不得让无关 SDK 或首帧等待整批初始化完成。
- 研发验证优先 EditMode、PlayMode、Game View、静态预算和无设备构建。未经用户明确要求，不启动 Standalone/Player 或真机；发布动作也不因构建成功而自动获批。

## 场景 V0-V4

每个 `SCENE` 和 `DISPLAY_LAYER` 的 V0 只作内部识别与分流，不要求常规确认；V1–V4 按[阶段人工确认](../unity-game-workflow-control/references/stage-confirmation.md)推进。V1 确认真实目标图；V2 先后独立确认拆解图和布局图；V3 验收正式资源生产与导入，可展示临时组合预览；正式 Scene/Prefab/UI 接入及布局校准在 V4，实际运行交付经用户确认后闭合。`stageReviews` 只保存 V1–V4 的用户确认，不能用技术 PASS、初始授权或沉默替代人工确认。

场景按 `V0 内部分流 → V1 对象定义 → V2 拆解与布局确认 → V3 正式资源生产与导入验收 → V4 正式实现与运行验收` 闭环。视觉任务读取[视觉工作流](references/visual-workflow.md)和[场景闭环](references/scene-loop.md)。全局基线首次建立时生成三张同条件候选并记录五项质量结果，唯一人工选择的候选五项均须 `PASS`；有效选择证据可跨 Work 复用。动画素材制作前须先说明设计理念和动作方案、取得确认，完成后仍须验收真实素材。

公共资源按[登记与使用规则](references/shared-asset-usage.md)从功能/场景规划贯穿 V1-V4：早期识别共享候选，V2 先查项目资源总表再选择复用或统一生产，V3 用真实产物复核；资源交接时由指定单写者同步登记，场景/显示层记录实际消费关系，替换后只重验受影响消费者。

- V1 冻结玩法契约、Scene/Prefab/UI 结构、稳定节点 ID、宿主上下文、响应式布局、安全区、多语言文本策略和验收轨迹；视觉任务同时明确主题、受众、核心循环、体验目标、观看情境及关键反馈意图。按[布局参照规则](references/ui-layout-and-hierarchy.md#布局参照选择)确定场景 UI 相对场景大小停靠，弹窗内部有底板时相对底板布局、无底板时相对屏幕布局。
- V2 按[文本与色彩拆分路线](references/visual-decomposition-routes.md)完整识别位图中的独立部件：低显著性文字优先系统文本，简单填充优先原生绘制，明显美术特征保留独立资产，功能与状态联动保持完整。冻结节点职责、实际层级依赖、语义分组与布局合同，再分别冻结视觉来源和 Scene/Prefab/UI 装配；同时记录组件状态、Importer/GUID/地址约定、适用九宫格的源图尺寸/Unity border/内容内边距、动作意图时间轴/事件及资产生产者和用户必须决定的视觉边界。屏幕 UI 使用[节点树与组件分组规则](references/ui-layout-and-hierarchy.md)。
- V3 验证正式资源生产、实际 Importer 回读、资源级序列化引用和导入结果；可做临时组合预览，不在本阶段实施正式 Prefab/Scene/UXML 或校准布局。不得以灰盒或整张效果图冒充正式资源。
- V4 在 Editor/PlayMode 中完成正式接入、交互轨迹、清理、Console、响应式与性能证据；美术质量五项逐项通过，并按适用性验收正常游玩、重复反馈、事件峰值和同屏叠加。动态证据与人工显示确认通过 `artExperienceAcceptanceRef` 绑定当前工作项/候选/场景；机器参数不能代替视觉确认。场景只闭环自身画面与常驻 HUD；modal、popup、drawer、toast 建立独立 `DISPLAY_LAYER` Work Item 和 Implementation Package，其 `hostSceneId` 只表示上下文，未完成不阻断宿主场景 V4。

## 领域协作

制作、架构、玩法、视觉、3D、音频、数值、QA 和发布 Skill 只提交领域提议、实施结果或证据。玩法事件对应的视觉、音频、镜头、时间与生命周期反馈由 [`$unity-game-juice`](../unity-game-juice/SKILL.md) 协调；规则和权威状态仍由玩法角色持有。现有 Spine 角色仅换皮时调用 `$unity-game-spine-reskin`；新 Spine/3D 动画必须在 Work Item 明确动画资产生产者，模型与贴图 Skill 不默认承担动画制作。开发者不得审查自己的交付；F2 领域质量审查和 F3 工程验证分开记录。并行规则见[多代理执行](references/multi-agent-execution.md)。

Unity 原生 2D 骨骼、蒙皮和角色动画交给 [`$unity-game-2d-rigging`](../unity-game-2d-rigging/SKILL.md)：拆件前确定项目视角、方向及实际使用场景，玩法与骨骼角色提前评审接口；由视觉资产角色生产部件，骨骼角色按场景设计动作与节奏，保证目标运动范围内的部件无缝组合，交付 Prefab、动画与 Animator 接口。正式生产前验证最小资产链路；QA 分资产交付前与玩法接入后两轮独立检查，显示效果交用户人工验收。拆件和代表性动画分别取得当前版本确认；沿用现有工作项及实施单元，不新增角色资产状态机或非法工作项类型。

正式资产交玩法前执行[骨骼交付门禁](../unity-game-workflow-control/references/rigging-delivery-gate.md)，将当前角色的资产检查与目标项目播放回归接入 F3，缺证或失败按岗位退修。门禁读取既有 Work Item/Evidence 的 `riggingDelivery`，不把工具夹具通过当成角色就绪，也不替代既有人工确认。

2D 动画公共工具、导入规范、资产校验、批量对账及回归能力交给 [`$unity-game-2d-animation-ta`](../unity-game-2d-animation-ta/SKILL.md)，具体角色资产仍归骨骼制作。总控按[2D 动画岗位协作](references/2d-animation-collaboration.md)在既有实施包指定动画质量负责人，落实动作标杆与专业审查；其与被审资产制作者分离，可由现有 QA 中具备相应能力的独立审查者承担。TA 工程结果、专业审查意见与用户视觉确认分别记录，不增加用户审批阶段。

## 工具入口

项目文档与 JSON Job 仍由最小文件工具处理；控制状态由 `unity-game-workflow-control` 处理，Unity 事实由 [@Unity](plugin://unity@openai-curated-remote)、`com.unity.pipeline` 与随附 Toolkit 处理：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs init-docs --project-root D:\Projects\my-game --project-id my-game
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs status --repo D:\Projects\my-game --work-item D:\Projects\my-game\.workflow-control\work-items\current.json
```

Unity 命令不在本 Skill 重复说明，执行时读取匹配的 Unity 插件 Skill。Node 与桌面点击都不能替代 Unity 对 Scene、Prefab、Importer、AssetDatabase、编译、测试或构建的事实验证。除非用户明确要求，不创建 worktree、分支，不签名、上传、发布或发起真机验收。
