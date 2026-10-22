---
name: unity-game-3d-rigging
description: 使用 Blender MCP 为 Unity 游戏角色制作生产级骨架、控制 Rig、蒙皮权重、变形校正与各 LOD 的骨架蒙皮 FBX。需要把已定型 3D 角色网格绑定为可动画资源时使用；不拥有模型几何、UV、贴图或动作制作。
---

# Unity 游戏 3D 角色绑定

为已交接的生产模型建立可维护、可动画、可导出的角色 Rig。统一在 Blender MCP 制作，不以自动权重或基础骨架生成器的结果直接交付。开始前读取[绑定工作流](references/rigging-workflow.md)、[3D 角色交接](../unity-development-workflow/references/3d-character-handoff.md)；导出和导入按[Unity 角色导入流程](../unity-development-workflow/references/3d-character-unity-import.md)衔接。

## 职责与边界

- 建模拥有网格几何、拓扑、法线、UV、材质槽与 BlendShape 目标几何；纹理拥有贴图、材质节点和 Shader 信息。绑定只读接收并保留这些数据，拥有静置姿势、骨架结构、命名/轴向/bone roll、控制器、变形骨、skin weights、驱动校正、道具挂点及各 LOD 绑定。
- 动画角色只消费已冻结的骨架与绑定，拥有 Actions、曲线、表演、IK/FK 切换、接触、循环、过渡、节奏、根运动轨迹和表现事件。动画发现骨架结构、蒙皮或变形缺陷时退回绑定；绑定发现几何问题退回建模，UV/槽位或材质信息问题退回相应模型/纹理负责人。
- 绑定不得为了方便改网格、重排顶点、重展 UV、改槽位或重做 BlendShape 目标几何。结构修改需版本化返给建模并重新核对权重、校正形态及导出依赖。
- Humanoid 或 Generic 由角色形态、骨架用途和重定向需求决定，不强制人形，也不设统一骨骼数或权重影响数。Unity 负责实际导入、Avatar/Skinned Mesh 设置、Prefab 装配和播放验证，不替代源绑定。

## Blender MCP 与 Unity 路由

1. 先检查可复用的 Blender 进程、MCP 连接和当前工具 Schema；核对版本、活动 `.blend`、场景、对象/Collection、未保存状态、外链依赖和写入归属。只有确认没有可复用实例后才考虑启动，禁止重置或覆盖用户场景。
2. 按当前 Blender/MCP 版本确认 Rig、权重检查/编辑、约束与驱动烘焙、保存、FBX 导出及回读能力；不得假设某个工具名、API 或 UI 操作一定存在。能力不足时将受影响产物标为 `BLOCKED`，不改用 Unity 自动绑定、外部自动 Rig 服务或供应商补位。
3. 既有合法模型、绑定部件和动作可作为只读输入；所有正式修改写入版本化派生 `.blend`。脚本沿用当前精确授权边界；没有覆盖本次脚本与路径的精确授权时，执行前展示并取得确认。
4. 通过 Blender MCP 完成源 Rig 和蒙皮；派生副本中选择明确的骨架/网格/必需挂点导出集合并输出各 LOD 的 skinned FBX。随后按共享的 [Unity 角色导入流程](../unity-development-workflow/references/3d-character-unity-import.md)串行导入、回读并验证。Blender 源能力不足时保持阻断，不转到 Unity 或 2D 专用 Rig 路线。

## 生产交付

执行[绑定工作流](references/rigging-workflow.md)：先确认模型与骨架合同，再规划静置姿势和骨层级，分别建立控制骨与运行时变形骨，完成并修正蒙皮、驱动校正及按需的道具/面部挂点，验证压力姿势和各 LOD，最后在派生副本导出并回读。需要角色动作时交接给 `$unity-game-3d-animation`，不可将绑定验证误报为动画完成。

绑定交付至少含可重开的 `.blend` 及依赖、源/模型/UV/槽位/BlendShape 版本、骨架层级和命名/轴向说明、权重与压力姿势检查、控制和变形骨映射、各 LOD 对应、FBX 对象/骨骼选择与导出参数、许可、Unity 导入技术结果及待用户人工检查的显示证据。资源级 Prefab 属 V3，正式场景接入属 V4；技术检查和专业审查不代替用户视觉确认。
