# 视觉资源生成、拆分与 Unity 接入

## 何时读取

生成游戏/UI 效果图、把效果图拆成运行时资源、制作透明素材，或导入 Sprite、纹理、模型、字体、动画与 VFX 时读取。

## 输入

- 已批准 Visual Bible、场景/UI 视觉稿、资源依赖清单和目标 Windows 显示规格；没有当前 Visual Bible 的用户批准与哈希证据时必须阻塞。
- 来源文件、来源版本或内容哈希、授权/生成记录、目标路径与 Unity 导入约定。
- 当前资源登记、性能预算、SpriteAtlas/Addressables 规划和实机反馈。

## 执行步骤

1. **登记与查重**：优先以“来源内容哈希 + 元素编号”生成稳定资源 ID；无法计算哈希时使用规范化来源路径、明确版本与元素编号。已存在、可寻址、风格基线仍有效且最近 Unity 验证通过的产物才可复用。
2. **声明参考边界**：逐张登记截图参考及其哈希，只允许 `CONTENT`、`COMPOSITION`、`INFORMATION_HIERARCHY`。色彩、材质、光照、字体、图标、笔触和成品像素必须来自已批准 Visual Bible；禁止截图裁切、描摹或风格复刻。
3. **重新生成生产源图**：把已批准场景效果图当作内容说明，以 Visual Bible 为唯一风格权威，生成边界完整、层次清晰、适合拆分的生产源图。生产源图与任一截图哈希相同、没有全局视觉证据或只做截图裁切时立即阻塞；记录所选 `image-generation` 候选的 ID、路径、SHA-256 和视觉版本。
4. **拆分前审查**：从 `templates/split-plan.yaml` 创建拆分契约，绑定 Visual Bible、重新生成契约及其候选和带编号标注图；`sourceImage` 的路径、SHA-256 和版本必须与 `regenerationEvidence` 指向的同一候选完全一致。逐项拷问稳定 ID、用途、是否必须独立、复用可能、边界、遮挡补绘、像素尺寸、透明、枢轴/锚点、PPU、九宫格、动画帧、交付形式和性能代价。视觉一致性、Unity 可实现性、UX/可读性三份独立审查未齐不得把计划标为 `APPROVED`，不得开始拆分。
5. **执行拆分或重绘**：按批准计划沿真实轮廓移除非预期背景与相邻元素，补全运行时可见区域；对无法无损拆出的元素单独依据 Visual Bible 重绘或重新生成，不得用矩形裁切伪装完成。动画帧保持画布、基线、朝向与枢轴一致。默认输出透明 PNG，完整不透明背景才使用合适的不透明格式。
6. **逐项审查**：每个拆分项建立独立 `image-task`，其 `splitPlanEvidence` 必须记录拆分条目 ID、元素编号、最终路径、SHA-256 和视觉版本，并与 `resourceId`、`selectedCandidate` 完全一致。在棋盘格、深色和浅色背景检查风格一致、白边、黑边、透明杂点、截断、空白、接缝和发光边距，并核对 Visual Bible、`image-generation` 重新生成契约和拆分方案引用；旧修订标记“已取代”，不静默覆盖。
7. **Unity 导入**：只有逐项审查为 `APPROVED` 才能显式设置纹理类型、sRGB、Alpha、Max Size、压缩、Filter、Wrap、MipMap、Read/Write、PPU、Pivot、Border 与 Sprite Mesh；按用途建立 SpriteAtlas、Addressables 或直接引用，避免重复纹理和隐式 Resources 膨胀。
8. **场景验证**：在目标分辨率、缩放、摄像机、URP、UI Toolkit 与实际材质下验证寻址、色彩、采样、九宫格、动画、透明排序和内存；记录 Profiler/Frame Debugger 或等价证据。
9. **更新登记**：`uwt_import_image` 成功后只新增 `Artifacts/AssetRegistry/records/*.json` 不可变登记事实，禁止并发改总表。集成代理取得总表独占锁后运行 `workflow.py asset merge-records --project-root <项目> --records Artifacts/AssetRegistry/records --register docs/asset-register.yaml`，按资源 ID、源哈希、路径和 GUID 查重，把 Importer、导入报告、批准证据写入总登记；冲突即停止，许可证保持 PENDING，必须另行审查批准。

截图、效果图、概念图和联系表都不是运行时资源。生产源图必须重新生成并绑定批准的 Visual Bible。简单纯色背景才可使用透明色键；毛发、烟雾、半透明或复杂背景必须使用分层源、遮罩或重新生成，不得伪造可交付透明结果。

## 子代理角色与并行边界

- 重新生成候选、来源/授权核查和拆分方案草拟可并行；拆分必须等待方案三类审查通过，同一资源 ID 只有一个写入者。
- 视觉一致性、Unity 可实现性、UX/可读性三个审查代理独立输出；主代理合并修改清单。
- 导入和场景复验由串行 Unity 写入代理完成，QA 独立验证；任何代理不能代替用户视觉批准。

## 所需锁与 Unity 权限

- 生成与离线处理锁定各自输出路径；资源 ID 登记使用独占锁。
- Unity 导入前显式绑定实例并取得资源、`.meta`、图集和依赖 Prefab/场景锁。
- Visual Bible 未批准、生产源图未经重新生成、拆分方案未通过、逐项审查未通过或来源权属不明时，不得进入正式运行时目录。

## 机器可读输出

输出通过 Schema 的 `image-generation.yaml`、`split-plan.yaml`、逐项 `image-task.yaml`、带编号拆分预览、不可变 `registration-record.json`、合并后的 `asset-register.yaml`、逐项检查图、Unity 导入设置快照和运行验证报告；每项包含 Visual Bible 版本、参考用途、重新生成证据、拆分方案、资源 ID、来源版本、状态、规格、路径、GUID/地址、审查、许可和带 SHA-256 的证据。

## 通过条件

- 每个资源 ID 只有一个当前有效产物，重复文件、地址和被取代版本未进入运行时。
- 画面、规格、导入、寻址、渲染、性能与可追溯性全部通过。
- 场景实测反馈已闭环；G2 前占位资源清零或获得用户明确豁免。

## 失败与恢复出口

- 可拆性不足时请求分层源、遮罩、补绘或重新生成，不直接矩形裁切。
- Unity 实测发现枢轴、边缘、色彩、九宫格、帧序或预算问题时返回资源角色修复，再由玩法接入和 QA 复验。
- 来源、规格、地址或导入设置变化时创建新修订并重跑受影响验证。
