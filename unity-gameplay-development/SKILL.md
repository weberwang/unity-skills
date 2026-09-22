---
name: unity-gameplay-development
description: Unity 游戏的玩法开发角色。需要依据 GDD、TDD、场景 manifest 与数值配置实现、重构或验收核心循环、交互、状态、AI、存档、2D 屏幕适配、已批准 3D Prefab 接入和场景功能时使用。
---

# Unity 游戏玩法开发

## 输入与决策

读取 Work Item、Implementation Package、项目配置、GDD、TDD、资源契约、测试与当前场景 manifest。只实现范围内且可观察验收的增量；职责、公开契约、状态所有权、依赖方向、场景生命周期与体验边界存在实质取舍时交给 `$unity-game-grilling`，否则记录合理假设并推进。

## 实现与交接

Editor/Scene/Prefab 操作交给 `unity:unity-cli`；未指定 UI 技术时先用 `unity:ui`；NavMesh、3D 碰撞、多人和 LiveOps 分别路由到 `unity:initialize-ai-navigation`、`unity:physics-3d-collision`、`unity:setup-multiplayer-services`、`unity:build-live-game`。本角色保留玩法规则、状态所有权、接口和场景增量，不复制插件专项实现指南。

1. 先冻结玩家行为、边界情况和测试点；A3 前冻结实施包，再按总控的阶段任务闭环编码。
2. 表现前建立图片、模型、贴图、动画、VFX、字体和音频依赖；查询登记并复用有效产物，合成效果图交给视觉资源角色，不自行裁切。生产级模型和贴图需求分别交给 `$unity-game-3d-modeling` 与 `$unity-game-3d-texturing`。
3. 遵守 asmdef 和 TDD 边界，分离纯规则、状态、输入、场景表现、Unity 生命周期和平台服务；数值读取可审阅配置。
4. 纯规则可与资源制作并行；正式场景只接入已登记、审查、授权和 Unity 验证通过的资源。场景只实现自身玩法、画面与常驻 HUD；modal、popup、drawer、toast 使用独立 DISPLAY_LAYER Work Item 和包，`hostSceneId` 仅用于公开接口与上下文接线，弹窗未完成不阻断宿主场景 V4。
5. 2D/UI 场景必须消费响应式合同与平台目标：按现有项目选择 uGUI CanvasScaler、UI Toolkit PanelSettings 或 Camera 路线，并从唯一入口幂等重排；交互内容保持在安全区，左右或上下边带只接入已登记的纯视觉背景。移动端另处理刘海/挖孔、系统栏、旋转、软键盘和触控手势，Windows 另处理窗口缩放、焦点与键鼠/手柄切换。程序化文本同时实现 `en`、`zh-CN`、`ja`、`ru`、`es`，逐语言遵守单行/换行合同并禁止截断。
6. 3D 场景只消费两个 3D Skill 交付且通过独立 QA 的版本化 Prefab；按稳定资源 ID/GUID/地址接线，不在场景或运行时脚本中复制、覆盖或临时修改 Mesh、UV、Material、Texture、LOD、骨骼和材质槽。碰撞、交互挂点或 Animator 接口不满足玩法时，提交可复现需求并退回资产所有者修复。
7. 研发阶段仅在 Editor/EditMode/PlayMode 与 Game View 模拟中验证重开、暂停恢复、参考分辨率、输入映射、资源失败、离线和适用的存档异常；未经明确授权不安装或启动 Standalone/Player、真机或等价设备。
8. 提交变更路径、测试、构建日志、Editor 固定机位截图、正式资源、限制和阻断项；开发者不能完成自己的独立 F2 审查。设备证据只在独立发布 Work Item 获明确授权后产生。

占位资源必须登记替换责任人和最迟质量门。新增或修改的类、函数和实体定义必须添加说明规则、边界或性能取舍的简体中文注释。
