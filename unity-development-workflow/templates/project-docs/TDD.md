# 技术设计文档

## 技术基线

- Unity：6
- 渲染：URP
- UI：UI Toolkit
- 自动化：CoplayDev/unity-mcp
- 交付：Windows

## 模块与程序集边界

记录 Foundation、Shared、Gameplay、Presentation、Content、QA、Delivery 的职责、asmdef、所有者、公共接口和依赖。

## 生命周期与数据

记录启动、场景加载、输入、时间/随机、配置、存档版本、暂停恢复、窗口变化、错误处理与外部服务边界。

## 实现增量

| 增量 | 玩家行为与验收 | 代码入口 | 资源依赖 | 测试入口 | 状态 |
| --- | --- | --- | --- | --- | --- |

## 构建与验证

记录 Unity/MCP/包版本、Build Profile、脚本后端、场景列表、可复现命令和证据位置。

## 风险与待决策

只链接当前有效的控制面决策。
