---
name: unity-game-3d-modeling
description: 通过 Blender MCP 按生产级流程制作 Unity 6 URP 游戏 3D 模型，完成结构建模、拓扑、法线、UV、LOD、碰撞与导出，再由 @Unity 插件导入验证。需要从 Visual Bible 和模型规格制作或修整正式模型时使用；禁止简单体块拼搭充当成品，不负责 PBR 纹理、绑定动画或最终 QA 放行。
---

# Unity 游戏 3D 模型制作

把已批准的视觉方向转成可编辑、可追溯、可导入 Unity 的生产级 3D 模型。先读 [Blender MCP 生产级建模流程](references/mcp-modeling-workflow.md)。模型几何与 PBR 贴图生产均统一通过 Blender MCP；模型和贴图按[共同交接](../unity-game-3d-texturing/references/model-texture-handoff.md)衔接，贴图工序见[生产级 PBR 贴图流程](../unity-game-3d-texturing/references/pbr-texture-workflow.md)。[@Unity](plugin://unity@openai-curated-remote) 负责导入器、Material/Renderer、资源级 Prefab 和运行验证，不承担模型或纹理创建。

## 输入与边界

- 要求已有 Visual Bible、用途、观看距离、单位、轴向、Pivot、拓扑/面数预算、材质槽、LOD、碰撞、导出格式、许可与目标 Unity 项目。
- 缺少模型规格、可用 Blender MCP、明确的 `.blend` 源和输出范围、唯一 Unity 项目目标或修改授权时，可先输出带假设标记的只读规格建议，但受影响写入保持 `BLOCKED`。
- Blender MCP 是模型和贴图的既定生产路线，不再重复选择工具。模型 brief 和需要用户取舍的轮廓/交互边界交给 `$unity-game-grilling`；已授权范围内的细化与返修继续执行，范围变化和破坏性操作按控制面处理。
- 本角色拥有几何、拓扑、法线、UV 版本冻结、材质槽结构、LOD、Collider 和静态模型导出；角色的骨架/蒙皮模型由绑定角色导出。`$unity-game-3d-texturing` 在版本化派生 `.blend` 中拥有材质节点、绘制、烘焙、通道打包和贴图导出。Unity 仅负责导入器、Material/Renderer、资源级 Prefab 和运行验证；最终验证交给 `$unity-game-qa-performance`。
- 绑定与动画按[角色共同交接](../unity-development-workflow/references/3d-character-handoff.md)交给 [`$unity-game-3d-rigging`](../unity-game-3d-rigging/SKILL.md) 和 [`$unity-game-3d-animation`](../unity-game-3d-animation/SKILL.md)。本角色准备关节拓扑、BlendShape 目标几何和静态源，绑定负责角色骨架/权重和蒙皮模型导出，动画负责动作与逐 Clip 导出；不负责 PBR 纹理、绑定动画或最终 QA 放行，VFX 另行分工。

## Blender MCP 与 Unity 路由

1. 先发现可复用的 Blender 实例和 MCP 工具，核对活动文件、对象集合、版本、未保存状态与写入归属。只有确认没有可复用实例后才考虑启动；不得重置场景或覆盖无关对象。
2. 所有正式模型均在 Blender MCP 中完成结构、拓扑、法线、UV、LOD、碰撞代理和版本化导出；PBR 贴图也固定由 Blender MCP 按[生产级贴图流程](../unity-game-3d-texturing/references/pbr-texture-workflow.md)制作。低模、模块化、风格化资产同样执行生产标准；禁止回退到 ProBuilder、Unity 基础体块拼装或外部生成式供应商创建模型或贴图。
3. 本地已有模型可作为只读输入，在 Blender MCP 内审计与修整；复用成品必须符合实际轮廓、结构、拓扑与许可要求。无法满足 Blender 所需能力时保持 `BLOCKED`，不得降级交付。
4. Blender MCP 属于本地 DCC MCP；工具名与参数以当前发现为准。仅暴露脚本执行时，逐项核实所需 Blender API 与实际结果，不能把“能运行 Python”视为全部建模能力就绪。
5. 按 `unity:unity-cli` 选择唯一 Editor、发现模型和贴图导入命令与参数。通过 AssetDatabase 或项目 Pipeline 导入 Blender 导出的模型及贴图；格式支持先验证，不能把图片导入命令当作模型导入器。
6. Blender 自检与 Unity 技术验证分别记录；视觉显示由用户人工检查截图并确认，不自动分析截图或据此宣称通过。未经用户明确要求，不启动 Standalone/Player 或真机验收。

## 场景小循环

1. 冻结模型 brief、Visual Bible 版本、资源 ID、主次形体、结构特征、观看距离与验收矩阵。
2. 在 Blender 中确定轮廓、比例与结构，可用 blockout 作为中间检查；它不是正式资源，禁止仅拼接立方体、球体、圆柱后赋材质就交付。
3. 按资产需要执行硬表面结构建模或有机雕刻，落实厚度、连接、转折、倒角与曲面；需要高低模时完成高模及重拓扑，直接低模路线也须有合理边流和真实结构。
4. 完成拓扑清理、法线/切线策略、UV 展开与检查，冻结实际 UV 位置与报告、材质槽及烘焙交接信息。按预算制作 LOD 和碰撞代理；不能用贴图或光照掩盖几何缺陷。
5. 保存版本化 `.blend` 与可复现模型配方，记录工具版本、关键操作、参数、实际源文件位置及派生关系。在独立导出副本上处理修改器、三角化和轴向，回读导出结果。
6. 串行接入 Unity，检查实际导入器（适用时为 ModelImporter）、比例、轴向、Pivot、法线、材质槽、LODGroup、Collider、Prefab 引用和 Console；正式场景接入仍在 V4。
7. 按[共同交接](../unity-game-3d-texturing/references/model-texture-handoff.md)交付 UV、槽位、适用的高低模/Cage、法线/三角化策略和各 LOD 用图信息；贴图返修涉及网格、UV 或槽位时由建模角色修复并按依赖范围复验。输出转台、线框、UV、碰撞、LOD 与目标场景截图及人工检查要点；技术自检后交给纹理角色或独立 QA，不自批。用户确认显示效果前保持视觉待验收。

## 生产质量底线

- 基础几何体仅可作为起始网格、中间 blockout 或碰撞代理；正式可见网格必须完成目标所需的轮廓塑造、结构细化、拓扑、法线和 UV。低面数不是跳过这些步骤的理由。
- 不以增加分段、细分、堆叠零件或光滑着色替代结构建模；不强制所有资产雕刻高模或全四边面，方法由目标形体、变形与烘焙需求决定。
- 几何、UV、预算、导出回读、Unity 导入证据以及用户显示确认分别列出；缺项、失败或只完成灰模时不标记正式资源就绪。

## 安全与写入规则

- 本流程不调用外部生成式模型供应商、不上传项目文件或付费生成；需要改变路线时先由用户明确变更范围。
- Blender MCP 若支持任意代码执行，沿用 DCC 脚本边界：执行前展示并取得用户确认，已有精确脚本授权可复用。脚本只允许 Blender API、数学与网格操作，以及批准路径内的 `.blend` 保存、模型导出和证据输出；禁止操作系统命令、网络、环境变量、凭据、任意文件读取和动态导入。
- 原始来源只读，修改写入版本化派生文件；同一 DCC 源、模型资源 ID、Unity 项目和导出目标同时只允许一个写代理。
- 覆盖、删除、重建 UV、改变顶点顺序或蒙皮信息前建立检查点并取得确认。

## 交付

交付版本化 `.blend` 源文件、运行时模型、资源级 Prefab、模型配方、许可、拓扑与法线报告、实际 UV 位置与报告、按需的高低模/烘焙交接、导入设置、LOD/Collider 指标、Unity 技术证据和用户显示确认状态。以实际模型满足用户要求为验收依据，中途调整无需回改合同，不校验 SHA。模型必须使用与资产类型匹配的登记分支，禁止为通过契约伪填 TextureImporter/Sprite 等图片字段。
