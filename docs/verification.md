# 验证记录

## 本次验证范围

本记录更新于 2026-09-22，覆盖将 Phaser 工作流 2026-09-10 至 2026-09-21 的流程更新同步到 Unity 控制面，并保留 [@Unity](plugin://unity@openai-curated-remote) 与 `com.unity.pipeline` 命令层。验证范围包括独立 `DISPLAY_LAYER` Work Item/实施包、Unity 原生响应式合同、V4 运行测量、视觉来源与结构装配分离、父级和语义分组、五语言程序化文本策略、六阶段任务投影、V0-V4 场景循环、F0-F4 质量门、路径所有权、单写者约束、Schema、模板和领域 Skill 文档。

本次按 T2（模块验证）执行。原因是改动跨越控制器、Schema、安装清单、编排文档和领域 Skill，需要全量 Node.js 回归、控制器 lint 与 Skill 结构校验。按仓库约束，没有启动 Unity Editor、服务或真机验收。

## 已实际通过

### Node.js 全量测试

命令：

```powershell
rtk npm test
```

结果：`98/98` 个 `node:test` 测试通过。新增覆盖场景与显示层包隔离、`hostSceneId` 上下文语义、CanvasScaler/PanelSettings 路线互斥、`sourceScale=2` 默认值及显式覆盖、程序化文本五语言策略、合同完整内容绑定、运行工件回读与 SHA 校验、当前候选绑定、V4 响应式运行证据、视觉来源与装配分析，以及六个 YAML 模板的 AJV 校验；既有控制面、安装器、Pipeline 命令和专项 Skill 回归保持通过。

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
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-development-workflow
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-architecture
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-production
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-qa-performance
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-visual-assets
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-workflow-control
rtk python C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-gameplay-development
```

结果：七个受影响 Skill 均返回 `Skill is valid!`。

### 静态完整性

- 控制器和 Pipeline 命令实现文件均小于 1000 行。
- 工作项写入使用同目录锁、原子替换与 revision/CAS，异常路径释放锁。
- 路径在范围和所有权判断前统一规范化，拒绝绝对路径、盘符、空段及 `.`/`..` 穿越。
- Toolkit 和测试宿主均固定 `com.unity.pipeline 0.6.0-exp.1` 与 `com.unity.inputsystem 1.20.0`，生产目录未检出旧 Unity MCP 包、工具名或资源 URI。

## 未执行项

- 当前环境未安装 Unity CLI，且未启动 Unity Editor，因此没有执行 UPM 包解析、C# 编译、四个命令的发现与真实调用、EditMode、PlayMode、域重载、Scene/Prefab 回读或 BuildReport 验证。
- 未进行 Android、iOS、iPadOS、主机平台或真机验收。
- 未执行发布、商店、设备安装、外部系统写入或其他 A5/A6 副作用。

上述项目保持 `NOT_RUN`，不能由 Node.js 或静态检查推断为 `PASS`。实际 Unity 项目使用本控制面时，必须把适用的编译、Console、Scene、Prefab、GUID/meta、EditMode、PlayMode、构建和设备证据写入 Evidence Manifest，才允许通过对应门禁。
