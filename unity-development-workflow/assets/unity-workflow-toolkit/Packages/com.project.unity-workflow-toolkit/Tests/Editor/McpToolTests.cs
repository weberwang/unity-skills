using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using MCPForUnity.Editor.Helpers;
using MCPForUnity.Editor.Tools;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.BuildPipeline;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ImagePipeline;
using Project.UnityWorkflow.McpTools;
using Project.UnityWorkflow.VisualQA;

namespace Project.UnityWorkflow.Tests
{
    /// <summary>
    /// 验证 Toolkit 自定义工具的 v10 API 形状、入口保护和业务服务转发。
    /// </summary>
    public sealed class McpToolTests
    {
        private static readonly Type[] ToolTypes =
        {
            typeof(ValidateProjectTool),
            typeof(ImportImageTool),
            typeof(CaptureVisualTool),
            typeof(DeliveryPreflightTool)
        };

        /// <summary>
        /// 确认四个工具使用不重复的显式名称并满足 CommandRegistry 的精确处理器签名。
        /// </summary>
        [Test]
        public void ToolDefinitions_UseUniqueNamesAndExactHandlerSignature()
        {
            string[] names = ToolTypes.Select(type =>
            {
                McpForUnityToolAttribute attribute = type.GetCustomAttribute<McpForUnityToolAttribute>();
                Assert.That(attribute, Is.Not.Null, type.Name + " 缺少 McpForUnityTool 特性。");
                Assert.That(attribute.AutoRegister, Is.True, type.Name + " 必须默认注册。");
                Assert.That(attribute.Group, Is.EqualTo("core"));

                MethodInfo handler = type.GetMethod(
                    "HandleCommand",
                    BindingFlags.Public | BindingFlags.Static,
                    null,
                    new[] { typeof(JObject) },
                    null);
                Assert.That(handler, Is.Not.Null, type.Name + " 缺少精确的 HandleCommand(JObject)。");
                Assert.That(handler.ReturnType, Is.EqualTo(typeof(object)));

                Type parametersType = type.GetNestedType("Parameters", BindingFlags.Public);
                Assert.That(parametersType, Is.Not.Null, type.Name + " 缺少公开的 Parameters 元数据类型。");
                PropertyInfo jobPathProperty = parametersType.GetProperty("job_path");
                Assert.That(jobPathProperty, Is.Not.Null, type.Name + " 缺少 job_path 属性。");
                Assert.That(
                    jobPathProperty.GetCustomAttribute<ToolParameterAttribute>(),
                    Is.Not.Null,
                    type.Name + " 的 job_path 缺少 ToolParameter 特性。");
                return attribute.Name;
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

        /// <summary>
        /// 确认全部工具在缺少 `job_path` 时返回 ErrorResponse，而不是抛出异常。
        /// </summary>
        [Test]
        public void HandleCommand_WithoutJobPath_ReturnsErrorResponse()
        {
            object[] responses =
            {
                ValidateProjectTool.HandleCommand(new JObject()),
                ImportImageTool.HandleCommand(new JObject()),
                CaptureVisualTool.HandleCommand(new JObject()),
                DeliveryPreflightTool.HandleCommand(new JObject())
            };

            Assert.That(responses.All(response => response is ErrorResponse), Is.True);
        }

        /// <summary>
        /// 确认缺失 Job 的底层绝对路径不会进入可共享的 MCP 错误。
        /// </summary>
        [Test]
        public void HandleCommand_MissingJob_DoesNotLeakProjectRoot()
        {
            string relativePath = "Library/UwtMcpToolTests/missing-" + Guid.NewGuid().ToString("N") + ".json";
            object response = ValidateProjectTool.HandleCommand(new JObject
            {
                ["job_path"] = relativePath
            });

            Assert.That(response, Is.TypeOf<ErrorResponse>());
            ErrorResponse error = (ErrorResponse)response;
            Assert.That(error.Error, Does.Not.Contain(WorkflowPaths.ProjectRoot));
            Assert.That(error.Error, Does.Not.Contain(relativePath));
        }

        /// <summary>
        /// 确认父目录跳转和绝对路径都无法绕过项目边界。
        /// </summary>
        /// <param name="jobPath">应被拒绝的不安全路径。</param>
        [TestCase("../outside.json")]
        [TestCase("C:\\sensitive\\job.json")]
        public void HandleCommand_WithUnsafePath_ReturnsErrorResponse(string jobPath)
        {
            object response = ValidateProjectTool.HandleCommand(new JObject
            {
                ["job_path"] = jobPath
            });

            Assert.That(response, Is.TypeOf<ErrorResponse>());
            Assert.That(((ErrorResponse)response).Error, Does.Not.Contain(jobPath));
        }

        /// <summary>
        /// 确认每个工具都拒绝不属于自身契约类型的编译 Job。
        /// </summary>
        [Test]
        public void HandleCommand_WithWrongKind_ReturnsErrorResponseForEveryTool()
        {
            string jobPath = WriteJob("unexpected-kind", new JObject());
            try
            {
                object[] responses =
                {
                    ValidateProjectTool.HandleCommand(JobParameters(jobPath)),
                    ImportImageTool.HandleCommand(JobParameters(jobPath)),
                    CaptureVisualTool.HandleCommand(JobParameters(jobPath)),
                    DeliveryPreflightTool.HandleCommand(JobParameters(jobPath))
                };

                Assert.That(responses.All(response => response is ErrorResponse), Is.True);
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// MCP 工具必须拒绝 payload 被修改但 payloadSha256 未更新的 Job。
        /// </summary>
        [Test]
        public void HandleCommand_WithTamperedPayload_ReturnsErrorResponse()
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

                object response = ValidateProjectTool.HandleCommand(JobParameters(jobPath));

                Assert.That(response, Is.TypeOf<ErrorResponse>());
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// MCP 工具必须拒绝源契约被修改而 sourceSha256 未更新的 Job。
        /// </summary>
        [Test]
        public void HandleCommand_WithModifiedSource_ReturnsErrorResponse()
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

                object response = ValidateProjectTool.HandleCommand(JobParameters(jobPath));

                Assert.That(response, Is.TypeOf<ErrorResponse>());
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// 确认合法 project-profile Job 会调用项目校验服务并返回质量报告。
        /// </summary>
        [Test]
        public void ValidateProjectTool_WithValidJob_ReturnsQualityReport()
        {
            string jobPath = WriteJob("project-profile", new JObject
            {
                ["schemaVersion"] = "1.0",
                ["projectId"] = "mcp-tool-test",
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
                object response = ValidateProjectTool.HandleCommand(JobParameters(jobPath));
                QualityReportDto report = GetResponseData<QualityReportDto>(response);
                Assert.That(response is SuccessResponse, Is.EqualTo(report.Status == "PASS"));
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// 确认合法 image-task Job 会调用图片导入服务并返回结构化导入结果。
        /// </summary>
        [Test]
        public void ImportImageTool_WithValidJob_ReturnsImageImportResult()
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
                object response = ImportImageTool.HandleCommand(JobParameters(jobPath));
                Assert.That(response, Is.TypeOf<ErrorResponse>());
                ImageImportResult result = GetResponseData<ImageImportResult>(response);
                Assert.That(result.Success, Is.False);
            }
            finally
            {
                DeleteJob(jobPath);
                DeleteProjectFile("Artifacts/ImagePipeline/" + taskId + "-import-report.json");
            }
        }

        /// <summary>
        /// 确认合法 visual-capture Job 会调用截图服务并返回结构化业务结果。
        /// </summary>
        [Test]
        public void CaptureVisualTool_WithValidJob_ReturnsCaptureResult()
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
                object response = CaptureVisualTool.HandleCommand(JobParameters(jobPath));
                Assert.That(response, Is.TypeOf<ErrorResponse>());
                VisualCaptureResult result = GetResponseData<VisualCaptureResult>(response);
                Assert.That(result.ErrorCode, Is.EqualTo("INVALID_RESOLUTION"));
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// 确认合法 delivery-preflight Job 会调用交付服务并返回预检结果。
        /// </summary>
        [Test]
        public void DeliveryPreflightTool_WithValidJob_ReturnsPreflightResult()
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
                object response = DeliveryPreflightTool.HandleCommand(JobParameters(jobPath));
                Assert.That(response, Is.TypeOf<ErrorResponse>());
                DeliveryPreflightResult result = GetResponseData<DeliveryPreflightResult>(response);
                Assert.That(result.Status, Is.EqualTo("FAIL"));
            }
            finally
            {
                DeleteJob(jobPath);
            }
        }

        /// <summary>
        /// 写入一个包含通用信封的临时编译 Job，并返回项目相对路径。
        /// </summary>
        private static string WriteJob(string kind, JObject payload)
        {
            string relativePath = "Library/UwtMcpToolTests/" + Guid.NewGuid().ToString("N") + ".json";
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

        /// <summary>
        /// 构造仅包含 `job_path` 的 MCP 参数。
        /// </summary>
        private static JObject JobParameters(string jobPath)
        {
            return new JObject
            {
                ["job_path"] = jobPath
            };
        }

        /// <summary>
        /// 从成功或业务失败响应中读取结构化数据，并确认类型与预期一致。
        /// </summary>
        /// <typeparam name="T">预期业务结果类型。</typeparam>
        /// <param name="response">MCP 工具返回值。</param>
        /// <returns>已验证类型的业务结果。</returns>
        private static T GetResponseData<T>(object response) where T : class
        {
            object data = response switch
            {
                SuccessResponse success => success.Data,
                ErrorResponse error => error.Data,
                _ => null
            };
            Assert.That(data, Is.TypeOf<T>());
            return (T)data;
        }

        /// <summary>
        /// 删除测试创建的临时 Job，不影响其他测试证据。
        /// </summary>
        private static void DeleteJob(string jobPath)
        {
            DeleteProjectFile(Path.ChangeExtension(jobPath, ".source.yaml").Replace('\\', '/'));
            DeleteProjectFile(jobPath);
        }

        /// <summary>按序数递归排序对象属性并生成无空白 JSON。</summary>
        private static string Canonicalize(JToken token)
        {
            return SortToken(token).ToString(Formatting.None);
        }

        /// <summary>复制 JSON，同时保持数组顺序并排序所有对象键。</summary>
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
        private static string ComputeSha256(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>
        /// 删除指定项目相对路径的测试文件，不递归删除目录。
        /// </summary>
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
