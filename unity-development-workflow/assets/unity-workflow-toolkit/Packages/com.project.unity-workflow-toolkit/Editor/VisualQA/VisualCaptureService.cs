using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>
    /// 描述一次固定机位视觉证据截图请求。
    /// </summary>
    [Serializable]
    public sealed class VisualCaptureRequest
    {
        public string TaskId = string.Empty;
        public string CameraPath = string.Empty;
        public bool AllowMainCamera;
        public int Width = 1920;
        public int Height = 1080;
        public string OutputPath = string.Empty;
    }

    /// <summary>
    /// 返回视觉截图的结构化结果，失败时不会留下半成品图片。
    /// </summary>
    [Serializable]
    public sealed class VisualCaptureResult
    {
        public string Status = "FAIL";
        public string ErrorCode = string.Empty;
        public string Message = string.Empty;
        public string OutputPath = string.Empty;
        public string CameraPath = string.Empty;
        public int Width;
        public int Height;
        public long SizeBytes;
        public string Sha256 = string.Empty;
        public string CaptureScope = "EDITOR_CAMERA_REFERENCE";
        public string UiCoverage = "CAMERA_AND_CAMERA_SPACE_ONLY";
        public string ScenePath = string.Empty;
        public string SceneGuid = string.Empty;
        public Vector3 CameraPosition;
        public Quaternion CameraRotation;
        public bool Orthographic;
        public float FieldOfView;
        public float OrthographicSize;
        public float NearClipPlane;
        public float FarClipPlane;
        public int CullingMask;
    }

    /// <summary>
    /// 使用明确指定的摄像机生成项目内视觉证据，不负责视觉批准。
    /// </summary>
    public sealed class VisualCaptureService
    {
        private const string EvidenceRoot = "Artifacts/Visual/";

        /// <summary>
        /// 将当前场景从固定摄像机渲染为 PNG，并拒绝覆盖已有证据。
        /// </summary>
        /// <param name="request">包含摄像机选择和输出位置的截图请求。</param>
        /// <returns>可序列化的截图结果。</returns>
        public VisualCaptureResult Capture(VisualCaptureRequest request)
        {
            VisualCaptureResult invalidResult = ValidateRequest(request);
            if (invalidResult != null)
            {
                return invalidResult;
            }

            EditorStabilityResult stability = EditorStabilityGuard.Check(true);
            if (!stability.IsStable)
            {
                return Failure(
                    stability.ErrorCode.ToUpperInvariant().Replace('.', '_').Replace('-', '_'),
                    stability.Message,
                    request);
            }

            string absoluteOutputPath;
            try
            {
                absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(Normalize(request.OutputPath));
            }
            catch (Exception)
            {
                return Failure("INVALID_OUTPUT_PATH", "输出路径不符合项目相对路径约束。", request);
            }

            if (File.Exists(absoluteOutputPath))
            {
                // 截图即审查证据，覆盖旧文件会破坏版本链，因此调用方必须提供新文件名。
                return Failure("OUTPUT_ALREADY_EXISTS", "输出截图已存在，请使用新的版本化文件名。", request);
            }

            Camera camera = ResolveCamera(request, out string cameraError);
            if (camera == null)
            {
                return Failure("CAMERA_NOT_FOUND", cameraError, request);
            }

            byte[] pngBytes;
            try
            {
                pngBytes = RenderCamera(camera, request.Width, request.Height);
            }
            catch (Exception)
            {
                return Failure("CAPTURE_FAILED", "摄像机渲染失败。", request, GetHierarchyPath(camera.transform));
            }

            try
            {
                WriteNewFileAtomically(absoluteOutputPath, pngBytes);
            }
            catch (Exception)
            {
                return Failure("WRITE_FAILED", "截图写入失败。", request, GetHierarchyPath(camera.transform));
            }

            return new VisualCaptureResult
            {
                Status = "PASS",
                Message = "视觉证据截图已生成。",
                OutputPath = Normalize(request.OutputPath),
                CameraPath = GetHierarchyPath(camera.transform),
                Width = request.Width,
                Height = request.Height,
                SizeBytes = pngBytes.LongLength,
                Sha256 = ComputeSha256(pngBytes),
                ScenePath = camera.gameObject.scene.path,
                SceneGuid = AssetDatabase.AssetPathToGUID(camera.gameObject.scene.path),
                CameraPosition = camera.transform.position,
                CameraRotation = camera.transform.rotation,
                Orthographic = camera.orthographic,
                FieldOfView = camera.fieldOfView,
                OrthographicSize = camera.orthographicSize,
                NearClipPlane = camera.nearClipPlane,
                FarClipPlane = camera.farClipPlane,
                CullingMask = camera.cullingMask
            };
        }

        /// <summary>
        /// 校验截图请求的固定分辨率、证据目录和摄像机选择策略。
        /// </summary>
        private static VisualCaptureResult ValidateRequest(VisualCaptureRequest request)
        {
            if (request == null)
            {
                return Failure("REQUEST_REQUIRED", "截图请求不能为空。", null);
            }

            if (request.Width != 1920 || request.Height != 1080)
            {
                return Failure("INVALID_RESOLUTION", "首版视觉证据必须使用 1920×1080 分辨率。", request);
            }

            if (!IsValidTaskId(request.TaskId))
            {
                return Failure("INVALID_TASK_ID", "任务 ID 不能为空，且只能包含字母、数字、点、下划线和连字符。", request);
            }

            string normalizedPath = Normalize(request.OutputPath);
            if (!normalizedPath.StartsWith(EvidenceRoot, StringComparison.OrdinalIgnoreCase) ||
                !normalizedPath.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            {
                return Failure(
                    "INVALID_EVIDENCE_PATH",
                    $"截图必须写入 {EvidenceRoot} 下的 PNG 文件。",
                    request);
            }

            if (string.IsNullOrWhiteSpace(request.CameraPath) && !request.AllowMainCamera)
            {
                return Failure("CAMERA_SELECTION_REQUIRED", "必须指定摄像机路径，或明确允许使用 Camera.main。", request);
            }

            return null;
        }

        /// <summary>
        /// 按层级路径查找摄像机；仅在请求明确授权时回退到 Camera.main。
        /// </summary>
        private static Camera ResolveCamera(VisualCaptureRequest request, out string error)
        {
            error = string.Empty;
            if (!string.IsNullOrWhiteSpace(request.CameraPath))
            {
                string requestedPath = NormalizeHierarchyPath(request.CameraPath);
                List<Camera> matches = new List<Camera>();
                Camera[] cameras = UnityEngine.Object.FindObjectsByType<Camera>(
                    FindObjectsInactive.Include,
                    FindObjectsSortMode.None);

                foreach (Camera camera in cameras)
                {
                    if (string.Equals(GetHierarchyPath(camera.transform), requestedPath, StringComparison.Ordinal))
                    {
                        matches.Add(camera);
                    }
                }

                if (matches.Count == 1)
                {
                    return matches[0];
                }

                error = matches.Count > 1
                    ? $"摄像机路径不唯一：{requestedPath}。"
                    : $"找不到摄像机：{requestedPath}。";
                return null;
            }

            if (request.AllowMainCamera)
            {
                Camera mainCamera = Camera.main;
                if (mainCamera != null)
                {
                    return mainCamera;
                }
            }

            error = "场景中不存在可用的 Camera.main。";
            return null;
        }

        /// <summary>
        /// 在不改变摄像机原始目标和全局渲染目标的前提下生成 PNG 字节。
        /// </summary>
        private static byte[] RenderCamera(Camera camera, int width, int height)
        {
            RenderTexture renderTexture = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32);
            Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
            RenderTexture originalActive = RenderTexture.active;
            RenderTexture originalTarget = camera.targetTexture;

            try
            {
                camera.targetTexture = renderTexture;
                RenderTexture.active = renderTexture;
                camera.Render();
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0, false);
                texture.Apply(false, false);
                byte[] bytes = texture.EncodeToPNG();
                if (bytes == null || bytes.Length == 0)
                {
                    throw new InvalidOperationException("Unity 未生成有效的 PNG 数据。");
                }

                return bytes;
            }
            finally
            {
                camera.targetTexture = originalTarget;
                RenderTexture.active = originalActive;
                UnityEngine.Object.DestroyImmediate(texture);
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }

        /// <summary>
        /// 先写入同目录临时文件，再原子移动为正式证据，失败时清理临时文件。
        /// </summary>
        private static void WriteNewFileAtomically(string outputPath, byte[] bytes)
        {
            string directory = Path.GetDirectoryName(outputPath);
            if (string.IsNullOrEmpty(directory))
            {
                throw new InvalidOperationException("无法解析截图输出目录。");
            }

            Directory.CreateDirectory(directory);
            // 输出目录创建后重新验证项目边界与重解析点，避免截图写入链接指向的位置。
            string projectRelativePath = WorkflowPaths.ToProjectRelative(outputPath);
            outputPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            string temporaryPath = outputPath + ".tmp-" + Guid.NewGuid().ToString("N");
            try
            {
                File.WriteAllBytes(temporaryPath, bytes);
                // File.Move 默认拒绝覆盖，与前置检查共同防止并发任务覆盖视觉证据。
                File.Move(temporaryPath, outputPath);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
        }

        /// <summary>
        /// 生成不包含本机绝对路径的失败结果。
        /// </summary>
        private static VisualCaptureResult Failure(
            string errorCode,
            string message,
            VisualCaptureRequest request,
            string cameraPath = "")
        {
            return new VisualCaptureResult
            {
                Status = "FAIL",
                ErrorCode = errorCode,
                Message = SanitizeMessage(message),
                OutputPath = request == null ? string.Empty : Normalize(request.OutputPath),
                CameraPath = cameraPath,
                Width = request == null ? 0 : request.Width,
                Height = request == null ? 0 : request.Height
            };
        }

        /// <summary>
        /// 获取不含场景名的稳定层级路径，供截图清单和复现任务使用。
        /// </summary>
        private static string GetHierarchyPath(Transform transform)
        {
            string path = transform.name;
            Transform current = transform.parent;
            while (current != null)
            {
                path = current.name + "/" + path;
                current = current.parent;
            }

            return path;
        }

        /// <summary>
        /// 统一项目相对路径分隔符，避免平台差异影响白名单判断。
        /// </summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }

        /// <summary>
        /// 统一摄像机层级路径格式。
        /// </summary>
        private static string NormalizeHierarchyPath(string path)
        {
            return Normalize(path).Trim('/');
        }

        /// <summary>
        /// 校验任务 ID 可安全用作单层证据目录名。
        /// </summary>
        private static bool IsValidTaskId(string taskId)
        {
            if (string.IsNullOrWhiteSpace(taskId))
            {
                return false;
            }

            foreach (char character in taskId)
            {
                if (!char.IsLetterOrDigit(character) &&
                    character != '-' && character != '_' && character != '.')
                {
                    return false;
                }
            }

            return taskId != "." && taskId != "..";
        }

        /// <summary>
        /// 计算截图字节的小写 SHA-256，使审查记录可绑定不可覆盖的具体图片。
        /// </summary>
        private static string ComputeSha256(byte[] bytes)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>
        /// 避免把项目根目录或其他本机绝对路径写入可共享报告。
        /// </summary>
        private static string SanitizeMessage(string message)
        {
            if (string.IsNullOrEmpty(message))
            {
                return "视觉截图失败。";
            }

            string projectRoot = Directory.GetParent(Application.dataPath)?.FullName;
            return string.IsNullOrEmpty(projectRoot)
                ? message
                : message.Replace(projectRoot, "<project>");
        }
    }
}
