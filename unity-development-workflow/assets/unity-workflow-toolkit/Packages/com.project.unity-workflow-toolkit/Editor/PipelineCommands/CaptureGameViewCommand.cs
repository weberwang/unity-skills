using System;
using Project.UnityWorkflow.VisualQA;
using Unity.Pipeline.Commands;

namespace Project.UnityWorkflow.PipelineCommands
{
    /// <summary>通过 Unity Pipeline 登记或查询现有 Play Mode 的 Game View 帧末采集。</summary>
    public static class CaptureGameViewCommand
    {
        /// <summary>读取 game-view-capture Job；首次返回 PENDING，重复调用查询同一身份的终态。</summary>
        /// <param name="jobPath">项目内编译 Job 的相对路径。</param>
        /// <returns>请求状态；只有真实截图和配套报告均落盘后才返回 PASS。</returns>
        [CliCommand(
            "uwt_capture_game_view",
            "Request or poll an end-of-frame Game View capture from the existing Editor Play Mode.",
            MainThreadRequired = true)]
        public static PipelineCommandResult Execute(
            [CliArg("job_path", "Project-relative path to a compiled game-view-capture JSON Job.", Required = true)]
            string jobPath)
        {
            try
            {
                GameViewCaptureRequest request = PipelineCommandSupport.LoadPayload<GameViewCaptureRequest>(
                    jobPath,
                    "game-view-capture");
                GameViewCaptureResult result = GameViewCaptureService.CaptureOrPoll(request);
                if (result == null || result.status == "FAIL" || result.status == "BLOCKED")
                {
                    return PipelineCommandSupport.Fail(
                        result == null ? "Game View 采集失败。" : result.message,
                        result);
                }

                return PipelineCommandSupport.Pass(result.message, result);
            }
            catch (Exception exception)
            {
                return PipelineCommandSupport.FromException("Game View 采集", exception);
            }
        }
    }
}
