# S00 基础工作流

## 何时读取

全局技术与视觉方向获批后、任何正式场景实现前，或共享骨架需要变更时读取。

## 输入

- 已通过的项目发现、用户确认且状态为 `APPROVED` 的 `project-profile` 与 `decomposition-plan`、module-manifest、场景 DAG 和 Visual Bible。
- 全部场景 manifest 草案与共同能力清单。
- 已由 `unity status` 确认并通过 `--project-path` 唯一选择的 Unity Editor 目标。

## 执行步骤

1. 深度校验拆分决策文件、用户确认、哈希、模块/场景边界和恢复出口，并确认其 ID、版本、`sourceRevision` 与 `projectStateVersion` 和活动拆分指针一致；未批准、被拒绝、等待确认或版本失配时停止，不得创建 S00 任务。
2. 创建 S00 任务并冻结共享骨架范围。
3. 建立最小目录、程序集、Composition Root、启动入口、场景加载、输入、时间/随机抽象、配置、存档版本边界、UI Toolkit 基础、日志与测试骨架。
4. 仅将已在拆分决策中由至少两个场景共同需要的能力放入共享骨架。
5. 可并行准备不写 Unity 的契约、测试清单和资源说明。
6. 串行执行 asmdef、场景、资源和共享状态的 Unity 正式写入。
7. 运行 Schema、静态、编译、Console、EditMode 与 PlayMode 基线。
8. 使用 [@Unity](plugin://unity@openai-curated-remote) 的 `unity build` 为 `primaryDevelopmentPlatform` 生成可启动空壳构建，记录平台、Build Profile、场景列表、脚本后端、选项和任务结果；该构建只证明主开发平台基线，不代表其他目标平台已适配。
9. 独立审查 S00 证据，通过后选择代表性场景进入 G1 垂直切片；不得把空壳骨架本身视为垂直切片完成。

## 子代理角色与并行边界

- 契约、测试设计和资源盘点可由子代理并行准备。
- Foundation 开发代理串行写入 Unity；QA 代理和架构审查代理独立验证。
- 后续场景代理可以只读准备需求，但不得提前写正式共享状态。

## 所需锁与 Unity 权限

- S00 是全局骨架代码的正式实现时点，写入持有 Foundation、Shared 和启动场景路径的独占锁。
- 任何写调用前用 `unity status` 验证目标，并为 `unity command` 显式传递项目绝对路径。
- 空壳构建阶段持有构建输出目录独占锁。

## 机器可读输出

以 `schemas/s00-report.schema.json` 和 `templates/s00-report.yaml` 输出 `s00-report.yaml`，包含拆分决策、模块清单、范围、至少被两个场景使用的共享能力、变更路径、质量报告、Console、主开发平台空壳构建、独立审查和状态。S00 进入 `PASS` 前由 Codex 核对契约引用与哈希，并通过 [@Unity](plugin://unity@openai-curated-remote) 的 Pipeline 命令与 C# Toolkit 回读所有 Unity 事实。

## 通过条件

- 最小骨架可编译、可运行且 Console 无新增错误。
- EditMode、PlayMode 基线和主开发平台空壳构建实际通过。
- 拆分决策仍为当前批准版本，模块清单与场景草案未越过用户确认边界。
- 共享能力均有至少两个场景的需求证据，独立审查已批准。

## 失败与恢复出口

- 骨架失败时保持 S00，不得启动正式场景写入。
- 非共同能力下沉到所属场景后重跑门禁。
- 共享接口变化时重新编译 DAG，并评估所有场景影响。
