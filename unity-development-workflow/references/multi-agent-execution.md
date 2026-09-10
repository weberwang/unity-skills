# 多代理执行

控制面拥有全局状态，主代理拥有拆分、任务包、集成和最终验证；子代理只在明确 Work Item、实施包和文件/Unity 对象所有权内工作。

## 可并行范围

- 只读代码探索、Unity/API 研究、候选方案、测试设计和互不重叠的资源生产。
- 状态与路径互斥的 MODULE、SCENE 或 DISPLAY_LAYER 单元；正式 Editor 写入仍由主代理排队成单写者步骤。

## 必须串行

- SHARED、INTEGRATION、RELEASE。
- `ProjectSettings/`、`Packages/`、Build Settings、Addressables 全局配置、共享 asmdef、同一 Scene/Prefab/ScriptableObject、同一资源及其 `.meta`。
- Unity 实例切换、域重载期间的写入、全局状态迁移和证据汇总。

任务包至少包含目标、允许修改、具体改动、禁止事项、验收标准、测试等级与命令、受保护操作授权状态和并行改动提醒。子代理发现架构/API/数据结构变化、依赖新增、安全决策或所有权外修改时停止扩展并报告。

实现者与 reviewer 分离；reviewer 只给发现，不代替用户决定或 F4 操作批准。修复优先交回同一 Work Item 的原实现者，保持责任范围稳定。
