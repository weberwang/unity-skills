# 视觉资产地图、逐项独立生成与 Unity 接入

## 何时读取

生成游戏/UI 效果图、建立资产地图并逐项独立生成、制作透明素材，或导入 Sprite、2D/3D 纹理、字体与位图 VFX 时读取。3D 几何、UV、PBR 贴图集、URP 材质、LOD、Collider 与模型 Prefab 按总控已加载的 3D 资产工作流分流，不套用 `image-task` 冒充模型任务；跨类型条目仍统一登记在 `split-plan` 资产地图中。

## 输入

- 已批准 Visual Bible，以及当前场景 P0 `STRUCTURE_APPROVED`、P1 `HIGH_FIDELITY_CONFIRMED`、P2 `REVIEW_APPROVED`、P3 `ASSET_MAP_APPROVED` 的完整版本链；任一证据缺失、失效或哈希不匹配时必须阻塞。
- 来源文件、来源版本或内容哈希、授权/生成记录、目标路径与 Unity 导入约定。
- 当前资源登记、性能预算、SpriteAtlas/Addressables 规划和实机反馈。

## 执行步骤

1. **拆分前拷问并确认完整资产地图**：P3 地图必须直接标注在 P2 通过的精确原图上，覆盖所有可见生产元素并列明无需生产的排除项；逐项拷问稳定 ID、用途、独立生成必要性、复用边界、轮廓、遮挡补全、像素尺寸、透明、枢轴/锚点、PPU、九宫格、动画帧、交付形式、性能代价和目标 Prefab/Scene 槽位，再绑定唯一生产通道。重叠框选可以表达遮挡关系，但不得造成同一元素重复生产；拷问结论与地图必须一起取得用户确认。
2. **分类与登记**：2D/位图类 `SPRITE`、`UI_BITMAP`、`NINE_SLICE`、`BACKGROUND`、`ANIMATION_FRAME`、`DECAL`、`BILLBOARD`、位图 VFX 继续本流水线；`MODEL_GEOMETRY` 交给 `$unity-game-3d-modeling`；`PBR_TEXTURE_SET`、`MATERIAL` 交给 `$unity-game-3d-texturing`；`LIGHT`、`CAMERA`、`POST_PROCESS`、`SHADER`、`UI_TOOLKIT`、`CODE` 交给实现任务。混合场景共用同一地图，每项只能属于一个通道。优先以“P2 图像哈希 + 地图版本 + 条目 ID”生成稳定资源 ID；只有风格与全部上游版本仍有效且最近 Unity 验证通过的产物才可复用。
3. **声明参考边界**：逐张登记截图和 P1 效果图及其哈希，只允许作为 `CONTENT`、`COMPOSITION`、`INFORMATION_HIERARCHY` 与地图条目定位证据。色彩、材质、光照、字体、图标、笔触和成品像素必须来自已批准 Visual Bible；框选定义“要生产什么”，不授权裁切、描摹或风格复刻。
4. **P4 逐项独立生成**：每个图片条目建立独立 `image-task`，从 `PLANNED` 进入 `GENERATING`；依据 Visual Bible 和条目规格重新生成边界完整、可独立导入的单图，不先生成一张合成生产源再裁切。动画序列可共享规格，但每帧都必须有唯一条目、完整画布、统一基线、朝向与枢轴。默认输出透明 PNG，完整不透明背景才使用合适格式。简单纯色背景可色键处理；复杂边缘、半透明、毛发或混合背景必须使用分层源、遮罩或重新生成。
5. **逐项独立审查**：条目状态从 `REVIEWING` 到 `APPROVED` 前，视觉一致性、Unity 可实现性和 UX/可读性审查必须绑定该条目的独立输出、Visual Bible、P1/P2 与 P3 地图版本。在棋盘格、深色和浅色背景检查风格、白边、黑边、透明杂点、截断、空白、接缝和发光边距。任何失败只重做责任条目及依赖项，旧修订标记“已取代”，不得覆盖。
6. **逐项 Unity 导入**：只有当前条目为 `APPROVED` 才能进入 `IMPORTED`，并显式设置纹理类型、sRGB、Alpha、Max Size、压缩、Filter、Wrap、MipMap、Read/Write、PPU、Pivot、Border 与 Sprite Mesh；按用途建立 SpriteAtlas、Addressables 或直接引用，避免重复纹理和隐式 Resources 膨胀。
7. **逐项运行验证**：在目标分辨率、缩放、摄像机、URP、UI Toolkit、目标槽位与实际材质下验证寻址、色彩、采样、九宫格、动画、透明排序和内存；记录 Profiler/Frame Debugger 或等价证据，通过后标记 `VALIDATED`。框选条目尚未绑定目标槽位时不得通过。
8. **聚合验证**：枚举 P3 地图全部生产项，解析图片、模型、贴图材质与实现通道的当前验证证据；只有无漏项、无重复路由、无旧版本、无占位且全部为 `VALIDATED` 时，才产生 `ALL_ITEMS_VALIDATED`。未达到该状态，P5 始终保持 `ASSEMBLY_BLOCKED`。
9. **更新登记**：`uwt_import_image` 成功后只新增 `Artifacts/AssetRegistry/records/*.json` 不可变登记事实，禁止并发改总表。集成代理取得总表独占锁后运行 `workflow.py asset merge-records --project-root <项目> --records Artifacts/AssetRegistry/records --register docs/asset-register.yaml`，按资源 ID、源哈希、路径和 GUID 查重，把 Importer、导入报告、批准证据写入总登记；冲突即停止，许可证保持 PENDING，必须另行审查批准。
10. **移交结构化装配与清理要求**：仅把 `ALL_ITEMS_VALIDATED` 与逐条“资源 ID -> Prefab/Scene 槽位”绑定交给 P5 单写集成代理。不得移交整张效果图、联系表、资产地图标注图、未验证资源或临时占位。正式结构化拼装完成后，P5 必须删除全部灰盒组件、占位 Mesh/Sprite/Material 和临时低保真 Prefab/Scene 对象，清理残留引用，并在保留已确认结构节点、稳定 ID、`prefab-structure`、预览和批准记录等审计证据的前提下取得清理验证 `PASS`；否则不得标记 `ASSEMBLY_VERIFIED` 或 `DONE`。

截图、效果图、概念图、联系表和资产地图标注图都不是运行时资源。每个正式图片条目必须依据已批准 Visual Bible 独立重新生成；P3 框选不是裁切许可。

## 子代理角色与并行边界

- P3 用户批准后，不同地图条目的重新生成、来源/授权核查和规格准备可并行；同一资源 ID 只有一个写入者。
- 视觉一致性、Unity 可实现性、UX/可读性三个审查代理独立输出；主代理合并修改清单。
- 单个条目的生成与审查不得由同一代理自批；导入和场景复验由串行 Unity 写入代理完成，QA 独立验证，任何代理不能代替 P3 用户批准。
- 3D 贴图候选可离线准备，但正式贴图等待模型 UV 边界冻结；同一 DCC 工程、贴图集、材质或目标 Prefab 采用单写者。

## 所需锁与 Unity 权限

- 生成与离线处理锁定各自输出路径；资源 ID 登记使用独占锁。
- Unity 导入前显式绑定实例并取得资源、`.meta`、图集和依赖 Prefab/场景锁。
- 涉及 DCC 源或外链纹理时先取得 DCC 工程与导出目录单写锁，完成原子导出并释放后再申请 Unity 导入锁；禁止读取或导入尚在写入的半成品。
- Visual Bible 或 P0-P3 未通过、条目未独立重新生成、逐项审查未通过或来源权属不明时，不得进入正式运行时目录；未达到 `ALL_ITEMS_VALIDATED` 时不得取得 P5 Prefab/Scene 装配锁。

## 机器可读输出

输出通过真实契约校验的 P0 `prefab-structure.yaml`、P3 `split-plan.yaml` 完整资产地图、逐项 `image-task.yaml`、独立候选与检查图、不可变 `registration-record.json`、合并后的 `asset-register.yaml`、Unity 导入设置快照、逐项运行验证报告、`ALL_ITEMS_VALIDATED` 聚合证据、槽位绑定清单和 P5 `prefab-assembly.yaml` 引用；每项包含 Visual Bible、P0-P3 上游版本、资源 ID、分类、唯一通道、状态、规格、路径、GUID/地址、审查、许可和 SHA-256。

## 通过条件

- P3 地图覆盖全部可见生产元素和排除项，每项只有一个分类、一个通道、一个目标槽位和一个当前有效产物。
- 每个图片项均依据 Visual Bible 独立生成，没有从截图、P1 效果图或标注图裁切成品像素。
- 画面、规格、导入、寻址、渲染、性能与可追溯性全部通过。
- 地图全部生产项为当前版本 `VALIDATED`，聚合证据为 `ALL_ITEMS_VALIDATED`，可安全移交 P5 结构化装配。
- 场景实测反馈已闭环；正式拼装后运行时占位资源、灰盒组件、临时低保真对象及残留引用全部清零，清理验证为 `PASS`。

## 失败与恢复出口

- 条目边界或遮挡规格不足时返回 P3 修订；透明或独立生成困难时请求分层源、遮罩、补绘或重新生成，不直接裁切效果图。
- Unity 实测发现枢轴、边缘、色彩、九宫格、帧序或预算问题时返回资源角色修复，再由玩法接入和 QA 复验。
- Visual Bible 变化使受影响图片从 `PLANNED` 重启；P3 地图变化使受影响条目与聚合证据失效；来源、内容、规格、地址、GUID、导入设置或槽位绑定变化时创建新修订，使该项回到相应状态，清除 `ALL_ITEMS_VALIDATED` 并使 P5 装配证据失效。
- 上游需要回退时从 `prefab-structure`、预览和批准记录等审计证据重建所需灰盒；不得在运行时资源目录、Prefab 或 Scene 中保留低保真回退副本。
- 发现任务实际改变 3D 拓扑、UV、材质槽、LOD、Collider 或模型 Prefab 时停止位图流水线，保留已验证图片证据并返回 3D 资产责任角色。
