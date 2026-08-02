using System;
using System.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ProjectValidation;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>
    /// 验证项目校验服务的核心门禁和结构化报告行为。
    /// </summary>
    public sealed class ProjectValidationTests
    {
        /// <summary>
        /// 验证满足 Unity 6、URP、主开发平台和项目完整性要求时报告通过。
        /// </summary>
        [Test]
        public void Evaluate_ValidSnapshot_ReturnsPass()
        {
            ProjectValidationService service = new ProjectValidationService();

            QualityReportDto report = service.Evaluate(CreateProfile(), CreatePassingSnapshot());

            Assert.That(report.Status, Is.EqualTo("PASS"));
            Assert.That(report.TaskId, Is.EqualTo("project-validation"));
            Assert.That(report.ProjectId, Is.EqualTo("test-project"));
            Assert.That(report.SourceRevision, Is.EqualTo("UNBOUND"));
            Assert.That(report.BuildVersion, Is.EqualTo(PlayerSettings.bundleVersion));
            Assert.That(report.Checks, Has.Count.EqualTo(8));
            Assert.That(report.Checks.All(check => check.Status == "PASS"), Is.True);
        }

        /// <summary>
        /// 验证版本、URP、构建目标和场景列表均会形成独立失败项。
        /// </summary>
        [Test]
        public void Evaluate_InvalidPlatformConfiguration_ReportsEveryFailure()
        {
            ProjectValidationSnapshot snapshot = CreatePassingSnapshot();
            snapshot.UnityVersion = "2022.3.0f1";
            snapshot.IsUrp = false;
            snapshot.ActivePlatformId = "ANDROID";
            snapshot.EnabledBuildScenes = Array.Empty<string>();

            QualityReportDto report = new ProjectValidationService().Evaluate(CreateProfile(), snapshot);

            Assert.That(report.Status, Is.EqualTo("FAIL"));
            AssertCheckStatus(report, "unity-version", "FAIL");
            AssertCheckStatus(report, "render-pipeline", "FAIL");
            AssertCheckStatus(report, "build-target", "FAIL");
            AssertCheckStatus(report, "build-scenes", "FAIL");
        }

        /// <summary>
        /// 验证缺失引用、程序集循环依赖和 Console 新增错误均阻止通过。
        /// </summary>
        [Test]
        public void Evaluate_ProjectIntegrityFailures_ReturnsFail()
        {
            ProjectValidationSnapshot snapshot = CreatePassingSnapshot();
            snapshot.MissingBuildScenes = new[] { "Assets/Scenes/Missing.unity" };
            snapshot.MissingAssetReferences = new[] { "Assets/Scenes/Main.unity -> deadbeefdeadbeefdeadbeefdeadbeef" };
            snapshot.AssemblyDependencyCycles = new[] { "Game.A -> Game.B -> Game.A" };
            snapshot.ConsoleErrorCount = 2;
            snapshot.ConsoleErrorBaseline = 1;

            QualityReportDto report = new ProjectValidationService().Evaluate(CreateProfile(), snapshot);

            Assert.That(report.Status, Is.EqualTo("FAIL"));
            AssertCheckStatus(report, "build-scenes", "FAIL");
            AssertCheckStatus(report, "asset-references", "FAIL");
            AssertCheckStatus(report, "assembly-cycles", "FAIL");
            AssertCheckStatus(report, "console-errors", "FAIL");
        }

        /// <summary>
        /// 验证无法读取 Console 计数时返回 BLOCKED，而不是错误地自动批准。
        /// </summary>
        [Test]
        public void Evaluate_ConsoleCountUnavailable_ReturnsBlocked()
        {
            ProjectValidationSnapshot snapshot = CreatePassingSnapshot();
            snapshot.ConsoleCountAvailable = false;

            QualityReportDto report = new ProjectValidationService().Evaluate(CreateProfile(), snapshot);

            Assert.That(report.Status, Is.EqualTo("BLOCKED"));
            AssertCheckStatus(report, "console-errors", "BLOCKED");
        }

        /// <summary>
        /// 验证 iPadOS 主平台可以使用 Unity 共用的 iOS BuildTarget。
        /// </summary>
        [Test]
        public void Evaluate_IpadPrimaryWithIosBuildTarget_Passes()
        {
            const string json = "{\"schemaVersion\":\"1.0\",\"projectId\":\"test-project\",\"unity\":{\"version\":\"6\",\"renderPipeline\":\"URP\"},\"delivery\":{\"platformSelectionStatus\":\"APPROVED\",\"primaryDevelopmentPlatform\":\"IPADOS\",\"targets\":[{\"platformId\":\"IPADOS\"}]}}";
            ProjectProfileDto profile = JsonUtility.FromJson<ProjectProfileDto>(json);
            ProjectValidationSnapshot snapshot = CreatePassingSnapshot();
            snapshot.ActivePlatformId = "IOS";

            QualityReportDto report = new ProjectValidationService().Evaluate(profile, snapshot);

            AssertCheckStatus(report, "platform-selection", "PASS");
            AssertCheckStatus(report, "build-target", "PASS");
        }

        /// <summary>
        /// 创建与项目契约相同字段命名的测试配置，避免测试依赖 DTO 内部嵌套类型名。
        /// </summary>
        private static ProjectProfileDto CreateProfile()
        {
            const string json = "{\"schemaVersion\":\"1.0\",\"projectId\":\"test-project\",\"unity\":{\"version\":\"6\",\"renderPipeline\":\"URP\"},\"delivery\":{\"platformSelectionStatus\":\"APPROVED\",\"primaryDevelopmentPlatform\":\"WINDOWS\",\"targets\":[{\"platformId\":\"WINDOWS\"}]}}";
            return JsonUtility.FromJson<ProjectProfileDto>(json);
        }

        /// <summary>
        /// 创建所有项目门禁均通过的状态快照。
        /// </summary>
        private static ProjectValidationSnapshot CreatePassingSnapshot()
        {
            return new ProjectValidationSnapshot
            {
                UnityVersion = "6000.0.50f1",
                IsUrp = true,
                ActivePlatformId = "WINDOWS",
                EnabledBuildScenes = new[] { "Assets/Scenes/Main.unity" },
                MissingBuildScenes = Array.Empty<string>(),
                MissingAssetReferences = Array.Empty<string>(),
                AssemblyDependencyCycles = Array.Empty<string>(),
                ConsoleErrorCount = 0,
                ConsoleErrorBaseline = 0,
                ConsoleCountAvailable = true
            };
        }

        /// <summary>
        /// 断言指定质量检查存在且具有预期状态。
        /// </summary>
        private static void AssertCheckStatus(QualityReportDto report, string id, string expectedStatus)
        {
            QualityCheckDto check = report.Checks.Single(item => item.Id == id);
            Assert.That(check.Status, Is.EqualTo(expectedStatus));
        }
    }
}
