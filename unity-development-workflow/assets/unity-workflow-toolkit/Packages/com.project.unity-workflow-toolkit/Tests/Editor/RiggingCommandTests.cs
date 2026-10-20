using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.PipelineCommands;
using Project.UnityWorkflow.RiggingValidation;
using UnityEditor;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>验证骨骼资产命令的真实 Job 入口、报告写入边界和失败报告持久化。</summary>
    public sealed class RiggingCommandTests
    {
        private string testId;
        private string testRoot;
        private bool ownsTestRoot;
        private RiggingTestAssets assets;

        /// <summary>为命令报告和 Job 创建独占目录标识。</summary>
        [SetUp]
        public void SetUp()
        {
            testId = Guid.NewGuid().ToString("N");
            testRoot = "Artifacts/UwtRiggingCommandTests/" + testId;
            ownsTestRoot = false;
        }

        /// <summary>删除测试自己创建的唯一 GUID 目录，不触碰共享目录。</summary>
        [TearDown]
        public void TearDown()
        {
            try
            {
                DeleteOwnedTestRoot();
            }
            finally
            {
                if (assets != null)
                {
                    RiggingTestAssets.Cleanup(assets.RootPath);
                    assets = null;
                }
            }
        }

        /// <summary>确认有效 Job 写出 PASS 报告且不改写 Job、源契约或角色输入资产。</summary>
        [Test]
        public void Execute_ValidJob_WritesPassReportAndLeavesInputsUnchanged()
        {
            assets = RiggingTestAssets.Create();
            RiggingCommandJob job = WriteJob(CreateRequest());
            byte[] jobSnapshot = File.ReadAllBytes(AbsolutePath(job.JobPath));
            byte[] sourceSnapshot = File.ReadAllBytes(AbsolutePath(job.SourcePath));
            Dictionary<string, string> assetSnapshot = assets.CaptureSourceSnapshot();

            PipelineCommandResult result = Validate2DRiggingCommand.Execute(job.JobPath);

            Assert.That(result.Success, Is.True, result.Message);
            QualityReportDto report = GetReport(result);
            Assert.That(report.Status, Is.EqualTo("PASS"));
            Assert.That(File.Exists(AbsolutePath(job.OutputPath)), Is.True);
            JObject writtenReport = JObject.Parse(File.ReadAllText(AbsolutePath(job.OutputPath)));
            Assert.That((string)writtenReport["status"], Is.EqualTo("PASS"));
            Assert.That(writtenReport["checks"].Type, Is.EqualTo(JTokenType.Array));
            CollectionAssert.AreEqual(jobSnapshot, File.ReadAllBytes(AbsolutePath(job.JobPath)),
                "命令不得覆盖或重写其输入 Job。");
            CollectionAssert.AreEqual(sourceSnapshot, File.ReadAllBytes(AbsolutePath(job.SourcePath)),
                "命令不得覆盖或重写源契约。");
            CollectionAssert.AreEquivalent(assetSnapshot, assets.CaptureSourceSnapshot(),
                "角色 Prefab、Sprite、Clip、Controller 与 Meta 文件均应保持只读。");
        }

        /// <summary>确认合法 Job 的业务检查失败仍写出可供机器读取的 FAIL 报告。</summary>
        [Test]
        public void Execute_ValidJobWithEngineeringFailure_WritesStructuredFailureReport()
        {
            assets = RiggingTestAssets.Create();
            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].ClipPath = "Assets/../missing-action.anim";
            RiggingCommandJob job = WriteJob(request);
            byte[] jobSnapshot = File.ReadAllBytes(AbsolutePath(job.JobPath));
            byte[] sourceSnapshot = File.ReadAllBytes(AbsolutePath(job.SourcePath));

            PipelineCommandResult result = Validate2DRiggingCommand.Execute(job.JobPath);

            Assert.That(result.Success, Is.False, result.Message);
            QualityReportDto report = GetReport(result);
            Assert.That(report.Status, Is.EqualTo("FAIL"));
            Assert.That(File.Exists(AbsolutePath(job.OutputPath)), Is.True,
                "业务 FAIL 仍然需要留下完整质量报告，而不是只返回命令错误。");
            JObject writtenReport = JObject.Parse(File.ReadAllText(AbsolutePath(job.OutputPath)));
            Assert.That((string)writtenReport["status"], Is.EqualTo("FAIL"));
            Assert.That(writtenReport["checks"].Type, Is.EqualTo(JTokenType.Array));
            Assert.That(writtenReport["checks"].Children<JObject>().Any(check =>
                (string)check["id"] == "clip-requirement-action" && (string)check["status"] == "FAIL"), Is.True);
            CollectionAssert.AreEqual(jobSnapshot, File.ReadAllBytes(AbsolutePath(job.JobPath)));
            CollectionAssert.AreEqual(sourceSnapshot, File.ReadAllBytes(AbsolutePath(job.SourcePath)));
        }

        /// <summary>确认命令拒绝 Assets 目标及含空路径段或父级跳转的输出位置。</summary>
        /// <param name="pathKind">Assets、重复分隔符或父级跳转路径类别。</param>
        [TestCase("assets")]
        [TestCase("duplicate-separator")]
        [TestCase("parent-segment")]
        public void Execute_WithUnsafeReportPath_RejectsWithoutChangingInputs(string pathKind)
        {
            string outputPath = pathKind == "assets"
                ? "Assets/rigging-report.json"
                : pathKind == "duplicate-separator"
                    ? testRoot + "//report.json"
                    : testRoot + "/../" + testId + "/report.json";
            RiggingValidationRequest request = CreateRequestWithoutAssets(outputPath);
            RiggingCommandJob job = WriteJob(request, testRoot + "/job.json", testRoot + "/source.json");
            if (pathKind != "assets")
            {
                // 为会规范化回本 GUID 目录内的危险路径放入哨兵，检测命令是否错误地先规范化再覆盖。
                WriteProjectFile(testRoot + "/report.json", Encoding.UTF8.GetBytes("owned-sentinel:" + testId));
            }

            Dictionary<string, string> ownedRootSnapshot = CaptureOwnedRootSnapshot();
            byte[] jobSnapshot = File.ReadAllBytes(AbsolutePath(job.JobPath));
            byte[] sourceSnapshot = File.ReadAllBytes(AbsolutePath(job.SourcePath));

            PipelineCommandResult result = Validate2DRiggingCommand.Execute(job.JobPath);

            Assert.That(result.Success, Is.False);
            Assert.That(result.Data, Is.Null, "路径入口拒绝发生在业务检查前，不应生成质量报告对象。");
            CollectionAssert.AreEqual(jobSnapshot, File.ReadAllBytes(AbsolutePath(job.JobPath)));
            CollectionAssert.AreEqual(sourceSnapshot, File.ReadAllBytes(AbsolutePath(job.SourcePath)));
            CollectionAssert.AreEquivalent(ownedRootSnapshot, CaptureOwnedRootSnapshot(),
                "拒绝非法路径时只能确认本测试 GUID 目录未变化，不解析或探测拒绝目标。");
        }

        /// <summary>确认输出目标不能覆盖命令正在读取的 Job 或其来源契约。</summary>
        /// <param name="overwriteSource">为真时输出路径指向 sourcePath，否则指向 Job 自身。</param>
        [TestCase(false)]
        [TestCase(true)]
        public void Execute_WhenOutputWouldOverwriteInput_RejectsWithoutChangingInputBytes(bool overwriteSource)
        {
            RiggingValidationRequest request = CreateRequestWithoutAssets(string.Empty);
            string jobPath = testRoot + "/job.json";
            string sourcePath = testRoot + "/source.json";
            request.OutputPath = overwriteSource ? sourcePath : jobPath;
            RiggingCommandJob job = WriteJob(request, jobPath, sourcePath);
            byte[] jobSnapshot = File.ReadAllBytes(AbsolutePath(job.JobPath));
            byte[] sourceSnapshot = File.ReadAllBytes(AbsolutePath(job.SourcePath));

            PipelineCommandResult result = Validate2DRiggingCommand.Execute(job.JobPath);

            Assert.That(result.Success, Is.False);
            Assert.That(result.Data, Is.Null);
            CollectionAssert.AreEqual(jobSnapshot, File.ReadAllBytes(AbsolutePath(job.JobPath)));
            CollectionAssert.AreEqual(sourceSnapshot, File.ReadAllBytes(AbsolutePath(job.SourcePath)));
        }

        /// <summary>将角色需求转换为命令 Job 需要的 lowerCamel JSON payload。</summary>
        /// <param name="outputPath">报告目标路径。</param>
        /// <returns>含完整有效要求的角色请求。</returns>
        private RiggingValidationRequest CreateRequest(string outputPath = null)
        {
            if (assets == null)
            {
                assets = RiggingTestAssets.Create();
            }

            return new RiggingValidationRequest
            {
                SchemaVersion = "1.0",
                TaskId = "rigging-command-" + testId,
                ProjectId = "unity-workflow-toolkit-tests",
                SourceRevision = "test-fixture",
                PrefabPath = assets.PrefabPath,
                OutputPath = outputPath ?? DefaultOutputPath(),
                Clips = new List<RiggingClipRequirement>
                {
                    new RiggingClipRequirement { Id = "idle", ClipPath = assets.IdleClipPath, Loop = true },
                    new RiggingClipRequirement
                    {
                        Id = "action",
                        ClipPath = assets.ActionClipPath,
                        Loop = false,
                        RequiredEvents = new List<string> { "OnImpact" }
                    },
                    new RiggingClipRequirement { Id = "hit", ClipPath = assets.HitClipPath, Loop = false }
                },
                Variants = new List<RiggingVariantRequirement>
                {
                    new RiggingVariantRequirement
                    {
                        Id = "alternate-pose",
                        RendererPath = "VisualRig",
                        SpritePath = assets.VariantSpritePath,
                        SpriteName = "VariantSprite"
                    }
                }
            };
        }

        /// <summary>创建只供入口路径测试使用的不完整业务请求，不需要导入 Unity 角色资产。</summary>
        /// <param name="outputPath">会被命令入口拒绝的输出路径。</param>
        /// <returns>能通过 Job JSON 反序列化、但不能代表业务通过的请求。</returns>
        private RiggingValidationRequest CreateRequestWithoutAssets(string outputPath)
        {
            return new RiggingValidationRequest
            {
                SchemaVersion = "1.0",
                TaskId = "rigging-command-boundary-" + testId,
                ProjectId = "unity-workflow-toolkit-tests",
                SourceRevision = "test-fixture",
                PrefabPath = "Assets/Missing.prefab",
                OutputPath = outputPath,
                Clips = new List<RiggingClipRequirement>(),
                Variants = new List<RiggingVariantRequirement>()
            };
        }

        /// <summary>写入测试专属编译 Job 与源契约快照。</summary>
        /// <param name="request">Job payload。</param>
        /// <param name="jobPath">可选的测试 Job 路径。</param>
        /// <param name="sourcePath">可选的测试来源文件路径。</param>
        /// <returns>绝对路径测试目录中的 Job 和报告信息。</returns>
        private RiggingCommandJob WriteJob(
            RiggingValidationRequest request,
            string jobPath = null,
            string sourcePath = null)
        {
            string outputPath = request.OutputPath;
            jobPath = jobPath ?? testRoot + "/job.json";
            sourcePath = sourcePath ?? testRoot + "/source.json";

            JObject payload = JObject.FromObject(request, new JsonSerializer
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver()
            });
            byte[] sourceBytes = Encoding.UTF8.GetBytes("source-contract:" + testId + "\n");
            var job = new JObject
            {
                ["schemaVersion"] = "1.0",
                ["kind"] = "rigging-validation",
                ["sourcePath"] = sourcePath,
                ["compiledAtUtc"] = "2026-10-20T00:00:00Z",
                ["payload"] = payload
            };
            byte[] jobBytes = Encoding.UTF8.GetBytes(job.ToString(Formatting.Indented));
            WriteProjectFile(sourcePath, sourceBytes);
            WriteProjectFile(jobPath, jobBytes);

            return new RiggingCommandJob
            {
                JobPath = jobPath,
                SourcePath = sourcePath,
                OutputPath = outputPath
            };
        }

        /// <summary>在本测试 GUID 目录内创建父目录并以原始字节写入测试文件。</summary>
        /// <param name="projectPath">项目相对文件路径。</param>
        /// <param name="bytes">待写入字节。</param>
        private void WriteProjectFile(string projectPath, byte[] bytes)
        {
            string prefix = testRoot + "/";
            if (string.IsNullOrWhiteSpace(projectPath) ||
                !projectPath.StartsWith(prefix, StringComparison.Ordinal) ||
                projectPath.Split('/').Any(segment => string.IsNullOrEmpty(segment) || segment == "." || segment == ".."))
            {
                throw new InvalidOperationException("测试只能写入本测试 GUID 目录中的安全路径。");
            }

            string absoluteRoot = AbsolutePath(testRoot);
            if (!ownsTestRoot)
            {
                if (Directory.Exists(absoluteRoot))
                {
                    throw new InvalidOperationException("测试 GUID 目录意外已存在，拒绝覆盖既有文件：" + testRoot);
                }

                Directory.CreateDirectory(absoluteRoot);
                ownsTestRoot = true;
            }

            string absolutePath = AbsolutePath(projectPath);
            string normalizedPath = Path.GetFullPath(absolutePath);
            if (!normalizedPath.StartsWith(Path.GetFullPath(absoluteRoot) + Path.DirectorySeparatorChar,
                StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("测试文件路径越出了本测试 GUID 目录。");
            }

            Directory.CreateDirectory(Path.GetDirectoryName(absolutePath));
            File.WriteAllBytes(absolutePath, bytes);
        }

        /// <summary>解析命令返回的结构化质量报告。</summary>
        /// <param name="result">命令结果信封。</param>
        /// <returns>底层质量报告对象。</returns>
        private static QualityReportDto GetReport(PipelineCommandResult result)
        {
            Assert.That(result.Data, Is.TypeOf<QualityReportDto>());
            return (QualityReportDto)result.Data;
        }

        /// <summary>将项目相对测试路径解析到工作流项目文件系统。</summary>
        /// <param name="projectPath">项目相对路径。</param>
        /// <returns>项目内绝对路径。</returns>
        private static string AbsolutePath(string projectPath)
        {
            return WorkflowPaths.ResolveProjectRelative(projectPath);
        }

        /// <summary>仅递归删除本测试创建的 GUID 目录，绝不清理共享父目录或输出目标。</summary>
        private void DeleteOwnedTestRoot()
        {
            if (!ownsTestRoot || string.IsNullOrWhiteSpace(testId) ||
                testRoot != "Artifacts/UwtRiggingCommandTests/" + testId)
            {
                return;
            }

            string absolutePath = Path.GetFullPath(AbsolutePath(testRoot));
            string artifactsRoot = Path.GetFullPath(AbsolutePath("Artifacts")) + Path.DirectorySeparatorChar;
            if (!absolutePath.StartsWith(artifactsRoot, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(Path.GetFileName(absolutePath), testId, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            if (Directory.Exists(absolutePath))
            {
                Directory.Delete(absolutePath, true);
            }
        }

        /// <summary>生成当前测试唯一的报告目标路径。</summary>
        /// <returns>Artifacts 下的 JSON 报告路径。</returns>
        private string DefaultOutputPath()
        {
            return testRoot + "/report.json";
        }

        /// <summary>快照本测试 GUID 目录内的相对路径和文件字节，用于确认拒绝请求没有写入副作用。</summary>
        /// <returns>本测试专属目录的文件内容映射。</returns>
        private Dictionary<string, string> CaptureOwnedRootSnapshot()
        {
            var snapshot = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string absoluteRoot = AbsolutePath(testRoot);
            if (!Directory.Exists(absoluteRoot))
            {
                return snapshot;
            }

            foreach (string file in Directory.GetFiles(absoluteRoot, "*", SearchOption.AllDirectories))
            {
                string relative = file.Substring(absoluteRoot.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                snapshot.Add(relative, Convert.ToBase64String(File.ReadAllBytes(file)));
            }

            return snapshot;
        }

        /// <summary>保存测试 Job 的路径关系，便于参数化输入覆盖用例构造。</summary>
        private sealed class RiggingCommandJob
        {
            /// <summary>获取编译 Job 路径。</summary>
            public string JobPath { get; set; }

            /// <summary>获取源契约路径。</summary>
            public string SourcePath { get; set; }

            /// <summary>获取报告输出路径。</summary>
            public string OutputPath { get; set; }
        }
    }
}
