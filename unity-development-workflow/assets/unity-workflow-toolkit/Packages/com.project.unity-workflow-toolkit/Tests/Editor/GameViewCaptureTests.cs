using System;
using System.Collections;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.VisualQA;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>验证 Game View 采集的阻断、轮询、帧末完成和取消行为。</summary>
    public sealed class GameViewCaptureTests
    {
        private string taskId;
        private string scenePath;
        private string outputPath;
        private string absoluteOutputPath;
        private string absoluteReportPath;
        private SceneSetup[] originalSceneSetup = Array.Empty<SceneSetup>();

        /// <summary>准备已保存的空场景与独占证据路径，满足 Editor 稳定性检查。</summary>
        [SetUp]
        public void SetUp()
        {
            originalSceneSetup = EditorSceneManager.GetSceneManagerSetup();
            taskId = "game-view-test-" + Guid.NewGuid().ToString("N");
            scenePath = "Assets/__UWTGameViewTests-" + Guid.NewGuid().ToString("N") + ".unity";
            outputPath = "Artifacts/Visual/" + taskId + "/frame.png";
            absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(outputPath);
            absoluteReportPath = WorkflowPaths.ResolveProjectRelative(outputPath + ".json");

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Assert.That(EditorSceneManager.SaveScene(scene, scenePath), Is.True);
        }

        /// <summary>恢复原场景并删除本测试生成的唯一场景和证据文件。</summary>
        [TearDown]
        public void TearDown()
        {
            if (originalSceneSetup.Length > 0)
            {
                EditorSceneManager.RestoreSceneManagerSetup(originalSceneSetup);
            }
            else if (!EditorApplication.isPlaying)
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }

            AssetDatabase.DeleteAsset(scenePath);
            ClearCachedRequest();
            DeleteFile(absoluteOutputPath);
            DeleteFile(absoluteReportPath);
            string directory = Path.GetDirectoryName(absoluteOutputPath);
            if (!string.IsNullOrEmpty(directory) && Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0)
            {
                Directory.Delete(directory);
            }
        }

        /// <summary>验证不在 Play Mode 时清晰阻断，并且不留下空 PNG 或报告。</summary>
        [Test]
        public void CaptureOutsidePlayMode_ReturnsBlockedWithoutArtifacts()
        {
            GameViewCaptureResult result = GameViewCaptureService.CaptureOrPoll(CreateRequest());

            Assert.That(result.status, Is.EqualTo("BLOCKED"));
            Assert.That(result.screenshot, Is.Null);
            Assert.That(result.captureScope, Is.Null);
            Assert.That(File.Exists(absoluteOutputPath), Is.False);
            Assert.That(File.Exists(absoluteReportPath), Is.False);
        }

        /// <summary>验证帧末组件来自 Runtime 程序集，Editor 可程序化挂载为临时对象。</summary>
        [Test]
        public void RuntimeRunner_CanBeAddedProgrammatically()
        {
            var runnerObject = new GameObject("UWT Runner Assembly Test");
            try
            {
                GameViewCaptureRunner runner = runnerObject.AddComponent<GameViewCaptureRunner>();

                Assert.That(runner, Is.Not.Null);
                Assert.That(runner.GetType().Assembly.GetName().Name, Is.EqualTo("Project.UnityWorkflow.Runtime"));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(runnerObject);
            }
        }

        /// <summary>验证 SessionState 恢复的 PASS 在 PNG 缺失或截断后会降级为 FAIL。</summary>
        [TestCase(false)]
        [TestCase(true)]
        public void CachedPass_RevalidatesArtifactsAfterRestore(bool truncatePng)
        {
            GameViewCaptureRequest request = CreateRequest();
            byte[] pngBytes = CreatePngFixture();
            string timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
            var result = new GameViewCaptureResult
            {
                status = "PASS",
                message = "测试夹具：PNG 和报告结构完整。",
                taskId = taskId,
                candidateId = request.candidateId,
                scenePath = scenePath,
                requestedOutputPath = outputPath,
                generatedAtUtc = timestamp,
                captureScope = "EDITOR_GAME_VIEW_END_OF_FRAME",
                screenshot = new GameViewScreenshot
                {
                    path = outputPath,
                    width = 2,
                    height = 2,
                    sizeBytes = pngBytes.LongLength,
                    capturedAtUtc = timestamp,
                    frameCount = 1
                },
                uiCoverage = new GameViewUiCoverage
                {
                    status = "NO_RUNTIME_UI_FOUND",
                    scope = "FINAL_GAME_VIEW_FRAME",
                    pixelAnalysis = "NOT_PERFORMED",
                    note = "测试夹具只验证 PNG 格式和报告元数据，不分析图像内容。"
                }
            };

            Directory.CreateDirectory(Path.GetDirectoryName(absoluteOutputPath));
            File.WriteAllBytes(absoluteOutputPath, pngBytes);
            File.WriteAllText(absoluteReportPath, JsonUtility.ToJson(result, true));
            GameViewCaptureResult existing = GameViewCaptureService.CaptureOrPoll(request);
            Assert.That(existing.status, Is.EqualTo("PASS"), existing.errorCode + " " + existing.message);

            SeedRestoredPassCache(request, result);
            if (truncatePng)
            {
                File.WriteAllBytes(absoluteOutputPath, new byte[] { 137, 80, 78, 71 });
            }
            else
            {
                File.Delete(absoluteOutputPath);
            }

            GameViewCaptureResult failed = GameViewCaptureService.CaptureOrPoll(request);
            GameViewCaptureResult repeated = GameViewCaptureService.CaptureOrPoll(request);

            Assert.That(failed.status, Is.EqualTo("FAIL"), failed.errorCode + " " + failed.message);
            Assert.That(failed.status, Is.Not.EqualTo("PENDING"));
            Assert.That(repeated.status, Is.EqualTo("FAIL"), repeated.errorCode + " " + repeated.message);
            Assert.That(repeated.errorCode, Is.EqualTo(failed.errorCode));
        }

        /// <summary>在已存在的可用 Game View 中验证同一 Job 的 PENDING 轮询与真实帧末 PASS。</summary>
        [UnityTest]
        public IEnumerator CaptureFromExistingGameView_PollsUntilPngAndReportAreWritten()
        {
            RequireInteractiveGameView();
            yield return new EnterPlayMode();

            GameViewCaptureRequest request = CreateRequest();
            GameViewCaptureResult first = GameViewCaptureService.CaptureOrPoll(request);
            GameViewCaptureResult repeated = GameViewCaptureService.CaptureOrPoll(request);
            bool pendingIsStable = first.status == "PENDING" && repeated.status == "PENDING" &&
                                   repeated.screenshot == null && repeated.captureScope == null;
            GameViewCaptureResult final = repeated;
            for (int frame = 0; pendingIsStable && frame < 120 && final.status == "PENDING"; frame++)
            {
                yield return null;
                final = GameViewCaptureService.CaptureOrPoll(request);
            }

            bool artifactsWritten = final.status == "PASS" &&
                                    File.Exists(absoluteOutputPath) && File.Exists(absoluteReportPath) &&
                                    final.screenshot != null && final.screenshot.width > 0 && final.screenshot.height > 0;
            bool reportMatches = false;
            if (artifactsWritten)
            {
                GameViewCaptureResult saved = JsonUtility.FromJson<GameViewCaptureResult>(File.ReadAllText(absoluteReportPath));
                reportMatches = saved != null && saved.status == "PASS" && saved.screenshot != null &&
                                saved.screenshot.path == outputPath && saved.uiCoverage != null &&
                                saved.uiCoverage.pixelAnalysis == "NOT_PERFORMED";
            }

            yield return new ExitPlayMode();
            Assert.That(pendingIsStable, Is.True, first.message + " / " + repeated.message);
            Assert.That(artifactsWritten, Is.True, final.errorCode + " " + final.message);
            Assert.That(reportMatches, Is.True, "PASS 必须对应真实 PNG 与同身份 JSON 报告；本测试不分析截图像素。");
        }

        /// <summary>验证取消隐藏帧末 Runner 后同一请求保持可查询 BLOCKED，且没有半成品文件。</summary>
        [UnityTest]
        public IEnumerator DestroyedRunner_RemainsBlockedWithoutPartialArtifacts()
        {
            RequireInteractiveGameView();
            yield return new EnterPlayMode();

            GameViewCaptureRequest request = CreateRequest();
            GameViewCaptureResult pending = GameViewCaptureService.CaptureOrPoll(request);
            GameViewCaptureRunner runner = Resources.FindObjectsOfTypeAll<GameViewCaptureRunner>().Length == 0
                ? null
                : Resources.FindObjectsOfTypeAll<GameViewCaptureRunner>()[0];
            if (runner != null)
            {
                runner.StopAllCoroutines();
                UnityEngine.Object.Destroy(runner.gameObject);
            }

            yield return null;
            GameViewCaptureResult canceled = GameViewCaptureService.CaptureOrPoll(request);
            GameViewCaptureResult repeated = GameViewCaptureService.CaptureOrPoll(request);
            bool noArtifacts = !File.Exists(absoluteOutputPath) && !File.Exists(absoluteReportPath);

            yield return new ExitPlayMode();
            Assert.That(pending.status, Is.EqualTo("PENDING"), pending.message);
            Assert.That(runner, Is.Null);
            Assert.That(canceled.status, Is.EqualTo("BLOCKED"), canceled.message);
            Assert.That(canceled.errorCode, Is.EqualTo("CAPTURE_RUNNER_DESTROYED"));
            Assert.That(repeated.errorCode, Is.EqualTo(canceled.errorCode), "终态查询应保留取消原因，不应重新登记采集。");
            Assert.That(repeated.status, Is.EqualTo("BLOCKED"));
            Assert.That(noArtifacts, Is.True);
        }

        /// <summary>只在当前可交互 Editor 已打开 Game View 时运行真实帧末测试，不启动或聚焦窗口。</summary>
        private static void RequireInteractiveGameView()
        {
            if (Application.isBatchMode || !HasOpenGameView())
            {
                Assert.Ignore("实际帧末采集测试需要已有非 Batch Editor 和已打开的 Game View；测试不会自行启动或聚焦窗口。");
            }
        }

        /// <summary>只检查 Game View 是否已存在，不改变窗口布局或分辨率。</summary>
        private static bool HasOpenGameView()
        {
            EditorWindow[] windows = Resources.FindObjectsOfTypeAll<EditorWindow>();
            for (int index = 0; index < windows.Length; index++)
            {
                if (windows[index] != null && windows[index].GetType().Name == "GameView" &&
                    windows[index].position.width > 0f && windows[index].position.height > 0f)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>构建当前测试身份和项目内唯一 PNG 目标。</summary>
        private GameViewCaptureRequest CreateRequest()
        {
            return new GameViewCaptureRequest
            {
                taskId = taskId,
                candidateId = "candidate-a",
                scenePath = scenePath,
                outputPath = outputPath
            };
        }

        /// <summary>生成仅供机器解码验证的 2x2 PNG 测试夹具，不用于视觉判定。</summary>
        private static byte[] CreatePngFixture()
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            try
            {
                texture.SetPixels32(new[]
                {
                    new Color32(255, 0, 0, 255),
                    new Color32(0, 255, 0, 255),
                    new Color32(0, 0, 255, 255),
                    new Color32(255, 255, 255, 255)
                });
                texture.Apply(false, false);
                return texture.EncodeToPNG();
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        /// <summary>通过反射模拟域重载后从 SessionState 恢复的 PASS 缓存。</summary>
        private void SeedRestoredPassCache(GameViewCaptureRequest request, GameViewCaptureResult result)
        {
            Type storeType = typeof(GameViewCaptureService).Assembly.GetType("Project.UnityWorkflow.VisualQA.GameViewCaptureSessionStore");
            MethodInfo save = storeType.GetMethod("Save", BindingFlags.Public | BindingFlags.Static);
            MethodInfo restore = storeType.GetMethod("Restore", BindingFlags.Public | BindingFlags.Static);
            save.Invoke(null, new object[] { outputPath, absoluteOutputPath, outputPath + ".json", request, result, EditorApplication.timeSinceStartup });
            // 模拟新的 AppDomain：静态去重集合会重置，但 SessionState 索引仍保留。
            FieldInfo knownKeysField = storeType.GetField("KnownKeys", BindingFlags.NonPublic | BindingFlags.Static);
            knownKeysField.GetValue(null).GetType().GetMethod("Clear").Invoke(knownKeysField.GetValue(null), null);
            var restoredStates = restore.Invoke(null, null) as IList;
            Assert.That(restoredStates, Is.Not.Null);
            Assert.That(restoredStates.Count, Is.GreaterThan(0));

            object restored = null;
            for (int index = 0; index < restoredStates.Count; index++)
            {
                object candidate = restoredStates[index];
                string candidatePath = candidate.GetType().GetField("outputPath").GetValue(candidate) as string;
                if (string.Equals(candidatePath, outputPath, StringComparison.Ordinal))
                {
                    restored = candidate;
                    break;
                }
            }

            Assert.That(restored, Is.Not.Null, "SessionState 必须恢复当前测试的 PASS 记录。");
            Type cacheStateType = typeof(GameViewCaptureService).GetNestedType("CaptureState", BindingFlags.NonPublic);
            object cacheState = Activator.CreateInstance(cacheStateType, true);
            CopyPersistedField(restored, cacheState, "request");
            CopyPersistedField(restored, cacheState, "absoluteOutputPath");
            CopyPersistedField(restored, cacheState, "reportPath");
            CopyPersistedField(restored, cacheState, "completedAt");
            CopyPersistedField(restored, cacheState, "result");

            FieldInfo requestsField = typeof(GameViewCaptureService).GetField("Requests", BindingFlags.NonPublic | BindingFlags.Static);
            var requests = requestsField.GetValue(null) as IDictionary;
            requests.Add(absoluteOutputPath, cacheState);
        }

        /// <summary>按字段名复制恢复记录到服务的私有缓存状态。</summary>
        private static void CopyPersistedField(object source, object destination, string fieldName)
        {
            Type sourceType = source.GetType();
            Type destinationType = destination.GetType();
            object value = sourceType.GetField(fieldName).GetValue(source);
            destinationType.GetField(fieldName).SetValue(destination, value);
        }

        /// <summary>清理反射注入的缓存和会话记录，避免测试状态污染后续用例。</summary>
        private void ClearCachedRequest()
        {
            Type storeType = typeof(GameViewCaptureService).Assembly.GetType("Project.UnityWorkflow.VisualQA.GameViewCaptureSessionStore");
            storeType.GetMethod("Remove", BindingFlags.Public | BindingFlags.Static).Invoke(null, new object[] { outputPath });
            FieldInfo requestsField = typeof(GameViewCaptureService).GetField("Requests", BindingFlags.NonPublic | BindingFlags.Static);
            (requestsField.GetValue(null) as IDictionary)?.Remove(absoluteOutputPath);
        }

        /// <summary>清理文件时容忍测试在异步流程中提前退出。</summary>
        private static void DeleteFile(string path)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
    }
}
