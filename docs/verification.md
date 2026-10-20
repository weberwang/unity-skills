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

## 2026 年 10 月 20 日骨骼自动检查与角色回归

本次按新增岗位边界完成工具与验证：2D 动画技术美术负责只读资产检查服务及工程规则；独立 QA 负责真实导入夹具、命令边界和角色运行回归；主代理负责集成、执行验证和收尾。独立审查发现的测试清理所有权、BlendTree 参数及事件对象类型问题均已修复并复核。

新增 `RiggingValidation` 模块、`uwt_validate_2d_rigging` 命令、`rigging-validation` Schema/模板和测试。检查覆盖 Prefab/缺失脚本、SpriteSkin 映射、真实导入网格与权重、骨架父级、Controller/Clip/事件及 Sprite 变体；报告只写 `Artifacts/`，拒绝覆盖 Job 或源契约。工程 `PASS` 与运行回归、人工视觉结论分别记录。

### 实际环境与等级

执行 T2：涉及新 C# 模块、公共 Job 读取入口、受限报告写入及跨域重载的角色测试，需要真实 Unity 编译、定向模块回归、Node 全量和交付结构检查。

使用既有隔离测试项目 `Artifacts/UnityValidationHost`，确认没有可复用 Editor 实例后启动一次，后续验证均复用该进程，未修改已有游戏项目。实际版本为 Unity `6000.5.6f1`、2D Animation `15.1.0`、2D Sprite `1.0.0`、Test Framework `1.7.0`。Toolkit 声明的最低 2D Animation `10.2.2` 所需公开 API 已通过官方 Registry 包源码核实；Unity `6000.0` / Animation `10.2.2` 组合未做运行验证。

### 已通过的检查

通过实际发现的 Pipeline 命令运行测试，调用均包含 `--project-path`、`--caller plugin` 和 `--skill unity-game-qa-performance`，异步执行后以 `test_status` 取得终态：

```powershell
unity command run_tests --project-path D:/Git/unity-skills/Artifacts/UnityValidationHost --caller plugin --skill unity-game-qa-performance --mode editor --filter Project.UnityWorkflow.Tests.Rigging --async_tests true --timeout 600 --format json
unity command run_tests --project-path D:/Git/unity-skills/Artifacts/UnityValidationHost --caller plugin --skill unity-game-qa-performance --mode editor --filter CoreTests --async_tests true --timeout 300 --format json
unity command run_tests --project-path D:/Git/unity-skills/Artifacts/UnityValidationHost --caller plugin --skill unity-game-qa-performance --mode editor --filter PipelineCommandTests --async_tests true --timeout 300 --format json
unity command test_status --project-path D:/Git/unity-skills/Artifacts/UnityValidationHost --caller plugin --skill unity-game-qa-performance --format json
```

- Unity 编译通过；新命令在真实命令目录中唯一发现。
- Rigging：`27/27` 通过；Core：`12/12` 通过；PipelineCommand：`12/12` 通过，合计 `51/51`，0 失败、0 跳过。
- 角色夹具保存并重导入真实 Sprite、骨骼网格、Clip、Controller 和 Prefab，验证合法资产只读、持久化缺陷、变体映射、BlendTree 参数、事件载荷与输入覆盖保护。预期的损坏 Controller 日志逐项精确声明，不全局忽略错误。
- Editor 测试通过 `EnterPlayMode` 执行实际 Animator 循环、过渡、事件时序、中断、暂停恢复、变体切回、CPU 骨骼顶点变形、显式 Rebind 池复用和双实例隔离；采用固定模拟步长。
- 初轮编译、子资源命名、网格提供器、预期日志、重复检查 ID 和域重载清理问题均已修复。最终运行后临时夹具条目为 `0`、`isPlaying=false`、`timeScale=1`、`captureDeltaTime=0`。本轮源码修改时间早于最终测试程序集编译时间。
- `rtk npm test`：`129/129` 通过，0 失败、0 跳过。
- 控制面 lint、四个相关 Skill 结构校验、`npm pack --dry-run --ignore-scripts --json` 及差异空白检查通过；工具、测试、合同和岗位入口均包含在安装交付中。

原始 JSON 与日志保存在 `Artifacts/TestResults/`，包括 `rigging-compile.json`、`rigging-suite-results.json`、`rigging-core-results.json`、`rigging-pipeline-results.json`、`rigging-command-discovery.json`、`rigging-environment-cleanup.json` 和 `rigging-node.log`。这些验证产物不加入发布包。

### 未执行与适用边界

未运行正式游戏角色或玩法场景的接入验收；技术夹具通过不能证明具体角色的节奏、表演或部件视觉无缝。未生成或自动分析截图，视觉结论保持人工验收。未启动 Standalone/Player、真机验收、构建或发布。当前变体协议检查直接替换，不自动证明带额外补偿的 Pivot 差异可对齐；无法证明时报告 `BLOCKED`。

## 2026 年 10 月 20 日骨骼交付门禁接入

资产交付现在接入唯一控制面的 F3，继续使用原 Work Item、Implementation Package 和状态。新增现有 Work Item/Evidence Manifest 的 `riggingDelivery` 合同、只读运行时模块及[交付说明](../unity-game-workflow-control/references/rigging-delivery-gate.md)。骨骼资产工作项显式声明当前角色、Prefab/GUID、候选修订、最近变更、实际必需回归与岗位负责人；工程和目标项目角色播放回归均通过，才满足这项技术交付门。

技术美术为工程报告增加真实加载的 Prefab 和递归 Assets 依赖来源，复用原 `EvidenceDto`，不改变公共报告 DTO 或命令接口。控制器回读原始工程报告、资源及 `.meta` GUID/修改时间、独立 QA 和原始 Pipeline 测试结果，校验身份、版本、环境、时间、必需用例和计数。缺失、陈旧、失败、未执行、跳过或工具夹具冒充均阻断；静态 F3/PASS 和直接正常迁移不能绕过。真实失败证据仍可保存，不能作为通过事实。

阻断输出在稳定 `metadata.riggingDelivery` 中给出 `handoffAllowed` 与按所属角色的 `repairs`。总控沿用既有单元 owner/assignedAgent 交办：公共工具交技术美术，角色内容交骨骼制作，图像交视觉，触发/规则交玩法，缺证交独立 QA 重验；不跨角色广播行内 finding，不自动修改文件所有权、发消息或进入 RETURN。用户视觉确认与玩法接入后运行轮继续执行。

### 本轮实际 T2 结果

选择 T2 是因为门禁为明确声明的角色交付增加检查，普通资产和公共工具行为保持原有控制面，覆盖需要控制器全量回归、schema/安装交付以及 Unity 来源报告的模块验证。

- `rtk npm test`：`149/149` 通过，0 失败、0 跳过；其中新增门禁定向测试 `20/20`，覆盖放行/阻断、真实报告状态、当前身份与依赖时效、多角色、独立 QA、岗位退修、修复复验、check/run/直接 transition、只读保护、普通资产不扩围、schema 一致性及路径/诊断安全。
- `rtk node unity-game-workflow-control/scripts/workflow-control.mjs lint --repository .`：通过；新增模块和门禁参考已纳入必需文件清单。
- 控制器、新运行时模块、测试与 helper 的 `node --check` 通过；七个相关 Skill 的结构校验通过；`npm pack --dry-run --ignore-scripts --json` 确认门禁、schema、说明和来源助手及 Unity 生成的 `.meta` 在安装交付中；差异空白检查通过。控制器为 985 行，主要新增逻辑独立成模块。
- 确认没有可复用的验证 Editor 后，启动既有隔离项目 `Artifacts/UnityValidationHost`，后续操作复用该进程。实际 Unity `6000.5.6f1` / Animation `15.1.0` 编译通过。
- 通过现有 Pipeline `run_tests --mode editor --filter Project.UnityWorkflow.Tests.Rigging --async_tests true`，随后 `test_status` 取得最终 `30/30` 通过、0 失败、0 跳过，包含新增来源身份、递归依赖和非法变体路径验证，以及既有资产/命令/播放回归。
- 最终临时夹具数为 `0`，Editor 已退出 PlayMode，`timeScale=1`、`captureDeltaTime=0`；仅本次启动的验证 Editor 已正常关闭。

独立审查及定向测试发现的链接检查顺序、PlayMode 缺失旁路、技术夹具伪装、失败证据记录条件、角色返修范围和诊断路径脱敏问题均已修复并复验；最终限定复核未发现遗留实质问题。原始结果保存在 `Artifacts/TestResults/rigging-gate-compile.json`、`rigging-gate-unity-results.json`、`rigging-gate-environment-cleanup.json`、`rigging-gate-node.log`、`rigging-gate-npm-pack.json`。

本轮没有正式游戏角色候选或玩法场景的交接，不将技术夹具 `30/30` 写成正式角色通过。目标项目缺少真正加载当前角色的播放用例时，新增门禁保持阻断，由独立 QA 补齐。最低 Unity `6000.0` / Animation `10.2.2` 未新增运行验证。未启动真机或 Standalone/Player，未做构建、发布、截图分析或人工视觉验收。

## 2026 年 10 月 20 日工作流约束对齐

以 `D:/Git/phaser-skills` 的 `fc44d25` 为参照，同步阶段职责与任务约束，继续采用 Unity 的 Scene、Prefab、Importer、原生响应式合同和既有骨骼交付门禁。V0 内部分流；V2 拆解与布局分别确认；V3 完成正式资源生产和导入验收，可提供临时预览；V4 才正式接入与校准。增加相邻阶段入口、恰好三张同条件视觉基线候选、唯一人工选择与跨工作项复用，以及制作前动画理念/动作方案确认和结构化刺激预算。

实施单元增加独立 `execution-state.json` 和 Result 合同，冻结包中的手填完成状态不能代替真实结果。结果校验绑定计划、业务身份、命令及实际附件，证据路径受当前 `evidenceRoot` 限制。批次按依赖推进，Editor 写入保持串行。RETURN 根据真实影响推导恢复点，归档状态并持续拒绝当前及历史失效包/证据；不能绕道 BLOCKED，也不能延迟重新绑定旧身份。工作项提交失败的执行状态恢复在同一状态锁内完成 CAS，快照也在实际变更锁内捕获，避免覆盖并行单元的新结果。

基础工程资料补充 SDK 单入口独立初始化、首帧与失败隔离、默认全屏与 Android 无标题栏、音频后台暂停及原位置恢复；新增产物目录、机器证据边界和递归最小 Git 提交规则。这里只修改工作流技能与控制工具，不代表这些运行能力已在某个游戏项目实现或验收。

### 本轮实际 T2 结果

选择 T2：改动覆盖状态迁移、执行结果、视觉合同、Schema 与多份阶段资料，需要控制模块全量回归及技能交付检查。拟执行并实际执行的范围为 `rtk npm test`、控制面 `lint --repository .`、相关技能 `quick_validate.py`、Node 语法/文件规模检查、`npm pack --dry-run --ignore-scripts --json` 与 `git diff --check`。

- 全部 Node 回归 `184/184` 通过，0 失败、0 跳过；覆盖单元顺序/安全并行、命令和附件、计划身份变化、证据边界、阶段确认、视觉基线、RETURN 延迟复用与历史失效、工作项写失败回滚及确定性并发交错。
- 控制面 lint、9 个相关 Skill 的结构校验、全部控制脚本的 Node 语法检查与不超过 1000 行检查通过。Python 结构检查最初受 Windows 默认 GBK 解码影响，改用 `python -X utf8` 后通过。
- 打包清单检查通过，共 358 个文件；新增运行模块、执行/视觉 Schema、SDK 与 Git 参考资料均包含在安装交付中。差异空白检查通过。
- 独立只读审查提出的 RETURN 绕过、延迟重绑失效证据和回滚竞态均已修复，最终限定复核未发现遗留实质问题。

独立前向验证在系统临时目录通过真实 CLI 走通 INTAKE→IMPLEMENTING、单元 Result、RETURN 归档、新包恢复与新结果闭环；所有日志和 PASS 均明确为模拟夹具，不代表命令或 Unity 真实验收。该过程发现的恢复参数、POSIX 相对路径和确认追溯说明缺口已补入入口与引用文档；控制面不执行验收命令，调用者必须真实执行并保存原始输出。V4 局部返修保留 V3 资源确认的回归也已通过。

原始 Node 输出保存在 `Artifacts/TestResults/workflow-alignment-node.log`。首次全量回归发现一条旧错误文案断言不适配持续失效检查，更新为语义断言后全量复跑通过；不以修改断言代替生产门禁修复。

本轮没有启动 Unity、服务、Standalone/Player 或真机，没有构建、发布、截图分析或代替人工视觉确认。未新增进程异常终止与真实多进程压力验证。开始前已有的骨骼、TA 和 Unity C# 改动予以保留；因与既有未提交内容存在重叠，本轮未创建混合本地提交，也未创建分支或 worktree。
