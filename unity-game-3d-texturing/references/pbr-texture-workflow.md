# PBR 纹理工作流

## URP 贴图约定

| 贴图 | 色彩空间 | 规则 |
| --- | --- | --- |
| BaseColor | sRGB | 不混入固定方向光照；AO 默认保持独立 |
| Emission（非 HDR 文件） | sRGB | 仅在视觉规格需要时生成 |
| Tangent-space Normal | Linear | Texture Type 设为 Normal Map；明确绿通道约定 |
| Metallic、Roughness、AO、Height | Linear | 作为数据纹理，不得启用 sRGB |
| URP 通道打包图 | Linear | R=Metallic、G=Occlusion、B=明确填充值、A=Smoothness |

Smoothness 必须由 `1 - Roughness` 计算，保留未打包的灰度主通道。通道打包图在 Unity 中关闭 sRGB，并按已批准的 URP Lit、Complex Lit 或 Shader Graph 属性接入；通道定义以 [Unity 6 URP 官方说明](https://docs.unity3d.com/ja/6000.0/Manual/urp/shaders-in-universalrp-channel-packed-texture.html)为准。

## UV 与烘焙门禁

- 默认使用 UV0 和 0–1 空间；非预期重叠、翻转和越界必须为零。镜像重叠逐岛声明，UDIM 必须有明确 Unity 消费方案。
- Texel Density、Padding、分辨率、采样和射线容差来自任务预算，不写死通用数值。
- 记录高低模匹配、Cage、射线距离、硬边、UV 缝、切线空间和膨胀边设置。
- 检查射线遗漏、Cage 穿透、偏斜、接缝、法线方向和 Mip 边缘；Skinned Mesh 额外验证权重、BlendShape 与顶点顺序未变。
- BaseColor 不烘焙固定光照；风格化例外必须在 Visual Bible 中批准。

## @Unity 与 DCC 能力边界

- [@Unity](plugin://unity@openai-curated-remote) 项目 Pipeline 命令：处理已发现并获准的简单程序纹理、Importer、Material 和 Renderer 接入；命令名与参数以 `unity:unity-cli` 当前发现结果为准。
- 已批准的外部生成式供应商：只生成视觉候选，不承担 UV、烘焙或物理正确性保证。
- 本地 DCC MCP：UV 检查、Cage、高低模烘焙、绘制与精确通道处理。若缺少对应能力，任务为 `BLOCKED`。

DCC 能力发现至少逐项记录连接标识、活动源文件、允许的输出根，以及 `inspect_mesh`、`inspect_uv`/`unwrap_uv`、`configure_cage`、`bake_maps`、`process_channels`、`export_textures` 的真实等价工具、参数 Schema、版本和只读/写入属性。名称可以因实现不同而变化，但不得用笼统的“可执行脚本”代替逐项能力证据。

不得将 DCC MCP 的任意代码执行当作普通建模命令。只运行已展示并批准的最小脚本，禁止 shell、网络、环境变量、凭据和项目外文件访问。

## Unity 接入

1. 将 BaseColor/Emission 作为颜色纹理，将 Normal/MOS/AO/Height 作为线性数据纹理导入。
2. Normal 使用 Normal Map 类型并记录源约定与绿通道处理；通过不对称掠射光实测方向。
3. 依观看距离和目标平台设置 MipMap、Streaming、Max Size、压缩及平台覆盖。
4. 使用批准 Shader 创建 Material，设置纹理与标量，确认材质槽和 Renderer 映射。标准 URP Lit/Complex Lit 使用通道打包图时，将同一纹理接入 Metallic 与 Occlusion 属性，并将 Smoothness Source 设为 Metallic Alpha。
5. 避免运行时隐式 Material 实例、粉色 Shader、丢失纹理、错误透明队列和未批准 Shader。
6. 在中性转台、正反面、掠射光、近远景、LOD 切换和目标场景捕获证据。

## 交接与失败

每个纹理版本绑定模型和 UV SHA-256，记录 DCC、Unity Editor、Unity CLI、Pipeline 与 Toolkit 版本、提示词、烘焙参数、主通道、打包语义、Importer、Material GUID、来源与许可。发现模型或 UV 变化后立即使旧烘焙和贴图证据失效并退回重做。缺少 Visual Bible、模型/UV 哈希、DCC 能力证据、UV 报告、通道定义、Unity 证据或许可时，逐项记录阻断原因，不得通过。
