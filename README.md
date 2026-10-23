# Unity 游戏协作 Skills

面向 Unity 6、URP、uGUI + TextMeshPro 与 [@Unity](plugin://unity@openai-curated-remote) 插件的阶段化开发工作流。游戏运行时 UI 采用 Canvas/RectTransform 与 Prefab，新增编辑器工具采用 UI Toolkit。`$unity-game-workflow-control` 是唯一全局控制面，`$unity-development-workflow` 负责 Unity 领域编排，其余 Skills 负责制作、架构、玩法、视觉、3D、音频、数值、QA 和发布。

## 流程模型

用户视图采用六阶段：

1. 需求与范围
2. 全局基线
3. 基础工程
4. 场景与弹窗生产
5. 全局集成验证
6. 发布

场景与瞬态弹窗分别使用 `V0 内部分流 → V1 对象定义 → V2 拆解与布局确认 → V3 正式资源生产与导入验收 → V4 正式实现与运行验收`。V0 无常规人工确认；视觉工作项在 V1 生成并确认真实目标图；V2 拆解图与布局图分开确认；V3 验收正式资源和导入，可做临时组合预览；V3 可生产资源级 Prefab；正式宿主 Scene/场景装配 Prefab/UI 接入和布局校准在 V4，实际运行交付经用户确认后完成。全局视觉基线首次建立时恰好生成三张同条件候选并记录每张五项美术质量结果；唯一人工选择的候选五项均须 `PASS`，有效选择证据可跨 Work 复用。纯工程基础任务无视觉依赖时不等待选图，除非实施包声明 `visualBaselineRequired=true`。普通图片直接制作真实候选；动画素材制作前先说明设计理念和动作方案、等待用户确认，完成后仍验收真实素材。场景只负责自身玩法、画面与常驻 HUD；modal、popup、drawer、toast 使用独立 `DISPLAY_LAYER` Work Item，`hostSceneId` 只绑定运行上下文。内部状态、动作风险、质量门、实施包与证据均由控制面维护：

- A0-A3：调查、规格、隔离原型与生产实现；当前用户任务提供执行边界。
- A4-A6：本地集成、外部状态/设备与发布。只有外部写入、付费、真机、破坏性删除、签名、上传和发布需要精确逐对象批准。
- F0-F4：范围流程、规格一致性、领域质量、工程验证与高影响操作批准。
- A3 前冻结 Implementation Package；失败优先 `repair`，候选未变时 `revalidate`，仅上游失效或范围真实变化时 `return`。

Unity 写入遵循原生约束：唯一 Editor 实例、编译/导入/域重载稳定、单写者、AssetDatabase、资源与 `.meta` 配对、GUID/Importer/序列化回读，以及 EditMode/PlayMode/构建证据。未经用户明确要求，不启动 Standalone/Player 或真机，不签名、上传或发布。

屏幕 UI 在 V2 使用[机器布局包](unity-development-workflow/references/ui-layout-plan.md)，分别记录功能父级与位置参照，允许底板兼任组件根，派生严格/组合居中并校验依赖。V2–V4 实施包绑定 `uiLayoutPlanRef`；V4 由 `uwt_measure_layout` 读取[真实组件与布局](unity-development-workflow/references/ui-layout-runtime.md)，以 `uiLayoutMeasurementRef` 核验位置、宽度、高度的控制权及 Unity 原生尺寸。机器通过不代替用户检查显示效果。

V3/V4 的[资源与序列帧交接](unity-development-workflow/references/resource-loading-and-frame-handoff.md)沿用唯一资源总表，显式区分序列化、Resources 和 Addressables。`uwt_inspect_resource_handoff` 读取实际加载键、Clip/帧身份及 Prefab 消费者；实施包声明 `resourceHandoff` 后，以真实报告完成同源校验与交付门禁，不新增阶段或强制资源框架。

场景和独立显示层的 V0 仅作内部识别与分流；V1–V4 按 `stageReviews` 保存实际用户确认，V2 独立记录拆解图和布局图确认。实施单元完成依赖 `evidenceRoot/execution-state.json` 中已验证的结果，不以 Implementation Package 的计划状态替代。验收以用户要求和实际完成情况为准，中途实现调整无需回改合同，不要求或校验 SHA，具体见[阶段人工确认约束](unity-game-workflow-control/references/stage-confirmation.md)。

图片与动画采用[图片优先的确认方式](unity-game-workflow-control/references/simplified-workflow.md#图片优先的确认方式)：普通图片直接制作真实候选；动画先确认设计理念和动作方案，再制作真实素材并验收；同目标返修展示前后对照。SDK 初始化规则见[SDK 统一初始化](unity-development-workflow/references/sdk-initialization.md)，项目文件和证据归属见[产物存放规则](unity-development-workflow/references/artifact-storage.md)。游戏画面按[游戏内文案](unity-development-workflow/references/game-copy.md)贯穿策划、效果图、资源拆解和实现，优先使用图标、数字与符号，只保留必要文字；内部规格不进入玩家画面。

## 安装

需要 Node.js 22.20 或更高版本。在目标 Unity 项目根目录执行：

```powershell
npx -y github:weberwang/unity-skills
```

也可以显式指定项目目录：

```powershell
npx -y github:weberwang/unity-skills D:\Projects\my-game
```

安装器把全部 Unity Skills 安装到 `.agents/skills/`，默认完整替换安装清单内的同名目录，包括本地修改和过时文件；清单外的 Skills 保留。重复执行同一条命令即可更新。已克隆仓库时可运行：

```powershell
node .\scripts\install-project-skills.mjs D:\Projects\my-game
```

## 使用控制面

项目控制记录建议保存在 `.workflow-control/`，与可再生成的 `Artifacts/` 分离：

```text
.workflow-control/
  work-items/
  implementation-packages/
  evidence/
    <work-item-id>/execution-state.json
  approvals/
  change-requests/
```

控制命令：

```powershell
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs status --repo . --work-item .\.workflow-control\work-items\current.json
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs check --repo . --work-item .\.workflow-control\work-items\current.json
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs run --repo . --work-item .\.workflow-control\work-items\current.json
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs scene-stage --repo . --work-item .\.workflow-control\work-items\current.json --to V1
node .\.agents\skills\unity-game-workflow-control\scripts\workflow-control.mjs unit-check --repo . --work-item .\.workflow-control\work-items\current.json --result <result-json>
```

`status` 和 `check` 只读；`scene-stage` 只相邻推进同一场景工作项，`unit-check` 的 `--result` 应指向当前 `evidenceRoot` 内的结果文件，只校验当前实施单元、不运行验收命令；`run` 只推进已满足的安全控制状态，不执行 Unity 写入、测试、设备或发布动作，也不自动选择 `RETURN`。

项目文档仍由编排 Skill 的文件工具初始化：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs init-docs --project-root D:\Projects\my-game --project-id my-game
```

## @Unity 与 Toolkit

启用 [@Unity](plugin://unity@openai-curated-remote) 插件，并用其 Unity CLI 为目标项目安装 Pipeline 包，再复制 Toolkit：

```powershell
unity pipeline install --project-path D:\Projects\my-game
Copy-Item -Recurse .\.agents\skills\unity-development-workflow\assets\unity-workflow-toolkit\Packages\com.project.unity-workflow-toolkit .\Packages\com.project.unity-workflow-toolkit
```

具体的 Editor、Scene、Prefab、资源、包、UI、测试和构建操作由匹配的 Unity 插件 Skill 负责，本仓库不复制插件命令教程。Toolkit 补充项目验证、批准图片导入、固定机位取证、布局实测、Editor Game View 采集和交付预检；完整分工见 [Unity 插件能力路由](unity-development-workflow/references/unity-plugin-routing.md)。3D 建模、贴图、绑定和动画源生产固定使用 Blender MCP，Unity 负责导入与运行接入；命令成功不能代替 AssetDatabase 回读、Console、EditMode/PlayMode、设备或发布证据。DCC 脚本沿用精确授权边界，其他工序若涉及外部上传、付费或发布仍按其规则单独授权，不能据此将 3D 生产改走外部供应商。

生成式透明素材如果先产出不透明纯色背景 PNG，可在 Unity 导入前运行本地边缘连通去背景工具：

```powershell
npm run remove:background -- --source .\art\hero.raw.png --output .\art\hero.png --background-color "#00aa55" --tolerance 24 --require-solid-background --record .\art\hero.background-removal.json --preview
```

脚本不覆盖原图、不改变尺寸，并输出 SHA、删除像素、Alpha、失败原因和可选深浅底预览。只有记录为 `PASS` 的输出才能进入 `uwt_import_image`；复杂背景、毛发、玻璃、发光或半透明边缘仍需人工遮罩、专门分割或重新生成。

## 角色

- `$unity-game-workflow-control`：全局状态、范围、风险门、实施包与证据。
- `$unity-development-workflow`：六阶段和 V0-V4 Unity 领域编排。
- [`$unity-game-juice`](unity-game-juice/SKILL.md)：将玩法事件映射为视觉、音频、镜头、时间和交互反馈，明确重复、叠加、中断、暂停与对象生命周期策略。
- `$unity-game-production`、`$unity-game-architecture`、`$unity-gameplay-development`：制作、架构与玩法。
- `$unity-game-visual-assets`、`$unity-game-3d-modeling`、`$unity-game-3d-texturing`、`$unity-game-spine-reskin`：视觉与资产生产。
- [`$unity-game-3d-rigging`](unity-game-3d-rigging/SKILL.md)、[`$unity-game-3d-animation`](unity-game-3d-animation/SKILL.md)：通过 Blender MCP 制作生产级骨架/蒙皮与动作，按[角色共同交接](unity-development-workflow/references/3d-character-handoff.md)衔接建模、贴图和动画，并按[Unity 角色导入合同](unity-development-workflow/references/3d-character-unity-import.md)验证 Avatar、Clips、根运动、材质和角色 Prefab。
- 3D 模型与 PBR 贴图统一通过 Blender MCP 按生产级流程制作：建模与贴图按[共同交接](unity-game-3d-texturing/references/model-texture-handoff.md)衔接，贴图步骤见[生产级 PBR 贴图流程](unity-game-3d-texturing/references/pbr-texture-workflow.md)；Unity 负责导入器、Material/Renderer、资源级 Prefab 和运行验证，不创建模型或贴图。禁止简单体块拼搭充当正式模型。整体接入见 [3D 资源工作流](unity-development-workflow/references/3d-asset-workflow.md)。
- [`$unity-game-2d-rigging`](unity-game-2d-rigging/SKILL.md)：Unity 原生 2D 骨骼与动画制作；按项目选择侧视、正面、四分之三、俯视、等距斜视或组合视角，根据实际使用场景规划动作与节奏，保证部件在目标运动范围内无缝组合，交付 Sprite Skin 角色 Prefab 与动画接口。正式生产前验证最小资产链路，拆件方案及代表性动画分别确认；玩法代码由玩法角色负责，QA 分资产交付前和玩法接入后两轮，显示效果由用户人工验收。
- [`$unity-game-2d-animation-ta`](unity-game-2d-animation-ta/SKILL.md)：2D 动画技术美术，负责公共工具、导入规范、资产校验、批量对账、回归夹具和性能测量支持；具体角色资产仍由骨骼角色制作。动画质量负责人作为现有工作流内的独立专业审查职责，由总控指定，按[岗位协作与交接](unity-development-workflow/references/2d-animation-collaboration.md)执行；实际显示效果由用户确认。
- `$unity-game-audio`、`$unity-game-balance`：音频与数值。
- `$unity-game-qa-performance`、`$unity-game-release`：质量、性能、候选与发布。
- `$unity-game-grilling`：仅在事实无法消除且确需用户作实质取舍时提问和记录决定。

## 验证

```powershell
npm test
```

安装 Unity 6 并设置 `UNITY_PATH` 后，可运行 Toolkit EditMode 测试：

```powershell
& $env:UNITY_PATH -batchmode -nographics -quit -projectPath .\tests\UnityHost -runTests -testPlatform EditMode -testResults .\Artifacts\TestResults\all.xml
```

未实际运行 Unity 测试时只能报告 `NOT_RUN` 或 `BLOCKED`，不能从静态检查推断通过。
