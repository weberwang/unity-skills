# 资源流水线

## 何时读取

A3 资产地图已获 F4 确认，准备生产、导入、验证和登记独立位图或其他资源时读取。

## 前置

必须同时持有冻结 Visual Bible、F4 已确认的 A1 草图/结构、F4 已确认的 A2 高保真精确版本和 F4 已确认的 A3 资产地图；所有证据绑定对象 ID、版本、SHA-256 与 `sourceRevision`。A3 还必须有当前拆解方案的 `USER`/`ASSET_MAP` 批准记录，精确绑定 `subjectId`、`subjectVersion`、`evidencePath` 和 `evidenceSha256`，并覆盖带框选、稳定序号和简要说明的 annotated split preview、完整 items、分类、几何/导入规格、状态变体、目标节点/路径及复用/排除理由。缺标、错号、框选越界、说明缺失或其他证据缺失即阻塞。

## 执行

1. 枚举 A3 全部编号，确保每项只有一个分类、一个生产通道和至少一个结构节点/资源槽映射。
2. 在正式生成前再次核对批准记录与当前拆解方案的 ID、版本和哈希；批准前不得生成正式位图、导入资源或写入 Scene、Prefab、UXML/UI。代理、脚本、哈希或含糊“继续”不能代替用户确认。先按标注图上的 `[序号][productionRoute]` 与简要说明区分 GENERATE、REUSE 和 PROGRAMMATIC 路线。
3. 独立位图项逐项建立生产规格：内容、完整轮廓、遮挡补全、尺寸、透明、Pivot/Anchor、PPU、九宫格、动画帧、格式、预算和导入设置。
4. 每个图片项必须依据 Visual Bible 和规格独立生成或重绘。禁止裁切、抠取、放大、描摹或轻微修饰 A2 高保真图；禁止先生成一张合成生产源再切片；禁止整张效果图铺底。
5. `REUSE` 项必须有完整 `reuseResourcePlan`，冻结 `existingAssetId`、`reuseReason`、安全 `reuseMode`、源路径/SHA、Unity GUID、资产登记证据、许可/权属证据、Visual Bible 风格兼容审查、Importer 证据和最近 Unity 验证证据；其中 `effectImagePixelReuse: FORBIDDEN` 只禁止从高保真效果图取像素，按 `sourcePath`/`sourceSha256` 复用已登记源资源是允许的。人工确认资产地图后，复用前逐项核对且任一证据失效即返回 A3。禁止把裁切、抠取、改色或修饰高保真效果图标记为复用；`PROGRAMMATIC`、`CODE`、`MATERIAL`、`VFX` 和 `MODEL_3D` 分别转 Unity 图元/UXML/USS、Shader、代码或对应结构化责任通道，不创建图片生成任务。
6. 每项由非作者审核风格、边缘、透明、截断、接缝、状态变体和规格。失败只重做责任项及其依赖，内容变化生成新版本。
7. 当前项通过后，用 Unity MCP/Toolkit 正式导入并显式设置 Texture/Sprite 类型、sRGB、Alpha、Max Size、压缩、Filter、Wrap、MipMap、Read/Write、PPU、Pivot、Border 与寻址。
8. 在目标相机、分辨率、缩放、安全区、URP/UI Toolkit、材质和真实 A1 节点下验证渲染、寻址、九宫格、动画、透明排序、内存和预算。
9. Toolkit 可为图片写不可变导入记录；其他类型使用对应 Importer 证据。Codex 为 `docs/asset-register.yaml` 分配单写者，按资源 ID、源哈希、路径、GUID/地址查重；许可证没有人工结论时保持 `PENDING`。
10. 只有 A3 全部需生产项均为当前版本 `VALIDATED`、没有漏项/重复路由/占位/旧版本时，才允许移交 A4。

开发阶段禁止 PSD、PSB、PSDT、Photoshop 分层文档和分层导出方案；复杂透明边缘使用独立遮罩、干净背景、补绘或重新生成。

## 并行与 Unity

不同资产项可并行离线生产，但同一资源 ID 只有一个写入者；作者不得审核自己。Unity 导入、AssetDatabase、图集、共享 Prefab/Scene 和总登记更新串行。写入前后执行实例、Editor、上游批准、基线、对象、Console、登记和最小验证检查。

## 失效

Visual Bible 变化使受影响资源重启；A1 变化使节点映射和 A2-A4 失效；A2 变化使 A3 和全部依赖项失效；A3 拆解项增删、合并、分类、规格、尺寸、边界、节点映射或源高保真身份变化，会使用户批准、受影响资源和 A4 失效，必须重新人工确认；内容、GUID、地址或导入设置变化使该项回到验证前。

## 通过条件

全部编号均有唯一分类、通道、节点和当前产物；图片均独立生产，没有使用效果图成品像素；Unity 导入、运行、预算、来源、许可和登记证据完整，可安全进入 A4。
