# Unity 原生 2D 骨骼制作技能规格草案

本规格定义拟新增的 `unity-game-2d-rigging`：使用 Unity 原生 2D Animation 和 Sprite Skin，从完整角色图出发，协调部件生产，完成骨架、网格、权重、动画与角色 Prefab。视角、风格和动作随项目确定，交付可编辑资产及玩法接入合同。

本规格用于创建 `unity-game-2d-rigging` 技能入口、制作参考和现有技能交接。目标项目中的编辑器实现与最小技术样例仍属于使用该技能时的实施范围，不能由技能结构检查推断已经制作验证成功。

## 已确定需求

| 项目 | 决定 |
| --- | --- |
| 制作工具 | Unity 原生 2D Animation 和 Sprite Skin，不制作 Spine 资产 |
| 初始素材 | 完整角色图片；需要拆件设计、遮挡补全和连接区生产 |
| 制作范围 | 部件交接、骨骼绑定、完整动画制作及 Unity 资产接入 |
| 角色与视觉 | 按项目确定视角、方向数量、角色结构和视觉风格 |
| 视角选择 | 拆件前复用项目已确认视角；未确定时提供候选供用户选择，并记录方向与镜像规则 |
| 动作范围 | 按玩法确定动作清单、时长、循环、过渡和事件点 |
| 技术环境 | 读取目标项目实际 Unity、包版本及渲染管线 |
| 部件生产 | 骨骼技能制定规格，现有视觉资产技能生产部件图 |
| 必需依赖 | 按项目版本与实际用途自动安装缺少的包并验证 |
| 自动化补充 | 插件能力不足时使用目标版本的编辑器 API；仍不可执行时报告阻塞 |
| 玩法边界 | 交付 Prefab、动画、Animator Controller 与参数说明，玩法代码另行负责 |
| 骨架与预算 | 采用项目规范；缺失时制定并记录，不凭未批准阈值判定性能通过 |
| 人工确认 | 拆件方案确认后生产部件；代表性动画确认后扩展剩余动作 |
| 工作流接入 | 接入总控，与视觉资产、玩法和独立 QA 交接 |

## 每个项目开工时读取的信息

这些信息在目标项目读取或按当前任务补齐，不再固定成全局模板。

- 项目根路径、Unity 版本、已解析包版本、渲染管线、可复用 Editor 实例和实际命令能力。
- 完整角色图的来源、使用权限、尺寸、透明通道、参考姿势及有效视觉基线。
- 视角、可见方向、是否允许镜像、翻面后的武器与层叠要求、目标显示尺寸。
- 各部件的运动方式，必要挂点、IK、换装、表情或多方向需求。
- 动作清单、关键姿势、节奏、循环、过渡、中断规则、事件语义和事件消费者。
- 骨架命名、原点、比例、Pixels Per Unit、资源目录、asmdef、材质和导入规范。
- 目标平台、同屏角色量、骨骼与顶点预算、纹理预算及已有性能验收阈值。
- 现有资产、公开动画接口、测试入口、资源登记和当前 Work Item 的所有权。

缺失的普通技术细节形成可审阅方案。影响视觉、玩法接口或性能放行的实质性取舍，交回总控决策；不自动补造用户确认。

## 视角选择

在拆件与骨架设计之前确定角色视角。已有有效项目规范或用户决定时直接复用；尚未确定时，由总控根据玩法、镜头和角色展示需求提供以下候选，让用户选择，不因输入图片只有一个视角而自动确定项目视角。

| 选项 | 视角说明 | 需要同时确定的信息 |
| --- | --- | --- |
| 横版侧视 | 从角色侧面观察 | 左右朝向、镜像许可、左右不对称部件 |
| 正面 | 从角色正前方观察 | 背面是否可见、转身需求、前后遮挡 |
| 四分之三视角 | 角色正面与侧面同时可见 | 可见侧、透视比例、远近肢体遮挡 |
| 俯视 | 从上方观察角色 | 俯视角度、可见方向及各方向部件 |
| 等距斜视 | 按项目等距或斜视投影观察 | 投影规则、方向集合、地面接触与挂点投影 |
| 自定义或组合视角 | 项目指定角度，或按场景、状态切换视角 | 各视角用途、切换规则、独立资产与动作范围 |

观察视角与角色朝向分别记录。选择俯视或斜视不自动等同于四方向或八方向；方向数量、方向集合、镜像规则及需要独立制作的方向由项目确定。组合视角可选择多项，并为每项指定稳定视角 ID、适用场景和动作范围。

选择记录至少包含视角 ID、观察角度或参考图、默认朝向、方向集合、镜像许可、切换规则、来源基线及用户决定引用，并交给视觉资产、骨骼制作、玩法与 QA 使用。所选视角与现有角色图不一致时，先由视觉资产任务补齐对应视角原图，再按该图设计拆件。

视角决定可复用现有视觉基线确认，不增加重复确认。后续改变视角时，重新检查受影响的源图、拆件、骨架、动画和接口，并失效其实际依赖的确认与验证证据。

## 领域职责与交接

| 角色 | 所有权 | 向下游交付 |
| --- | --- | --- |
| 工作流控制 | 工作项、状态、确认、实施包与证据记录 | 当前范围、基线、路径及验收要求 |
| Unity 领域编排 | 依赖排序、单写者与插件路由 | 资产制作任务及场景接入任务 |
| 骨骼制作 | 骨架、绑定、约束、动画和角色资产 | Prefab、动作与参数合同、验证证据 |
| 视觉资产 | 源部件图、连接区和遮挡补全 | 逐部件透明源图、尺寸和映射 |
| 玩法开发 | 移动、状态、战斗判定和动作触发 | 消费动画与挂点的玩法实现 |
| 独立 QA | 领域审查和工程验证 | 缺陷、预算判断与独立验收结果 |

部件生产合同至少包含稳定部件 ID、来源角色版本、视角 ID、画布、角色局部坐标、Pivot、像素尺寸、朝向、遮挡补全、连接区、层叠、目标骨骼与资源身份。骨骼依赖按父子运动关系建立，渲染顺序按遮挡关系建立，两者分别记录。

完整角色图作为设计和拆解依据。遵循现有视觉资产规则，按部件独立生产或重绘，不把效果图直接裁切成正式 Sprite。实际生成或编辑图片时委派图片子代理；骨骼制作角色只定义和检查技术规格。

玩法交接合同至少包含 Prefab 资源 ID/GUID、根节点、朝向和缩放规则、Controller 参数名称与类型、动作到状态/Clip 的映射、事件语义、挂点路径、启用/禁用及对象池重用要求。动画中的事件时机属于资产合同，伤害与命中判定仍由玩法模块负责。

## 制作顺序与确认边界

| 步骤 | 产物 | 进入下一步的条件 |
| --- | --- | --- |
| 读取环境与需求 | 版本和能力清单、角色规格、动作清单 | 输入明确，必需依赖可用 |
| 选择视角 | 视角、方向集合、镜像与切换规则 | 已有有效项目决定，或用户已选择当前视角方案 |
| 设计拆件与骨架 | 图内中文标注的拆件图、内部结构合同 | 独立可实现性检查完成，用户确认当前拆件版本 |
| 生产部件 | 正式源图及逐部件映射 | 边缘、尺寸、连接区、方向和身份检查通过 |
| 制作绑定 | 骨架、网格、权重、约束和姿势预览 | 极端姿势及绑定完整性检查通过 |
| 制作代表动画 | 真实骨骼驱动的动画预览 | 技术检查完成，用户确认当前预览版本 |
| 扩展全部动作 | 已定义的完整动作与 Controller | 动作、过渡、中断和事件检查通过 |
| 交付并接入 | 角色 Prefab、接口及资源登记 | 独立 QA 与适用 Unity 验证通过 |

拆件确认提交真实可查看的框选图，中文标注部件、连接区、层叠、骨架方向和生产边界；内部映射另行保存。代表动画预览必须来自真实 Unity 角色播放，可采用连续帧或录制文件，不以生成式动画、单张姿势图或命令成功代替。

两次专项确认绑定角色、输入基线、产物版本和用户回复。用户要求修改后，修正并重验，再确认新版本；技术 PASS 和用户沉默不能替代确认。相同交付与基线不重复询问。

当前场景和显示层已有的 V0–V4 逐阶段确认继续适用。拆件专项确认可与内容一致的 V2 确认合并；代表动画确认必须发生在批量扩展动作之前，不能等完整资源制作后才补签 V3。专项确认与阶段确认记录分别核对范围，同一次明确回复可以覆盖已清楚展示的两个对象。

## 原生 Unity 技术路线

### 依赖与操作入口

读取实际解析包，使用目标 Unity 版本支持的包组合。2D Animation 是骨骼蒙皮路线的核心依赖；只有选定的分层文件路线需要时才安装 2D PSD Importer，不能因为源图需要拆件就无条件安装全部 2D 包。

复用 `unity:unity-cli` 进行项目与 Editor 发现，复用 `unity:unity-package-management` 管理依赖，复用 `unity:sprite-editor` 处理 Sprite 元数据，图集和像素美术分别按需路由到现有插件技能。骨骼、网格和动画的专项实现只补充当前插件缺口。

命令参数以连接 Editor 的实际命令目录为准。确认 `eval` 等入口存在后才能使用；遵守插件对语句块和完整编辑器脚本的区分，不假设 `eval_file`、菜单入口或特定命令必然可用。

### 素材组织

独立 PNG 与分层源文件属于两种可选组织方案。首先复用项目已验证方案；没有既有方案时，根据共享骨架、原点保持、重新导入和可编辑源文件需求选择，再通过最小样例验证。

多方向角色显式定义各方向部件与动作。单张角色图无法推断被遮挡结构或相反视角时，由视觉资产任务补绘并确认，不把水平镜像当作所有角色的通用解法。

### 绑定与动画

骨架需要明确父子索引、局部位置、旋转、长度和绑定姿势。网格与权重需要覆盖顶点、三角形、骨骼索引、绑定矩阵及权重有效性。自动生成网格或权重只提供制作起点，极端姿势检查决定是否合格。

刚性部件和连续蒙皮部件分别选择处理方式。必要 IK 或约束先验证包支持和动画求值顺序，不能让 Animator 与求解器同时争夺同一关节而不定义所有权。

动画通过目标版本支持的编辑器 API 创建并保存，明确 Transform 路径、曲线、插值、循环、事件和 Controller 关系。根运动、镜像、多方向、过渡及中断规则来自项目玩法合同，不预设控制器状态模板。

### 官方 API 与待验证能力

下表依据 Unity 官方文档确定实现入口，不代表已在目标项目执行成功。2D Animation 13.x、PSD Importer 12.x 和 Unity 6000.3 仅作为文档示例；实施时读取 `ProjectVersion.txt`、`Packages/manifest.json` 和 `Packages/packages-lock.json`，核对实际解析版本，不固定安装这些示例版本。

| 能力 | 官方入口 | 必须补充的验证 |
| --- | --- | --- |
| Sprite 元数据事务 | `ISpriteEditorDataProvider` 初始化、读取子 Provider、`Apply` | 目标 Importer 的实际能力、保存及重新导入 |
| 骨骼写入 | `ISpriteBoneDataProvider.SetBones`，按 Sprite GUID 操作 | 骨骼索引、层级、绑定姿势和重载 |
| 网格与权重写入 | `ISpriteMeshDataProvider.SetVertices/SetIndices/SetEdges`；`Vertex2DMetaData.boneWeight` | 顶点、三角形、权重和绑定矩阵的一致性 |
| Sprite Skin 绑定 | 示例版本公开 `SetRootBone`、`SetBoneTransforms`、`ResetBindPose` 与 `SpriteSkinState` | 目标版本入口、骨骼数组映射、实际变形及状态 |
| 动画曲线与事件 | `AnimationUtility.SetEditorCurves/SetAnimationEvents` | 曲线路径、绑定对象、循环及播放后的事件时机 |
| Controller 与 Prefab | `AnimatorController` 创建和参数 API；`PrefabUtility.SaveAsPrefabAsset` | 状态过渡、引用、保存和实例重载 |
| 2D IK | 当前 2D Animation 包内的 `UnityEngine.U2D.IK` | 求解器配置和 Animator 的求值顺序 |

骨骼与几何的数据入口见 [Sprite Editor Data Provider](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteEditorDataProvider.html)、[骨骼 Provider](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteBoneDataProvider.html)、[网格 Provider](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.ISpriteMeshDataProvider.html) 与 [顶点权重数据](https://docs.unity3d.com/Packages/com.unity.2d.sprite@1.0/api/UnityEditor.U2D.Sprites.Vertex2DMetaData.html)。实际绑定入口和错误状态见 [SpriteSkin](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/api/UnityEngine.U2D.Animation.SpriteSkin.html) 与 [SpriteSkinState](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/api/UnityEngine.U2D.Animation.SpriteSkinState.html)。

Skinning Editor 的 Auto Weights 界面功能与公开权重写入 API 是不同能力。尚未确认能够直接调用界面的权重生成算法，首版不能承诺复用该算法；后续须确定可执行的权重计算方法，并通过实际形变检查验收。若采用 `BoneWeight` 数据结构，应按它提供的最多四个影响骨骼槽位处理，不能假设任意影响数量。[Skinning Editor](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/manual/SkinningEditor.html)、[BoneWeight](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/BoneWeight.html)。

独立 PNG 可通过普通 Sprite 导入路径处理，不因使用骨骼动画就必须生成 PSD/PSB。PSD Importer 的 Character Rig 路线有 Multiple、Mosaic、2D Animation 等前提，应单独验证选定配置和图层坐标保留。[TextureImporterType](https://docs.unity3d.com/6000.0/ScriptReference/TextureImporterType.html)、[PSD Importer 设置](https://docs.unity3d.com/Packages/com.unity.2d.psdimporter@12.0/manual/PSD-importer-properties.html)。

动画与角色保存的公开入口见 [AnimationUtility](https://docs.unity3d.com/6000.0/ScriptReference/AnimationUtility.html)、[AnimatorController](https://docs.unity3d.com/6000.0/ScriptReference/Animations.AnimatorController.html) 和 [Prefab 保存 API](https://docs.unity3d.com/6000.0/ScriptReference/PrefabUtility.SaveAsPrefabAsset.html)。这些入口不能替代实际 Clip 到骨骼路径的验证。

2D IK 自 2D Animation 5.0 起合并到该包，不能因运行时程序集名称含 IK 就默认安装历史独立 `com.unity.2d.ik` 包；读取目标包再决定约束实现。[官方变更记录](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/changelog/CHANGELOG.html)、[当前 IK API](https://docs.unity3d.com/Packages/com.unity.2d.animation@13.0/api/UnityEngine.U2D.IK.html)。

## 最小技术样例

正式承诺自动生产能力前，在获准的目标项目和隔离资产目录完成一次样例。当前仓库的 `tests/UnityHost` 固定 Unity `6000.0.30f1`，但未声明 2D Animation 或 2D PSD Importer；它只能作为未来选定测试环境的候选，不能证明目标版本的骨骼能力。

1. 发现并复用当前项目 Editor，读取实际版本与包；没有可复用实例时按任务范围处理，不自动启动新服务进行规格研究。
2. 使用明确来源的少量正式部件和两三根骨骼，写入骨架、网格与权重。
3. 创建 Sprite Skin、一个短动画、Controller 和 Prefab，读取实际绑定状态。
4. 保存、重新导入和重新加载，在 Editor/PlayMode 检查真实变形、动画循环和引用。
5. 分别在同一个 Prefab 的两个实例播放动作，检查实例间的状态和资源污染。
6. 记录各步骤的 API、命令、输出资产、Console 和画面；失败定位到具体步骤。

该样例先验证资产写入和重载，再验证运动表现；不以手工编辑 `.meta`、直接拼装 YAML 或修改导出文本替代 Editor 的资源管理。

## 验收与失败处理

| 检查范围 | 可观察的完成条件 |
| --- | --- |
| 部件 | 映射完整，尺寸和原点一致，关节连接区可用，透明边缘符合视觉规格 |
| 骨架 | 层级有效、无循环，骨骼与网格索引正确，绑定关系与资产一致 |
| 网格与权重 | 索引和数值有效，权重满足目标 API 要求，极端姿势无不可接受裂缝或塌陷 |
| 动作 | 所有项目动作存在，循环、过渡、中断和事件符合合同 |
| 表现 | 层叠、翻面、缩放和方向变化符合要求，Sprite Skin 实际产生预期变形 |
| 生命周期 | 保存、重导入、Prefab 重载及实际使用的重用流程后引用和状态有效 |
| 实例 | 多角色实例互不污染，事件和挂点对应当前实例 |
| 性能 | 静态统计和 Editor 测量满足已批准预算；设备性能保持独立验收范围 |

素材问题退回视觉资产任务，绑定与动画问题在骨骼任务修复，接口需求变化交回编排层调整合同。记录受影响的部件、骨骼、Clip、Prefab、版本及证据，不扩大到无关资产。

缺少必需输入或操作能力时标记阻塞并保留恢复条件；未执行的验证记录为 `NOT_RUN`。上游图、骨架、部件、版本或接口变化后，只失效实际依赖它们的确认和证据。

## 后续接入位置

| 文件或模块 | 拟接入内容 |
| --- | --- |
| `unity-game-2d-rigging/SKILL.md` 及代理配置 | 技能触发、输入、边界、交接和引用 |
| `unity-development-workflow/SKILL.md` | 原生 2D 骨骼制作的领域路由 |
| `unity-development-workflow/references/unity-plugin-routing.md` | 插件复用与专项缺口说明 |
| `unity-game-visual-assets/SKILL.md` | 拆件图的生产合同和资产交接 |
| `unity-gameplay-development/SKILL.md` | 消费已验收角色资产与动画接口 |
| `unity-game-qa-performance/SKILL.md` | 独立 2D 骨架与动画验证矩阵 |
| `README.md` 与安装器清单 | 技能说明及安装发现 |
| 适用测试和模板 | 技能结构、交接与确认记录的定向覆盖 |

复用现有 Work Item、Implementation Package 和证据机制，不创建第二套全局状态机。当前 `workItemType` 没有独立角色资产枚举，`MODULE` 是实施单元类别，不是合法 Work Item 类型；后续优先在现有工作项内分配资产实施单元，不擅自添加 `ASSET` 或 `MODULE` 类型。

共享角色资产与消费场景的路径、Unity 对象所有权分别明确。同一物理项目的 Editor 写入保持单写者；`Packages/`、共享 asmdef 和全局设置串行处理。

## 验证等级与授权范围

规格整理阶段采用 T0：检查需求一致性、链接、术语和改动范围，不运行 Unity、安装依赖或执行运行时测试。

技能入口与交接规则实现采用 T2，运行 `rtk npm test`、`rtk node unity-game-workflow-control/scripts/workflow-control.mjs lint --repository .`、skill-creator 的 `quick_validate.py` 与 npm 打包预检。覆盖安装集合、引用可达性和元数据；真实骨骼资产的最小 Unity 样例在选定目标项目后单独执行，保持 `NOT_RUN`，不把技能验证作为角色制作通过的证据。

新建编辑器代码的类、函数和实体定义使用简体中文注释，复杂逻辑说明设计原因和边界；实现按职责拆分，单文件默认不超过 1000 行。未经明确要求，不创建新分支或 worktree，不启动 Standalone/Player 或真机，不进行付费、外部写入、上传或发布。
