# Unity 项目结构约束

首次建立工程、规划模块或新增目录时读取。采用“资源按类型、代码按职责与功能模块”的默认方案，与本仓库模板中的 `Assets/Scripts/Foundation`、`Assets/Art/Runtime` 等路径一致。Unity 没有唯一官方目录树；以下是项目默认约束，特殊目录、程序集与资源 GUID 则必须遵循 Unity 原生规则。

## 项目根目录

```text
项目根目录/
├── Assets/                   Unity 管理的代码与资源
├── Packages/                 包清单、锁文件和嵌入式包
├── ProjectSettings/          项目设置
├── Docs/                     GDD、TDD 与项目说明
├── ArtSource/                不直接导入 Unity 的制作源文件与生成源图
├── .workflow-control/        工作项、实施包与证据索引
└── Artifacts/                可再生成的构建、测试与取证产物
```

- 版本控制必须包含 `Assets/` 及其 `.meta`、`ProjectSettings/`、`Packages/manifest.json`、`Packages/packages-lock.json` 和自有嵌入式包源码；工程文档与控制记录一并维护。
- 忽略 `Library/`、`Temp/`、`Obj/`、`Logs/`、`UserSettings/`、IDE 缓存和可再生成的 `Artifacts/`。证据索引保留产物位置与摘要，需要长期保留的产物进入约定的归档位置。
- `ArtSource/` 存放 PSD、Blend 等不需要 Unity 直接导入的制作源文件，`ArtSource/Generated/` 存放生成源图；需要直接导入的文件按资产合同进入 `Assets/`。大型二进制源文件和正式资源按团队仓库策略使用 Git LFS。
- 不提前创建未使用的目录；不得将生成报告、构建包或工作流 JSON 放入 `Assets/` 触发无关导入。

## Assets 默认布局

```text
Assets/
├── Scripts/
│   ├── Foundation/           启动、场景加载及基础服务
│   ├── Shared/               已证实跨模块复用的能力
│   ├── Gameplay/<模块>/     玩家、战斗、背包等玩法
│   └── Presentation/<模块>/ 镜头、界面控制与表现适配
├── Scenes/                  入口、菜单和各场景资产
├── Prefabs/
│   ├── Shared/              可复用基础 Prefab
│   └── Scenes/<场景ID>/     场景专属组合
├── UI/<界面ID>/             UXML、USS 与界面配置
├── Art/
│   ├── Runtime/             正式模型、贴图、材质、动画与视觉资源
│   ├── Library/             可复用候选资源；不作为正式资源的隐式来源
│   └── References/          视觉参考；禁止被运行时资源引用
├── Audio/<用途>/            音效、音乐与 Mixer
├── Settings/<领域>/         渲染、输入、配置与构建设置资产
├── Editor/<模块>/           Editor 工具及其程序集
├── Tests/
│   ├── EditMode/            编辑器测试程序集
│   └── PlayMode/            运行行为测试程序集
├── Generated/               可重建的生成代码与资源
└── ThirdParty/<供应商>/     无法通过 UPM 管理的第三方内容
```

- 模块资源按稳定模块、场景或界面 ID 分组，正式模型、材质、纹理等可在 `Art/Runtime/` 下按资产类型细分；每个目录和共享资源必须有唯一所有者。
- 同一职责只能有一个代码入口目录；禁止同时建立 `Scripts/Player`、`Gameplay/Player`、`Features/Player` 等重复组织体系。禁止无边界的 `Common`、`Utils`、`Managers` 聚合目录。
- 文件与目录使用有业务含义的英文名称，普通目录默认 PascalCase；程序集、包名和第三方目录遵循各自命名规则。脚本文件名与主要类型名一致，命名空间对应代码职责与模块，例如 `<项目>.Gameplay.Player`。
- 优先通过 UPM 引入依赖；不得同时在 `Packages/` 与 `Assets/ThirdParty/` 放置同一库，也不得直接修改包缓存。第三方源码改动必须记录来源、版本和维护归属。
- `Generated/` 必须记录生成器、输入和重建命令，禁止手工修改生成产物；是否提交产物由可复现性决定，不能仅因目录名称而忽略必要构建输入。
- `Assets/Generated/` 是 Unity 导入产物目录，与 `ArtSource/Generated/` 的制作源图、`Artifacts/` 的报告分开；正式视觉资源仍进入 `Assets/Art/Runtime/`。字体等已有专用生成目录可在 TDD 登记，不再复制到通用 Generated。
- Content、QA、Delivery 等是职责分类，不强制各自建立顶层目录；分别映射到实际资源、测试与交付位置。`Assets/Settings/` 只放配置资产，不能替代根目录 `ProjectSettings/` 或 `Packages/`。
- 若项目已明确使用 `_Project/` 或按功能聚合资源的结构，在 TDD 记录唯一目录映射，模板中的目标路径也必须同步映射；不得再创建第二套目录树。这仅是路径组织决策，不保留重复旧入口。

## 程序集与依赖

- 以可独立编译和测试的模块建立 asmdef，不按每个子目录机械创建程序集；目录不能代替程序集边界。程序集依赖必须无环，TDD 记录名称、路径、平台和公开接口。
- 默认依赖方向为 `Presentation → Gameplay → Foundation`；表现层可直接使用 Foundation。Shared 只依赖 Foundation 或独立基础合同，不反向依赖具体玩法与表现。确有至少两个消费者时才提取共享实现，禁止提前堆积全局骨架。
- 玩法规则不引用 UI、场景专属表现或 `UnityEditor`；外部服务通过接口隔离。纯规则在有独立测试收益时拆成不依赖 UnityEngine 的程序集。
- Editor 程序集显式限制为 Editor 平台，可引用 Runtime；Runtime 禁止引用 Editor 或测试程序集。在上级 asmdef 覆盖范围内，不能只依靠 `Editor/` 文件夹名称，必须设置独立 Editor asmdef 或有效 asmref。
- EditMode、PlayMode 分别建立 Test Assemblies，按测试类型设置平台与引用，确保测试及 NUnit 依赖不进入正常 Player 构建；不能仅靠 `Tests/` 名称实现隔离。

## Unity 特殊目录与资源归属

- `Resources/` 仅用于已记录的运行时加载需求，不作为通用资产库；优先序列化引用，需要动态寻址时按项目规模选择资源方案，不自动引入 Addressables。
- `StreamingAssets/` 必须位于 `Assets/StreamingAssets/`，仅用于运行时需要原样提供的文件；记录平台读取方式与构建体积，不放制作源文件或秘密凭据。
- `Plugins/` 按原生插件导入规则使用；`Gizmos/`、`Editor Default Resources/` 仅在有对应编辑器用途时创建，并遵守 Unity 的根路径要求。
- 资源与 `.meta` 为一个所有权单元，移动、重命名通过 AssetDatabase 执行并复读 GUID 与引用；禁止复制 `.meta` 制造 GUID 冲突。
- 复用对象使用 Prefab、Variant 或配置资产，场景只持有实例和本场景组合；禁止复制后私改共享 Mesh、Material、Texture。

## 场景与运行时结构

- 场景按生命周期划分。多场景项目采用启动入口、常驻服务和菜单/关卡分离，常驻服务配合 Additive 加载内容场景；单场景原型无需建立空的常驻场景。
- 场景内部按需使用 `Systems`、`Environment`、`Gameplay`、`Presentation`、`UI`、`Runtime` 分组。纯整理节点保持默认 Transform；UI 父子关系仍遵守[节点树与布局约束](ui-layout-and-hierarchy.md)，不能为了套目录树改变布局依赖。
- 场景加载入口负责初始化顺序、激活场景、动态对象归属与卸载清理。常驻服务只初始化一次，禁止每个关卡重复创建全局单例或滥用 `DontDestroyOnLoad`。
- 每个活动显示/输入上下文明确 Camera、AudioListener、EventSystem 或 UI Toolkit 输入路由的唯一负责人；分屏等多上下文需求必须在 TDD 单独定义。
- 跨场景对象通过注册、接口或加载入口注入，卸载时解除订阅与引用；持久数据不持有将被卸载的场景对象。瞬态弹窗继续使用独立 `DISPLAY_LAYER` 所有权。

## 实施与验收

基础工程阶段在 TDD 固定目录映射、模块与程序集依赖、场景生命周期及资源所有者；模块 manifest 和 Implementation Package 使用同一组实际路径。局部任务只检查受影响范围，不擅自搬迁整个现有项目。

交付时检查：新增文件归属明确、无重复目录体系、Runtime/Editor/Tests 隔离正确、资源与 `.meta` 配对、无 GUID 冲突或缺失引用、正式资源不引用参考资产、场景卸载能清理动态对象。目录规则属于文档合同，现有工具不因新增本规范而自动具备全部检查能力；没有执行 Unity 编译、测试或引用回读时不得报告工程验收通过。

## 依据

- [Unity 项目组织建议](https://unity.com/how-to/organizing-your-project)：项目可选择目录方案，关键是保持明确、一致的组织规范。
- [Unity 默认目录](https://docs.unity.com/en-us/engine/6000.6/manual/get-started/project-configuration/default-directories)与[特殊目录规则](https://docs.unity.com/en-us/engine/6000.0/manual/get-started/project-configuration/special-folders)：区分项目约定与引擎语义。
- [Unity 多场景管理](https://docs.unity.com/en-us/engine/6000.3/manual/working-with-scenes/multi-scene-editing/setupmultiplescenes)：支持常驻与内容场景分开加载。
