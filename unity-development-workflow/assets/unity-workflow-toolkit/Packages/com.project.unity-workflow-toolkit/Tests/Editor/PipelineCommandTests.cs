using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.BuildPipeline;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ImagePipeline;
using Project.UnityWorkflow.PipelineCommands;
using Project.UnityWorkflow.VisualQA;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.Tests
{
    /// <summary>
    /// 验证 Unity Pipeline 命令的 API 形状、入口保护和四项业务服务转发。
    /// </summary>
    public sealed class PipelineCommandTests
    {
        private static readonly Type[] CommandTypes =
        {
            typeof(ValidateProjectCommand),
            typeof(ImportImageCommand),
            typeof(CaptureVisualCommand),
            typeof(DeliveryPreflightCommand)
        };

        /// <summary>
        /// 确认四个命令使用稳定名称、主线程执行、字符串 Job 参数和统一结果类型。
        /// </summary>
        [Test]
        public void CommandDefinitions_UseStableNamesAndExactHandlerSignature()
        {
            string[] names = CommandTypes.Select(type =>
            {
                MethodInfo handler = type.GetMethod(
                    "Execute",
                    BindingFlags.Public | BindingFlags.Static,
                    null,
                    new[] { typeof(string) },
                    null);
                Assert.That(handler, Is.Not.Null, type.Name + " 缺少 Execute(string)。");
                Assert.That(handler.ReturnType, Is.EqualTo(typeof(PipelineCommandResult)));

                CliCommandAttribute commandAttribute = handler.GetCustomAttribute<CliCommandAttribute>();
                Assert.That(commandAttribute, Is.Not.Null, type.Name + " 缺少 CliCommand 特性。");

                PropertyInfo mainThreadProperty = typeof(CliCommandAttribute).GetProperty("MainThreadRequired");
                Assert.That(mainThreadProperty, Is.Not.Null, "CliCommand 缺少 MainThreadRequired 属性。");
                Assert.That(mainThreadProperty.GetValue(commandAttribute), Is.EqualTo(true));

                ParameterInfo jobPath = handler.GetParameters()[0];
                Assert.That(jobPath.Name, Is.EqualTo("jobPath"));
                Assert.That(jobPath.GetCustomAttribute<CliArgAttribute>(), Is.Not.Null);
                return (string)handler.GetCustomAttributesData()
                    .Single(attribute => attribute.AttributeType == typeof(CliCommandAttribute))
                    .ConstructorArguments[0]
                    .Value;
            }).ToArray();

            Assert.That(names, Is.EquivalentTo(new[]
            {
                "uwt_validate_project",
                "uwt_import_image",
                "uwt_capture_visual",
                "uwt_delivery_preflight"
            }));
            Assert.That(names.Distinct(StringComparer.Ordinal).Count(), Is.EqualTo(names.Length));
        }

        /// <summary>确认四个命令在缺少 Job 路径时返回失败信封而不是抛出异常。</summary>
        [Test]
        public void Execute_WithoutJobPath_ReturnsFailureResult()
        {
            PipelineCommandResult[] results =
            {
                ValidateProjectCommand.Execute(null),
                ImportImageCommand.Execute(string.Empty),
                CaptureVisualCommand.Execute("   "),
                DeliveryPreflightCommand.Execute(null)
            };

            Assert.That(results.All(result => result != null && !result.Success), Is.True);
            Assert.That(results.All(result => result.Data == null), Is.True);
        }

        /// <summary>确认缺失 Job 的底层绝对路径不会进入可共享的错误消息。</summary>
        [Test]
        public void Execute_MissingJob_DoesNotLeakProjectRoot()
        {
            string relativePath = "Library/UwtPipelineCommandTests/missing-" + Guid.NewGuid().ToString("N") + ".json";
            PipelineCommandResult result = ValidateProjectCommand.Execute(relativePath);

            Assert.That(result.Success, Is.False);
            Assert.That(result.Message, Does.Not.Contain(WorkflowPaths.ProjectRoot));
            Assert.That(result.Message, Does.Not.Contain(relativePath));
        }

        /// <summary>确认父目录跳转和绝对路径无法绕过项目边界。</summary>
        /// <param name="jobPath">应被拒绝的不安全路径。</param>
        [TestCase("../outside.json")]
        [TestCase("C:\\sensitive\\job.json")]
        public void Execute_WithUnsafePath_ReturnsFailureResult(string jobPath)
        {
            PipelineCommandResult result = ValidateProjectCommand.Execute(jobPath);

            Assert.That(result.Success, Is.False);
            Assert.That(result.Message, Does.Not.Contain(jobPath));
        }

        /// <summary>确认每个命令都拒绝不属于自身契约类型的编译 Job。</summary>
        [Test]
        public void Execute_WithWrongKind_ReturnsFailureForEveryCommand()
        {
            string jobPath = WriteJob("unexpected-kind", new JObject());
            try
            {
                PipelineCommandResult[] results =
                {
                    ValidateProjectCommand.Execute(jobPath),
                    ImportImageCommand.Execute(jobPath),
                    CaptureVisualCommand.Execute(jobPath),
                    DeliveryPreflightCommand.Execute(jobPath)
                };

                Assert.That(results.All(result => !result.Success), Is.True);
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>确认命令拒绝 payload 被修改但 payloadSha256 未更新的 Job。</summary>
        [Test]
        public void Execute_WithTamperedPayload_ReturnsFailureResult()
        {
            string jobPath = WriteJob("project-profile", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["projectId"] = "before-tamper"
            });
            try
            {
                string absolutePath = WorkflowPaths.ResolveProjectRelative(jobPath);
                JObject job = JObject.Parse(File.ReadAllText(absolutePath));
                job["payload"]["projectId"] = "after-tamper";
                File.WriteAllText(absolutePath, job.ToString());

                PipelineCommandResult result = ValidateProjectCommand.Execute(jobPath);

                Assert.That(result.Success, Is.False);
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>确认命令拒绝源契约被修改而 sourceSha256 未更新的 Job。</summary>
        [Test]
        public void Execute_WithModifiedSource_ReturnsFailureResult()
        {
            string jobPath = WriteJob("project-profile", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["projectId"] = "source-test"
            });
            try
            {
                string sourcePath = Path.ChangeExtension(jobPath, ".source.yaml").Replace('\\', '/');
                File.AppendAllText(WorkflowPaths.ResolveProjectRelative(sourcePath), "# tampered\n");

                PipelineCommandResult result = ValidateProjectCommand.Execute(jobPath);

                Assert.That(result.Success, Is.False);
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>确认合法 project-profile Job 会调用项目校验服务并保持业务状态。</summary>
        [Test]
        public void ValidateProjectCommand_WithValidJob_ReturnsQualityReport()
        {
            string jobPath = WriteJob("project-profile", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["projectId"] = "pipeline-command-test",
                ["unity"] = new JObject
                {
                    ["version"] = "6",
                    ["renderPipeline"] = "URP"
                },
                ["delivery"] = new JObject
                {
                    ["platform"] = "Windows",
                    ["distributionChannel"] = "local"
                }
            });

            try
            {
                PipelineCommandResult result = ValidateProjectCommand.Execute(jobPath);
                QualityReportDto report = GetData<QualityReportDto>(result);
                Assert.That(result.Success, Is.EqualTo(string.Equals(report.Status, "PASS", StringComparison.Ordinal)));
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>确认合法 image-task Job 会调用图片导入服务并保留业务失败状态。</summary>
        [Test]
        public void ImportImageCommand_WithValidJob_ReturnsImageImportResult()
        {
            string taskId = "image-test-" + Guid.NewGuid().ToString("N");
            string jobPath = WriteJob("image-task", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["id"] = taskId,
                ["resourceId"] = "ui.image-test",
                ["sourceVersion"] = "visual-v1",
                ["output"] = new JObject
                {
                    ["aspectRatio"] = "1:1",
                    ["alphaRequired"] = true,
                    ["targetPath"] = "Assets/Art/Runtime/UI",
                    ["filename"] = "missing-test.png"
                },
                ["unityImport"] = new JObject
                {
                    ["textureType"] = "Sprite",
                    ["spriteMode"] = "Single",
                    ["pixelsPerUnit"] = 100,
                    ["filterMode"] = "Bilinear",
                    ["wrapMode"] = "Clamp",
                    ["maxSize"] = 2048,
                    ["compression"] = "HighQuality",
                    ["sRgb"] = true,
                    ["alphaIsTransparency"] = true,
                    ["mipmaps"] = false,
                    ["readWriteEnabled"] = false
                },
                ["status"] = "APPROVED",
                ["approvals"] = new JArray()
            });

            try
            {
                PipelineCommandResult result = ImportImageCommand.Execute(jobPath);
                ImageImportResult importResult = GetData<ImageImportResult>(result);
                Assert.That(result.Success, Is.EqualTo(importResult.Success));
                Assert.That(result.Success, Is.False);
            }
            finally
            {
                DeleteJob(jobPath);
                DeleteProjectFile("Artifacts/ImagePipeline/" + taskId + "-import-report.json");
            }
        }

        /// <summary>确认合法 visual-capture Job 会调用截图服务并返回业务失败。</summary>
        [Test]
        public void CaptureVisualCommand_WithValidJob_ReturnsCaptureResult()
        {
            string jobPath = WriteJob("visual-capture", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["taskId"] = "visual-test",
                ["cameraPath"] = string.Empty,
                ["allowMainCamera"] = false,
                ["width"] = 1280,
                ["height"] = 720,
                ["outputPath"] = "Artifacts/VisualQA/visual-test/test.png"
            });

            try
            {
                PipelineCommandResult result = CaptureVisualCommand.Execute(jobPath);
                VisualCaptureResult captureResult = GetData<VisualCaptureResult>(result);
                Assert.That(result.Success, Is.EqualTo(string.Equals(captureResult.Status, "PASS", StringComparison.Ordinal)));
                Assert.That(result.Success, Is.False);
                Assert.That(captureResult.ErrorCode, Is.EqualTo("INVALID_RESOLUTION"));
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>确认合法 delivery-preflight Job 会调用交付服务并返回业务失败。</summary>
        [Test]
        public void DeliveryPreflightCommand_WithValidJob_ReturnsPreflightResult()
        {
            string jobPath = WriteJob("delivery-preflight", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["taskId"] = "delivery-test",
                ["projectId"] = "starfall-arena",
                ["sourceRevision"] = "a1b2c3d4e5f6",
                ["platform"] = "Windows",
                ["version"] = string.Empty,
                ["outputDirectory"] = "Artifacts/Windows/Test",
                ["artifactName"] = "Game.exe",
                ["qualityReportPaths"] = new JArray(),
                ["visualApprovalPaths"] = new JArray()
            });

            try
            {
                PipelineCommandResult result = DeliveryPreflightCommand.Execute(jobPath);
                DeliveryPreflightResult preflight = GetData<DeliveryPreflightResult>(result);
                Assert.That(result.Success, Is.EqualTo(string.Equals(preflight.Status, "PASS", StringComparison.Ordinal)));
                Assert.That(result.Success, Is.False);
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>写入一个包含通用信封的临时编译 Job，并返回项目相对路径。</summary>
        /// <param name="kind">Job 契约类型。</param>
        /// <param name="payload">Job 负载对象。</param>
        /// <returns>项目相对 Job 路径。</returns>
        private static string WriteJob(string kind, JObject payload)
        {
            string relativePath = "Library/UwtPipelineCommandTests/" + Guid.NewGuid().ToString("N") + ".json";
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(absolutePath));
            string sourcePath = Path.ChangeExtension(relativePath, ".source.yaml").Replace('\\', '/');
            byte[] sourceBytes = Encoding.UTF8.GetBytes("kind: " + kind + "\n");
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(sourcePath), sourceBytes);
            JObject job = new JObject
            {
                ["schemaVersion"] = "1.0",
                ["kind"] = kind,
                ["sourcePath"] = sourcePath,
                ["sourceSha256"] = ComputeSha256(sourceBytes),
                ["payloadSha256"] = ComputeSha256(Encoding.UTF8.GetBytes(Canonicalize(payload))),
                ["compiledAtUtc"] = "2026-07-27T00:00:00Z",
                ["payload"] = payload
            };
            File.WriteAllText(absolutePath, job.ToString());
            return relativePath;
        }

        /// <summary>从统一结果信封中读取并验证结构化业务数据。</summary>
        /// <typeparam name="T">预期业务结果类型。</typeparam>
        /// <param name="result">命令返回的结果信封。</param>
        /// <returns>已验证类型的业务结果。</returns>
        private static T GetData<T>(PipelineCommandResult result) where T : class
        {
            Assert.That(result, Is.Not.Null);
            Assert.That(result.Data, Is.TypeOf<T>());
            return (T)result.Data;
        }

        /// <summary>删除测试创建的临时 Job，不影响其他测试证据。</summary>
        /// <param name="jobPath">项目相对 Job 路径。</param>
        private static void DeleteJob(string jobPath)
        {
            DeleteProjectFile(Path.ChangeExtension(jobPath, ".source.yaml").Replace('\\', '/'));
            DeleteProjectFile(jobPath);
        }

        /// <summary>按序数递归排序对象属性并生成无空白 JSON。</summary>
        /// <param name="token">待规范化的 JSON 节点。</param>
        /// <returns>规范化后的 JSON 文本。</returns>
        private static string Canonicalize(JToken token)
        {
            return SortToken(token).ToString(Formatting.None);
        }

        /// <summary>复制 JSON，同时保持数组顺序并排序所有对象键。</summary>
        /// <param name="token">待排序的 JSON 节点。</param>
        /// <returns>排序后的 JSON 节点。</returns>
        private static JToken SortToken(JToken token)
        {
            if (token is JObject sourceObject)
            {
                JObject ordered = new JObject();
                foreach (JProperty property in sourceObject.Properties().OrderBy(
                             item => item.Name,
                             StringComparer.Ordinal))
                {
                    ordered.Add(property.Name, SortToken(property.Value));
                }

                return ordered;
            }

            if (token is JArray sourceArray)
            {
                JArray ordered = new JArray();
                foreach (JToken item in sourceArray)
                {
                    ordered.Add(SortToken(item));
                }

                return ordered;
            }

            return token.DeepClone();
        }

        /// <summary>计算小写十六进制 SHA-256。</summary>
        /// <param name="bytes">待计算的字节序列。</param>
        /// <returns>小写 SHA-256 文本。</returns>
        private static string ComputeSha256(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>删除指定项目相对路径的测试文件，不递归删除目录。</summary>
        /// <param name="projectRelativePath">待删除的项目相对路径。</param>
        private static void DeleteProjectFile(string projectRelativePath)
        {
            string absolutePath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            if (File.Exists(absolutePath))
            {
                File.Delete(absolutePath);
            }
        }
    }
}
