using System;
using MCPForUnity.Editor.Helpers;
using MCPForUnity.Editor.Tools;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.ProjectValidation;

namespace Project.UnityWorkflow.McpTools
{
    /// <summary>
    /// 通过 unity-mcp 执行项目基线校验。
    /// </summary>
    [McpForUnityTool(
        "uwt_validate_project",
        Description = "Validate the active Unity project against a compiled project-profile Job.",
        AutoRegister = true,
        Group = "core")]
    public static class ValidateProjectTool
    {
        /// <summary>
        /// 声明自定义工具对 MCP 客户端公开的参数元数据。
        /// </summary>
        public sealed class Parameters
        {
            /// <summary>获取或设置项目内编译 Job 路径。</summary>
            [ToolParameter("Project-relative path to a compiled project-profile JSON Job.")]
            public string job_path { get; set; }
        }

        /// <summary>
        /// 读取 project-profile Job，调用项目校验服务并包装结构化报告。
        /// </summary>
        /// <param name="parameters">包含 `job_path` 的 MCP 参数。</param>
        /// <returns>成功时携带质量报告，入口或执行失败时返回安全错误。</returns>
        public static object HandleCommand(JObject parameters)
        {
            try
            {
                ProjectProfileDto profile = McpToolSupport.LoadPayload<ProjectProfileDto>(
                    parameters,
                    "project-profile");
                QualityReportDto report = new ProjectValidationService().Validate(profile);
                if (string.Equals(report.Status, "PASS", StringComparison.Ordinal))
                {
                    return new SuccessResponse("项目校验已通过。", report);
                }

                return new ErrorResponse("项目校验未通过。", report);
            }
            catch (Exception exception)
            {
                return McpToolSupport.ToErrorResponse("项目校验", exception);
            }
        }
    }
}
