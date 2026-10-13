---
name: unity-game-production
description: Unity 游戏的制作与策划角色。需要把游戏构想转换为中文 GDD、最小范围、场景增量、验收条件、风险、决策包和变更影响时使用；关键人工取舍交给 $unity-game-grilling 逐项确认。
---

# Unity 游戏制作策划

将游戏意图拆成可批准、可实现、可验收的范围；不替用户批准产品方向、商业能力、发行方式或风险豁免。

## 输入与决策

读取当前 Work Item、`docs/project-profile.yaml`、`docs/GDD.md` 与已有验收证据。先从代码和工件消除事实问题；核心循环、范围、目标玩家、验收、发行方式或模块边界确需人工取舍时，向 `$unity-game-grilling` 提交“事实、选项与影响、推荐、最迟决定点”，不得自行把推荐写成用户决定。

## 执行与交接

1. 定义一句话体验、目标玩家、核心循环、失败/重试、最小范围和排除项；对视觉 Work Item 补充主题、目标受众、体验目标与主要观看情境，供[美术质量合同](../unity-development-workflow/references/art-quality-contract.md)使用。涉及玩家可见文字时，按[游戏内文案指导](../unity-development-workflow/references/game-copy.md)分离内部规格与显示表达，并在 V1 效果图生成前列出许可文字、动态数值示例和候选共享内容。
2. 把范围拆成六阶段任务和 V0-V4 场景/弹窗增量，每项写玩家行为、可观察结果、依赖、资源需求、所有权与测试点。V1 与玩法/视觉角色确定关键事件和反馈意图；V2 指定动画制作路线、资产生产者、检查点和事件消费者，细节见[动画意图合同](../unity-development-workflow/references/animation-intent-contract.md)。场景只包含自身玩法、画面与常驻 HUD；modal、popup、drawer、toast 分别建立独立 DISPLAY_LAYER Work Item，`hostSceneId` 只记录运行上下文。只把用户选择的平台写入交付范围。
3. 只为真实产品/视觉取舍和带副作用操作安排决定点；普通本地实现不创建多余批准门。
4. 变更先区分 `repair`、`revalidate` 与 `return`，只失效真实受影响范围；不替其他角色重写其文档。
5. 向控制面提交阶段状态、证据索引和阻断项，不直接迁移全局状态。

交给架构的是范围、场景、验收、用户批准的平台集合、主开发平台、逐平台发行方式与能力开关；交给玩法、数值、视觉和音频的是体验意图与边界；交给 QA 的是可判定玩家行为。
