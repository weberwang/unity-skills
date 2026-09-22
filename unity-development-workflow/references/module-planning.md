# 模块与阶段任务规划

模块按可独立说明、实现、测试和替换的职责划分，不按文件夹或类名凑组。

## 规划字段

每个模块记录职责、非目标、公开入口、输入/输出、状态与数据所有权、生命周期、失败与降级、资源/平台依赖、允许/禁止依赖、测试边界和消费者。每个阶段任务记录依赖、输入、输出、路径、Unity 对象、执行角色、验收命令与停止条件。

## 单元边界

- `SHARED`：最小共享骨架，强制串行。
- `MODULE`：场景无关能力；只有状态与路径互斥时可并行。
- `SCENE`：单场景 V0-V4 聚合，只拥有玩法、画面和常驻 HUD。
- `DISPLAY_LAYER`：独立 Work Item，负责 modal、popup、drawer、toast 等瞬态层；`hostSceneId` 只绑定运行上下文，不把实现和验收并入宿主场景。
- `INTEGRATION`：跨场景入口、Build Settings、Addressables、共享配置与联合验证，强制串行。
- `RELEASE`：独立 Work Item，处理候选包和获批外部动作。

`ProjectSettings/`、`Packages/`、共享 asmdef、场景列表、输入资产和全局 Addressables 不能分配给并行单元。`Assets` 资源与 `.meta` 必须同属一个单元；Prefab Variant 与基础 Prefab、Scene 与其共享 SubScene/资源的并行修改要显式证明互斥。

视觉拆解 item 和 Prefab/Scene 节点必须绑定 `parentElementId`、`semanticGrouping` 与 `layoutBinding`。父子仅由位置依赖建立；共同信息没有位置依赖时声明同组同级，禁止按距离、bounds 或组件类型推断父级。父级、分组或布局绑定改变时，V2 和所有下游结构/运行证据标记为 `stale`。

## 依赖原则

依赖必须单向；避免无边界 `Common`/`Utils`、全局事件、双向状态写入和绕过公开入口的访问。平台服务通过接口隔离，只有用户选择的平台进入实现与交付范围。
