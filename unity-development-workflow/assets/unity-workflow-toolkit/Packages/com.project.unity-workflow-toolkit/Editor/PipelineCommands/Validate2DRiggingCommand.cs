using System;
using System.IO;
using System.Linq;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.RiggingValidation;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>执行只读的角色骨骼资产工程检查，单独保存机器报告。</summary>
    public static class Validate2DRiggingCommand
    {
        /// <summary>读取角色检查 Job，验证实际资产并写入受限报告目录。</summary>
        /// <param name="jobPath">项目内 rigging-validation JSON Job。</param>
        /// <returns>工程检查结果；不包含视觉或运行行为的通过结论。</returns>
        [CliCommand(
            "uwt_validate_2d_rigging",
            "Validate a 2D skeletal character's assets; visual and runtime acceptance remain separate.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative rigging-validation JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                WorkflowJobDto<RiggingValidationRequest> job =
                    PipelineCommandSupport.LoadJob<RiggingValidationRequest>(jobPath, "rigging-validation");
                string output = RequireReportPath(job.Payload.OutputPath, jobPath, job.SourcePath);
                EditorStabilityResult stability = EditorStabilityGuard.Check(false);
                if (!stability.IsStable)
                {
                    return PipelineCommandSupport.Fail(stability.Message, stability);
                }
                QualityReportDto report = new RiggingValidationService().Validate(job.Payload);
                ReportWriter.Write(output, report);
                return string.Equals(report.Status, "PASS", StringComparison.Ordinal)
                    ? PipelineCommandSupport.Pass("2D 骨骼资产工程检查通过；运行行为与显示效果仍须独立验收。", report)
                    : PipelineCommandSupport.Fail("2D 骨骼资产工程检查未通过，详见结构化报告。", report);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("2D 骨骼资产检查", exception);
            }
        }

        /// <summary>限制报告只写产物目录，防止 Job 将自身或源契约覆盖。</summary>
        private static string RequireReportPath(string outputPath, string jobPath, string sourcePath)
        {
            string normalized = (outputPath ?? string.Empty).Replace('\\', '/');
            if (!normalized.StartsWith("Artifacts/", StringComparison.Ordinal) ||
                !string.Equals(Path.GetExtension(normalized), ".json", StringComparison.OrdinalIgnoreCase) ||
                normalized.Split('/').Any(segment => segment.Length == 0 || segment == "." || segment == ".."))
            {
                throw new ArgumentException("报告必须写入 Artifacts 下的 JSON 文件。");
            }

            string absolute = WorkflowPaths.ResolveProjectRelative(normalized);
            // 与磁盘实际规范化路径比较，避免大小写和相对路径别名绕过输入保护。
            foreach (string input in new[] { jobPath, sourcePath })
            {
                if (string.Equals(absolute, WorkflowPaths.ResolveProjectRelative(input), StringComparison.OrdinalIgnoreCase))
                {
                    throw new ArgumentException("报告不能覆盖输入 Job 或源契约。");
                }
            }

            return normalized;
        }
    }
}
