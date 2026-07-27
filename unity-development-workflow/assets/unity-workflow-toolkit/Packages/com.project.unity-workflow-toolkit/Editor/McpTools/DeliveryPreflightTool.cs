using System;
using MCPForUnity.Editor.Helpers;
using MCPForUnity.Editor.Tools;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.BuildPipeline;

namespace Project.UnityWorkflow.McpTools
{
    /// <summary>
    /// 通过 unity-mcp 执行 Windows 本地交付预检。
    /// </summary>
    [McpForUnityTool(
        "uwt_delivery_preflight",
        Description = "Run Windows delivery preflight checks from a compiled delivery-preflight Job.",
        AutoRegister = true,
        Group = "core")]
    public static class DeliveryPreflightTool
    {
        /// <summary>
        /// 声明自定义工具对 MCP 客户端公开的参数元数据。
        /// </summary>
        public sealed class Parameters
        {
            /// <summary>获取或设置项目内编译 Job 路径。</summary>
            [ToolParameter("Project-relative path to a compiled delivery-preflight JSON Job.")]
            public string job_path { get; set; }
        }

        /// <summary>
        /// 描述 delivery-preflight Job 中使用 lowerCamelCase 的负载字段。
        /// </summary>
        [Serializable]
        private sealed class DeliveryPreflightPayload
        {
            public string schemaVersion = "1.0";
            public string taskId = string.Empty;
            public string projectId = string.Empty;
            public string sourceRevision = string.Empty;
            public string platform = "Windows";
            public string version = string.Empty;
            public string outputDirectory = string.Empty;
            public string artifactName = string.Empty;
            public string[] qualityReportPaths = Array.Empty<string>();
            public string[] visualApprovalPaths = Array.Empty<string>();

            /// <summary>
            /// 转换为 BuildPipeline 业务程序集使用的请求实体。
            /// </summary>
            public DeliveryRequest ToRequest()
            {
                return new DeliveryRequest
                {
                    TaskId = taskId,
                    ProjectId = projectId,
                    SourceRevision = sourceRevision,
                    Platform = platform,
                    Version = version,
                    OutputDirectory = outputDirectory,
                    ArtifactName = artifactName,
                    QualityReportPaths = qualityReportPaths ?? Array.Empty<string>(),
                    VisualApprovalPaths = visualApprovalPaths ?? Array.Empty<string>()
                };
            }
        }

        /// <summary>
        /// 读取 delivery-preflight Job，调用交付预检服务并包装结构化结果。
        /// </summary>
        /// <param name="parameters">包含 `job_path` 的 MCP 参数。</param>
        /// <returns>成功时携带预检结果，入口或执行失败时返回安全错误。</returns>
        public static object HandleCommand(JObject parameters)
        {
            try
            {
                DeliveryPreflightPayload payload = McpToolSupport.LoadPayload<DeliveryPreflightPayload>(
                    parameters,
                    "delivery-preflight");
                DeliveryPreflightResult result = new DeliveryPreflightService().Validate(payload.ToRequest());
                if (string.Equals(result.Status, "PASS", StringComparison.Ordinal))
                {
                    return new SuccessResponse("交付预检已通过。", result);
                }

                return new ErrorResponse("交付预检未通过。", result);
            }
            catch (Exception exception)
            {
                return McpToolSupport.ToErrorResponse("交付预检", exception);
            }
        }
    }
}
