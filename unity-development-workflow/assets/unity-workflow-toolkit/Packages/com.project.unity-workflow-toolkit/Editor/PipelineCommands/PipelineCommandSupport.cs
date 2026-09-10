using System;
using System.IO;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>
    /// 统一描述 Pipeline 命令的业务结果，避免命令层把业务失败伪装成命令成功。
    /// </summary>
    [Serializable]
    public sealed class PipelineCommandResult
    {
        /// <summary>获取命令及其业务检查是否成功。</summary>
        public bool Success;

        /// <summary>获取面向调用方的脱敏消息。</summary>
        public string Message;

        /// <summary>获取可选的结构化业务数据；入口错误时为空。</summary>
        public object Data;

        /// <summary>创建一个可被 Pipeline 序列化的结果信封。</summary>
        /// <param name="success">命令和业务检查是否成功。</param>
        /// <param name="message">面向调用方的消息。</param>
        /// <param name="data">可选的业务结果。</param>
        public PipelineCommandResult(bool success, string message, object data)
        {
            Success = success;
            Message = message ?? string.Empty;
            Data = data;
        }
    }

    /// <summary>
    /// 为四个 Pipeline 命令复用 Job 完整性、项目边界和错误脱敏逻辑。
    /// </summary>
    internal static class PipelineCommandSupport
    {
        /// <summary>
        /// 读取并验证命令对应的编译 Job，只返回已经通过完整性校验的 payload。
        /// </summary>
        /// <typeparam name="TPayload">Job 负载 DTO 类型。</typeparam>
        /// <param name="jobPath">项目相对 Job 路径。</param>
        /// <param name="expectedKind">命令允许处理的契约类型。</param>
        /// <returns>通过完整性和类型检查的 Job 负载。</returns>
        public static TPayload LoadPayload<TPayload>(string jobPath, string expectedKind)
            where TPayload : class
        {
            string normalizedJobPath = RequireJobPath(jobPath);
            WorkflowJobDto<TPayload> job = ManifestLoader.Load<WorkflowJobDto<TPayload>>(normalizedJobPath);
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

        /// <summary>创建业务成功结果。</summary>
        /// <param name="message">成功消息。</param>
        /// <param name="data">业务结果数据。</param>
        /// <returns>Success 为 true 的统一结果信封。</returns>
        public static PipelineCommandResult Pass(string message, object data)
        {
            return new PipelineCommandResult(true, message, data);
        }

        /// <summary>创建入口或业务失败结果。</summary>
        /// <param name="message">失败消息。</param>
        /// <param name="data">可选的业务失败详情。</param>
        /// <returns>Success 为 false 的统一结果信封。</returns>
        public static PipelineCommandResult Fail(string message, object data = null)
        {
            return new PipelineCommandResult(false, message, data);
        }

        /// <summary>
        /// 把执行异常映射为不泄漏项目根目录、主机路径或原始参数的结果。
        /// </summary>
        /// <param name="operation">面向调用方的操作名称。</param>
        /// <param name="exception">待归一化的异常。</param>
        /// <returns>脱敏后的失败结果。</returns>
        public static PipelineCommandResult FromException(string operation, Exception exception)
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

            return Fail(operation + "失败：" + reason);
        }

        /// <summary>
        /// 验证命令路径是项目内的 JSON 文件，并统一分隔符后交给 Core 解析。
        /// </summary>
        /// <param name="jobPath">外部传入的项目相对路径。</param>
        /// <returns>规范化后的项目相对路径。</returns>
        private static string RequireJobPath(string jobPath)
        {
            if (string.IsNullOrWhiteSpace(jobPath))
            {
                throw new ArgumentException("job_path 为必填参数。", nameof(jobPath));
            }

            if (!string.Equals(Path.GetExtension(jobPath), ".json", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("job_path 必须指向 JSON 文件。", nameof(jobPath));
            }

            // 先执行统一的项目边界和重解析点检查，避免后续读取路径绕过 Core 的安全约束。
            WorkflowPaths.ResolveProjectRelative(jobPath);
            return jobPath.Replace('\\', '/');
        }

        /// <summary>只保留主动生成且不含路径信息的已知校验消息。</summary>
        /// <param name="message">原始异常消息。</param>
        /// <param name="fallback">消息不安全时使用的通用文本。</param>
        /// <returns>可共享的脱敏消息。</returns>
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
