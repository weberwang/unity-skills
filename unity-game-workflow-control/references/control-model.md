# 控制模型

## A0-A6 动作等级

| 等级 | Unity 语义 | 典型动作 |
| --- | --- | --- |
| `A0` | 只读调查 | 读取 Unity 版本、包、Scene、Prefab、Importer、GUID、脚本和日志 |
| `A1` | 项目规格和候选 | 形成 Work Item、模块契约、场景规格、质量和验收候选 |
| `A2` | 隔离原型 | 在临时或明确隔离目录制作原型，不接入正式入口或共享设置 |
| `A3` | 生产实现 | 正式脚本、资源、Scene、Prefab、ScriptableObject、EditMode/PlayMode 和本地构建 |
| `A4` | 本地集成与迁移 | 正式入口、跨模块组合、迁移、删除旧实现和共享设置变更 |
| `A5` | 外部状态与设备 | 外部服务/商店配置、上传、真实设备和会改变项目外部状态的操作 |
| `A6` | 发布高风险 | 发布、付费、正式渠道、破坏性回滚和不可逆线上操作 |

A0-A3 的风险等级不等于自动执行许可；路径、范围和 F0-F3 仍必须满足。A4 只有在无外部、无破坏性副作用时可以按安全本地集成推进；A4-A6 一旦带副作用，必须有与对象、影响、路径和基线精确绑定的批准。

## F0-F4 唯一语义

| 门 | 语义 | 核心问题 |
| --- | --- | --- |
| `F0` | 范围流程 | 用户目标、阶段、A 等级、允许路径和停止门是否明确 |
| `F1` | 规格一致性 | 候选是否符合批准需求、模块契约、场景契约和基线 |
| `F2` | Unity 领域质量 | Scene、Prefab、资源、动画、音频、玩法、视觉和架构质量是否达标 |
| `F3` | 工程验证 | 编译、域重载、Console、EditMode、PlayMode、资源绑定和构建证据是否闭合 |
| `F4` | 高影响精确批准 | A4-A6 的当前对象、影响、目标、路径和副作用是否已逐项批准 |

## 实施包边界

实施包由有序 `executionUnits` 组成，单元类型只能是 `SHARED`、`MODULE`、`SCENE`、`DISPLAY_LAYER`、`INTEGRATION`、`RELEASE`。每个单元必须声明模块、所有者、路径和状态。

- Unity 资产写入必须同时覆盖资产与 `.meta` 配对，并记录 GUID/Importer 所有权。
- Scene、Prefab、ScriptableObject 等序列化资源必须声明对应资源所有权；不能只声明旁边的脚本。
- `ProjectSettings/`、`Packages/` 和 Build Settings 路径必须声明工程设置所有权。
- `SHARED`、`INTEGRATION`、`RELEASE` 单元始终串行；同一个 Unity 项目的正式 Editor 写入只允许一个 `editorWriter`。
- 文件必须同时落在 Work Item 的 `allowedPaths` 内且不命中 `forbiddenPaths`；不接受隐式扩大范围。

## 明确停止

控制面遇到未决用户选择、未冻结实施包、缺少验证证据、`RETURN`、不同所有者的正式 Editor 写入或带副作用 A4-A6 时停止。它不会通过猜测用户意图、把 NOT_RUN 改成 PASS、自动回退状态或调用 Unity/设备/服务来“完成”任务。
