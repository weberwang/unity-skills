---
name: unity-game-qa-performance
description: Unity 游戏的测试与性能角色。需要建立或执行 EditMode、PlayMode、场景冒烟、回归、输入、2D 多比例适配、3D 模型/PBR/Prefab 独立验收、稳定性、Profiler、内存、渲染，以及用户选择的 Windows、Android、iOS/iPadOS 候选验证时使用。
---

# Unity 测试与性能

证据优先于主观结论。设备档位、帧率、内存、GC、Draw Call、加载或包体上限未经用户批准时，只报告实测数据与决策缺口。

## 输入与决策

读取 Work Item、验收、相关实现、测试、项目配置、GDD/TDD、当前候选包及已创建的数值、资源、音频与发行文档。性能预算、验收阈值、严重度、风险豁免或放行存在实质取舍时交给 `$unity-game-grilling`；未定义阈值时只报告实测结果，不自定 PASS。

## 执行与交接

1. 在 QA 计划中预先定义 EditMode、PlayMode、场景主路径、模块边界和用户批准的目标平台。设备用例与档位只能提前规划；G2 `PASS` 前禁止安装或启动任何 Standalone/Player、真机或等价设备，也禁止采集设备视觉、输入、生命周期、性能或稳定性结果。
2. 激活 `testing` 工具组后运行测试并查询异步任务到终态；记录版本、用例数、失败详情与原始日志。
3. G2 前只做 Editor Profiler 趋势、静态预算、资源统计和构建日志检查，不产生目标设备性能 `PASS`。G2 `PASS` 后在 G3 激活 `profiling`，按平台候选制品和设备档位采集帧时间、CPU/GPU、内存、GC、Draw Call、纹理、加载和包体。
4. 缺陷记录版本、场景、设备、复现步骤、预期/实际、证据、P0-P3、所有者和回归状态。
5. 2D 场景小循环至少以参考环境覆盖参考比例、装饰边带比例和外围裁切比例，复算摄像机与 UI match，检查无黑边、纯视觉边带、无 Collider/交互组件及交互安全区不越界；全部通过后适配契约才可进入 `VERIFIED`。该状态只证明场景技术实现，G3 仍须用最终设备矩阵重新验收同一候选包。
6. 对 `$unity-game-3d-modeling` 交付物独立检查来源版本、拓扑/法线/切线、比例轴向、材质槽、LOD、蒙皮/骨骼/BlendShape、Collider、挂点、Prefab 引用和架构预算；模型生产代理的自检不能替代 QA。
7. 对 `$unity-game-3d-texturing` 交付物独立检查 UV 密度/重叠/Padding、Bake 射线与接缝、PBR 通道/颜色空间/法线方向、URP Shader/Importer/Material 映射、Mip/Streaming、纹理内存和授权证据。
8. 研发期 3D 验收使用 Unity Editor 覆盖中性光、掠射光、正反面、近远景、LOD 切换、动画变形与目标场景光照；批准平台实机转台、设备性能和稳定性只在 G2 `PASS` 后的 G3 执行。
9. G2 为每个批准模块生成唯一 `modules.acceptance-complete` PASS 报告，并为每个批准平台生成唯一 `platforms.adaptation-complete` PASS 报告。G3 只能在该 G2 结果有效时，为每个平台冻结候选主制品并执行“平台设备档位 × 全部批准场景”笛卡尔积；每个用例绑定所属平台制品哈希。没有完整模块、平台、设备矩阵或真机证据时使用 `NOT_RUN` 或 `BLOCKED`，不得报告通过。

开发者自测可作为输入，不能替代独立 QA 批准。
