# 验证记录

## 本次验证范围

本记录更新于 2026-09-10，覆盖以 Phaser 工作流控制为基线重构后的 Unity 控制面、六阶段任务投影、V0-V4 场景循环、F0-F4 质量门、A0-A6 动作等级、Work Item、Implementation Package、Evidence Manifest、精确审批、Unity 路径所有权、单写者约束、状态迁移、安装器与领域 Skill 文档。

本次按 T2（模块验证）执行。原因是改动跨越控制器、Schema、安装清单、编排文档和领域 Skill，需要全量 Node.js 回归、控制器 lint 与 Skill 结构校验。按仓库约束，没有启动 Unity Editor、服务或真机验收。

## 已实际通过

### Node.js 全量测试

命令：

```powershell
rtk npm test
```

结果：全部 `node:test` 测试通过。覆盖控制面安全推进、实施包冻结、证据绑定、精确审批、A4 集成门禁、A5/A6 发布闭环、RETURN 恢复、路径规范化、Unity 共享路径单写者、依赖顺序、Schema/runtime 一致性、进程锁、revision/CAS、安装器以及既有 Toolkit 和专项 Skill 静态契约。

### 控制面 lint

命令：

```powershell
rtk node unity-game-workflow-control/scripts/workflow-control.mjs lint --repository .
```

结果：通过。控制 Skill 入口、代理配置、参考文档、Schema 和运行时脚本均被识别。

### Skill 结构校验

命令：

```powershell
$env:PYTHONUTF8='1'
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-workflow-control
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-development-workflow
```

结果：两个 Skill 均返回 `Skill is valid!`。

### 静态完整性

- 控制器和运行时实现文件均小于 1000 行。
- 工作项写入使用同目录锁、原子替换与 revision/CAS，异常路径释放锁。
- 路径在范围和所有权判断前统一规范化，拒绝绝对路径、盘符、空段及 `.`/`..` 穿越。
- 安装器与根包清单包含新的 `unity-game-workflow-control`，安装总数为十五个 Skill。

## 未执行项

- 未启动 Unity Editor，因此没有执行 EditMode、PlayMode、实际编译、域重载、Scene/Prefab 回读或 BuildReport 验证。
- 未进行 Android、iOS、iPadOS、主机平台或真机验收。
- 未执行发布、商店、设备安装、外部系统写入或其他 A5/A6 副作用。

上述项目保持 `NOT_RUN`，不能由 Node.js 或静态检查推断为 `PASS`。实际 Unity 项目使用本控制面时，必须把适用的编译、Console、Scene、Prefab、GUID/meta、EditMode、PlayMode、构建和设备证据写入 Evidence Manifest，才允许通过对应门禁。
