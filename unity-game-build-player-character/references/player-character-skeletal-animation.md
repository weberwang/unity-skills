# P3-002 关键姿势骨骼动画

## 何时读取

17 张玩家角色单图、完整组合和 Unity 原生 SpriteRenderer 视觉验收全部通过后，制作或返修 P3-002 的 Unity 2D 骨骼动画时读取。静态视觉尚未通过时保持 30 骨骼、Sprite Skin、权重和动画暂停。

## 输入

- 当前获批的 17 张 PNG、PlayerCharacter Prefab、30 骨骼层级、Sprite Skin、网格和权重版本。
- 骨骼局部轴校准证据、角色根节点坐标系、固定验收相机和地面基线。
- 动作意图、节奏、4～8 张关键姿势卡、世界空间目标、接触约束、变形预算和视觉事件。
- 当前来源修订、项目状态版本及所有静态姿势批准截图。

骨骼局部轴不一致，因此动作设计输入禁止使用“上臂旋转 +62°”一类局部角度。先冻结最终画面，再让 Unity 中求得的骨骼曲线服务于画面。

## 执行步骤

1. **冻结 Rig**：记录 Prefab、Rig 版本、30 骨骼、根骨、头/手/脚效应器和局部轴校准证据。Rig、网格、权重、骨骼层级或轴校准变化会使全部姿势解、AnimationClip 和回归截图失效。
2. **编写动作意图与节奏**：按动作拆成 4～8 个关键姿势，使用 `NEUTRAL`、`ANTICIPATION`、`EXPLOSION`、`IMPACT`、`CELEBRATION`、`HOLD`、`RECOVERY` 表达意图。每张姿势卡写轮廓，不写猜测的局部旋转符号。
3. **冻结世界空间目标**：在 `CHARACTER_ROOT_WORLD` 中记录头、左右手和左右脚的目标坐标与容差；肘、膝只记录弯曲方向和最低弯曲程度。设计输入是目标画面，制作阶段才根据当前 Rig 求局部骨骼变换。
4. **冻结接触约束**：脚处于 `PLANTED` 时必须记录世界空间锚点和最大滑移；连续固定期间锚点不得漂移。抬脚必须显式改为 `RELEASED` 或 `AIRBORNE`，不得用曲线误差解释脚滑。
5. **声明变形预算**：记录肩部旋转上限、肘部范围、裤腿张开距离、头发摆幅、手脚缩放许可、刚性图层和网格返修触发条件。任一姿势为 `MESH_REVISION_REQUIRED` 或 `BLOCKED` 时先修网格或权重，禁止强行旋转骨骼通过。
6. **逐张摆静态姿势**：在 Unity 中只摆当前姿势，解算世界目标并验证脚底、肘膝方向、轮廓、遮挡和蒙皮。保存 `resolvedPoseEvidence` 与固定相机 `acceptanceScreenshot`；全部姿势达到 `STATIC_POSE_PASS` 后才请求姿势卡批准。
7. **制作时间脚本**：每两个相邻姿势建立唯一段落，起止时间必须与姿势时间一致；过渡只使用 `LINEAR`、`EASE_IN`、`EASE_OUT`、`EASE_IN_OUT`、`FAST` 或 `HOLD`。禁止先做连续曲线再反推姿势卡。
8. **生成 AnimationClip**：构建器只消费已批准姿势的 `resolvedPoseEvidence`、时间脚本和当前轴校准，生成版本化 `.anim`；不得把局部角度数组散落在 C#。构建器不得覆盖旧 Clip，也不得重新猜测世界目标对应的旋转符号。
9. **添加视觉事件**：关键姿势和过渡通过后，再按事件表添加表情、颜色、高亮、闪白、拖影和次级运动。视觉事件时间必须处于动画时长内，不得用事件遮盖姿势或蒙皮错误。
10. **固定时间回归**：自动在每个关键姿势时间点截取固定相机画面，与批准截图做 A/B；同时检查脚滑、手脚目标误差、轮廓、肘膝方向、肩袖、裤裆、头发和刚性图层。全部回归通过后才请求最终用户批准。

胜利动作示例位于 `templates/player-character-skeletal-animation.yaml`，结构由 `schemas/player-character-skeletal-animation.schema.json` 约束。核心原则是：效果图定义姿势，动作脚本定义时间，世界空间目标约束手脚，变形预算约束蒙皮，Unity 曲线只负责实现。

## 子代理角色与并行边界

- 动作意图、轮廓和姿势卡可由动画设计者准备；同一 Rig 的静态姿势求解、权重修改和 AnimationClip 写入必须单写。
- 视觉一致性审阅者检查轮廓、表情和视觉事件；Unity 可实现性审阅者检查 Rig、目标误差、接触和曲线；UX/可读性审阅者检查动作节奏和移动端辨识度。
- 姿势审阅与变形审阅可以只读并行；任何网格或权重修改会停止全部审阅并使受影响姿势返回静态求解。

## 所需锁与 Unity 权限

- 读取 Rig、轴校准、Sprite Skin、网格、权重和现有 Clip 只需只读权限。
- 摆姿势、修改网格/权重、生成 Clip 或写 Animator 前，显式绑定唯一 Unity MCP 实例并取得 PlayerCharacter Prefab、Sprite Library、Sprite Skin、AnimationClip 与 AssetDatabase 独占锁。
- 构建期间禁止另一个写入者修改 Rig、骨骼层级、轴校准、Sprite GUID、网格或权重；Editor 编译、导入、域重载、PlayMode 或 Prefab Stage 脏状态时不得写入。

## 机器可读输出

输出符合 `player-character-skeletal-animation.schema.json` 的 YAML/JSON，建议路径为 `Artifacts/Animation/P3-002/<Animation>/<version>/animation-spec.yaml`。每个姿势必须包含：

- 动作意图、人物轮廓和时间点。
- 五个世界空间目标及容差。
- 双脚接触状态、锚点和滑移上限。
- 双肘双膝弯曲方向。
- 表情、颜色、高亮和闪白状态。
- 变形预算结论、静态验收截图和已求解姿势证据。

时间脚本、视觉事件表、回归捕获和构建结果与同一 `animationId`、`animationVersion`、Rig 版本及来源修订绑定。运行：

```powershell
uv run scripts/validate_player_character_animation.py --source Artifacts/Animation/P3-002/Victory/victory-v1/animation-spec.yaml
```

脚本只证明结构、时间、约束和证据链一致，不会自动宣布姿势视觉正确。

## 通过条件

- 关键姿势数量为 4～8，ID 唯一、时间严格递增，第一帧为 0，最后一帧不超过动画时长。
- 时间脚本逐段连接相邻姿势，无缺段、重叠、倒序或时间漂移。
- 每个固定脚目标与接触锚点一致；连续固定期间锚点漂移不超过声明上限。
- 姿势卡批准前，每张姿势都有 `STATIC_POSE_PASS`、验收截图和已求解姿势证据。
- 全部姿势在变形预算内；超预算姿势已通过新网格/权重版本重新求解。
- 每个关键时间点都有固定相机回归截图；最终批准时全部为 `PASS`。
- AnimationClip 由批准的结构化规格生成，不存在散落的硬编码局部角度数组。

## 失败与恢复出口

- 世界目标无法达到、肘膝方向错误或脚滑：保持当前姿势失败，先调整姿势目标或 Rig 求解，不制作过渡。
- 轮廓、肩袖、裤裆、头发或刚性图层超预算：返回网格/权重阶段；新版本使全部受影响姿势和下游 Clip 失效。
- Rig 局部轴、骨骼层级、Sprite GUID、网格或权重变化：重新校准轴并从第一张静态姿势开始。
- 姿势时间或内容变化：重建受影响段落、视觉事件和全部对应回归截图。
- 无法证明当前截图来自固定相机与精确时间点：状态保持 `PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING` 或 `PLAYER_CHARACTER_ANIMATION_BLOCKED`，不得批准。
