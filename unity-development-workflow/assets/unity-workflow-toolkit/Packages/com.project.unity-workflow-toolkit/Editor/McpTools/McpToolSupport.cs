using System;
using System.IO;
using MCPForUnity.Editor.Helpers;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;

namespace Project.UnityWorkflow.McpTools
{
    /// <summary>
    /// 为短同步 MCP 工具提供统一的 Job 入口校验和安全错误响应。
    /// </summary>
    internal static class McpToolSupport
    {
        /// <summary>
        /// 读取项目内 JSON Job，并校验契约类型和非空负载。
        /// </summary>
        /// <typeparam name="TPayload">Job 负载 DTO 类型。</typeparam>
        /// <param name="parameters">MCP 调用参数。</param>
        /// <param name="expectedKind">工具允许处理的契约类型。</param>
        /// <returns>已完成入口校验的 Job 负载。</returns>
        public static TPayload LoadPayload<TPayload>(JObject parameters, string expectedKind)
            where TPayload : class
        {
            string jobPath = RequireJobPath(parameters);
            WorkflowJobDto<TPayload> job = ManifestLoader.Load<WorkflowJobDto<TPayload>>(jobPath);
            if (!job.IntegrityVerified)
            {
                throw new InvalidDataException("Job 未通过完整性验证。");
            }

            if (!string.Equals(job.Kind, expectedKind, StringComparison.Ordinal))
            {
                throw new InvalidDataException($"Job kind 必须为 {expectedKind}。");
            }

            if (job.Payload == null)
            {
                throw new InvalidDataException("Job 缺少 payload。");
            }

            return job.Payload;
        }

        /// <summary>
        /// 把执行异常转换为不包含项目根目录或本机绝对路径的 MCP 错误。
        /// </summary>
        /// <param name="operation">面向调用方的操作名称。</param>
        /// <param name="exception">待归一化的异常。</param>
        /// <returns>可安全共享的错误响应。</returns>
        public static ErrorResponse ToErrorResponse(string operation, Exception exception)
        {
            string reason = exception switch
            {
                FileNotFoundException _ => "Job 文件不存在。",
                UnauthorizedAccessException _ => "无权访问工作流文件。",
                NotSupportedException _ => "Job Schema 版本不受支持。",
                InvalidDataException invalidData => SanitizeKnownMessage(invalidData.Message, "Job 内容无效。"),
                ArgumentException _ => "Job 路径无效或超出 Unity 项目目录。",
                IOException _ => "读写工作流文件失败。",
                _ => "工具执行失败。"
            };

            return new ErrorResponse(operation + "失败：" + reason);
        }

        /// <summary>
        /// 提取并验证 `job_path`，确保工具只读取项目内 JSON 文件。
        /// </summary>
        private static string RequireJobPath(JObject parameters)
        {
            string jobPath = parameters?.Value<string>("job_path");
            if (string.IsNullOrWhiteSpace(jobPath))
            {
                throw new ArgumentException("job_path 为必填参数。", nameof(parameters));
            }

            if (!string.Equals(Path.GetExtension(jobPath), ".json", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("job_path 必须指向 JSON 文件。", nameof(parameters));
            }

            // 先显式解析路径，再交给 ManifestLoader 读取，保证所有工具共享同一项目边界。
            WorkflowPaths.ResolveProjectRelative(jobPath);
            return jobPath.Replace('\\', '/');
        }

        /// <summary>
        /// 仅保留工具主动生成且不含目录信息的校验消息。
        /// </summary>
        private static string SanitizeKnownMessage(string message, string fallback)
        {
            if (string.IsNullOrWhiteSpace(message) ||
                message.IndexOf('/') >= 0 ||
                message.IndexOf('\\') >= 0 ||
                message.IndexOf(':') >= 0)
            {
                return fallback;
            }

            return message;
        }
    }
}
