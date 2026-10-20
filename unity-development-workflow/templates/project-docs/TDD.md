# 技术设计文档

## 技术基线

- Unity：6
- 渲染：URP
- UI：UI Toolkit
- 自动化：[@Unity](plugin://unity@openai-curated-remote) / Unity CLI / com.unity.pipeline
- 目标平台：待 G0 用户确认（Windows / Android / iOS / iPadOS 可分别选择）
- 主开发平台：待 G0 用户确认

## 项目结构合同

按 unity-development-workflow 的 references/project-structure.md 与 references/artifact-storage.md 固定本项目目录；项目文档唯一根目录为小写 `docs/`。默认使用 Assets/Scripts 按职责与模块组织代码，Assets/Scenes、Prefabs、UI、Art、Audio、Settings 按类型管理资源。特殊布局必须提供唯一映射，模板、模块 manifest 和 Implementation Package 同步使用实际路径。

| 范围 | 实际目录 | 所有者 | 用途与允许依赖 |
| --- | --- | --- | --- |
| Runtime 代码 | Assets/Scripts | 待记录 | Foundation、Shared、Gameplay、Presentation 单向依赖 |
| SDK 初始化入口 | Assets/Scripts/Foundation/InitializeSdks.cs | 待记录 | 采用 SDK 时使用唯一入口；异路径须在此记录且不得复制第二入口 |
| Editor 工具 | Assets/Editor | 待记录 | 仅 Editor 平台，可引用 Runtime |
| 测试 | Assets/Tests/EditMode、Assets/Tests/PlayMode | 待记录 | 独立测试程序集，不进入正常 Player 构建 |
| 正式视觉资源 | Assets/Art/Runtime | 待记录 | 已登记的正式资源与 Prefab 消费者 |
| 生成产物 | Assets/Generated | 待记录 | 记录生成器、输入与重建命令 |
| 项目文档 | docs | 待记录 | GDD、TDD、清单与唯一权威正文；不另建大小写不同的 Docs |
| 制作源文件 | ArtSource | 待记录 | 用户输入、可编辑工程与必要的再生产源文件 |
| 临时与未送审候选 | Artifacts/intermediate、Artifacts/candidates | Work Item | 按阶段/候选隔离；默认不作为正式资源或交付输入 |
| 人工审阅与验证 | Artifacts/reviews、Artifacts/validation | Work Item | 人工查看的页面、截图、录屏、日志和报告 |
| 已确认非运行成果 | docs/confirmed | 待记录 | 已确认的图稿、目标图、拆解与布局成果，不供运行时加载 |
| 机器证据 | `.workflow-control/` 当前工具指定的实际 `evidenceRoot` | Work Item | 受限 `files`、`outputFile` 等只使用该根内路径 |

补充第三方依赖、制作源文件、特殊目录和版本控制策略；只创建实际使用的目录。

## SDK 初始化与后台生命周期

仅在项目实际采用 SDK 时，在 `Assets/Scripts/Foundation/InitializeSdks.cs` 实现唯一初始化入口；若项目选择其他代码路径，必须在本表固定唯一映射，不创建重复入口。按[统一初始化合同](../../references/sdk-initialization.md)让各 SDK 独立投递，不等待整批完成后才进入首帧或首个场景；逐项登记 SDK、平台、官方前置、真实完成信号、幂等/迟到回调处理、初始化失败分类和重试责任人。广告加载、支付交易等就绪后的业务重试由所属业务服务持有。

记录后台暂停原因、可恢复播放位置、暂停/恢复及销毁/停止边界；后台新播放请求不补播。真实系统生命周期行为与目标平台证据在各自实施包中登记。

## 模块与程序集边界

记录 Foundation、Shared、Gameplay、Presentation、Content、QA、Delivery 的职责、asmdef、所有者、公共接口和依赖。

## 生命周期与数据

记录启动、场景加载、输入、时间/随机、配置、存档版本、暂停恢复、窗口/方向变化、安全区、前后台、错误处理与外部服务边界。

## 实现增量

| 增量 | 玩家行为与验收 | 代码入口 | 资源依赖 | 测试入口 | 状态 |
| --- | --- | --- | --- | --- | --- |

## 构建与验证

按批准平台分别记录 Unity Editor、Unity CLI、`com.unity.pipeline` 与 Toolkit 版本、Build Profile、脚本后端、场景列表、可复现命令、签名工具链和证据位置。

## 风险与待决策

只链接当前有效的控制面决策。
