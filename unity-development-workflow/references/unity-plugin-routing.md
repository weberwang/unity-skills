# Unity 插件能力路由

## 分层

本仓库只维护项目级流程、领域决策、交接物、证据合同和自定义 Toolkit 命令，不复制 [@Unity](plugin://unity@openai-curated-remote) 插件已经维护的 Unity 操作教程。执行某项 Unity 工作前，读取与请求匹配的插件 Skill，并以其当前说明为工具事实来源。

桌面 [@Unity](plugin://computer-use@openai-bundled?app=D%3A%5CProgram+Files%5CUnity+Editor%5C6000.3.10f1%5CEditor%5CUnity.exe) 只用于用户明确要求的可见 UI 操作，或插件命令目录确实没有等价能力的交互步骤。只要 Editor 可由 Unity CLI/Pipeline 访问，Scene、Prefab、GameObject、资源、测试和构建就使用 Unity 插件，不用桌面点击替代结构化执行或证据。

## 核心路由

| 请求 | 使用的 Unity 插件 Skill |
| --- | --- |
| Editor/项目发现、Scene/Prefab/GameObject/资源写入、测试、构建、日志 | `unity:unity-cli` |
| 新建项目 | `unity:new-unity-project` |
| UPM 包发现、安装、升级、移除 | `unity:unity-package-management` |
| 查询具体资产或场景对象 | `unity:generate-editor-search-query` |
| 未指定 UI 技术的菜单、HUD、弹窗、布局 | `unity:ui`，再路由到 `unity:ui-uitk`、`unity:ui-ugui` 或 `unity:ui-imgui` |
| 2D 像素渲染、Sprite、Atlas、Tilemap | `unity:2d-pixel-perfect`、`unity:sprite-editor`、`unity:manage-sprite-atlas` 与适用的 `unity:tilemap-*` |
| 本地化、TMP 字体与 CJK 回退 | `unity:localization`、`unity:optimize-text-mesh-pro` |
| AudioMixer 路由与音频性能 | `unity:audio-setup-mixers`、`unity:optimize-audio` |
| URP 迁移、后处理、Shader Graph、Render Graph 审查 | `unity:migrate-birp-to-urp`、`unity:urp-postprocessing`、`unity:shader-graph-create-custom-node`、`unity:validate-urp-render-graph-renderer-feature` |
| NavMesh、3D 物理碰撞 | `unity:initialize-ai-navigation`、`unity:physics-3d-collision` |
| Web 构建优化 | `unity:optimize-web` |
| 多人、LiveOps、IAP、广告、语音聊天 | `unity:setup-multiplayer-services`、`unity:build-live-game`、`unity:implement-in-app-purchases`、`unity:levelplay-unity-integration`、`unity:setup-vivox-voice-chat` |

## 保留在本仓库的职责

- `unity-game-workflow-control`：范围、状态、风险、实施包和证据权威。
- `unity-development-workflow`：六阶段与 V0-V4 编排、单写者、交接和质量门。
- 各领域 Skill：产品与技术决策、跨领域合同、资源权属、预算、验收和发布边界。
- `com.project.unity-workflow-toolkit`：项目专用的验证、批准资源导入、固定机位取证与交付预检命令。

插件命令成功只证明命令执行完成，不自动满足本仓库的 F2/F3、V4、设备或发布证据。插件没有覆盖的项目合同继续由本仓库维护；插件已经覆盖的操作步骤不得在本仓库再维护一份易漂移副本。
