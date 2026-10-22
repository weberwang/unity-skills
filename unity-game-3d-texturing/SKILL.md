---
name: unity-game-3d-texturing
description: 通过 Blender MCP 为已交接的 Unity 6 URP 模型执行生产级材质制作、UV 贴图烘焙、绘制、PBR 通道打包与导出，再由 @Unity 导入验证。需要制作 BaseColor、Normal、Metallic、Roughness、AO、Smoothness 或衔接建模与贴图生产时使用；不负责修改生产几何、UV、绑定动画或最终 QA 放行。
---

# Unity 游戏 3D 纹理贴图

把已批准的 Visual Bible 转为绑定实际模型/UV 来源的生产级 PBR 纹理集与 URP 材质。先按[建模与贴图交接](references/model-texture-handoff.md)接收模型，再读 [Blender MCP 生产级 PBR 流程](references/pbr-texture-workflow.md)。纹理制作、烘焙、绘制、通道处理与导出统一使用 Blender MCP；[@Unity](plugin://unity@openai-curated-remote) 负责 TextureImporter、Material、Renderer/Prefab 接入与运行验证。

## 输入与职责

- 要求 Visual Bible、模型交接中的 `.blend` 与运行时低模、实际模型/UV 来源、材质槽映射、法线/切线与三角化策略、按需高模/Cage、LOD 用图策略、观看距离、纹理预算、透明需求、目标 Shader、许可与唯一 Unity 项目目标。
- 建模角色拥有几何、拓扑、UV、法线、材质槽结构与导出网格；本角色只读校验。发现 UV、法线、材质槽或顶点顺序问题时退回 `$unity-game-3d-modeling`，不静默修改；在纹理派生文件中仅制作材质、图像、节点与向既有槽位赋材质。
- 角色按[四角色共同交接](../unity-development-workflow/references/3d-character-handoff.md)对接绑定和动画：绑定交付带骨架/蒙皮的角色模型，动画交付同骨架 Clips；本角色只读骨架、权重、形态通道和动作，在约定的参考姿态/网格上烘焙，不能把当前动画姿态误作烘焙基准。保留 UV、槽位与各 LOD 用图，变形中的表面问题区分几何、权重和贴图归属后退修。
- 负责烘焙、PBR 主通道、URP 打包、TextureImporter、Material、自检与交接；最终 QA 由独立角色执行。
- Blender MCP 是已确定的制作路线，不为工具选择重复请求确认。纹理 brief 和需要用户取舍的材质外观、透明方案交给 `$unity-game-grilling`；已有授权内的制作与返修继续执行，需求变化、覆盖和破坏性操作按控制面处理。

## Blender MCP 与 Unity 路由

1. 先检查可复用的 Blender 实例与 MCP 连接，核对版本、活动文件、对象、未保存状态、外链图像、写入所有权及输出根。只有确认没有可复用实例后才考虑启动，不重置用户场景。
2. Blender MCP 属于本地 DCC MCP；按实际工具 Schema 核实网格/UV 只读检查、材质节点、绘制、烘焙、图像数据、通道打包、保存与导出能力。脚本接口须逐项验证所需 Blender API，不能用“可执行 Python”替代能力证据。
3. 所有正式纹理在 Blender MCP 内制作、烘焙、修整并导出；程序节点与绘制可结合，已有合法贴图可作输入。禁止回退到 Unity 程序贴图生成、外部图像生成供应商或独立图像脚本作为生产路线；缺少必要能力保持 `BLOCKED`。
4. 按 `unity:unity-cli` 发现唯一 Unity 项目、实际导入/材质命令与参数，并确认 Editor 稳定；Unity 只消费已导出的纹理和通道，不替代 Blender 制作或烘焙。
5. 源纹理、Blender 预览与 Unity 材质分别验证；截图由用户人工检查，技术参数或成功执行命令不能代替显示验收。

## 纹理小循环

1. 接收建模交付，按交接清单只读核对几何、UV、材质槽、高低模、法线/切线、蒙皮与 BlendShape；缺输入或结构不合格即退回建模，不能在贴图阶段重展 UV 或改变网格。
2. 冻结目标 Shader 的通道消费、纹理集/分辨率/位深、Texel Density、Padding、透明与内存预算，建立材质分区、表面尺度和参考标杆。
3. 在 Blender 的版本化纹理派生文件中建立可编辑节点、蒙版和图像，完成代表材质；按需在实际低模上进行高低模投射或程序材质烘焙，配置选择、活动目标、Cage/射线、采样与膨胀边。
4. 按目标通道集合制作 BaseColor、Tangent-space Normal、Metallic、Roughness、AO，以及按需的 Emission、Height、Opacity；Metallic 等数据与 Curvature、Thickness、ID 辅助图按实际验证的 Blender 方法提取，不能假定为内建烘焙类型。恒定通道可使用明确的 Shader 标量，不生成无用途的图像。
5. 处理投射遗漏、接缝、拉伸、细节尺度与透明边缘，保留独立主通道，在 Blender MCP 内由 Roughness 计算 Smoothness 并按目标 URP Shader 打包。保存节点、绘制图和所有依赖，不用预览截图或只存于内存的图像交付。
6. 回读实际导出文件，验证尺寸、通道、位深、颜色/数据语义、实际输出位置和打包数值；在 Unity 中配置 sRGB、NormalMap、MipMap、Streaming、压缩、平台覆盖与 Material 属性，回读实际映射与资源级 Prefab 引用。
7. 输出中性光、掠射光、目标场景、近远景和 LOD 切换证据及人工检查要点；分别记录技术结果、F2/F3 与用户显示确认，自检后交由视觉角色和 `$unity-game-qa-performance` 独立审查。正式场景接入在 V4，未经用户明确要求不启动 Standalone/Player 或真机。

## 生产质量底线

- 材质分区、表面尺度、粗糙度/金属度关系与细节须符合 Visual Bible 和实际模型；不以整模统一赋色、无目标的噪声叠加或套一个程序材质冒充完成，简单/风格化表面也按设计判断，不强行添加磨损或复杂度。
- Blender 节点材质须落成运行时可消费的 UV 图像；不得假定 Unity 能直接读取 Blender Shader、程序节点或显示变换。BaseColor 不混入固定光照，除非视觉规格明确批准风格化例外。
- 不用贴图掩盖错误形体、UV 或法线；技术检查、Unity 接入和用户视觉确认分别记录，缺证据不宣称正式贴图就绪。

## 安全与视觉约束

- 参考按已批准 Visual Bible 与许可使用；截图仅作参考或供用户人工验收，不自动分析截图或据此判定通过。
- 本流程不调用外部生成供应商、不上传项目文件、不付费生成；需要改变路线时由用户明确变更范围。
- Blender MCP 的任意代码执行沿用 DCC 边界：执行前展示并取得用户确认，已有精确脚本授权可复用。只允许 Blender API、数学、图像和只读网格操作，以及批准路径内的输入读取、派生 `.blend` 保存、烘焙和图像导出；禁止操作系统命令、网络、环境变量、凭据、任意文件读取和动态导入。
- 原始模型只读，纹理和 lookdev 写入版本化派生文件；同一模型/材质资源和 Unity 项目同时只允许一个写代理。

## 交付

交付版本化纹理 `.blend`、可编辑节点/蒙版/绘制图与依赖、按需烘焙中间图、独立主通道、URP 打包图、Material、TextureImporter 记录、实际模型/UV 来源及槽位/LOD 映射、配方、许可、技术结果与用户视觉确认状态。验收以实际贴图及材质满足用户要求为准，中途调整无需回改合同，不校验 SHA。缺模型交接、Blender 能力、烘焙方法、Unity 环境或必要证据时逐项记录 `BLOCKED`，不得推断 `PASS`；模型调整后的返修按[交接与变更范围](references/model-texture-handoff.md)执行。
