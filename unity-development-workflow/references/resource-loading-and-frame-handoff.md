# 资源加载与序列帧交接

在 V3 正式资源导入交接、V4 消费者接入或资源路径/动画变更时读取。沿用资源总表、Implementation Package 和 Evidence Manifest，不新增阶段、确认账本或动画生产岗位。

## 加载方式与实际路径

`docs/asset-register.yaml` 仍是唯一总表。正式 `IMPORTED`/`VALIDATED` 条目在 `loading` 声明实际方式；一般 `address` 继续表示项目定位约定，不能证明动态加载已配置。

| loading.mode | 声明与实际核对 |
| --- | --- |
| SERIALIZED | 使用序列化引用，不声明 key，资源不能因方便被放入 Resources。具体消费者引用仍按装配合同回读。 |
| RESOURCES | 仅显式动态加载需求采用；声明无扩展名的相对 key，实际路径必须位于唯一 Resources 目录下，项目内同 key 主资源只能有一个。 |
| ADDRESSABLES | 声明显式 key，读取项目现有 Addressables entry 的地址和分组；没有包、配置或 entry 时不得认定通过，不自动安装或配置。 |

移动、重命名、改加载方式后由资源所有者经 AssetDatabase 操作，保留真实 GUID，并同步总表、动态 key 和全部消费合同；不只更新文档中的路径。检查器只读，不自动搬目录。嵌套 Resources 与跨目录重名须先修复。

总表仍可按 YAML 维护；文件 CLI 只读取 JSON。使用现有项目工具导出总表当前内容的 JSON 执行快照，或以 JSON 语法维护该 YAML 文件；快照不得作为另一份长期总表，不手抄部分字段替代当前来源。

## 序列帧合同

视觉资产生产者交付[序列帧合同模板](../templates/frame-animation-handoff.json)，按实际动作独立声明 FPS、时长、循环、帧序与停留时间，不要求动作等长。每个实际关键帧记录时间、正式路径、GUID、字符串 localId、归一化 Pivot 和 PPU。同图集多个 Sprite 共用 GUID，必须同时使用 localId，不能只凭文件名或 GUID 判断帧身份。

模板中的路径、GUID 和 localId 均为格式示例，必须替换为当前正式资源的实际身份，不可作为验收事实。

Pivot 使用 `Sprite.pivot / Sprite.rect.size` 的比例，允许画外枢轴；不将源像素 Pivot 与归一化坐标混用。时间严格递增，首帧为零，关键帧在声明的 FPS 网格内且不超过实际 Clip 时长；合法停帧不自动补图或改速。

合同绑定正式独立 `.anim` 主资产的路径/GUID/localId、`m_Sprite` 曲线的 bindingPath 与 SpriteRenderer/Image 类型，以及真实 Prefab 上的 Animator/Animation 消费入口。帧率和时长必须为正值；不遍历任意自定义资产容器加载 Clip 子资产。可选 SpriteAtlas 核对实际身份和每帧 CanBindTo；这只能证明可绑定成员，不表示平台图集打包或播放表现已验收。工具不接管抽帧、动画制作，也不扩展 2D 骨骼 TA 的岗位职责。

消费类型必须匹配：Animation 使用 Legacy Clip，Animator 使用非 Legacy Clip。检查器直接读取 Prefab 资产层级，不实例化 Prefab 内容，以免触发用户脚本的编辑器生命周期；实际播放仍在既有 V4 验收中验证。

## 真实读回与同源校验

按[读回请求模板](../templates/resource-handoff-inspection.json)填入本次总表正式条目和动画，编译后调用 Toolkit：

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs compile-json --project-root . --kind resource-handoff-inspection --source docs/resource-inspection.json --output Artifacts/Jobs/resource-inspection-1.json
unity command uwt_inspect_resource_handoff --caller plugin --skill unity-cli --project-path <当前工程> --job_path Artifacts/Jobs/resource-inspection-1.json
```

执行前检查可复用 Editor，使用实际目标工程。通用编译命令只封装 JSON；请求字段按[Schema](../schemas/resource-handoff-inspection.schema.json)准备，实际事实由 Editor 读取。报告输出使用当前工作项 evidenceRoot 下的新文件名，禁止覆盖已有报告。

采集器从 AssetDatabase 读取实际路径/GUID、项目全局 Resources 同 key 主资产、已有 Addressables 配置、Clip 的帧率/时长/循环和指定 Sprite 曲线、每帧 Sprite 身份/Pivot/PPU，以及 Prefab 实际引用与绑定。缺失资产、空曲线、未接入 Clip 或绑定不成立时不得当作有效交接；不能把预期数据复制成读回报告。

```powershell
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs resource-loading-check --project-root . --register Artifacts/Jobs/asset-register-current.json --source .workflow-control/evidence/WI-ASSET/resource-readback-1.json
node .\.agents\skills\unity-development-workflow\scripts\workflow-files.mjs frame-animation-check --project-root . --plan docs/frame-animation.json --source .workflow-control/evidence/WI-ASSET/resource-readback-1.json
```

文件工具和控制面调用相同纯函数，核对完整覆盖、来源元数据、实际身份与加载键、Clip 与消费者。报告 `FAIL`、缺失、未知或重复条目均不能被静态 `PASS` 覆盖。数值误差仅处理实际 float 序列化，不是视觉容差。

## 融入现有交接

涉及本项交接的实施包绑定：

```json
{
  "resourceHandoff": {
    "assetRegisterRef": {"path": "Artifacts/Jobs/asset-register-current.json"},
    "frameAnimationPlanRef": {"path": "docs/frame-animation.json"}
  }
}
```

两项按需至少声明一项；没有序列帧的工作不虚构动画合同。进入 VALIDATING/PASSED/INTEGRATING/COMPLETE 时，Evidence Manifest 绑定 `resourceHandoffInspectionRef: {path}`。报告位于当前 evidenceRoot，taskId 对应 Work Item ID，outputPath 与实际引用一致；`inspect/check/status/run` 和直接交付都重读材料与报告。无资源交接的工作项不扩大范围。

V3 核对正式导入与资源事实，V4 再核对正式消费者及运行表现。失败按实际所有权修复并重新读回，不自动退回 V2，不改历史确认，不要求 SHA。工具夹具与工程通过不能替代正式游戏播放、独立 QA 或用户对显示效果的人工验收。
