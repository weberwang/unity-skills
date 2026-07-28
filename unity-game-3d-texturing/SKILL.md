---
name: unity-game-3d-texturing
description: 通过 CoplayDev/unity-mcp 与经批准的本地 DCC MCP，为已冻结几何和 UV 的 Unity 6 URP 模型制作、烘焙、打包、导入并验证 PBR 纹理与材质。需要处理 UV 烘焙、BaseColor/Normal/Metallic/AO/Smoothness、URP 通道打包、TextureImporter 或 Material 接入时使用；不负责修改生产拓扑、绑定动画或最终 QA 放行。
---

# Unity 游戏 3D 纹理贴图

把已批准的 Visual Bible 转为绑定明确模型版本的 PBR 纹理集和 URP 材质。先读[PBR 纹理工作流](references/pbr-texture-workflow.md)。

## 输入与职责

- 要求 Visual Bible、冻结的模型和 UV 哈希、材质槽、观看距离、纹理预算、透明需求、目标 Shader、许可与唯一 Unity MCP 实例。
- 建模角色拥有几何、拓扑与 UV；本角色只读校验。发现 UV、法线、材质槽或顶点顺序问题时退回 `$unity-game-3d-modeling`，不静默修改。
- 负责烘焙、PBR 主通道、URP 打包、TextureImporter、Material、自检与交接；最终 QA 由独立角色执行。

## MCP 路由

1. 显式绑定唯一 Unity MCP 实例，检查 Editor 稳定状态。
2. `manage_texture` 只用于 solid、pattern、gradient、noise 等简单程序纹理或修改导入设置；不得宣称它能完成生产级 UV 烘焙。
3. `manage_material` 用于创建、读取和修改已批准 Shader 的 Unity Material，并接入纹理属性。
4. `asset_gen` 工具组的 `generate_image` 只能生成受 Visual Bible 约束的候选视觉素材，不能保证 UV 对齐、PBR 物理语义、通道精度或透明边缘。
5. UV 展开、高低模烘焙、Cage、切线空间校验和精确通道处理需要经批准且能力已发现的本地 DCC MCP。能力缺失时输出 `BLOCKED`。

## 纹理小循环

1. 冻结任务 brief、模型/UV 哈希、材质槽、贴图集合、分辨率、Texel Density、Padding、透明和性能预算。
2. 只读审计 UV、法线、切线、高低模对应、硬边、材质槽、蒙皮和 BlendShape；不合格即退回建模。
3. 配置 Cage、射线距离和匹配规则，烘焙 Normal、AO、Curvature、Thickness、ID 等中间图并检查接缝、偏斜和穿透。
4. 依据 Visual Bible 制作 BaseColor、Tangent-space Normal、Metallic、Roughness、AO，以及按需的 Emission、Height、Opacity。
5. 保留独立主通道，再生成 URP 运行时打包图；记录通道语义、转换公式、工具版本和哈希。
6. 串行导入 Unity，配置 sRGB、NormalMap、MipMap、Streaming、压缩与平台覆盖，创建 Material 并接入 Renderer/Prefab。
7. 在中性光、掠射光、旋转光、目标场景、近景、远景和 LOD 切换下取证；自检后交由视觉角色和 `$unity-game-qa-performance` 独立审查。

## 安全与视觉约束

- 截图只参考内容、构图与信息层级。不得照搬截图风格；所有纹理必须依据已批准 Visual Bible 重新生成。
- 上传参考图、调用外部生成供应商、变更 UV/顶点顺序、覆盖源文件和执行 DCC 脚本都需要用户确认。
- DCC 任意代码执行按高风险处理：脚本仅允许 DCC API、数学、图像和网格操作，禁止操作系统命令、网络、环境变量、任意文件读取和动态导入。
- 原始模型只读，纹理和 lookdev 写入版本化派生文件；同一模型/材质资源和 Unity 项目同时只允许一个写代理。

## 交付

交付烘焙中间图、独立主通道、URP 打包图、Material、Importer 记录、模型/UV 绑定哈希、许可、SHA-256、转台与目标场景证据。分别列出每个阻断原因；缺 Visual Bible、缺模型/UV 哈希、未发现 DCC 能力、缺 Unity 环境、结构化证据或类型化登记契约时使用 `BLOCKED`，不得推断 `PASS`。
