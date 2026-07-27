using System;
using System.IO;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.VisualQA;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>
    /// 验证固定机位截图、证据路径和覆盖保护。
    /// </summary>
    public sealed class VisualCaptureTests
    {
        private const string TestScenePath = "Assets/__UWTVisualCaptureTests.unity";
        private GameObject cameraRoot;
        private string[] createdPaths = Array.Empty<string>();
        private SceneSetup[] originalSceneSetup = Array.Empty<SceneSetup>();

        /// <summary>
        /// 使用已保存的隔离场景，确保截图测试不会被稳定状态守卫当作脏场景阻断。
        /// </summary>
        [SetUp]
        public void SetUp()
        {
            originalSceneSetup = EditorSceneManager.GetSceneManagerSetup();
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Assert.That(EditorSceneManager.SaveScene(scene, TestScenePath), Is.True);
        }

        /// <summary>
        /// 清理测试创建的摄像机和截图，避免污染后续 EditMode 测试。
        /// </summary>
        [TearDown]
        public void TearDown()
        {
            if (cameraRoot != null)
            {
                UnityEngine.Object.DestroyImmediate(cameraRoot);
            }

            Scene activeScene = SceneManager.GetActiveScene();
            if (activeScene.IsValid() && activeScene.isLoaded)
            {
                EditorSceneManager.SaveScene(activeScene, TestScenePath);
            }

            if (originalSceneSetup.Length > 0)
            {
                EditorSceneManager.RestoreSceneManagerSetup(originalSceneSetup);
            }
            else
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }

            AssetDatabase.DeleteAsset(TestScenePath);

            foreach (string path in createdPaths)
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }

                string directory = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(directory) &&
                    Directory.Exists(directory) &&
                    Directory.GetFileSystemEntries(directory).Length == 0)
                {
                    Directory.Delete(directory);
                }
            }
        }

        /// <summary>
        /// 验证服务按明确摄像机路径生成 1920×1080 PNG 证据。
        /// </summary>
        [Test]
        public void Capture_ExplicitCamera_WritesFullHdPng()
        {
            Camera camera = CreateCamera("VisualRig", "CaptureCamera");
            string taskId = CreateUniqueTaskId();
            string relativePath = CreateRelativePath(taskId, "capture.png");
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            createdPaths = new[] { absolutePath };

            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = taskId,
                CameraPath = "VisualRig/CaptureCamera",
                Width = 1920,
                Height = 1080,
                OutputPath = relativePath
            });

            Assert.That(camera, Is.Not.Null);
            Assert.That(result.Status, Is.EqualTo("PASS"), result.Message);
            Assert.That(File.Exists(absolutePath), Is.True);
            Assert.That(result.Width, Is.EqualTo(1920));
            Assert.That(result.Height, Is.EqualTo(1080));
            Assert.That(result.CameraPath, Is.EqualTo("VisualRig/CaptureCamera"));
            Assert.That(result.Sha256, Has.Length.EqualTo(64));
            Assert.That(result.CaptureScope, Is.EqualTo("EDITOR_CAMERA_REFERENCE"));
            Assert.That(result.UiCoverage, Is.EqualTo("CAMERA_AND_CAMERA_SPACE_ONLY"));
            Assert.That(result.ScenePath, Is.Not.Empty);
            Assert.That(result.SceneGuid, Is.Not.Empty);

            Texture2D capturedTexture = new Texture2D(2, 2);
            try
            {
                Assert.That(ImageConversion.LoadImage(capturedTexture, File.ReadAllBytes(absolutePath)), Is.True);
                Assert.That(capturedTexture.width, Is.EqualTo(1920));
                Assert.That(capturedTexture.height, Is.EqualTo(1080));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(capturedTexture);
            }
        }

        /// <summary>
        /// 验证未指定摄像机且未授权 Camera.main 时立即失败。
        /// </summary>
        [Test]
        public void Capture_NoCameraSelection_ReturnsError()
        {
            string taskId = CreateUniqueTaskId();
            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = taskId,
                OutputPath = CreateRelativePath(taskId, "no-camera.png")
            });

            Assert.That(result.Status, Is.EqualTo("FAIL"));
            Assert.That(result.ErrorCode, Is.EqualTo("CAMERA_SELECTION_REQUIRED"));
        }

        /// <summary>
        /// 验证不存在的固定摄像机不会静默回退到任意摄像机。
        /// </summary>
        [Test]
        public void Capture_UnknownCameraPath_DoesNotFallback()
        {
            CreateCamera("VisualRig", "ExistingCamera");
            string taskId = CreateUniqueTaskId();

            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = taskId,
                CameraPath = "VisualRig/MissingCamera",
                AllowMainCamera = true,
                OutputPath = CreateRelativePath(taskId, "missing-camera.png")
            });

            Assert.That(result.Status, Is.EqualTo("FAIL"));
            Assert.That(result.ErrorCode, Is.EqualTo("CAMERA_NOT_FOUND"));
        }

        /// <summary>
        /// 验证截图只能写入项目 Artifacts/VisualQA 证据目录。
        /// </summary>
        [Test]
        public void Capture_OutsideEvidenceRoot_ReturnsError()
        {
            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = "visual-path-test",
                CameraPath = "Any/Camera",
                OutputPath = "Assets/Generated/capture.png"
            });

            Assert.That(result.Status, Is.EqualTo("FAIL"));
            Assert.That(result.ErrorCode, Is.EqualTo("INVALID_EVIDENCE_PATH"));
        }

        /// <summary>
        /// 验证已有截图不会被未版本化请求覆盖。
        /// </summary>
        [Test]
        public void Capture_ExistingOutput_ReturnsErrorWithoutOverwrite()
        {
            string taskId = CreateUniqueTaskId();
            string relativePath = CreateRelativePath(taskId, "existing.png");
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(absolutePath) ?? string.Empty);
            File.WriteAllText(absolutePath, "existing-evidence");
            createdPaths = new[] { absolutePath };

            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = taskId,
                CameraPath = "Missing/Camera",
                OutputPath = relativePath
            });

            Assert.That(result.ErrorCode, Is.EqualTo("OUTPUT_ALREADY_EXISTS"));
            Assert.That(File.ReadAllText(absolutePath), Is.EqualTo("existing-evidence"));
        }

        /// <summary>
        /// 未保存场景必须阻断截图，且不得生成任何证据文件。
        /// </summary>
        [Test]
        public void Capture_DirtyScene_ReturnsErrorWithoutWriting()
        {
            CreateCamera("VisualRig", "CaptureCamera");
            GameObject dirtyMarker = new GameObject("DirtyMarker");
            dirtyMarker.transform.SetParent(cameraRoot.transform, false);
            string taskId = CreateUniqueTaskId();
            string relativePath = CreateRelativePath(taskId, "dirty-scene.png");
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            createdPaths = new[] { absolutePath };

            VisualCaptureResult result = new VisualCaptureService().Capture(new VisualCaptureRequest
            {
                TaskId = taskId,
                CameraPath = "VisualRig/CaptureCamera",
                OutputPath = relativePath
            });

            Assert.That(result.Status, Is.EqualTo("FAIL"));
            Assert.That(result.ErrorCode, Is.EqualTo("EDITOR_SCENE_DIRTY"));
            Assert.That(File.Exists(absolutePath), Is.False);
        }

        /// <summary>
        /// 创建具有稳定层级路径的测试摄像机。
        /// </summary>
        private Camera CreateCamera(string rootName, string cameraName)
        {
            cameraRoot = new GameObject(rootName);
            GameObject cameraObject = new GameObject(cameraName);
            cameraObject.transform.SetParent(cameraRoot.transform, false);
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.magenta;
            Assert.That(EditorSceneManager.SaveScene(cameraObject.scene, TestScenePath), Is.True);
            return camera;
        }

        /// <summary>
        /// 创建不会与并行测试冲突的项目相对证据路径。
        /// </summary>
        private static string CreateRelativePath(string taskId, string fileName)
        {
            return "Artifacts/Visual/" + taskId + "/" + fileName;
        }

        /// <summary>
        /// 创建可安全用作证据目录名的唯一任务 ID。
        /// </summary>
        private static string CreateUniqueTaskId()
        {
            return "visual-test-" + Guid.NewGuid().ToString("N");
        }
    }
}
