# Unity 开发工作流实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可安装的 Codex Unity 工作流 Skill 和 Unity Workflow Toolkit UPM 包，通过 `CoplayDev/unity-mcp` 完成模块拆分、子代理调度、全局视觉确认、按场景小循环、自动出图、Unity 验证和 Windows 交付。

**Architecture:** Codex 侧使用 YAML 契约、JSON Schema、文件式 DAG/锁/状态和分层参考文档进行编排；Unity 侧使用独立 Editor-only UPM 包处理图片导入、项目校验、视觉截图和交付预检；MCP 扩展层只把 Toolkit 服务暴露为 `[McpForUnityTool]` 自定义工具。Unity 只消费由 Codex 编译出的 JSON Job，避免在 Editor 内引入 YAML 解析依赖。

**Tech Stack:** Markdown、YAML、JSON Schema 2020-12、Python 3.10+、PyYAML、jsonschema、pytest、Unity 6、C#、Unity Test Framework、URP、`MCPForUnity.Editor`、Newtonsoft `JObject`。

## Global Constraints

- 首版仅支持 Unity 6、URP 和 Windows 桌面端。
- 自动出图默认使用 Codex 内置 ImageGen，不实现第三方生成服务。
- 不修改或复制 `CoplayDev/unity-mcp`；Toolkit 作为依赖它的独立 UPM 包。
- 不附带示例游戏；只提供最小 Unity 测试宿主工程。
- 所有新增类、函数和实体定义必须添加简体中文注释；不直观分支必须说明设计原因或边界。
- 单个实现文件不得超过 1000 行，优先按职责拆分。
- 子代理只能修改任务声明的路径；共享 Unity 状态和正式场景操作必须串行。
- Git 提交和推送统一延后到全部实现与验证完成后，由用户按仓库完成流程选择；任务执行期间不得自行初始化、提交或推送。
- 可安装 Skill 必须位于 `unity-development-workflow/`，且目录名与 frontmatter 的 `name` 完全一致。
- Skill 内不得创建 README；用户说明放在根目录设计文档，操作规则放在 Skill 的 `references/`。
- 当前目录不是 Git 仓库，无法使用 worktree 和 Git diff；执行时使用单实现代理顺序开发、严格路径所有权和任务文件快照审查。

---

## 文件结构

```text
unity-development-workflow/
├─ SKILL.md
├─ agents/openai.yaml
├─ references/
├─ schemas/
├─ templates/
├─ scripts/
└─ assets/
   └─ unity-workflow-toolkit/
      └─ Packages/com.project.unity-workflow-toolkit/
pyproject.toml
docs/
tests/
```

Skill 目录内部展开为：

```text
unity-development-workflow/
├─ SKILL.md
├─ agents/openai.yaml
├─ references/
├─ workflow-overview.md
├─ project-discovery.md
├─ module-planning.md
├─ multi-agent-execution.md
├─ foundation-workflow.md
├─ scene-loop.md
├─ visual-workflow.md
├─ quality-gates.md
└─ delivery.md
schemas/
├─ common.schema.json
├─ project-profile.schema.json
├─ module-manifest.schema.json
├─ task-contract.schema.json
├─ scene-manifest.schema.json
├─ image-task.schema.json
├─ visual-bible.schema.json
├─ quality-report.schema.json
└─ delivery-manifest.schema.json
├─ templates/
├─ project-profile.yaml
├─ module-manifest.yaml
├─ task-contract.yaml
├─ scene-manifest.yaml
├─ image-task.yaml
├─ visual-bible.yaml
└─ quality-gates.yaml
├─ scripts/
├─ workflow.py
└─ unity_workflow/
   ├─ __init__.py
   ├─ contracts.py
   ├─ compiler.py
   ├─ dag.py
   ├─ locks.py
   ├─ state.py
   └─ cli.py
tests/python/
├─ test_contracts.py
├─ test_compiler.py
├─ test_dag.py
├─ test_locks.py
├─ test_state.py
└─ test_cli.py
unity-development-workflow/assets/unity-workflow-toolkit/Packages/com.project.unity-workflow-toolkit/
├─ package.json
├─ README.md
├─ Editor/
│  ├─ Core/
│  ├─ ImagePipeline/
│  ├─ ProjectValidation/
│  ├─ VisualQA/
│  ├─ BuildPipeline/
│  └─ McpTools/
└─ Tests/Editor/
tests/UnityHost/
├─ Assets/.gitkeep
├─ Packages/manifest.json
└─ ProjectSettings/ProjectVersion.txt
```

---

### Task 1：建立 Skill 与 Python 测试骨架

**Files:**
- Create: `unity-development-workflow/SKILL.md`
- Create: `unity-development-workflow/agents/openai.yaml`
- Create: `pyproject.toml`
- Create: `unity-development-workflow/scripts/workflow.py`
- Create: `unity-development-workflow/scripts/unity_workflow/__init__.py`
- Create: `unity-development-workflow/scripts/unity_workflow/cli.py`
- Create: `tests/python/test_cli.py`

**Interfaces:**
- Produces: `python unity-development-workflow/scripts/workflow.py --help`
- Produces: `unity-workflow` Python console script
- Consumes: 后续任务提供的 `validate`、`compile`、`ready`、`lock`、`transition` 子命令。

- [ ] **Step 1: 编写失败测试**

```python
from unity_workflow.cli import build_parser


def test_cli_exposes_required_commands():
    parser = build_parser()
    help_text = parser.format_help()
    for command in ("validate", "compile", "ready", "lock", "transition"):
        assert command in help_text
```

- [ ] **Step 2: 验证测试先失败**

Run: `uv run --with pytest pytest tests/python/test_cli.py -q`

Expected: FAIL，原因是 `unity_workflow.cli` 或 `build_parser` 尚不存在。

- [ ] **Step 3: 实现最小 CLI 骨架**

`build_parser() -> argparse.ArgumentParser` 创建五个子命令；每个子命令绑定独立处理函数。`main(argv: Sequence[str] | None = None) -> int` 返回退出码，`scripts/workflow.py` 只调用 `main()`。

`pyproject.toml` 声明 Python `>=3.10`、运行依赖 `PyYAML` 与 `jsonschema`、开发依赖 `pytest`，并把 `unity-development-workflow/scripts` 配置为包搜索根。

- [ ] **Step 4: 写入 Skill 入口最小结构**

先运行 Skill Creator 的 `init_skill.py unity-development-workflow --path D:\Git\unity-skills --resources scripts,references,assets`，并传入 `display_name`、`short_description`、`default_prompt`。随后编辑生成结果。`SKILL.md` frontmatter 只包含 `name` 和 `description`，名称使用 `unity-development-workflow`；正文只保留总阶段、强制门禁、参考文档路由和 CLI 命令索引，详细规则下沉到 `references/`。

- [ ] **Step 5: 运行测试**

Run: `uv run pytest tests/python/test_cli.py -q`

Expected: PASS。

---

### Task 2：实现契约 Schema、模板与校验器

本任务中所有 `schemas/`、`templates/`、`scripts/` 路径均相对于 `unity-development-workflow/`；`tests/python/` 保持仓库根路径。

**Files:**
- Create: `schemas/common.schema.json`
- Create: `schemas/project-profile.schema.json`
- Create: `schemas/module-manifest.schema.json`
- Create: `schemas/task-contract.schema.json`
- Create: `schemas/scene-manifest.schema.json`
- Create: `schemas/image-task.schema.json`
- Create: `schemas/visual-bible.schema.json`
- Create: `schemas/quality-report.schema.json`
- Create: `schemas/delivery-manifest.schema.json`
- Create: `templates/project-profile.yaml`
- Create: `templates/module-manifest.yaml`
- Create: `templates/task-contract.yaml`
- Create: `templates/scene-manifest.yaml`
- Create: `templates/image-task.yaml`
- Create: `templates/visual-bible.yaml`
- Create: `templates/quality-gates.yaml`
- Create: `scripts/unity_workflow/contracts.py`
- Create: `tests/python/test_contracts.py`

**Interfaces:**
- Produces: `load_yaml(path: Path) -> dict[str, Any]`
- Produces: `validate_contract(kind: str, payload: Mapping[str, Any]) -> list[ValidationIssue]`
- Produces: `ValidationIssue(path: str, message: str)`
- Consumes: JSON Schema 2020-12 文件和 YAML 模板。

- [ ] **Step 1: 编写有效模板和无效契约测试**

```python
@pytest.mark.parametrize("kind", REQUIRED_KINDS)
def test_template_matches_schema(kind, template_path):
    payload = load_yaml(template_path)
    assert validate_contract(kind, payload) == []


def test_task_rejects_missing_write_scope():
    payload = {"id": "gameplay.player", "module": "Gameplay.Player"}
    issues = validate_contract("task-contract", payload)
    assert any(issue.path == "$.scope" for issue in issues)
```

- [ ] **Step 2: 验证测试先失败**

Run: `uv run pytest tests/python/test_contracts.py -q`

Expected: FAIL，缺少 Schema、模板和校验接口。

- [ ] **Step 3: 定义公共实体和枚举**

`common.schema.json` 定义并被其他 Schema `$ref`：任务 ID、项目相对路径、Unity 实例、读写锁、任务状态、审批记录、证据条目和版本化文件名。

任务状态必须限定为：`BLOCKED`、`READY`、`ASSIGNED`、`RUNNING`、`SELF_VERIFIED`、`REVIEWING`、`APPROVED`、`INTEGRATED`、`VERIFIED`、`DONE`、`RETRYABLE_FAILED`、`REJECTED`、`CONFLICTED`、`CANCELLED`。

- [ ] **Step 4: 实现九类 Schema 与七份完整模板**

所有关键对象设置 `additionalProperties: false`。路径、锁、依赖、验收、视觉批准和交付哈希不得用自由文本替代结构字段。模板必须填入可通过校验的示例值，不包含 `TBD` 或 `TODO`。

- [ ] **Step 5: 实现校验器**

`contracts.py` 使用 `yaml.safe_load` 和 `Draft202012Validator`，按 JSONPath 风格稳定排序错误。未知 kind 抛出 `ValueError`，文件解析错误包含源路径但不得吞掉原异常原因。

- [ ] **Step 6: 运行契约测试**

Run: `uv run pytest tests/python/test_contracts.py -q`

Expected: PASS，全部模板通过，构造的无效契约被拒绝。

---

### Task 3：实现 YAML 到 Unity JSON Job 编译器

本任务中的 `scripts/` 路径相对于 `unity-development-workflow/`。

**Files:**
- Create: `scripts/unity_workflow/compiler.py`
- Create: `tests/python/test_compiler.py`

**Interfaces:**
- Produces: `compile_job(kind: str, source: Path, output: Path) -> Path`
- Produces JSON fields: `schemaVersion`、`kind`、`sourcePath`、`sourceSha256`、`compiledAtUtc`、`payload`。
- Consumes: Task 2 的契约校验器。

- [ ] **Step 1: 编写确定性编译测试**

测试相同 YAML 两次编译时 `payload`、`sourceSha256` 和键顺序一致；非法契约不得产生输出文件；输出路径必须位于调用方指定的工作流制品目录。

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run pytest tests/python/test_compiler.py -q`

Expected: FAIL，`compile_job` 不存在。

- [ ] **Step 3: 实现编译器**

先校验、后写临时文件、最后使用 `Path.replace()` 原子替换目标。JSON 使用 UTF-8、两个空格缩进、稳定键排序。`compiledAtUtc` 仅用于审计，不参与源哈希。

- [ ] **Step 4: 运行测试**

Run: `uv run pytest tests/python/test_compiler.py -q`

Expected: PASS。

---

### Task 4：实现 DAG、资源锁和状态机

本任务中的 `scripts/` 路径相对于 `unity-development-workflow/`。

**Files:**
- Create: `scripts/unity_workflow/dag.py`
- Create: `scripts/unity_workflow/locks.py`
- Create: `scripts/unity_workflow/state.py`
- Modify: `scripts/unity_workflow/cli.py`
- Create: `tests/python/test_dag.py`
- Create: `tests/python/test_locks.py`
- Create: `tests/python/test_state.py`

**Interfaces:**
- Produces: `TaskGraph.from_contracts(tasks) -> TaskGraph`
- Produces: `TaskGraph.ready_tasks(states) -> list[str]`
- Produces: `LockTable.acquire(task_id, requests) -> LockResult`
- Produces: `LockTable.release(task_id) -> int`
- Produces: `WorkflowState.transition(task_id, next_state, evidence) -> TaskState`
- Persists: `.unity-workflow/state/tasks.json`、`.unity-workflow/state/locks.json`，原子写入。

- [ ] **Step 1: 编写 DAG 测试**

覆盖依赖完成后就绪、依赖失败时阻塞、未知依赖拒绝和循环依赖拒绝。

- [ ] **Step 2: 编写锁测试**

覆盖共享读锁、写锁排他、父目录写锁覆盖子路径、场景锁包含 `.meta`、不同 Unity 实例互不冲突和任务结束释放全部锁。

- [ ] **Step 3: 编写状态机测试**

覆盖合法状态迁移、开发代理不能从 `SELF_VERIFIED` 直接进入 `DONE`、失败重试最多两次和批准状态必须包含审批证据。

- [ ] **Step 4: 运行测试确认失败**

Run: `uv run pytest tests/python/test_dag.py tests/python/test_locks.py tests/python/test_state.py -q`

Expected: FAIL，接口尚不存在。

- [ ] **Step 5: 实现三个聚焦模块并接入 CLI**

`ready` 输出稳定排序的任务 ID；`lock acquire/release/list` 输出 JSON；`transition` 需要当前状态、目标状态、执行者角色和证据路径。所有写入使用临时文件原子替换，避免并发中断留下半文件。

- [ ] **Step 6: 运行测试**

Run: `uv run pytest tests/python/test_dag.py tests/python/test_locks.py tests/python/test_state.py -q`

Expected: PASS。

---

### Task 5：编写 Skill 工作流参考和任务路由

本任务中的 `SKILL.md` 和 `references/` 路径均相对于 `unity-development-workflow/`；不得创建 Skill README。

**Files:**
- Modify: `SKILL.md`
- Create: `references/workflow-overview.md`
- Create: `references/project-discovery.md`
- Create: `references/module-planning.md`
- Create: `references/multi-agent-execution.md`
- Create: `references/foundation-workflow.md`
- Create: `references/scene-loop.md`
- Create: `references/visual-workflow.md`
- Create: `references/quality-gates.md`
- Create: `references/delivery.md`
- Create: `tests/python/test_skill_structure.py`

**Interfaces:**
- Produces: 可安装 Skill 入口和按阶段加载的参考文件。
- Consumes: Task 2—4 的模板、CLI 和状态定义。

- [ ] **Step 1: 编写结构测试**

测试 `SKILL.md` 引用的每个相对路径存在，正文包含 S00、全局视觉门禁、场景小循环、子代理优先、Unity 实例绑定、禁止自动视觉批准和 Windows 交付门禁。

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run pytest tests/python/test_skill_structure.py -q`

Expected: FAIL，参考文件尚未建立。

- [ ] **Step 3: 编写九份单职责参考文档**

每份文档明确输入、动作、子代理角色、锁、输出、通过条件和失败出口。`visual-workflow.md` 必须要求先确认全局视觉，再按场景循环生成游戏效果图和 UI 效果图；每轮由独立子代理审查并由用户最终批准。

- [ ] **Step 4: 完成 Skill 路由**

`SKILL.md` 只在需要的阶段加载对应参考，避免一次把全部规则塞入上下文。执行任务前必须校验契约并检查锁；任何 Unity 写调用前必须发现并绑定目标实例。

- [ ] **Step 5: 运行结构测试与全部 Python 测试**

Run: `uv run pytest tests/python -q`

Expected: PASS。

---

### Task 6：建立 Toolkit UPM 包和 Core

Task 6—9 中所有以 `unity/Packages/` 开头的计划路径，实际统一映射为 `unity-development-workflow/assets/unity-workflow-toolkit/Packages/`。

**Files:**
- Create: `unity/Packages/com.project.unity-workflow-toolkit/package.json`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/README.md`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/Core/Project.UnityWorkflow.Core.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/Core/WorkflowPaths.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/Core/ManifestLoader.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/Core/ReportWriter.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/Core/Models/*.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/CoreTests.cs`
- Create: `tests/UnityHost/Packages/manifest.json`
- Create: `tests/UnityHost/ProjectSettings/ProjectVersion.txt`

**Interfaces:**
- Produces: `WorkflowPaths.ResolveProjectRelative(string) -> string`
- Produces: `ManifestLoader.Load<T>(string) -> T`
- Produces: `ReportWriter.Write<T>(string, T) -> string`
- Consumes: Task 3 编译出的 Unity JSON Job。

- [ ] **Step 1: 编写 Core EditMode 测试**

覆盖合法项目相对路径、拒绝绝对路径、拒绝 `..` 越界、读取有效 Job、拒绝未知 Schema 版本、报告原子写入和 UTF-8 输出。

- [ ] **Step 2: 建立测试宿主和包清单**

测试宿主只包含本地 Toolkit 包、Unity Test Framework 和 `unity-mcp` Git 依赖，不包含游戏内容。

- [ ] **Step 3: 实现 Core**

所有模型类和公共方法添加简体中文注释。路径解析必须基于 `Directory.GetParent(Application.dataPath)`，解析后再次确认目标仍位于项目根目录内。

- [ ] **Step 4: 运行 Unity EditMode 测试**

Run: `& $env:UNITY_PATH -batchmode -nographics -quit -projectPath tests/UnityHost -runTests -testPlatform EditMode -testResults Artifacts/TestResults/core.xml`

Expected: Unity 退出码 0，`core.xml` 无失败测试。若环境没有 `UNITY_PATH`，记录为环境阻塞，但继续完成可静态验证的工作。

---

### Task 7：实现图片导入与技术校验

**Files:**
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ImagePipeline/Project.UnityWorkflow.ImagePipeline.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ImagePipeline/ImageValidationService.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ImagePipeline/ImageImportService.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ImagePipeline/ImageImportRequest.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ImagePipeline/ImageValidationResult.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/ImagePipelineTests.cs`

**Interfaces:**
- Produces: `ImageValidationService.Validate(ImageImportRequest) -> ImageValidationResult`
- Produces: `ImageImportService.Import(ImageImportRequest) -> ImageImportResult`
- Consumes: 已由用户批准、位于 `ArtSource/Generated/<task-id>/processed/` 的 PNG/JPG。

- [ ] **Step 1: 编写失败测试**

覆盖批准状态、源哈希、格式、尺寸、宽高比、Alpha 要求、目标路径白名单、禁止覆盖、Sprite/Default TextureImporter 设置和现有 `.meta` 保护。

- [ ] **Step 2: 运行测试确认失败**

使用 Task 6 的 Unity 测试命令并筛选 `ImagePipelineTests`，预期因服务不存在而失败。

- [ ] **Step 3: 实现校验和导入**

导入顺序固定为：解析路径、校验源文件和哈希、检查批准记录、复制到版本化目标、`AssetDatabase.ImportAsset`、设置 Importer、`SaveAndReimport`、再次读取配置、写入报告。任何步骤失败均返回结构化错误，不删除源文件。

- [ ] **Step 4: 运行图片管线测试**

Expected: PASS，测试资产在 teardown 中仅删除自己创建的临时目录。

---

### Task 8：实现项目校验、视觉截图和交付预检

**Files:**
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ProjectValidation/Project.UnityWorkflow.ProjectValidation.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/ProjectValidation/ProjectValidationService.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/VisualQA/Project.UnityWorkflow.VisualQA.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/VisualQA/VisualCaptureService.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/BuildPipeline/Project.UnityWorkflow.BuildPipeline.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/BuildPipeline/DeliveryPreflightService.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/ProjectValidationTests.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/VisualCaptureTests.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/DeliveryPreflightTests.cs`

**Interfaces:**
- Produces: `ProjectValidationService.Validate(ProjectProfileDto) -> QualityReportDto`
- Produces: `VisualCaptureService.Capture(VisualCaptureRequest) -> VisualCaptureResult`
- Produces: `DeliveryPreflightService.Validate(DeliveryRequest) -> DeliveryPreflightResult`
- Does not duplicate: `unity-mcp` 的 `manage_build`；正式构建仍由该官方工具执行。

- [ ] **Step 1: 编写项目校验测试**

覆盖 Unity 主版本、URP、构建目标、场景列表、缺失引用、程序集循环依赖可报告性和 Console 错误基线。

- [ ] **Step 2: 编写视觉截图测试**

覆盖 1920×1080 输出、项目内证据路径、固定摄像机查找、无摄像机错误和禁止覆盖未版本化截图。

- [ ] **Step 3: 编写交付预检测试**

覆盖 Windows 目标、版本号、构建场景、质量报告通过状态、视觉批准记录、输出目录和已有制品覆盖保护。

- [ ] **Step 4: 实现三个服务**

每个服务只负责自己的领域并返回结构化 DTO。视觉截图不能静默使用任意主摄像机；请求必须给出摄像机路径或明确允许 `Camera.main`。交付预检不执行签名、上传或正式发布。

- [ ] **Step 5: 运行全部 Toolkit EditMode 测试**

Run: `& $env:UNITY_PATH -batchmode -nographics -quit -projectPath tests/UnityHost -runTests -testPlatform EditMode -testResults Artifacts/TestResults/toolkit.xml`

Expected: Unity 退出码 0，全部测试通过。

---

### Task 9：通过 unity-mcp 暴露 Toolkit 自定义工具

**Files:**
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/McpTools/Project.UnityWorkflow.McpTools.asmdef`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/McpTools/ValidateProjectTool.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/McpTools/ImportImageTool.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/McpTools/CaptureVisualTool.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Editor/McpTools/DeliveryPreflightTool.cs`
- Create: `unity/Packages/com.project.unity-workflow-toolkit/Tests/Editor/McpToolTests.cs`

**Interfaces:**
- Produces custom tools: `uwt_validate_project`、`uwt_import_image`、`uwt_capture_visual`、`uwt_delivery_preflight`。
- Uses official API: `[McpForUnityTool("name")]`、`public static object HandleCommand(JObject @params)`、`SuccessResponse`、`ErrorResponse`。
- Assembly references: `MCPForUnity.Editor`、Toolkit 对应业务程序集；`JObject` 通过 `overrideReferences: true` 和 `precompiledReferences: ["Newtonsoft.Json.dll"]` 引用 `com.unity.nuget.newtonsoft-json` 提供的 DLL，不把不存在的 `Unity.Newtonsoft.Json` 当作 asmdef 名称。

- [ ] **Step 1: 编写工具测试**

测试四个静态工具类存在特性、名称唯一、参数缺失时返回错误、合法参数调用对应服务、异常转换为不泄露本机敏感路径的 `ErrorResponse`。

- [ ] **Step 2: 运行测试确认失败**

Expected: FAIL，工具类不存在。

- [ ] **Step 3: 实现薄适配层**

每个工具只完成 `JObject` 参数解析、服务调用和响应包装，不复制业务校验。工具处理器必须验证 Job 路径在项目内。首版四个工具均为短操作，不声明轮询；正式构建继续调用官方 `manage_build`。

- [ ] **Step 4: 运行 MCP 工具测试**

Expected: PASS，Unity 编译无错误。

---

### Task 10：端到端验证与文档收口

**Files:**
- Modify: `README.md`
- Modify: `unity/Packages/com.project.unity-workflow-toolkit/README.md`
- Create: `docs/verification.md`
- Create: `tests/python/test_end_to_end.py`

**Interfaces:**
- Verifies: YAML 模板 → Schema 校验 → JSON Job → Toolkit 服务 → 结构化报告。
- Verifies: 任务 DAG、锁、状态和场景视觉门禁。

- [ ] **Step 1: 编写端到端 Python 测试**

测试从 `templates/image-task.yaml` 编译 Job，检查哈希和状态；模拟两个场景任务竞争同一路径时仅一个获得写锁；视觉任务没有用户批准记录时不得进入 `APPROVED`。

- [ ] **Step 2: 运行全部 Python 测试**

Run: `uv run pytest tests/python -q`

Expected: PASS。

- [ ] **Step 3: 运行全部 Unity EditMode 测试**

Run: `& $env:UNITY_PATH -batchmode -nographics -quit -projectPath tests/UnityHost -runTests -testPlatform EditMode -testResults Artifacts/TestResults/all.xml`

Expected: Unity 退出码 0，无失败测试。

- [ ] **Step 4: 执行静态检查**

检查所有 C# 类型和方法具备必要简体中文注释；检查所有实现文件少于 1000 行；检查文档无 `TBD`、`TODO` 和失效相对链接；检查 Skill 引用的每个文件存在。

- [ ] **Step 5: 完成使用和验证文档**

README 必须说明安装 Skill、安装 `unity-mcp`、安装 Toolkit、本地测试、S00 执行、全局视觉确认、场景小循环和 Windows 交付。`docs/verification.md` 记录实际执行命令、环境阻塞和测试证据，不把未运行的 Unity 测试描述为通过。

---

## 执行顺序与子代理分配

```text
Task 1
  ↓
Task 2 ──→ Task 3 ──→ Task 4
  └───────────────→ Task 5
Task 6
  ├─→ Task 7
  └─→ Task 8
Task 7 + Task 8 ──→ Task 9
全部任务 ─────────→ Task 10
```

- Python 契约与调度模块、Skill 文档模块、Toolkit Core、图片管线、质量模块可以交给不同子代理，但相邻任务必须在接口审查后再启动。
- 每个实现任务使用“实现代理 → 规格审查代理 → 质量审查代理”两阶段验收。
- 当前目录不是 Git 仓库，不能创建 worktree；首轮使用严格路径所有权隔离。若用户之后初始化 Git，可将后续独立任务迁移到 worktree。
- Unity 串行集成和最终验证由主代理统一执行。
