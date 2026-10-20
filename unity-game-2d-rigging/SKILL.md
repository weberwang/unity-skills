---
name: unity-game-2d-rigging
description: "按项目要求把完整角色图制作成 Unity 原生 2D 骨骼动画角色，覆盖视角与拆件合同、Sprite Skin 绑定、动画和 Prefab 接入；已有 Spine 角色换皮使用 unity-game-spine-reskin。"
---

# Unity 原生 2D 骨骼制作

从完整角色图开始，协调视觉部件生产，制作可编辑的骨架、蒙皮、动画和角色 Prefab。项目决定视角、风格、动作、版本和性能预算；不要套用固定的人形骨架或动作模板。

## 输入、职责与工具

- 读取当前 Work Item、Implementation Package、项目资源规范、完整角色图、玩法动作需求、可复用 Unity Editor 和实际命令目录。复用现有 Work Item 与实施单元，不新增 `ASSET` 或 `MODULE` Work Item 类型，也不建立第二套状态机。
- 使用 Unity 原生 2D Animation / Sprite Skin。完整角色图是设计基准；通过 `$unity-game-visual-assets` 按拆件合同生产部件、遮挡补全和关节连接区，不能把效果图直接裁切成正式 Sprite。小幅弯曲优先用骨骼网格变形；角度、透视或轮廓等无法正确表达时，由骨骼角色提出补充角度图或替换图，按[制作合同](references/production-contract.md)闭环制作、接入和复验。实际图像生成或编辑委派 `image_generator` 子代理，不用生成整段动画代替 Unity 骨骼动画。
- Unity Editor 发现与命令目录使用 `unity:unity-cli`；Sprite 元数据操作复用 `unity:sprite-editor`；仅在确有依赖缺口时交给 `unity:unity-package-management` 安装所需包。遵循这些技能的安全检查与实际版本约束。
- 骨骼角色负责骨架、网格、权重、Clip、角色 Prefab，以及角色 Animator Controller 内部的参数、状态、过渡和中断；玩法角色拥有权威玩法状态、规则与触发时机，只通过已约定接口消费动画。独立质量审查交给 `$unity-game-qa-performance`。现有 Spine 角色只换皮时转给 `$unity-game-spine-reskin`。
- 按[岗位协作](../unity-development-workflow/references/2d-animation-collaboration.md)消费动画质量负责人的动作标杆与返修意见，并由 [`$unity-game-2d-animation-ta`](../unity-game-2d-animation-ta/SKILL.md)提供公共工具、数据／导入规范、诊断和回归支持。骨骼角色仍拥有具体角色资产和样例角色数据；公共工具缺陷交 TA，角色缺陷由本角色修复，工具结果与自检不能代替独立 QA 或用户视觉确认。

## 制作顺序

1. 读取项目 Unity、已解析包与渲染管线版本、角色视觉基线、朝向/镜像规则、骨架命名、导入规范、目标预算和已有验收门槛。缺少普通技术细节时提出并记录方案；影响视觉、玩法接口或性能放行的取舍交回总控。
2. 拆件前复用项目已有的有效视角决定；没有决定时先让用户选择并记录视角、方向集合、默认朝向、镜像许可和切换规则。名称与候选见[制作合同](references/production-contract.md)。
3. 拆件合同定稿前，与玩法共同评审根节点、朝向、挂点及其局部空间、动画事件语义和位移权属，并写入现有交接合同；不新增确认门。根据已定视角、玩法和部件组合风险设计拆件图、身份、层叠顺序、连接区、骨架运动关系及导入规格。交付可查看的框选标注图和内部结构合同，等待用户确认当前版本后才委派正式部件生产。
4. 检查视觉资产的来源版本、映射、尺寸、Pivot、PPU、边缘、连接区和层叠；在约定尺度检查组合效果，缺陷退回视觉资产角色。按项目结构创建骨架、Sprite Skin、网格与权重，区分刚性部件和连续蒙皮部件；逐个验证图像变体能否复用原网格与权重，不适用时重新制作并验证。按[制作合同](references/production-contract.md)的无缝标准检查全运动范围。
5. 根据真实使用场景规划每个动作的姿态和节奏，再按[动画意图与时间轴合同](../unity-development-workflow/references/animation-intent-contract.md)制作真实 Unity 骨骼驱动动画。代表动作按关节、遮挡、挂点、速度和接触风险选择；简单待机覆盖不足时，在同一代表动画预览中补充必要姿势或短片段。展示实际 Unity 预览并等待用户确认后，才扩展其余动作；截图和片段的视觉效果由用户人工检查，代理不得自动分析截图或据此判定视觉通过。
6. 按项目动作合同完成 Clips、循环、过渡、中断、事件、Controller 与挂点，保存候选 Prefab。资产工作项使用 `domain: 2d-rigging`、`unity-asset-change`，按[骨骼交付门禁](../unity-game-workflow-control/references/rigging-delivery-gate.md)声明当前角色和实际回归情境；资产工程检查及该角色播放回归通过、独立 QA 复验后才交玩法。门禁失败按岗位修复并重新取证，不能用公共技术夹具代替。玩法接入后再由 QA 检查游戏内行为。两轮预览与验收范围见[制作合同](references/production-contract.md)，实际画面由用户人工检查；沿用原状态和专项确认，分别记录资产就绪与整体完成。

## 硬性边界

- 两次用户确认分别绑定角色、基线、产物版本和用户回复：拆件方案确认后才能在其生产边界内制作部件；代表动画确认后才能批量扩展动作。若修改要求改变已确认的拆件方案或代表动画，修正、重验、重新展示并确认新版本。
- 已确认拆件范围内因动作暴露缺陷而补充变体，按合同直接制作、接入和展示复验，不另加文字审批；新增视角方向或超出已确认生产边界时，先更新并重新展示受影响拆件内容、获得确认后再生产。若补件改变已确认代表动画，先展示更新版并获得确认，再扩展依赖动作。
- 正式生产前先在隔离技术样例或已验收可复用部件上验证最小资产链路，不依赖尚未通过拆件确认的正式部件。该技术验证不代替实际角色预览与用户视觉检查。
- SCENE / DISPLAY_LAYER 按现有控制面使用 V0–V4 与 `stageReviews`；内容一致时拆件确认可并入 V2。代表动画确认必须早于其余动作制作。记录专项确认和阶段确认各自覆盖的对象，不创建新的状态或确认 schema；其他 Work Item 遵循原有门禁。
- 先检查并复用可用 Editor；不得自动启动真机或 Standalone/Player。只有发现必需能力后才安装包，不升级 Unity 或无关依赖，不手改 `Packages/manifest.json`、`.meta` 或 Unity 序列化 YAML。
- 不承诺 Unity 自动权重界面存在可调用 API。权重算法可先在隔离的最小样例中实现和验证；未经样例验证不得用于正式生产。不得伪造 C# 模板；缺必需能力或输入时记为 `BLOCKED`，未执行检查记为 `NOT_RUN`，实际失败记为 `FAIL` 并修复，不得报告 PASS。
- 性能预算沿用项目已批准门槛；门槛缺失时记录测量值并交回总控制定，不自行宣布通过。无真机证据时不得声称设备性能已验证。

需要细化部件与玩法交接、视角选择或确认门时，读取[制作合同](references/production-contract.md)；需要评估 Editor API、权重算法和资产生命周期时，读取[Unity 能力验证](references/unity-capability-validation.md)。
