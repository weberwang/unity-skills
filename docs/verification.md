# 验证记录

## 本次验证范围

本记录更新于 2026-09-22，覆盖将 Phaser 工作流更新同步到 Unity 控制面、移除项目专用角色 Skill、融合 [@Unity](plugin://unity@openai-curated-remote) 插件，并移植本地纯色背景移除工具。Unity 操作教程现由官方插件专项 Skill 单点维护，本仓库保留六阶段、Work Item/实施包、V0-V4、F0-F4、单写者、领域决策、证据合同和四个 Toolkit 扩展命令；桌面 Unity 仅保留可见 UI 交互的受限后备边界。去背景工具在 Unity 导入前处理 PNG，保留源/输出 SHA、像素验证和深浅底预览。

本次按 T2（模块验证）执行。原因是改动跨越控制器、Schema、安装清单、编排文档、领域 Skill 和可执行图片处理脚本，需要全量 Node.js 回归、控制器 lint、脚本定向测试与 Skill 结构校验。按仓库约束，没有启动 Unity Editor、服务或真机验收。

## 已实际通过

### Node.js 全量测试

命令：

```powershell
rtk npm test
```

结果：`91/91` 个当前 `node:test` 测试通过。新增覆盖官方 Unity 插件能力路由、领域 Skill 委派、桌面 Unity 边界、Toolkit 扩展，以及纯色背景的边缘连通移除、透明边缘、RGB/灰度 tRNS、解压长度上限、严格输入、Alpha 复用、失败记录、CLI、路径冲突和硬链接覆盖保护；项目专用 Skill 及其专用测试已清理，既有控制面、安装器、Pipeline 命令、响应式合同、视觉合同和通用专项 Skill 回归保持通过。

### 控制面 lint

命令：

```powershell
rtk node unity-game-workflow-control/scripts/workflow-control.mjs lint --repository .
```

结果：通过。控制 Skill 入口、代理配置、参考文档、Schema 和运行时脚本均被识别。

### Skill 结构校验

命令：

```powershell
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-development-workflow
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-3d-modeling
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-3d-texturing
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-architecture
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-audio
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-qa-performance
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-visual-assets
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-gameplay-development
rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py unity-game-release
```

结果：九个受影响 Skill 均返回 `Skill is valid!`。

### 静态完整性

- 控制器、Pipeline 命令和图片处理实现文件均小于 1000 行。
- 工作项写入使用同目录锁、原子替换与 revision/CAS，异常路径释放锁。
- 路径在范围和所有权判断前统一规范化，拒绝绝对路径、盘符、空段及 `.`/`..` 穿越。
- Toolkit 和测试宿主均固定 `com.unity.pipeline 0.6.0-exp.1` 与 `com.unity.inputsystem 1.20.0`，生产目录未检出旧 Unity MCP 包、工具名或资源 URI。

## 未执行项

- 本次没有调用 Unity CLI 或启动 Unity Editor，因此没有执行 UPM 包解析、C# 编译、四个命令的发现与真实调用、EditMode、PlayMode、域重载、Scene/Prefab 回读或 BuildReport 验证。
- 未进行 Android、iOS、iPadOS、主机平台或真机验收。
- 未执行发布、商店、设备安装、外部系统写入或其他 A5/A6 副作用。

上述项目保持 `NOT_RUN`，不能由 Node.js 或静态检查推断为 `PASS`。实际 Unity 项目使用本控制面时，必须把适用的编译、Console、Scene、Prefab、GUID/meta、EditMode、PlayMode、构建和设备证据写入 Evidence Manifest，才允许通过对应门禁。

## 2026 年 10 月 7 日原生 2D 骨骼技能验证

新增 `unity-game-2d-rigging` 入口、中文代理元数据和两份制作参考，接入 Unity 领域编排、视觉资产、玩法和独立 QA。npm 白名单与安装器同步扩充到十五个技能。规格位于 `docs/superpowers/specs/2026-10-07-unity-2d-rigging-skill-spec.md`。

实际执行 T2，覆盖技能结构、领域接入、打包与安装完整性：

- `rtk npm test`：101 项通过，0 项失败，0 项跳过。新增安装副本链接检查，既有安装测试逐文件核对新技能及参考产物。
- `rtk node unity-game-workflow-control/scripts/workflow-control.mjs lint --repository .`：通过。
- `rtk node --check`：安装器及两个修改后的安装测试文件通过语法检查。
- `rtk python -X utf8 C:/Users/forjs/.codex/skills/.system/skill-creator/scripts/quick_validate.py <技能目录>`：新骨骼技能及编排、视觉资产、玩法、QA 五个入口均通过。
- `npm pack --dry-run --ignore-scripts --json`：新技能入口、代理元数据、制作合同和能力验证参考全部包含，未生成或发布安装包。
- 独立只读审查与两个制作请求推演：无阻断问题；复用已批准视角，拆件确认前不生产正式部件，实际重导入失败回到骨骼修复，独立验收后正式交接玩法。

本次未启动 Unity Editor、安装 UPM 包或制作真实角色，骨架/网格/权重、Sprite Skin、Clip、Prefab 的目标项目链路仍为 `NOT_RUN`。未启动 Standalone/Player 或真机，未执行付费、上传、发布或其他外部写入；T2 结果只证明技能与安装交付检查通过。
