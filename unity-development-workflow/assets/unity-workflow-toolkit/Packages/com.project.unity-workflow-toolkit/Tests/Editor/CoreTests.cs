using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using Project.UnityWorkflow.Core.Models;
using UnityEngine;

namespace Project.UnityWorkflow.Core.Tests
{
    /// <summary>
    /// 验证 Core 的路径边界、Job 读取和报告原子写入约定。
    /// </summary>
    public sealed class CoreTests
    {
        private const string TestRoot = "Artifacts/__UWTCoreTests";

        /// <summary>
        /// 为每个测试创建独立于正式资产的临时证据目录。
        /// </summary>
        [SetUp]
        public void SetUp()
        {
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(TestRoot));
        }

        /// <summary>
        /// 只清理测试类自己拥有的临时目录。
        /// </summary>
        [TearDown]
        public void TearDown()
        {
            var path = WorkflowPaths.ResolveProjectRelative(TestRoot);
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }

        /// <summary>
        /// 合法项目相对路径应解析到当前项目根目录内。
        /// </summary>
        [Test]
        public void ResolveProjectRelative_ValidPath_StaysInsideProject()
        {
            var resolved = WorkflowPaths.ResolveProjectRelative(TestRoot + "/report.json");

            StringAssert.StartsWith(WorkflowPaths.ProjectRoot, resolved);
            Assert.AreEqual(TestRoot + "/report.json", WorkflowPaths.ToProjectRelative(resolved));
        }

        /// <summary>
        /// 绝对路径与父目录跳转必须在文件访问前被拒绝。
        /// </summary>
        [Test]
        public void ResolveProjectRelative_UnsafePaths_AreRejected()
        {
            Assert.Throws<ArgumentException>(() => WorkflowPaths.ResolveProjectRelative(Path.GetTempPath()));
            Assert.Throws<ArgumentException>(() => WorkflowPaths.ResolveProjectRelative("../outside.json"));
            Assert.Throws<ArgumentException>(() => WorkflowPaths.ResolveProjectRelative("Assets/../outside.json"));
        }

        /// <summary>
        /// ManifestLoader 应读取 Python 编译器的通用 Job 信封与负载。
        /// </summary>
        [Test]
        public void ManifestLoader_ValidJob_LoadsTypedPayload()
        {
            const string relativePath = TestRoot + "/project-profile.job.json";
            WriteTrustedProjectJob(relativePath);

            var job = ManifestLoader.Load<WorkflowJobDto<ProjectProfileDto>>(relativePath);

            Assert.IsTrue(job.IntegrityVerified);
            Assert.AreEqual("project-profile", job.Kind);
            Assert.AreEqual("core-test", job.Payload.ProjectId);
            Assert.AreEqual("6", job.Payload.Unity.Version);
            Assert.AreEqual("Windows", job.Payload.Delivery.Platform);
        }

        /// <summary>
        /// payload 被修改而未重新编译时，ManifestLoader 必须拒绝 Job。
        /// </summary>
        [Test]
        public void ManifestLoader_TamperedPayload_IsRejected()
        {
            const string relativePath = TestRoot + "/tampered-payload.job.json";
            var absolutePath = WriteTrustedProjectJob(relativePath);
            var json = File.ReadAllText(absolutePath, Encoding.UTF8).Replace("core-test", "tampered");
            File.WriteAllText(absolutePath, json, new UTF8Encoding(false));

            Assert.Throws<InvalidDataException>(
                () => ManifestLoader.Load<WorkflowJobDto<ProjectProfileDto>>(relativePath));
        }

        /// <summary>
        /// 源 YAML 被修改后，已有 Job 的 sourceSha256 必须失效。
        /// </summary>
        [Test]
        public void ManifestLoader_ModifiedSource_IsRejected()
        {
            const string relativePath = TestRoot + "/modified-source.job.json";
            WriteTrustedProjectJob(relativePath);
            var sourcePath = WorkflowPaths.ResolveProjectRelative(TestRoot + "/project-profile.yaml");
            File.AppendAllText(sourcePath, "# modified\n", new UTF8Encoding(false));

            Assert.Throws<InvalidDataException>(
                () => ManifestLoader.Load<WorkflowJobDto<ProjectProfileDto>>(relativePath));
        }

        /// <summary>
        /// Job 中的源路径必须安全且源文件必须仍然存在。
        /// </summary>
        [Test]
        public void ManifestLoader_UnsafeOrMissingSource_IsRejected()
        {
            const string unsafeJob = TestRoot + "/unsafe-source.job.json";
            var unsafeAbsolute = WriteTrustedProjectJob(unsafeJob);
            var unsafeJson = File.ReadAllText(unsafeAbsolute, Encoding.UTF8)
                .Replace(TestRoot + "/project-profile.yaml", "../outside.yaml");
            File.WriteAllText(unsafeAbsolute, unsafeJson, new UTF8Encoding(false));
            Assert.Throws<ArgumentException>(
                () => ManifestLoader.Load<WorkflowJobDto<ProjectProfileDto>>(unsafeJob));

            const string missingJob = TestRoot + "/missing-source.job.json";
            WriteTrustedProjectJob(missingJob);
            File.Delete(WorkflowPaths.ResolveProjectRelative(TestRoot + "/project-profile.yaml"));
            Assert.Throws<FileNotFoundException>(
                () => ManifestLoader.Load<WorkflowJobDto<ProjectProfileDto>>(missingJob));
        }

        /// <summary>
        /// 未知 Schema 版本必须显式失败，不能由 JsonUtility 静默忽略。
        /// </summary>
        [Test]
        public void ManifestLoader_UnknownSchemaVersion_IsRejected()
        {
            const string relativePath = TestRoot + "/unknown.json";
            File.WriteAllText(
                WorkflowPaths.ResolveProjectRelative(relativePath),
                "{\"schemaVersion\":\"2.0\"}",
                new UTF8Encoding(false));

            Assert.Throws<NotSupportedException>(() => ManifestLoader.Load<ProjectProfileDto>(relativePath));
        }

        /// <summary>
        /// ApprovalDto 必须按公共 Schema 的 lowerCamelCase 字段完整映射批准身份与独立审查信息。
        /// </summary>
        [Test]
        public void ApprovalDto_JsonUtilityMapsCompleteApprovalContract()
        {
            const string json = "{\"approvalType\":\"GAME_VISUAL\",\"authority\":\"INDEPENDENT_REVIEWER\"," +
                                "\"subjectId\":\"visual.player\",\"subjectVersion\":\"visual-v2\"," +
                                "\"approvedBy\":\"reviewer\",\"approvedAtUtc\":\"2026-07-27T00:00:00Z\"," +
                                "\"evidencePath\":\"Artifacts/Approvals/review.json\"," +
                                "\"evidenceSha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"," +
                                "\"reviewTaskId\":\"review.visual-player\",\"reviewDiscipline\":\"UNITY_FEASIBILITY\"}";

            ApprovalDto approval = JsonUtility.FromJson<ApprovalDto>(json);

            Assert.AreEqual("GAME_VISUAL", approval.ApprovalType);
            Assert.AreEqual("INDEPENDENT_REVIEWER", approval.Authority);
            Assert.AreEqual("visual.player", approval.SubjectId);
            Assert.AreEqual("visual-v2", approval.SubjectVersion);
            Assert.AreEqual(new string('a', 64), approval.EvidenceSha256);
            Assert.AreEqual("review.visual-player", approval.ReviewTaskId);
            Assert.AreEqual("UNITY_FEASIBILITY", approval.ReviewDiscipline);
        }

        /// <summary>
        /// 报告应无 BOM 保存中文，并允许通过原子替换更新已有报告。
        /// </summary>
        [Test]
        public void ReportWriter_WritesUtf8AndAtomicallyReplacesExistingReport()
        {
            const string relativePath = TestRoot + "/quality.json";
            var report = CreateQualityReport("首次检查");
            ReportWriter.Write(relativePath, report);
            report.Checks[0].Message = "更新后的中文检查";

            var absolutePath = ReportWriter.Write(relativePath, report);
            var bytes = File.ReadAllBytes(absolutePath);
            var text = File.ReadAllText(absolutePath, new UTF8Encoding(false, true));

            Assert.IsFalse(bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF);
            StringAssert.Contains("更新后的中文检查", text);
            StringAssert.DoesNotContain("首次检查", text);
        }

        /// <summary>
        /// 不可变报告写入必须在目标已存在时拒绝覆盖原始审计事实。
        /// </summary>
        [Test]
        public void ReportWriter_WriteNew_RejectsExistingReport()
        {
            const string relativePath = TestRoot + "/immutable.json";
            ReportWriter.WriteNew(relativePath, CreateQualityReport("原始事实"));

            Assert.Throws<IOException>(() =>
                ReportWriter.WriteNew(relativePath, CreateQualityReport("并发覆盖")));
            StringAssert.Contains(
                "原始事实",
                File.ReadAllText(WorkflowPaths.ResolveProjectRelative(relativePath), Encoding.UTF8));
        }

        /// <summary>
        /// 编译、资源刷新、播放模式切换和脏场景都必须形成稳定的阻断代码。
        /// </summary>
        [Test]
        public void EditorStabilityGuard_UnstableStates_AreRejected()
        {
            var cases = new[]
            {
                (
                    new EditorStabilitySnapshot { IsCompiling = true },
                    "editor.compiling",
                    false),
                (
                    new EditorStabilitySnapshot { IsUpdating = true },
                    "editor.asset-update",
                    false),
                (
                    new EditorStabilitySnapshot
                    {
                        IsPlaying = false,
                        IsPlayingOrWillChangePlaymode = true
                    },
                    "editor.playmode-transition",
                    true),
                (
                    new EditorStabilitySnapshot { IsPlaying = true, IsPlayingOrWillChangePlaymode = true },
                    "editor.playmode-write",
                    false),
                (
                    new EditorStabilitySnapshot { HasDirtyScenes = true },
                    "editor.scene-dirty",
                    true)
            };

            foreach (var testCase in cases)
            {
                EditorStabilityResult result = EditorStabilityGuard.Evaluate(
                    testCase.Item1,
                    testCase.Item3);
                Assert.IsFalse(result.IsStable);
                Assert.AreEqual(testCase.Item2, result.ErrorCode);
            }
        }

        /// <summary>
        /// 稳定 Edit Mode 和明确允许的稳定 Play Mode 应通过守卫。
        /// </summary>
        [Test]
        public void EditorStabilityGuard_StableStates_Pass()
        {
            EditorStabilityResult editMode = EditorStabilityGuard.Evaluate(
                new EditorStabilitySnapshot(),
                false);
            EditorStabilityResult playModeCapture = EditorStabilityGuard.Evaluate(
                new EditorStabilitySnapshot
                {
                    IsPlaying = true,
                    IsPlayingOrWillChangePlaymode = true
                },
                true);

            Assert.IsTrue(editMode.IsStable);
            Assert.IsTrue(playModeCapture.IsStable);
        }

        /// <summary>创建包含中文消息的最小合法质量报告。</summary>
        private static QualityReportDto CreateQualityReport(string message)
        {
            return new QualityReportDto
            {
                TaskId = "core.report",
                GeneratedAtUtc = "2026-07-27T00:00:00Z",
                Status = "PASS",
                Checks = new List<QualityCheckDto>
                {
                    new QualityCheckDto
                    {
                        Id = "core.path",
                        Category = "static",
                        Status = "PASS",
                        Message = message
                    }
                }
            };
        }

        /// <summary>写入带有效源哈希与规范化 payload 哈希的项目画像 Job。</summary>
        private static string WriteTrustedProjectJob(string relativePath)
        {
            const string sourceRelativePath = TestRoot + "/project-profile.yaml";
            var sourceBytes = Encoding.UTF8.GetBytes("schemaVersion: '1.0'\nprojectId: core-test\n");
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(sourceRelativePath), sourceBytes);
            const string payload = "{\"delivery\":{\"platform\":\"Windows\"}," +
                                   "\"projectId\":\"core-test\",\"schemaVersion\":\"1.0\"," +
                                   "\"unity\":{\"renderPipeline\":\"URP\",\"version\":\"6\"}}";
            var json = "{\"schemaVersion\":\"1.0\",\"kind\":\"project-profile\"," +
                       $"\"sourcePath\":\"{sourceRelativePath}\"," +
                       $"\"sourceSha256\":\"{ComputeSha256(sourceBytes)}\"," +
                       $"\"payloadSha256\":\"{ComputeSha256(Encoding.UTF8.GetBytes(payload))}\"," +
                       "\"compiledAtUtc\":\"2026-07-27T00:00:00Z\"," +
                       $"\"payload\":{payload}}}";
            var absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            File.WriteAllText(absolutePath, json, new UTF8Encoding(false));
            return absolutePath;
        }

        /// <summary>计算测试信任链使用的小写 SHA-256。</summary>
        private static string ComputeSha256(byte[] bytes)
        {
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
    }
}
