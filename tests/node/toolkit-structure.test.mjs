import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE_ROOT = resolve(ROOT, "unity-development-workflow/assets/unity-workflow-toolkit/Packages/com.project.unity-workflow-toolkit");
const UNITY_HOST_MANIFEST = resolve(ROOT, "tests/UnityHost/Packages/manifest.json");
const PIPELINE_VERSION = "0.6.0-exp.1";
const INPUT_SYSTEM_VERSION = "1.20.0";

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

test("Toolkit 包含 Pipeline 命令层和全部规划模块", () => {
  const requiredFiles = [
    "package.json", "Runtime/Project.UnityWorkflow.Runtime.asmdef", "Runtime/Scene2DAdaptation.cs", "Editor/Core/WorkflowPaths.cs", "Editor/Core/EditorStabilityGuard.cs", "Editor/Core/ManifestLoader.cs", "Editor/Core/ReportWriter.cs", "Editor/ImagePipeline/ImageValidationService.cs", "Editor/ImagePipeline/ImageImportService.cs", "Editor/ImagePipeline/AssetTargetLock.cs", "Editor/ImagePipeline/ResourceRegistrationRecord.cs", "Editor/ProjectValidation/ProjectValidationService.cs", "Editor/ProjectValidation/Scene2DAdaptationValidationService.cs", "Editor/VisualQA/VisualCaptureService.cs", "Editor/BuildPipeline/DeliveryPreflightService.cs", "Editor/PipelineCommands/PipelineCommandSupport.cs", "Editor/PipelineCommands/ValidateProjectCommand.cs", "Editor/PipelineCommands/ImportImageCommand.cs", "Editor/PipelineCommands/CaptureVisualCommand.cs", "Editor/PipelineCommands/DeliveryPreflightCommand.cs", "Editor/PipelineCommands/Project.UnityWorkflow.PipelineCommands.asmdef", "Tests/Editor/CoreTests.cs", "Tests/Editor/ImagePipelineTests.cs", "Tests/Editor/ProjectValidationTests.cs", "Tests/Editor/Scene2DAdaptationTests.cs", "Tests/Editor/VisualCaptureTests.cs", "Tests/Editor/DeliveryPreflightTests.cs", "Tests/Editor/PipelineCommandTests.cs",
  ];
  for (const relative of requiredFiles) assert.equal(statSync(resolve(PACKAGE_ROOT, relative)).isFile(), true, relative);
  assert.equal(existsSync(resolve(PACKAGE_ROOT, "Editor/McpTools")), false);
});

test("asmdef 使用官方 Pipeline 程序集且程序集名称唯一", () => {
  const names = [];
  for (const path of listFiles(PACKAGE_ROOT).filter((item) => item.endsWith(".asmdef"))) {
    const payload = JSON.parse(readText(path));
    if (resolve(path, "..").endsWith("Runtime")) assert.deepEqual(payload.includePlatforms, []);
    else assert.deepEqual(payload.includePlatforms, ["Editor"]);
    names.push(payload.name);
  }
  assert.equal(names.length, new Set(names).size);
  assert.ok(names.includes("Project.UnityWorkflow.PipelineCommands"));
  assert.ok(names.includes("Project.UnityWorkflow.Runtime"));
  assert.ok(names.includes("Project.UnityWorkflow.Tests"));

  const commandAsmdef = JSON.parse(readText(resolve(PACKAGE_ROOT, "Editor/PipelineCommands/Project.UnityWorkflow.PipelineCommands.asmdef")));
  assert.ok(commandAsmdef.references.includes("Unity.Pipeline"));
  assert.deepEqual(commandAsmdef.defineConstraints, ["UWT_UNITY_PIPELINE"]);
  assert.deepEqual(commandAsmdef.versionDefines, [{
    name: "com.unity.pipeline",
    expression: "[0.6.0-exp.1,0.7.0)",
    define: "UWT_UNITY_PIPELINE",
  }]);
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

test("Unity 测试宿主固定官方 Pipeline 和本地 Toolkit", () => {
  const manifest = JSON.parse(readText(UNITY_HOST_MANIFEST));
  const dependencies = manifest.dependencies;
  assert.equal(dependencies["com.unity.pipeline"], PIPELINE_VERSION);
  assert.equal(dependencies["com.unity.inputsystem"], INPUT_SYSTEM_VERSION);
  assert.equal(Object.keys(dependencies).some((name) => /mcp/i.test(name)), false);
  assert.match(dependencies["com.project.unity-workflow-toolkit"], /^file:/);
  assert.ok(manifest.testables.includes("com.project.unity-workflow-toolkit"));
});

test("Toolkit 包声明官方 Pipeline 依赖且不含旧集成关键词", () => {
  const manifest = JSON.parse(readText(resolve(PACKAGE_ROOT, "package.json")));
  assert.equal(manifest.dependencies["com.unity.pipeline"], PIPELINE_VERSION);
  assert.equal(manifest.dependencies["com.unity.inputsystem"], INPUT_SYSTEM_VERSION);
  assert.equal(manifest.keywords.some((keyword) => /mcp/i.test(keyword)), false);

  const corpus = listFiles(PACKAGE_ROOT)
    .filter((path) => /\.(cs|json|md)$/.test(path))
    .map(readText)
    .join("\n");
  const legacyTokens = [
    ["Coplay", "Dev"].join("") + "/" + ["unity", "-mcp"].join(""),
    ["MCPFor", "Unity"].join(""),
    ["McpFor", "UnityTool"].join(""),
    ["UWT_UNITY", "MCP"].join("_"),
    ["Mcp", "Tool"].join(""),
  ];
  for (const legacyToken of legacyTokens) {
    assert.equal(corpus.includes(legacyToken), false, `发现旧集成标记：${legacyToken}`);
  }
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

test("Pipeline 命令名称、参数和主线程标记精确且唯一", () => {
  const corpus = listFiles(resolve(PACKAGE_ROOT, "Editor/PipelineCommands")).filter((item) => item.endsWith(".cs")).map(readText).join("\n");
  const names = [...corpus.matchAll(/\[CliCommand\(\s*"([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(names, ["uwt_capture_visual", "uwt_delivery_preflight", "uwt_import_image", "uwt_validate_project"]);
  assert.equal((corpus.match(/MainThreadRequired\s*=\s*true/g) ?? []).length, 4);
  assert.equal((corpus.match(/\[CliArg\(\s*"job_path"/g) ?? []).length, 4);
  assert.equal((corpus.match(/public static PipelineCommandResult Execute\(/g) ?? []).length, 4);
});
