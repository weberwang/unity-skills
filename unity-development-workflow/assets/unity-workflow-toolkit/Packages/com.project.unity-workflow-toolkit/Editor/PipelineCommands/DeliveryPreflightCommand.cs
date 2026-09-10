using System;
using Project.UnityWorkflow.BuildPipeline;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 执行 Windows 本地交付预检。</summary>
    public static class DeliveryPreflightCommand
    {
        /// <summary>描述 delivery-preflight Job 中的交付预检字段。</summary>
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

            /// <summary>转换为 BuildPipeline 业务程序集使用的请求实体。</summary>
            /// <returns>交付预检服务请求。</returns>
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
        /// 读取 delivery-preflight Job，调用交付预检服务并返回统一 Pipeline 结果。
        /// </summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>交付预检结果；业务失败时 Success 为 false。</returns>
        [CliCommand(
            "uwt_delivery_preflight",
            "Run Windows delivery preflight checks from a compiled delivery-preflight Job.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled delivery-preflight JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                DeliveryPreflightPayload payload = PipelineCommandSupport.LoadPayload<DeliveryPreflightPayload>(
                    jobPath,
                    "delivery-preflight");
                DeliveryPreflightResult result = new DeliveryPreflightService().Validate(payload.ToRequest());
                bool passed = result != null && string.Equals(result.Status, "PASS", StringComparison.Ordinal);
                return passed
                    ? PipelineCommandSupport.Pass("交付预检已通过。", result)
                    : PipelineCommandSupport.Fail("交付预检未通过。", result);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("交付预检", exception);
            }
        }
    }
}
