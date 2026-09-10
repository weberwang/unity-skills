using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Project.UnityWorkflow.ProjectValidation
{
    /// <summary>
    /// 保存项目校验所需的 Unity 状态快照，支持无副作用的规则测试。
    /// </summary>
    [Serializable]
    public sealed class ProjectValidationSnapshot
    {
        public string UnityVersion = string.Empty;
        public bool IsUrp;
        public string ActivePlatformId = string.Empty;
        public string[] EnabledBuildScenes = Array.Empty<string>();
        public string[] MissingBuildScenes = Array.Empty<string>();
        public string[] MissingAssetReferences = Array.Empty<string>();
        public string[] AssemblyDependencyCycles = Array.Empty<string>();
        public int ConsoleErrorCount;
        public int ConsoleErrorBaseline;
        public bool ConsoleCountAvailable = true;
    }

    /// <summary>
    /// 验证 Unity 版本、渲染管线、构建配置和项目完整性，并返回质量报告。
    /// </summary>
    public sealed class ProjectValidationService
    {
        private static readonly Regex GuidReferencePattern = new Regex(
            @"guid:\s*([0-9a-fA-F]{32})",
            RegexOptions.Compiled | RegexOptions.CultureInvariant);

        /// <summary>
        /// 从当前 Unity Editor 收集项目状态并执行校验。
        /// </summary>
        /// <param name="profile">项目目标和交付约束。</param>
        /// <returns>符合工作流质量报告结构的校验结果。</returns>
        public QualityReportDto Validate(ProjectProfileDto profile)
        {
            if (profile == null)
            {
                return CreateInvalidRequestReport();
            }

            return Evaluate(profile, CreateSnapshot());
        }

        /// <summary>
        /// 使用给定状态快照执行确定性校验，不读取或修改 Unity 项目状态。
        /// </summary>
        /// <param name="profile">项目目标和交付约束。</param>
        /// <param name="snapshot">待验证的项目状态快照。</param>
        /// <returns>结构化质量报告。</returns>
        public QualityReportDto Evaluate(ProjectProfileDto profile, ProjectValidationSnapshot snapshot)
        {
            if (profile == null || snapshot == null)
            {
                return CreateInvalidRequestReport();
            }

            QualityReportDto report = CreateReport(profile.ProjectId);
            string[] enabledBuildScenes = snapshot.EnabledBuildScenes ?? Array.Empty<string>();
            string[] missingBuildScenes = snapshot.MissingBuildScenes ?? Array.Empty<string>();
            string[] missingAssetReferences = snapshot.MissingAssetReferences ?? Array.Empty<string>();
            string[] assemblyDependencyCycles = snapshot.AssemblyDependencyCycles ?? Array.Empty<string>();
            string expectedUnityVersion = profile.Unity == null ? string.Empty : profile.Unity.Version;
            string expectedPipeline = profile.Unity == null ? string.Empty : profile.Unity.RenderPipeline;
            string expectedPlatform = profile.Delivery == null ? string.Empty : profile.Delivery.PrimaryDevelopmentPlatform;
            List<PlatformTargetDto> targets = profile.Delivery?.Targets ?? new List<PlatformTargetDto>();
            string[] targetIds = targets
                .Where(item => item != null && !string.IsNullOrWhiteSpace(item.PlatformId))
                .Select(item => item.PlatformId)
                .ToArray();
            bool platformSelectionValid = profile.Delivery != null &&
                string.Equals(profile.Delivery.PlatformSelectionStatus, "APPROVED", StringComparison.OrdinalIgnoreCase) &&
                targetIds.Length > 0 &&
                targetIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() == targetIds.Length &&
                targetIds.Contains(expectedPlatform, StringComparer.OrdinalIgnoreCase);

            AddCheck(report, "unity-version", "static",
                IsUnityVersionCompatible(expectedUnityVersion, snapshot.UnityVersion) ? "PASS" : "FAIL",
                $"期望 Unity {expectedUnityVersion}，当前版本为 {snapshot.UnityVersion}。" );
            AddCheck(report, "render-pipeline", "static",
                string.Equals(expectedPipeline, "URP", StringComparison.OrdinalIgnoreCase) && snapshot.IsUrp
                    ? "PASS"
                    : "FAIL",
                snapshot.IsUrp ? "当前渲染管线为 URP。" : "当前项目未启用 URP。" );
            AddCheck(report, "platform-selection", "static",
                platformSelectionValid ? "PASS" : "FAIL",
                platformSelectionValid
                    ? $"用户已批准 {targetIds.Length} 个目标平台，主开发平台为 {expectedPlatform}。"
                    : "平台集合必须获用户批准、不得重复，且必须包含主开发平台。" );
            AddCheck(report, "build-target", "build",
                IsBuildTargetCompatible(expectedPlatform, snapshot.ActivePlatformId)
                    ? "PASS"
                    : "FAIL",
                $"期望主开发平台 {expectedPlatform}，当前构建目标为 {snapshot.ActivePlatformId}。" );
            AddCheck(report, "build-scenes", "static",
                enabledBuildScenes.Length > 0 && missingBuildScenes.Length == 0
                    ? "PASS"
                    : "FAIL",
                enabledBuildScenes.Length == 0
                    ? "未配置启用的构建场景。"
                    : missingBuildScenes.Length == 0
                        ? $"已验证 {enabledBuildScenes.Length} 个构建场景。"
                        : "存在缺失的构建场景：" + string.Join(", ", missingBuildScenes));
            AddCheck(report, "asset-references", "static",
                missingAssetReferences.Length == 0 ? "PASS" : "FAIL",
                missingAssetReferences.Length == 0
                    ? "构建场景中未发现缺失的 GUID 引用。"
                    : "发现缺失的资源引用：" + string.Join(", ", missingAssetReferences));
            AddCheck(report, "assembly-cycles", "compile",
                assemblyDependencyCycles.Length == 0 ? "PASS" : "FAIL",
                assemblyDependencyCycles.Length == 0
                    ? "程序集定义中未发现循环依赖。"
                    : "发现程序集循环依赖：" + string.Join("；", assemblyDependencyCycles));

            string consoleStatus = snapshot.ConsoleCountAvailable
                ? snapshot.ConsoleErrorCount <= snapshot.ConsoleErrorBaseline ? "PASS" : "FAIL"
                : "BLOCKED";
            AddCheck(report, "console-errors", "console", consoleStatus,
                snapshot.ConsoleCountAvailable
                    ? $"Console Error 当前 {snapshot.ConsoleErrorCount}，允许基线 {snapshot.ConsoleErrorBaseline}。"
                    : "当前 Unity 版本无法读取 Console Error 数量，必须由工作流 Pipeline 命令提供增量错误证据。" );

            report.Status = DetermineOverallStatus(report.Checks);
            return report;
        }

        /// <summary>
        /// 收集当前项目的构建场景、资源引用、程序集和 Console 状态。
        /// </summary>
        private static ProjectValidationSnapshot CreateSnapshot()
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

            bool consoleCountAvailable = TryGetConsoleErrorCount(out int consoleErrorCount);
            RenderPipelineAsset renderPipeline = GraphicsSettings.currentRenderPipeline ?? GraphicsSettings.defaultRenderPipeline;
            string renderPipelineType = renderPipeline == null ? string.Empty : renderPipeline.GetType().FullName;

            return new ProjectValidationSnapshot
            {
                UnityVersion = Application.unityVersion,
                IsUrp = !string.IsNullOrEmpty(renderPipelineType) &&
                        renderPipelineType.IndexOf("UniversalRenderPipeline", StringComparison.OrdinalIgnoreCase) >= 0,
                ActivePlatformId = GetPlatformId(EditorUserBuildSettings.activeBuildTarget),
                EnabledBuildScenes = enabledScenes.ToArray(),
                MissingBuildScenes = missingScenes.ToArray(),
                MissingAssetReferences = FindMissingAssetReferences(enabledScenes),
                AssemblyDependencyCycles = FindAssemblyDependencyCycles(),
                ConsoleErrorCount = consoleErrorCount,
                ConsoleErrorBaseline = 0,
                ConsoleCountAvailable = consoleCountAvailable
            };
        }

        /// <summary>
        /// 将 Unity 构建目标映射为工作流稳定平台 ID；未知目标保持为空并使校验失败。
        /// </summary>
        private static string GetPlatformId(BuildTarget target)
        {
            if (target == BuildTarget.StandaloneWindows64 || target == BuildTarget.StandaloneWindows)
            {
                return "WINDOWS";
            }

            if (target == BuildTarget.Android)
            {
                return "ANDROID";
            }

            if (target == BuildTarget.iOS)
            {
                // Unity 的 iOS 构建目标同时服务 iPhone 与 iPad，最终设备区分由批准的目标配置决定。
                return "IOS";
            }

            return string.Empty;
        }

        /// <summary>
        /// 判断活动 Unity BuildTarget 是否能服务批准的主开发平台；iPhone 与 iPad 共用 iOS BuildTarget。
        /// </summary>
        private static bool IsBuildTargetCompatible(string expectedPlatform, string activePlatform)
        {
            if (string.Equals(expectedPlatform, "IPADOS", StringComparison.OrdinalIgnoreCase))
            {
                return string.Equals(activePlatform, "IOS", StringComparison.OrdinalIgnoreCase);
            }

            return string.Equals(expectedPlatform, activePlatform, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// 扫描文本序列化场景中的 GUID，报告无法由 AssetDatabase 解析的引用。
        /// </summary>
        private static string[] FindMissingAssetReferences(IEnumerable<string> scenePaths)
        {
            HashSet<string> missing = new HashSet<string>(StringComparer.Ordinal);
            foreach (string scenePath in scenePaths)
            {
                string absolutePath;
                try
                {
                    absolutePath = WorkflowPaths.ResolveProjectRelative(scenePath);
                }
                catch (Exception)
                {
                    continue;
                }

                if (!File.Exists(absolutePath))
                {
                    continue;
                }

                string sceneText;
                try
                {
                    sceneText = File.ReadAllText(absolutePath);
                }
                catch (Exception)
                {
                    missing.Add(scenePath + " -> 无法扫描资源引用");
                    continue;
                }

                foreach (Match match in GuidReferencePattern.Matches(sceneText))
                {
                    string guid = match.Groups[1].Value.ToLowerInvariant();
                    if (IsBuiltInGuid(guid) || !string.IsNullOrEmpty(AssetDatabase.GUIDToAssetPath(guid)))
                    {
                        continue;
                    }

                    missing.Add(scenePath + " -> " + guid);
                }
            }

            return missing.OrderBy(value => value, StringComparer.Ordinal).ToArray();
        }

        /// <summary>
        /// 读取所有 asmdef 并通过深度优先搜索返回可复现的循环路径。
        /// </summary>
        private static string[] FindAssemblyDependencyCycles()
        {
            Dictionary<string, AssemblyDefinitionDocument> assemblies = new Dictionary<string, AssemblyDefinitionDocument>(StringComparer.Ordinal);
            Dictionary<string, string> guidToName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string guid in AssetDatabase.FindAssets("t:AssemblyDefinitionAsset"))
            {
                string assetPath = AssetDatabase.GUIDToAssetPath(guid);
                if (!assetPath.StartsWith("Assets/", StringComparison.OrdinalIgnoreCase))
                {
                    // Package 依赖由 Unity 包编译器负责；本服务只分析项目自有程序集。
                    continue;
                }

                try
                {
                    string json = File.ReadAllText(WorkflowPaths.ResolveProjectRelative(assetPath));
                    AssemblyDefinitionDocument document = JsonUtility.FromJson<AssemblyDefinitionDocument>(json);
                    if (document != null && !string.IsNullOrWhiteSpace(document.name))
                    {
                        assemblies[document.name] = document;
                        guidToName[guid] = document.name;
                    }
                }
                catch (Exception)
                {
                    // 无法读取的 asmdef 会由 Unity 编译门禁报告；此处只负责可解析的依赖循环。
                }
            }

            Dictionary<string, VisitState> states = new Dictionary<string, VisitState>(StringComparer.Ordinal);
            List<string> stack = new List<string>();
            HashSet<string> cycles = new HashSet<string>(StringComparer.Ordinal);
            foreach (string assemblyName in assemblies.Keys.OrderBy(name => name, StringComparer.Ordinal))
            {
                VisitAssembly(assemblyName, assemblies, guidToName, states, stack, cycles);
            }

            return cycles.OrderBy(value => value, StringComparer.Ordinal).ToArray();
        }

        /// <summary>
        /// 深度优先遍历单个程序集并在回边处记录循环路径。
        /// </summary>
        private static void VisitAssembly(
            string assemblyName,
            IReadOnlyDictionary<string, AssemblyDefinitionDocument> assemblies,
            IReadOnlyDictionary<string, string> guidToName,
            IDictionary<string, VisitState> states,
            IList<string> stack,
            ISet<string> cycles)
        {
            if (states.TryGetValue(assemblyName, out VisitState existingState))
            {
                if (existingState == VisitState.Visiting)
                {
                    int startIndex = stack.IndexOf(assemblyName);
                    if (startIndex >= 0)
                    {
                        cycles.Add(string.Join(" -> ", stack.Skip(startIndex).Concat(new[] { assemblyName })));
                    }
                }

                return;
            }

            states[assemblyName] = VisitState.Visiting;
            stack.Add(assemblyName);
            foreach (string reference in assemblies[assemblyName].references ?? Array.Empty<string>())
            {
                string dependency = ResolveAssemblyReference(reference, guidToName);
                if (!string.IsNullOrEmpty(dependency) && assemblies.ContainsKey(dependency))
                {
                    VisitAssembly(dependency, assemblies, guidToName, states, stack, cycles);
                }
            }

            stack.RemoveAt(stack.Count - 1);
            states[assemblyName] = VisitState.Visited;
        }

        /// <summary>
        /// 将 asmdef 的名称引用或 GUID 引用解析为程序集名称。
        /// </summary>
        private static string ResolveAssemblyReference(string reference, IReadOnlyDictionary<string, string> guidToName)
        {
            if (string.IsNullOrWhiteSpace(reference))
            {
                return string.Empty;
            }

            const string guidPrefix = "GUID:";
            if (!reference.StartsWith(guidPrefix, StringComparison.OrdinalIgnoreCase))
            {
                return reference;
            }

            string guid = reference.Substring(guidPrefix.Length);
            return guidToName.TryGetValue(guid, out string assemblyName) ? assemblyName : string.Empty;
        }

        /// <summary>
        /// 通过 UnityEditor 内部只读接口获取 Console Error 数量，不清空现有日志。
        /// </summary>
        private static bool TryGetConsoleErrorCount(out int errorCount)
        {
            errorCount = 0;
            Type logEntriesType = typeof(EditorWindow).Assembly.GetType("UnityEditor.LogEntries");
            MethodInfo getCounts = logEntriesType?.GetMethod(
                "GetCountsByType",
                BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (getCounts == null)
            {
                return false;
            }

            object[] arguments = { 0, 0, 0 };
            try
            {
                getCounts.Invoke(null, arguments);
                errorCount = (int)arguments[0];
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>
        /// 将工作流中的 Unity 6 标识映射到 Unity 6 的 6000.x 编辑器版本格式。
        /// </summary>
        private static bool IsUnityVersionCompatible(string expectedVersion, string actualVersion)
        {
            if (string.IsNullOrWhiteSpace(expectedVersion) || string.IsNullOrWhiteSpace(actualVersion))
            {
                return false;
            }

            if (expectedVersion == "6")
            {
                return actualVersion.StartsWith("6000.", StringComparison.Ordinal) ||
                       actualVersion.StartsWith("6.", StringComparison.Ordinal);
            }

            return actualVersion.StartsWith(expectedVersion + ".", StringComparison.Ordinal) ||
                   string.Equals(expectedVersion, actualVersion, StringComparison.Ordinal);
        }

        /// <summary>
        /// 过滤 Unity 内置资源使用的特殊 GUID，避免误报缺失引用。
        /// </summary>
        private static bool IsBuiltInGuid(string guid)
        {
            return guid == "00000000000000000000000000000000" ||
                   guid == "0000000000000000e000000000000000" ||
                   guid == "0000000000000000f000000000000000";
        }

        /// <summary>
        /// 创建带基础元数据的质量报告。
        /// </summary>
        private static QualityReportDto CreateReport(string projectId)
        {
            return new QualityReportDto
            {
                SchemaVersion = "1.0",
                TaskId = "project-validation",
                ProjectId = string.IsNullOrWhiteSpace(projectId) ? "unbound-project" : projectId,
                // 此服务无法可靠读取版本控制提交；显式 UNBOUND 可阻止报告被误用为交付证据。
                SourceRevision = "UNBOUND",
                BuildVersion = PlayerSettings.bundleVersion,
                GeneratedAtUtc = DateTime.UtcNow.ToString("O"),
                Checks = new List<QualityCheckDto>(),
                Status = "NOT_RUN"
            };
        }

        /// <summary>
        /// 创建空请求对应的失败报告。
        /// </summary>
        private static QualityReportDto CreateInvalidRequestReport()
        {
            QualityReportDto report = CreateReport("project-validation");
            AddCheck(report, "request", "schema", "FAIL", "项目配置不能为空。");
            report.Status = "FAIL";
            return report;
        }

        /// <summary>
        /// 向质量报告追加一项完整的结构化检查。
        /// </summary>
        private static void AddCheck(
            QualityReportDto report,
            string id,
            string category,
            string status,
            string message)
        {
            string timestamp = DateTime.UtcNow.ToString("O");
            QualityCheckDto check = new QualityCheckDto
            {
                Id = id,
                Category = category,
                Status = status,
                Message = message,
                Environment = "Unity Editor",
                StartedAtUtc = timestamp,
                FinishedAtUtc = timestamp
            };
            if (status != "PASS")
            {
                check.FailureReason = message;
            }

            report.Checks.Add(check);
        }

        /// <summary>
        /// 按 FAIL 优先、BLOCKED 次之的规则计算报告总状态。
        /// </summary>
        private static string DetermineOverallStatus(IEnumerable<QualityCheckDto> checks)
        {
            List<QualityCheckDto> materialized = checks.ToList();
            if (materialized.Any(check => check.Status == "FAIL"))
            {
                return "FAIL";
            }

            return materialized.Any(check => check.Status == "BLOCKED") ? "BLOCKED" : "PASS";
        }

        /// <summary>
        /// 表示 asmdef 文件中循环检测所需的最小字段。
        /// </summary>
        [Serializable]
        private sealed class AssemblyDefinitionDocument
        {
            public string name = string.Empty;
            public string[] references = Array.Empty<string>();
        }

        /// <summary>
        /// 标记程序集深度优先搜索状态。
        /// </summary>
        private enum VisitState
        {
            Visiting,
            Visited
        }
    }
}
