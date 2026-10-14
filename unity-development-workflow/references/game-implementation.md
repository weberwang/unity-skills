# 游戏实现闭环

## 实施顺序

1. 以最小必要事实冻结需求、公开契约、状态所有权、资源依赖、验收和测试等级。
2. A3 前冻结 Implementation Package。包只包含当前阶段需要的 `SHARED`、`MODULE`、`SCENE`、`DISPLAY_LAYER`、`INTEGRATION` 或 `RELEASE` 单元。
3. `SHARED` 只承载启动、Composition Root、日志、时间/随机、输入抽象、存档接口、公共安全区和测试入口等真正共享能力；安全区由 HUD/页面与独立显示层共同消费。其他没有两个稳定消费者的代码不提前上移。
4. `MODULE` 保持场景无关，纯规则与 Unity 表现分离；Runtime asmdef 不引用 Editor。
5. `SCENE`/`DISPLAY_LAYER` 消费当前 V2/V3，按场景结构实现；跨场景导航、Build Settings、Addressables 全局配置和共享存档迁移留给 `INTEGRATION`。
6. 实施后审计实际 diff，确认 `.meta` 配对、文件/对象所有权和计划一致；推荐并自动执行适用测试。
7. 失败只按证据 `repair`、`revalidate` 或最小范围 `return`，不得自动回滚共享工作区。

## Unity 完成事实

玩家可见的 uGUI/TMP、UI Toolkit 文本及奖励反馈按[游戏内文案](game-copy.md)消费当前确认的可见表达、状态、本地化键和真实数据，V3 组合与 V4 运行保持同一来源。图标、数字与符号优先，必要语义完整；不得把 GDD/brief 的规则说明、设计理由或验收字段直接绑定到画面。

场景和显示层沿用 V2 的[文本与色彩拆分路线](visual-decomposition-routes.md)，按独立编号接入系统文本、原生填充与图片部件；原功能组件统一管理热区、显隐、本地化、进度和状态。实际 renderer 必须保留已确认效果，不以默认字体或纯色近似静默替换，文字、填充与装饰共用实际布局和裁切边界。

公共资源按[登记与使用](shared-asset-usage.md)从总表绑定实际身份，装配合同同步 `resourceId`、路径/GUID 与消费节点。共享字体、贴图和材质保留单一来源，本地状态作用于本地实例；新增、移除或替换引用时同步消费关系，公共源变化由所有者更新并重验实际受影响组合。

代码编译、域重载稳定、Console 无新增错误、相关 EditMode/PlayMode 通过、Scene/Prefab/ScriptableObject 可保存重载、GUID/Importer/地址有效，且当前阶段验收关闭。构建成功只能证明构建，不自动证明玩法、视觉、性能、设备或发布通过。

正式可见资源必须经过 V3；玩法可在资源生产期间实现纯规则，但不得把未验收占位物接成最终运行入口。占位物必须有所有者和清理门，并在 V4 前删除。
