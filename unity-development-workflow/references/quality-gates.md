# 质量门禁

## 何时读取

S00、每个场景冻结、逐模块/逐平台验收、全局回归和任一目标平台交付前读取。

## 输入

- 质量门禁配置、测试清单、性能预算和视觉批准记录。
- 当前项目、场景、构建制品与 Console 基线。
- 实际命令、原始日志、截图、Profiler 数据和构建结果。

## 执行步骤

1. 先按严格执行策略和版本化通道决策判定是否进入生命周期门：G0 范围、用户确认的模块/场景拆分与全局视觉；G1 S00 与端到端垂直切片；G2 全部模块/场景、正式资源和全局回归；G3 候选包、最终设备验收、合规和用户放行。质量预算、验收阈值、风险豁免和发布授权必须先由 `$unity-game-grilling` 绑定当前目标或候选后再请求用户决定。进入任一门后必须执行其完整标准 `requiredChecks`，不得删减、增补、错配或标记为不适用。
2. 依次验证 Schema、静态检查、脚本校验、编译和 Console 增量。
3. 激活 `testing` 后分别以 `run_tests` 启动 EditMode/PlayMode 异步任务，并通过测试任务查询取得最终结果、用例数和失败详情。
4. G2 分别对每个批准模块运行职责边界、接口、主路径、失败路径与回归验收，并为每个模块生成唯一 `PASS` 报告。场景小循环内的输入、窗口和分辨率检查只用于参考环境调试，不得形成最终设备验收结论。
5. 对比已批准效果图与实机捕获，检查视觉偏差、UI 可读性、焦点导航、缩放和本地化溢出。
6. 先读取 `mcpforunity://rendering/stats` 获取渲染快照；激活 `profiling` 后用 `manage_profiler` 或明确记录的等价方法采集帧时间、CPU/GPU、内存、GC、Draw Call、纹理和加载数据。
7. G2 必须为 `project-profile.delivery.targets` 中每个平台提供唯一 `platforms.adaptation-complete` PASS 报告。仅在 G2 全部 requiredChecks 通过后，才使用 `manage_build` 或平台规定工具链为每个批准平台生成一个 G3 候选主制品；再按各平台批准设备档位与全部批准场景的笛卡尔积执行启动、核心循环、输入、窗口/方向与安全区、2D 适配、音频和稳定性检查。每个用例必须绑定所属平台候选制品及 SHA-256。
8. 核对正式资源唯一登记、授权、导入验证、占位清零和当前版本一致性。
9. 每项只报告实际运行结果；环境或工具缺失时标记 `BLOCKED`，未运行标记 `NOT_RUN`，不得标记通过。任一必需项为 `FAIL`、`BLOCKED`、`NOT_RUN`、未知、证据缺失或版本不符时，质量门整体失败并阻塞下游。
10. 填充每个 requiredCheck 的实际结果与证据后，运行 `workflow.py gate evaluate --config <quality-gates> --gate <G0-G3> --project-root <项目> --project-id <ID> --source-revision <修订> --build-version <版本> --output <结果>`。质量门根部的 `activeProjectProfile` 与 `activeDecomposition` 分别是当前唯一平台配置和拆分指针。G0 的 `platforms.approved` 必须深验状态为 `APPROVED` 的平台集合，`decomposition.approved` 必须直接包含状态为 `APPROVED` 的同一拆分契约。G1 的 `vertical-slice.playable` 必须同时且唯一引用 `DONE` 场景清单、`PASS` 的 `VERTICAL_SLICE` 场景报告与主开发平台制品；它还必须与 `visual.runtime-approved`、`build.platform-development` 绑定同一批准 `sceneId`、平台、`buildVersion`、`sourceRevision`、`projectStateVersion` 与制品 SHA-256。G2 的 `scope.complete` 必须精确覆盖当前拆分全部场景，`modules.acceptance-complete` 必须精确覆盖批准模块，`platforms.adaptation-complete` 必须精确覆盖批准平台。G3 只有在 G2 已通过时才可求值；`candidate.verified` 与 `user.release-approved` 必须各自精确覆盖全部批准平台的 delivery manifest，`devices.acceptance-verified` 必须唯一引用完整“平台设备档位 × 批准场景”矩阵并逐用例绑定所属平台制品，`scenes.2d-adaptation-verified` 必须精确覆盖全部批准场景且将 2D 契约深验为 `VERIFIED`。求值器校验文件存在性、Schema、状态、身份、版本与 SHA-256，并原子输出；任一必需门禁失败时停止状态推进并修复。

## 子代理角色与并行边界

- Schema、静态和报告分析可并行；Unity 编译、PlayMode、场景冒烟与构建串行。
- QA 代理独立于开发代理；视觉审查代理独立判断偏差。
- 结果汇总代理不得改写原始日志或把未运行项目推断为通过。

## 所需锁与 Unity 权限

- 文件级检查只需只读权限。
- Unity 测试、场景冒烟与构建前显式绑定 `unity-mcp` 实例，并占用 Editor/场景或构建锁。
- 性能采集期间禁止其他写代理改变项目状态。

## 机器可读输出

按 `templates/quality-report.yaml` 与对应 Schema 输出质量报告，绑定 `projectId`、`sourceRevision`、`buildVersion`；每项包含 `id`、`category`、`status`、命令、环境、起止时间、证据和失败原因。报告或检查声明 PASS 时必须至少包含一份真实文件及 SHA-256。

G2 的模块验收按 `templates/quality-report-module-acceptance.yaml` 输出：每份报告必须包含唯一 `moduleId` 和同名 `modules.acceptance-complete` 的 `PASS` 检查；报告集合必须与当前拆分的 `approvedModuleIds` 精确相等。平台适配按 `templates/quality-report-platform-adaptation.yaml` 输出：每个平台必须有唯一 `platformId` 和同名 PASS 检查，集合与 `delivery.targets` 精确相等。`performance.pass` 同样必须为每个批准平台提供唯一质量报告，逐平台使用自己的预算和样本。G3 最终设备验收按 `templates/quality-report-device-acceptance.yaml` 输出：唯一报告声明全部 `acceptedPlatformIds`、`acceptedModuleIds`、`acceptedSceneIds`、各平台候选主制品、非重复设备档位和矩阵用例，并完整覆盖每个设备档位与场景组合；每个用例均为 `PASS` 且 `artifactSha256` 必须等于该设备所属平台制品哈希。模块或平台报告未齐全、G2 未通过、矩阵缺项或混用制品时，设备验收不得开始或通过。

`performance.pass` 必须使用 `templates/quality-report-performance.yaml`，声明唯一 `platformId`，并绑定当前 `APPROVED project-profile` 的项目、版本、源码修订、项目状态版本和 SHA-256。报告必须无重复、无遗漏地提供该平台 `delivery.targets[].quality` 中九个指标；`minimumFps` 使用 `>=`，其余 `maximum*` 使用 `<=`，单位固定。每项必须引用符合 `schemas/performance-measurement-evidence.schema.json` 的独立固定测量契约；该契约按 `templates/performance-measurement-evidence.yaml` 绑定项目、源码修订、项目状态、构建版本、指标、单位、数值和同一平台，并进一步引用符合 `schemas/performance-raw-artifact.schema.json` 的原始样本契约。原始样本契约固定绑定相同身份、平台、指标、单位、采集器、结构化采集元数据和非空有限 `samples`；前七项只能来自 Unity Profiler，构建大小只能来自 Unity Build Report，加载耗时只能来自运行时计时器。Gate 逐级回读并验证哈希、平台和 `sampleCount`，以 FPS 最小值或其余指标最大值原精度实算结果，再核对测量契约、报告和该平台预算；其他平台预算或样本不得替代。

## 通过条件

- 对应 G0 至 G3 的收敛条件已满足，所有必需检查状态为实际 `PASS`，无未解释的新增 Console 错误；G2 全部模块验收先于 G3 最终设备验收。
- 视觉、性能和全部批准平台构建证据关联到当前版本。
- 报告明确区分 `PASS`、`FAIL`、`BLOCKED` 与 `NOT_RUN`。
- 每个用户批准和代理审查都绑定当前对象 ID、版本、SHA-256、`sourceRevision`、上游证据与结论范围；代理审查、口头确认和旧批准均未代替当前用户门禁。

## 失败与恢复出口

- `FAIL` 返回责任模块修复，并重跑受影响门禁及其下游门禁。
- `BLOCKED` 记录缺失环境、工具或权限，补齐后从该门禁继续。
- 证据版本不匹配时作废该结果并重新执行，不得复用旧通过记录。
- 任一上游对象变化时递归作废受影响质量门及其下游结果，从最早受影响检查重跑。
