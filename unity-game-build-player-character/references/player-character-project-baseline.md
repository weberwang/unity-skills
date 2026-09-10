# P3-002 玩家角色项目基线规范

本规范把玩家角色合同与当前 Star Blogger Unity 项目的差异收敛为可复查的机器基线。不得用“看起来差不多”、旧 PASS 摘要、文件数量或单张缩略图代替当前项目基线。

## 何时读取

在任何 P3-002 判断、生产、返修、Unity 覆盖或验收前读取。当前项目、目标板、批准记录、Visual Bible、运行时资源或来源修订发生变化后，重新执行全部对照，不得增量沿用旧结论。

## 输入

- 当前 Unity 项目根目录，且根目录同时包含 `Assets/`、`Packages/manifest.json` 和 `ProjectSettings/ProjectVersion.txt`。
- `player-character-contract.md` 中的权威文件、17 项类别/标签/文件名和稳定运行时路径。
- 当前 17 张运行时 PNG 及 `.meta`、SpriteLibrary、SpriteAtlas、PlayerCharacter Prefab、DualCharacterPerformance Prefab。
- 当前候选的 neutral 全组合、表情/状态组合和原生比例局部证据。

## 执行步骤

1. 规范化项目根目录，记录 Git `sourceRevision` 和工作区状态摘要；项目根目录不唯一、来源修订未知或根标记缺失时停止。
2. 从真实文件重新计算 SHA-256，不复制历史摘要中的哈希。目标板必须与人物合同固定哈希一致，批准记录必须绑定该目标内容。
3. 逐项读取 17 张运行时 PNG、对应 `.meta` 和 GUID；再读取 SpriteLibrary、SpriteAtlas、两个 Prefab 的文件、`.meta`、GUID 与引用证据。任何文件缺失、不可读或路径越界均为阻断，不得写成空字符串或“预计存在”。
4. 使用 `templates/player-character-project-baseline.yaml` 生成 `PLAYER_CHARACTER_PROJECT_BASELINE` 记录，并用 `schemas/player-character-project-baseline.schema.json` 校验。记录必须绑定来源修订、项目状态版本、全部权威输入、17 项实际映射、四个 Unity 资产和项目基线检查。
5. 项目检查只使用 `MATCH`、`DIFFERENT`、`MISSING`、`UNREADABLE`。`MATCH` 表示期望与实际均有原始证据且内容一致；`DIFFERENT` 表示差异已定位并可复现；缺证不能降级成 `DIFFERENT`。
6. 视觉对照统一使用 2048×2048 RGBA 坐标空间、鞋底到头顶等高缩放、鞋底基线与脸中心联合对齐、最近邻重采样。禁止逐局部单独缩放、旋转、液化或偏移候选来制造对齐。
7. 固定审查 `full-body`、`face`、`hair`、`shoulders-chest`、`hands`、`waist-hips`、`pants-shoes` 七个区域；每个区域都绑定原生比例 A/B 和轮廓差异证据，并由视觉审阅者写入 `MATCH` 或 `DIFFERENT`。
8. 固定审查 `neutral`、`smile`、`speaking`、`frown`、`blink`、`raised-brows`、`accessories-on`、`accessories-off` 八个状态；不得用 neutral 通过推导其他状态通过。
9. 基线有任一 `MISSING` 或 `UNREADABLE` 时把状态标记为 `PLAYER_CHARACTER_BASELINE_BLOCKED`；不存在阻断项时才标记为 `PLAYER_CHARACTER_BASELINE_AUDITED`。汇总存在可审计差异时写入 `DIFFERENCES_FOUND`，全部一致时写入 `MATCHED`。基线只说明当前状态，不批准生产候选。
10. 每次候选变化后重建完整组合和受影响区域/状态证据。提交完整候选前，让审计脚本重新读取基线中的所有绑定，确认基线未因项目文件变化而失效。

## 子代理角色与并行边界

- 当前项目发现、哈希与 GUID 读取可以只读并行；同一基线记录只允许一个写入者汇总。
- 视觉审阅者必须直接查看原始 A/B 与差异图，不得读取生产者的预期结论后代签。
- Unity 资产读取与候选生产可以分工，但运行时覆盖前必须停止并行写入，重新校验唯一 Unity 实例、锁和基线。

## 所需锁与 Unity 权限

- 建立基线只读，不需要 Unity 写权限。
- 读取序列化引用优先使用稳定状态下由 [@Unity](plugin://unity@openai-curated-remote) 发现的只读 Pipeline 命令；无法按项目路径唯一选择 Editor 时只保留文件级事实，并将 Editor 内引用检查标为 `UNREADABLE`。
- 覆盖运行时 PNG、重导入或修改 SpriteLibrary、Atlas、Prefab 前必须取得对应路径与 AssetDatabase 独占锁，并保存写前基线。

## 机器可读输出

输出一份符合 `schemas/player-character-project-baseline.schema.json` 的 YAML，建议路径为 `Artifacts/Visual/P4/g1-v0.6/p3-002/v5/project-baselines/p3-002-player-character-project-baseline-<revision>.yaml`。所有路径使用项目相对正斜杠格式；每个文件绑定真实 SHA-256，Unity 资源同时绑定 `.meta` 与 32 位小写 GUID。

项目检查 ID 固定为：

- `authority.target-binding`
- `authority.approval-binding`
- `project.unity-root`
- `layers.runtime-set`
- `import.sprite-settings`
- `sprite-library.mapping`
- `sprite-atlas.membership`
- `prefab.references`

## 通过条件

- Schema 校验成功，来源修订、项目状态版本和项目根标记明确。
- 目标、批准、Visual Bible 与生产计划均由真实文件和 SHA-256 绑定。
- 17 项类别、标签、文件名、运行时路径和 GUID 与人物合同逐项对应，无重复、缺失或额外项。
- 七个视觉区域和八个状态全部有当前版本证据与显式结论。
- 汇总结果与逐项状态一致，且审计脚本重新计算所有绑定后未发现漂移。

## 失败与恢复出口

- 权威文件或目标哈希变化：停止生产，返回 `$unity-game-grilling` 重新绑定用户决定。
- 项目根、运行时文件、`.meta`、GUID 或 Unity 引用缺失/不可读：保持 `PLAYER_CHARACTER_BASELINE_BLOCKED`，先恢复项目事实，不生成候选。
- 基线建立后任一绑定内容变化：使基线和所有下游候选审查失效，从项目发现重跑。
- 仅视觉存在可审计差异：保持 `DIFFERENCES_FOUND`，把差异路由到生产母版或责任单图，不修改当前运行时资产。
