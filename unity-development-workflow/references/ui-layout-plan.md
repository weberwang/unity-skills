# 居中与机器布局包

在 V2 拆解确认后生成布局图时读取。`ui-layout-plan.schema.json` 规范布局图的机器数据，复用现有 `layoutBinding`；它不是第二份拆解清单、确认账本或新的工作流阶段。`sceneId/stateId`、UI 系统与坐标空间必须明确，节点 ID 和归属来自已确认拆解，不从几何位置猜测。

## 输入与派生

每个节点保留原始 `bounds`、`parentElementId`、`semanticGrouping`、`renderKind` 和 `layoutBinding`。`renderKind` 区分 `SPRITE`、`STRUCTURE`、`TEXT`、`BACKGROUND`；底板使用 SPRITE，既保留图片身份也可承担组件根职责。所有几何使用当前包声明的同一种单位，不能把参考图物理像素直接写成 Unity 布局单位。

`roots.viewport` 保存本批完整可见矩形，`roots.safe-area` 保存同批实际安全区矩形。稳定根只是几何参照，不证明有同名 GameObject/VisualElement；它们不能占用业务节点 ID，安全区必须位于视口内。所有节点消费同一份根边界，不能因缺少单节点快照把安全区默认为全屏。

布局派生仅写入拷贝中节点的 `targetBounds`，不修改原始 `bounds`、确认记录、节点顺序、尺寸、父级或资源身份。原始拆解与布局结果使用不同路径，不能覆盖原输入。

## 单项与组合居中

`layoutBinding.axisAlignment` 表达停靠意图。选择 center 的轴省略策略时使用严格居中；非 center 轴不能声明中心策略。

- `centerAlignment.horizontal/vertical.mode: strict`：节点矩形中心对齐有效位置参照中心，该轴中心偏移为零。
- `mode: reference`：使用有限 `offset` 和具体 `reason`，表达已确认的设计偏移或人工光学补偿。不能自动把测量误差保存为设计意图。
- `centerAlignment.memberIds`：leader 列出自身与全部图文成员，按联合包围框整体居中；成员同父、同上下文且不重叠归组，leader 的外部参照不能来自组内。角标、阴影等非组合成员不参与计算。

例如按钮图标与文字整体居中时，两者沿相同轴移动相同距离，保持间距和尺寸；广告角标独立停靠。不能分别将图标和文字放到按钮中心。父级或独立位置参照移动后，依赖节点按依赖顺序跟随，相同上游位移只计算一次；最终 bounds 从原始数据与策略重新计算，禁止仅清零 offset 后自报通过。

```json
{
  "axisAlignment": {"horizontal": "center", "vertical": "center"},
  "centerAlignment": {
    "horizontal": {"mode": "strict"},
    "vertical": {"mode": "strict"},
    "memberIds": ["purchase-icon", "purchase-label"]
  }
}
```

## 工具与阶段接入

在目标项目中将布局图使用的节点、根几何和决策保存为 JSON，再调用随 Skill 安装的文件工具：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs layout-plan --project-root . --source docs/layout-input.json --output docs/layout-plan.json
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs layout-check --project-root . --source docs/layout-plan.json
```

具体字段以 schema 为准。生成布局图时使用派生的 targetBounds；`layout-check` 从原始 bounds 重算并核对结果，检查引用、联合循环、越界、成员与中心策略。`compile-json --kind ui-layout-plan` 使用同一检查，不把未经检查的布局计划封装为可执行 Job。文件工具的通过仅证明结构与几何事实，不证明用户已确认图或 Unity 已实现该计划。

V2 先确认拆解图，再生成和单独确认布局图；V3 沿资源登记与导入验收执行；V4 使用[实际布局测量](layout-calibration.md)核对正式组合。目标内的实现修复使用 `repair + revalidate`；只有目标、范围或上游事实变化才回到受影响阶段，不为驱动器技术调整新增审批或强制回退。
