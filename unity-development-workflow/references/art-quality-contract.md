# 美术质量与动态体验验收合同

本合同用于 V1 确定美术目标，并在 V4 对实际场景或显示层体验逐项验收。它补充 Visual Bible，不创建独立阶段、状态机或确认机制。

## V1 brief

按 Work Item 写明主题、目标玩家/受众、核心循环、体验目标和主要观看情境，并说明视觉层级、关键玩法信息、刺激预算与已有规范。Visual Bible 的 `artBrief` 遵守 [`game-art-brief.schema.json`](../schemas/game-art-brief.schema.json)；美术 brief 字段由 `unity-game-production` 维护。将事件的反馈意图交给 [`unity-game-juice`](../../unity-game-juice/SKILL.md)，不以“更炫”替代玩家需要理解的信息。内部 brief 只供理解；按[游戏内文案](game-copy.md)交接玩家可见表达，不把 brief 原句绘入效果图或运行界面。

是否生成方向候选遵循[视觉工作流](visual-workflow.md)：仅在需要探索新视觉方向时生成候选，数量由 Work Item 决定；已有有效规范时按规范推进单一目标方案。不得为满足固定候选数量而重复生成近似方案。

## 五项逐项通过

制作和审查过程中可将每项标记为 `PASS`、`FAIL` 或 `NOT_RUN` 并记录证据；只有五项均通过时，最终验收材料才可提交。材料中的 `qualityResults` 使用 `themeFit`、`audienceFit`、`gameplayReadability`、`viewingComfort`、`artCompletion` 五个键，每项含 `status` 和 `reason`；最终接受格式要求五项 `status` 都为 `PASS`。`FAIL` 或 `NOT_RUN` 结果不得写成最终接受材料或推定为通过。

| 维度 | 检查问题 |
| --- | --- |
| 主题贴合 | 色彩、形状、材质、光照、镜头和动效是否服务已确认的主题？ |
| 受众适配 | 表现尺度、节奏与内容是否符合目标玩家和实际观看情境？ |
| 玩法可读 | 玩家能否在所需时间内分辨主体、状态、危险、目标和交互结果？是否混入内部规格说明或重复标签，数值归属和必要条件/后果是否清楚？ |
| 观看舒适 | 闪烁、亮度变化、镜头运动、运动密度和叠加效果是否符合已确认的刺激预算？ |
| 美术完成度 | 正式资源、组合、细节、边缘、材质、字体及状态是否达到本工作项已确认的目标？ |

这些维度不预设通用数值阈值。项目或 Work Item 已声明具体约束时按其检查；没有量化标准时以实际目标和人工确认记录判定，不自行创造通过门槛。

## V4 动态证据

按体验适用性逐项检查以下情境：

| 情境 | 重点观察 |
| --- | --- |
| `normal-play` | 主要操作、状态转换和反馈是否清楚，正常节奏下是否易读？ |
| `repeated-feedback` | 高频或连续触发时是否出现疲劳、残留、堆积或输入阻塞？ |
| `event-peak` | 单次高强度关键事件是否压过必要信息，结束后是否恢复？ |
| `overlap-peak` | 多事件同时发生时，反馈优先级、叠加和遮挡是否仍可辨认？ |

最终验收材料包含四个情境各一项，字段为 `id`、`required`、`reason`、`status`。`normal-play` 总是必需；其他情境按当前玩法适用性确定。`required: false` 时以 `NOT_APPLICABLE` 标记并说明理由，不附运行数据；`required: true` 时必须提供真实录制的 `recordingPath`、`durationSeconds`、`startSeconds`、`endSeconds`、`eventCount`、`peakConcurrency`、`viewport` 和 `observations`，且 `status` 必须为 `PASS` 才能进入最终接受材料。实现/验收过程发现的失败或缺失证据仍按 `FAIL` 或 `NOT_RUN` 如实记录在工作证据中，不伪造 `PASS`。

最终材料按 [`art-experience-acceptance.schema.json`](../schemas/art-experience-acceptance.schema.json) 保存为项目内 JSON；V4 PASS Evidence Manifest 顶层的 `artExperienceAcceptanceRef` 是指向该文件的项目相对路径，并绑定 `candidateId`、`candidateVersion`。材料还必须包含 `workItemId`、`sceneId`、`artBriefRef`，以及 `confirmedBy`、`confirmedAt`、`userMessageRef`、`userText`。`artBriefRef` 指向符合 `game-art-brief.schema.json` 的 JSON。该材料复用现有 V4 用户确认，不增加独立审批门。截图只交由用户检查显示效果；除非用户明确要求自动视觉验证，代理不分析截图或据此判定视觉通过。机器侧事件、Importer 或参数检查只能证明相应工程事实，不能替代美术视觉验收。

需要重新检查时只覆盖候选、场景或行为变化实际影响的条目。实现中调整的内部方案不要求回改目标合同；在验收材料说明真实交付和结果。
