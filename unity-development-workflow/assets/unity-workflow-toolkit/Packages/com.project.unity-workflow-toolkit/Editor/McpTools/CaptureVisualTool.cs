using System;
using MCPForUnity.Editor.Helpers;
using MCPForUnity.Editor.Tools;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.VisualQA;

namespace Project.UnityWorkflow.McpTools
{
    /// <summary>
    /// 通过 unity-mcp 生成固定机位的视觉证据截图。
    /// </summary>
    [McpForUnityTool(
        "uwt_capture_visual",
        Description = "Capture a 1920x1080 visual QA image from a compiled visual-capture Job.",
        AutoRegister = true,
        Group = "core")]
    public static class CaptureVisualTool
    {
        /// <summary>
        /// 声明自定义工具对 MCP 客户端公开的参数元数据。
        /// </summary>
        public sealed class Parameters
        {
            /// <summary>获取或设置项目内编译 Job 路径。</summary>
            [ToolParameter("Project-relative path to a compiled visual-capture JSON Job.")]
            public string job_path { get; set; }
        }

        /// <summary>
        /// 描述 visual-capture Job 中使用 lowerCamelCase 的负载字段。
        /// </summary>
        [Serializable]
        private sealed class VisualCapturePayload
        {
            public string schemaVersion = "1.0";
            public string taskId = string.Empty;
            public string cameraPath = string.Empty;
            public bool allowMainCamera;
            public int width = 1920;
            public int height = 1080;
            public string outputPath = string.Empty;

            /// <summary>
            /// 转换为 VisualQA 业务程序集使用的请求实体。
            /// </summary>
            public VisualCaptureRequest ToRequest()
            {
                return new VisualCaptureRequest
                {
                    TaskId = taskId,
                    CameraPath = cameraPath,
                    AllowMainCamera = allowMainCamera,
                    Width = width,
                    Height = height,
                    OutputPath = outputPath
                };
            }
        }

        /// <summary>
        /// 读取 visual-capture Job，调用截图服务并包装结构化结果。
        /// </summary>
        /// <param name="parameters">包含 `job_path` 的 MCP 参数。</param>
        /// <returns>成功时携带截图结果，入口或执行失败时返回安全错误。</returns>
        public static object HandleCommand(JObject parameters)
        {
            try
            {
                VisualCapturePayload payload = McpToolSupport.LoadPayload<VisualCapturePayload>(
                    parameters,
                    "visual-capture");
                VisualCaptureResult result = new VisualCaptureService().Capture(payload.ToRequest());
                if (string.Equals(result.Status, "PASS", StringComparison.Ordinal))
                {
                    return new SuccessResponse("视觉截图已完成。", result);
                }

                return new ErrorResponse("视觉截图未通过。", result);
            }
            catch (Exception exception)
            {
                return McpToolSupport.ToErrorResponse("视觉截图", exception);
            }
        }
    }
}
