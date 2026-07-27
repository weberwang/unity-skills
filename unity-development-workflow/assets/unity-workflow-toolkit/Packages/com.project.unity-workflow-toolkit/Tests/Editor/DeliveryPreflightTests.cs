using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.BuildPipeline;
using Project.UnityWorkflow.Core;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>
    /// 验证 Windows 交付预检的版本、证据和覆盖保护门禁。
    /// </summary>
    public sealed class DeliveryPreflightTests
    {
        private const string EvidenceRoot = "Artifacts/Visual/Runtime/__UWTDeliveryPreflightTests";

        /// <summary>仅清理本测试类拥有的交付证据目录。</summary>
        [TearDown]
        public void TearDown()
        {
            string absoluteRoot = WorkflowPaths.ResolveProjectRelative(EvidenceRoot);
            if (Directory.Exists(absoluteRoot))
            {
                Directory.Delete(absoluteRoot, true);
            }
        }

        /// <summary>
        /// 验证所有交付条件满足时预检通过且不执行构建。
        /// </summary>
        [Test]
        public void Evaluate_AllRequirementsSatisfied_ReturnsPass()
        {
            DeliveryRequest request = CreateRequest();
            DeliveryPreflightSnapshot snapshot = CreatePassingSnapshot();

            DeliveryPreflightResult result = new DeliveryPreflightService().Evaluate(request, snapshot);

            Assert.That(result.Status, Is.EqualTo("PASS"));
            Assert.That(result.Scope, Is.EqualTo("TECHNICAL_BUILD_PREFLIGHT"));
            Assert.That(result.ExcludedChecks, Does.Contain("license-compliance"));
            Assert.That(result.ExcludedChecks, Does.Contain("privacy-review"));
            Assert.That(result.Checks.All(check => check.Status == "PASS"), Is.True);
        }

        /// <summary>
        /// 验证非 Windows 目标、版本不一致和缺失场景均形成独立失败项。
        /// </summary>
        [Test]
        public void Evaluate_InvalidBuildConfiguration_ReturnsFail()
        {
            DeliveryPreflightSnapshot snapshot = CreatePassingSnapshot();
            snapshot.IsWindowsTarget = false;
            snapshot.BundleVersion = "0.9.0";
            snapshot.MissingBuildScenes = new[] { "Assets/Scenes/Missing.unity" };

            DeliveryPreflightResult result = new DeliveryPreflightService().Evaluate(CreateRequest(), snapshot);

            Assert.That(result.Status, Is.EqualTo("FAIL"));
            AssertCheckStatus(result, "delivery-platform", "FAIL");
            AssertCheckStatus(result, "delivery-version", "FAIL");
            AssertCheckStatus(result, "build-scenes", "FAIL");
        }

        /// <summary>
        /// 验证质量报告和视觉批准记录必须存在且明确通过。
        /// </summary>
        [Test]
        public void Evaluate_InvalidEvidence_ReturnsFail()
        {
            DeliveryPreflightSnapshot snapshot = CreatePassingSnapshot();
            snapshot.FailedQualityReports = new[] { "Artifacts/Quality/fail.json" };
            snapshot.UnapprovedVisualRecords = new[] { "Artifacts/VisualQA/review.json" };

            DeliveryPreflightResult result = new DeliveryPreflightService().Evaluate(CreateRequest(), snapshot);

            AssertCheckStatus(result, "quality-reports", "FAIL");
            AssertCheckStatus(result, "visual-approvals", "FAIL");
            Assert.That(result.Status, Is.EqualTo("FAIL"));
        }

        /// <summary>
        /// 验证非法输出目录和同名已有制品都会阻止覆盖。
        /// </summary>
        [Test]
        public void Evaluate_InvalidOrOccupiedOutput_ReturnsFail()
        {
            DeliveryPreflightSnapshot snapshot = CreatePassingSnapshot();
            snapshot.OutputPathValid = false;
            snapshot.ArtifactExists = true;

            DeliveryPreflightResult result = new DeliveryPreflightService().Evaluate(CreateRequest(), snapshot);

            AssertCheckStatus(result, "output-directory", "FAIL");
            AssertCheckStatus(result, "artifact-overwrite", "FAIL");
        }

        /// <summary>
        /// 实机视觉记录必须使用嵌套 screenshot、RUNTIME_VISUAL 审查和用户批准，并绑定当前构建。
        /// </summary>
        [Test]
        public void IsApprovedVisualRecord_NestedRuntimeEvidenceAndApprovals_Passes()
        {
            DeliveryRequest request = CreateRequest();
            string screenshotPath = WriteEvidence("runtime.png", new byte[] { 1, 2, 3 });
            string reviewPath = WriteEvidence("review.json", new byte[] { 4, 5, 6 });
            string userPath = WriteEvidence("user.json", new byte[] { 7, 8, 9 });
            JObject document = CreateRuntimeVisualDocument(request, screenshotPath, reviewPath, userPath);

            Assert.That(
                DeliveryPreflightService.IsApprovedVisualRecord(document.ToString(), request),
                Is.True);

            ((JObject)document["screenshot"])["sha256"] = new string('0', 64);
            Assert.That(
                DeliveryPreflightService.IsApprovedVisualRecord(document.ToString(), request),
                Is.False);

            string nonRuntimePath = WriteEvidence("runtime.txt", new byte[] { 1, 2, 3 });
            ((JObject)document["screenshot"])["path"] = nonRuntimePath;
            ((JObject)document["screenshot"])["sha256"] = ComputeFileSha256(nonRuntimePath);
            Assert.That(
                DeliveryPreflightService.IsApprovedVisualRecord(document.ToString(), request),
                Is.False);
        }

        /// <summary>
        /// 质量报告的顶层证据和每项检查证据都必须存在、匹配哈希并绑定当前交付。
        /// </summary>
        [Test]
        public void IsPassingQualityReport_BoundEvidenceForReportAndChecks_Passes()
        {
            DeliveryRequest request = CreateRequest();
            string evidencePath = WriteEvidence("quality.json", new byte[] { 10, 11, 12 });
            JObject evidence = Evidence(evidencePath);
            JObject document = new JObject
            {
                ["schemaVersion"] = "1.0",
                ["taskId"] = "quality.delivery",
                ["projectId"] = request.ProjectId,
                ["sourceRevision"] = request.SourceRevision,
                ["buildVersion"] = request.Version,
                ["generatedAtUtc"] = "2026-07-27T00:00:00Z",
                ["status"] = "PASS",
                ["checks"] = new JArray
                {
                    new JObject
                    {
                        ["id"] = "build-smoke",
                        ["status"] = "PASS",
                        ["evidence"] = new JArray(evidence.DeepClone())
                    }
                },
                ["evidence"] = new JArray(evidence)
            };

            Assert.That(
                DeliveryPreflightService.IsPassingQualityReport(document.ToString(), request),
                Is.True);

            request.SourceRevision = "UNBOUND";
            document["sourceRevision"] = "UNBOUND";
            Assert.That(
                DeliveryPreflightService.IsPassingQualityReport(document.ToString(), request),
                Is.False,
                "未绑定源码修订的项目校验报告不得充当交付证据。");
            request.SourceRevision = "a1b2c3d4e5f6";
            document["sourceRevision"] = request.SourceRevision;

            document["generatedAtUtc"] = "2026-07-27T00:00:00";
            Assert.That(
                DeliveryPreflightService.IsPassingQualityReport(document.ToString(), request),
                Is.False);
            document["generatedAtUtc"] = "2026-07-27T00:00:00Z";

            ((JObject)((JArray)document["checks"])[0])["evidence"] = new JArray();
            Assert.That(
                DeliveryPreflightService.IsPassingQualityReport(document.ToString(), request),
                Is.False);
        }

        /// <summary>
        /// 创建一份满足首版 Windows 本地交付要求的请求。
        /// </summary>
        private static DeliveryRequest CreateRequest()
        {
            return new DeliveryRequest
            {
                TaskId = "delivery-test",
                ProjectId = "starfall-arena",
                SourceRevision = "a1b2c3d4e5f6",
                Platform = "Windows",
                Version = "1.0.0",
                OutputDirectory = "Artifacts/Builds/1.0.0",
                ArtifactName = "Game.exe",
                QualityReportPaths = new[] { "Artifacts/Quality/global.json" },
                VisualApprovalPaths = new[] { "Artifacts/VisualQA/approval.json" }
            };
        }

        /// <summary>
        /// 创建所有预检条件均满足的环境快照。
        /// </summary>
        private static DeliveryPreflightSnapshot CreatePassingSnapshot()
        {
            return new DeliveryPreflightSnapshot
            {
                IsWindowsTarget = true,
                BundleVersion = "1.0.0",
                EnabledBuildScenes = new[] { "Assets/Scenes/Main.unity" },
                MissingBuildScenes = Array.Empty<string>(),
                FailedQualityReports = Array.Empty<string>(),
                MissingQualityReports = Array.Empty<string>(),
                UnapprovedVisualRecords = Array.Empty<string>(),
                MissingVisualRecords = Array.Empty<string>(),
                OutputPathValid = true,
                ArtifactExists = false,
                ArtifactPath = "<project>/Artifacts/Builds/1.0.0/Game.exe"
            };
        }

        /// <summary>创建与 runtime-visual-evidence.schema.json 字段形状一致的批准记录。</summary>
        private static JObject CreateRuntimeVisualDocument(
            DeliveryRequest request,
            string screenshotPath,
            string reviewPath,
            string userPath)
        {
            const string sceneId = "scene.arena-intro";
            return new JObject
            {
                ["schemaVersion"] = "1.0",
                ["projectId"] = request.ProjectId,
                ["sceneId"] = sceneId,
                ["buildVersion"] = request.Version,
                ["sourceRevision"] = request.SourceRevision,
                ["buildArtifactSha256"] = new string('a', 64),
                ["captureSource"] = "WINDOWS_STANDALONE",
                ["screenshot"] = new JObject
                {
                    ["path"] = screenshotPath,
                    ["sha256"] = ComputeFileSha256(screenshotPath),
                    ["width"] = 1920,
                    ["height"] = 1080,
                    ["capturedAtUtc"] = "2026-07-27T00:00:00Z"
                },
                ["status"] = "APPROVED",
                ["reviews"] = new JArray(
                    Approval("INDEPENDENT_REVIEWER", sceneId, request.Version, reviewPath)),
                ["userApprovals"] = new JArray(
                    Approval("USER", sceneId, request.Version, userPath))
            };
        }

        /// <summary>创建绑定主体、版本和真实证据哈希的视觉批准记录。</summary>
        private static JObject Approval(
            string authority,
            string subjectId,
            string subjectVersion,
            string evidencePath)
        {
            JObject approval = new JObject
            {
                ["approvalType"] = "RUNTIME_VISUAL",
                ["authority"] = authority,
                ["subjectId"] = subjectId,
                ["subjectVersion"] = subjectVersion,
                ["approvedBy"] = authority == "USER" ? "user" : "reviewer",
                ["approvedAtUtc"] = "2026-07-27T00:00:00Z",
                ["evidencePath"] = evidencePath,
                ["evidenceSha256"] = ComputeFileSha256(evidencePath)
            };
            if (authority == "INDEPENDENT_REVIEWER")
            {
                approval["reviewTaskId"] = "review.runtime-visual";
                approval["reviewDiscipline"] = "QA";
            }

            return approval;
        }

        /// <summary>创建质量报告证据对象。</summary>
        private static JObject Evidence(string path)
        {
            return new JObject
            {
                ["type"] = "test",
                ["path"] = path,
                ["sha256"] = ComputeFileSha256(path)
            };
        }

        /// <summary>在测试专属目录写入证据并返回项目相对路径。</summary>
        private static string WriteEvidence(string fileName, byte[] bytes)
        {
            string relativePath = EvidenceRoot + "/" + fileName;
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(absolutePath) ?? string.Empty);
            File.WriteAllBytes(absolutePath, bytes);
            return relativePath;
        }

        /// <summary>计算项目内测试证据的 SHA-256。</summary>
        private static string ComputeFileSha256(string projectRelativePath)
        {
            using SHA256 sha256 = SHA256.Create();
            using FileStream stream = File.OpenRead(WorkflowPaths.ResolveProjectRelative(projectRelativePath));
            return BitConverter.ToString(sha256.ComputeHash(stream)).Replace("-", string.Empty).ToLowerInvariant();
        }

        /// <summary>
        /// 断言交付预检包含指定状态的检查项。
        /// </summary>
        private static void AssertCheckStatus(
            DeliveryPreflightResult result,
            string id,
            string expectedStatus)
        {
            DeliveryPreflightCheck check = result.Checks.Single(item => item.Id == id);
            Assert.That(check.Status, Is.EqualTo(expectedStatus));
        }
    }
}
