# 2D 场景屏幕适配

## 何时读取

目标场景使用正交摄像机、2D 世界和 UI Toolkit，且需要覆盖 Windows 窗口或移动设备宽高比时读取。该流程是每个 2D 场景小循环的必做项，不替代全局视觉、玩法、平台适配或 UI 审查。

## 输入

- 已确认的场景方向、参考分辨率、像素单位和交互安全区。
- 已批准的全局 Visual Bible、场景效果图与专门生成的边带背景资源。
- 正交摄像机、UI Toolkit `PanelSettings`、目标分辨率矩阵和可写路径所有权。

## 不可变规则

- 竖屏以设计高度为基准：`Camera.orthographicSize = referenceHeight / pixelsPerUnit / 2`；UI Toolkit `PanelSettings` 使用 `ScaleWithScreenSize`、`MatchWidthOrHeight`、`match = 1`。
- 横屏以设计宽度为基准：`Camera.orthographicSize = referenceWidth / pixelsPerUnit / camera.aspect / 2`；UI Toolkit 使用相同缩放模式，但 `match = 0`。
- 竖屏目标比参考画面更宽时，仅在 LEFT、RIGHT 区域显示两张无交互背景；横屏目标比参考画面更窄时，仅在 TOP、BOTTOM 区域显示两张无交互背景。
- 相反方向的比例变化会裁切设计画面的非安全外围，不得缩放或移动交互安全区来填满窗口。
- 边带资源必须位于玩法和 UI 后方，不得含按钮、提示、可点击区域、Collider、Collider2D 或任何玩法信息。摄像机清屏色不能作为正式边带，任何目标分辨率都禁止黑边。
- 边带图片必须依据已批准的全局视觉基线专门生成，并作为正式资源独立登记、审查和导入；不得拉伸游戏截图或 UI 截图充当背景。
- 移动端布局还必须约束于实时安全区，避开刘海、挖孔、圆角、系统栏和系统手势区域；Windows 则验证窗口客户区、DPI 和缩放变化。安全区不得被装饰边带扩张或替代。

## 执行步骤

1. 创建 `scene-2d-adaptation` 契约，记录方向、参考分辨率、PPU、交互安全区和边带资源。
2. 至少声明三种验证分辨率：与参考比例相同、会产生装饰边带、会裁切非安全外围。契约校验会重新计算预期结果，声明与数学结果不一致时立即失败。
3. 使用 Toolkit 的 `Adaptive2DViewport` 配置正交摄像机、PanelSettings 与装饰 SpriteRenderer；边带对象只允许纯视觉组件。
4. 在场景小循环中对每个声明分辨率验证玩法摄像机尺寸、UI match、边带方向、无黑边、边带无交互和交互安全区；Unity 配置、数学、EditMode、PlayMode 与 Game View 模拟全部通过后，才可把适配契约标记为 `VERIFIED`，供 G2 模块与场景验收消费。研发阶段不得安装或启动 Player；最终设备验证只在 G2 `PASS` 后的 G3 执行。
5. G2 为每个批准平台完成独立适配报告。全部模块、场景和平台适配通过后，在 G3 使用每个平台自己的候选主制品执行完整设备档位矩阵，逐设备重新捕获游戏、UI 和运行证据，并把平台制品哈希、设备与场景组合写入最终设备报告。任一组合未运行、失败或绑定错误平台制品时，`devices.acceptance-verified` 不得通过。

## 子代理角色与并行边界

- 视觉代理可并行生成左右或上下边带候选；同一边带资源只允许一个写入者。
- Unity 集成代理串行配置摄像机、PanelSettings、SpriteRenderer 和正式场景接线。
- 独立审查代理只读取效果图、运行截图、契约和组件结构，不修改被审查场景。

## 所需锁与 Unity 权限

- 生成候选图只需视觉制品路径锁；正式资源导入需要目标资源路径锁。
- 摄像机、PanelSettings、Prefab 或场景写入必须显式绑定唯一 `unity-mcp` 实例，并持有对应 Unity 写锁。
- 分辨率取证和审查原则上只读；需要切换 Game View 时先确认 Editor 未编译、导入或进入 PlayMode。

## 计算口径

设参考比例为 `referenceWidth / referenceHeight`，目标比例为 `screenWidth / screenHeight`：

| 方向 | 基准轴 | 产生边带 | 裁切外围 | 边带位置 |
| --- | --- | --- | --- | --- |
| 竖屏 | 高度 | 目标比例更大 | 目标比例更小 | LEFT、RIGHT |
| 横屏 | 宽度 | 目标比例更小 | 目标比例更大 | TOP、BOTTOM |

边带厚度按世界空间计算。竖屏每侧为 `(visibleWidth - referenceWorldWidth) / 2`；横屏每侧为 `(visibleHeight - referenceWorldHeight) / 2`。小于等于浮点容差时按无边带处理。

## 机器可读输出

- `scene-2d-adaptation.yaml`：使用 `schemas/scene-2d-adaptation.schema.json` 校验，并绑定项目、源码修订、项目状态、场景和场景版本。
- `unity-2d-adaptation-config`：证明 Adaptive2DViewport、正交摄像机、PanelSettings、相机 Culling Mask、边带 Alpha 与后景 Sorting Layer/Order 均有效。
- `unity-editmode-test-report`：必须来自 `Scene2DAdaptationTests`，测试总数与通过数一致且失败数为零。
- `runtime-2d-adaptation-screenshot`：G3 中每个设备档位与声明分辨率的最终运行证据，记录候选构建版本、截图 SHA-256、无黑边、边带可见与交互安全检查结果。

`scene-manifest` 的 `dimension: 2D` 必须引用上述 `VERIFIED` 契约；`dimension: 3D` 不得伪造该引用。G2 的场景与模块验收可消费这一技术验证，但不能产生最终设备验收结论。G3 的 `scenes.2d-adaptation-verified` 必须提交当前拆分中全部已批准场景的 manifest，逐项深验其中的 2D 适配；没有 2D 场景时仍核对场景全集，但不要求 3D 场景伪造适配证据。最终跨设备结果由同门的 `devices.acceptance-verified` 独立证明。

## 通过条件

- 竖屏固定设计高度且 UI match 为 1；横屏固定设计宽度且 UI match 为 0。
- 参考、边带、裁切三类目标分辨率的数学结果与契约一致，交互安全区不进入装饰区域。
- 所有需要的左右或上下边带均为已登记纯视觉资源，不含交互组件、玩法信息或黑边。
- G3 的 EditMode、目标分辨率截图和各批准平台实机证据均引用所属平台当前候选主制品与场景版本；未运行项没有被推断为通过。

## 失败与恢复出口

- 边带出现黑色空区、交互组件或玩法信息：当前分辨率直接 FAIL，返回背景资源或场景布局修复。
- 边带 Renderer 被禁用、透明、相机剔除、排序在玩法前方，或纹理未开启 Read/Write 导致无法扫描 Alpha 覆盖率：Unity 配置证据失败或 BLOCKED。
- 交互元素进入边带：不得扩大交互安全区；返回 UI/玩法布局修复。
- 缺少 Unity 或目标构建环境：标记 BLOCKED，不得把 Python 或静态检查当作运行时通过。
