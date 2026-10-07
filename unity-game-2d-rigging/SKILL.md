---
name: unity-game-2d-rigging
description: "按项目要求把完整角色图制作成 Unity 原生 2D 骨骼动画角色，覆盖视角与拆件合同、Sprite Skin 绑定、动画和 Prefab 接入；已有 Spine 角色换皮使用 unity-game-spine-reskin。"
---

# Unity 原生 2D 骨骼制作

从完整角色图开始，协调视觉部件生产，制作可编辑的骨架、蒙皮、动画和角色 Prefab。项目决定视角、风格、动作、版本和性能预算；不要套用固定的人形骨架或动作模板。

## 输入、职责与工具

- 读取当前 Work Item、Implementation Package、项目资源规范、完整角色图、玩法动作需求、可复用 Unity Editor 和实际命令目录。复用现有 Work Item 与实施单元，不新增 `ASSET` 或 `MODULE` Work Item 类型，也不建立第二套状态机。
- 使用 Unity 原生 2D Animation / Sprite Skin。完整角色图是设计基准；通过 `$unity-game-visual-assets` 按拆件合同生产部件、遮挡补全和关节连接区，不能把效果图直接裁切成正式 Sprite。实际图像生成或编辑委派 `image_generator` 子代理。
- Unity Editor 发现与命令目录使用 `unity:unity-cli`；Sprite 元数据操作复用 `unity:sprite-editor`；仅在确有依赖缺口时交给 `unity:unity-package-management` 安装所需包。遵循这些技能的安全检查与实际版本约束。
- 负责骨架、网格、权重、必要约束、动画、角色 Prefab、Animator Controller 及接口说明。玩法控制、状态切换、攻击判定与动作触发由 `$unity-gameplay-development` 负责；独立质量审查交给 `$unity-game-qa-performance`。现有 Spine 角色只换皮时转给 `$unity-game-spine-reskin`。

## 制作顺序

1. 读取项目 Unity、已解析包与渲染管线版本、角色视觉基线、朝向/镜像规则、骨架命名、导入规范、目标预算和已有验收门槛。缺少普通技术细节时提出并记录方案；影响视觉、玩法接口或性能放行的取舍交回总控。
2. 拆件前复用项目已有的有效视角决定；没有决定时先让用户选择并记录视角、方向集合、默认朝向、镜像许可和切换规则。名称与候选见[制作合同](references/production-contract.md)。
3. 根据已确定视角和玩法设计拆件图、部件身份、层叠顺序、连接区、骨架运动关系及导入规格。交付可查看的框选标注图和内部结构合同，等待用户确认当前版本后才委派正式部件生产。
4. 检查视觉资产交付的来源版本、部件映射、尺寸、Pivot、边缘、连接区和层叠；缺陷退回视觉资产角色。按项目结构创建骨架、Sprite Skin、网格与权重，区分刚性部件和连续蒙皮部件。
5. 先用代表性姿势和极端关节角验证绑定，再制作真实 Unity 骨骼驱动的代表性动画。展示实际预览并等待用户确认后，才扩展其余动作；不得用生成式动画、静态图或工具成功消息代替预览。
6. 按项目动作合同完成 Clips、循环、过渡、中断、事件、Controller 与挂点，保存候选 Prefab 并完成独立 QA 和适用的 Unity 验证。通过后再正式交付 Prefab 与玩法接口；可提前评审接口合同，但玩法只消费独立验收通过的资产。交付验证证据与未执行项。

## 硬性边界

- 两次用户确认分别绑定角色、基线、产物版本和用户回复：拆件方案确认后才能生产部件；代表动画确认后才能批量扩展动作。收到修改要求时修正、重验、重新展示并确认新版本。
- SCENE / DISPLAY_LAYER 按现有控制面使用 V0–V4 与 `stageReviews`；内容一致时拆件确认可并入 V2。代表动画确认必须早于其余动作制作。记录专项确认和阶段确认各自覆盖的对象，不创建新的状态或确认 schema；其他 Work Item 遵循原有门禁。
- 先检查并复用可用 Editor；不得自动启动真机或 Standalone/Player。只有发现必需能力后才安装包，不升级 Unity 或无关依赖，不手改 `Packages/manifest.json`、`.meta` 或 Unity 序列化 YAML。
- 不承诺 Unity 自动权重界面存在可调用 API。权重算法可先在隔离的最小样例中实现和验证；未经样例验证不得用于正式生产。不得伪造 C# 模板；缺必需能力或输入时记为 `BLOCKED`，未执行检查记为 `NOT_RUN`，实际失败记为 `FAIL` 并修复，不得报告 PASS。
- 性能预算沿用项目已批准门槛；门槛缺失时记录测量值并交回总控制定，不自行宣布通过。无真机证据时不得声称设备性能已验证。

需要细化部件与玩法交接、视角选择或确认门时，读取[制作合同](references/production-contract.md)；需要评估 Editor API、权重算法和资产生命周期时，读取[Unity 能力验证](references/unity-capability-validation.md)。
