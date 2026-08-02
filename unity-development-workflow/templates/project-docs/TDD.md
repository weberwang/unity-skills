# 技术设计文档

## 技术基线

- Unity：6
- 渲染：URP
- UI：UI Toolkit
- 自动化：CoplayDev/unity-mcp
- 目标平台：待 G0 用户确认（Windows / Android / iOS / iPadOS 可分别选择）
- 主开发平台：待 G0 用户确认

## 模块与程序集边界

记录 Foundation、Shared、Gameplay、Presentation、Content、QA、Delivery 的职责、asmdef、所有者、公共接口和依赖。

## 生命周期与数据

记录启动、场景加载、输入、时间/随机、配置、存档版本、暂停恢复、窗口/方向变化、安全区、前后台、错误处理与外部服务边界。

## 实现增量

| 增量 | 玩家行为与验收 | 代码入口 | 资源依赖 | 测试入口 | 状态 |
| --- | --- | --- | --- | --- | --- |

## 构建与验证

按批准平台分别记录 Unity/MCP/包版本、Build Profile、脚本后端、场景列表、可复现命令、签名工具链和证据位置。

## 风险与待决策

只链接当前有效的控制面决策。
