---
name: unity-game-qa-performance
description: Unity 游戏的测试与性能角色。需要建立或执行 EditMode、PlayMode、场景冒烟、回归、输入、2D 多比例适配、3D 模型/PBR/绑定/动画/Prefab 独立验收、稳定性、Profiler、内存、渲染，以及用户选择的 Windows、Android、iOS/iPadOS 候选验证时使用。
---

# Unity 测试与性能

证据优先于主观结论。设备档位、帧率、内存、GC、Draw Call、加载或包体上限未经用户批准时，只报告实测数据与决策缺口。

## 输入与决策

读取 Work Item、验收、相关实现、测试、项目配置、GDD/TDD、当前候选包及已创建的数值、资源、音频与发行文档。性能预算、验收阈值、严重度、风险豁免或放行存在实质取舍时交给 `$unity-game-grilling`；未定义阈值时只报告实测结果，不自定 PASS。

按总控规则以用户要求和实际完成情况验收；合同提供目标与边界，中途实现调整无需回改合同，不校验 SHA。实际行为变化只重验受影响部分，并保留真实证据与用户人工确认。

## 执行与交接

测试、构建、Editor/Player 日志和 Profiler 入口使用 `unity:unity-cli`；Web、音频、TMP 与具体渲染问题分别路由到 `unity:optimize-web`、`unity:optimize-audio`、`unity:optimize-text-mesh-pro` 及适用的 URP 专项 Skill。本角色负责测试矩阵、证据真实性、预算判定和独立放行，不复制专项调优教程。

1. 在 QA 计划中预先定义 EditMode、PlayMode、场景主路径、模块边界和用户批准的目标平台。设备用例与档位只能提前规划；G2 `PASS` 前禁止安装或启动任何 Standalone/Player、真机或等价设备，也禁止采集设备视觉、输入、生命周期、性能或稳定性结果。
2. 按 `unity:unity-cli` 当前规则运行测试并等待任务终态；记录版本、用例数、失败详情与原始日志。
3. G2 前只做 Editor Profiler 趋势、静态预算、资源统计和构建日志检查，不产生目标设备性能 `PASS`。G2 `PASS` 后在 G3 按批准的平台工具链与候选制品采集帧时间、CPU/GPU、内存、GC、Draw Call、纹理、加载和包体。
4. 缺陷记录版本、场景、设备、复现步骤、预期/实际、证据、P0-P3、所有者和回归状态。
5. 2D/UI 小循环仅覆盖已批准方向内的代表性比例：横屏无需验证竖屏，竖屏无需验证横屏；双方向项目分别覆盖两种方向并验证切换。单方向覆盖该方向的参考、较窄和较宽比例、代表性安全区及连续 resize 轨迹，不要求跨方向旋转；桌面宽屏仅在批准范围内覆盖。逐例实测 Screen/Game View/backbuffer 或 RenderTexture、Camera `pixelRect`/投影、CanvasScaler 或 PanelSettings、`Screen.safeArea`、输入命中、关键 UI 矩形、状态、语言、稳定帧和截图；只存在组件、构建成功、单张截图或静态配置不能证明响应式通过。缺少真实测量时标记 `NOT_RUN` 或 `unverified`。
6. 对 `$unity-game-3d-modeling` 交付物独立检查来源版本、拓扑/法线/切线、比例轴向、材质槽、LOD、BlendShape 目标几何、Collider、Prefab 引用和架构预算；角色骨架/权重与动作按下述专用流程验收，模型生产代理的自检不能替代 QA。
7. 对 `$unity-game-3d-texturing` 交付物独立检查 UV 密度/重叠/Padding、Bake 射线与接缝、PBR 通道/颜色空间/法线方向、URP Shader/Importer/Material 映射、Mip/Streaming、纹理内存和授权证据。
8. 研发期 3D 验收使用 Unity Editor 覆盖中性光、掠射光、正反面、近远景、LOD 切换、动画变形与目标场景光照；批准平台实机转台、设备性能和稳定性只在 G2 `PASS` 后的 G3 执行。
9. 程序化文本对 `en`、`zh-CN`、`ja`、`ru`、`es` 分别验证真实字形、字体回退、基线、`single-line`/`wrap` 策略和容器适配，任何语言都不得截断。按[游戏内文案指导](../unity-development-workflow/references/game-copy.md)使用实际必要翻译中占用空间最长的文本与合理边界输入检查换行、容器适配和截断；验证可见内容与真实数据/显示条件一致，并保留必要条件和后果。场景证据只覆盖自身常驻 HUD；modal、popup、drawer、toast 必须使用独立 DISPLAY_LAYER 候选与打开→交互→关闭→恢复轨迹，宿主场景截图不能替代。
10. G2 为每个批准模块生成唯一 `modules.acceptance-complete` PASS 报告，并为每个批准平台生成唯一 `platforms.adaptation-complete` PASS 报告。G3 只能在该 G2 结果有效时，为每个平台冻结候选主制品并执行“平台设备档位 × 全部批准场景”笛卡尔积；每个用例绑定所属平台制品哈希。没有完整模块、平台、设备矩阵或真机证据时使用 `NOT_RUN` 或 `BLOCKED`，不得报告通过。

开发者自测可作为输入，不能替代独立 QA 批准。

## 美术质量与动态反馈验收

按[美术质量合同](../unity-development-workflow/references/art-quality-contract.md)独立检查主题贴合、受众适配、玩法可读、观看舒适、美术完成度，五项必须逐项 `PASS`。V4 对 `normal-play`、`repeated-feedback`、`event-peak`、`overlap-peak` 逐项记录必需或不适用及理由；适用项缺少真实运行证据时为 `NOT_RUN`，不推定通过。

验收材料绑定当前 Work Item、候选与场景/显示层，由控制面 `artExperienceAcceptanceRef` 引用。实际运行片段或截图交由用户人工检查显示效果并确认；QA 不自动分析截图或据此声称视觉通过。动态反馈的重复、叠加、中断、暂停和对象池生命周期按 [`unity-game-juice`](../unity-game-juice/SKILL.md) 的事件映射和当前 Unity 实测轨迹检查。

对 [`$unity-game-2d-rigging`](../unity-game-2d-rigging/SKILL.md) 的交付，读取其[制作与验收合同](../unity-game-2d-rigging/references/production-contract.md)，在现有质量门内分两轮独立检查，不增加阶段或状态。

3D 角色绑定与动画分别来自 [`$unity-game-3d-rigging`](../unity-game-3d-rigging/SKILL.md) 和 [`$unity-game-3d-animation`](../unity-game-3d-animation/SKILL.md)。按[角色共同交接](../unity-development-workflow/references/3d-character-handoff.md)和[Unity 角色导入合同](../unity-development-workflow/references/3d-character-unity-import.md)，资产交付前独立核对当前骨架/rest/bind、各 LOD 权重/形态、导出回读、Avatar/Clip/根运动、事件、挂点、材质和 SkinnedMeshRenderer Bounds；接入后在目标场景验证响应、过渡/循环/打断、位移单权威、暂停恢复、对象池和多实例等适用轨迹。动画专业审查与制作者分离，覆盖姿态/节奏材料；实际片段和截图交用户人工检查。技术报告、专业意见、F2/F3 和用户确认分开，不把 Node 静态检查当作角色播放已通过；缺实际 Blender/Unity 证据标记 `NOT_RUN`/`BLOCKED`。3D 不调用 `uwt_validate_2d_rigging`，不填写 2D 专用 `riggingDelivery`。

按[岗位协作](../unity-development-workflow/references/2d-animation-collaboration.md)接收 TA 的工具版本、作用范围、复现命令和原始报告，并独立复验；TA 编写的工具与制作者自检均不能自批。总控可在本角色中指定具备动画专业能力、且与被审资产制作者分离的动画质量负责人，负责动作标杆和专业审查材料；技术 QA、专业意见和用户显示确认分别记录。代理审查设计、时间轴、曲线／事件数据和材料覆盖，实际画面由人工判断，不自动分析截图。

- **资产交付前**：检查部件与骨骼映射、网格/权重和 Sprite Skin 状态、极端姿势、视角/方向/镜像、Clip 循环与 Controller 过渡/中断、事件与挂点合同、Prefab 保存与重导入、实例引用隔离和批准预算。代表动画须覆盖当前动作风险；通过资产检查仅表示该候选可交玩法接入。
- **玩法接入后**：在实际场景、相机和显示尺度下，验证输入到动作的响应、事件时机与次数、移动速度与步频/接触的一致性，以及适用的连续触发、打断、转向、暂停恢复、对象池复用和多实例。检查实际节奏是否满足使用场景，不能以孤立 Clip 播放或资产检查结果代替整体完成。

存在角度、手势或变形替换图时，资产轮检查基础部件与变体映射、Sprite 引用、每个变体适用的骨骼/网格/权重、切换绑定与保存重导入结果；不得默认所有变体可共用网格或权重。接入轮检查切换时机、退出/中断后的默认恢复、适用的对象池重置和多实例隔离，确认没有多个驱动者同时替换同一部件。两轮预览覆盖切换前、切换瞬间及切换后，正常速度与必要慢放交用户人工检查轮廓、关节、比例、颜色、层叠、运动轨迹及挂点是否连续；不能仅靠单张替换图或暂停姿势验收。补图或切换返修后复验受影响的动作、过渡和引用，未受影响工作不扩围。

工程轮使用 TA 交付的 `uwt_validate_2d_rigging` Job 和结构化报告独立复验，并运行 Toolkit 的 `Project.UnityWorkflow.Tests.Rigging` 检查器负例与角色回归夹具，具体见[工具说明](../unity-development-workflow/assets/unity-workflow-toolkit/Packages/com.project.unity-workflow-toolkit/README.md#2d-骨骼资产工程检查)。记录真实 Editor／已解析包版本、测试数量、失败详情和原始结果；技术夹具通过只证明其覆盖的资产与生命周期行为，正式角色仍按当前场景及人工视觉确认验收。不能把 Node 静态测试、测试代码存在或未实际运行的 Unity 用例报告为通过。

2D 骨骼资产交玩法前，按[骨骼交付门禁](../unity-game-workflow-control/references/rigging-delivery-gate.md)提交现有 Manifest 的 `riggingDelivery`：回读当前 Prefab/GUID/修订的工程报告，实际运行目标项目角色的必需 Editor PlayMode 情境，保存 `completed` 原始测试结果并逐项绑定测试全名；由独立 QA 记录复验人、时间和环境。工具夹具、静态 F3 PASS、启动成功、零测试或跳过项均不能代替。失败与未闭环 findings 阻断交接；将内容缺陷退原生产岗位，将缺证/陈旧证据作为本岗位 `revalidate`，修复后重跑受影响检查，再调用控制面复验。

两轮均采集覆盖动作全过程、循环接点和过渡的真实预览，必要时补充极端姿势、连接区细节和慢放，交用户人工检查部件组合无缝及动作节奏。按合同排查裂缝、露底、错位、双轮廓、明显色差/纹理/线条接缝、透明边缘和层叠跳变；不得自动分析截图或据此判定视觉通过，也不得以缩小画面、改机位或提高容差掩盖问题。缺图与连接区交视觉资产角色，权重/姿态/节奏/Controller 交骨骼角色，触发/判定/状态规则交玩法；跨界问题由总控裁决，返修后复验受影响动作和接入情境。

确认记录、来源版本、资源引用和预算必须对应当前候选；未在目标 Editor 实测的 API 能力或设备性能保留 `NOT_RUN`，不由静态检查推断通过。工程检查通过与用户视觉确认分别记录，未完成后者不得宣告视觉或整体验收通过。
