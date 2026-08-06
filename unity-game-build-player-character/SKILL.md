---
name: unity-game-build-player-character
description: Star Blogger 的 P3-002 玩家人物 Unity 2D 独立 PNG 视觉还原、分层生产及完整骨骼系统专用 Skill，覆盖 Sprite Skin、30 骨骼 Rig、排序、蒙皮、IK、Animator 状态混合、位移与步幅、左右翻转、玩法事件、物理跟随、换装挂点、性能预算，以及流畅、自然、有张力的关键姿势动画。需要修正或重做 17 张 Sprite、PlayerCharacter Prefab、权重、动作质量或任一骨骼运行时环节时使用；禁止用 PSD/PSB、目标图裁片、不共享人物几何的独立结果或散落 C# 局部角度数组替代结构化规格。
---

# Star Blogger 玩家人物

把 P3-002 作为一个受版本控制的完整人物处理。独立 PNG 是文件和返修边界，不是各图层分别重新设计人物的许可。

## 权威输入

开始任何判断、生成或写入前，完整读取 [玩家角色合同](references/player-character-contract.md)和[玩家角色项目基线规范](references/player-character-project-baseline.md)。任务涉及 Sprite Skin、Rig、排序、IK、Animator、物理、换装或性能时，再完整读取[Unity 2D 骨骼系统](references/player-character-2d-skeletal-system.md)；任务涉及 AnimationClip 或动作质量时，同时完整读取[关键姿势骨骼动画](references/player-character-skeletal-animation.md)。随后从当前 Star Blogger 工作区读取对应目标板、批准记录、Visual Bible、生产计划、运行时映射和 Unity 资产；不得依赖记忆、缩略图或历史 PASS 摘要替代原始证据。

遵循以下权威顺序：

1. 当前用户明确决定。
2. 已批准的 P3-002 目标板及其内容绑定批准记录。
3. Visual Bible v0.9。
4. 本 Skill 的人物合同。
5. 当前生产文件和 Unity 技术配置。
6. 历史候选、历史 PASS 和旧 Unity 截图仅作诊断证据。

目标文件缺失、哈希变化、批准内容无法绑定或权威之间冲突时停止生产，交给 `$unity-game-grilling` 重新确认；不得自行选择一个近似版本继续。

## 不可违反的原则

1. 先建立一份统一的生产母版和几何合同，再生产 17 张独立 PNG。禁止从空白提示分别生成身体、头发、衣服和五官后仅靠缩放对齐。
2. 生产母版必须独立生成或重绘，不得裁切批准目标板、效果图或截图作为运行时像素；生产母版本身也不得直接作为运行时整身 Sprite。
3. 所有图层共享同一套头部轮廓、脸部标记点、肩腰髋、关节、衣物边界、鞋底基线、画布、PPU、Pivot、色板和线条规范。
4. 表情只能替换眉、眼、嘴等责任图层。禁止为每种表情重新生成整张脸或整个人物。
5. Body/Base 只允许在合同规定的可见皮肤区域露出。衣物覆盖区必须通过责任图层边界或确定性遮挡蒙版清除，不得依靠背景颜色掩盖。
6. 局部修正必须先完整清除旧责任区域，再合成新补丁；禁止把新头、新手或新服装直接叠在旧轮廓上。
7. 每次单图变化都重建完整组合和相关状态；不得只看单图宣告通过。
8. 技术完整性、视觉还原、移动可读性和 Unity 接入是四个独立结论。任何技术 PASS 都不得推导视觉 PASS。
9. 不得因用户批准过某个候选而降低目标一致性标准。批准绑定候选，不会自动豁免候选与冻结目标的差异。
10. 禁止 PSD、PSB、PSDT 和运行时整身合成图路线。保留 17 张独立 PNG、稳定路径和 GUID。
11. 动画设计必须按关键姿势、节奏、轨迹、次级运动的顺序推进，并以重心与承重点、世界空间目标、接触约束、IK 混合和变形预算为输入；禁止把猜测的骨骼局部角度当作动作权威。
12. 静态视觉未通过时保持 Rig 暂停；静态姿势未逐张批准时保持过渡、视觉事件和 AnimationClip 构建暂停。
13. 任何 AnimationClip 必须绑定已审计的骨骼系统版本；生产路线、骨架、排序、蒙皮、IK、状态、位移、翻转、事件、物理、附件或性能任一未冻结时禁止批准动作。

## 执行流程

### 1. 建立基线

- 先用 `templates/player-character-project-baseline.yaml` 建立玩家角色项目基线，并用 `schemas/player-character-project-baseline.schema.json` 校验；未得到 `PLAYER_CHARACTER_BASELINE_AUDITED` 前禁止生产。
- 对照必须绑定 Unity 项目根标记、来源修订、项目状态版本、当前目标板、批准记录、Visual Bible、生产计划、17 项运行时 PNG/.meta/GUID、SpriteLibrary、Atlas、两个 Prefab 和历史证据。
- 按固定检查 ID、七个视觉区域和八个状态逐项写入 `MATCH`、`DIFFERENT`、`MISSING` 或 `UNREADABLE`；不得使用自由文本 PASS 代替差异矩阵。
- 把当前问题分类为 `SOURCE_ART`、`LAYER_CONTRACT`、`UNITY_INTEGRATION` 或 `EVIDENCE_GATE`；允许多选。
- 把已有 v5 视觉 PASS 视为历史结论重新审计，不得直接继承。
- 输出基线报告，明确保留项、作废项、待重做项和禁止触碰项；任一 `MISSING` 或 `UNREADABLE` 都使基线保持 `PLAYER_CHARACTER_BASELINE_BLOCKED`。

### 2. 冻结生产母版

- 依据批准目标独立重绘完整中立人物，保持正面 A-pose 和透明背景。
- 同时建立几何合同：人物可见边界、头顶、下颌、眼鼻嘴中心、肩、肘、腕、指尖、腰、髋、裆、膝、踝和鞋底坐标。
- 建立遮挡合同：后发、身体、裤、鞋、上衣、前发、五官和配饰的覆盖关系与允许露出区域。
- 按项目对照规范生成目标与母版的等高全身对照、100% 脸部对照、轮廓差异图和色板对照；统一使用鞋底到头顶等高缩放、鞋底基线与脸中心联合对齐、最近邻重采样，不得局部变形对齐。
- 视觉一致性、Unity 可实现性和 UX/可读性审查均通过并取得用户批准后，才能生产单图。

生产母版失败时整体修正母版；不得把错误母版拆成 17 张图后再逐层补救。

### 3. 逐项生产单图

严格按人物合同中的顺序生产。每次只打开一个责任单元：

1. 读取生产母版、几何合同、遮挡合同和当前责任单元。
2. 独立生成或重绘该图层，保持 2048×2048 RGBA、统一坐标和透明像素 RGB 清零。
3. 将图层放回全组合，不允许单层临时缩放、旋转或目测偏移掩盖源图错误。
4. 生成该单元的单图预览、组合预览、浅色/深色/棋盘背景和责任区域放大图。
5. 检查身份、轮廓、遮挡、边缘、色板、线宽、状态兼容和移动端可读性。
6. 写入逐项记录，绑定输入、输出、生成或重绘方法、哈希、审查结论和所有修订。
7. 只有当前项为 `PLAYER_CHARACTER_LAYER_VISUAL_TECHNICAL_PASS` 时才进入下一项。

单图失败时只重做责任单图；若失败源于共享几何、母版身份或遮挡合同，则回退生产母版，失效所有受影响下游项。

### 4. 执行硬视觉门禁

出现以下任一问题都必须判定 `PLAYER_CHARACTER_VISUAL_FAIL`，不得降为非阻断备注：

- 脸型、额头、下颌、五官比例或肤色导致人物身份变化。
- 前后发轮廓、偏分方向、卷束体积或发丝密度明显偏离目标。
- 头身比、肩腰髋、手部体量、腿长、外套长度、裤型或鞋型漂移。
- 旧头顶弧线、双下颌、重复手、重复轮廓或补丁残留。
- 腋下、袖侧、领口、腰口、裤缝或鞋口出现不应可见的 Body/Base。
- 图层接缝、重影、悬空、透明脏边、色键残留或背景穿透。
- 表情只像贴换嘴巴，眉、眼、脸颊和嘴的情绪不协调。
- 目标与候选只在缩小全身图中比较，缺少原生比例局部证据。

禁止使用 `PASS_WITH_NOTES` 绕过上述项目。

### 5. 验收完整组合

17 项全部通过后，至少构建：

- neutral、smile、speaking、frown 四种完整状态。
- open 与 blink 眼睛状态。
- raised 与 neutral 眉形状态。
- necklace、earrings 的开启和关闭状态。

验收板必须同时包含：

- 批准目标与候选的等高全身 A/B。
- 目标与候选的脸部、头发、肩胸、手、腰胯和鞋部原生比例放大。
- 轮廓重叠图，明确标识目标独有区和候选独有区。
- 浅色、深色和透明棋盘背景。
- 四种表情的文字标签。
- Body/Base 与服装覆盖泄漏检查图。

七个固定区域和八个固定状态必须各自给出当前版本证据与结论。任何候选变化都会使受影响的区域、状态和汇总板失效；不得沿用旧图或只替换汇总板中的局部。

不得仅用哈希、文件数量、移动端表情可区分或候选自洽证明目标还原。

在提交完整候选前运行：

```powershell
uv run scripts/audit_player_character.py --workspace . --baseline Artifacts/Visual/P4/g1-v0.6/p3-002/v5/project-baselines/p3-002-player-character-project-baseline.yaml --layers Artifacts/Visual/P4/g1-v0.6/p3-002/v5/layers --reviews Artifacts/Visual/P4/g1-v0.6/p3-002/v5/reviews/layers --report Artifacts/Visual/P4/g1-v0.6/p3-002/v5/reviews/player-character-audit.json
```

脚本检查项目基线未漂移、目标绑定、17 张 PNG、逐项记录、哈希和必需证据是否齐备。它最多只能输出 `PLAYER_CHARACTER_EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED`，不得把脚本成功解释成视觉通过。

### 6. 请求用户批准

只有完整组合通过三类独立审查后，才向用户提交批准。请求必须明确：

- 批准对象的路径、版本和哈希。
- 与目标仍存在的全部可见差异。
- 批准开放的下游操作。
- 仍保持关闭的 Rig、设备验收和商店范围。

用户批准前禁止覆盖运行时 PNG。

### 7. 接入 Unity

- 导出紧边单图，但以记录的 canonical local offset 保持 2048 画布组合位置。
- 覆盖同名运行时 PNG 时保留 `.meta` 和 GUID；禁止重建稳定 Sprite、SpriteLibrary、Atlas 或 Prefab 标识。
- 导入前确认没有打开的旧 PlayerCharacter Prefab Stage；若打开，先确认未脏并关闭，再重建 Prefab。
- 验证 Sprite 导入设置、12 类/17 标签、Atlas 引用、排序、互斥状态和 Prefab 外部引用。
- Unity 捕获必须来自固定机位原生 SpriteRenderer，并重新生成带目标、标签和局部放大的 Unity 验收板。

Unity 只证明接入结果时使用 `PLAYER_CHARACTER_UNITY_TECHNICAL_PASS_VISUAL_PENDING`。只有 Unity 捕获再次通过目标 A/B 视觉审查后才能使用 `PLAYER_CHARACTER_UNITY_VISUAL_PASS`。

### 8. 建立 2D 骨骼系统

若任务包含 Rig 或运行时骨骼接入，先完成系统阶段：

1. 用 `templates/player-character-2d-skeletal-system.yaml` 建立系统规格，并用 `schemas/player-character-2d-skeletal-system.schema.json` 校验。
2. 冻结独立 PNG、Unity 2D Animation、Sprite Skin 与 Animator 路线，以及 30 骨骼、参考姿势、Pivot、视觉根、翻转根和挂点骨。
3. 冻结 Sorting Group、排序带、动态前后规则、网格密度、每顶点影响数、刚性图层和极端姿势权重证据。
4. 建立基础 Clip、运行时 IK、次级运动的求解顺序，以及脚贴地、手部目标、头部朝向和双手持物约束。
5. 建立 Animator 分层、Blend Tree、逐类过渡、打断、脚相位和“步幅 ÷ 循环时长”速度校准；保持玩法或 Rigidbody2D 拥有真实位移。
6. 分离视觉翻转根与物理根，把关键玩法事件放入动作规格；建立骨骼跟随判定框、换装挂点、离屏更新、LOD 和目标设备性能预算。
7. 完成参考姿势、极端变形、排序、IK、状态、滑步、翻转、事件、物理、换装和性能回归，得到 `PLAYER_CHARACTER_SKELETAL_SYSTEM_AUDITED` 后再制作单个动作。

运行系统规格验证：

```powershell
uv run scripts/validate_player_character_skeletal_system.py --source Artifacts/Animation/P3-002/Rig/player-rig-v1/skeletal-system.yaml
```

### 9. 制作骨骼动画

若任务包含骨骼动画，先执行以下专用阶段，再交接：

1. 绑定当前 `skeletalSystemVersion` 与 `skeletalSystemEvidence`，再用 `templates/player-character-skeletal-animation.yaml` 建立 4～8 张关键姿势卡，并用 `schemas/player-character-skeletal-animation.schema.json` 校验。
2. 冻结每张姿势的轮廓、重心、承重点、动作线，头、双手、双脚世界空间目标，双脚接触锚点，双肘双膝弯曲方向和当前 Rig 变形预算。
3. 在 Unity 中逐张摆出静态姿势，保存固定相机截图和 `resolvedPoseEvidence`；任一姿势不可读、失重、关节锁死或超出变形预算时先返修姿势、网格或权重。
4. 全部静态姿势通过并获批后，按蓄力、爆发、跟随、强调保持和恢复制作时间脚本；逐段声明速度曲线、五个效应器轨迹、传力链、错位时间和双脚 IK 混合。
5. 声明动作类型、位移控制权、进入/退出过渡、打断策略和循环相位同步，再由结构化规格生成版本化 AnimationClip；禁止用统一平滑曲线削弱爆发或制造过冲。
6. 以 1 倍速审查节奏、反馈和张力，以 0.25 倍速审查速度断点、轨迹尖角、IK 跳变、脚滑和次级运动顺序，并保存轨迹证据和逐段动态质量结论。
7. 对全部关键时间点自动回归截图；脚滑、目标误差、轮廓、蒙皮、运行时切换或动态审查任一失败都阻断最终批准。

运行规格验证：

```powershell
uv run scripts/validate_player_character_animation.py --source Artifacts/Animation/P3-002/Victory/victory-v1/animation-spec.yaml
```

### 10. 交接

- 向 `$unity-game-visual-assets` 返回目标绑定、17 项记录、完整组合、审查摘要和用户批准。
- 向 `$unity-game-qa-performance` 返回 Unity 捕获、导入设置、GUID 清单、测试结果和待执行设备矩阵。
- 视觉未通过时保持 30 骨骼、权重和动画暂停；视觉通过后，动画仍必须逐张通过关键姿势和变形预算门，不得直接制作连续曲线。
- P3-009 NPC、场景、UI、设备验收和商店配置不属于本 Skill，除非用户另行扩展范围。

## 状态词

只使用不会混淆技术与视觉的状态：

- `PLAYER_CHARACTER_BASELINE_AUDITED`
- `PLAYER_CHARACTER_MASTER_AWAITING_USER_APPROVAL`
- `PLAYER_CHARACTER_MASTER_USER_APPROVED`
- `PLAYER_CHARACTER_LAYER_VISUAL_TECHNICAL_PASS`
- `PLAYER_CHARACTER_FULL_SET_VISUAL_FAIL`
- `PLAYER_CHARACTER_VISUAL_FAIL`
- `PLAYER_CHARACTER_FULL_SET_AWAITING_USER_APPROVAL`
- `PLAYER_CHARACTER_FULL_SET_USER_APPROVED`
- `PLAYER_CHARACTER_UNITY_TECHNICAL_PASS_VISUAL_PENDING`
- `PLAYER_CHARACTER_UNITY_VISUAL_PASS`
- `PLAYER_CHARACTER_SKELETAL_SYSTEM_DRAFT`
- `PLAYER_CHARACTER_SKELETAL_SYSTEM_AUDITED`
- `PLAYER_CHARACTER_SKELETAL_SYSTEM_APPROVED`
- `PLAYER_CHARACTER_SKELETAL_SYSTEM_BLOCKED`
- `PLAYER_CHARACTER_ANIMATION_DRAFT`
- `PLAYER_CHARACTER_ANIMATION_POSE_CARDS_AWAITING_REVIEW`
- `PLAYER_CHARACTER_ANIMATION_POSE_CARDS_APPROVED`
- `PLAYER_CHARACTER_ANIMATION_TRANSITIONS_BUILT`
- `PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING`
- `PLAYER_CHARACTER_ANIMATION_APPROVED`
- `PLAYER_CHARACTER_ANIMATION_BLOCKED`

禁止使用未注明范围的裸 `PASS`。

## 完成条件

只有同时满足以下条件才报告人物完成：

- 生产母版和几何合同已获用户批准。
- 17 张独立 PNG 均有逐项记录并通过。
- 完整状态矩阵通过目标 A/B、遮挡和局部审查。
- 用户批准完整单图候选。
- Unity 保留 GUID 接入通过。
- Unity 目标对照验收通过。
- 若骨骼系统在范围内，生产路线、骨架、排序、蒙皮、IK、Animator、位移、翻转、玩法事件、物理、附件和性能规格全部通过并绑定当前系统版本。
- 若动画在范围内，4～8 张关键姿势、身体力学、接触约束、节奏反差、轨迹、IK 连续性和变形预算全部通过，AnimationClip 由结构化规格生成，1 倍速与 0.25 倍速动态审查、固定时间回归和最终用户批准有效。

设备验收被用户后置时，明确报告为后续 G3 项，不得伪装为已执行。
