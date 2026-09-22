---
name: unity-game-3d-modeling
description: 通过 @Unity 插件、Unity CLI、ProBuilder 与项目 Pipeline 命令制作 Unity 6 URP 游戏 3D 模型；复杂拓扑、UV、LOD 或碰撞需要经批准的本地 DCC MCP 时负责安全移交。需要从 Visual Bible 和模型规格生成、搭建、导入、验收静态模型或 Prefab 时使用；不负责 PBR 纹理、绑定动画或最终 QA 放行。
---

# Unity 游戏 3D 模型制作

把已批准的视觉方向转成可追溯、可导入、可运行验证的 3D 模型。先读[3D 建模工具工作流](references/mcp-modeling-workflow.md)，再决定使用 [@Unity](plugin://unity@openai-curated-remote)、生成式供应商或经批准的 DCC MCP。

## 输入与边界

- 要求已有 Visual Bible、用途、观看距离、单位、轴向、Pivot、拓扑/面数预算、材质槽、LOD、碰撞、导出格式、许可与目标 Unity 项目。
- 缺少模型规格、唯一 Unity 项目目标、所需 Pipeline 命令或修改授权时，可先输出带假设标记的只读规格建议，但写入状态保持 `BLOCKED`，不得把建议视为批准。
- 模型 brief、外部供应商或 DCC 选择、付费与上传、轮廓/交互边界、UV 重建和顶点顺序变化都必须先交给 `$unity-game-grilling`，生成绑定当前模型候选的批准记录；未批准时禁止受影响写入或外部调用。
- 只负责几何、拓扑、法线、UV 版本冻结、LOD、Collider、模型导入和 Prefab 自检；PBR 纹理交给 `$unity-game-3d-texturing`，最终验证交给 `$unity-game-qa-performance`。
- 绑定、动画与 VFX 不因“3D”自动进入本角色。

## @Unity 与 DCC 路由

1. 按 `unity:unity-cli` 当前规则选择唯一 Editor，并读取实际命令和参数 Schema。Unity 不稳定、命令不存在或参数不匹配时停止写入。
2. 简单、模块化、低模或灰盒几何优先使用项目已安装的 ProBuilder API，并通过已发现的项目 Pipeline 命令生成可复现结构；不得猜测命令名称。
3. 需要 AI 候选模型时，先选择用户批准的生成式供应商。向用户说明供应商、成本、上传数据、许可和预计格式并取得批准后，才可提交异步生成任务；保存任务 ID 并按供应商协议查询状态，不阻塞等待。
4. 已有本地 FBX、OBJ、GLB 或 glTF 时，通过 AssetDatabase 或已发现的项目 Pipeline 导入命令处理项目内批准路径；不得把图片导入命令描述成模型导入器。
5. 复杂角色拓扑、精确 UV、雕刻、重拓扑或高级烘焙需要 DCC 时，仅使用用户已批准且能力已发现的本地 DCC MCP。缺少能力就 `BLOCKED`，不伪报完成。
6. 供应商输出、ProBuilder 输出和 DCC 输出都只是候选，研发期必须经过规格、许可与 Unity Editor/PlayMode 门禁；批准平台实机门禁只能在 G2 `PASS` 后的 G3 执行。

## 场景小循环

1. 冻结模型 brief、Visual Bible 版本、资源 ID 和验收矩阵。
2. 生成 blockout，在固定机位输出轮廓、比例和尺度证据，交由视觉与玩法审查。
3. 用户确认后完善几何、拓扑、法线、UV、材质槽、LOD 与碰撞；改变已批准轮廓或交互边界时退回确认。
4. 记录模型配方、工具/供应商版本、提示词、参数、源文件哈希和派生关系。
5. 串行接入 Unity：外部模型检查 ModelImporter、比例、轴向和 Pivot；ProBuilder 原生 Mesh/Prefab 不伪造 ModelImporter 证据。两条路径都检查材质槽、LODGroup、Collider、Prefab 引用和运行时警告。
6. 输出转台、线框、碰撞、LOD 与目标场景截图；自检通过后交给纹理角色或独立 QA，不自批。

## 安全与写入规则

- 外部生成式供应商默认关闭。任何供应商调用、图片上传和付费生成都必须逐任务取得用户确认；密钥只能保存在供应商或系统提供的安全存储中，禁止写入仓库、日志或任务记录。
- 只上传用户批准的项目文件；提示词与输出必须记录来源、许可和内容风险。
- DCC MCP 若支持任意代码执行，视为高风险能力。执行前展示并批准脚本；脚本只允许 DCC API、数学与网格操作，禁止操作系统命令、网络、环境变量、任意文件读取和动态导入。
- 原始来源只读，修改写入版本化派生文件；同一 DCC 源、模型资源 ID、Unity 项目和导出目标同时只允许一个写代理。
- 覆盖、删除、重建 UV、改变顶点顺序或蒙皮信息前建立检查点并取得确认。

## 交付

交付版本化源文件、运行时模型、Prefab、模型配方、SHA-256、许可、UV 哈希、导入设置、LOD/Collider 指标和 Unity 证据。模型必须使用与资产类型匹配的登记分支，禁止为通过契约伪填 TextureImporter/Sprite 等图片字段。
