# 质量门禁

## 何时读取

S00、每个场景冻结、全局回归和 Windows 交付前读取。

## 输入

- 质量门禁配置、测试清单、性能预算和视觉批准记录。
- 当前项目、场景、构建制品与 Console 基线。
- 实际命令、原始日志、截图、Profiler 数据和构建结果。

## 执行步骤

1. 先按严格执行策略和版本化通道决策判定是否进入生命周期门：G0 范围、用户确认的模块/场景拆分与全局视觉；G1 S00 与端到端垂直切片；G2 全场景、正式资源和全局回归；G3 候选包、合规和用户放行。质量预算、验收阈值、风险豁免和发布授权必须先由 `$unity-game-grilling` 绑定当前目标或候选后再请求用户决定。进入任一门后必须执行其完整标准 `requiredChecks`，不得删减、增补、错配或标记为不适用。
2. 依次验证 Schema、静态检查、脚本校验、编译和 Console 增量。
3. 激活 `testing` 后分别以 `run_tests` 启动 EditMode/PlayMode 异步任务，并通过测试任务查询取得最终结果、用例数和失败详情。
4. 对目标场景运行启动、输入设备、主路径、暂停恢复、窗口/分辨率变化、重开与退出冒烟。
5. 对比已批准效果图与实机捕获，检查视觉偏差、UI 可读性、焦点导航、缩放和本地化溢出。
6. 先读取 `mcpforunity://rendering/stats` 获取渲染快照；激活 `profiling` 后用 `manage_profiler` 或明确记录的等价方法采集帧时间、CPU/GPU、内存、GC、Draw Call、纹理和加载数据。
7. 使用 `manage_build` 执行 Windows 构建，并对候选包进行干净启动与长时间运行检查。
8. 核对正式资源唯一登记、授权、导入验证、占位清零和当前版本一致性。
9. 每项只报告实际运行结果；环境或工具缺失时标记 `BLOCKED`，未运行标记 `NOT_RUN`，不得标记通过。任一必需项为 `FAIL`、`BLOCKED`、`NOT_RUN`、未知、证据缺失或版本不符时，质量门整体失败并阻塞下游。
10. 填充每个 requiredCheck 的实际结果与证据后，运行 `workflow.py gate evaluate --config <quality-gates> --gate <G0-G3> --project-root <项目> --project-id <ID> --source-revision <修订> --build-version <版本> --output <结果>`。质量门根部的 `activeDecomposition` 是当前唯一拆分指针；G0 的 `decomposition.approved` 必须直接包含状态为 `APPROVED` 的同一拆分契约；G1 的 `vertical-slice.playable` 必须同时且唯一引用 `DONE` 场景清单、`PASS` 的 `VERTICAL_SLICE` 场景报告与 Windows EXE，场景报告中的 `tests.id` 必须为 `vertical-slice.playable` 且唯一回指同一 EXE；它还必须与 `visual.runtime-approved`、`build.windows-development` 绑定同一批准 `sceneId`、`buildVersion`、`sourceRevision`、`projectStateVersion` 与制品 SHA-256；G2 的场景清单必须绑定相同拆分 ID、版本、`sourceRevision` 与 `projectStateVersion`。求值器校验文件存在性、Schema、状态、身份、版本与 SHA-256，并原子输出；任一必需门禁失败时停止状态推进并修复，不得以豁免、口头确认或代理判断跳过。

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

`performance.pass` 必须使用 `templates/quality-report-performance.yaml`，额外绑定当前 `APPROVED project-profile` 的项目、版本、源码修订、项目状态版本和 SHA-256。报告必须无重复、无遗漏地提供 Profile `quality` 中九个指标；`minimumFps` 使用 `>=`，其余 `maximum*` 使用 `<=`，单位固定。每项必须引用符合 `schemas/performance-measurement-evidence.schema.json` 的独立固定测量契约；该契约按 `templates/performance-measurement-evidence.yaml` 绑定项目、源码修订、项目状态、构建版本、指标、单位和数值，并进一步引用符合 `schemas/performance-raw-artifact.schema.json` 的原始样本契约。原始样本契约按 `templates/performance-raw-artifact.yaml` 固定绑定相同身份、指标、单位、采集器、结构化采集元数据和非空有限 `samples`；前七项只能来自 Unity Profiler，构建大小只能来自 Unity Build Report，加载耗时只能来自运行时计时器。Gate 会逐级回读并验证哈希，检查 `sampleCount`，以 FPS 最小值或其余指标最大值原精度实算结果，再核对测量契约、报告和 Profile 预算；报告中的 `PASS`、消息、汇总结论、报告自填值或测量契约自填值均不能替代机器比较。空样本、NaN、Infinity、未知或重复指标、错误单位、采集器错配、身份错配、值与原始样本不一致、旧 Profile、旧构建或超预算均直接失败。

## 通过条件

- 对应 G0 至 G3 的收敛条件已满足，所有必需检查状态为实际 `PASS`，无未解释的新增 Console 错误。
- 视觉、性能和 Windows 构建证据关联到当前版本。
- 报告明确区分 `PASS`、`FAIL`、`BLOCKED` 与 `NOT_RUN`。
- 每个用户批准和代理审查都绑定当前对象 ID、版本、SHA-256、`sourceRevision`、上游证据与结论范围；代理审查、口头确认和旧批准均未代替当前用户门禁。

## 失败与恢复出口

- `FAIL` 返回责任模块修复，并重跑受影响门禁及其下游门禁。
- `BLOCKED` 记录缺失环境、工具或权限，补齐后从该门禁继续。
- 证据版本不匹配时作废该结果并重新执行，不得复用旧通过记录。
- 任一上游对象变化时递归作废受影响质量门及其下游结果，从最早受影响检查重跑。
