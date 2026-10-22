# 游戏实现闭环

## 实施顺序

1. 以最小必要事实冻结需求、公开契约、状态所有权、资源依赖、验收和测试等级。
2. A3 前冻结 Implementation Package。包只包含当前阶段需要的 `SHARED`、`MODULE`、`SCENE`、`DISPLAY_LAYER`、`INTEGRATION` 或 `RELEASE` 单元；每个单元的非空 `acceptanceCommands`、业务身份、顺序与停止条件在冻结时确定。
3. `SHARED` 只承载启动、Composition Root、日志、时间/随机、输入抽象、存档接口、公共安全区和测试入口等真正共享能力；安全区由 HUD/页面与独立显示层共同消费。其他没有两个稳定消费者的代码不提前上移。
4. `MODULE` 保持场景无关，纯规则与 Unity 表现分离；Runtime asmdef 不引用 Editor。
5. `SCENE`/`DISPLAY_LAYER` 在 V2 分别确认拆解与布局图，V3 生产、导入并验收正式资源，可生产资源级 Prefab、做临时组合预览；正式宿主 Scene/场景装配 Prefab/UI 接入和布局校准安排在 V4。跨场景导航、Build Settings、Addressables 全局配置和共享存档迁移留给 `INTEGRATION`。
6. 进入 `IMPLEMENTING` 时由控制面在实际 `evidenceRoot` 创建 `execution-state.json`。各单元实际结果绑定 Work、实施包、`moduleId`/`scopeId`/`sceneId`/`layer`/`host`、计划顺序和验收命令；真实 `files` 及命令 `outputFile` 限定在 `evidenceRoot`。`unit-check --result <json>` 只核对结果与顺序，不运行命令、不改写实施包中的 `unit.status`；进入 `VALIDATING` 时重新校验 `execution-state.units` 中全部单元。
7. 实施后审计实际 diff，确认 `.meta` 配对、文件/对象所有权和计划一致；推荐并自动执行适用测试。
7. 失败只按证据 `repair`、`revalidate` 或最小范围 `return`，不得自动回滚共享工作区。

## Unity 完成事实

玩家可见的 uGUI/TMP、UI Toolkit 文本及奖励反馈按[游戏内文案](game-copy.md)消费当前确认的可见表达、状态、本地化键和真实数据，V3 资源预览与 V4 正式组合/运行保持同一来源。图标、数字与符号优先，必要语义完整；不得把 GDD/brief 的规则说明、设计理由或验收字段直接绑定到画面。

场景和显示层沿用 V2 的[文本与色彩拆分路线](visual-decomposition-routes.md)，按独立编号接入系统文本、原生填充与图片部件；原功能组件统一管理热区、显隐、本地化、进度和状态。实际 renderer 必须保留已确认效果，不以默认字体或纯色近似静默替换，文字、填充与装饰共用实际布局和裁切边界。

公共资源按[登记与使用](shared-asset-usage.md)从总表绑定实际身份，装配合同同步 `resourceId`、路径/GUID 与消费节点。共享字体、贴图和材质保留单一来源，本地状态作用于本地实例；新增、移除或替换引用时同步消费关系，公共源变化由所有者更新并重验实际受影响组合。

代码编译、域重载稳定、Console 无新增错误、相关 EditMode/PlayMode 通过、Scene/Prefab/ScriptableObject 可保存重载、GUID/Importer/地址有效，且当前阶段验收关闭。构建成功只能证明构建，不自动证明玩法、视觉、性能、设备或发布通过。

正式可见资源必须经过 V3 资源生产、导入和验收；玩法可在资源生产期间实现纯规则，但不得把未验收占位物接成最终运行入口。正式宿主 Scene/场景装配 Prefab/UI 实现与布局校准在 V4，资产自身的资源级 Prefab 可在 V3 生产与验证。占位物必须有所有者和清理门，并在 V4 前删除。
