using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.BuildPipeline
{
    /// <summary>
    /// 描述一次 Windows 本地交付预检请求，不包含签名、上传或发布授权。
    /// </summary>
    [Serializable]
    public sealed class DeliveryRequest
    {
        public string TaskId = string.Empty;
        public string ProjectId = string.Empty;
        public string SourceRevision = string.Empty;
        public string Platform = "Windows";
        public string Version = string.Empty;
        public string OutputDirectory = string.Empty;
        public string ArtifactName = string.Empty;
        public string[] QualityReportPaths = Array.Empty<string>();
        public string[] VisualApprovalPaths = Array.Empty<string>();
    }

    /// <summary>
    /// 表示单项交付预检结果。
    /// </summary>
    [Serializable]
    public sealed class DeliveryPreflightCheck
    {
        public string Id = string.Empty;
        public string Status = "FAIL";
        public string Message = string.Empty;
    }

    /// <summary>
    /// 汇总技术构建预检结论和全部阻塞项；不包含的 G3 合规与发布门禁由 ExcludedChecks 明示。
    /// </summary>
    [Serializable]
    public sealed class DeliveryPreflightResult
    {
        public string Status = "FAIL";
        public string Scope = "TECHNICAL_BUILD_PREFLIGHT";
        public string OutputDirectory = string.Empty;
        public string ArtifactPath = string.Empty;
        public List<DeliveryPreflightCheck> Checks = new List<DeliveryPreflightCheck>();
        public string[] ExcludedChecks =
        {
            "license-compliance",
            "privacy-review",
            "signing",
            "upload",
            "publishing"
        };
    }

    /// <summary>
    /// 保存可独立测试的交付环境快照。
    /// </summary>
    [Serializable]
    public sealed class DeliveryPreflightSnapshot
    {
        public bool IsWindowsTarget;
        public string BundleVersion = string.Empty;
        public string[] EnabledBuildScenes = Array.Empty<string>();
        public string[] MissingBuildScenes = Array.Empty<string>();
        public string[] FailedQualityReports = Array.Empty<string>();
        public string[] MissingQualityReports = Array.Empty<string>();
        public string[] UnapprovedVisualRecords = Array.Empty<string>();
        public string[] MissingVisualRecords = Array.Empty<string>();
        public bool OutputPathValid;
        public bool ArtifactExists;
        public string ArtifactPath = string.Empty;
    }

    /// <summary>
    /// 在调用 unity-mcp 正式构建前验证交付条件，不产生构建制品。
    /// </summary>
    public sealed class DeliveryPreflightService
    {
        /// <summary>
        /// 从当前 Unity Editor 和项目证据读取环境快照并执行交付预检。
        /// </summary>
        /// <param name="request">交付平台、版本、证据和输出位置。</param>
        /// <returns>结构化预检结果。</returns>
        public DeliveryPreflightResult Validate(DeliveryRequest request)
        {
            if (request == null)
            {
                return RequestRequiredResult();
            }

            DeliveryPreflightSnapshot snapshot = CreateSnapshot(request);
            return Evaluate(request, snapshot);
        }

        /// <summary>
        /// 使用显式环境快照执行纯校验，便于在不切换构建目标的情况下测试所有分支。
        /// </summary>
        /// <param name="request">交付预检请求。</param>
        /// <param name="snapshot">由调用方提供的项目状态快照。</param>
        /// <returns>结构化预检结果。</returns>
        public DeliveryPreflightResult Evaluate(DeliveryRequest request, DeliveryPreflightSnapshot snapshot)
        {
            if (request == null || snapshot == null)
            {
                return RequestRequiredResult();
            }

            DeliveryPreflightResult result = new DeliveryPreflightResult
            {
                OutputDirectory = Normalize(request.OutputDirectory),
                ArtifactPath = snapshot.ArtifactPath
            };

            AddCheck(result, "delivery-platform", snapshot.IsWindowsTarget && request.Platform == "Windows",
                "当前构建目标和交付平台均为 Windows。",
                "交付预检仅允许 Windows 目标，且 Editor 必须已切换到 Windows。" );
            AddCheck(result, "delivery-version",
                !string.IsNullOrWhiteSpace(request.Version) &&
                string.Equals(request.Version, snapshot.BundleVersion, StringComparison.Ordinal),
                "请求版本与 PlayerSettings.bundleVersion 一致。",
                "请求版本不能为空，且必须与 PlayerSettings.bundleVersion 完全一致。" );
            int enabledSceneCount = snapshot.EnabledBuildScenes?.Length ?? 0;
            string[] missingBuildScenes = snapshot.MissingBuildScenes ?? Array.Empty<string>();
            string[] missingQualityReports = snapshot.MissingQualityReports ?? Array.Empty<string>();
            string[] failedQualityReports = snapshot.FailedQualityReports ?? Array.Empty<string>();
            string[] missingVisualRecords = snapshot.MissingVisualRecords ?? Array.Empty<string>();
            string[] unapprovedVisualRecords = snapshot.UnapprovedVisualRecords ?? Array.Empty<string>();
            int qualityReportCount = request.QualityReportPaths?.Length ?? 0;
            int visualApprovalCount = request.VisualApprovalPaths?.Length ?? 0;

            AddCheck(result, "build-scenes",
                enabledSceneCount > 0 && missingBuildScenes.Length == 0,
                $"已验证 {enabledSceneCount} 个启用的构建场景。",
                enabledSceneCount == 0
                    ? "未配置启用的构建场景。"
                    : "存在缺失的构建场景：" + string.Join(", ", missingBuildScenes));
            AddCheck(result, "quality-reports",
                qualityReportCount > 0 &&
                missingQualityReports.Length == 0 &&
                failedQualityReports.Length == 0,
                $"已验证 {qualityReportCount} 份通过的质量报告。",
                BuildEvidenceFailureMessage(
                    "质量报告",
                    missingQualityReports,
                    failedQualityReports));
            AddCheck(result, "visual-approvals",
                visualApprovalCount > 0 &&
                missingVisualRecords.Length == 0 &&
                unapprovedVisualRecords.Length == 0,
                $"已验证 {visualApprovalCount} 份视觉批准记录。",
                BuildEvidenceFailureMessage(
                    "视觉批准记录",
                    missingVisualRecords,
                    unapprovedVisualRecords));
            AddCheck(result, "output-directory", snapshot.OutputPathValid,
                "构建输出目录位于项目 Artifacts/ 下。",
                "构建输出目录必须是 Artifacts/ 下的项目相对路径。" );
            AddCheck(result, "artifact-overwrite", !snapshot.ArtifactExists,
                "输出位置不存在同名构建制品。",
                "输出位置已存在同名制品，预检禁止覆盖。" );

            result.Status = result.Checks.TrueForAll(check => check.Status == "PASS") ? "PASS" : "FAIL";
            return result;
        }

        /// <summary>
        /// 从 Unity 配置、证据文件和输出目录构造预检快照。
        /// </summary>
        private static DeliveryPreflightSnapshot CreateSnapshot(DeliveryRequest request)
        {
            List<string> enabledScenes = new List<string>();
            List<string> missingScenes = new List<string>();
            foreach (EditorBuildSettingsScene scene in EditorBuildSettings.scenes)
            {
                if (!scene.enabled)
                {
                    continue;
                }

                enabledScenes.Add(scene.path);
                if (AssetDatabase.LoadAssetAtPath<SceneAsset>(scene.path) == null)
                {
                    missingScenes.Add(scene.path);
                }
            }

            EvaluateEvidenceFiles(
                request.QualityReportPaths,
                json => IsPassingQualityReport(json, request),
                out string[] missingQuality,
                out string[] failedQuality);
            EvaluateEvidenceFiles(
                request.VisualApprovalPaths,
                json => IsApprovedVisualRecord(json, request),
                out string[] missingVisual,
                out string[] unapprovedVisual);

            bool outputPathValid = TryResolveArtifactPath(request, out string absoluteArtifactPath);
            bool artifactExists = outputPathValid && HasExistingBuildOutput(absoluteArtifactPath);

            return new DeliveryPreflightSnapshot
            {
                IsWindowsTarget = IsWindowsBuildTarget(EditorUserBuildSettings.activeBuildTarget),
                BundleVersion = PlayerSettings.bundleVersion,
                EnabledBuildScenes = enabledScenes.ToArray(),
                MissingBuildScenes = missingScenes.ToArray(),
                MissingQualityReports = missingQuality,
                FailedQualityReports = failedQuality,
                MissingVisualRecords = missingVisual,
                UnapprovedVisualRecords = unapprovedVisual,
                OutputPathValid = outputPathValid,
                ArtifactExists = artifactExists,
                ArtifactPath = outputPathValid
                    ? WorkflowPaths.ToProjectRelative(absoluteArtifactPath)
                    : string.Empty
            };
        }

        /// <summary>
        /// 逐一检查证据文件是否存在且满足指定状态判定。
        /// </summary>
        private static void EvaluateEvidenceFiles(
            string[] paths,
            Func<string, bool> statusPredicate,
            out string[] missing,
            out string[] rejected)
        {
            List<string> missingPaths = new List<string>();
            List<string> rejectedPaths = new List<string>();
            foreach (string path in paths ?? Array.Empty<string>())
            {
                try
                {
                    string absolutePath = WorkflowPaths.ResolveProjectRelative(Normalize(path));
                    if (!File.Exists(absolutePath))
                    {
                        missingPaths.Add(Normalize(path));
                    }
                    else if (!statusPredicate(File.ReadAllText(absolutePath)))
                    {
                        rejectedPaths.Add(Normalize(path));
                    }
                }
                catch (Exception)
                {
                    // 非法或越界路径按缺失证据处理，避免在报告中泄露解析后的本机路径。
                    missingPaths.Add(Normalize(path));
                }
            }

            missing = missingPaths.ToArray();
            rejected = rejectedPaths.ToArray();
        }

        /// <summary>
        /// 判断质量报告是否与当前项目、源码和版本绑定，且所有检查与证据均通过。
        /// </summary>
        public static bool IsPassingQualityReport(string json, DeliveryRequest request)
        {
            if (!TryParseBoundDocument(json, request, out JObject document) ||
                !IsText(document, "status", "PASS") ||
                !IsUtcDateTime(document["generatedAtUtc"]?.Value<string>()))
            {
                return false;
            }

            JArray checks = document["checks"] as JArray;
            JArray evidence = document["evidence"] as JArray;
            return checks != null && checks.Count > 0 &&
                   checks.All(item => item is JObject check &&
                       IsText(check, "status", "PASS") &&
                       ValidateEvidenceArray(check["evidence"] as JArray)) &&
                   ValidateEvidenceArray(evidence);
        }

        /// <summary>
        /// 判断 Windows 实机视觉记录是否绑定当前构建并获得用户批准。
        /// </summary>
        public static bool IsApprovedVisualRecord(string json, DeliveryRequest request)
        {
            if (!TryParseBoundDocument(json, request, out JObject document) ||
                !IsText(document, "status", "APPROVED") ||
                !IsText(document, "captureSource", "WINDOWS_STANDALONE") ||
                !IsSha256(document["buildArtifactSha256"]?.Value<string>()))
            {
                return false;
            }

            string sceneId = document["sceneId"]?.Value<string>() ?? string.Empty;
            JObject screenshot = document["screenshot"] as JObject;
            string screenshotPath = Normalize(screenshot?["path"]?.Value<string>());
            if (string.IsNullOrWhiteSpace(sceneId) || screenshot == null ||
                !screenshotPath.StartsWith("Artifacts/Visual/Runtime/", StringComparison.Ordinal) ||
                !screenshotPath.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
                !ValidateEvidenceReference(screenshot, "path", "sha256") ||
                (screenshot["width"]?.Value<int>() ?? 0) <= 0 ||
                (screenshot["height"]?.Value<int>() ?? 0) <= 0 ||
                !IsUtcDateTime(screenshot["capturedAtUtc"]?.Value<string>()))
            {
                return false;
            }

            JArray reviews = document["reviews"] as JArray;
            JArray approvals = document["userApprovals"] as JArray;
            return reviews != null && reviews.Count > 0 &&
                   reviews.All(token => IsCompleteVisualApproval(
                       token,
                       "INDEPENDENT_REVIEWER",
                       sceneId,
                       request.Version)) &&
                   approvals != null && approvals.Count > 0 &&
                   approvals.All(token => IsCompleteVisualApproval(
                       token,
                       "USER",
                       sceneId,
                       request.Version));
        }

        /// <summary>
        /// 解析并验证交付证据的公共身份字段，拒绝其他项目、旧源码或旧版本证据。
        /// </summary>
        private static bool TryParseBoundDocument(string json, DeliveryRequest request, out JObject document)
        {
            document = null;
            if (request == null || string.IsNullOrWhiteSpace(request.ProjectId) ||
                string.IsNullOrWhiteSpace(request.SourceRevision) ||
                string.Equals(request.SourceRevision, "UNBOUND", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(request.Version))
            {
                return false;
            }

            try
            {
                document = JObject.Parse(json);
                return IsText(document, "schemaVersion", "1.0") &&
                       IsText(document, "projectId", request.ProjectId) &&
                       IsText(document, "sourceRevision", request.SourceRevision) &&
                       IsText(document, "buildVersion", request.Version);
            }
            catch
            {
                document = null;
                return false;
            }
        }

        /// <summary>
        /// 验证证据数组至少包含一个真实存在且哈希匹配的项目内文件。
        /// </summary>
        private static bool ValidateEvidenceArray(JArray evidence)
        {
            return evidence != null && evidence.Count > 0 && evidence.All(item =>
                item is JObject record &&
                !string.IsNullOrWhiteSpace(record["type"]?.Value<string>()) &&
                ValidateEvidenceReference(record, "path", "sha256"));
        }

        /// <summary>
        /// 验证项目相对证据路径与实际文件 SHA-256，防止只伪造状态字段放行。
        /// </summary>
        private static bool ValidateEvidenceReference(JObject document, string pathField, string hashField)
        {
            string path = document[pathField]?.Value<string>() ?? string.Empty;
            string expectedHash = document[hashField]?.Value<string>() ?? string.Empty;
            if (expectedHash.Length != 64 || expectedHash.Any(character => !Uri.IsHexDigit(character)))
            {
                return false;
            }

            try
            {
                string absolutePath = WorkflowPaths.ResolveProjectRelative(Normalize(path));
                if (!File.Exists(absolutePath))
                {
                    return false;
                }

                using SHA256 sha256 = SHA256.Create();
                using FileStream stream = File.OpenRead(absolutePath);
                string actualHash = BitConverter.ToString(sha256.ComputeHash(stream)).Replace("-", string.Empty);
                return string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// 验证用户视觉批准包含身份、版本、时间和可核验批准证据。
        /// </summary>
        private static bool IsCompleteVisualApproval(
            JToken token,
            string expectedAuthority,
            string subjectId,
            string subjectVersion)
        {
            if (!(token is JObject approval) || !IsText(approval, "approvalType", "RUNTIME_VISUAL") ||
                !IsText(approval, "authority", expectedAuthority) ||
                !IsText(approval, "subjectId", subjectId) ||
                !IsText(approval, "subjectVersion", subjectVersion) ||
                string.IsNullOrWhiteSpace(approval["approvedBy"]?.Value<string>()) ||
                !IsUtcDateTime(approval["approvedAtUtc"]?.Value<string>()))
            {
                return false;
            }

            if (expectedAuthority == "INDEPENDENT_REVIEWER" &&
                (string.IsNullOrWhiteSpace(approval["reviewTaskId"]?.Value<string>()) ||
                 !IsReviewDiscipline(approval["reviewDiscipline"]?.Value<string>())))
            {
                return false;
            }

            return ValidateEvidenceReference(approval, "evidencePath", "evidenceSha256");
        }

        /// <summary>
        /// 验证时间包含明确 UTC 偏移，避免本地时间或旧环境默认时区造成证据歧义。
        /// </summary>
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

        /// <summary>验证字符串是 64 位十六进制 SHA-256。</summary>
        private static bool IsSha256(string value)
        {
            return !string.IsNullOrEmpty(value) && value.Length == 64 &&
                   value.All(Uri.IsHexDigit);
        }

        /// <summary>验证独立审查专业属于公共批准契约允许值。</summary>
        private static bool IsReviewDiscipline(string value)
        {
            return value == "VISUAL_CONSISTENCY" || value == "UNITY_FEASIBILITY" ||
                   value == "UX_READABILITY" || value == "QA" || value == "RELEASE";
        }

        /// <summary>
        /// 使用区分大小写的确定比较校验 JSON 字符串字段。
        /// </summary>
        private static bool IsText(JObject document, string field, string expected)
        {
            return string.Equals(document[field]?.Value<string>(), expected, StringComparison.Ordinal);
        }

        /// <summary>
        /// 验证输出目录并返回预期的 Windows 可执行文件绝对路径。
        /// </summary>
        private static bool TryResolveArtifactPath(DeliveryRequest request, out string artifactPath)
        {
            artifactPath = string.Empty;
            string outputDirectory = Normalize(request.OutputDirectory).TrimEnd('/');
            string artifactName = request.ArtifactName ?? string.Empty;
            if (!outputDirectory.StartsWith("Artifacts/", StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrWhiteSpace(artifactName) ||
                artifactName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                artifactName.Contains("/") || artifactName.Contains("\\"))
            {
                return false;
            }

            if (!artifactName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                artifactName += ".exe";
            }

            try
            {
                artifactPath = WorkflowPaths.ResolveProjectRelative(outputDirectory + "/" + artifactName);
                return true;
            }
            catch (Exception)
            {
                artifactPath = string.Empty;
                return false;
            }
        }

        /// <summary>
        /// 推导 Unity Windows 构建随附的数据目录路径。
        /// </summary>
        private static string GetDataDirectoryPath(string artifactPath)
        {
            if (string.IsNullOrEmpty(artifactPath))
            {
                return string.Empty;
            }

            return Path.Combine(
                Path.GetDirectoryName(artifactPath) ?? string.Empty,
                Path.GetFileNameWithoutExtension(artifactPath) + "_Data");
        }

        /// <summary>
        /// 检查整个候选包目录，避免只检测 EXE 和 Data 目录而覆盖其他 Unity 制品。
        /// </summary>
        private static bool HasExistingBuildOutput(string artifactPath)
        {
            if (File.Exists(artifactPath) || Directory.Exists(GetDataDirectoryPath(artifactPath)))
            {
                return true;
            }

            string directory = Path.GetDirectoryName(artifactPath) ?? string.Empty;
            return Directory.Exists(directory) && Directory.EnumerateFileSystemEntries(directory).Any();
        }

        /// <summary>
        /// 判断当前构建目标是否属于 Windows Standalone。
        /// </summary>
        private static bool IsWindowsBuildTarget(BuildTarget target)
        {
            return target == BuildTarget.StandaloneWindows64 || target == BuildTarget.StandaloneWindows;
        }

        /// <summary>
        /// 添加一项不抛异常的结构化检查结果。
        /// </summary>
        private static void AddCheck(
            DeliveryPreflightResult result,
            string id,
            bool passed,
            string passMessage,
            string failMessage)
        {
            result.Checks.Add(new DeliveryPreflightCheck
            {
                Id = id,
                Status = passed ? "PASS" : "FAIL",
                Message = passed ? passMessage : failMessage
            });
        }

        /// <summary>
        /// 将缺失和状态不通过的证据合并为单条可行动提示。
        /// </summary>
        private static string BuildEvidenceFailureMessage(string label, string[] missing, string[] rejected)
        {
            if ((missing?.Length ?? 0) == 0 && (rejected?.Length ?? 0) == 0)
            {
                return $"至少需要一份{label}。";
            }

            List<string> parts = new List<string>();
            if ((missing?.Length ?? 0) > 0)
            {
                parts.Add("缺失：" + string.Join(", ", missing));
            }

            if ((rejected?.Length ?? 0) > 0)
            {
                parts.Add("状态未通过：" + string.Join(", ", rejected));
            }

            return label + "未通过（" + string.Join("；", parts) + "）。";
        }

        /// <summary>
        /// 返回空请求对应的稳定错误结果。
        /// </summary>
        private static DeliveryPreflightResult RequestRequiredResult()
        {
            DeliveryPreflightResult result = new DeliveryPreflightResult();
            AddCheck(result, "request", false, string.Empty, "交付预检请求不能为空。");
            return result;
        }

        /// <summary>
        /// 统一项目相对路径分隔符。
        /// </summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }

    }
}
