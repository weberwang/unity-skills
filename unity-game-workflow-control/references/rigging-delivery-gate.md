# 2D 骨骼资产交付门禁

正式角色交玩法前，将资产工程检查和该角色在目标项目中的 Editor PlayMode 回归接入现有 F3。继续使用原 Work Item、实施单元及状态；不增加资产状态机或用户审批阶段。门禁只读取证据，不启动 Unity、真机或发布流程，也不自动派发消息或修改制作文件。

## 声明当前交付

骨骼资产工作项使用 `domain: 2d-rigging` 与 `actionType: unity-asset-change`，必须提供 `riggingDelivery`。其他工作项只要包含骨骼交付，也显式填写该字段；公共工具开发和普通资产任务不因此强制套用角色门禁。

下列内容是既有 Work Item 的字段片段，其他字段仍按原 schema 填写：

```json
{
  "domain": "2d-rigging",
  "actionType": "unity-asset-change",
  "riggingDelivery": {
    "owners": {
      "technicalArt": "ta-owner",
      "rigging": "rigging-owner",
      "visualAssets": "visual-owner",
      "gameplay": "gameplay-owner",
      "qa": "independent-qa"
    },
    "characters": [{
      "characterId": "hero",
      "prefabPath": "Assets/Characters/Hero/Hero.prefab",
      "prefabGuid": "0123456789abcdef0123456789abcdef",
      "sourceRevision": "hero-candidate-3",
      "updatedAt": "2026-10-20T01:00:00Z",
      "requiredRuntimeCases": ["runtime-instantiation", "animation-playback"]
    }]
  }
}
```

负责人 ID 对应当前实施包的实际岗位所有者；QA 必须独立于生产负责人。总控按角色的实际使用场景补齐 `requiredRuntimeCases`，覆盖适用的循环、过渡、事件、中断、暂停、变体、对象池及多实例行为，不能为绕过失败而删除必需用例。最少验证真实实例化和动画播放。

`sourceRevision` 标识当前候选版本，`updatedAt` 记录该候选最近变更。返修改变角色、部件、动作或接口后更新候选事实和受影响的用例，原证据不能直接继承。检查依赖的实际文件或 `.meta` 在验证后发生修改，也会阻断交付；不计算或比对 SHA。

## 取得并绑定证据

1. 技术美术提供 `uwt_validate_2d_rigging` 调用入口；骨骼制作维护当前角色检查 Job，其 `taskId` 等于 Work Item ID，`projectId`、`sourceRevision` 和 `prefabPath` 对应当前交付。独立 QA 复验并保存原始工程报告。报告使用现有 `evidence` 数组记录实际 Prefab 的 GUID，以及 Prefab、Clip、变体图片的实际 Assets 依赖。
2. 独立 QA 在目标项目编写或复用真正加载该 Prefab 的角色回归，按所声明情境进入 Editor PlayMode 执行。保存实际 `test_status --format json` 原始信封，等待 `completed`；不能使用启动响应、零测试、跳过测试或工具夹具代替。
3. 将双方结果写入既有 Evidence Manifest 的 `riggingDelivery`，与原来的 Work Item、基线和实施包证据一起校验。外层 `verdict`、F3 或 `unityEvidence.playMode` 写成 `PASS`，不能覆盖子报告失败。

以下是 Evidence Manifest 的字段片段；文件路径、负责人、版本、时间和测试全名必须替换为真实记录：

```json
{
  "riggingDelivery": {
    "characters": [{
      "characterId": "hero",
      "prefabPath": "Assets/Characters/Hero/Hero.prefab",
      "prefabGuid": "0123456789abcdef0123456789abcdef",
      "sourceRevision": "hero-candidate-3",
      "assetReportPath": "Artifacts/RiggingValidation/hero-assets.json",
      "reviewedBy": "independent-qa",
      "reviewedAt": "2026-10-20T01:15:00Z",
      "regression": {
        "scope": "project-character",
        "executedIn": "EditorPlayMode",
        "status": "PASS",
        "editorVersion": "6000.5.6f1",
        "animationPackageVersion": "15.1.0",
        "completedAt": "2026-10-20T01:12:00Z",
        "rawReportPath": "Artifacts/TestResults/hero-runtime.json",
        "cases": [
          {"id": "runtime-instantiation", "testName": "MyGame.Tests.HeroRuntimeTests.InstantiatesCurrentHero", "status": "PASS"},
          {"id": "animation-playback", "testName": "MyGame.Tests.HeroRuntimeTests.PlaysCurrentHeroAnimations", "status": "PASS"}
        ]
      }
    }]
  }
}
```

工程报告必须实际通过、检查项非空且全部通过，来源身份和当前资源 GUID 匹配。回归的每项必需情境必须精确对应原始结果中的 `Passed` 测试，运行总数和结果自洽，不能包含失败、跳过或未定结果。工程与回归的实际 Editor/Animation 包版本须一致，时间不得早于当前候选和资源变更，独立复验时间不得早于这些结果。

仓库 `Project.UnityWorkflow.Tests.Rigging` 使用 `Assets/__UwtRiggingTests_*` 技术夹具，只证明公共工具与夹具行为，不能作为上述正式角色交付证据。没有目标角色用例时保留阻断，由 QA 补齐。`EnterPlayMode` 用例的原始 runner 模式可以是 EditMode；由 QA 如实记录它实际进入的播放上下文。控制器核对文件、身份、状态及用例覆盖，不从测试名称推断测试实现，也不判断视觉表现。

## 阻断与按岗位退修

先运行既有 `check` / `run`。`metadata.riggingDelivery` 给出此门禁的 `handoffAllowed` 和 `repairs`；只有它通过且原有 F0–F4、专项确认和其他适用门禁也满足，才能交接。正常 `transition` 同样执行检查，不能直接写 `PASSED` 绕过。只读检查不改工作项，失败的前向操作不推进状态。

| 问题 | 返修责任 | 复验 |
| --- | --- | --- |
| 公共检查工具、导入规则、诊断或回归设施缺陷 | `technicalArt`：技术美术 | 独立 QA 重跑工具与受影响角色 |
| 骨架、网格、权重、Clip、Controller、挂点或角色切换缺陷 | `rigging`：骨骼制作 | 独立 QA 重跑资产与受影响情境 |
| 缺图、角度/形变部件、遮挡补全或连接区绘制缺陷 | `visualAssets`：视觉资产 | 骨骼接入后由独立 QA 复验，显示效果交人工 |
| 触发、权威状态、判定、事件消费或玩法生命周期缺陷 | `gameplay`：玩法开发 | 独立 QA 重跑实际消费情境 |
| 缺失、未执行、陈旧、格式错误或未绑定当前对象的证据 | `qa`：独立 QA | `revalidate` 补证；不能代替生产者修内容 |

QA 在角色记录的可选 `findings` 中提供明确归属：`role`、`reason`、`affectedPaths`。未闭环的问题不会因报告写 PASS 而放行；资产/运行真实失败无明确分类时默认退骨骼制作，跨界归属交总控裁决。输出中的 `assignee` 来自当前 `owners`，由总控沿用原实施单元 `owner`、工作项 `assignedAgent` 和文件所有权完成交办，不因工具诊断让 QA 或 TA 接管角色资产。

普通缺陷用 `repair` 保持当前范围，证据失效用 `revalidate`；只有上游事实或范围确实失效才按既有规则显式 `RETURN`。修复后取得当前对象的新报告，由独立 QA 复验并清除已闭环 findings，再重新检查门禁。角色工程就绪不等于玩法接入后整体完成；后续运行轮、动画质量意见和用户显示确认继续执行。

未启动真机或 Standalone/Player 的结果不能证明设备验收。截图和实际预览继续由用户人工确认，不自动分析，不增加一轮文字审批。
