using System;
using Project.UnityWorkflow.ResourceInspection;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 从 AssetDatabase 读取资源交接事实。</summary>
    public static class InspectResourceHandoffCommand
    {
        /// <summary>读取资源交接 Job，采集真实资源加载与序列帧绑定报告。</summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>MEASURED 成功结果或带有失败快照的结构化结果。</returns>
        [CliCommand(
            "uwt_inspect_resource_handoff",
            "Inspect actual resource loading and sprite animation handoff data from Unity assets.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled resource-handoff-inspection JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                ResourceHandoffInspectionRequest request =
                    PipelineCommandSupport.LoadPayload<ResourceHandoffInspectionRequest>(
                        jobPath,
                        "resource-handoff-inspection");
                ResourceHandoffInspectionReport report = new ResourceHandoffInspectionService().Inspect(request);
                return string.Equals(report.status, "MEASURED", StringComparison.Ordinal)
                    ? PipelineCommandSupport.Pass(report.message, report)
                    : PipelineCommandSupport.Fail(report.message, report);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("资源交接检查", exception);
            }
        }
    }
}
