using System;
using Project.UnityWorkflow.VisualQA;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 从已加载场景读取 UI 实际布局并记录容差结果。</summary>
    public static class MeasureLayoutCommand
    {
        /// <summary>读取 layout-measurement Job，执行只读测量并返回结构化报告。</summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>PASS、MEASURED、FAIL 或 BLOCKED 的布局测量报告。</returns>
        [CliCommand(
            "uwt_measure_layout",
            "Measure actual uGUI or UI Toolkit geometry from a compiled layout-measurement Job.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled layout-measurement JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                LayoutMeasurementRequest request = PipelineCommandSupport.LoadPayload<LayoutMeasurementRequest>(
                    jobPath,
                    "layout-measurement");
                LayoutMeasurementReport report = new LayoutMeasurementService().Measure(request);
                if (report == null || report.status == "FAIL" || report.status == "BLOCKED")
                {
                    return PipelineCommandSupport.Fail(
                        report == null ? "布局测量失败。" : report.message,
                        report);
                }

                return PipelineCommandSupport.Pass(report.message, report);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("布局测量", exception);
            }
        }
    }
}
