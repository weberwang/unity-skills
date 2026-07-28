import json
import re
from pathlib import Path


ROOT = Path(__file__).parents[2]
PACKAGE_ROOT = (
    ROOT
    / "unity-development-workflow"
    / "assets"
    / "unity-workflow-toolkit"
    / "Packages"
    / "com.project.unity-workflow-toolkit"
)
UNITY_HOST_MANIFEST = ROOT / "tests" / "UnityHost" / "Packages" / "manifest.json"


def read_text(path: Path) -> str:
    """统一以 UTF-8 读取 Toolkit 源文件。"""
    return path.read_text(encoding="utf-8")


def has_nearby_summary(lines: list[str], index: int) -> bool:
    """检查声明前的局部区域是否包含 XML 摘要，允许中间存在特性和参数标签。"""
    start = max(0, index - 16)
    return any("/// <summary>" in line for line in lines[start:index])


def test_toolkit_contains_all_planned_modules_and_tools() -> None:
    """UPM 包必须覆盖 Core、图片、项目、视觉、构建和 MCP 六个模块。"""
    required_files = (
        "package.json",
        "Runtime/Project.UnityWorkflow.Runtime.asmdef",
        "Runtime/Scene2DAdaptation.cs",
        "Editor/Core/WorkflowPaths.cs",
        "Editor/Core/EditorStabilityGuard.cs",
        "Editor/Core/ManifestLoader.cs",
        "Editor/Core/ReportWriter.cs",
        "Editor/ImagePipeline/ImageValidationService.cs",
        "Editor/ImagePipeline/ImageImportService.cs",
        "Editor/ImagePipeline/AssetTargetLock.cs",
        "Editor/ImagePipeline/ResourceRegistrationRecord.cs",
        "Editor/ProjectValidation/ProjectValidationService.cs",
        "Editor/ProjectValidation/Scene2DAdaptationValidationService.cs",
        "Editor/VisualQA/VisualCaptureService.cs",
        "Editor/BuildPipeline/DeliveryPreflightService.cs",
        "Editor/McpTools/ValidateProjectTool.cs",
        "Editor/McpTools/ImportImageTool.cs",
        "Editor/McpTools/CaptureVisualTool.cs",
        "Editor/McpTools/DeliveryPreflightTool.cs",
        "Tests/Editor/CoreTests.cs",
        "Tests/Editor/ImagePipelineTests.cs",
        "Tests/Editor/ProjectValidationTests.cs",
        "Tests/Editor/Scene2DAdaptationTests.cs",
        "Tests/Editor/VisualCaptureTests.cs",
        "Tests/Editor/DeliveryPreflightTests.cs",
        "Tests/Editor/McpToolTests.cs",
    )

    for relative in required_files:
        assert (PACKAGE_ROOT / relative).is_file(), f"Toolkit 文件缺失：{relative}"


def test_asmdefs_are_valid_and_unique() -> None:
    """全部 asmdef 必须是有效 JSON，且程序集名称不能重复。"""
    names: list[str] = []
    for path in PACKAGE_ROOT.rglob("*.asmdef"):
        payload = json.loads(read_text(path))
        if path.parent.name == "Runtime":
            assert payload["includePlatforms"] == []
        else:
            assert payload["includePlatforms"] == ["Editor"]
        names.append(payload["name"])

    assert len(names) == len(set(names))
    assert "Project.UnityWorkflow.McpTools" in names
    assert "Project.UnityWorkflow.Runtime" in names
    assert "Project.UnityWorkflow.Tests" in names


def test_newtonsoft_references_use_the_real_precompiled_assembly() -> None:
    """使用 JObject 的程序集必须显式引用真实 DLL，不能引用不存在的 asmdef 名称。"""
    for asmdef_path in PACKAGE_ROOT.rglob("*.asmdef"):
        source_corpus = "\n".join(read_text(path) for path in asmdef_path.parent.glob("*.cs"))
        payload = json.loads(read_text(asmdef_path))
        assert "Unity.Newtonsoft.Json" not in payload.get("references", [])
        if "Newtonsoft.Json" in source_corpus:
            assert payload["overrideReferences"] is True
            assert "Newtonsoft.Json.dll" in payload["precompiledReferences"]


def test_unity_host_pins_mcp_and_local_toolkit() -> None:
    """最小测试宿主必须固定 MCP 版本并以本地包运行真实 Toolkit。"""
    manifest = json.loads(read_text(UNITY_HOST_MANIFEST))
    dependencies = manifest["dependencies"]

    assert dependencies["com.coplaydev.unity-mcp"].endswith("#v10.1.0")
    assert dependencies["com.project.unity-workflow-toolkit"].startswith("file:")
    assert "com.project.unity-workflow-toolkit" in manifest["testables"]


def test_csharp_files_are_bounded_documented_and_without_placeholders() -> None:
    """C# 实现必须控制规模，并为类型和方法提供简体中文 XML 注释。"""
    type_pattern = re.compile(r"\b(?:class|struct|interface|enum)\s+[A-Za-z_]\w*")
    method_pattern = re.compile(
        r"^\s*(?:public|private|internal|protected)\s+"
        r"(?:(?:static|sealed|virtual|override|async)\s+)*"
        r"[A-Za-z_][\w<>,.\[\]?]*\s+[A-Za-z_]\w*\s*\("
    )

    for path in PACKAGE_ROOT.rglob("*.cs"):
        text = read_text(path)
        lines = text.splitlines()
        assert len(lines) < 1000, f"C# 文件超过 1000 行：{path}"
        assert not re.search(r"\b(?:TBD|TODO|FIXME)\b", text, flags=re.IGNORECASE)
        for index, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            if type_pattern.search(line) or method_pattern.search(line):
                assert has_nearby_summary(lines, index), f"声明缺少 XML 摘要：{path}:{index + 1}"


def test_custom_tool_names_are_exact_and_unique() -> None:
    """四个短工具必须显式使用工作流约定名称，避免发现名与路由名分叉。"""
    corpus = "\n".join(read_text(path) for path in (PACKAGE_ROOT / "Editor" / "McpTools").glob("*.cs"))
    names = re.findall(r'\[McpForUnityTool\(\s*"([^"]+)"', corpus)

    assert sorted(names) == [
        "uwt_capture_visual",
        "uwt_delivery_preflight",
        "uwt_import_image",
        "uwt_validate_project",
    ]
