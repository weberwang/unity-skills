using System;
using System.Collections.Generic;
using System.IO;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 验证骨骼检查请求中的身份、唯一性和项目路径边界。
    /// </summary>
    internal static class RiggingValidationRequestValidator
    {
        /// <summary>验证请求并返回经边界检查的角色 Prefab 路径。</summary>
        /// <param name="request">待验证的请求。</param>
        /// <param name="report">接收逐项检查结果的报告。</param>
        /// <returns>请求中的 Prefab 路径状态；其他请求错误会记录到报告中。</returns>
        public static RiggingValidationRequestState Validate(RiggingValidationRequest request, QualityReportDto report)
        {
            if (request == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, "request", "schema", "FAIL", "骨骼资产检查请求不能为空。");
                return new RiggingValidationRequestState();
            }

            ValidateRequiredValue(report, "schema-version", request.SchemaVersion, "请求 schemaVersion 必须为 1.0。", "1.0");
            ValidateRequiredValue(report, "task-id", request.TaskId, "taskId 不能为空。");
            ValidateRequiredValue(report, "project-id", request.ProjectId, "projectId 不能为空。");
            ValidateRequiredValue(report, "source-revision", request.SourceRevision, "sourceRevision 不能为空。");

            bool prefabPathValid = TryValidateAssetPath(request.PrefabPath, ".prefab", out string prefabPath);
            RiggingValidationReportBuilder.AddCheck(report, "prefab-path", "schema",
                prefabPathValid ? "PASS" : "FAIL",
                prefabPathValid
                    ? "角色 Prefab 路径位于项目 Assets 目录且扩展名有效。"
                    : "角色 Prefab 必须使用项目内 Assets/ 路径、.prefab 扩展名，且不得经路径穿越或重解析点逃逸。");

            bool outputPathValid = TryValidateOutputPath(request.OutputPath, out string outputPath);
            RiggingValidationReportBuilder.AddCheck(report, "output-path", "schema",
                outputPathValid ? "PASS" : "FAIL",
                outputPathValid
                    ? "报告目标路径位于 Artifacts 目录并使用 .json 扩展名；本服务不会写入该路径。"
                    : "报告目标必须是项目 Artifacts/ 下的 .json 文件路径，且不得经路径穿越或重解析点逃逸。");

            bool outputOverlapsInput = outputPathValid && OverlapsInputPath(outputPath, request);
            RiggingValidationReportBuilder.AddCheck(report, "output-input-overlap", "schema",
                !outputPathValid ? "BLOCKED" : outputOverlapsInput ? "FAIL" : "PASS",
                !outputPathValid
                    ? "输出路径格式无效，无法执行覆盖冲突核对。"
                    : outputOverlapsInput
                        ? "报告目标路径不得覆盖 Prefab、动画或 Sprite 输入资源。"
                        : "报告目标路径不会覆盖请求中的 Prefab、动画或 Sprite 输入资源。");

            ValidateClipRequirements(request.Clips, report);
            ValidateVariantRequirements(request.Variants, report);
            return new RiggingValidationRequestState(prefabPathValid, prefabPath);
        }

        /// <summary>验证必填文本字段，并可选地验证固定值。</summary>
        /// <param name="report">接收结果的报告。</param>
        /// <param name="id">检查 ID。</param>
        /// <param name="value">请求字段值。</param>
        /// <param name="failureMessage">失败时的说明。</param>
        /// <param name="expectedValue">必须匹配的固定值；未提供时只检查非空。</param>
        private static void ValidateRequiredValue(
            QualityReportDto report,
            string id,
            string value,
            string failureMessage,
            string expectedValue = null)
        {
            bool valid = !string.IsNullOrWhiteSpace(value) &&
                         (expectedValue == null || string.Equals(value, expectedValue, StringComparison.Ordinal));
            RiggingValidationReportBuilder.AddCheck(report, id, "schema", valid ? "PASS" : "FAIL",
                valid ? "请求字段有效。" : failureMessage);
        }

        /// <summary>验证动画需求非空且 ID 唯一，并逐条检查资源路径。</summary>
        /// <param name="clips">请求中的动画需求。</param>
        /// <param name="report">接收结果的报告。</param>
        private static void ValidateClipRequirements(IList<RiggingClipRequirement> clips, QualityReportDto report)
        {
            if (clips == null || clips.Count == 0)
            {
                RiggingValidationReportBuilder.AddCheck(report, "clip-requirements", "animation", "FAIL",
                    "必须至少声明一个待验证动画，空动画清单不能判定为通过。");
                return;
            }

            HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> clipPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int index = 0; index < clips.Count; index++)
            {
                RiggingClipRequirement clip = clips[index];
                bool validId = clip != null && !string.IsNullOrWhiteSpace(clip.Id) && ids.Add(clip.Id);
                string normalizedPath = string.Empty;
                bool validPath = clip != null && TryValidateAssetPath(clip.ClipPath, null, out normalizedPath);
                bool uniquePath = validPath && clipPaths.Add(normalizedPath);
                bool valid = validId && uniquePath;
                string identity = clip == null ? index.ToString() : string.IsNullOrWhiteSpace(clip.Id) ? index.ToString() : clip.Id;
                RiggingValidationReportBuilder.AddCheck(report, "clip-requirement-" + identity, "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? "动画需求 ID 与资源路径均唯一，ClipPath 位于项目 Assets 目录。"
                        : "动画需求不能为空；ID 必须非空且唯一，ClipPath 必须是唯一的项目 Assets/ 资源路径。");
            }
        }

        /// <summary>验证变体 ID 唯一以及 Sprite 资源路径和子资源名称。</summary>
        /// <param name="variants">请求中的 Sprite 变体需求。</param>
        /// <param name="report">接收结果的报告。</param>
        private static void ValidateVariantRequirements(IList<RiggingVariantRequirement> variants, QualityReportDto report)
        {
            if (variants == null || variants.Count == 0)
            {
                RiggingValidationReportBuilder.AddCheck(report, "variant-requirements", "variant", "PASS",
                    "未声明需额外核对的 Sprite 变体。");
                return;
            }

            HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
            for (int index = 0; index < variants.Count; index++)
            {
                RiggingVariantRequirement variant = variants[index];
                bool validId = variant != null && !string.IsNullOrWhiteSpace(variant.Id) && ids.Add(variant.Id);
                bool validPath = variant != null && TryValidateAssetPath(variant.SpritePath, null, out _);
                bool validName = variant != null && !string.IsNullOrWhiteSpace(variant.SpriteName);
                bool validRendererPath = variant != null && IsValidHierarchyPath(variant.RendererPath);
                bool valid = validId && validPath && validName && validRendererPath;
                string identity = variant == null ? index.ToString() : string.IsNullOrWhiteSpace(variant.Id) ? index.ToString() : variant.Id;
                RiggingValidationReportBuilder.AddCheck(report, "variant-requirement-" + identity, "variant",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? "变体需求 ID、渲染节点路径和 Sprite 资源标识有效。"
                        : "变体需求不能为空；ID、SpritePath 和 SpriteName 必须有效，RendererPath 只能是角色根节点或普通层级路径。");
            }
        }

        /// <summary>验证项目资源及其 meta 路径并返回可传给 Unity AssetDatabase 的规范路径。</summary>
        /// <param name="path">待验证的项目相对路径。</param>
        /// <param name="requiredExtension">必须匹配的扩展名；不限制时传入 null。</param>
        /// <param name="normalizedPath">成功时的正斜杠规范路径。</param>
        /// <returns>路径位于 Assets 且符合格式时返回 true。</returns>
        internal static bool TryValidateAssetPath(string path, string requiredExtension, out string normalizedPath)
        {
            normalizedPath = string.Empty;
            if (!TryNormalizeProjectPath(path, out string candidate) ||
                !candidate.StartsWith("Assets/", StringComparison.Ordinal) ||
                (requiredExtension != null && !string.Equals(Path.GetExtension(candidate), requiredExtension, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }

            try
            {
                WorkflowPaths.ResolveProjectRelative(candidate);
                // Unity 导入资源时会同时读取 meta；在任何 AssetDatabase 查询前也拒绝 meta 链接。
                WorkflowPaths.ResolveProjectRelative(candidate + ".meta");
                normalizedPath = candidate;
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>验证仅供报告输出的 Artifacts JSON 路径，不创建目录或文件。</summary>
        /// <param name="path">报告目标路径。</param>
        /// <returns>路径满足 Artifacts 边界时返回 true。</returns>
        private static bool TryValidateOutputPath(string path, out string normalizedPath)
        {
            normalizedPath = string.Empty;
            if (!TryNormalizeProjectPath(path, out string candidate) ||
                !candidate.StartsWith("Artifacts/", StringComparison.Ordinal) ||
                !string.Equals(Path.GetExtension(candidate), ".json", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            try
            {
                WorkflowPaths.ResolveProjectRelative(candidate);
                normalizedPath = candidate;
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>检查输出路径是否与任一被读取的资源路径重合。</summary>
        /// <param name="outputPath">已通过 Artifacts 边界检查的输出路径。</param>
        /// <param name="request">原始请求。</param>
        /// <returns>输出与输入路径相同时返回 true。</returns>
        private static bool OverlapsInputPath(string outputPath, RiggingValidationRequest request)
        {
            if (string.Equals(outputPath, request.PrefabPath?.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            foreach (RiggingClipRequirement clip in request.Clips ?? new List<RiggingClipRequirement>())
            {
                if (clip != null && string.Equals(outputPath, clip.ClipPath?.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            foreach (RiggingVariantRequirement variant in request.Variants ?? new List<RiggingVariantRequirement>())
            {
                if (variant != null && string.Equals(outputPath, variant.SpritePath?.Replace('\\', '/'), StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>拒绝绝对路径、空路径和非规范路径段。</summary>
        /// <param name="path">项目相对路径。</param>
        /// <param name="normalizedPath">规范化路径。</param>
        /// <returns>路径可安全解析时返回 true。</returns>
        private static bool TryNormalizeProjectPath(string path, out string normalizedPath)
        {
            normalizedPath = string.Empty;
            if (string.IsNullOrWhiteSpace(path) || Path.IsPathRooted(path) || path.IndexOf(':') >= 0)
            {
                return false;
            }

            string candidate = path.Replace('\\', '/');
            string[] segments = candidate.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..")
                {
                    return false;
                }
            }

            normalizedPath = candidate;
            return true;
        }

        /// <summary>验证 RendererPath 是可从角色根节点解析的层级相对路径。</summary>
        /// <param name="path">相对层级路径；空字符串表示角色根节点。</param>
        /// <returns>路径没有绝对前缀、空段、当前或父级跳转时返回 true。</returns>
        private static bool IsValidHierarchyPath(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return true;
            }

            if (path.StartsWith("/", StringComparison.Ordinal) || path.Contains('\\'))
            {
                return false;
            }

            foreach (string segment in path.Split('/'))
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..")
                {
                    return false;
                }
            }

            return true;
        }
    }

    /// <summary>
    /// 携带请求验证后可安全读取的角色 Prefab 路径。
    /// </summary>
    internal sealed class RiggingValidationRequestState
    {
        /// <summary>创建无效状态，供空请求使用。</summary>
        public RiggingValidationRequestState()
        {
        }

        /// <summary>创建带有已验证角色路径的状态。</summary>
        /// <param name="prefabPathValid">角色路径是否通过边界检查。</param>
        /// <param name="prefabPath">正斜杠项目相对路径。</param>
        public RiggingValidationRequestState(bool prefabPathValid, string prefabPath)
        {
            PrefabPathValid = prefabPathValid;
            PrefabPath = prefabPath ?? string.Empty;
        }

        /// <summary>获取 Prefab 路径有效标志。</summary>
        public bool PrefabPathValid { get; }

        /// <summary>获取通过边界检查的 Prefab 路径。</summary>
        public string PrefabPath { get; }
    }
}
