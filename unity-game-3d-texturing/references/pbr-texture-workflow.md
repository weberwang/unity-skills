# Blender MCP 生产级 PBR 流程

纹理材质设计、节点与绘制、烘焙、修整、通道打包和图像导出统一在 Blender MCP 内完成。Unity 插件只负责导入、运行时 Material 和 Renderer/Prefab 接入及验证；不得回退到 Unity 程序贴图、外部生成供应商或独立图像脚本生产正式贴图。

## 接收模型与能力发现

先执行[建模与贴图交接](model-texture-handoff.md)。几何、UV、法线、三角化、槽位和高低模/Cage 是建模输入；贴图角色只读检查，缺陷按对象和依赖范围退回建模，不能自行重展 UV、改变网格或重新导出运行时模型。

- 先发现可复用的 Blender 实例与 MCP 连接，核对版本、活动 `.blend`、未保存状态、对象/Collection、外链/内存图像和可写根。没有可复用实例才按授权考虑启动；不重置用户场景。
- 逐项核实当前工具及参数 Schema 能否完成材质节点/图像/UV 只读检查、程序材质或绘制、烘焙设置与执行、通道数值处理、源保存、图像导出和导出回读。以实际 Blender 版本及 API 为准，不能把笼统的“可执行脚本”当成能力就绪。
- 所需 Cycles 烘焙、图像精度、输出格式或目标图像操作能力不足时，受影响工序保持 `BLOCKED`。不能用材质球截图、渲染成图或未落盘图像替代 UV 贴图。
- 在版本化纹理派生 `.blend` 中工作，模型输入只读；记录真实工具/版本、目标对象与图像、允许路径和操作范围。脚本只在已展示并批准的范围内执行，已有精确授权可复用；禁止 shell、网络、环境变量、凭据、任意文件读取和动态依赖。

## 生产工序

| 工序 | 工作要求 | 退出证据 |
| --- | --- | --- |
| 材质与预算设计 | 按 Visual Bible 分材质，明确物理/风格化表现、表面尺度、观看距离、贴图集合、Shader、透明和预算 | 纹理集与模型槽位/UV/LOD 逐项映射，分辨率、位深、采样、Padding 与内存预算可追溯 |
| 可编辑材质制作 | 在 Blender MCP 中建立节点、蒙版、可复用材质组及绘制图；先制作代表表面，再扩展到相关部件 | 实际模型上有可编辑源，材质差异和细节服从结构与使用情境；不靠随机噪声或统一赋色代替完成度 |
| 烘焙准备 | 只读复核运行时低模、UV、硬边/法线、三角化和高低模对应；配置实际图像目标、活动对象、材质节点、匹配分组、Cage/射线和膨胀边 | 明确使用高低模投射、同模程序材质转 UV，或无需烘焙的绘制路线；不适用项说明原因 |
| 基础图与辅助图 | 按实际需要烘焙 Tangent-space Normal、AO 等；辅助 Curvature、Thickness、ID 记录已验证的生成方式；BaseColor 分离颜色与光照 | 烘焙对象/目标图像、参数与输出可定位，辅助图不被冒充为内建烘焙类型，关键产物已保存 |
| 表面细化与修整 | 制作颜色、粗糙度、金属度、法线及按需的发光/透明/高度；处理投射遗漏、接缝、偏斜、表面尺度和 Mip 边缘 | 主通道独立保存，材质层/遮罩来源和修改可追溯；UV/几何缺陷退回建模，不能用涂抹掩盖 |
| 打包与导出回读 | 在 Blender MCP 内按目标 Shader 合并通道，保存主通道与打包图，重新加载实际导出文件 | 尺寸、通道/Alpha、位深、色彩语义、像素数值和路径符合合同，打包与反算关系可核对 |
| Unity 接入与验收 | 串行配置实际 TextureImporter、Shader、Material、槽位/LOD、资源级 Prefab 与平台设置 | 导入属性、引用和预算有技术证据；截图与显示检查单交用户确认，正式场景在 V4 接入 |

表面层次由目标材质决定，不要求所有资产添加磨损、脏污或多层噪声；高低模烘焙、辅助图和额外通道按需求执行。恒定通道可按 Shader 使用明确标量或规范的默认值，不能为了凑图生成无用途的文件；需要空间变化的通道必须有真实贴图。不假定 Blender 节点能随 FBX/glTF 完整转为 Unity 材质，运行时使用实际导出的图像与显式属性映射。

## URP 贴图约定

| 贴图 | 色彩空间 | 规则 |
| --- | --- | --- |
| BaseColor | sRGB | 不混入固定方向光照；AO 默认保持独立 |
| Emission（非 HDR 文件） | sRGB | 仅在视觉规格需要时生成 |
| Tangent-space Normal | Linear / Non-Color | Unity Texture Type 设为 Normal Map；记录烘焙切线空间与绿通道约定 |
| Metallic、Roughness、AO、Height、独立 Opacity | Linear / Non-Color | 作为数据纹理，不得启用 sRGB；Opacity 合入 BaseColor Alpha 时 RGB 仍按颜色处理 |
| 标准 URP Lit/Complex Lit 通道打包图 | Linear / Non-Color | R=Metallic、G=Occlusion、B=明确填充值、A=Smoothness；消费属性必须逐项映射 |

Smoothness 在 Blender MCP 内由 `1 - Roughness` 计算，保留未打包的灰度主通道。打包前统一尺寸、UV 映射和数据语义，不能把 sRGB 编码数据直接反算或把显示变换烘入数据图；导出禁止把 AgX/Filmic、曝光、灯光或视口后处理写入 Normal/Metallic/Roughness/AO 等数据。数值检查针对图像数据，不用截图代替。

通道打包图在 Unity 中关闭 sRGB；以上组合针对标准 URP Lit/Complex Lit 的明确消费方式，不假定其他 Shader 或 Shader Graph 遵循同一布局。以项目实际 Shader 的属性和版本核对；参考 [Unity 6 URP 通道打包说明](https://docs.unity3d.com/ja/6000.0/Manual/urp/shaders-in-universalrp-channel-packed-texture.html)。

Blender 数据图的输入和烘焙目标设为 `Non-Color`，颜色图按实际编码与工作空间设置；图像节点的 Color Space 影响读取方式，见 [Blender Image Texture](https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/image.html)。导出回读必须核对实际编码，不能只凭节点标记判定文件正确。

## UV 与烘焙门禁

- 默认使用运行时 Shader 消费的 UV0 和 0–1 空间；非预期重叠、翻转和越界必须为零。镜像重叠逐岛声明烘焙隔离/用图方案，UDIM 必须有明确 Unity 消费方案，不能只在 Blender 中正确显示。
- Texel Density、Padding、分辨率、采样和射线容差来自任务预算，不写死通用数值。
- 高低模投射时记录源对象/目标低模、Selected to Active、活动对象、各材质的活动图像节点、Cage、射线距离与隔离分组，防止投射到错误零件或写错图像；不需要高模时使用同模烘焙或绘制路线，不虚造高模。
- 在最终运行时低模和约定三角化/法线基准上烘焙 Normal，记录切线空间、UV 缝与硬边。配置所需 Margin/膨胀边；AO 与通道颜色烘焙分别设置，BaseColor 不含 Direct/Indirect 光照贡献。
- 对 Metallic、颜色或其他参数，可在纹理派生文件的临时材质中将指定通道接到无光照 Emission 输出，再用 Emit 烘焙到活动目标图像；数据目标保持 Non-Color，完成后恢复生产节点连接。用 Diffuse 提取 BaseColor 时仅启用 Color、关闭 Direct/Indirect，并核对实际提取值；不得用 Combined 烘焙替代基色。
- Curvature、Thickness、材质 ID 等仅在有实际用途且当前 Blender 版本具备已验证的节点/几何分析/指定通道烘焙方法时产出；它们不被假定为通用 Bake Type。无法实现的必要辅助图明确阻断，不伪报已烘焙。
- 技术检查覆盖对象对应、图像完整性和配置；投射遗漏、Cage 穿透、偏斜、接缝、法线方向和 Mip 边缘的显示效果以截图和检查单交用户人工确认。Skinned Mesh 另核对权重、BlendShape 与顶点顺序未变。
- BaseColor 不烘焙固定光照；风格化例外必须在 Visual Bible 中批准。

烘焙类型、Selected to Active、Cage、活动图像和 Margin 的实际支持以项目 Blender 版本及 [Cycles 烘焙手册](https://docs.blender.org/manual/en/latest/render/cycles/baking.html)为准，不假定所有 MCP 包装都实现同一入口。

## 源保存与导出回读

- 源按[产物存放规则](../../unity-development-workflow/references/artifact-storage.md)写入 `ArtSource/<owner>/<assetId>/<version>/`，包含纹理 `.blend`、可编辑图像/蒙版、节点与外链依赖；正式图像位于 `Assets/Art/Runtime/<module-or-scene>/`，证据位于实际 `evidenceRoot`。遵守实施包单写者，不覆盖建模源或其他角色产物。
- 每次烘焙/绘制后保存实际图像，`.blend` 保存不等于所有图像均已落盘；明确哪些图像内嵌、哪些外链，并保证交付可重开且没有临时路径依赖。
- 回读实际导出文件，检查尺寸、位深、通道数、Alpha、可解码性与非有限值；数据图验证合法范围，打包图抽样核对各主通道及 `A = 1 - Roughness`，核实透明/发光范围满足规格。不得把无效空图或导出成功当作内容合格。
- 为 Normal、Mask 和带 Alpha 图像分别考虑格式与压缩预算；保留无损主通道，平台压缩与缩放在 Unity 回读后再核对。不同 LOD 若 UV/纹理布局不同，按交接映射分别生产或验证，不能默认共享贴图。

## Unity 接入

1. 使用 [@Unity](plugin://unity@openai-curated-remote) 与 `unity:unity-cli` 当前发现的导入/材质命令；将 BaseColor/非 HDR Emission 作为颜色纹理，将 Normal/打包图/AO/Height 作为线性数据纹理导入，HDR Emission 按实际编码处理。
2. Normal 使用 Normal Map 类型并记录源约定与绿通道处理；用不对称掠射光证据供用户检查凹凸方向，不自动判定截图通过。
3. 依观看距离和目标平台设置 MipMap、Streaming、Max Size、压缩及平台覆盖。
4. 使用批准 Shader 创建 Material，设置工作流、纹理与标量，回读材质槽和 Renderer 映射。标准 URP Lit/Complex Lit 的 Metallic 工作流使用上述打包图时，将同一纹理接入 Metallic 与 Occlusion 属性，将 Smoothness Source 设为 Metallic Alpha，并记录 Smoothness/Occlusion 等乘数；要求 Alpha 数值直接作为光滑度时 Smoothness 设为 1。Shader Graph 或其他 Shader 按其实际属性单独映射；Height/Opacity 只在目标 Shader 支持时接入。属性与乘数见 [URP Lit](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/lit-shader.html) 和 [Complex Lit](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/shader-complex-lit.html)。
5. 避免运行时隐式 Material 实例、粉色 Shader、丢失纹理、错误透明队列和未批准 Shader。
6. 回读 TextureImporter 的实际颜色/数据设置、压缩/Alpha/平台覆盖、Material GUID/属性、纹理引用和各 LOD 用图，按预算记录显存估算；在 Editor/PlayMode 验证必要引用和运行行为。
7. 在中性转台、正反面、掠射光、近远景、LOD 切换和目标场景捕获证据及检查要点。截图由用户人工检查，F2/F3 技术结果与显示确认分开；不自动分析截图或判定通过。正式场景接入在 V4，未经明确要求不启动 Standalone/Player 或真机。

## 交接与失败

材质按[登记 Schema](../../unity-development-workflow/schemas/registration-record.schema.json)使用 `materialMode=PBR` 和实际的 `workflowMode=Metallic|Specular|Custom`；`textureBindings` 只记录所需贴图，金属/镜面工作流不互填对方的标准槽。实际 Shader 属性名作为 `shaderProperties` 的键，值为 `{type: Float|Range, value: 数值}`、`{type: Int, value: 整数}`、`{type: Color|Vector, value: 四个数值}` 或 `{type: Texture, value: {resourceId, address}}`，类型化记录恒定值、默认值及 Shader Graph 映射。Range 的真实范围另从 Shader/报告回读，不假定统一 0–1；属性类别见 [Unity ShaderPropertyType](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Rendering.ShaderPropertyType.html)。PBR 摘要至少有真实贴图或非空属性；`Custom` 必须提供属性映射。额外语义和导入结果放入实际报告，再由单写者合并资源总表，不能把没有空间变化的通道伪造为四张必需贴图。

每个纹理版本记录实际模型和 UV 来源、对象/槽位/LOD 对应，以及 Blender/MCP、Unity Editor、Unity CLI、Pipeline 与 Toolkit 版本、源依赖、材质/绘制配方、烘焙参数、主通道、打包语义、导出文件、Importer、Material GUID、来源与许可。具体输入、回交和模型变化后的局部重验以[共同交接清单](model-texture-handoff.md)为准，不暗改模型、UV 或槽位；无需回改合同或比对 SHA。

缺少 Visual Bible、实际模型/UV 来源、Blender 所需能力、UV 报告、通道定义、Unity 技术证据或许可时逐项记录 `BLOCKED`。视觉未确认时明确待用户验收，不以节点搭好、图像导出成功或技术通过宣称正式贴图就绪。
