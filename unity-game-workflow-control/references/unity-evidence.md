# Unity 证据清单

Evidence Manifest 必须绑定 `workItemId`、`packageId`、`baselineHash` 和记录时间。证据只能描述已经发生并可复核的事实；控制面不会启动 Unity 或补造截图、日志、构建和设备结果。

Manifest 同时记录 `workItemType`、`visualStage`、`contractVersions`、`responsiveEvidence` 和 `productionContractAudit`。`contractVersions` 只记录合同来源，不要求与当前合同版本一致；`hostSceneId` 只作为显示层运行上下文。

## F3 最小证据

生产实现或场景验收至少记录：

- Unity Editor 稳定打开，目标项目未出现未处理异常；
- C# 编译成功，域重载完成，Console 没有新增 Error/Exception；
- 相关 EditMode 和 PlayMode 测试结果；
- Scene、Prefab、ScriptableObject、GUID 和 Importer 设置与实施包一致；
- 本地构建目标、版本、输出路径和可复现命令。

`unityEvidence` 中的每一项使用 `PASS`、`FAIL` 或 `NOT_RUN`（也可用布尔值表示 PASS/FAIL），并通过 `gateResults` 绑定 F0-F4。

## 可见 V4 响应式证据

可见 Work Item 只有在 `visualStage=V4` 且所有响应式运行事实真实测量后才能提交 PASS。`responsiveEvidence` 必须记录 Game View、Screen 和 backbuffer 的测量工件，实测 CanvasScaler 或 PanelSettings 之一、Camera、`Screen.safeArea`、InputSystem/EventSystem 命中结果、同一进程内的连续 resize 轨迹和截图。`supportedOrientations` 记录实际支持方向，并核对用户要求：横屏无需验证竖屏，竖屏无需验证横屏；单方向轨迹可仅含 resize，双方向或自动方向必须另含 orientation 切换事件。控制器限制工件路径在仓库内并检查实际文件存在，不要求或校验 SHA。`productionContractAudit` 记录实际完成情况满足验收要求，明确 `status=PASS`、`staticDeclarationOnly=false`、`buildOnly=false`、`singleScreenshotOnly=false`；合同版本仅作为来源记录。

静态合同声明、构建成功、单张截图或单次启动尺寸都不能替代上述证据。运行时缩放以平台、Canvas、Panel 和 Camera 实测为准；Unity 图片源 `sourceScale=1` 只表示生产基线，不是运行时 DPR。

## 可见 V4 美术与动态体验

V4 `PASS` 还必须提供 `candidateId`、`candidateVersion` 与项目内 JSON 路径 `artExperienceAcceptanceRef`。材料遵循[美术验收合同](../../unity-development-workflow/references/art-quality-contract.md)，绑定工作项、场景或独立显示层、项目美术 brief、五项人工质量结果及四个动态情境。五项均通过；适用情境必须有非空真实录屏、有效片段范围、实测次数/并发、视口与人工观察。不适用情境逐一说明理由，不伪造实测。

机器检查文件边界、结构、身份和结果记录，不能证明用户已实际观看或评价画面；编排者须依据真实用户回复填写确认。既有 V4 确认可同时覆盖这些材料，不新增审批。截图采集 `PASS`、几何容差 `PASS` 和美术人工通过分别记录，缺失、失败或未验证时阻断当前完成结论。直接状态迁移也会重新读取证据，不能以静态门状态绕过。

## 设备与发布

设备、商店、外部服务和发布属于 A5/A6。没有精确批准时，`device` 和 `release` 必须保持 `NOT_RUN`；不得将“未测试”写成 PASS。设备或发布证据若为 PASS，必须同时引用当前 F4 批准的 `approvalId`、目标和基线。

## 证据处置

编译失败、域重载异常、Console 错误、测试失败、实际资源引用或导入设置错误、构建不可复现时返回 `repair` 或 `revalidate`。实现调整后重验受影响行为并记录实际结果，无需回改合同；只有用户目标、授权范围或工作项身份实质变化才重新处理受影响范围，不因合同版本、内容或文件变化自动 `RETURN`。
