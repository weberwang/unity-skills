using System;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ImagePipeline;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 导入已批准且通过技术校验的图片候选。</summary>
    public static class ImportImageCommand
    {
        /// <summary>
        /// 读取 image-task Job，调用图片导入服务并返回统一 Pipeline 结果。
        /// </summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>图片导入结果；业务失败时 Success 为 false。</returns>
        [CliCommand(
            "uwt_import_image",
            "Import an approved image candidate from a compiled image-task Job.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled image-task JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                ImageTaskDto task = PipelineCommandSupport.LoadPayload<ImageTaskDto>(jobPath, "image-task");
                ImageImportRequest request = ImageImportRequest.FromTask(task);
                ImageImportResult result = new ImageImportService().Import(request);
                return result != null && result.Success
                    ? PipelineCommandSupport.Pass("图片导入已完成。", result)
                    : PipelineCommandSupport.Fail("图片导入未通过。", result);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("图片导入", exception);
            }
        }
    }
}
