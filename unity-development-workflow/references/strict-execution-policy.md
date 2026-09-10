# 执行策略

## 执行优先

入口、关键调用链、范围、基线、主要风险和验收目标明确，且无实质冲突时停止探索。A3 前冻结 Implementation Package，然后实施、审计差异、推荐并自动执行适用测试，再按证据修复。

缺少非关键元数据时原地补齐；只有身份、所有权、关键产物、安全边界、用户实质取舍或带副作用操作批准缺失时才阻断受影响工作。无依赖工作继续推进。

## Unity 写入协议

写入前：

1. 发现并按项目路径绑定唯一 Unity Editor 实例。
2. 确认 Editor 未播放、未编译、未导入、未进入域重载，且目标 Scene 已保存。
3. 校验 Work Item、Implementation Package、基线、允许路径、Unity 对象所有权和单写者。
4. 读取目标对象、资源 GUID、Importer、Scene/Prefab 基线与 Console。

写入后：

1. 等待 AssetDatabase 刷新、编译、域重载和导入结束。
2. 保存并复读 Scene/Prefab/ScriptableObject/UXML，核对 GUID、序列化引用、Importer 与实际差异。
3. 读取 Console，执行与改动直接相关的 EditMode/PlayMode/结构/构建验证并保存原始结果。
4. 后置校验失败时停止后续写入，选择 `repair` 或 `revalidate`，不得把 MCP 调用成功写成 PASS。

## 禁止自动执行

未经精确授权不得启动真机或 Standalone/Player、调用付费供应商、上传用户资产、签名、发布、覆盖稳定制品、删除外部数据或进行破坏性迁移。设备与发布检查在证据中保留 `NOT_RUN`，不得伪造成通过。

## 共享工作区

不覆盖或回滚他人修改。`Assets` 文件与 `.meta` 归同一所有者；`ProjectSettings`、`Packages`、Build Settings、Addressables 全局配置和集成入口串行。发现所有权重叠、基线漂移或无法分离的同文件修改时停止对应单元并报告。
