---
name: unity-game-3d-modeling
description: 通过 CoplayDev/unity-mcp 的 asset_gen、ProBuilder 与模型导入能力制作 Unity 6 URP 游戏 3D 模型；复杂拓扑、UV、LOD 或碰撞需要经批准的本地 DCC MCP 时负责安全移交。需要从 Visual Bible 和模型规格生成、搭建、导入、验收静态模型或 Prefab 时使用；不负责 PBR 纹理、绑定动画或最终 QA 放行。
---

# Unity 游戏 3D 模型制作

把已批准的视觉方向转成可追溯、可导入、可运行验证的 3D 模型。先读[基于 MCP 的建模工作流](references/mcp-modeling-workflow.md)，再决定使用 Unity MCP、生成式供应商或经批准的 DCC MCP。

## 输入与边界

- 要求已有 Visual Bible、用途、观看距离、单位、轴向、Pivot、拓扑/面数预算、材质槽、LOD、碰撞、导出格式、许可与目标 Unity 项目。
- 缺少模型规格、唯一 Unity MCP 实例或修改授权时，可先输出带假设标记的只读规格建议，但写入状态保持 `BLOCKED`，不得把建议视为批准。
- 只负责几何、拓扑、法线、UV 版本冻结、LOD、Collider、模型导入和 Prefab 自检；PBR 纹理交给 `$unity-game-3d-texturing`，最终验证交给 `$unity-game-qa-performance`。
- 绑定、动画与 VFX 不因“3D”自动进入本角色。

## MCP 路由

1. 读取 `mcpforunity://instances`，按项目路径选择唯一实例并显式绑定。读取 Editor 状态和当前工具 Schema，Unity 不稳定、工具不存在或参数不匹配时停止写入。
2. 简单、模块化、低模或灰盒几何优先激活 `probuilder` 工具组，通过 ProBuilder 生成可复现结构。
3. 需要 AI 候选模型时激活 `asset_gen`，先调用 `generate_model(action="list_providers")`。向用户说明供应商、成本、上传数据、许可和预计格式并取得批准后，才可提交生成任务；按 job ID 轮询 `status`，不阻塞等待。
4. 已有本地 FBX、OBJ、GLB 或 glTF 时使用 `import_model_file` 导入项目内批准路径；不得把图片导入工具描述成模型导入器。
5. 复杂角色拓扑、精确 UV、雕刻、重拓扑或高级烘焙需要 DCC 时，仅使用用户已批准且能力已发现的本地 DCC MCP。缺少能力就 `BLOCKED`，不伪报完成。
6. 供应商输出、ProBuilder 输出和 DCC 输出都只是候选，必须经过规格、许可与 Unity 实机门禁。

## 场景小循环

1. 冻结模型 brief、Visual Bible 版本、资源 ID 和验收矩阵。
2. 生成 blockout，在固定机位输出轮廓、比例和尺度证据，交由视觉与玩法审查。
3. 用户确认后完善几何、拓扑、法线、UV、材质槽、LOD 与碰撞；改变已批准轮廓或交互边界时退回确认。
4. 记录模型配方、工具/供应商版本、提示词、参数、源文件哈希和派生关系。
5. 串行接入 Unity：外部模型检查 ModelImporter、比例、轴向和 Pivot；ProBuilder 原生 Mesh/Prefab 不伪造 ModelImporter 证据。两条路径都检查材质槽、LODGroup、Collider、Prefab 引用和运行时警告。
6. 输出转台、线框、碰撞、LOD 与目标场景截图；自检通过后交给纹理角色或独立 QA，不自批。

## 安全与写入规则

- `asset_gen` 默认关闭。任何外部供应商调用、图片上传和付费生成都必须逐任务取得用户确认；密钥只能保存在 Unity Editor 提供的安全存储中，禁止写入仓库、日志或任务记录。
- 只上传用户批准的项目文件；提示词与输出必须记录来源、许可和内容风险。
- DCC MCP 若支持任意代码执行，视为高风险能力。执行前展示并批准脚本；脚本只允许 DCC API、数学与网格操作，禁止操作系统命令、网络、环境变量、任意文件读取和动态导入。
- 原始来源只读，修改写入版本化派生文件；同一 DCC 源、模型资源 ID、Unity 项目和导出目标同时只允许一个写代理。
- 覆盖、删除、重建 UV、改变顶点顺序或蒙皮信息前建立检查点并取得确认。

## 交付

交付版本化源文件、运行时模型、Prefab、模型配方、SHA-256、许可、UV 哈希、导入设置、LOD/Collider 指标和 Unity 证据。若当前项目登记契约只有 TextureImporter/Sprite 字段，将模型登记标记为 `BLOCKED` 并请求类型化契约，禁止伪填图片字段。
