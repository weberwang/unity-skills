using System;
using System.Collections.Generic;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>表示跨程序集重载保留的 Game View 采集终态。</summary>
    [Serializable]
    internal sealed class GameViewCapturePersistedState
    {
        public string outputPath = string.Empty;
        public string absoluteOutputPath = string.Empty;
        public string reportPath = string.Empty;
        public GameViewCaptureRequest request;
        public GameViewCaptureResult result;
        public double completedAt;
    }

    /// <summary>在同一 Editor 会话的域重载间保留 Job 终态和取消原因。</summary>
    internal static class GameViewCaptureSessionStore
    {
        private const string IndexKey = "Project.UnityWorkflow.GameViewCapture.Index";
        private const string StateKeyPrefix = "Project.UnityWorkflow.GameViewCapture.State.";
        internal const double RetentionSeconds = 600d;
        private static readonly HashSet<string> KnownKeys = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>从 SessionState 恢复仍在保留期内的完成或取消结果。</summary>
        /// <returns>经项目路径重新解析且可安全回查的终态记录。</returns>
        public static List<GameViewCapturePersistedState> Restore()
        {
            var restored = new List<GameViewCapturePersistedState>();
            string[] indexedKeys = SessionState.GetString(IndexKey, string.Empty).Split('\n');
            for (int index = 0; index < indexedKeys.Length; index++)
            {
                string key = indexedKeys[index];
                if (string.IsNullOrWhiteSpace(key) || !KnownKeys.Add(key))
                {
                    continue;
                }

                string json = SessionState.GetString(StateKeyPrefix + key, string.Empty);
                GameViewCapturePersistedState state = TryDeserialize(json);
                if (!IsUsable(state, key))
                {
                    KnownKeys.Remove(key);
                    SessionState.SetString(StateKeyPrefix + key, string.Empty);
                    continue;
                }

                double now = EditorApplication.timeSinceStartup;
                if (state.result.status == "PENDING")
                {
                    // 域重载会销毁协程；保留显式取消态，避免同一 Job 被误认为尚未启动。
                    state.result.status = "BLOCKED";
                    state.result.errorCode = "DOMAIN_RELOAD";
                    state.result.message = "程序集已重载，原帧末采集请求已取消；请使用新版本化输出路径重试。";
                    state.result.captureScope = null;
                    state.result.screenshot = null;
                    state.result.uiCoverage = null;
                    state.result.generatedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
                    state.completedAt = now;
                }

                if (now - state.completedAt > RetentionSeconds)
                {
                    KnownKeys.Remove(key);
                    SessionState.SetString(StateKeyPrefix + key, string.Empty);
                    continue;
                }

                state.absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(state.outputPath);
                restored.Add(state);
                SessionState.SetString(StateKeyPrefix + key, JsonUtility.ToJson(state, false));
            }

            RewriteIndex();
            return restored;
        }

        /// <summary>保存一个终态以及完整请求身份，PENDING 不作为成功或可恢复状态持久化。</summary>
        /// <param name="outputPath">用于索引的规范化项目相对 PNG 路径。</param>
        /// <param name="absoluteOutputPath">当前 Editor 项目内解析后的目标文件路径。</param>
        /// <param name="reportPath">配套报告的项目相对路径。</param>
        /// <param name="request">绑定任务、候选和场景的请求快照。</param>
        /// <param name="result">可回查的终态结果。</param>
        /// <param name="completedAt">Editor 单调时钟的终态时间。</param>
        public static void Save(
            string outputPath,
            string absoluteOutputPath,
            string reportPath,
            GameViewCaptureRequest request,
            GameViewCaptureResult result,
            double completedAt)
        {
            if (request == null || result == null || result.status == "PENDING")
            {
                return;
            }

            string normalizedPath = Normalize(outputPath);
            string key = BuildKey(normalizedPath);
            var state = new GameViewCapturePersistedState
            {
                outputPath = normalizedPath,
                absoluteOutputPath = absoluteOutputPath,
                reportPath = Normalize(reportPath),
                request = request,
                result = result,
                completedAt = completedAt
            };

            KnownKeys.Add(key);
            SessionState.SetString(StateKeyPrefix + key, JsonUtility.ToJson(state, false));
            RewriteIndex();
        }

        /// <summary>在终态超时后删除其 SessionState 记录和索引。</summary>
        /// <param name="outputPath">采集请求的项目相对 PNG 路径。</param>
        public static void Remove(string outputPath)
        {
            string key = BuildKey(Normalize(outputPath));
            KnownKeys.Remove(key);
            SessionState.SetString(StateKeyPrefix + key, string.Empty);
            RewriteIndex();
        }

        /// <summary>检查状态字段、保留期和输出路径哈希均与索引匹配。</summary>
        private static bool IsUsable(GameViewCapturePersistedState state, string key)
        {
            if (state == null || state.request == null || state.result == null ||
                !string.Equals(BuildKey(state.outputPath), key, StringComparison.Ordinal) ||
                !string.Equals(Normalize(state.request.outputPath), state.outputPath, StringComparison.Ordinal) ||
                !string.Equals(Normalize(state.reportPath), state.outputPath + ".json", StringComparison.Ordinal) ||
                !string.Equals(state.result.taskId, state.request.taskId, StringComparison.Ordinal) ||
                !string.Equals(state.result.candidateId, state.request.candidateId, StringComparison.Ordinal) ||
                !string.Equals(state.result.scenePath, Normalize(state.request.scenePath), StringComparison.Ordinal) ||
                !string.Equals(state.result.requestedOutputPath, state.outputPath, StringComparison.Ordinal) ||
                double.IsNaN(state.completedAt) || double.IsInfinity(state.completedAt) || state.completedAt < 0d)
            {
                return false;
            }

            if (state.result.status != "PENDING" && state.result.status != "PASS" &&
                state.result.status != "FAIL" && state.result.status != "BLOCKED")
            {
                return false;
            }

            try
            {
                string resolved = WorkflowPaths.ResolveProjectRelative(state.outputPath);
                StringComparison comparison = Application.platform == RuntimePlatform.WindowsEditor
                    ? StringComparison.OrdinalIgnoreCase
                    : StringComparison.Ordinal;
                return string.Equals(resolved, state.absoluteOutputPath, comparison);
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>读取一条可能损坏的 SessionState 记录；损坏内容交由调用方安全丢弃。</summary>
        private static GameViewCapturePersistedState TryDeserialize(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            try
            {
                return JsonUtility.FromJson<GameViewCapturePersistedState>(json);
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>用稳定非加密 Unity Hash128 缩短 SessionState 键，并在记录内复核完整身份。</summary>
        private static string BuildKey(string normalizedOutputPath)
        {
            return Hash128.Compute(normalizedOutputPath ?? string.Empty).ToString();
        }

        /// <summary>将有效记录索引写回 SessionState，避免枚举不可用的编辑器状态键。</summary>
        private static void RewriteIndex()
        {
            SessionState.SetString(IndexKey, string.Join("\n", KnownKeys));
        }

        /// <summary>统一项目相对路径分隔符。</summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }
    }
}
