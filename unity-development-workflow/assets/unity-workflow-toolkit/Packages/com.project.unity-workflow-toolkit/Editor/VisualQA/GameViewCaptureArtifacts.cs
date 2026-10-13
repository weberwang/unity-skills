using System;
using System.Globalization;
using System.IO;
using System.Text;
using Project.UnityWorkflow.Core;
using UnityEngine;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>负责 Game View PNG 与 JSON 证据对写入及既有产物完整性校验。</summary>
    internal static class GameViewCaptureArtifacts
    {
        private static readonly byte[] PngSignature = { 137, 80, 78, 71, 13, 10, 26, 10 };

        /// <summary>原子写入 PNG 与对应 JSON；任一落位失败时撤销本请求已落位的另一文件。</summary>
        /// <param name="request">固定任务身份和截图输出路径。</param>
        /// <param name="reportPath">配套 JSON 报告的项目相对路径。</param>
        /// <param name="result">包含真实采集范围和 UI 覆盖状态的终态报告。</param>
        /// <param name="pngBytes">Unity 从最终 Game View 帧编码出的 PNG 数据。</param>
        public static void WriteEvidencePair(
            GameViewCaptureRequest request,
            string reportPath,
            GameViewCaptureResult result,
            byte[] pngBytes)
        {
            string absolutePngPath = WorkflowPaths.ResolveProjectRelative(request.outputPath);
            string absoluteReportPath = WorkflowPaths.ResolveProjectRelative(reportPath);
            string directory = Path.GetDirectoryName(absolutePngPath);
            if (string.IsNullOrEmpty(directory))
            {
                throw new InvalidOperationException("Game View 证据缺少父目录。");
            }

            bool directoryAlreadyExisted = Directory.Exists(directory);
            Directory.CreateDirectory(directory);
            absolutePngPath = WorkflowPaths.ResolveProjectRelative(request.outputPath);
            absoluteReportPath = WorkflowPaths.ResolveProjectRelative(reportPath);
            if (File.Exists(absolutePngPath) || File.Exists(absoluteReportPath))
            {
                throw new IOException("Game View 证据目标已被其他请求占用。");
            }

            string temporaryPng = Path.Combine(directory, "." + Path.GetFileName(absolutePngPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            string temporaryReport = Path.Combine(directory, "." + Path.GetFileName(absoluteReportPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            bool pngPlaced = false;
            bool reportPlaced = false;
            try
            {
                File.WriteAllBytes(temporaryPng, pngBytes);
                File.WriteAllText(temporaryReport, JsonUtility.ToJson(result, true) + "\n", new UTF8Encoding(false));
                File.Move(temporaryPng, absolutePngPath);
                pngPlaced = true;
                File.Move(temporaryReport, absoluteReportPath);
                reportPlaced = true;
            }
            catch
            {
                if (reportPlaced && File.Exists(absoluteReportPath))
                {
                    File.Delete(absoluteReportPath);
                }

                if (pngPlaced && File.Exists(absolutePngPath))
                {
                    File.Delete(absolutePngPath);
                }

                throw;
            }
            finally
            {
                if (File.Exists(temporaryPng))
                {
                    File.Delete(temporaryPng);
                }

                if (File.Exists(temporaryReport))
                {
                    File.Delete(temporaryReport);
                }

                if (!directoryAlreadyExisted && Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0)
                {
                    Directory.Delete(directory);
                }
            }
        }

        /// <summary>仅接受同身份且 PNG 可解码、尺寸和字节数与报告一致的既有 PASS 证据。</summary>
        /// <param name="request">当前回查 Job 的任务身份。</param>
        /// <param name="absoluteOutputPath">规范化的项目内 PNG 绝对路径。</param>
        /// <returns>合法同身份 PASS、明确占用错误；两份文件都不存在时返回 null。</returns>
        public static GameViewCaptureResult ReadExistingResult(GameViewCaptureRequest request, string absoluteOutputPath)
        {
            string reportPath;
            try
            {
                reportPath = WorkflowPaths.ResolveProjectRelative(Normalize(request.outputPath) + ".json");
            }
            catch (Exception)
            {
                return Failure("INVALID_REPORT_PATH", "采集报告路径不符合项目相对路径约束。", request);
            }

            if (!File.Exists(absoluteOutputPath) && !File.Exists(reportPath))
            {
                return null;
            }

            if (!File.Exists(absoluteOutputPath) || !File.Exists(reportPath))
            {
                return Failure("INCOMPLETE_EXISTING_ARTIFACT", "输出路径已有不完整旧文件，已拒绝覆盖。", request);
            }

            try
            {
                GameViewCaptureResult saved = JsonUtility.FromJson<GameViewCaptureResult>(File.ReadAllText(reportPath, new UTF8Encoding(false, true)));
                if (!MatchesIdentity(request, saved))
                {
                    return Failure("OUTPUT_IDENTITY_CONFLICT", "输出路径已被其他采集身份占用或报告无效。", request);
                }

                byte[] pngBytes = File.ReadAllBytes(absoluteOutputPath);
                if (!IsPngSignature(pngBytes) || !HasCompleteCaptureReport(request, saved, pngBytes.LongLength))
                {
                    return Failure("EXISTING_ARTIFACT_INVALID", "既有 PNG 或采集报告损坏、不匹配，已拒绝复用。", request);
                }

                Texture2D decoded = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                try
                {
                    if (!ImageConversion.LoadImage(decoded, pngBytes, true) ||
                        decoded.width != saved.screenshot.width || decoded.height != saved.screenshot.height)
                    {
                        return Failure("EXISTING_ARTIFACT_INVALID", "PNG 无法解码，或实际尺寸与报告不一致。", request);
                    }
                }
                finally
                {
                    DestroyTexture(decoded);
                }

                return saved;
            }
            catch (Exception)
            {
                return Failure("EXISTING_ARTIFACT_INVALID", "既有 PNG 或采集报告无法读取或解码，已拒绝复用。", request);
            }
        }

        /// <summary>确认 PNG 文件签名完整，拒绝空文件和误命名的其他图像格式。</summary>
        private static bool IsPngSignature(byte[] bytes)
        {
            if (bytes == null || bytes.Length < PngSignature.Length)
            {
                return false;
            }

            for (int index = 0; index < PngSignature.Length; index++)
            {
                if (bytes[index] != PngSignature[index])
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>交叉验证任务身份、帧范围、UI 覆盖和声明尺寸，不读取像素作视觉结论。</summary>
        private static bool HasCompleteCaptureReport(GameViewCaptureRequest request, GameViewCaptureResult result, long byteCount)
        {
            GameViewScreenshot screenshot = result.screenshot;
            GameViewUiCoverage coverage = result.uiCoverage;
            return result.status == "PASS" &&
                   result.captureScope == "EDITOR_GAME_VIEW_END_OF_FRAME" &&
                   string.Equals(result.requestedOutputPath, Normalize(request.outputPath), StringComparison.Ordinal) &&
                   screenshot != null && screenshot.width > 0 && screenshot.height > 0 &&
                   screenshot.sizeBytes == byteCount &&
                   string.Equals(screenshot.path, Normalize(request.outputPath), StringComparison.Ordinal) &&
                   IsUtcTimestamp(screenshot.capturedAtUtc) && screenshot.frameCount >= 0 &&
                   coverage != null && coverage.scope == "FINAL_GAME_VIEW_FRAME" &&
                   coverage.pixelAnalysis == "NOT_PERFORMED" && !string.IsNullOrWhiteSpace(coverage.note) &&
                   (coverage.status == "CAPTURED_UNANALYZED" || coverage.status == "PARTIAL_UNCLASSIFIED" ||
                    coverage.status == "NO_RUNTIME_UI_FOUND") &&
                   IsUtcTimestamp(result.generatedAtUtc);
        }

        /// <summary>验证报告中的任务、候选、场景及输出路径均与当前请求绑定。</summary>
        private static bool MatchesIdentity(GameViewCaptureRequest request, GameViewCaptureResult result)
        {
            return result != null && result.status == "PASS" &&
                   string.Equals(result.taskId, request.taskId, StringComparison.Ordinal) &&
                   string.Equals(result.candidateId, request.candidateId, StringComparison.Ordinal) &&
                   string.Equals(result.scenePath, Normalize(request.scenePath), StringComparison.Ordinal) &&
                   result.screenshot != null &&
                   string.Equals(result.screenshot.path, Normalize(request.outputPath), StringComparison.Ordinal);
        }

        /// <summary>验证报告时间为可解析的 UTC 时间，阻止不完整旁路 JSON 冒充采集记录。</summary>
        private static bool IsUtcTimestamp(string value)
        {
            return !string.IsNullOrWhiteSpace(value) && value.EndsWith("Z", StringComparison.Ordinal) &&
                   DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out _);
        }

        /// <summary>根据 Unity 当前运行状态释放临时校验纹理。</summary>
        private static void DestroyTexture(Texture2D texture)
        {
            if (texture == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                UnityEngine.Object.Destroy(texture);
            }
            else
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        /// <summary>生成不含主机路径的明确失败结果。</summary>
        private static GameViewCaptureResult Failure(string code, string message, GameViewCaptureRequest request)
        {
            return new GameViewCaptureResult
            {
                status = "FAIL",
                errorCode = code,
                message = message,
                taskId = request.taskId,
                candidateId = request.candidateId,
                scenePath = Normalize(request.scenePath),
                requestedOutputPath = Normalize(request.outputPath),
                generatedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)
            };
        }

        /// <summary>统一项目相对路径分隔符。</summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }
    }
}
