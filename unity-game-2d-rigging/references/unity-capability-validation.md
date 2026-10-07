# Unity 制作能力与验证

此参考规定实现前如何验证目标项目能力；它不是未验证的 C# 模板。Unity / 包版本、Editor 命令和资产 API 均以目标项目实际解析结果为准。

## 版本与依赖

1. 读取 `ProjectSettings/ProjectVersion.txt`、`Packages/manifest.json`、`Packages/packages-lock.json` 和实际渲染管线，记录包的解析版本。
2. 骨骼蒙皮需要 `2D Animation`。只有项目决定使用分层 PSD / PSB 导入路线时才增加 `2D PSD Importer`；完整 PNG 输入本身不需要该 Importer。
3. 仅安装经能力检查确认必需的包。将去重后的包 ID 和目标版本展示给用户后，按既有授权调用 `unity:unity-package-management`，再从 manifest / lock 与 Editor 中验证结果。不要手改 manifest、升级 Unity 或修改无关依赖。
4. 先发现并复用项目已打开的 Editor。遵循 `unity:unity-cli` 发现流程读取已连接状态和命令目录；根据实际参数目录调用命令。仅当目录确实包含 `eval` 时才使用它，不假设 `eval_file`、菜单或其他入口存在。

通过 Editor 执行代码时遵循 `unity:sprite-editor`：能力检查失败就停止相关写入；不手改 `.meta` 或 Unity YAML；按发现的 `eval` 语法传参。若入口接受语句块，避免 `using` 指令并使用完整类型名。不得用示例代码或工具成功消息推定目标版本支持某项能力。

## API 可用性边界

以下 Unity 官方页面是 API 名称的查找锚点，链接所示文档包版本不是目标项目的固定版本。实施前在目标包对应文档与实际编译 / Editor 中核对同名入口。

| 制作能力 | 可核对的公开入口 | 目标项目必须实际验证 |
| --- | --- | --- |
| Sprite 元数据 Provider | `ISpriteEditorDataProvider` 的初始化、子 Provider、`Apply`；[官方 API](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteEditorDataProvider.html) | 选中 Importer 能创建 Provider，保存和重新导入后数据仍在 |
| 骨骼数据 | `ISpriteBoneDataProvider.SetBones`；[官方 API](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteBoneDataProvider.html) | 骨骼层级、索引、绑定姿势、读取回来的顺序与 Transform 映射一致 |
| 网格与权重数据 | `ISpriteMeshDataProvider.SetVertices/SetIndices/SetEdges`、`Vertex2DMetaData.boneWeight`；[网格 API](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteMeshDataProvider.html)、[顶点元数据](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.Vertex2DMetaData.html) | 顶点、三角形索引、骨骼索引、权重、绑定矩阵和导入结果一致 |
| Sprite Skin 绑定 | 核对目标版本 `SpriteSkin`、`SpriteSkinState` 上的 root bone、bone transforms、bind pose 和错误状态 API；[SpriteSkin](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/api/UnityEngine.U2D.Animation.SpriteSkin.html)、[状态](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/api/UnityEngine.U2D.Animation.SpriteSkinState.html) | 实际变形、绑定状态、骨骼数组映射、保存和重载有效 |
| 动画曲线与事件 | `AnimationUtility.SetEditorCurves/SetAnimationEvents`；[官方 API](https://docs.unity3d.com/6000.0/ScriptReference/AnimationUtility.html) | Transform 路径、属性、Clip 绑定、循环和事件实际播放正确 |
| Controller 与 Prefab | `AnimatorController`、`PrefabUtility.SaveAsPrefabAsset`；[AnimatorController](https://docs.unity3d.com/6000.0/ScriptReference/Animations.AnimatorController.html)、[Prefab 保存](https://docs.unity3d.com/6000.0/ScriptReference/PrefabUtility.SaveAsPrefabAsset.html) | 状态 / 参数、对象引用、Prefab 保存及实例重载有效 |

Skinning Editor 的 Auto Weights UI 与公开权重写入 API 是不同能力；公开 Setter 不证明存在可复用的自动权重算法。候选算法可在隔离的最小样例中实现和验证；只有样例通过实际形变、索引、数值与重载检查后才可用于正式生产。样例失败记为 `FAIL` 并修复；缺少必需能力或输入而无法尝试记为 `BLOCKED`；尚未执行的检查记为 `NOT_RUN`。不得伪造权重或 C# 模板。若使用目标版本的 `BoneWeight`，遵守其文档中的影响槽位和数值限制。参阅 [Skinning Editor](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/manual/SkinningEditor.html) 与目标版本对应 API。

2D IK 是否属于 2D Animation 包以及所需程序集要从当前解析包核实；历史包名不能作为安装依据。只有合同要求 IK 时才评估，先验证求解顺序和 Animator 对同一关节的写入所有权。查阅 [2D Animation 官方变更记录](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/changelog/CHANGELOG.html) 与实际版本 API。

## 最小资产链路验证

在目标版本、当前 Work Item 允许路径和隔离资源目录中完成下列样例，先验证写入、重载，再验动作表现：

1. 用少量正式部件、两三根骨骼和一种确认过的蒙皮方式创建 Sprite、骨架、网格、权重与 Sprite Skin。
2. 创建一个短 Clip、Animator Controller 和角色 Prefab；检查目标版本报告的 Sprite Skin 状态、骨骼映射和资源引用。
3. 在代表性与极端关节姿势检查形变、裂缝、层叠、透明边缘和连接区。
4. 保存资源，重新导入并重载 Prefab；在 Editor / PlayMode 实际播放，验证曲线、循环、事件、挂点。
5. 若正式工作流会并存多个角色实例，则在同一 Prefab 的两个实例验证播放状态与事件互不污染。
6. 记录 Unity / 包版本、命令入口、实际 API、产物路径与 GUID、Console、检查状态和可查看预览。

每一项分别报告 `PASS`、`FAIL`、`BLOCKED` 或 `NOT_RUN` 及证据：实际验证失败为 `FAIL` 并修复，缺少必需输入或能力导致无法尝试为 `BLOCKED`，未执行的检查为 `NOT_RUN`。任何非 `PASS` 项都不能宣称自动化链路通过。禁止以手拼 `.meta`、序列化 YAML、静态姿势图或命令返回 0 代替真实 Editor 验证；不自动启动 Standalone / Player 或真机。
