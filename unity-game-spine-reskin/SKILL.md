---
name: unity-game-spine-reskin
description: 在固定 Spine Skeleton、Slot、Attachment、Mesh、约束、动画和玩法挂点的前提下，为现有 Spine 角色规划、生产、导出并验证原生多 Skin 外观换皮。用户要求“Spine 换皮”“同骨架更换角色外观”“新增 Skin”“保持动画只替换美术”或在 Unity 中接入既有 Spine Skin 时使用；需要改骨架、网格、权重、动画、约束、碰撞、挂点或玩法代码时不得使用本 Skill 冒充完成。
---

# Unity Spine 外观换皮

只替换外观。优先在同一 Spine `Skeleton` 中新增原生多 `Skin`，复用现有骨架、动画、Mesh 和权重；不得用重做角色结构的方式扩大范围。

## 先判定是否仍是换皮

只在以下结构全部冻结时继续，并在开始前保存源工程、导出物与 Unity 基线证据：

- Bone 名称、父子层级和 Setup Pose。
- Slot 名称、顺序和 Draw Order。
- Attachment 名称、类型和占用关系。
- Mesh 顶点、三角形、UV、权重和 Linked Mesh 关系。
- IK、Transform、Path 约束及其目标和顺序。
- 全部动画、事件和 Attachment Timeline。
- 碰撞、攻击点、受击点、挂点及玩法代码。

若新外观必须改变任一冻结项、轮廓无法在现有 Attachment/Mesh 边界内成立、连接区无法复用或现有网格发生明显变形错误，立即返回 `BLOCKED`，列出冲突对象和证据，移交更高范围的角色重制/骨骼动画任务。不得删减外观、静默改名、改权重、换 Attachment 类型或降低验收标准后冒充换皮。

## 版本与源工程预检

1. 只读发现 `.spine` 源工程、原始纹理、导出 JSON/Binary、Atlas、Unity `SkeletonDataAsset`、AtlasAsset、材质和运行时代码入口。
2. 记录 Spine 源工程版本、实际导出所用 Spine Editor 版本、JSON/Binary 格式、`spine-unity`/Spine Runtime 包版本、Unity/URP 版本和当前导出设置。核对官方兼容矩阵或现有成功导出基线；版本不匹配时保持 `BLOCKED`，不得猜测兼容或擅自升级源工程。
3. 没有可写、可由正确 Spine Editor 打开的源工程时立即 `BLOCKED`。禁止直接篡改导出 JSON、Binary 或 Atlas 来伪造 Skin，也禁止以 Unity 运行时拼接替代正式源工程 Skin。
4. 核对现有 Skin、Slot、Attachment、网格、约束、动画、碰撞/挂点和 Unity 引用清单，形成冻结清单及 SHA-256。开始前确认目标输出目录和单写者，禁止覆盖唯一有效源或当前稳定导出。

## 按 A0-A4 执行

所有阶段采用 `F0 实际验证 → F1 总控分诊 → F2 独立非作者审核 → F3 总控收敛 → F4 用户决定`。所有确认绑定对象 ID、版本、SHA-256、`sourceRevision`、上游证据和结论范围。

### A0 引用 Visual Bible

引用仍有效且覆盖该角色的 Visual Bible。若缺失、失效或范围不足，返回 `$unity-development-workflow`，先完成全局方向恰好三个有效候选的 F4 三选一并冻结 Visual Bible；本 Skill 不自行跳过或缩减 A0。

### A1 换皮草图与结构映射

1. 产出实际可查看的完整换皮草图/灰盒，以及站立、移动、攻击等足以暴露连接和遮挡问题的关键姿势。
2. 画出每个部件的完整边界、被遮挡补全、连接区、前后遮挡、Clipping 边界和极端弯曲余量；不得只提交正面静态半身图。
3. 提交逐项 `skinId → slotName → attachmentName` 映射，标明 Attachment 类型、现有 Mesh/Linked Mesh、原点/Pivot、画布、用途、朝向、状态和预期 Atlas Region。
4. 经 F0-F3 后，请求 F4 确认当前精确草图、关键姿势和映射版本。未确认时不得进入 A2。

### A2 完整高保真确认

1. 只依据有效 A0 与已确认 A1，生成完整高保真角色和代表性关键姿势；不得暗改 Slot、Attachment、轮廓边界或遮挡设计。
2. F2 分别由非作者执行视觉一致性、Spine 可实现性和 UX/可读性审核；检查全部姿势、连接区、轮廓、层叠、Clipping、颜色识别和动画可读性。
3. F3 收敛当前版本后，由 F4 确认精确高保真 ID、版本、SHA-256 与 `sourceRevision`。任一像素、边界或映射变化均生成新版本并重跑受影响审核。

### A3 编号资产地图与逐项生产

1. 只分析 F4 已确认的高保真原图，完整编号所有可见部件和明确无需生产项；漏标、重号或无映射项均阻塞。
2. 每项固定记录 `skinId → slotName → attachmentName → sourceImage → atlasRegion`，并记录相同画布、Pivot/原点、连接区、完整遮挡补全、用途、朝向、像素尺寸、Alpha、PMA 策略和验收姿势。
3. 资产地图经 F4 确认后，才按编号逐项独立生成或重绘。禁止裁切、抠取、放大或轻微修饰高保真效果图充当源图；禁止整张角色效果图进入 Atlas。
4. 对每项核对现有 Attachment 类型、Mesh 顶点/UV/权重和 Linked Mesh。明显轮廓变化、画布/Pivot 不一致、连接区不兼容或网格无法承载时立即 `BLOCKED`，不得修改 Mesh、UV 或权重解决。
5. 每张源图分别验证透明边缘、完整轮廓、连接区、方向、尺寸、采样、色彩和在关键姿势中的变形，再允许进入 A4。

### A4 Spine 源工程与 Unity 接入

1. 在原 Spine 源工程新增原生 Skin，复用冻结的 Skeleton、Slot、Attachment 名称/类型、Mesh、权重、约束、动画和 Attachment Timeline；只替换各 Skin 的区域/图片绑定。
2. 使用已确认兼容的 Spine Editor 与既有导出配置重新打包 Atlas 并导出 JSON/Binary。输出到新版本路径，核对导出前后冻结清单；任何结构差异均失败。
3. 保持 Atlas Region 与 A3 映射一致。明确使用 PMA 或 Straight Alpha，纹理导入、Atlas 设置和材质 Shader 必须同一策略，禁止混用导致黑边/白边。URP 使用当前 `spine-unity` 支持的 Spine/Skeleton Shader 与正确材质关键字，不擅自换成不兼容通用 Shader。
4. 记录 Atlas 页数、材质/混合模式、Clipping、Draw Call、纹理尺寸、格式、MipMap 和估算/实测纹理内存；新 Skin 不得以无预算的额外 Atlas 页或材质放大批次数。只有用户明确需要独立下载、卸载或内容分包时才引入 Addressables，并验证 `SkeletonDataAsset`、AtlasAsset、材质和纹理引用原子加载。
5. 在 Unity 中以当前实例切换 Skin：先确认目标 Skin 存在；保持原 `AnimationState` 与当前 Track，不重建或清空动画状态；对该实例的 `Skeleton` 设置 Skin，恢复 Slot setup pose，再重新应用当前 AnimationState。目标 Skin 缺失时回退默认 Skin并报告，不写入共享 `SkeletonData`，不让一个实例的切换污染其他实例。
6. 重新导入后核对 `SkeletonDataAsset`、AtlasAsset、材质、纹理、GUID/地址、Prefab/Scene 引用和 Console；不得用 MCP/API 调用成功代替真实验证。

## Unity 验证矩阵

至少覆盖以下当前版本组合：

- 站立、移动、攻击、受击、死亡和项目实际使用的其他关键动画。
- 极端弯曲、拉伸、翻转、缩放及镜像条件。
- Attachment Timeline 切换、事件前后和动画混合/中断。
- 前后遮挡、Draw Order、Clipping、透明边缘、混合模式和颜色染色。
- 默认 Skin、新 Skin、缺失 Skin 回退和同一画面多实例使用不同 Skin。
- Prefab/Scene 重载、对象池复用、禁用/启用和存档恢复等实际生命周期。
- Atlas/材质/PMA/URP 显示、Draw Call、纹理内存和适用平台的 Editor 模拟。

先运行 EditMode/PlayMode、Editor/Game View 和项目既有自动测试。不得自动启动 Standalone、Player 或真机；设备验收只能在总控 G2 `PASS` 且用户明确要求后由 G3 执行。

## 证据、失效与交接

- A0 变化使 A1-A4 失效；A1 变化使 A2-A4 失效；A2 变化使 A3-A4 失效；A3 映射或源图变化使受影响项与 A4 失效。
- Spine 源结构、导出设置、Editor/Runtime 版本、Atlas、材质、GUID/地址或运行时切换逻辑变化，使对应导出与 Unity 验证失效；结构冻结项变化则退出本 Skill 并 `BLOCKED`。
- 保存冻结清单、草图/高保真/资产地图确认、逐项源图、Spine 源修订、导出日志、差异报告、Unity 引用、测试、截图、性能和失败证据。旧批准只作历史记录。
- 完成时向总控报告变更文件、固定项差异为零的证据、验证矩阵结果、Atlas/性能影响、未运行项和剩余风险；不得把缺少 Spine Editor、源工程、许可证、Unity 环境或设备写成通过。
