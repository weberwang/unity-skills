# 多代理执行

## 何时读取

准备分派任务、申请锁、处理失败、推进状态或并行执行两个以上独立工作项时读取。

## 输入

- 编译后的 DAG、任务契约、路径所有权和当前状态文件。
- 可用代理、Unity 实例、资源锁文件和证据目录。
- 当前主场景及用户批准状态。

## 执行步骤

1. 采用子代理优先：主代理保留编排、门禁、冲突处理和用户沟通。
2. 将任务标为 L0 只读、L1 非 Unity 制品写入或 L2 Unity/共享状态写入。
3. 按主路径 `BLOCKED → READY → ASSIGNED → RUNNING → SELF_VERIFIED → REVIEWING → APPROVED → INTEGRATED → VERIFIED → DONE` 推进状态。
4. 分派前检查依赖、路径所有权和锁；L2 必须串行。
   3D 任务还要检查“模型拓扑/UV 冻结 → 贴图/材质 → Prefab/场景”的依赖；DCC 正式写入虽不调用 Unity，也按共享资产单写任务串行调度。
5. 临时失败走 `RUNNING → RETRYABLE_FAILED → ASSIGNED`，最多重派两次；两次重派后再次失败保持 `RETRYABLE_FAILED`，释放任务锁并上报主代理。
6. 开发代理提交证据后由独立审查代理判断；禁止开发代理自批。
7. 同一时间只允许一个主场景进入正式验收。
8. 默认使用当前工作区和严格路径所有权；只有用户明确要求时才允许用 Worktree 隔离多个并发写入者。Git/Worktree 不参与质量门或状态机。

评审拒绝走 `SELF_VERIFIED → REJECTED` 或 `REVIEWING → REJECTED`。任一非终态可进入 `CONFLICTED` 或 `CANCELLED`；`DONE`、`REJECTED`、`CONFLICTED`、`CANCELLED` 均为终态。

## 子代理角色与并行边界

- 角色包括侦察、规划、开发、视觉生成、测试、审查和交付代理。
- 3D 角色包括 `$unity-game-3d-modeling` 与 `$unity-game-3d-texturing`；前者拥有几何/LOD/Collider，后者拥有冻结 UV 下的贴图/材质，集成代理独占 Prefab 与场景接线。
- L0 可并行；不同路径的 L1 可并行；同一 Unity 项目的 L2 正式写入必须串行。
- 用户明确授权 Worktree 后，多个物理 Unity 项目副本可以并行写入；共享场景、ProjectSettings、Packages 和公共接口仍分配给单一所有者，集成后统一复验。
- 报告契约必须包含 `task_id`、`actor`、`status`、`changed_paths`、`commands`、`evidence`、`risks` 和 `next_action`。

## 所需锁与 Unity 权限

- 使用路径共享锁执行只读任务，独占锁执行写任务；共享状态使用全局独占锁。
- L2 在写调用前必须显式绑定已发现的 `unity-mcp` 实例。
- 未获得锁、实例不匹配或场景未保存时不得启动写任务。
- DCC 工程、模型源、外链纹理和导出目录使用独占单写锁；禁止两个 DCC 写代理操作同一工程，也禁止 DCC 写代理与 Unity 导入代理交叉持锁。DCC 原子导出并释放后，Unity 代理才可取得 AssetDatabase/目标资产锁。

## 机器可读输出

维护 `task-state.json`、`workflow-locks.json` 和逐任务 `agent-report.json`；所有状态迁移附证据路径。3D/DCC 锁记录规范化源工程、导出目录、资源 ID、持有者、工具/版本和取得时间。

## 通过条件

- 每个任务的级别、所有者、依赖、锁和审查者明确。
- 并行任务不共享写路径，L2 写入无重叠。
- 批准来自独立审查或用户门禁，而不是开发代理自身。

## 失败与恢复出口

- 锁冲突时保持 `READY` 并等待，不得绕过锁。
- 两次重派后再次失败保持 `RETRYABLE_FAILED`，释放全部任务锁，汇总原始错误并上报主代理；不得虚构迁移到 `BLOCKED`。
- 所有权或实例冲突时释放已取得锁，回到重新规划或项目发现。
- DCC 工具崩溃、工程占用或导出失败时保持源文件不变，释放锁并保存诊断；恢复最近已验证源到新修订路径后重试，不强制保存、结束他人进程或覆盖当前有效 Unity 资产。
