using System;
using Project.UnityWorkflow.VisualQA;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 生成固定机位的视觉证据截图。</summary>
    public static class CaptureVisualCommand
    {
        /// <summary>描述 visual-capture Job 中的截图请求字段。</summary>
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

            /// <summary>转换为 VisualQA 业务程序集使用的请求实体。</summary>
            /// <returns>截图服务请求。</returns>
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
        /// 读取 visual-capture Job，调用截图服务并返回统一 Pipeline 结果。
        /// </summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>截图结果；业务失败时 Success 为 false。</returns>
        [CliCommand(
            "uwt_capture_visual",
            "Capture a 1920x1080 visual QA image from a compiled visual-capture Job.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled visual-capture JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                VisualCapturePayload payload = PipelineCommandSupport.LoadPayload<VisualCapturePayload>(
                    jobPath,
                    "visual-capture");
                VisualCaptureResult result = new VisualCaptureService().Capture(payload.ToRequest());
                bool passed = result != null && string.Equals(result.Status, "PASS", StringComparison.Ordinal);
                return passed
                    ? PipelineCommandSupport.Pass("视觉截图已完成。", result)
                    : PipelineCommandSupport.Fail("视觉截图未通过。", result);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("视觉截图", exception);
            }
        }
    }
}
