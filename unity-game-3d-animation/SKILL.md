---
name: unity-game-3d-animation
description: 使用 Blender MCP 为已绑定的 3D 角色制作生产级表演动作、Action/NLA、可导入 Unity 的骨骼与形态曲线、烘焙动画和逐 Clip FBX。需要制作角色动画素材时使用；不负责模型、贴图、骨架/蒙皮或玩法权威规则。
---

# Unity 游戏 3D 角色动画

使用已交接并冻结的 3D 角色 Rig 制作可读、可复现、可导入的正式动作。动画路线固定使用 Blender MCP。正式素材生产前先按既有[动画意图与反馈时间轴合同](../unity-development-workflow/references/animation-intent-contract.md)向用户说明设计理念和动作方案并取得确认；不增加额外阶段或先做灰盒。开始前读取[动画工作流](references/animation-workflow.md)、[3D 角色交接](../unity-development-workflow/references/3d-character-handoff.md)和[Unity 角色导入流程](../unity-development-workflow/references/3d-character-unity-import.md)。

## 职责与工具

- 模型/贴图角色拥有网格、拓扑、UV、法线、槽位、材质和 BlendShape 目标几何；绑定角色拥有骨架、静置姿势、控制器、变形骨、蒙皮、约束与驱动基础和挂点；本角色只读消费这些冻结版本，拥有 Actions/slots、曲线、IK/FK 切换、表演姿势、接触、循环/过渡、节奏、根运动轨迹和表现事件。
- 玩法拥有权威状态、位移/命中/伤害规则与事件触发时机。动画事件只能报告表现节点或通知约定入口，不能独立决定玩法效果、伤害、物理推力或权威位移。
- 先复用可用 Blender 进程，按当前 MCP Schema/Blender 版本核实 Action、约束/驱动烘焙、曲线采样、形态键曲线、NLA 和逐 Clip FBX 能力。既有合法动画可只读输入并在 Blender 内适配；缺少必需能力即 `BLOCKED`，不能改用 Unity 自动绑定、外部自动动画服务或供应商。
- 脚本执行遵循既有精确授权边界。Unity 只消费导出的骨架/动画，负责导入器、Avatar、Clip 设置、Animator/事件映射、SkinnedMeshRenderer 与资源级 Prefab 验证；不替代 Blender 源动画生产。

## 制作入口

读取[生产级动画工作流](references/animation-workflow.md)，沿用既有 Work Item/V0–V4 和 `animation-intent-contract`。为每个动作独立定义 FPS、帧/秒范围、循环接点、步幅/步频、root motion（in-place 或 displacement）、玩法单一权威、中断/对象池/多实例行为和表现事件，再按已确认方案制作真实动作。输出要包含源文件与配方、逐 Clip 烘焙/导出、回读证据和 Unity 导入验证；动作画面由用户人工检查。
