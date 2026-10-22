# Unity 3D 资源工作流

3D 模型、UV、PBR、LOD、Collider、Rig、蒙皮、动画制作与 Prefab 均嵌入 V0-V4。

模型几何与 PBR 贴图生产统一通过 Blender MCP 完成。生产级模型符合目标风格、轮廓、使用距离、拓扑与性能预算，并不要求所有资产都采用高模或写实风格；贴图按[生产级 PBR 贴图流程](../../unity-game-3d-texturing/references/pbr-texture-workflow.md)制作，并通过[模型与贴图共同交接](../../unity-game-3d-texturing/references/model-texture-handoff.md)衔接。建模拥有几何、UV、法线、槽位结构与模型导出；贴图使用版本化派生 `.blend` 完成材质节点、绘制、烘焙、通道打包和贴图导出，不得暗改网格、UV 或槽位。Unity 插件只负责导入器、Material/Renderer、资源级 Prefab 和运行验证，不创建模型几何或纹理。

1. **V0/V1 规格与 Blockout**：冻结世界尺寸、轴向、Pivot、轮廓、观看距离、交互边界、拓扑/UV/材质槽/LOD/Collider/动画预算，并提交目标机位下可查看的 Blockout。
2. **V2 生产边界**：冻结几何、贴图、材质、Rig、蒙皮、动画和 VFX 的责任划分、资源 ID、目标节点、许可、源文件和验证矩阵。模型、贴图、绑定和动画工具固定为 Blender MCP，不为工具选择重复请求用户确认；其他工序如 VFX 按自身路线处理，不默认调用外部绑定/动画供应商。外部上传、付费或 DCC 任意代码执行仍按既有规则取得精确批准。
3. **V3 逐项生产与组合**：模型角色通过 Blender MCP 完成生产几何、拓扑、法线、UV、LOD 和碰撞代理，并交付高低模、Cage、法线/三角化等适用的烘焙输入；贴图角色通过 Blender MCP 在版本化派生文件中完成材质节点、绘制、烘焙、PBR 通道打包和贴图导出，按共同交接记录各 LOD 用图策略。Unity 负责纹理/模型导入器、Material/Renderer 绑定和资源级 Prefab。候选分别经 F2 独立领域审查和 F3 Unity 导入验证后组成资源级 Prefab。
4. **V4 场景接入**：单写者接入 Mesh、材质、LOD、Collider、Rig/Animator、Prefab、Addressables 和 Scene，清理 Blockout/占位与残留引用，并在目标灯光、相机、动画、物理和性能条件下运行 EditMode/PlayMode 验证。

## Blender MCP 生产级建模工序

1. 先检查可复用的 Blender 进程和 Blender MCP 实例，再核对当前工具能力与参数、活动 `.blend`、对象和 Collection、单位/轴向、源文件及导出路径、未保存状态和文件占用；只有确认没有可复用实例后才按已授权流程启动新进程。写入只触及实施包授权的对象与路径。建模和贴图均固定使用 Blender MCP，不为工具选择重复请求用户确认。
2. 依据已确认的视觉方向和模型规格分析结构、比例、轮廓、观看距离、交互/变形需求，以及拓扑、材质槽、LOD 和碰撞预算。
3. 细化形体并建立正式网格。只有目标细节需要时才制作高模并重拓扑；按目标风格、轮廓、变形和性能选择高低模方案，不将高模或写实设为通用门槛。
4. 整理生产拓扑、边流、面朝向、法线和硬/软边界；制作 UV 并检查接缝、拉伸、重叠规则、Texel Density 交接和材质槽。
5. 需要烘焙时，模型角色在 Blender MCP 中准备并交接匹配的高低模、UV、Cage/射线方案、法线/切线和三角化策略；贴图角色只读核对后负责 Blender 内的实际烘焙与 PBR 贴图产出。共享项、槽位与 LOD 用图策略按[模型与贴图共同交接](../../unity-game-3d-texturing/references/model-texture-handoff.md)执行，详细贴图工序见[生产级 PBR 贴图流程](../../unity-game-3d-texturing/references/pbr-texture-workflow.md)。
6. 在 Blender MCP 内按预算制作 LOD 和碰撞代理；碰撞代理只服务物理，不冒充可见模型。按项目版本策略保存版本化 `.blend`，在获准目录导出目标格式。
7. 在 Blender MCP 中回读模型和贴图导出结果，核对来源版本、对象、比例、轴向、Pivot、法线、UV、既有材质槽、纹理通道和 LOD 用图策略；随后由 Unity 插件完成模型/纹理导入器回读、Material/Renderer 绑定、资源级 Prefab 组装和运行验证。几何、UV、烘焙输入、槽位或贴图变化后，只重验实际受影响的下游依赖。

简单立方体、球体或圆柱等基础体只可作为起始网格、Blockout 或碰撞代理；仅将基础体拼搭后赋色、平滑，不能作为正式可见模型交付。Blockout 是规格检查阶段产物，不是成品。

## Blender MCP 角色绑定与动画

1. 按[角色共同交接](3d-character-handoff.md)接收生产网格/UV/法线/槽位、贴图材质、LOD、关节范围和目标动画需求。建模负责几何与静态源导出；绑定角色负责带骨架/蒙皮的正式角色导出，纹理/动画派生文件不得覆盖该模型。
2. [`$unity-game-3d-rigging`](../../unity-game-3d-rigging/SKILL.md) 在 Blender MCP 中设计骨架、Root/挂点、控制与变形骨、rest/bind、IK/FK 和按需面部/校正驱动，制作并清理各 LOD 权重。自动权重只是起点，须验证归一化、影响数预算与代表性压力姿势；拓扑或形状目标问题退回建模。
3. [`$unity-game-3d-animation`](../../unity-game-3d-animation/SKILL.md) 在动作方案取得既有确认后，按目标玩法、镜头和显示尺度制作关键姿势、节奏、接触、循环、过渡/中断和按需面部动作。每个动作独立定义 FPS/范围/时长、根运动与事件，不能套一个周期摆动批量宣称完成。
4. 在派生副本将控制 Rig/约束/驱动结果烘焙到明确的运行时骨架/形状曲线，逐 Clip 导出并重新导入回读；保留可编辑源。骨架身份、rest/bind、UV/材质槽、各 LOD 用图与根运动基准保持一致；结构缺陷退原岗位，只重验实际依赖。
5. 按[Unity 角色导入合同](3d-character-unity-import.md)串行验证 ModelImporter、Humanoid/Generic、Avatar/Root、Clips、事件/根运动、Material、SkinnedMeshRenderer/Bounds、LOD 和资源级 Prefab。V3 做资产导入与临时预览，V4 在正式场景检查动作响应、过渡、打断、暂停恢复、对象池和多实例等适用行为。

生产技术证据、独立动画专业审查和用户显示确认分别记录。不得把 2D 的 `uwt_validate_2d_rigging` 或 `riggingDelivery` 当作 3D 门禁；无实际执行的 Blender/Unity 能力保留 `NOT_RUN`/`BLOCKED`，不伪报通过。

不得用高保真渲染、标注图或合成图替代真实 3D 结构。源模型、拓扑、UV、材质槽、骨骼、GUID、地址或 Importer 变化，只失效其实际依赖的 V3/V4 证据。

Unity 截图仅作为用户人工检查的显示证据，代理不自动分析截图或据此判定视觉通过；未经用户明确要求，不启动 Standalone/Player 或真机验收。
