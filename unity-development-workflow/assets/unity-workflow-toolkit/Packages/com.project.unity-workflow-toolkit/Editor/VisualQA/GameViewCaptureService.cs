using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>描述现有 Editor Play Mode 中一次实际 Game View 帧末采集请求。</summary>
    [Serializable]
    public sealed class GameViewCaptureRequest
    {
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string outputPath = string.Empty;
    }

    /// <summary>描述采集完成后的 PNG 实际尺寸、字节数、帧号和 UTC 时间。</summary>
    [Serializable]
    public sealed class GameViewScreenshot
    {
        public string path = string.Empty;
        public int width;
        public int height;
        public long sizeBytes;
        public string capturedAtUtc = string.Empty;
        public int frameCount;
    }

    /// <summary>记录最终 Game View 帧范围和可识别的 UI 渲染路径，不代替像素级视觉验收。</summary>
    [Serializable]
    public sealed class GameViewUiCoverage
    {
        public string status = "NO_RUNTIME_UI_FOUND";
        public string scope = "FINAL_GAME_VIEW_FRAME";
        public string pixelAnalysis = "NOT_PERFORMED";
        public int screenSpaceOverlayCanvasCount;
        public int screenSpaceCameraCanvasCount;
        public int worldSpaceCanvasCount;
        public int unclassifiedCanvasCount;
        public int includedRuntimePanelCount;
        public int unclassifiedRuntimePanelCount;
        public string note = string.Empty;
    }

    /// <summary>表示异步采集当前状态；只有截图及报告均写入后才提供 screenshot 并标记 PASS。</summary>
    [Serializable]
    public sealed class GameViewCaptureResult
    {
        public string schemaVersion = "1.0";
        public string status = "BLOCKED";
        public string errorCode = string.Empty;
        public string message = string.Empty;
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string requestedOutputPath = string.Empty;
        public string generatedAtUtc = string.Empty;
        public string captureScope;
        public GameViewScreenshot screenshot;
        public GameViewUiCoverage uiCoverage;
    }

    /// <summary>
    /// 以帧末协程启动 Game View 采集，并通过重复命令调用查询异步完成状态。
    /// </summary>
    [InitializeOnLoad]
    public static class GameViewCaptureService
    {
        private const string EvidenceRoot = "Artifacts/Visual/";
        private const double CaptureTimeoutSeconds = 20d;
        private static readonly StringComparer PathComparer = Application.platform == RuntimePlatform.WindowsEditor
            ? StringComparer.OrdinalIgnoreCase
            : StringComparer.Ordinal;
        private static readonly Dictionary<string, CaptureState> Requests = new Dictionary<string, CaptureState>(PathComparer);

        /// <summary>在程序集加载时注册非阻塞状态监控与退出清理回调。</summary>
        static GameViewCaptureService()
        {
            List<GameViewCapturePersistedState> persistedStates = GameViewCaptureSessionStore.Restore();
            for (int index = 0; index < persistedStates.Count; index++)
            {
                GameViewCapturePersistedState persisted = persistedStates[index];
                Requests[persisted.absoluteOutputPath] = new CaptureState
                {
                    request = persisted.request,
                    absoluteOutputPath = persisted.absoluteOutputPath,
                    reportPath = persisted.reportPath,
                    completedAt = persisted.completedAt,
                    result = persisted.result
                };
            }

            EditorApplication.update += UpdateRequests;
            EditorApplication.playModeStateChanged += OnPlayModeStateChanged;
            EditorApplication.quitting += OnEditorQuitting;
            AssemblyReloadEvents.beforeAssemblyReload += OnBeforeAssemblyReload;
        }

        /// <summary>登记一次新采集，或按同一输出路径和身份返回 PENDING/最终状态。</summary>
        /// <param name="request">绑定任务、候选、场景和项目内 PNG 路径的请求。</param>
        /// <returns>首次成功登记为 PENDING；只有 PNG 与 JSON 报告均落盘后才为 PASS。</returns>
        public static GameViewCaptureResult CaptureOrPoll(GameViewCaptureRequest request)
        {
            GameViewCaptureResult invalid = ValidateRequest(request);
            if (invalid != null)
            {
                return invalid;
            }

            string outputPath = Normalize(request.outputPath);
            string absoluteOutputPath;
            try
            {
                absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(outputPath);
            }
            catch (Exception)
            {
                return CreateResult("FAIL", "INVALID_OUTPUT_PATH", "输出路径不符合项目相对路径约束。", request);
            }

            if (Requests.TryGetValue(absoluteOutputPath, out CaptureState existingState))
            {
                if (!MatchesIdentity(existingState.request, request))
                {
                    return CreateResult("FAIL", "OUTPUT_IDENTITY_CONFLICT", "输出路径已绑定其他采集请求。", request);
                }

                // 终态在保留窗口内也是可查询结果，特别是 BLOCKED 取消原因不能触发同 Job 重启。
                if (existingState.result.status == "PASS")
                {
                    return VerifyCachedPassEvidence(existingState, request);
                }

                return CopyResult(existingState.result);
            }

            GameViewCaptureResult prior = GameViewCaptureArtifacts.ReadExistingResult(request, absoluteOutputPath);
            if (prior != null)
            {
                return prior;
            }

            EditorStabilityResult stability = EditorStabilityGuard.Check(true);
            if (!stability.IsStable)
            {
                return CreateResult(
                    "BLOCKED",
                    stability.ErrorCode.ToUpperInvariant().Replace('.', '_').Replace('-', '_'),
                    stability.Message,
                    request);
            }

            if (Application.isBatchMode)
            {
                return CreateResult("BLOCKED", "BATCHMODE_UNSUPPORTED", "Batch Mode 没有可用的实际 Game View 帧。", request);
            }

            if (!EditorApplication.isPlaying || EditorApplication.isPlayingOrWillChangePlaymode != EditorApplication.isPlaying)
            {
                return CreateResult("BLOCKED", "EDITOR_NOT_IN_STABLE_PLAYMODE", "采集只允许在已稳定进入的 Editor Play Mode 中执行。", request);
            }

            if (!HasOpenGameView())
            {
                return CreateResult("BLOCKED", "GAME_VIEW_UNAVAILABLE", "当前 Editor 没有已打开且尺寸有效的 Game View。", request);
            }

            Scene activeScene = SceneManager.GetActiveScene();
            if (!activeScene.IsValid() || !activeScene.isLoaded ||
                !string.Equals(activeScene.path, Normalize(request.scenePath), StringComparison.Ordinal))
            {
                return CreateResult("BLOCKED", "ACTIVE_SCENE_MISMATCH", "当前活动场景与请求场景不一致。", request);
            }

            string reportPath = outputPath + ".json";
            string absoluteReportPath;
            try
            {
                absoluteReportPath = WorkflowPaths.ResolveProjectRelative(reportPath);
            }
            catch (Exception)
            {
                return CreateResult("FAIL", "INVALID_REPORT_PATH", "采集报告路径不符合项目相对路径约束。", request);
            }

            if (File.Exists(absoluteOutputPath) || File.Exists(absoluteReportPath))
            {
                return CreateResult("FAIL", "OUTPUT_ALREADY_EXISTS", "截图或采集报告已存在，请使用新的版本化文件名。", request);
            }

            var state = new CaptureState
            {
                request = CopyRequest(request),
                absoluteOutputPath = absoluteOutputPath,
                reportPath = reportPath,
                startedAt = EditorApplication.timeSinceStartup,
                result = CreateResult("PENDING", string.Empty, "采集请求已登记，等待实际 Game View 帧完成渲染。", request)
            };

            Requests.Add(absoluteOutputPath, state);
            try
            {
                // 帧末采集和状态回调由 Editor service 注入，运行时 Runner 不持有 Editor API。
                state.runner = GameViewCaptureRunner.Create(state.requestId, CompleteCapture, RunnerDestroyed);
            }
            catch (Exception)
            {
                Requests.Remove(absoluteOutputPath);
                return CreateResult("FAIL", "CAPTURE_REQUEST_FAILED", "无法创建临时帧末采集器。", request);
            }

            return CopyResult(state.result);
        }

        /// <summary>回读缓存 PASS 对应的 PNG 和报告，避免缺失或损坏的证据继续通过。</summary>
        /// <param name="state">内存或域重载恢复的终态缓存。</param>
        /// <param name="request">本次回查请求。</param>
        /// <returns>真实文件仍有效时的 PASS，否则持久化并返回 FAIL。</returns>
        private static GameViewCaptureResult VerifyCachedPassEvidence(CaptureState state, GameViewCaptureRequest request)
        {
            GameViewCaptureResult verified = GameViewCaptureArtifacts.ReadExistingResult(request, state.absoluteOutputPath);
            if (verified == null)
            {
                verified = CreateResult(
                    "FAIL",
                    "CAPTURE_EVIDENCE_MISSING",
                    "缓存 PASS 对应的 PNG 和采集报告均已缺失，不能继续复用通过结论。",
                    request);
            }

            // 文件损坏也转为保留的 FAIL 终态，后续轮询不会回退为 PENDING。
            state.result = verified;
            state.completedAt = EditorApplication.timeSinceStartup;
            GameViewCaptureSessionStore.Save(
                state.request.outputPath,
                state.absoluteOutputPath,
                state.reportPath,
                state.request,
                verified,
                state.completedAt);
            return CopyResult(verified);
        }

        /// <summary>在 WaitForEndOfFrame 后采集真实 Game View 纹理并原子提交图像和报告。</summary>
        /// <param name="requestId">启动协程时绑定的唯一临时请求 ID。</param>
        /// <param name="runner">完成后需清理的临时隐藏协程对象。</param>
        public static void CompleteCapture(string requestId, GameViewCaptureRunner runner)
        {
            CaptureState state = FindByRequestId(requestId);
            if (state == null || state.result.status != "PENDING")
            {
                // 退出 Play Mode、超时或 Runner 销毁可能已终结 Job；迟到的帧回调不能复活取消状态。
                DestroyRunner(runner);
                return;
            }

            try
            {
                EditorStabilityResult stability = EditorStabilityGuard.Check(true);
                Scene activeScene = SceneManager.GetActiveScene();
                if (!stability.IsStable || !EditorApplication.isPlaying ||
                    !string.Equals(activeScene.path, state.request.scenePath, StringComparison.Ordinal))
                {
                    FinishFailure(state, "BLOCKED", "EDITOR_STATE_CHANGED", "采集期间 Editor 或活动场景发生变化，已取消且未写入证据。", runner);
                    return;
                }

                Texture2D texture = ScreenCapture.CaptureScreenshotAsTexture();
                if (texture == null || texture.width <= 0 || texture.height <= 0)
                {
                    if (texture != null)
                    {
                        UnityEngine.Object.Destroy(texture);
                    }

                    FinishFailure(state, "FAIL", "CAPTURE_FAILED", "Unity 未返回有效的 Game View 帧纹理。", runner);
                    return;
                }

                try
                {
                    byte[] pngBytes = texture.EncodeToPNG();
                    if (pngBytes == null || pngBytes.Length == 0)
                    {
                        FinishFailure(state, "FAIL", "PNG_ENCODING_FAILED", "Game View 帧无法编码为 PNG。", runner);
                        return;
                    }

                    DateTime capturedAt = DateTime.UtcNow;
                    var result = CreateResult("PASS", string.Empty, "Game View 实际帧与采集报告已写入。", state.request);
                    result.captureScope = "EDITOR_GAME_VIEW_END_OF_FRAME";
                    result.screenshot = new GameViewScreenshot
                    {
                        path = Normalize(state.request.outputPath),
                        width = texture.width,
                        height = texture.height,
                        sizeBytes = pngBytes.LongLength,
                        capturedAtUtc = FormatUtc(capturedAt),
                        frameCount = Time.frameCount
                    };
                    result.uiCoverage = InspectUiCoverage();
                    result.generatedAtUtc = FormatUtc(DateTime.UtcNow);
                    GameViewCaptureArtifacts.WriteEvidencePair(state.request, state.reportPath, result, pngBytes);
                    FinishState(state, result, runner);
                }
                finally
                {
                    UnityEngine.Object.Destroy(texture);
                }
            }
            catch (Exception)
            {
                FinishFailure(state, "FAIL", "CAPTURE_OR_WRITE_FAILED", "Game View 帧采集或原子写入失败，未保留半成品证据。", runner);
            }
        }

        /// <summary>临时 Runner 意外销毁时将仍未完成的请求标记为取消。</summary>
        /// <param name="requestId">Runner 持有的请求 ID。</param>
        public static void RunnerDestroyed(string requestId)
        {
            CaptureState state = FindByRequestId(requestId);
            if (state != null && state.result.status == "PENDING")
            {
                FinishFailure(state, "BLOCKED", "CAPTURE_RUNNER_DESTROYED", "帧末采集器提前销毁，采集已取消且未写入证据。", null);
            }
        }

        /// <summary>监控超时、Editor 状态变化和完成状态保留期，不阻塞 Editor 主线程。</summary>
        private static void UpdateRequests()
        {
            if (Requests.Count == 0)
            {
                return;
            }

            double now = EditorApplication.timeSinceStartup;
            var expired = new List<string>();
            foreach (KeyValuePair<string, CaptureState> entry in Requests)
            {
                CaptureState state = entry.Value;
                if (state.result.status == "PENDING")
                {
                    EditorStabilityResult stability = EditorStabilityGuard.Check(true);
                    if (!stability.IsStable || !EditorApplication.isPlaying || !HasOpenGameView())
                    {
                        FinishFailure(state, "BLOCKED", "EDITOR_STATE_CHANGED", "采集等待期间 Editor 状态改变，采集已取消。", state.runner);
                    }
                    else if (now - state.startedAt > CaptureTimeoutSeconds)
                    {
                        FinishFailure(state, "BLOCKED", "CAPTURE_TIMEOUT", "等待 Game View 帧超过时限，采集已取消。", state.runner);
                    }
                }
                else if (now - state.completedAt > GameViewCaptureSessionStore.RetentionSeconds)
                {
                    expired.Add(entry.Key);
                    GameViewCaptureSessionStore.Remove(state.request.outputPath);
                }
            }

            for (int index = 0; index < expired.Count; index++)
            {
                Requests.Remove(expired[index]);
            }
        }

        /// <summary>退出 Play Mode 时取消所有在途请求并清理隐藏 Runner。</summary>
        private static void OnPlayModeStateChanged(PlayModeStateChange change)
        {
            if (change == PlayModeStateChange.ExitingPlayMode || change == PlayModeStateChange.EnteredEditMode)
            {
                CancelPending("PLAYMODE_EXITED", "Play Mode 已退出，采集请求已取消。");
            }
        }

        /// <summary>Editor 退出时释放所有仍在等待的临时 Runner。</summary>
        private static void OnEditorQuitting()
        {
            CancelPending("EDITOR_QUITTING", "Editor 正在退出，采集请求已取消。");
        }

        /// <summary>域重载前取消请求，避免临时对象或未完成状态跨程序集生命周期残留。</summary>
        private static void OnBeforeAssemblyReload()
        {
            CancelPending("DOMAIN_RELOAD", "程序集正在重载，采集请求已取消。");
        }

        /// <summary>校验请求身份、活动帧采集环境和新证据目标路径。</summary>
        private static GameViewCaptureResult ValidateRequest(GameViewCaptureRequest request)
        {
            if (request == null)
            {
                return CreateResult("FAIL", "REQUEST_REQUIRED", "Game View 采集请求不能为空。", null);
            }

            if (!IsValidId(request.taskId) || !IsValidId(request.candidateId))
            {
                return CreateResult("FAIL", "INVALID_ID", "任务 ID 和候选 ID 必须是有效的非空标识。", request);
            }

            string outputPath = Normalize(request.outputPath);
            if (!outputPath.StartsWith(EvidenceRoot, StringComparison.OrdinalIgnoreCase) ||
                !outputPath.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            {
                return CreateResult("FAIL", "INVALID_EVIDENCE_PATH", $"截图必须写入 {EvidenceRoot} 下的 PNG 文件。", request);
            }

            if (string.IsNullOrWhiteSpace(request.scenePath) ||
                !Normalize(request.scenePath).EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
            {
                return CreateResult("FAIL", "INVALID_SCENE_PATH", "必须指定项目内的 .unity 场景路径。", request);
            }

            return null;
        }

        /// <summary>确认请求的 Game View 窗口已经打开且具有有效客户区尺寸，不主动创建或聚焦窗口。</summary>
        private static bool HasOpenGameView()
        {
            EditorWindow[] windows = Resources.FindObjectsOfTypeAll<EditorWindow>();
            for (int index = 0; index < windows.Length; index++)
            {
                EditorWindow window = windows[index];
                if (window != null && window.GetType().Name == "GameView" &&
                    window.position.width > 0f && window.position.height > 0f)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>记录当前加载场景中可分类的活动 uGUI 与 UI Toolkit 渲染入口。</summary>
        private static GameViewUiCoverage InspectUiCoverage()
        {
            var coverage = new GameViewUiCoverage();
            Canvas[] canvases = Resources.FindObjectsOfTypeAll<Canvas>();
            for (int index = 0; index < canvases.Length; index++)
            {
                Canvas canvas = canvases[index];
                if (!IsLiveSceneObject(canvas == null ? null : canvas.gameObject) || !canvas.isActiveAndEnabled)
                {
                    continue;
                }

                Canvas root = canvas.rootCanvas;
                if (root == null || root.targetDisplay != 0)
                {
                    coverage.unclassifiedCanvasCount++;
                    continue;
                }

                switch (root.renderMode)
                {
                    case RenderMode.ScreenSpaceOverlay:
                        coverage.screenSpaceOverlayCanvasCount++;
                        break;
                    case RenderMode.ScreenSpaceCamera:
                        if (root.worldCamera != null && root.worldCamera.isActiveAndEnabled && root.worldCamera.targetTexture == null)
                        {
                            coverage.screenSpaceCameraCanvasCount++;
                        }
                        else
                        {
                            coverage.unclassifiedCanvasCount++;
                        }
                        break;
                    case RenderMode.WorldSpace:
                        coverage.worldSpaceCanvasCount++;
                        coverage.unclassifiedCanvasCount++;
                        break;
                    default:
                        coverage.unclassifiedCanvasCount++;
                        break;
                }
            }

            UIDocument[] documents = Resources.FindObjectsOfTypeAll<UIDocument>();
            for (int index = 0; index < documents.Length; index++)
            {
                UIDocument document = documents[index];
                if (!IsLiveSceneObject(document == null ? null : document.gameObject) || !document.isActiveAndEnabled)
                {
                    continue;
                }

                VisualElement root = document.rootVisualElement;
                PanelSettings settings = document.panelSettings;
                if (root == null || root.panel == null || settings == null || settings.targetDisplay != 0 || settings.targetTexture != null)
                {
                    coverage.unclassifiedRuntimePanelCount++;
                    continue;
                }

                coverage.includedRuntimePanelCount++;
            }

            int classified = coverage.screenSpaceOverlayCanvasCount + coverage.screenSpaceCameraCanvasCount +
                             coverage.worldSpaceCanvasCount + coverage.includedRuntimePanelCount;
            if (coverage.unclassifiedCanvasCount > 0 || coverage.unclassifiedRuntimePanelCount > 0)
            {
                coverage.status = "PARTIAL_UNCLASSIFIED";
                coverage.note = "Game View 最终帧已采集；部分活动 UI 使用非默认显示器、目标纹理或 World Space 路径，未单独确认其呈现位置。未执行像素分析。";
            }
            else if (classified == 0)
            {
                coverage.status = "NO_RUNTIME_UI_FOUND";
                coverage.note = "Game View 最终帧已采集；当前未发现活动运行时 UI。未执行像素分析。";
            }
            else
            {
                coverage.status = "CAPTURED_UNANALYZED";
                coverage.note = "Game View 最终帧已采集并记录活动 UI 渲染入口；未分析截图像素，不能据此判定元素可见或视觉验收通过。";
            }

            return coverage;
        }

        /// <summary>排除 Prefab 资源和预览场景，只统计真正加载场景中的运行对象。</summary>
        private static bool IsLiveSceneObject(GameObject gameObject)
        {
            return gameObject != null && gameObject.scene.IsValid() && gameObject.scene.isLoaded &&
                   !EditorSceneManager.IsPreviewScene(gameObject.scene);
        }

        /// <summary>按唯一临时 ID 查找在途状态。</summary>
        private static CaptureState FindByRequestId(string requestId)
        {
            foreach (CaptureState state in Requests.Values)
            {
                if (string.Equals(state.requestId, requestId, StringComparison.Ordinal))
                {
                    return state;
                }
            }

            return null;
        }

        /// <summary>以明确的身份字段比对两个请求，防止跨任务读写同一输出。</summary>
        private static bool MatchesIdentity(GameViewCaptureRequest left, GameViewCaptureRequest right)
        {
            return string.Equals(left.taskId, right.taskId, StringComparison.Ordinal) &&
                   string.Equals(left.candidateId, right.candidateId, StringComparison.Ordinal) &&
                   string.Equals(Normalize(left.scenePath), Normalize(right.scenePath), StringComparison.Ordinal) &&
                   string.Equals(Normalize(left.outputPath), Normalize(right.outputPath), StringComparison.Ordinal);
        }

        /// <summary>复制 Pipeline Job 请求，避免调用方改写在途身份。</summary>
        private static GameViewCaptureRequest CopyRequest(GameViewCaptureRequest request)
        {
            return new GameViewCaptureRequest
            {
                taskId = request.taskId,
                candidateId = request.candidateId,
                scenePath = Normalize(request.scenePath),
                outputPath = Normalize(request.outputPath)
            };
        }

        /// <summary>复制可变状态结果，避免调用方影响内部轮询状态。</summary>
        private static GameViewCaptureResult CopyResult(GameViewCaptureResult result)
        {
            return JsonUtility.FromJson<GameViewCaptureResult>(JsonUtility.ToJson(result));
        }

        /// <summary>构造含任务身份和 UTC 查询时间的结果，未完成时不包含截图证据字段。</summary>
        private static GameViewCaptureResult CreateResult(
            string status,
            string errorCode,
            string message,
            GameViewCaptureRequest request)
        {
            return new GameViewCaptureResult
            {
                status = status,
                errorCode = errorCode ?? string.Empty,
                message = message ?? string.Empty,
                taskId = request == null ? string.Empty : request.taskId ?? string.Empty,
                candidateId = request == null ? string.Empty : request.candidateId ?? string.Empty,
                scenePath = request == null ? string.Empty : Normalize(request.scenePath),
                requestedOutputPath = request == null ? string.Empty : Normalize(request.outputPath),
                generatedAtUtc = FormatUtc(DateTime.UtcNow)
            };
        }

        /// <summary>结束采集并保留终态供同一 Job 查询；截图或报告失败时不留下半成品。</summary>
        private static void FinishFailure(
            CaptureState state,
            string status,
            string errorCode,
            string message,
            GameViewCaptureRunner runner)
        {
            FinishState(state, CreateResult(status, errorCode, message, state.request), runner);
        }

        /// <summary>设置终态、记录保留时刻并销毁临时协程对象。</summary>
        private static void FinishState(CaptureState state, GameViewCaptureResult result, GameViewCaptureRunner runner)
        {
            state.result = result;
            state.completedAt = EditorApplication.timeSinceStartup;
            state.runner = null;
            GameViewCaptureSessionStore.Save(
                state.request.outputPath,
                state.absoluteOutputPath,
                state.reportPath,
                state.request,
                result,
                state.completedAt);
            if (runner != null)
            {
                runner.MarkComplete();
                DestroyRunner(runner);
            }
        }

        /// <summary>取消全部在途请求但保留可查询 BLOCKED 终态。</summary>
        private static void CancelPending(string errorCode, string message)
        {
            var pending = new List<CaptureState>();
            foreach (CaptureState state in Requests.Values)
            {
                if (state.result.status == "PENDING")
                {
                    pending.Add(state);
                }
            }

            for (int index = 0; index < pending.Count; index++)
            {
                FinishFailure(pending[index], "BLOCKED", errorCode, message, pending[index].runner);
            }
        }

        /// <summary>清理临时 GameObject；不保存、不修改任何用户场景对象。</summary>
        private static void DestroyRunner(GameViewCaptureRunner runner)
        {
            if (runner == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                UnityEngine.Object.Destroy(runner.gameObject);
            }
            else
            {
                UnityEngine.Object.DestroyImmediate(runner.gameObject);
            }
        }

        /// <summary>使用固定 UTC ISO 8601 格式生成可交换时间值。</summary>
        private static string FormatUtc(DateTime value)
        {
            return value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }

        /// <summary>校验任务与候选 ID 只能包含路径安全字符。</summary>
        private static bool IsValidId(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 96 ||
                !(IsLowerAsciiLetter(value[0]) || value[0] >= '0' && value[0] <= '9'))
            {
                return false;
            }

            for (int index = 0; index < value.Length; index++)
            {
                char character = value[index];
                if (!IsLowerAsciiLetter(character) && !(character >= '0' && character <= '9') && character != '-' && character != '.')
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>判断字符是否为公共 ID 契约允许的小写 ASCII 字母。</summary>
        private static bool IsLowerAsciiLetter(char value)
        {
            return value >= 'a' && value <= 'z';
        }

        /// <summary>规范化项目内路径分隔符。</summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }

        /// <summary>销毁或超时后的状态实体，只保留当前 Job 必需的身份和文件位置。</summary>
        private sealed class CaptureState
        {
            /// <summary>生成唯一协程请求标识。</summary>
            public string requestId = Guid.NewGuid().ToString("N");

            /// <summary>固定的任务身份快照。</summary>
            public GameViewCaptureRequest request;

            /// <summary>规范化后的绝对 PNG 目标路径，仅在当前域内使用。</summary>
            public string absoluteOutputPath;

            /// <summary>项目相对 JSON 报告路径。</summary>
            public string reportPath;

            /// <summary>登记时的 Editor 单调时间。</summary>
            public double startedAt;

            /// <summary>完成或取消时的 Editor 单调时间。</summary>
            public double completedAt;

            /// <summary>当前异步状态或最终结果。</summary>
            public GameViewCaptureResult result;

            /// <summary>等待帧末的隐藏 Runner。</summary>
            public GameViewCaptureRunner runner;
        }
    }
}
