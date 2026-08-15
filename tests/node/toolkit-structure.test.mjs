import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE_ROOT = resolve(ROOT, "unity-development-workflow/assets/unity-workflow-toolkit/Packages/com.project.unity-workflow-toolkit");
const UNITY_HOST_MANIFEST = resolve(ROOT, "tests/UnityHost/Packages/manifest.json");

/** 统一以 UTF-8 读取单个 Toolkit 源文件，避免编码差异影响静态断言。 */
function readText(path) {
  return readFileSync(path, "utf8");
}

/** 递归枚举目录中的普通文件，供程序集和 C# 结构检查复用。 */
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** 检查声明前的局部区域是否包含 XML 摘要，覆盖类型和方法文档门禁。 */
function hasNearbySummary(lines, index) {
  return lines.slice(Math.max(0, index - 16), index).some((line) => line.includes("/// <summary>"));
}

test("Toolkit 包含全部规划模块和工具", () => {
  const requiredFiles = [
    "package.json", "Runtime/Project.UnityWorkflow.Runtime.asmdef", "Runtime/Scene2DAdaptation.cs", "Editor/Core/WorkflowPaths.cs", "Editor/Core/EditorStabilityGuard.cs", "Editor/Core/ManifestLoader.cs", "Editor/Core/ReportWriter.cs", "Editor/ImagePipeline/ImageValidationService.cs", "Editor/ImagePipeline/ImageImportService.cs", "Editor/ImagePipeline/AssetTargetLock.cs", "Editor/ImagePipeline/ResourceRegistrationRecord.cs", "Editor/ProjectValidation/ProjectValidationService.cs", "Editor/ProjectValidation/Scene2DAdaptationValidationService.cs", "Editor/VisualQA/VisualCaptureService.cs", "Editor/BuildPipeline/DeliveryPreflightService.cs", "Editor/McpTools/ValidateProjectTool.cs", "Editor/McpTools/ImportImageTool.cs", "Editor/McpTools/CaptureVisualTool.cs", "Editor/McpTools/DeliveryPreflightTool.cs", "Tests/Editor/CoreTests.cs", "Tests/Editor/ImagePipelineTests.cs", "Tests/Editor/ProjectValidationTests.cs", "Tests/Editor/Scene2DAdaptationTests.cs", "Tests/Editor/VisualCaptureTests.cs", "Tests/Editor/DeliveryPreflightTests.cs", "Tests/Editor/McpToolTests.cs",
  ];
  for (const relative of requiredFiles) assert.equal(statSync(resolve(PACKAGE_ROOT, relative)).isFile(), true, relative);
});

test("asmdef 有效且程序集名称唯一", () => {
  const names = [];
  for (const path of listFiles(PACKAGE_ROOT).filter((item) => item.endsWith(".asmdef"))) {
    const payload = JSON.parse(readText(path));
    if (resolve(path, "..").endsWith("Runtime")) assert.deepEqual(payload.includePlatforms, []);
    else assert.deepEqual(payload.includePlatforms, ["Editor"]);
    names.push(payload.name);
  }
  assert.equal(names.length, new Set(names).size);
  assert.ok(names.includes("Project.UnityWorkflow.McpTools"));
  assert.ok(names.includes("Project.UnityWorkflow.Runtime"));
  assert.ok(names.includes("Project.UnityWorkflow.Tests"));
});

test("Newtonsoft 引用真实预编译程序集", () => {
  for (const asmdefPath of listFiles(PACKAGE_ROOT).filter((item) => item.endsWith(".asmdef"))) {
    const directory = resolve(asmdefPath, "..");
    const sourceCorpus = listFiles(directory).filter((item) => item.endsWith(".cs")).map(readText).join("\n");
    const payload = JSON.parse(readText(asmdefPath));
    assert.ok(!payload.references?.includes("Unity.Newtonsoft.Json"));
    if (sourceCorpus.includes("Newtonsoft.Json")) {
      assert.equal(payload.overrideReferences, true);
      assert.ok(payload.precompiledReferences.includes("Newtonsoft.Json.dll"));
    }
  }
});

test("Unity 测试宿主固定 MCP 和本地 Toolkit", () => {
  const dependencies = JSON.parse(readText(UNITY_HOST_MANIFEST)).dependencies;
  assert.match(dependencies["com.coplaydev.unity-mcp"], /#v10\.1\.0$/);
  assert.match(dependencies["com.project.unity-workflow-toolkit"], /^file:/);
  assert.ok(JSON.parse(readText(UNITY_HOST_MANIFEST)).testables.includes("com.project.unity-workflow-toolkit"));
});

test("C# 文件规模受控、具备注释且无占位符", () => {
  const typePattern = /\b(?:class|struct|interface|enum)\s+[A-Za-z_]\w*/;
  const methodPattern = /^\s*(?:public|private|internal|protected)\s+(?:(?:static|sealed|virtual|override|async)\s+)*[A-Za-z_][\w<>,.\[\]?]*\s+[A-Za-z_]\w*\s*\(/;
  for (const path of listFiles(PACKAGE_ROOT).filter((item) => item.endsWith(".cs"))) {
    const text = readText(path);
    const lines = text.split("\n");
    assert.ok(lines.length < 1000, `C# 文件超过 1000 行：${path}`);
    assert.doesNotMatch(text, /\b(?:TBD|TODO|FIXME)\b/i);
    lines.forEach((line, index) => {
      if (line.trim().startsWith("//")) return;
      if (typePattern.test(line) || methodPattern.test(line)) assert.ok(hasNearbySummary(lines, index), `声明缺少 XML 摘要：${path}:${index + 1}`);
    });
  }
});

test("自定义工具名称精确且唯一", () => {
  const corpus = listFiles(resolve(PACKAGE_ROOT, "Editor/McpTools")).filter((item) => item.endsWith(".cs")).map(readText).join("\n");
  const names = [...corpus.matchAll(/\[McpForUnityTool\(\s*"([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(names, ["uwt_capture_visual", "uwt_delivery_preflight", "uwt_import_image", "uwt_validate_project"]);
});
