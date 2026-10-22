# Blender 角色绑定与动画的 Unity 导入合同

角色源绑定、蒙皮与动作由 Blender MCP 生产；[@Unity](plugin://unity@openai-curated-remote) 和 `unity:unity-cli` 只负责导入、Avatar/Clip 设置、角色 Animator、Renderer/Prefab 接入及 Editor 验证。先执行[角色共同交接](3d-character-handoff.md)，按项目实际 Blender、导出器、Unity 和包版本发现能力；不写死未经实测的命令或 API。

## 导出职责与统一基准

- 建模交付网格与静态源；绑定角色在派生文件中导出正式带骨架/蒙皮的角色文件；动画角色在动画派生文件中逐 Clip 导出同构运行时骨架的动画文件。角色网格不从纹理或动画工作文件覆盖，动画导出不修改原 Rig 的 rest/bind 或权重。
- 明确文件中对象/Armature 变换、单位、上轴/前轴、Root 路径、静置姿势、骨名/层级、bind 数据、三角化/法线/UV 与槽位；参考角色和所有动作必须遵循同一基准，禁止各阶段各自缩放或旋转抵消错误。绑定后不能为“归零”直接 Apply Transform 或改 rest pose。
- 保留可编辑控制 Rig，另在版本化导出副本上把约束、IK/FK、空间切换、驱动等结果采样到运行时骨架/实际支持的形状曲线。导出骨集合显式保留必要 Root、变形骨祖先与道具挂点，不盲用 Only Deform Bones 丢掉无权重但必需的节点；不把控制器骨、相机、灯光、参考或未用 Actions 混入产物。
- 根据实际 FBX 导出器配置采样、曲线简化、骨轴、骨集合、叶骨、对象选择和动作选择；逐 Clip 记录参数。Action/slot/NLA 的选择与静音/叠加状态必须明确，不能用 All Actions/NLA 自动批量导出后猜每个 Take 的身份。
- 正式模型与动画优先交付显式导出的 FBX，Unity 消费该文件，不依赖直接导入 `.blend` 触发本机转换。使用其他格式时，先证明当前项目导入器具备所需蒙皮、骨架、动画与形状曲线能力，不能因静态模型能显示就推断角色链可用。
- 单独动画文件与参考模型保留相同层级，按需启用 Preserve Hierarchy 并回读空 Root/中间节点，防止导入器剥离节点改变动画绑定路径。形态动画需另核实当前导出器的目标几何、通道和权重曲线支持；纯骨架文件不能默认承载依赖网格的 BlendShape 动画。需要携带形态网格时明确它是动画传输依赖，保持与基准模型同源，不覆盖正式角色网格。
- 记录 Armature 修改器与蒙皮算法、校正/驱动对源结果的影响；不能假定 Preserve Volume 等源端选项或任意驱动会由 FBX 和 Unity 原样复现。先通过当前链路的小范围姿势/曲线回读证明必要能力，再扩展全部 LOD/动作；必需通道缺失时阻断相关交付，不以 Unity 勾选 Import BlendShapes 代替导出证据。
- 每次导出重新导入隔离 Collection 或临时文件，回读网格/骨层级、rest/bind、权重、形态与 Clip 时间范围/曲线，并对照源采样的姿势、Root 轨迹与接触点数据。视觉偏差另提供实际播放片段供用户判断；文件存在、成功导出或 Blender 播放正确不能替代 Unity 导入检查。

## Model 与 Rig 导入

| 项目 | 必须设置/回读 | 失败处理 |
| --- | --- | --- |
| Model | 比例/轴向、法线/切线、网格与 UV、材质槽、BlendShape 按需导入、实际网格/骨/权重和导入警告 | 几何/UV/法线问题归建模，蒙皮/骨架问题归绑定，不在 Unity 改源几何补救 |
| Humanoid | 适合可映射人形且需重定向时使用；参考角色创建并验证 Avatar 的必需/可选骨映射、T-pose 配置和有效性 | 不以“导入无报错”推断有效；映射/姿态不满足则退修，不能把非人形强配成人形，也不能为 Avatar 配置暗改源 rest pose |
| Generic | 非人形或按原骨架播放的角色按需求使用；明确实际 Root 节点和同构层级 | 不假定 Generic 能像 Humanoid 跨不同骨架重定向；骨路径不一致需返修或在 Blender 显式适配 |
| 动作文件的 Avatar | 骨架、层级和角色基准匹配时明确复用参考 Avatar/来源；否则证明实际适配路线 | 不能仅凭同名骨或相同角色名复用；动画文件与基准不匹配时暂停相关导入 |
| Skin Weights | 按目标平台和项目骨数/影响数预算选择导入/运行时设置，回读实际权重、归一化和裁剪后结果 | 不把四影响写成所有项目通用规则；裁剪后重新检查代表姿势、各 LOD 与绑定结果 |
| Optimize Game Objects | 仅在当前 Rig/Avatar 导入设置支持时按需启用，列出运行时必须可访问的挂点，并通过实际可用的暴露设置保留变换，检查消费方可取到节点 | 不为优化移除装备、事件、IK 或特效需要的 Transform；不要求所有 Rig 类型或动画文件开启，配置改变后复验引用与运行行为 |

角色的骨架/Avatar 参考文件与动画文件导入顺序串行；Import/重导入稳定后回读 AssetDatabase、ModelImporter、Avatar、网格与 GUID，不猜或手造 GUID。`.meta` 和 Unity 管理资源保持同一所有权单元。

## 面部与 BlendShape 能力检查

- 明确 Basis、相对/绝对 Shape Key 模式、目标名、顶点顺序和几何来源。当前官方 FBX 导出实现包含相对 Shape Key 几何与采样权重曲线，不因旧手册缺失列表就否定整条路线；仍须核实项目安装版本与实际 MCP 导出能力。
- 先用代表目标/通道验证几何、权重端点、采样曲线、形态法线及 Unity Clip 绑定，再批量制作。记录 Blender 与 Unity 权重单位/范围，核对实际映射，不能把源值 0–1 与 FBX/Unity 常用百分比混用。项目使用绝对 Key 动画、in-between、顶点组掩码或独立 Shape Key Action/NLA 时分别验证；不假定 All Actions 会自动枚举 Key 数据块的动作。
- 角色模型导入回读 BlendShape 名称/数量和目标几何，动画导入回读相应曲线路径、权重范围与取样值，代表极限形变的法线和实际片段交用户检查。开启 Import BlendShapes 只表示导入设置，不证明文件实际含所需通道。
- Blender 回读器本身可能不支持某些 FBX 形态表示或法线，需与目标 Unity 的真实结果区分；对具体未支持/未证明的能力记录缺口并阻断相关交付，不能静默丢弃面部通道，也不把单一特性缺口扩大为所有骨骼动作失败。实现依据见[固定版本官方 FBX 源码](https://github.com/blender/blender/blob/fbe6228777e7d9afefcd61a413844e790ae75db7/scripts/addons_core/io_scene_fbx/export_fbx_bin.py)和 [Unity BlendShapes](https://docs.unity3d.com/6000.0/Documentation/Manual/BlendShapes.html)，项目仍以实际版本实测为准。

## Clip、根运动与事件

- 每个 Clip 回读实际名称、Take/来源、帧范围、采样率、时长、循环和姿态选项、Root Transform 的旋转/Y/XZ、偏移、Bake Into Pose 及导入压缩。循环类动作单独核对首尾与接触；一次性动作不能为了接缝而强制 Loop。
- in-place 和位移型动作逐 Clip 说明。指定唯一位移/朝向权威：由玩法位移并消费原地动作，或由已批准的 Root Motion 接口把动画位移交给玩法/碰撞系统；不能同时让 Transform 曲线、Animator 和角色控制器各自位移。
- Humanoid 与 Generic 的根提取机制按实际配置核对，明确 Root、骨盆和 Armature 对象动画各自的作用；Bake Into Pose 会影响根位移提取，不能无差别开启来消除漂移。用实际根轨迹、步幅/步频、角色速度和接触点验证结果，显示效果交用户验收。
- Blender 事件标记作为语义交接，不能假定自动成为 Unity AnimationEvent。由指定集成单写者配置 Clip 事件/其他项目事件通道，记录源帧到导入时间的映射、接收者、参数和循环/重播/中断时的触发规则，避免重复、丢失或离开状态后触发。
- FBX 内的 Clips、Avatar、Mesh 等子资源不能只凭容器 GUID 或同名定位；实际回读并在导入报告记录容器 GUID、子资源 local file ID、类型和名称，消费方回读真实序列化引用。重新导入或切分 Clip 后复验子资源身份；不要手写 local file ID，也不要为记录它向封闭的登记对象添加未定义字段。
- 压缩/降采样后对比基准曲线/姿势、Root 位移和事件时机，保留项目误差预算与结果；不只检查文件变小。必要挂点、BlendShape 和短促接触动作都纳入覆盖。

## 资源级 Prefab 与 V4 接入

- V3 由单写者组装角色资源级 Prefab：SkinnedMeshRenderer 的骨数组/RootBone、权重、材质槽、正式 Material、各 LOD、Avatar、Animator/Clips、挂点、必要形态通道与引用完整。禁止导入副本自带材质覆盖已完成的 PBR Material。
- 按真实动作范围核对 SkinnedMeshRenderer Bounds 与剔除结果，覆盖伸展、Root Motion、BlendShape 和各 LOD；不能用无限 Bounds 或长期强制离屏更新掩盖问题。调整预算与 Bounds 需记录技术结果并复验相关动作。
- 角色内部 Animator 的参数、状态、层/AvatarMask、过渡/退出时间/中断和重置由实施包指定给动画/集成负责人；玩法拥有触发与权威状态。V4 在实际场景验证连续触发、移动/动作过渡、转向、打断、暂停恢复、禁用/启用、对象池和多实例隔离等适用情境。
- 通过真实目标项目的 EditMode/PlayMode 检查引用、Avatar、Clip/事件、根运动、材质/LOD、Bounds 与生命周期，保留实际用例、数量、终态与原始日志；未发现检查能力时输出缺口，不能虚报执行。
- 专业审查覆盖表演意图、姿态/节奏、变形材料和覆盖范围；实际截图/片段仅供用户人工检查，不自动分析截图或据此通过。技术结果、F2/F3 和用户显示确认分开，实际 Blender/Unity 未执行时不得表述已验收。未经用户明确要求，不启动 Standalone/Player 或真机。

## 交付记录

保存实际源与派生产物、工具版本/导出配方、角色/动作身份、骨架/Avatar 来源、ModelImporter/Clip 属性、Material 与 Prefab/GUID、测试与截图/片段路径及人工确认状态。源放入 `ArtSource/<owner>/<assetId>/<version>/`，运行资源放入 `Assets/Art/Runtime/<module-or-scene>/`，证据位于实际 `evidenceRoot`，按[产物存放规则](artifact-storage.md)执行。失败按[共同交接的依赖范围](3d-character-handoff.md#返修与依赖范围)退原岗位，不对所有阶段无差别重做，不套用 2D 专用检查器或门禁字段。

## 官方事实来源

执行时优先核对项目实际版本的文档和导出器实现：[Blender Actions/Slots](https://docs.blender.org/manual/en/latest/animation/actions.html)、[Blender FBX 导出](https://docs.blender.org/manual/en/latest/files/import_export/fbx_legacy.html)、[Blender 官方导出实现](https://github.com/blender/blender/blob/main/scripts/addons_core/io_scene_fbx/export_fbx_bin.py)、[Unity Model/Preserve Hierarchy](https://docs.unity3d.com/6000.0/Documentation/Manual/FBXImporter-Model.html)、[Rig/Avatar/权重与优化](https://docs.unity3d.com/6000.0/Documentation/Manual/FBXImporter-Rig.html)、[Humanoid Avatar](https://docs.unity3d.com/6000.0/Documentation/Manual/ConfiguringtheAvatar.html)、[Generic 动画](https://docs.unity3d.com/6000.0/Documentation/Manual/GenericAnimations.html)、[Clip/根运动/事件](https://docs.unity3d.com/6000.0/Documentation/Manual/class-AnimationClip.html)及 [SkinnedMeshRenderer](https://docs.unity3d.com/6000.0/Documentation/Manual/class-SkinnedMeshRenderer.html)。手册、MCP 包装与当前导出器可能不同步，不能仅凭文档中的支持/缺失提示代替实际导出和导入回读。
