using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 校验批准状态、来源完整性、图片规格、目标白名单与 Importer 参数。
    /// </summary>
    public static class ImageValidationService
    {
        /// <summary>
        /// 单张待导入源图允许的最大编码文件大小，避免在 Editor 中无界读取外部生成文件。
        /// </summary>
        public const long MaximumSourceFileBytes = 64L * 1024L * 1024L;

        private static readonly string[] AllowedTargetRoots =
        {
            "Assets/Art/Runtime"
        };

        /// <summary>
        /// 在不修改 AssetDatabase 的前提下执行图片导入技术校验。
        /// </summary>
        /// <param name="request">图片导入请求。</param>
        /// <returns>包含尺寸、格式、Alpha 和全部问题的校验结果。</returns>
        public static ImageValidationResult Validate(ImageImportRequest request)
        {
            var result = new ImageValidationResult { IsValid = true };
            if (request == null)
            {
                result.AddIssue("request.missing", "图片导入请求不能为空。");
                return result;
            }

            ValidateIdentityAndApproval(request, result);
            ValidateImporterSettings(request, result);

            var sourcePath = ResolveSourcePath(request, result);
            var targetPath = ResolveTargetPath(request, result);
            if (!string.IsNullOrEmpty(targetPath))
            {
                ValidateOverwriteProtection(targetPath, result);
            }

            if (!string.IsNullOrEmpty(sourcePath) && File.Exists(sourcePath))
            {
                ValidateSourceFile(request, sourcePath, result);
            }

            result.IsValid = result.Issues.Count == 0;
            return result;
        }

        /// <summary>校验资源身份、版本和用户批准记录。</summary>
        private static void ValidateIdentityAndApproval(ImageImportRequest request, ImageValidationResult result)
        {
            RequireText(request.TaskId, "task-id.missing", "图片任务 ID 不能为空。", result);
            RequireText(request.ResourceId, "resource-id.missing", "资源唯一 ID 不能为空。", result);
            RequireText(request.SourceVersion, "source-version.missing", "源效果图版本不能为空。", result);
            RequireText(request.VisualVersion, "visual-version.missing", "候选视觉版本不能为空。", result);

            if (!string.Equals(request.Status, "APPROVED", StringComparison.Ordinal))
            {
                result.AddIssue("approval.status", "只有 APPROVED 图片任务可以导入。");
            }

            if (request.Approvals == null || request.Approvals.Count == 0)
            {
                result.AddIssue("approval.missing", "APPROVED 图片任务必须包含用户批准记录。");
                return;
            }

            bool hasUserApproval = false;
            var missingReviewDisciplines = new HashSet<string>(StringComparer.Ordinal)
            {
                "VISUAL_CONSISTENCY",
                "UNITY_FEASIBILITY",
                "UX_READABILITY"
            };
            var requiredReviewTaskIds = new HashSet<string>(StringComparer.Ordinal);
            var requiredReviewers = new HashSet<string>(StringComparer.Ordinal);
            foreach (var approval in request.Approvals)
            {
                if (approval == null || string.IsNullOrWhiteSpace(approval.ApprovalType) ||
                    string.IsNullOrWhiteSpace(approval.Authority) || string.IsNullOrWhiteSpace(approval.SubjectId) ||
                    string.IsNullOrWhiteSpace(approval.SubjectVersion) || string.IsNullOrWhiteSpace(approval.ApprovedBy) ||
                    string.IsNullOrWhiteSpace(approval.ApprovedAtUtc) || string.IsNullOrWhiteSpace(approval.EvidencePath) ||
                    string.IsNullOrWhiteSpace(approval.EvidenceSha256))
                {
                    result.AddIssue("approval.incomplete", "批准记录缺少类型、权限、主体、版本、责任人、时间或证据完整性字段。");
                    break;
                }

                if (!IsVisualApprovalType(approval.ApprovalType))
                {
                    result.AddIssue("approval.type-invalid", "图片导入只接受视觉类批准记录。");
                    break;
                }

                if (string.Equals(approval.Authority, "USER", StringComparison.Ordinal))
                {
                    hasUserApproval = true;
                }
                else if (string.Equals(approval.Authority, "INDEPENDENT_REVIEWER", StringComparison.Ordinal))
                {
                    if (string.IsNullOrWhiteSpace(approval.ReviewTaskId) ||
                        !IsReviewDiscipline(approval.ReviewDiscipline))
                    {
                        result.AddIssue(
                            "approval.review-incomplete",
                            "独立审查批准必须包含审查任务 ID 和有效审查专业。");
                        break;
                    }

                    if (missingReviewDisciplines.Remove(approval.ReviewDiscipline))
                    {
                        requiredReviewTaskIds.Add(approval.ReviewTaskId);
                        requiredReviewers.Add(approval.ApprovedBy);
                    }
                }
                else
                {
                    result.AddIssue("approval.authority-invalid", "批准权限必须是 USER 或 INDEPENDENT_REVIEWER。");
                    break;
                }

                if (!string.Equals(approval.SubjectId, request.TaskId, StringComparison.Ordinal))
                {
                    result.AddIssue("approval.subject-mismatch", "批准主体必须绑定当前图片任务 ID。");
                    break;
                }

                if (!string.Equals(approval.SubjectVersion, request.VisualVersion, StringComparison.Ordinal))
                {
                    result.AddIssue("approval.version-mismatch", "批准版本必须绑定当前选中候选的视觉版本。");
                    break;
                }

                if (!IsUtcDateTime(approval.ApprovedAtUtc))
                {
                    result.AddIssue("approval.time-invalid", "批准时间必须是带 UTC 时区的有效日期时间。");
                    break;
                }

                if (!IsSha256(approval.EvidenceSha256))
                {
                    result.AddIssue("approval.evidence-hash-invalid", "批准证据 SHA-256 格式无效。");
                    break;
                }

                string evidencePath;
                try
                {
                    evidencePath = WorkflowPaths.ResolveProjectRelative(approval.EvidencePath);
                }
                catch (Exception exception) when (
                    exception is ArgumentException ||
                    exception is NotSupportedException)
                {
                    result.AddIssue("approval.evidence-path-invalid", "批准证据必须使用安全的项目相对路径。");
                    break;
                }

                if (!File.Exists(evidencePath))
                {
                    result.AddIssue("approval.evidence-missing", "批准证据文件不存在。");
                    break;
                }

                try
                {
                    using SHA256 sha256 = SHA256.Create();
                    using FileStream stream = File.OpenRead(evidencePath);
                    string actualHash = BitConverter.ToString(sha256.ComputeHash(stream)).Replace("-", string.Empty);
                    if (!string.Equals(actualHash, approval.EvidenceSha256, StringComparison.OrdinalIgnoreCase))
                    {
                        result.AddIssue("approval.evidence-hash-mismatch", "批准证据 SHA-256 与实际文件不一致。");
                        break;
                    }
                }
                catch (Exception exception) when (
                    exception is IOException ||
                    exception is UnauthorizedAccessException)
                {
                    result.AddIssue("approval.evidence-unreadable", "批准证据文件无法读取。");
                    break;
                }
            }

            if (!hasUserApproval)
            {
                result.AddIssue("approval.user-required", "正式图片导入必须包含绑定当前任务和版本的用户批准。");
            }

            if (missingReviewDisciplines.Count > 0)
            {
                result.AddIssue(
                    "approval.reviews-required",
                    "正式图片导入必须完成视觉一致性、Unity 可实现性和 UX 可读性三类独立审查。");
            }
            else if (requiredReviewTaskIds.Count != 3 || requiredReviewers.Count != 3)
            {
                result.AddIssue(
                    "approval.review-independence",
                    "三类独立审查必须来自三个不同的审查任务和审查者。");
            }

            ValidateFinalVisualReview(request.FinalVisualReview, result);
        }

        /// <summary>判断批准类型是否属于图片导入可接受的视觉决策。</summary>
        private static bool IsVisualApprovalType(string approvalType)
        {
            return approvalType == "VISUAL_BASELINE" || approvalType == "GAME_VISUAL" ||
                   approvalType == "UI_VISUAL" || approvalType == "RUNTIME_VISUAL";
        }

        /// <summary>判断独立审查专业是否属于公共契约允许值。</summary>
        private static bool IsReviewDiscipline(string discipline)
        {
            return discipline == "VISUAL_CONSISTENCY" || discipline == "UNITY_FEASIBILITY" ||
                   discipline == "UX_READABILITY" || discipline == "QA" || discipline == "RELEASE";
        }

        /// <summary>判断字符串是否是 64 位十六进制 SHA-256。</summary>
        private static bool IsSha256(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length != 64)
            {
                return false;
            }

            foreach (char character in value)
            {
                if (!Uri.IsHexDigit(character))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>验证日期时间带有显式 UTC 标记，避免无时区文本随运行机器而改变语义。</summary>
        private static bool IsUtcDateTime(string value)
        {
            string normalized = value?.Trim() ?? string.Empty;
            bool hasExplicitUtc = normalized.EndsWith("Z", StringComparison.OrdinalIgnoreCase) ||
                                  normalized.EndsWith("+00:00", StringComparison.Ordinal);
            return hasExplicitUtc &&
                   DateTimeOffset.TryParse(
                       normalized,
                       CultureInfo.InvariantCulture,
                       DateTimeStyles.AllowWhiteSpaces,
                       out DateTimeOffset timestamp) &&
                   timestamp.Offset == TimeSpan.Zero;
        }

        /// <summary>验证最终视觉审查证据是项目内真实存在且哈希匹配的文件。</summary>
        private static void ValidateFinalVisualReview(EvidenceDto evidence, ImageValidationResult result)
        {
            if (evidence == null || !string.Equals(evidence.Type, "visual-review", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(evidence.Path) || !IsSha256(evidence.Sha256))
            {
                result.AddIssue("final-review.incomplete", "APPROVED 图片任务必须包含完整的最终视觉审查证据。");
                return;
            }

            string absolutePath;
            try
            {
                absolutePath = WorkflowPaths.ResolveProjectRelative(evidence.Path);
            }
            catch (Exception exception) when (
                exception is ArgumentException ||
                exception is NotSupportedException)
            {
                result.AddIssue("final-review.path-invalid", "最终视觉审查证据必须使用安全的项目相对路径。");
                return;
            }

            if (!File.Exists(absolutePath))
            {
                result.AddIssue("final-review.missing", "最终视觉审查证据文件不存在。");
                return;
            }

            try
            {
                using SHA256 sha256 = SHA256.Create();
                using FileStream stream = File.OpenRead(absolutePath);
                string actualHash = BitConverter.ToString(sha256.ComputeHash(stream)).Replace("-", string.Empty);
                if (!string.Equals(actualHash, evidence.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    result.AddIssue("final-review.hash-mismatch", "最终视觉审查证据 SHA-256 与实际文件不一致。");
                }
            }
            catch (Exception exception) when (
                exception is IOException ||
                exception is UnauthorizedAccessException)
            {
                result.AddIssue("final-review.unreadable", "最终视觉审查证据文件无法读取。");
            }
        }

        /// <summary>解析并限制源图片只能位于当前任务 processed 目录。</summary>
        private static string ResolveSourcePath(ImageImportRequest request, ImageValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(request.SourcePath))
            {
                result.AddIssue("source.path-missing", "selectedCandidate.path 不能为空。");
                return null;
            }

            var normalized = request.SourcePath.Replace('\\', '/');
            var expectedPrefix = $"ArtSource/Generated/{request.TaskId}/processed/";
            if (string.IsNullOrWhiteSpace(request.TaskId) ||
                !normalized.StartsWith(expectedPrefix, StringComparison.Ordinal) ||
                normalized.Length <= expectedPrefix.Length)
            {
                result.AddIssue("source.outside-processed", "源图片必须位于当前任务的 processed 目录内。");
            }

            try
            {
                var absolutePath = WorkflowPaths.ResolveProjectRelative(normalized);
                if (!File.Exists(absolutePath))
                {
                    result.AddIssue("source.not-found", "源图片不存在。");
                    return null;
                }

                return absolutePath;
            }
            catch (Exception exception) when (exception is ArgumentException || exception is NotSupportedException)
            {
                result.AddIssue("source.path-invalid", "源图片路径不是安全的项目相对路径。");
                return null;
            }
        }

        /// <summary>解析并限制正式目标只能位于运行时美术根。</summary>
        private static string ResolveTargetPath(ImageImportRequest request, ImageValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(request.TargetDirectory))
            {
                result.AddIssue("target.directory-missing", "正式资产目标目录不能为空。");
                return null;
            }

            var normalizedDirectory = request.TargetDirectory.Replace('\\', '/').TrimEnd('/');
            var allowed = false;
            foreach (var root in AllowedTargetRoots)
            {
                if (string.Equals(normalizedDirectory, root, StringComparison.Ordinal) ||
                    normalizedDirectory.StartsWith(root + "/", StringComparison.Ordinal))
                {
                    allowed = true;
                    break;
                }
            }

            if (!allowed)
            {
                result.AddIssue("target.not-allowed", "目标目录不在正式运行时美术白名单内。");
            }

            if (string.IsNullOrWhiteSpace(request.FileName) ||
                !string.Equals(Path.GetFileName(request.FileName), request.FileName, StringComparison.Ordinal))
            {
                result.AddIssue("target.filename-invalid", "目标文件名不得包含目录或为空。");
                return null;
            }

            try
            {
                return WorkflowPaths.ResolveProjectRelative(normalizedDirectory + "/" + request.FileName);
            }
            catch (Exception exception) when (exception is ArgumentException || exception is NotSupportedException)
            {
                result.AddIssue("target.path-invalid", "目标路径不是安全的项目相对路径。");
                return null;
            }
        }

        /// <summary>阻止覆盖已有正式资源或孤立的既有 GUID 元数据。</summary>
        private static void ValidateOverwriteProtection(string targetPath, ImageValidationResult result)
        {
            if (File.Exists(targetPath) || Directory.Exists(targetPath))
            {
                result.AddIssue("target.exists", "禁止覆盖已有正式资源。");
            }

            if (File.Exists(targetPath + ".meta"))
            {
                result.AddIssue("target.meta-exists", "目标存在 .meta，禁止重建或覆盖其 GUID。");
            }
        }

        /// <summary>校验源格式签名、哈希、尺寸与目标扩展名。</summary>
        private static void ValidateSourceFile(
            ImageImportRequest request,
            string sourcePath,
            ImageValidationResult result)
        {
            var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
            if (extension != ".png" && extension != ".jpg" && extension != ".jpeg")
            {
                result.AddIssue("source.format-extension", "只允许导入 PNG、JPG 或 JPEG。");
                return;
            }

            byte[] bytes;
            try
            {
                long sourceFileSize = new FileInfo(sourcePath).Length;
                if (sourceFileSize <= 0 || sourceFileSize > MaximumSourceFileBytes)
                {
                    result.AddIssue(
                        "source.file-size",
                        $"源图片编码文件必须大于 0 字节且不超过 {MaximumSourceFileBytes / (1024 * 1024)} MB。");
                    return;
                }

                bytes = File.ReadAllBytes(sourcePath);
            }
            catch (Exception exception) when (
                exception is IOException ||
                exception is UnauthorizedAccessException)
            {
                result.AddIssue("source.read-failed", "源图片在校验期间无法安全读取。");
                return;
            }

            var actualFormat = DetectFormat(bytes);
            result.Format = actualFormat;
            if (string.IsNullOrEmpty(actualFormat))
            {
                result.AddIssue("source.format-signature", "源文件内容不是有效的 PNG 或 JPEG。");
                return;
            }

            if ((actualFormat == "PNG" && extension != ".png") ||
                (actualFormat == "JPEG" && extension != ".jpg" && extension != ".jpeg"))
            {
                result.AddIssue("source.format-mismatch", "源文件扩展名与实际图片格式不一致。");
            }

            ValidateSha256(request.SourceSha256, bytes, result);
            DecodeAndValidateDimensions(request, bytes, actualFormat, result);

            var targetExtension = Path.GetExtension(request.FileName ?? string.Empty).ToLowerInvariant();
            var targetMatches = actualFormat == "PNG"
                ? targetExtension == ".png"
                : targetExtension == ".jpg" || targetExtension == ".jpeg";
            if (!targetMatches)
            {
                result.AddIssue("target.format-mismatch", "目标扩展名必须与源图片实际格式一致。");
            }
        }

        /// <summary>比较源文件实际 SHA-256 与批准候选哈希。</summary>
        private static void ValidateSha256(string expectedHash, byte[] bytes, ImageValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(expectedHash) || expectedHash.Length != 64)
            {
                result.AddIssue("source.hash-missing", "selectedCandidate.sha256 必须是 64 位 SHA-256。");
                return;
            }

            string actualHash;
            using (var algorithm = SHA256.Create())
            {
                actualHash = BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }

            if (!string.Equals(expectedHash, actualHash, StringComparison.OrdinalIgnoreCase))
            {
                result.AddIssue("source.hash-mismatch", "源图片 SHA-256 与已批准候选不一致。");
            }
        }

        /// <summary>使用 Unity 解码图片并检查尺寸、画幅及 Alpha 约束。</summary>
        private static void DecodeAndValidateDimensions(
            ImageImportRequest request,
            byte[] bytes,
            string format,
            ImageValidationResult result)
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            try
            {
                if (!ImageConversion.LoadImage(texture, bytes, false))
                {
                    result.AddIssue("source.decode-failed", "Unity 无法解码源图片。");
                    return;
                }

                result.Width = texture.width;
                result.Height = texture.height;
                result.HasAlpha = format == "PNG" && PngDeclaresAlpha(bytes);

                if ((request.MinimumWidth > 0 && result.Width < request.MinimumWidth) ||
                    (request.MinimumHeight > 0 && result.Height < request.MinimumHeight))
                {
                    result.AddIssue("source.too-small", "源图片尺寸低于最小要求。");
                }

                if ((request.MaximumWidth > 0 && result.Width > request.MaximumWidth) ||
                    (request.MaximumHeight > 0 && result.Height > request.MaximumHeight))
                {
                    result.AddIssue("source.too-large", "源图片尺寸超过最大要求。");
                }

                ValidateAspectRatio(request.ExpectedAspectRatio, result.Width, result.Height, result);
                if (request.AlphaRequired && !result.HasAlpha)
                {
                    result.AddIssue("source.alpha-missing", "该任务要求 Alpha 通道，但源图片不包含 Alpha。");
                }

                if (request.AlphaIsTransparency && !result.HasAlpha)
                {
                    result.AddIssue("import.alpha-transparency-invalid", "启用 Alpha 透明度时源图片必须包含 Alpha 通道。");
                }
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        /// <summary>在百分之一相对误差内比较声明画幅与实际画幅。</summary>
        private static void ValidateAspectRatio(string ratio, int width, int height, ImageValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(ratio))
            {
                result.AddIssue("source.aspect-missing", "预期宽高比不能为空。");
                return;
            }

            var parts = ratio.Split(':');
            if (parts.Length != 2 ||
                !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var ratioWidth) ||
                !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var ratioHeight) ||
                ratioWidth <= 0 || ratioHeight <= 0)
            {
                result.AddIssue("source.aspect-invalid", "宽高比必须使用正整数 W:H 格式。");
                return;
            }

            var expected = (double)ratioWidth / ratioHeight;
            var actual = (double)width / height;
            if (Math.Abs(expected - actual) / expected > 0.01d)
            {
                result.AddIssue("source.aspect-mismatch", "源图片宽高比与任务要求不一致。");
            }
        }

        /// <summary>在写入 AssetDatabase 前验证全部 Importer 枚举和数值。</summary>
        private static void ValidateImporterSettings(ImageImportRequest request, ImageValidationResult result)
        {
            if (request.TextureType != "Default" && request.TextureType != "Sprite" && request.TextureType != "NormalMap")
            {
                result.AddIssue("import.texture-type", "TextureType 必须是 Default、Sprite 或 NormalMap。");
            }

            if (request.SpriteMode != "None" && request.SpriteMode != "Single" && request.SpriteMode != "Multiple")
            {
                result.AddIssue("import.sprite-mode", "SpriteMode 必须是 None、Single 或 Multiple。");
            }
            else if (request.TextureType == "Sprite" && request.SpriteMode == "None")
            {
                result.AddIssue("import.sprite-mode-missing", "Sprite 纹理必须选择 Single 或 Multiple。");
            }
            else if (request.TextureType != "Sprite" && request.SpriteMode != "None")
            {
                result.AddIssue("import.sprite-mode-unexpected", "非 Sprite 纹理的 SpriteMode 必须为 None。");
            }

            if (request.PixelsPerUnit <= 0f)
            {
                result.AddIssue("import.pixels-per-unit", "PixelsPerUnit 必须大于零。");
            }

            if (request.FilterMode != "Point" && request.FilterMode != "Bilinear" && request.FilterMode != "Trilinear")
            {
                result.AddIssue("import.filter-mode", "FilterMode 不是受支持值。");
            }

            if (request.WrapMode != "Repeat" && request.WrapMode != "Clamp" &&
                request.WrapMode != "Mirror" && request.WrapMode != "MirrorOnce")
            {
                result.AddIssue("import.wrap-mode", "WrapMode 不是受支持值。");
            }

            if (request.MaxSize < 32 || request.MaxSize > 16384 || (request.MaxSize & (request.MaxSize - 1)) != 0)
            {
                result.AddIssue("import.max-size", "MaxSize 必须是 32 到 16384 的 2 次幂。");
            }

            if (request.Compression != "None" && request.Compression != "LowQuality" &&
                request.Compression != "NormalQuality" && request.Compression != "HighQuality")
            {
                result.AddIssue("import.compression", "Compression 不是受支持值。");
            }
        }

        /// <summary>依据文件签名识别 PNG 或 JPEG，拒绝仅伪装扩展名的文件。</summary>
        private static string DetectFormat(byte[] bytes)
        {
            if (bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E &&
                bytes[3] == 0x47 && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A)
            {
                return "PNG";
            }

            if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
            {
                return "JPEG";
            }

            return null;
        }

        /// <summary>通过 IHDR 色彩类型或 tRNS 块判断 PNG 是否声明透明信息。</summary>
        private static bool PngDeclaresAlpha(byte[] bytes)
        {
            if (bytes.Length < 26)
            {
                return false;
            }

            var colorType = bytes[25];
            if (colorType == 4 || colorType == 6)
            {
                return true;
            }

            // 调色板 PNG 可通过 tRNS 块声明透明度，因此不能只检查 IHDR color type。
            for (var offset = 8; offset + 12 <= bytes.Length;)
            {
                var chunkLength = ReadBigEndianInt32(bytes, offset);
                if (chunkLength < 0 || offset + 12L + chunkLength > bytes.Length)
                {
                    return false;
                }

                if (bytes[offset + 4] == (byte)'t' && bytes[offset + 5] == (byte)'R' &&
                    bytes[offset + 6] == (byte)'N' && bytes[offset + 7] == (byte)'S')
                {
                    return true;
                }

                offset += 12 + chunkLength;
            }

            return false;
        }

        /// <summary>读取 PNG 块使用的 32 位大端长度。</summary>
        private static int ReadBigEndianInt32(byte[] bytes, int offset)
        {
            return (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                   (bytes[offset + 2] << 8) | bytes[offset + 3];
        }

        /// <summary>把缺失的必填文本转换为稳定结构化问题。</summary>
        private static void RequireText(string value, string code, string message, ImageValidationResult result)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                result.AddIssue(code, message);
            }
        }
    }
}
