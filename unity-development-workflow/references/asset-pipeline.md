# Unity 资源管线

在场景 V2 已冻结拆解与生产边界、准备进入 V3 资源生产和组合验收时读取。

## 前置

每个资源项绑定 Work Item、场景/组件/状态、目标节点、来源、许可、规格、目标项目路径和验证方式。存在视觉、授权、外部上传或付费取舍时必须有当前 `USER_DECISION`；普通本地创作和导入不创建多余批准。

## 生产与导入

1. 枚举 V2 全部资源项，确保每项只有一个生产通道和至少一个消费节点。
2. `REUSE` 核对源路径/SHA、Unity GUID、许可、Visual Bible 一致性、Importer 和最近 Unity 验证；失效时返回资源所有者。
3. 独立生产位图、模型、材质、字体、音频或 VFX。禁止从高保真效果图裁切、抠取、放大或轻微修饰成运行资源，禁止整图铺底。
4. 导入前校验唯一 Unity 实例、Editor 稳定、目标路径和单写者；资源与 `.meta` 归同一单元，禁止猜测或手写 GUID。
5. 通过 AssetDatabase/对应 Importer 导入并设置平台参数；移动或重命名资源使用 Unity API，避免引用断裂。
6. 域重载和导入稳定后，复读 GUID、Importer、序列化引用、Addressables/资源登记与 Console；运行最小 EditMode/PlayMode 或隔离 Prefab 验证。
7. 在宿主 Scene/Prefab/UXML 中完成 V3 同屏组合验收；缺项、孤儿资源、占位、旧版本或未验证引用均阻塞。

SpriteAtlas、压缩、MipMap、Read/Write、色彩空间和 Addressables 由 Unity 平台预算决定，不照搬 Web DPR、Canvas 或统一禁止图集规则。
