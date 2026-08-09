# 模块与场景拆分

## 何时读取

项目发现和全局视觉方向形成后、S00 前读取；新增或合并模块、场景、共享能力，或既有边界失效时重新读取。任何目录、程序集定义、场景文件或公共接口的正式拆分写入，都必须先完成本流程。

## 输入

- 已批准范围、核心循环、玩家旅程、全局 Visual Bible 与首发约束。
- 现有代码、程序集、场景、资源、存档、测试、性能和构建边界。
- 各候选场景实际消费的能力、入口、出口、失败恢复和路径所有权。
- 项目当前 `sourceRevision`、`projectStateVersion` 与活动拆分 ID/版本。

## 拆分前拷问

逐项向用户展示事实、假设、建议和代价，记录明确回答；不得代替用户回答，不得把沉默视为同意：

1. `CORE_LOOP`：拆开后是否破坏一次完整的输入、反馈和结算闭环？
2. `PLAYER_JOURNEY`：玩家是否感知到值得独立加载、导航或验收的阶段切换？
3. `SCENE_LIFECYCLE`：进入、退出、重开、卸载与失败恢复能否独立定义？
4. `PERSISTENCE_BOUNDARY`：哪些状态跨场景保存，谁负责版本和异常恢复？
5. `SHARED_CAPABILITY`：候选共享能力是否至少被两个已确认场景消费？
6. `OWNERSHIP`：每条代码、资源、场景和文档路径是否只有一个所有者？
7. `DEPENDENCY_DIRECTION`：依赖是否单向、无环，运行时代码是否隔离 Editor 实现？
8. `ASSET_BOUNDARY`：视觉、音频、配置与地址资源应归场景还是公共能力？
9. `UI_BOUNDARY`：UI 属于场景内容、持久覆盖层还是跨场景导航？
10. `PERFORMANCE_BUDGET`：拆分是否改善加载、内存和渲染预算，还是只增加切换成本？
11. `TEST_BOUNDARY`：是否有独立测试入口、可观察结果和失败注入点？
12. `DELIVERY_IMPACT`：是否改变 Build Profile、场景列表、许可、隐私或发行范围？
13. `MERGE_RECOVERY`：边界被否决或验证失败时，如何合并回父级并恢复可构建状态？

任一问题无事实答案时标记 `BLOCKED` 或 `DEFER`，停留在拆分规划；不要先创建空模块再补理由。

## 执行步骤

1. 先形成待裁决 `decomposition-plan` 候选；其中 `interrogation` 固定保存 13 项边界事实、回答和结论，模块、场景、共享能力、拒绝项共同构成完整候选内容。按规范 JSON 计算 `candidateDigest`，写入独立 `grilling-subject-snapshot`，主体必须是当前拆分 `id/version` 且 `subjectType=MODULE_BOUNDARY`。
2. 调用 `$unity-game-grilling`，创建当前模块/场景边界的 `grilling-record`。其 `subject` 必须逐字段绑定上述快照的类型、路径和 SHA-256；记录问题的影响、选项、推荐、理由和用户回答。`GRILLING_DECISION` 用户批准表示“已审阅这份冻结候选并完成拷问”，不能代替最终拆分裁决。
3. 为每个候选模块记录单一职责、责任角色、唯一拥有路径、公共接口、依赖和消费场景；归入 Foundation、Shared、Gameplay、Presentation、Content、QA 或 Delivery。
4. 为每个候选场景记录玩家目的、生命周期、进入/退出条件、拥有路径、场景依赖、模块依赖和拆分理由。
5. 生成模块和场景 DAG，拒绝未知依赖、依赖环、路径父子重叠、未声明跨模块访问及运行时引用 Editor 实现。
6. 对每个共享能力列出实际消费场景；少于两个场景时保持局部，禁止为了“以后可能复用”上移。
7. 将不成立的候选写入 `rejectedCandidates`，指定保留边界、合并回父级、返回拷问或请求裁决的恢复动作。
8. 向用户展示最终模块表、场景表、依赖图、共享能力表、拒绝项、性能/交付影响与恢复方案，请求逐项确认。此处 `DECOMPOSITION` 用户批准是第二道独立批准，必须绑定当前拆分 `id/version`；它负责批准最终 `SPLIT` 集合，不能由 `GRILLING_DECISION` 复用或替代。
9. 一旦提出新拆分版本，先递增 `projectStateVersion`，把项目配置和质量门的活动拆分指针切到新 ID/版本并标记 `AWAITING_USER`；此时旧模块、场景和 S00 引用立即失效，不得继续消费旧批准。
10. 仅在两道用户批准、快照、拷问记录均绑定当前拆分 ID、版本、`sourceRevision` 和 `projectStateVersion`，且 `status=APPROVED`、批准集合与 `SPLIT` 候选完全一致后，生成最终 `module-manifest` 和 `scene-manifest`。
11. 将已批准 `decomposition-plan` 的路径、SHA-256、主体 ID、主体版本、源码修订和项目状态版本写入模块、场景与 S00 报告；任何候选内容改变都创建新版本、新快照和新拷问记录，使旧批准及下游引用失效。

## 子代理角色与并行边界

- 架构、玩法、视觉资源、UI、QA 和发布代理可并行调查候选边界，但只能提交事实与建议。
- 一个架构审查代理串行合并 DAG 和路径所有权冲突；主代理向用户请求最终确认。
- 用户确认前所有代理保持只读，不得创建模块目录、程序集定义、场景、Prefab 或公共接口。

## 所需锁与 Unity 权限

- 拷问、依赖分析和候选边界整理只使用只读权限，不绑定 Unity 写实例，也不申请场景或资源写锁。
- 写入 `decomposition-plan`、模块清单和场景清单时持有对应制品路径的文件锁，避免并行代理覆盖用户决定。
- 仅当拆分状态为 `APPROVED` 且批准记录绑定当前 ID、版本和证据哈希后，后续 S00 才能显式绑定 Unity 实例并申请批准范围内的写锁。
- `REJECTED`、`BLOCKED`、`AWAITING_USER` 或版本失配时不得取得 Unity 写权限；恢复流程仍保持只读，直到新版本重新获批。

## 机器可读输出

- `decomposition-plan.yaml`：13 项 `interrogation`、候选模块/场景、共享能力、拒绝项、最终 `DECOMPOSITION` 用户决定与恢复出口。
- `grilling-subject-snapshot.yaml`：批准前完整候选的不可变身份与 `candidateDigest`；摘要覆盖 13 项拷问及所有候选边界，明确排除之后才产生的批准、状态和恢复控制字段。
- `grilling-record.yaml`：以 `MODULE_BOUNDARY` 主体绑定上述快照，保存拷问过程、决定、未决项与 `GRILLING_DECISION` 用户批准，是最终拆分批准的强制前置。
- `module-manifest.yaml`：已确认的职责、所有者、路径、接口、依赖和消费场景。
- 每场景一份 `scene-manifest.yaml`：已确认的生命周期、模块依赖、共享能力、资产所有权与验收证据。
- `project-profile.yaml` 与 `quality-gates.yaml`：分别保存当前拆分状态和 `activeDecomposition` 标准指针；两者携带相同 `sourceRevision` 与 `projectStateVersion`。
- 可选 `module-dag.json` 与 `scene-dag.json`：供并行调度和冲突检测消费。

由 Codex 核对拆分契约的必填字段、当前用户确认、对象 ID、版本、SHA-256 和 `sourceRevision`；涉及 Unity 事实时使用 MCP/C# Toolkit 回读。G0 的 `decomposition.approved` 必须引用状态为 `APPROVED` 的真实拆分契约；S00 报告、模块清单和场景清单继续引用同一决策版本。

## 通过条件

- `grilling-subject-snapshot` 的 `candidateDigest` 与当前完整候选重算一致，且 `grilling-record.subject` 以 `MODULE_BOUNDARY`、当前拆分 ID/版本和同一文件哈希绑定该快照。
- 13 项 `interrogation` ID 完整唯一、答案非空且无 `BLOCKED` 结论；`GRILLING_DECISION` 批准冻结候选的拷问结论，随后独立的 `DECOMPOSITION` 批准当前拆分集合，两者均不可跨版本复用。
- 模块与场景 ID 唯一、依赖无环；模块之间、场景之间以及模块与场景之间的路径所有权均不重叠；公共接口最小。
- 每个共享上移至少有两个已确认场景消费者；场景进入、退出和恢复边界可验证。
- 拒绝项、合并方案和恢复到可构建状态的出口明确。
- 未批准状态无法通过 G0，也不能进入 S00、G1 或 G2。

## 失败与恢复出口

- 用户拒绝拆分：标记 `REJECTED`，保留当前边界或按记录合并回父级；不得继续 S00。
- 事实不足或所有权冲突：标记 `BLOCKED`，返回 `WAIT_FOR_USER`，补证据后重新拷问。
- 全局视觉改变场景构图或 UI 生命周期：返回 `RETURN_TO_GLOBAL_VISUAL`，更新 Visual Bible 后重做受影响边界。
- 玩家旅程或核心循环改变：返回 `RETURN_TO_DISCOVERY`，作废受影响拆分和下游批准。
- S00/G1/G2 发现边界错误：停止相关写入，恢复可构建版本，创建新拆分版本并重新取得用户确认。
- 新版本处于 `AWAITING_USER` 时：保持活动指针指向新版本，禁止回退复用旧批准；只能批准、拒绝或继续修订当前版本。
