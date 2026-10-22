# Blender MCP 生产级角色动画流程

动画生产沿用既有 V0–V4 与 Work Item，不新增资产状态或用户审批阶段。动画意图、方案确认和动作事件遵循[动画意图与反馈时间轴合同](../../unity-development-workflow/references/animation-intent-contract.md)；模型/贴图/Rig 交接遵循[3D 角色交接](../../unity-development-workflow/references/3d-character-handoff.md)，Unity 导入与验证遵循[Unity 角色导入流程](../../unity-development-workflow/references/3d-character-unity-import.md)。

## 输入和制作前确认

每个动作需要明确角色与用途、实际相机/观看尺度、玩法表达、已绑定模型/Rig 版本、责任人与消费方、目标 Unity 项目、授权参考与许可、FPS、时长/帧区间、循环/过渡、中断情况、接触对象、步幅与步频、root motion 形式、动作事件语义和验收重点。动作各自设 FPS 与时长，不因一批动作统一等长或同步。

在真实动画制作前，向用户说明设计理念及动作方案：动作表达的目标感受、关键表演/姿态变化、空间路径、节奏依据、动作间衔接、root motion 方式和验收观察点；拿到明确确认后再制作正式 Actions 和导出素材。方案说明是合同已有的素材确认，不新增灰盒、固定时间表或另一审批门。实际动画产物完成后仍需用户人工检查。

- 先读模型/贴图/Rig 交接，冻结源网格、UV、槽位、BlendShape/形态曲线、骨架、静置姿势、骨名和版本。动画只写动作派生文件，不改模型、UV、权重或骨架结构。
- 与玩法核定角色位移的唯一权威来源：in-place 动画由游戏控制器/玩法系统驱动位移；displacement/root motion 动画由明确指定的动画根曲线驱动，玩法仍拥有权威状态和允许范围。不得同时从动画和玩法重复累加位移。
- 明确 Unity 消费的 Humanoid/Generic 路线由形态、用途及重定向目标决定；动画不为强制人形而重排骨架，也不假设 Unity 能读取 Blender 控制器或约束。
- 若使用既有合法动作，先确认许可、骨架映射、姿势空间、单位、帧率、root 语义和曲线归属；输入保持只读，只在 Blender 中适配到当前 Rig。

## Blender MCP 能力发现

1. 先检查可复用 Blender 进程/MCP 会话，核对版本、活动 `.blend`、Action 与 Action slot、NLA tracks/strips、约束和驱动、未保存状态、外链资源及写入归属。只有无可复用进程时才考虑启动；不清空或重置场景。
2. 按当前 MCP Schema 与 Blender 版本核实能否写入/采样骨骼和 BlendShape 曲线，控制/约束切换，烘焙约束与驱动，管理 Action slot/NLA 静音状态，设置帧范围并对目标 FBX 逐项导出、回读。记录实际工具/API/版本，不能虚构统一命令。
3. 如果脚本授权已精确覆盖本次对象、操作和输出路径可继续执行，否则执行前展示脚本并取得确认。脚本仅可在授权 Blender 数据、数学/曲线操作与批准目录读写范围内工作，不执行 shell、网络、环境变量、凭据或任意文件访问。
4. 当前 MCP/Blender 版本不能可靠落盘或回读必需曲线时阻断对应工序；不得用 Unity 中手动补动画、外部服务生成或未确认的控制 Rig 运行时替代。

正式动作批量制作前，先对一个已确认方案中的代表 Clip 走通实际链路：[Unity 导入合同](../../unity-development-workflow/references/3d-character-unity-import.md#导出职责与统一基准)要求的小范围姿势/曲线回读须覆盖当前 Rig、Action/slot/NLA 选择、约束/驱动烘焙、导出 FBX 与目标 Unity 导入。逐 Clip 记录源 Action、slot（若当前版本使用）、NLA strip 和静音状态、目标帧范围及采样参数，并验证导入曲线与 Blender 源采样一致；只有这条链路可复现后才扩展动作集。

## 动作生产工序

| 工序 | 工作要求 | 退出证据 |
| --- | --- | --- |
| 表演/时间设计 | 基于场景、玩法窗口、相机和操作频率编排准备、主动作、关键姿势、接触、收势、循环或可中断点；这些段落按动作意图选用，不套固定模板。为此动作记录 FPS、范围、关键时间点、循环接点和过渡目标 | 已确认的动画方案与逐动作参数/验收点相符；玩法事件语义和权威规则分开 |
| Blocking 到精修 | 在实际 Blender Rig 上从关键姿势和重心/节奏关系推进到连续曲线，再按观看尺度检查重心转移、惯性、关节次序、空间路径、剪影、接触和收势。Blocking 仅为制作中间步骤，不作为交付或替代灰盒确认 | 正式 Action 有可读的起势、主表演和收束；关键帧、插值与速度曲线能解释目标动作，不是简单周期摆动 |
| 步态/接触/物体交互 | 移动按实际速度规划落脚节奏、步幅、承重和支撑/摆动相；检查足部锁定和滑动。握持、碰撞、坐卧、攀爬及道具交接按实际项目需要检查接触点、挂点空间和主体反作用 | 记录场景速度、步频/步幅或接触参照；常速与慢放检查无未解释的足滑、穿插、悬空或接触断开 |
| 循环/过渡/中断 | 逐 Clip 检查循环首尾姿势、曲线值/斜率和根位移连续；为实际消费者规划过渡条件、可打断区和返回状态。按需要检查对象池重用、Animator 重入、角色并行实例不共享或污染状态 | Clip 循环标记/帧范围与实际曲线一致，入口/出口姿势可过渡；中断后恢复到正确状态，符合已确定的消费接口 |
| IK/FK 与校正曲线 | 控制端可用 IK/FK、约束和驱动辅助表演，但输出前必须将不能在目标 Unity 中直接读取的控制关系烘焙到运行时 deform bones；按需把交接的 BlendShape 通道采样为 Unity 可读曲线 | 逐关节/通道核对烘焙前后代表帧；导出的变形骨/形态曲线无需 Blender constraints/drivers 即能表达结果 |
| NLA 与 Action 管理 | 将每个 Clip 映射到明确 Action 与 slot（当前 Blender 版本使用 slot 时），说明 source Action、活动 slot、目标帧范围、采样率和目标对象；显式确认 NLA tracks/strips 的 mute/solo/evaluate 状态，遵循[导入合同的逐 Clip 导出选择](../../unity-development-workflow/references/3d-character-unity-import.md#导出职责与统一基准) | 每个导出只包含目标 Clip 的骨骼/形态曲线，不含其他 Action 或意外叠加的 NLA 内容；命名、帧区间与表格一致 |
| 技术回放 | 在 Blender 中逐 Clip 播放并抽样检查关键帧、根曲线、脚/手接触、挂点、循环边界、中断姿势、多 LOD 和面部通道。权重、几何问题返回绑定或建模 | 每个动作有技术检查记录及对应 LOD/姿势覆盖；显示素材由用户人工检查，不自动看图判定视觉通过 |
| 烘焙与逐 Clip FBX | 选定导出副本与目标骨架，显式设置 Action/slot/NLA 静音、对象范围、起止帧、每帧采样、骨骼/形态曲线和 root 策略；每个 Clip 单独导出，不依赖 `All Actions` 自动打包 | 每个 FBX 只含合同中指定 Clip；逐文件回读曲线绑定、帧率/时长、循环范围、root 轨迹、事件映射输入和 BlendShape 曲线 |
| Unity 导入 | 按[Unity 角色导入流程](../../unity-development-workflow/references/3d-character-unity-import.md)检查模型导入、Avatar/Generic/Humanoid、Clip 切分/循环/root 配置、Animator 接口、SkinnedMeshRenderer 和角色资源级 Prefab | Editor 实际回读各 Clip 与 Avatar/Renderer 映射、Console 和必要播放；正式场景装配留在 V4 |

### Blender 曲线烘焙规则

- 每个导出清单逐项写明目标 Action 名称、Action slot（适用时）、NLA strip 范围和静音状态、目标帧起止、FPS、帧采样/曲线简化方法、输出骨骼集合、BlendShape 通道与 root-motion 处理。不能依赖当前选择、活动 Action 或默认 NLA 可见性。
- 将 constraint/driver 的最终姿势按目标采样率烘焙为 Unity 可读的变形骨变换曲线；控制骨、控制形状和 Blender 驱动不进入运行时依赖。对离散切换、非整帧接触或高频运动采用经 Unity 回读可复现的采样，不可因曲线简化丢失关键接触/节奏点。
- 若使用 BlendShape，采样已有、已交接目标键值的名称和权重曲线；动画不能改变形态键网格/拓扑或追加未经建模交付的新目标。
- 按[Unity 导入合同的形态曲线要求](../../unity-development-workflow/references/3d-character-unity-import.md#导出职责与统一基准)，对依赖网格的 BlendShape 动画同时验证同源形态网格、目标几何和权重曲线的导出/导入回读；纯骨架动画文件不默认承载这些曲线，无法证明所需通道时阻断相关 Clip。
- FBX 一次只导出合同指定 Clip；多 Clip 使用独立导出任务和独立产物/回读，避免 `All Actions`、未静音 NLA 或临时选择状态把多个动作混入同一 FBX。
- 烘焙副本与生产源分开；保存可编辑源 Action/NLA/约束、实际导出副本、依赖与完整配方，重新打开文件后可再次定位并导出同一 Clip。

## 位移、事件和运行时接入

- 每个 Clip 清楚标记 `in-place` 或 `root displacement`。记录实际 root 骨命名、坐标轴、起止位移、循环方式与允许的方向；Unity 导入设置及游戏内位移系统按共享合同确认唯一权威，禁止角色控制器与 root curve 双重驱动。
- 每个 Clip 独立定义速度、步幅/步频、FPS、帧数、过渡和循环接点；逐动作验证，不为批量一致性统一时长或 FPS。
- 表现事件记录时间/帧、语义、消费接口、可否重复、打断/对象池/多实例行为。事件只表达表现或向约定入口通知节点；伤害、命中、权威位移和状态判定仍由玩法处理。
- Unity 导入验证要检查 Avatar/骨骼映射、曲线路径、Loop Time/姿势匹配、Root Transform、BlendShape 绑定、事件与 Animator 接线，以及 SkinnedMeshRenderer/LOD。具体 Unity Editor/插件命令以共享导入流程及当时实际能力为准。

## 质量门与交付

每个动作按实际情境验证姿势轮廓、节奏/速度、关节变形、足手接触、循环首尾、过渡与打断、根位移、各适用 LOD 和所有需用 BlendShape 通道。至少覆盖会暴露问题的代表动作；简单待机不能代表完整动作集。几何/拓扑/形态目标缺陷回建模，蒙皮、骨架或控制约束缺陷回绑定，贴图/Shader 问题回纹理；每次变更后按实际依赖重验。

保留可重开的 `.blend` 和外链依赖、确认后的方案、动作清单、Actions/slots/NLA 状态、FPS/帧范围/采样参数、曲线与 root-motion 说明、事件映射、烘焙配方、逐 Clip 导出文件、许可与 Blender/Unity 版本。导出与 Unity 技术结果、专业审查、用户显示确认分项记录。截图和播放片段只交用户人工检查并附重点，不自动分析截图或片段，也不以工具运行成功作为视觉验收。

动作/FBX 属 V3 资源生产和导入，资源级 Prefab 在 V3 接入，正式场景/玩法运行验收属 V4。能力、输入、许可、曲线或回读证据缺失时标明 `BLOCKED` 或待验；不得把 2D 专用 `riggingDelivery`/`uwt_validate_2d_rigging` 用作 3D 骨架动画门禁，也不新增状态/schema。
