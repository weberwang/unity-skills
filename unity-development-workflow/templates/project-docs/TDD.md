# 技术设计文档

## 技术基线

- Unity：6
- 渲染：URP
- UI：UI Toolkit
- 自动化：[@Unity](plugin://unity@openai-curated-remote) / Unity CLI / com.unity.pipeline
- 目标平台：待 G0 用户确认（Windows / Android / iOS / iPadOS 可分别选择）
- 主开发平台：待 G0 用户确认

## 项目结构合同

按 unity-development-workflow 的 references/project-structure.md 固定本项目目录；默认使用 Assets/Scripts 按职责与模块组织代码，Assets/Scenes、Prefabs、UI、Art、Audio、Settings 按类型管理资源。特殊布局必须提供唯一映射，模板、模块 manifest 和 Implementation Package 同步使用实际路径。

| 范围 | 实际目录 | 所有者 | 用途与允许依赖 |
| --- | --- | --- | --- |
| Runtime 代码 | Assets/Scripts | 待记录 | Foundation、Shared、Gameplay、Presentation 单向依赖 |
| Editor 工具 | Assets/Editor | 待记录 | 仅 Editor 平台，可引用 Runtime |
| 测试 | Assets/Tests/EditMode、Assets/Tests/PlayMode | 待记录 | 独立测试程序集，不进入正常 Player 构建 |
| 正式视觉资源 | Assets/Art/Runtime | 待记录 | 已登记的正式资源与 Prefab 消费者 |
| 生成产物 | Assets/Generated | 待记录 | 记录生成器、输入与重建命令 |

补充第三方依赖、制作源文件、特殊目录和版本控制策略；只创建实际使用的目录。

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
