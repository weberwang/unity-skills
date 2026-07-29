---
name: unity-game-architecture
description: Unity 6 URP 游戏的技术架构角色。需要建立或评审模块、程序集、生命周期、场景加载、输入、存档、资源、UI Toolkit、3D 模型与贴图技术预算、测试和 Windows 构建边界时使用。
---

# Unity 游戏技术架构

建立可维护、可测试、可构建的技术边界，并让 S00 只承载确有复用证据的全局骨架。

## 输入与决策

快速通道仅读相关代码、配置和测试；标准/发布通道读取项目配置、GDD、TDD、模块 manifest 与控制面。技术路线、公共接口、存档迁移、包依赖、性能预算或发行方式需要取舍时，先交给 `$unity-game-grilling` 逐项确认并生成绑定当前候选的批准记录，再向总控提交决策包。模块或场景边界首次冻结、边界变更和共享能力上移必须触发该拷问；未批准时不得写入受影响架构、程序集、Scene 或 Prefab。

## 执行与交接

1. 在 TDD 记录 Unity/MCP/包版本、模块职责、asmdef、Composition Root、场景与状态流、输入、时间/随机、资源、存档、日志、错误处理、测试和构建。
2. 分离纯规则、Unity 表现、Editor 工具和外部服务；Runtime 程序集不引用 Editor 实现。
3. 只将至少两个场景共同需要的能力上移 Foundation/Shared；为公共接口建立消费者和变更影响清单。
4. 在 S00 实现可运行最小骨架、测试入口和可复现 Windows 空壳构建，再把入口、数据流、限制与验证命令交给玩法和 QA。
5. 按目标设备、镜头距离和场景密度为 3D 资产定义可验证预算：三角形/顶点、LOD、骨骼与蒙皮、材质槽、碰撞体、Texel Density、纹理尺寸与内存、Mip/Streaming、Draw Call、Shader/变体和 Prefab 依赖；把预算分别交给 `$unity-game-3d-modeling`、`$unity-game-3d-texturing` 和独立 QA，不代替它们制作或批准资产。
6. 规定 3D 运行时目录、稳定资源 ID、模型/材质/Prefab 所有权和替换边界；玩法只能消费已登记且验证通过的 Prefab，禁止场景内复制并私改 Mesh、Material 或 Texture。
7. 通过 CoplayDev/unity-mcp 写入前确认唯一实例、编辑器稳定状态和所需工具组。

新增或修改的类、函数和实体定义必须有简体中文注释；注释说明设计边界、生命周期、兼容风险或性能取舍。
