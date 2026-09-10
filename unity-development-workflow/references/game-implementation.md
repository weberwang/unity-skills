# 游戏实现闭环

## 实施顺序

1. 以最小必要事实冻结需求、公开契约、状态所有权、资源依赖、验收和测试等级。
2. A3 前冻结 Implementation Package。包只包含当前阶段需要的 `SHARED`、`MODULE`、`SCENE`、`DISPLAY_LAYER`、`INTEGRATION` 或 `RELEASE` 单元。
3. `SHARED` 只承载启动、Composition Root、日志、时间/随机、输入抽象、存档接口和测试入口等真正共享能力；没有两个稳定消费者的代码不提前上移。
4. `MODULE` 保持场景无关，纯规则与 Unity 表现分离；Runtime asmdef 不引用 Editor。
5. `SCENE`/`DISPLAY_LAYER` 消费当前 V2/V3，按场景结构实现；跨场景导航、Build Settings、Addressables 全局配置和共享存档迁移留给 `INTEGRATION`。
6. 实施后审计实际 diff，确认 `.meta` 配对、文件/对象所有权和计划一致；推荐并自动执行适用测试。
7. 失败只按证据 `repair`、`revalidate` 或最小范围 `return`，不得自动回滚共享工作区。

## Unity 完成事实

代码编译、域重载稳定、Console 无新增错误、相关 EditMode/PlayMode 通过、Scene/Prefab/ScriptableObject 可保存重载、GUID/Importer/地址有效，且当前阶段验收关闭。构建成功只能证明构建，不自动证明玩法、视觉、性能、设备或发布通过。

正式可见资源必须经过 V3；玩法可在资源生产期间实现纯规则，但不得把未验收占位物接成最终运行入口。占位物必须有所有者和清理门，并在 V4 前删除。
