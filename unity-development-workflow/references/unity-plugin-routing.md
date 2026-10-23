# Unity 插件能力路由

## 分层

本仓库只维护项目级流程、领域决策、交接物、证据合同和自定义 Toolkit 命令，不复制 [@Unity](plugin://unity@openai-curated-remote) 插件已经维护的 Unity 操作教程。执行某项 Unity 工作前，读取与请求匹配的插件 Skill，并以其当前说明为工具事实来源。

桌面 [@Unity](plugin://computer-use@openai-bundled?app=D%3A%5CProgram+Files%5CUnity+Editor%5C6000.3.10f1%5CEditor%5CUnity.exe) 只用于用户明确要求的可见 UI 操作，或插件命令目录确实没有等价能力的交互步骤。只要 Editor 可由 Unity CLI/Pipeline 访问，Scene、Prefab、GameObject、资源、测试和构建就使用 Unity 插件，不用桌面点击替代结构化执行或证据。

## 核心路由

游戏运行时 UI 采用 uGUI + TextMeshPro：Canvas/RectTransform 管理布局、Prefab 承载界面组件、`SafeAreaRectTransform` 管理安全区。未指定技术的运行时菜单、HUD、弹窗按此路线进入 `unity:ui-ugui`；新增编辑器窗口和工具进入 `unity:ui-uitk`。

| 请求 | 使用的 Unity 插件 Skill |
| --- | --- |
| 玩法事件的视觉、音频、镜头、时间与交互反馈设计 | 本仓库 [`unity-game-juice`](../../unity-game-juice/SKILL.md)；确定玩法事件及参数后使用，不替代玩法规则所有权 |
| Editor/项目发现、Scene/Prefab/GameObject/资源写入、测试、构建、日志 | `unity:unity-cli` |
| 新建项目 | `unity:new-unity-project` |
| UPM 包发现、安装、升级、移除 | `unity:unity-package-management` |
| 查询具体资产或场景对象 | `unity:generate-editor-search-query` |
| 运行时菜单、HUD、弹窗、布局 | `unity:ui` → `unity:ui-ugui`，文本使用 TextMeshPro |
| 新增编辑器窗口和工具 UI | `unity:ui` → `unity:ui-uitk` |
| 2D 像素渲染、Sprite、Atlas、Tilemap | `unity:2d-pixel-perfect`、`unity:sprite-editor`、`unity:manage-sprite-atlas` 与适用的 `unity:tilemap-*` |
| Unity 原生 2D 骨骼、蒙皮与角色动画 | 本仓库 [`unity-game-2d-rigging`](../../unity-game-2d-rigging/SKILL.md) 编排；Editor、包、Sprite 元数据及图集复用对应 `unity:*` 技能，骨骼与动画 API 缺口按项目版本验证 |
| 2D 动画公共工具、资产校验、批量对账与回归 | 本仓库 [`unity-game-2d-animation-ta`](../../unity-game-2d-animation-ta/SKILL.md) 负责技术管线；实际 Unity 操作复用插件与 Toolkit，角色资产仍归骨骼／视觉，质量负责人与独立 QA 按[岗位协作](2d-animation-collaboration.md)交接 |
| 3D 模型几何、拓扑、法线、UV、LOD、碰撞代理，以及 PBR 材质节点、绘制、烘焙、通道打包与贴图导出 | 按[3D 资源工作流](3d-asset-workflow.md)通过 Blender MCP 生产，并按[模型与贴图共同交接](../../unity-game-3d-texturing/references/model-texture-handoff.md)交接；`unity:unity-cli` 只负责模型/纹理导入器、Material/Renderer、资源级 Prefab 和运行验证 |
| 3D 角色骨架、蒙皮、控制 Rig、动作与曲线烘焙 | [`unity-game-3d-rigging`](../../unity-game-3d-rigging/SKILL.md) 与 [`unity-game-3d-animation`](../../unity-game-3d-animation/SKILL.md) 使用 Blender MCP 生产；按[角色共同交接](3d-character-handoff.md)和[角色导入合同](3d-character-unity-import.md)，由 `unity:unity-cli` 接入 Avatar、Clips、Animator、蒙皮 Renderer 与 Prefab 并验证 |
| 本地化、TMP 字体与 CJK 回退 | `unity:localization`、`unity:optimize-text-mesh-pro` |
| AudioMixer 路由与音频性能 | `unity:audio-setup-mixers`、`unity:optimize-audio` |
| URP 迁移、后处理、Shader Graph、Render Graph 审查 | `unity:migrate-birp-to-urp`、`unity:urp-postprocessing`、`unity:shader-graph-create-custom-node`、`unity:validate-urp-render-graph-renderer-feature` |
| NavMesh、3D 物理碰撞 | `unity:initialize-ai-navigation`、`unity:physics-3d-collision` |
| Web 构建优化 | `unity:optimize-web` |
| 多人、LiveOps、IAP、广告、语音聊天 | `unity:setup-multiplayer-services`、`unity:build-live-game`、`unity:implement-in-app-purchases`、`unity:levelplay-unity-integration`、`unity:setup-vivox-voice-chat` |

## 保留在本仓库的职责

- `unity-game-workflow-control`：范围、状态、风险、实施包和证据权威。
- `unity-development-workflow`：六阶段与 V0-V4 编排、单写者、交接和质量门；另维护美术质量、动画意图、九宫格和布局校准合同。
- `unity-game-juice`：把已确认玩法事件映射到多通道动态反馈，明确重复、叠加、中断、时间来源与生命周期。
- 各领域 Skill：产品与技术决策、跨领域合同、资源权属、预算、验收和发布边界。
- `com.project.unity-workflow-toolkit`：项目专用的验证、批准资源导入、固定机位取证、布局实测（`uwt_measure_layout`）、Editor Game View 采集（`uwt_capture_game_view`）与交付预检命令。布局命令只读取 Unity 实际几何，采集命令只提供给用户检查的画面证据。

插件命令成功只证明命令执行完成，不自动满足本仓库的 F2/F3、V4、设备或发布证据。插件没有覆盖的项目合同继续由本仓库维护；插件已经覆盖的操作步骤不得在本仓库再维护一份易漂移副本。

3D 模型几何与贴图生产均以 Blender MCP 为入口；Unity 插件执行模型/纹理导入、Material/Renderer 绑定、资源级 Prefab 组装及运行验证，不创建可见模型几何或贴图。生产阶段、工具发现、源文件、共同交接和质量边界按[3D 资源工作流](3d-asset-workflow.md)及其交接文档执行。
