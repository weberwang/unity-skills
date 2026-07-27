using System;
using MCPForUnity.Editor.Helpers;
using MCPForUnity.Editor.Tools;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ImagePipeline;

namespace Project.UnityWorkflow.McpTools
{
    /// <summary>
    /// 通过 unity-mcp 导入已批准且通过技术校验的图片候选。
    /// </summary>
    [McpForUnityTool(
        "uwt_import_image",
        Description = "Import an approved image candidate from a compiled image-task Job.",
        AutoRegister = true,
        Group = "core")]
    public static class ImportImageTool
    {
        /// <summary>
        /// 声明自定义工具对 MCP 客户端公开的参数元数据。
        /// </summary>
        public sealed class Parameters
        {
            /// <summary>获取或设置项目内编译 Job 路径。</summary>
            [ToolParameter("Project-relative path to a compiled image-task JSON Job.")]
            public string job_path { get; set; }
        }

        /// <summary>
        /// 读取 image-task Job，调用图片导入服务并包装结构化结果。
        /// </summary>
        /// <param name="parameters">包含 `job_path` 的 MCP 参数。</param>
        /// <returns>成功时携带导入结果，入口或执行失败时返回安全错误。</returns>
        public static object HandleCommand(JObject parameters)
        {
            try
            {
                ImageTaskDto task = McpToolSupport.LoadPayload<ImageTaskDto>(parameters, "image-task");
                ImageImportRequest request = ImageImportRequest.FromTask(task);
                ImageImportResult result = new ImageImportService().Import(request);
                if (result.Success)
                {
                    return new SuccessResponse("图片导入已完成。", result);
                }

                return new ErrorResponse("图片导入未通过。", result);
            }
            catch (Exception exception)
            {
                return McpToolSupport.ToErrorResponse("图片导入", exception);
            }
        }
    }
}
