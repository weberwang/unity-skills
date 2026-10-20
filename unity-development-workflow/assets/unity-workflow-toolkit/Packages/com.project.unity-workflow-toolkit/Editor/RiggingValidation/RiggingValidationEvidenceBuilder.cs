using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 从已由 Unity 加载的角色输入建立可回读的资源身份清单。
    /// </summary>
    internal static class RiggingValidationEvidenceBuilder
    {
        /// <summary>为实际加载的 Prefab 及其动画、变体递归依赖添加来源证据。</summary>
        /// <param name="report">接收来源记录和检查结果的报告。</param>
        /// <param name="prefabPath">已通过请求路径验证且成功加载的 Prefab 路径。</param>
        /// <param name="loadedPrefabContents">当前临时加载场景中的 Prefab 根节点。</param>
        /// <param name="request">声明动画和 Sprite 变体输入的请求。</param>
        public static void AddSourceEvidence(
            QualityReportDto report,
            string prefabPath,
            GameObject loadedPrefabContents,
            RiggingValidationRequest request)
        {
            bool complete = loadedPrefabContents != null && request != null;
            string sourceRevision = request == null ? string.Empty : request.SourceRevision;
            bool prefabIdentityAvailable = TryReadLoadedAsset(
                prefabPath,
                typeof(GameObject),
                out string actualPrefabPath,
                out string prefabGuid);

            if (prefabIdentityAvailable && loadedPrefabContents != null)
            {
                report.Evidence.Add(CreateEvidence(
                    "rigging-prefab",
                    actualPrefabPath,
                    prefabGuid,
                    sourceRevision));
            }
            else
            {
                complete = false;
            }

            var verifiedRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (prefabIdentityAvailable)
            {
                verifiedRoots.Add(actualPrefabPath);
            }

            complete &= AddVerifiedClipRoots(request, verifiedRoots);
            complete &= AddVerifiedVariantRoots(request, verifiedRoots);

            var dependencies = new Dictionary<string, EvidenceDto>(StringComparer.OrdinalIgnoreCase);
            foreach (string sourcePath in verifiedRoots)
            {
                string[] dependencyPaths;
                try
                {
                    dependencyPaths = AssetDatabase.GetDependencies(sourcePath, true);
                }
                catch (Exception)
                {
                    complete = false;
                    continue;
                }

                if (dependencyPaths == null)
                {
                    complete = false;
                    dependencyPaths = Array.Empty<string>();
                }

                var allDependencyPaths = new HashSet<string>(dependencyPaths, StringComparer.OrdinalIgnoreCase)
                {
                    sourcePath
                };
                foreach (string dependencyPath in allDependencyPaths)
                {
                    if (string.IsNullOrWhiteSpace(dependencyPath))
                    {
                        complete = false;
                        continue;
                    }

                    if (!dependencyPath.StartsWith("Assets/", StringComparison.Ordinal))
                    {
                        // Packages 与 Unity 内置资源不是本项目的 Assets 输入，不能赋予本地身份。
                        continue;
                    }

                    if (string.Equals(dependencyPath, actualPrefabPath, StringComparison.OrdinalIgnoreCase))
                    {
                        // Prefab 已通过专用类型记录，避免把同一资源重复伪装成普通依赖。
                        continue;
                    }

                    if (!TryReadAssetIdentity(dependencyPath, out string actualPath, out string guid))
                    {
                        complete = false;
                        continue;
                    }

                    if (!dependencies.ContainsKey(actualPath))
                    {
                        dependencies.Add(actualPath, CreateEvidence(
                            "rigging-dependency",
                            actualPath,
                            guid,
                            sourceRevision));
                    }
                }
            }

            foreach (EvidenceDto dependency in dependencies.Values)
            {
                report.Evidence.Add(dependency);
            }

            complete &= prefabIdentityAvailable && dependencies.Count > 0;
            RiggingValidationReportBuilder.AddCheck(
                report,
                "asset-source-evidence",
                "provenance",
                complete ? "PASS" : "FAIL",
                complete
                    ? "报告已绑定 Unity 实际加载的角色 Prefab，并记录动画、变体及递归 Assets 依赖的 GUID。"
                    : "无法为全部已声明输入建立完整的 Unity 资源来源身份；报告不得用于交付放行。");
        }

        /// <summary>只把 Unity 实际加载的 AnimationClip 加入递归来源集合。</summary>
        /// <param name="request">当前角色检查请求。</param>
        /// <param name="verifiedRoots">接收已核验的规范资源路径。</param>
        /// <returns>每个请求片段都存在且可读取时返回 true。</returns>
        private static bool AddVerifiedClipRoots(RiggingValidationRequest request, HashSet<string> verifiedRoots)
        {
            bool complete = request != null && request.Clips != null && request.Clips.Count > 0;
            if (request == null || request.Clips == null)
            {
                return false;
            }

            foreach (RiggingClipRequirement clip in request.Clips)
            {
                if (clip == null || !TryReadLoadedAsset(
                        clip.ClipPath,
                        typeof(AnimationClip),
                        out string actualPath,
                        out _))
                {
                    complete = false;
                    continue;
                }

                verifiedRoots.Add(actualPath);
            }

            return complete;
        }

        /// <summary>只把精确名称匹配且实际加载的 Sprite 变体加入来源集合。</summary>
        /// <param name="request">当前角色检查请求。</param>
        /// <param name="verifiedRoots">接收已核验的规范资源路径。</param>
        /// <returns>每个请求变体都存在且可读取时返回 true。</returns>
        private static bool AddVerifiedVariantRoots(RiggingValidationRequest request, HashSet<string> verifiedRoots)
        {
            if (request == null)
            {
                return false;
            }

            bool complete = true;
            foreach (RiggingVariantRequirement variant in request.Variants ?? new List<RiggingVariantRequirement>())
            {
                if (variant == null)
                {
                    complete = false;
                    continue;
                }

                // 在读取变体子资源前同时核对资源与 meta 路径，防止链接路径先进入 Unity 查询。
                if (!TryPrepareAssetPath(variant.SpritePath, out string validatedPath, out _))
                {
                    complete = false;
                    continue;
                }

                try
                {
                    Sprite[] matches = AssetDatabase.LoadAllAssetsAtPath(validatedPath)
                        .OfType<Sprite>()
                        .Where(sprite => string.Equals(sprite.name, variant.SpriteName, StringComparison.Ordinal))
                        .ToArray();
                    if (matches.Length != 1 ||
                        !TryReadLoadedAsset(validatedPath, typeof(Texture2D), out string actualPath, out _))
                    {
                        complete = false;
                        continue;
                    }

                    verifiedRoots.Add(actualPath);
                }
                catch (Exception)
                {
                    complete = false;
                }
            }

            return complete;
        }

        /// <summary>通过 Unity 加载对象反查资源身份，不接受只由请求文本声明的来源。</summary>
        /// <param name="requestedPath">请求中声明的项目资源路径。</param>
        /// <param name="requiredType">对象必须可由 AssetDatabase 以该类型加载。</param>
        /// <param name="actualPath">成功时由 Unity 对象反查出的项目路径。</param>
        /// <param name="guid">成功时从 AssetDatabase 获取的资源 GUID。</param>
        /// <returns>对象已加载且资源文件及 GUID 均有效时返回 true。</returns>
        private static bool TryReadLoadedAsset(
            string requestedPath,
            Type requiredType,
            out string actualPath,
            out string guid)
        {
            actualPath = string.Empty;
            guid = string.Empty;
            if (!TryPrepareAssetPath(requestedPath, out string validatedPath, out _))
            {
                return false;
            }

            try
            {
                UnityEngine.Object loadedAsset = AssetDatabase.LoadAssetAtPath(validatedPath, requiredType);
                string objectPath = loadedAsset == null ? string.Empty : AssetDatabase.GetAssetPath(loadedAsset);
                if (loadedAsset == null || !string.Equals(objectPath, validatedPath, StringComparison.Ordinal) ||
                    !TryReadAssetIdentity(objectPath, out actualPath, out guid))
                {
                    actualPath = string.Empty;
                    guid = string.Empty;
                    return false;
                }

                return true;
            }
            catch (Exception)
            {
                // 不把 Unity 异常文本写入共享报告，避免泄露主机路径和导入器细节。
                actualPath = string.Empty;
                guid = string.Empty;
                return false;
            }
        }

        /// <summary>通过 Assets 文件、meta 与 AssetDatabase 交叉核实普通依赖身份。</summary>
        /// <param name="path">Unity 返回的递归依赖项目路径。</param>
        /// <param name="actualPath">成功时的规范 Assets 路径。</param>
        /// <param name="guid">成功时 AssetDatabase 返回的 GUID。</param>
        /// <returns>普通文件、meta 和 32 位 GUID 均有效时返回 true。</returns>
        private static bool TryReadAssetIdentity(string path, out string actualPath, out string guid)
        {
            actualPath = string.Empty;
            guid = string.Empty;
            if (!TryPrepareAssetPath(path, out actualPath, out _))
            {
                return false;
            }

            try
            {
                if (AssetDatabase.LoadMainAssetAtPath(actualPath) == null)
                {
                    actualPath = string.Empty;
                    return false;
                }

                string assetGuid = AssetDatabase.AssetPathToGUID(actualPath);
                if (!IsUnityGuid(assetGuid))
                {
                    actualPath = string.Empty;
                    return false;
                }

                guid = assetGuid.ToLowerInvariant();
                return true;
            }
            catch (Exception)
            {
                // 资源路径可能失效或经过重解析点；统一失败且不外泄绝对路径。
                actualPath = string.Empty;
                return false;
            }
        }

        /// <summary>在访问文件或 AssetDatabase 前核对 Assets 文件和对应 meta 均不经过链接。</summary>
        /// <param name="path">待读取的规范项目资源路径。</param>
        /// <param name="validatedPath">通过统一请求边界检查的资源路径。</param>
        /// <param name="absolutePath">安全解析后的本地文件路径，不写入报告。</param>
        /// <returns>资源与其 meta 文件都存在且路径边界有效时返回 true。</returns>
        private static bool TryPrepareAssetPath(string path, out string validatedPath, out string absolutePath)
        {
            validatedPath = string.Empty;
            absolutePath = string.Empty;
            if (!IsCanonicalAssetsPath(path) ||
                !RiggingValidationRequestValidator.TryValidateAssetPath(path, null, out string normalizedPath) ||
                !string.Equals(path, normalizedPath, StringComparison.Ordinal))
            {
                return false;
            }

            try
            {
                string resolvedAssetPath = WorkflowPaths.ResolveProjectRelative(normalizedPath);
                // 共享路径校验已检查 .meta 的重解析点，此处只补齐资源和 meta 的实际文件存在性。
                if (!File.Exists(resolvedAssetPath) || !File.Exists(resolvedAssetPath + ".meta"))
                {
                    return false;
                }

                validatedPath = normalizedPath;
                absolutePath = resolvedAssetPath;
                return true;
            }
            catch (Exception)
            {
                // 统一拒绝越界或链接路径，不将环境路径或底层异常写入共享报告。
                return false;
            }
        }

        /// <summary>拒绝非规范或不在 Assets 下的 Unity 资源路径。</summary>
        /// <param name="path">待核验的 Unity 项目路径。</param>
        /// <returns>仅使用正斜杠且没有空段或点段的 Assets 路径返回 true。</returns>
        private static bool IsCanonicalAssetsPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) ||
                !path.StartsWith("Assets/", StringComparison.Ordinal) ||
                path.IndexOf('\\') >= 0)
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

        /// <summary>验证 Unity 元数据 GUID 为 32 位十六进制标识。</summary>
        /// <param name="value">AssetDatabase 返回的资源标识。</param>
        /// <returns>GUID 长度和字符集有效时返回 true。</returns>
        private static bool IsUnityGuid(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length != 32)
            {
                return false;
            }

            foreach (char character in value)
            {
                bool isHex = (character >= '0' && character <= '9') ||
                             (character >= 'a' && character <= 'f') ||
                             (character >= 'A' && character <= 'F');
                if (!isHex)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>创建绑定真实 Unity 资源 GUID 与本次请求修订号的证据对象。</summary>
        /// <param name="type">Prefab 或普通递归依赖的证据类型。</param>
        /// <param name="path">Unity 资源项目路径。</param>
        /// <param name="guid">AssetDatabase 实际返回的 GUID。</param>
        /// <param name="sourceRevision">检查请求声明的当前源修订。</param>
        /// <returns>可被统一工作流质量报告序列化的资源证据。</returns>
        private static EvidenceDto CreateEvidence(string type, string path, string guid, string sourceRevision)
        {
            return new EvidenceDto
            {
                Type = type,
                Path = path,
                SubjectId = guid,
                SubjectVersion = sourceRevision ?? string.Empty,
                SourceRevision = sourceRevision ?? string.Empty
            };
        }
    }
}
