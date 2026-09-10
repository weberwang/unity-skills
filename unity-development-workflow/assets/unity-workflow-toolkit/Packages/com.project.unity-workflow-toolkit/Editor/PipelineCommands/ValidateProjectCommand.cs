using System;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ProjectValidation;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 执行项目基线校验。</summary>
    public static class ValidateProjectCommand
    {
        /// <summary>
        /// 读取 project-profile Job，调用项目校验服务并返回统一 Pipeline 结果。
        /// </summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>项目质量报告；业务失败时 Success 为 false。</returns>
        [CliCommand(
            "uwt_validate_project",
            "Validate the active Unity project against a compiled project-profile Job.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled project-profile JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                ProjectProfileDto profile = PipelineCommandSupport.LoadPayload<ProjectProfileDto>(
                    jobPath,
                    "project-profile");
                QualityReportDto report = new ProjectValidationService().Validate(profile);
                bool passed = report != null && string.Equals(report.Status, "PASS", StringComparison.Ordinal);
                return passed
                    ? PipelineCommandSupport.Pass("项目校验已通过。", report)
                    : PipelineCommandSupport.Fail("项目校验未通过。", report);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("项目校验", exception);
            }
        }
    }
}
