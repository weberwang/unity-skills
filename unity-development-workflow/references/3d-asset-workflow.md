# 3D 资产工作流

## 何时读取

场景声明为 3D，或任务涉及模型灰盒、正式 Mesh、拓扑、UV、PBR 贴图、URP 材质、LOD、Collider、Rig、动画前置、Prefab 和外部 DCC 工程时读取。2D Sprite、UI 位图和效果图拆分仍走位图资源流水线。

## 输入

- 已批准 Visual Bible、场景 manifest，以及 P0 结构、P1 高保真候选、P2 独立审查和 P3 完整资产地图的当前证据。
- 单位/轴向、尺寸、Pivot、拓扑、顶点/三角面、材质槽、UV、纹理、LOD、Collider、骨骼与运行预算。
- 当前资产登记、来源/授权、目标路径、Unity/DCC 版本、可用 MCP 工具组和现有模型源。

## 执行步骤

1. **P0 冻结 3D 结构**：以低模 Prefab 层级、Blockout 和文字说明确认对象职责、比例、模块拼接、相机距离、Pivot、碰撞草模及交互边界；状态依次为 `STRUCTURE_DRAFT -> STRUCTURE_AWAITING_USER -> STRUCTURE_APPROVED`。Visual Bible 未批准或 P0 未经用户确认时只允许修改灰盒，不得开始高保真或正式资产。
2. **P1/P2 确认目标外观**：基于 P0 生成高保真游戏/UI 候选，完成用户候选确认后，由视觉一致性、Unity 可实现性、玩法/可读性代理独立审查。P2 要求修改时必须回到新 P1 修订，再次用户确认和独立审查，不得直接沿用旧批准。
3. **P3 建立跨类型完整资产地图**：在 P2 通过原图上框选所有可见元素和排除项，并唯一分类：`MODEL_GEOMETRY` 进入建模；`PBR_TEXTURE_SET`、`MATERIAL` 进入贴图材质；`DECAL`、`BILLBOARD`、`UI_BITMAP`、位图 VFX 进入独立图片任务；`LIGHT`、`CAMERA`、`POST_PROCESS`、`SHADER`、`UI_TOOLKIT`、`CODE` 进入实现任务。拆分前逐项拷问用途、是否必须独立、复用与模块拼接边界、轮廓、遮挡补全、世界尺寸、Pivot、贴图/LOD/Collider 预算、交付形式、性能代价和目标槽位。Mesh 不是图片任务，PBR 贴图不得从效果图裁取；拷问结论与地图必须一起取得用户确认后才能进入 P4。
4. **发现能力并制作几何**：读取 MCP 工具组和 Editor 状态。低模、模块化、硬表面、灰盒和规则 Mesh 可由 `$unity-game-3d-modeling` 使用实际可用的 ProBuilder/脚本工具制作；高精雕刻、复杂有机重拓扑、精细绑定或工具无法可靠导出的任务转 DCC 移交。为每个 `MODEL_GEOMETRY` 项记录世界尺寸、1 Unity Unit 对应尺度、Y-up/Z-forward、拓扑、预算、排除项和验收角度，再收敛硬边、法线/切线、退化面、非预期非流形、Bounds、子网格、LOD、Collider 和适用骨骼前置。不得把 Unity 灰盒冒充 DCC 成品，也不得声明未验证的 FBX/OBJ 导出。
5. **制作贴图与材质**：模型拓扑与 UV 责任边界冻结后，把对应 P3 条目交给 `$unity-game-3d-texturing`；记录 UV0、静态物体 UV2、Texel Density、贴图集、色彩空间、通道打包、分辨率、压缩、MipMap、URP Shader、材质槽和变体。贴图依据 Visual Bible 独立制作，不复制参考截图或 P1 效果图的像素与材质风格。所有几何、贴图、材质操作记录为版本化 recipe 或 DCC 源变更。
6. **P4 逐项验证**：每个地图条目独立经历 `PLANNED -> GENERATING -> REVIEWING -> APPROVED -> IMPORTED -> VALIDATED`；建模与贴图代理分别自检，独立 QA/视觉/性能代理复核，并在隔离 Prefab、目标灯光、相机、动画和物理条件下验证。混合场景还必须等待图片和实现通道的全部条目通过；只有 P3 全部生产项均为当前版本 `VALIDATED` 才可产生 `ALL_ITEMS_VALIDATED`。
7. **P5 结构化装配与清理**：`ALL_ITEMS_VALIDATED` 前保持 `ASSEMBLY_BLOCKED`；解除后由单写集成代理按 P0 层级和 P3 槽位串行写入 Mesh、贴图、材质、LOD、Collider、Prefab、地址和依赖场景，状态先进入 `ASSEMBLY_READY -> ASSEMBLY_RUNNING`。不得把高保真渲染、资产地图标注图或单张合成图作为场景替身。正式结构化拼装完成后，删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象，清理序列化、场景、Prefab、地址和登记引用；保留已确认结构节点、稳定 ID 以及 `prefab-structure`、预览和批准记录等审计证据。只有清理验证为 `PASS` 后才可进入 `ASSEMBLY_VERIFIED`。现行资产不原地静默覆盖，新修订通过后再标记旧版本被取代。
8. **验证、批准与登记**：在 Windows 构建中检查轮廓、接缝、法线、闪烁、LOD 跳变、Collider、材质槽、纹理采样、Draw Call、Mesh/纹理内存和加载；保存 Console、Profiler/Frame Debugger、固定角度预览与实机证据。独立代理复核且用户最终批准当前外观后写不可变登记事实，再由单写集成者合并总资产登记。
9. **执行版本失效**：P0 变化使 P1-P5 失效；P1 变化使 P2-P5 失效；P2 要求修改时退回 P1；P3 条目、分类、规格或槽位变化使受影响 P4 条目与 P5 失效；模型拓扑、UV、材质槽、LOD、Collider、资源内容、GUID/地址或导入设置变化会清除相关 `VALIDATED` 与 `ALL_ITEMS_VALIDATED`，并使装配及运行证据失效；Visual Bible 变化使受影响场景从 P1 重启。旧审批仅作历史，不得跨版本继承。上游回退所需 Blockout 或碰撞草模从审计证据重建，不在运行时 Prefab/Scene 中保留低保真副本。

## 子代理角色与并行边界

- P0-P3 严格串行；P3 通过后，建模简报、参考/授权核查、贴图规格和测试设计可并行准备。模型拓扑与 UV 边界冻结前，贴图代理不得制作正式贴图。
- `$unity-game-3d-modeling` 单写模型几何、LOD、Collider 和模型 Prefab；`$unity-game-3d-texturing` 单写 UV 约定下的贴图、材质和材质变体。共享 Prefab 与场景接线由一个集成代理串行完成。
- 同一 DCC 工程或模型源始终只有一个写代理。不同模型可并行制作候选，但不得共享写入同一材质、贴图集、模型源、Prefab、场景或资产登记总表。
- 开发代理不能批准自己的资产；视觉、技术/性能审查和用户批准保持分离。

## 所需锁与 Unity 权限

- 开始写入前显式绑定唯一 Unity MCP 实例，确认 Editor 不在编译、导入、域重载、PlayMode、未保存或阻塞状态，只激活实际存在且必要的 `probuilder`、`scripting_ext`、`animation`、`profiling` 等工具组。
- Unity 侧取得目标 Mesh、Material、Texture、Prefab、`.meta`、地址和依赖场景独占锁；AssetDatabase 导入、Prefab 保存和场景接线串行。
- DCC 侧以规范化绝对路径锁定工程文件、外链纹理目录和导出目标；同一 DCC 进程/工程/源文件只允许一个写代理。DCC 单写锁与 Unity 导入锁不得由不同代理交叉持有，避免死锁和导入半成品。
- 未确认目标项目、工具能力、版本、路径所有权或用户批准时保持只读；禁止覆盖源文件、改变单位/轴向、批量重导入或执行未审查脚本。

## 机器可读输出

输出 P0 `prefab-structure.yaml`、P1/P2 目标外观与审查、P3 带编号 `split-plan.yaml` 完整资产地图、模型任务、可重建 recipe/DCC 源索引、贴图与材质任务、逐项状态、`ALL_ITEMS_VALIDATED`、P5 `prefab-assembly.yaml` 与清理验证、模型验证报告、质量报告、固定角度预览、Windows 实机证据、不可变登记记录和总资产登记引用。每项记录项目/源码/场景/Visual Bible/P0-P3/资源版本、唯一生产通道、目标槽位、MCP/DCC 工具与版本、输入输出路径、SHA-256、GUID/地址、预算、实际统计、审批、失效原因和取代关系；清理验证记录已删除对象、占位资源、引用扫描和保留审计证据。

只有工具真实生成且 Unity 重新导入验证通过时，才能把 FBX、OBJ、Mesh Asset 或 Prefab 列为交付物；否则输出 `BLOCKED` 的 DCC 移交包，包含 turnaround、尺寸、拓扑/UV/材质/LOD/Collider 预算和验收条件。

## 通过条件

- P0-P5 严格有序，P3 完整且分类唯一，全部通道达到 `ALL_ITEMS_VALIDATED`，P5 清理验证为 `PASS` 且结构化装配为 `ASSEMBLY_VERIFIED`，版本链未失效。
- 模型轮廓、比例、Pivot、轴向、拓扑、法线/切线、Bounds、LOD、Collider 和适用骨骼条件满足当前任务预算。
- UV、贴图、URP 材质、材质槽、通道、压缩和 MipMap 配置正确，无未解释接缝、拉伸、闪烁、z-fighting 或丢材质。
- Prefab 在目标场景和 Windows 构建中可复现，Console、功能、物理、视觉与性能证据为当前版本。
- 来源、授权、recipe/DCC 源、GUID/地址、独立审查、用户批准和登记链完整；正式拼装后运行时灰盒组件、占位 Mesh/Sprite/Material、临时低保真 Prefab/Scene 对象及其引用全部清零，结构节点、稳定 ID 和审计证据仍完整。

## 失败与恢复出口

- MCP/ProBuilder 无法满足雕刻、重拓扑、绑定、UV 或导出要求时停止写入，生成 DCC 移交包；不得用低质量近似冒充完成。
- P0、P1、P3 或最终外观被拒绝时保留版本和意见，回到对应阶段并按失效规则清除下游状态；P2 要求修改时必须返回 P1。
- P3 有漏项、重复通道或槽位不明时保持阻塞；任一 P4 项未达当前版本 `VALIDATED` 时不得开始 P5。
- P5 清理验证失败时保持 `ASSEMBLY_RUNNING`，删除残留低保真对象和引用后重新验证；不得为了回退保留运行时 Blockout 或占位资产。
- Unity 导入、法线、LOD、Collider、材质或预算失败时回到唯一责任代理修复，只重跑受影响项及下游验证。
- DCC 锁、Unity 锁、实例、路径所有权或版本冲突时释放已取得锁，保存只读诊断并回到调度；不得绕过锁、强制保存或覆盖稳定资产。
- DCC 工程损坏或导出不完整时恢复最近已验证源版本，重新导出到新修订路径并由 Unity 单写代理复验，不直接替换当前有效运行时资产。
