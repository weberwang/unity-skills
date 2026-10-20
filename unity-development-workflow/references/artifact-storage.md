# 产物存放与证据边界

在生成、导出、确认、接入或清理项目产物前读取。下列路径相对于 Unity 项目根目录；只按需创建目录。目录位置说明用途，不代替人工确认、批准状态或质量门。已有冻结的 Work Item、确认记录和文件路径继续有效，不为采用本规范批量搬迁或改写引用。

## 唯一目录映射

项目文档统一使用小写 `docs/`，禁止另建大小写不同的 `Docs/`。现有项目若已经有不同的文档根目录，应在 TDD 明确唯一映射，并在后续文档与实施包中沿用；不得同时新建第二份。制作源文件使用 `ArtSource/`，正式导入 Unity 的资源使用 `Assets/`，机器记录使用 `.workflow-control/` 实际路径。

| 类别 | 默认目录 | 内容与边界 |
| --- | --- | --- |
| 临时中间文件 | `Artifacts/intermediate/<workItemId>/<stageId>/<candidateId>/` | 可再生成的下载暂存、转换缓存、抽帧工作文件、失败导出和调试记录；不得把仍被有效引用的唯一输入只留在此处 |
| 未送审候选 | `Artifacts/candidates/<workItemId>/<stageId>/<candidateId>/` | 本地探索图、动画、音频与布局草稿；尚未确认，不可作为正式资源或下游实施输入 |
| 人工审阅产物 | `Artifacts/reviews/<workItemId>/<stageId>/<candidateId>/` | 人工查看的审阅页、比较图、候选图及其所需样式/数据；记录真实审阅状态 |
| 人工验证产物 | `Artifacts/validation/<workItemId>/<stageId>/<runId>/` | 截图、录屏、测试日志、Profiler 报告和人工验收记录；失败证据也保留到结论可追溯 |
| 已确认的非运行成果 | `docs/confirmed/<owner>/<artifactId>/<version>/` | 已确认目标图、视觉基线、拆解图、布局包和设计预览；不参与游戏运行，也不建立第二份确认账本 |
| 生产源文件 | `ArtSource/<owner>/<assetId>/<version>/` | 用户原始输入、可编辑的分层图/模型/动画、原始音频和必要的再生产输入 |
| 正式视觉资源 | `Assets/Art/Runtime/<module-or-scene>/` | 已验收并由资源清单采用的模型、贴图、材质、动画、图集与其他运行资源；按需划分类型和唯一所有者 |
| 正式音频资源 | `Assets/Audio/<purpose>/` | 已验收、授权并由音频计划采用的音乐、音效、语音与 Mixer 配置 |
| 项目权威文档 | `docs/` | GDD、TDD、视觉与布局合同、资源/许可清单、测试策略和发布说明；权威正文使用固定文件名，不复制到确认成果目录 |
| 工作流机器记录 | `.workflow-control/` | Work Item、Implementation Package、执行状态、结果、确认及机器证据；路径必须来自当前工具的实际输出 |
| 可再生成构建输出 | `Artifacts/build/<platform>/<buildId>/` | 按 TDD 的构建输出映射保存候选包和构建日志；如 Unity/平台工具要求其他目录，记录实际唯一路径并按其忽略策略处理 |

`Artifacts/reviews/` 与 `Artifacts/validation/` 是人工可读审阅/验证产物，不是控制工具的 `evidenceRoot`。控制面为每个 Work Item 指定的实际 `evidenceRoot` 才是机器证据根；不要根据 `.workflow-control/` 目录名推测、重排或新建证据目录。

Evidence Manifest 的文件清单及其他受限字段（例如 `files`、命令 `outputFile`）只能引用当前 Work Item 实际 `evidenceRoot` 内的文件。`docs/confirmed/`、`ArtSource/`、`Artifacts/reviews/`、`Artifacts/validation/` 等外部位置，仅在业务合同或 Schema 明确允许外部引用时才可由相应字段引用；不得把人工审阅目录填成机器证据根。

## 从候选到确认和接入

1. 开始生产前，在 TDD 与当前实施包中固定临时文件、候选、源文件、人工审阅、确认成果、正式资源和机器证据的位置及所有者。工具固定输出目录时先按原接口产出，再按本规则保存候选与其真实依赖。
2. 向用户展示候选，或将其写入合同、清单、决定记录、确认回执之前，将候选和完整必要依赖保存到 `Artifacts/reviews/` 或对应的保留目录。布局图、节点数据、HTML/CSS、生成记录、原始媒体等作为一个可复核引用集合保留；只有路径字符串不足以作为证据。
3. 用户确认且工程检查满足后，设计类非运行成果归档到 `docs/confirmed/`，制作源文件与再生产输入归档到 `ArtSource/`，正式运行资源按实际资产类型进入 `Assets/`。目录变化不增加确认门；复制文件或改目录名不能代替用户确认与控制面记录。
4. 确认成果与正式资源使用独立版本目录，不覆盖现有成果。已冻结路径以及已被确认记录或有效证据引用的文件保持原样；新产物使用当前约定路径。不得为目录整洁批量迁移文件或自动改写历史引用。
5. 运行代码只从登记的正式 `Assets/` 路径消费资源，不从 `Artifacts/`、`docs/confirmed/` 或 `ArtSource/` 加载。候选复制到正式目录不代表验收通过；压缩、切片、重命名或重新导入后的实际文件仍需补做受影响的检查和适用的人工验收。
6. 汇总时逐项核对资源清单无临时路径、同批依赖可读取、许可来源齐备、发布包未误包含审阅产物；清理只处理当前任务中无有效引用且可再生成的临时文件，不删除其他任务或历史证据。

## Git 与文件保留

阶段验收后的提交范围、递归媒体引用检查、精确忽略/放行和暂存审查以[最小 Git 提交集](../../unity-game-workflow-control/references/minimal-git.md)为准。有效记录引用的图像、视频、布局包、审阅页、日志和源输入按文件依赖逐层纳入；不能只提交引用 JSON，也不能因为文件位于临时/审阅目录就删除实际需要的媒体。默认忽略只影响 Git 跟踪，不代表文件可以删除。
