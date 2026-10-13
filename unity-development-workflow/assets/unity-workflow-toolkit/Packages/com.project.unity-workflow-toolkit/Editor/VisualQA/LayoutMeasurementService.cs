using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>描述一次从已加载场景读取 UI 实际几何的请求。</summary>
    [Serializable]
    public sealed class LayoutMeasurementRequest
    {
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string uiSystem = string.Empty;
        public string coordinateSpace = string.Empty;
        public string outputPath = string.Empty;
        public string gapAxis = string.Empty;
        public List<LayoutMeasurementTarget> targets = new List<LayoutMeasurementTarget>();
    }

    /// <summary>描述需要测量的 uGUI RectTransform 或 UI Toolkit 元素及其直接父框。</summary>
    [Serializable]
    public sealed class LayoutMeasurementTarget
    {
        public string id = string.Empty;
        public string objectPath = string.Empty;
        public string parentObjectPath = string.Empty;
        public string documentPath = string.Empty;
        public string elementName = string.Empty;
        public string parentElementName = string.Empty;
        public LayoutRect targetRect;
        public LayoutTolerance tolerance;
    }

    /// <summary>记录一个统一采用左上原点的实际矩形。</summary>
    [Serializable]
    public sealed class LayoutRect
    {
        public float x;
        public float y;
        public float width;
        public float height;
    }

    /// <summary>用一个声明的最大绝对差值同时约束位置和尺寸四个分量。</summary>
    [Serializable]
    public sealed class LayoutTolerance
    {
        public float maxAbsDelta;
    }

    /// <summary>记录实际节点相对直接父框的四边距离。</summary>
    [Serializable]
    public sealed class LayoutMargins
    {
        public float left;
        public float top;
        public float right;
        public float bottom;
    }

    /// <summary>返回一次布局测量的实测值、声明目标与容差结论。</summary>
    [Serializable]
    public sealed class LayoutMeasurementItem
    {
        public string id = string.Empty;
        public string objectPath = string.Empty;
        public string elementName = string.Empty;
        public string parentPath = string.Empty;
        public LayoutRect actualRect;
        public LayoutRect parentRect;
        public LayoutMargins margins;
        public LayoutRect targetRect;
        public LayoutRect delta;
        public LayoutTolerance tolerance;
        public string status = "MEASURED";
    }

    /// <summary>表示布局测量结果；MEASURED 不代表通过未声明的精确度阈值。</summary>
    [Serializable]
    public sealed class LayoutMeasurementReport
    {
        public string schemaVersion = "1.0";
        public string status = "FAIL";
        public string errorCode = string.Empty;
        public string message = string.Empty;
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string uiSystem = string.Empty;
        public string coordinateSpace = string.Empty;
        public string unit = string.Empty;
        public string origin = "SCREEN_TOP_LEFT";
        public string generatedAtUtc = string.Empty;
        public string outputPath = string.Empty;
        public List<LayoutMeasurementItem> measurements = new List<LayoutMeasurementItem>();
        public string gapAxis = string.Empty;
        public string gapNote = string.Empty;
        public List<LayoutGapMeasurement> gaps = new List<LayoutGapMeasurement>();
    }

    /// <summary>
    /// 只读采集已加载 UI 的实际矩形；不调整 RectTransform、Layout Group 或 Flex 布局。
    /// </summary>
    public sealed class LayoutMeasurementService
    {
        private const string EvidenceRoot = "Artifacts/Visual/";

        /// <summary>从请求指定的已加载场景测量节点，并将有效报告原子写入项目证据目录。</summary>
        /// <param name="request">包含场景、UI 系统、显式父子路径和可选容差的请求。</param>
        /// <returns>含实测矩形与容差结论的报告；结构无效时不写入报告。</returns>
        public LayoutMeasurementReport Measure(LayoutMeasurementRequest request)
        {
            LayoutMeasurementReport invalid = ValidateRequest(request);
            if (invalid != null)
            {
                return invalid;
            }

            // 稳定 Play Mode 是运行时 UIDocument 获得有效 Panel 几何的唯一常见入口；测量仍保持只读。
            EditorStabilityResult stability = EditorStabilityGuard.Check(true);
            if (!stability.IsStable)
            {
                return Failure(
                    "BLOCKED",
                    stability.ErrorCode.ToUpperInvariant().Replace('.', '_').Replace('-', '_'),
                    stability.Message,
                    request);
            }

            Scene scene = SceneManager.GetSceneByPath(Normalize(request.scenePath));
            if (!scene.IsValid() || !scene.isLoaded || !string.Equals(scene.path, Normalize(request.scenePath), StringComparison.Ordinal))
            {
                return Failure("FAIL", "SCENE_NOT_LOADED", "指定场景未加载，无法读取实际布局。", request);
            }

            var report = CreateReport(request);
            try
            {
                if (string.Equals(request.uiSystem, "UGUI", StringComparison.Ordinal))
                {
                    MeasureUgui(scene, request, report);
                }
                else
                {
                    MeasureUiToolkit(scene, request, report);
                }
            }
            catch (MeasurementException exception)
            {
                return Failure("FAIL", exception.Code, exception.Message, request);
            }
            catch (Exception)
            {
                return Failure("FAIL", "LAYOUT_MEASUREMENT_FAILED", "Unity 无法完成布局读取；未写入不完整报告。", request);
            }

            report.status = GetOverallStatus(report.measurements);
            report.message = report.status == "FAIL"
                ? "至少一个节点超出已声明的矩形容差。"
                : report.status == "PASS"
                    ? "所有已声明矩形均在容差内。"
                    : "布局已实测；未声明容差的节点只记录几何，不构成通过结论。";
            LayoutGapMeasurementService.Populate(report, request.gapAxis);

            try
            {
                ReportWriter.WriteNew(request.outputPath, report);
            }
            catch (Exception)
            {
                return Failure("FAIL", "REPORT_WRITE_FAILED", "布局报告写入失败；未覆盖既有报告。", request);
            }

            return report;
        }

        /// <summary>验证请求字段、证据路径、唯一节点 ID 和单一坐标体系。</summary>
        private static LayoutMeasurementReport ValidateRequest(LayoutMeasurementRequest request)
        {
            if (request == null)
            {
                return Failure("FAIL", "REQUEST_REQUIRED", "布局测量请求不能为空。", null);
            }

            if (!IsValidTaskId(request.taskId) || !string.IsNullOrEmpty(request.candidateId) && !IsValidTaskId(request.candidateId))
            {
                return Failure("FAIL", "INVALID_ID", "任务或候选 ID 格式无效。", request);
            }

            bool isUgui = string.Equals(request.uiSystem, "UGUI", StringComparison.Ordinal);
            bool isUiToolkit = string.Equals(request.uiSystem, "UI_TOOLKIT", StringComparison.Ordinal);
            string expectedCoordinateSpace = isUgui ? "SCREEN_SPACE_PIXELS" : "UI_TOOLKIT_LOGICAL_POINTS";
            if ((!isUgui && !isUiToolkit) || !string.Equals(request.coordinateSpace, expectedCoordinateSpace, StringComparison.Ordinal))
            {
                return Failure("FAIL", "INCONSISTENT_COORDINATE_SPACE", "一个测量请求只能使用与 UI 系统匹配的单一坐标空间。", request);
            }

            if (!string.IsNullOrEmpty(request.gapAxis) &&
                !string.Equals(request.gapAxis, "horizontal", StringComparison.Ordinal) &&
                !string.Equals(request.gapAxis, "vertical", StringComparison.Ordinal))
            {
                return Failure("FAIL", "INVALID_GAP_AXIS", "间距轴只能是 horizontal 或 vertical。", request);
            }

            if (string.IsNullOrWhiteSpace(request.scenePath) ||
                !request.scenePath.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
            {
                return Failure("FAIL", "INVALID_SCENE_PATH", "必须指定项目内的 .unity 场景路径。", request);
            }

            string outputPath = Normalize(request.outputPath);
            if (!outputPath.StartsWith(EvidenceRoot, StringComparison.OrdinalIgnoreCase) ||
                !outputPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                return Failure("FAIL", "INVALID_EVIDENCE_PATH", $"报告必须写入 {EvidenceRoot} 下的 JSON 文件。", request);
            }

            if (request.targets == null || request.targets.Count == 0)
            {
                return Failure("FAIL", "TARGETS_REQUIRED", "至少需要一个显式布局目标。", request);
            }

            var ids = new HashSet<string>(StringComparer.Ordinal);
            string sharedDocumentPath = null;
            foreach (LayoutMeasurementTarget target in request.targets)
            {
                if (target == null || !IsValidTaskId(target.id) || !ids.Add(target.id))
                {
                    return Failure("FAIL", "INVALID_OR_DUPLICATE_TARGET_ID", "目标 ID 缺失或重复。", request);
                }

                if (target.tolerance != null &&
                    (target.targetRect == null || !IsFinite(target.tolerance.maxAbsDelta) || target.tolerance.maxAbsDelta < 0f))
                {
                    return Failure("FAIL", "INVALID_TOLERANCE", "容差必须为非负有限数值，并且必须同时声明目标矩形。", request);
                }

                if (target.targetRect != null && !IsValidRect(target.targetRect))
                {
                    return Failure("FAIL", "INVALID_TARGET_RECT", "目标矩形尺寸必须为正，且所有分量必须为有限数值。", request);
                }

                bool targetShapeValid = isUgui
                    ? !string.IsNullOrWhiteSpace(target.objectPath) && !string.IsNullOrWhiteSpace(target.parentObjectPath) &&
                      string.IsNullOrWhiteSpace(target.documentPath) && string.IsNullOrWhiteSpace(target.elementName) && string.IsNullOrWhiteSpace(target.parentElementName)
                    : !string.IsNullOrWhiteSpace(target.documentPath) && !string.IsNullOrWhiteSpace(target.elementName) &&
                      !string.IsNullOrWhiteSpace(target.parentElementName) && string.IsNullOrWhiteSpace(target.objectPath) && string.IsNullOrWhiteSpace(target.parentObjectPath);
                if (!targetShapeValid)
                {
                    return Failure("FAIL", "MIXED_UI_TARGETS", "目标字段与声明的 UI 系统不匹配，不能混合不同坐标来源。", request);
                }

                if (isUiToolkit)
                {
                    string documentPath = NormalizeHierarchyPath(target.documentPath);
                    if (sharedDocumentPath == null)
                    {
                        sharedDocumentPath = documentPath;
                    }
                    else if (!string.Equals(sharedDocumentPath, documentPath, StringComparison.Ordinal))
                    {
                        return Failure("FAIL", "MIXED_UI_DOCUMENTS", "一次 UI Toolkit 测量只能使用同一个 UIDocument 根坐标原点。", request);
                    }
                }
            }

            try
            {
                string absolutePath = WorkflowPaths.ResolveProjectRelative(outputPath);
                if (File.Exists(absolutePath))
                {
                    return Failure("FAIL", "OUTPUT_ALREADY_EXISTS", "布局报告已存在，请使用新的版本化文件名。", request);
                }
            }
            catch (Exception)
            {
                return Failure("FAIL", "INVALID_OUTPUT_PATH", "报告路径不符合项目相对路径约束。", request);
            }

            return null;
        }

        /// <summary>按明确路径解析场景内 uGUI RectTransform，并统一投影为左上原点屏幕像素。</summary>
        private static void MeasureUgui(Scene scene, LayoutMeasurementRequest request, LayoutMeasurementReport report)
        {
            if (Screen.width <= 0 || Screen.height <= 0)
            {
                throw new MeasurementException("SCREEN_SIZE_UNAVAILABLE", "Unity 当前屏幕尺寸无效，无法测量 uGUI。");
            }

            for (int index = 0; index < request.targets.Count; index++)
            {
                LayoutMeasurementTarget target = request.targets[index];
                GameObject targetObject = ResolveSceneObject(scene, target.objectPath);
                GameObject parentObject = ResolveSceneObject(scene, target.parentObjectPath);
                RectTransform targetRect = targetObject.GetComponent<RectTransform>();
                RectTransform parentRect = parentObject.GetComponent<RectTransform>();
                if (targetRect == null || parentRect == null || targetRect.parent != parentRect)
                {
                    throw new MeasurementException("UI_PARENT_MISMATCH", $"目标 {target.id} 必须与明确父路径直接构成 RectTransform 父子关系。");
                }

                Canvas canvas = targetObject.GetComponentInParent<Canvas>(true);
                Canvas parentCanvas = parentObject.GetComponentInParent<Canvas>(true);
                if (canvas == null || parentCanvas == null || canvas.rootCanvas != parentCanvas.rootCanvas ||
                    !canvas.isActiveAndEnabled || !canvas.rootCanvas.isActiveAndEnabled)
                {
                    throw new MeasurementException("CANVAS_UNAVAILABLE", $"目标 {target.id} 不属于同一个启用的 Canvas。");
                }

                Canvas rootCanvas = canvas.rootCanvas;
                if (rootCanvas.targetDisplay != 0 ||
                    rootCanvas.renderMode != RenderMode.ScreenSpaceOverlay && rootCanvas.renderMode != RenderMode.ScreenSpaceCamera)
                {
                    throw new MeasurementException("UNSUPPORTED_CANVAS_MODE", $"目标 {target.id} 仅支持默认显示器上的 Screen Space Overlay 或 Screen Space Camera Canvas。");
                }

                Camera camera = null;
                if (rootCanvas.renderMode == RenderMode.ScreenSpaceCamera)
                {
                    camera = rootCanvas.worldCamera;
                    if (camera == null || !camera.isActiveAndEnabled || camera.targetDisplay != rootCanvas.targetDisplay ||
                        camera.targetTexture != null)
                    {
                        throw new MeasurementException("CANVAS_CAMERA_UNAVAILABLE", $"目标 {target.id} 的 Screen Space Camera Canvas 缺少可输出到屏幕的有效摄像机。");
                    }
                }

                LayoutRect actual = ToScreenRect(targetRect, camera, Screen.height);
                LayoutRect parent = ToScreenRect(parentRect, camera, Screen.height);
                AddMeasurement(report, target, NormalizeHierarchyPath(target.objectPath), string.Empty,
                    NormalizeHierarchyPath(target.parentObjectPath), actual, parent);
            }
        }

        /// <summary>按明确 UIDocument 和元素名称读取活动 Panel 上的实际布局点坐标。</summary>
        private static void MeasureUiToolkit(Scene scene, LayoutMeasurementRequest request, LayoutMeasurementReport report)
        {
            object sharedPanel = null;
            UIDocument sharedDocument = null;
            for (int index = 0; index < request.targets.Count; index++)
            {
                LayoutMeasurementTarget target = request.targets[index];
                GameObject documentObject = ResolveSceneObject(scene, target.documentPath);
                UIDocument document = documentObject.GetComponent<UIDocument>();
                if (document == null || !document.isActiveAndEnabled)
                {
                    throw new MeasurementException("UI_DOCUMENT_UNAVAILABLE", $"找不到启用的 UIDocument：{target.documentPath}。");
                }

                if (sharedDocument == null)
                {
                    sharedDocument = document;
                }
                else if (!ReferenceEquals(sharedDocument, document))
                {
                    throw new MeasurementException("MIXED_UI_DOCUMENTS", "一次 UI Toolkit 测量只能使用同一个 UIDocument 根坐标原点。");
                }

                VisualElement root = document.rootVisualElement;
                if (root == null || root.panel == null)
                {
                    throw new MeasurementException("UI_PANEL_UNAVAILABLE", $"UIDocument 尚未连接到有效 Panel：{target.documentPath}。");
                }

                if (sharedPanel == null)
                {
                    sharedPanel = root.panel;
                }
                else if (!ReferenceEquals(sharedPanel, root.panel))
                {
                    throw new MeasurementException("MIXED_UI_PANELS", "一次 UI Toolkit 测量不能混用不同 Panel 的逻辑坐标。");
                }

                Rect rootBounds = root.worldBound;
                if (!IsUsableRect(rootBounds))
                {
                    throw new MeasurementException("UI_PANEL_SIZE_UNAVAILABLE", $"UIDocument Panel 尚无有效尺寸：{target.documentPath}。");
                }

                List<VisualElement> targetMatches = FindElementsByName(root, target.elementName);
                List<VisualElement> parentMatches = FindElementsByName(root, target.parentElementName);
                if (targetMatches.Count != 1 || parentMatches.Count != 1)
                {
                    throw new MeasurementException("UI_ELEMENT_NOT_UNIQUE", $"UIDocument 中的目标或父元素名称不存在或不唯一：{target.elementName} / {target.parentElementName}。");
                }

                VisualElement targetElement = targetMatches[0];
                VisualElement parentElement = parentMatches[0];
                if (targetElement.parent != parentElement)
                {
                    throw new MeasurementException("UI_PARENT_MISMATCH", $"元素 {target.elementName} 必须与 {target.parentElementName} 直接构成父子关系。");
                }

                Rect targetBounds = targetElement.worldBound;
                Rect parentBounds = parentElement.worldBound;
                if (!IsUsableRect(targetBounds) || !IsUsableRect(parentBounds) ||
                    targetElement.resolvedStyle.display == DisplayStyle.None ||
                    parentElement.resolvedStyle.display == DisplayStyle.None)
                {
                    throw new MeasurementException("UI_ELEMENT_SIZE_UNAVAILABLE", $"元素或父元素尚无可测量的显示尺寸：{target.elementName}。");
                }

                LayoutRect actual = FromPanelRect(targetBounds, rootBounds);
                LayoutRect parent = FromPanelRect(parentBounds, rootBounds);
                AddMeasurement(report, target, NormalizeHierarchyPath(target.documentPath), target.elementName,
                    target.parentElementName, actual, parent);
            }
        }

        /// <summary>在当前场景的根对象中按完整层级路径查找唯一 GameObject。</summary>
        private static GameObject ResolveSceneObject(Scene scene, string requestedPath)
        {
            string normalized = NormalizeHierarchyPath(requestedPath);
            var matches = new List<GameObject>();
            GameObject[] roots = scene.GetRootGameObjects();
            for (int rootIndex = 0; rootIndex < roots.Length; rootIndex++)
            {
                Transform[] transforms = roots[rootIndex].GetComponentsInChildren<Transform>(true);
                for (int transformIndex = 0; transformIndex < transforms.Length; transformIndex++)
                {
                    if (string.Equals(GetHierarchyPath(transforms[transformIndex]), normalized, StringComparison.Ordinal))
                    {
                        matches.Add(transforms[transformIndex].gameObject);
                    }
                }
            }

            if (matches.Count != 1)
            {
                string code = matches.Count > 1 ? "SCENE_OBJECT_PATH_NOT_UNIQUE" : "SCENE_OBJECT_NOT_FOUND";
                throw new MeasurementException(code, matches.Count > 1
                    ? $"场景对象路径不唯一：{normalized}。"
                    : $"场景中找不到对象：{normalized}。");
            }

            return matches[0];
        }

        /// <summary>将 RectTransform 四角投影到左上原点的屏幕像素并求轴对齐外框。</summary>
        private static LayoutRect ToScreenRect(RectTransform transform, Camera camera, int screenHeight)
        {
            var corners = new Vector3[4];
            transform.GetWorldCorners(corners);
            float minX = float.PositiveInfinity;
            float minY = float.PositiveInfinity;
            float maxX = float.NegativeInfinity;
            float maxY = float.NegativeInfinity;
            for (int index = 0; index < corners.Length; index++)
            {
                if (camera != null && camera.WorldToViewportPoint(corners[index]).z <= 0f)
                {
                    throw new MeasurementException("RECT_BEHIND_CAMERA", "Screen Space Camera 的 RectTransform 位于摄像机后方。");
                }

                Vector2 point = RectTransformUtility.WorldToScreenPoint(camera, corners[index]);
                if (!IsFinite(point.x) || !IsFinite(point.y))
                {
                    throw new MeasurementException("RECT_PROJECTION_INVALID", "RectTransform 投影坐标无效。");
                }

                minX = Mathf.Min(minX, point.x);
                minY = Mathf.Min(minY, point.y);
                maxX = Mathf.Max(maxX, point.x);
                maxY = Mathf.Max(maxY, point.y);
            }

            return new LayoutRect
            {
                x = minX,
                y = screenHeight - maxY,
                width = maxX - minX,
                height = maxY - minY
            };
        }

        /// <summary>把 Panel 世界边界转换为 UIDocument 根节点左上原点的逻辑点外框。</summary>
        private static LayoutRect FromPanelRect(Rect elementBounds, Rect rootBounds)
        {
            return new LayoutRect
            {
                x = elementBounds.xMin - rootBounds.xMin,
                y = elementBounds.yMin - rootBounds.yMin,
                width = elementBounds.width,
                height = elementBounds.height
            };
        }

        /// <summary>遍历视觉树并收集完全匹配名称的全部元素，以便拒绝重名目标。</summary>
        private static List<VisualElement> FindElementsByName(VisualElement root, string elementName)
        {
            var matches = new List<VisualElement>();
            var stack = new Stack<VisualElement>();
            stack.Push(root);
            while (stack.Count > 0)
            {
                VisualElement current = stack.Pop();
                if (string.Equals(current.name, elementName, StringComparison.Ordinal))
                {
                    matches.Add(current);
                }

                for (int childIndex = current.hierarchy.childCount - 1; childIndex >= 0; childIndex--)
                {
                    stack.Push(current.hierarchy[childIndex]);
                }
            }

            return matches;
        }

        /// <summary>创建实际矩形、相对父框边距、期望值差异与显式容差状态。</summary>
        private static void AddMeasurement(
            LayoutMeasurementReport report,
            LayoutMeasurementTarget target,
            string objectPath,
            string elementName,
            string parentPath,
            LayoutRect actual,
            LayoutRect parent)
        {
            var item = new LayoutMeasurementItem
            {
                id = target.id,
                objectPath = objectPath,
                elementName = elementName,
                parentPath = parentPath,
                actualRect = actual,
                parentRect = parent,
                margins = new LayoutMargins
                {
                    left = actual.x - parent.x,
                    top = actual.y - parent.y,
                    right = parent.x + parent.width - actual.x - actual.width,
                    bottom = parent.y + parent.height - actual.y - actual.height
                },
                targetRect = target.targetRect == null ? null : CopyRect(target.targetRect),
                tolerance = target.tolerance == null ? null : new LayoutTolerance { maxAbsDelta = target.tolerance.maxAbsDelta },
                status = "MEASURED"
            };

            if (target.targetRect != null)
            {
                item.delta = new LayoutRect
                {
                    x = actual.x - target.targetRect.x,
                    y = actual.y - target.targetRect.y,
                    width = actual.width - target.targetRect.width,
                    height = actual.height - target.targetRect.height
                };
            }

            if (target.tolerance != null)
            {
                float tolerance = target.tolerance.maxAbsDelta;
                item.status = Mathf.Abs(item.delta.x) <= tolerance &&
                              Mathf.Abs(item.delta.y) <= tolerance &&
                              Mathf.Abs(item.delta.width) <= tolerance &&
                              Mathf.Abs(item.delta.height) <= tolerance
                    ? "PASS"
                    : "FAIL";
            }

            report.measurements.Add(item);
        }

        /// <summary>根据实际测量项汇总为阈值通过、阈值失败或仅测量状态。</summary>
        private static string GetOverallStatus(List<LayoutMeasurementItem> measurements)
        {
            bool anyPassOrFail = false;
            for (int index = 0; index < measurements.Count; index++)
            {
                if (measurements[index].status == "FAIL")
                {
                    return "FAIL";
                }

                anyPassOrFail |= measurements[index].status == "PASS";
            }

            for (int index = 0; index < measurements.Count; index++)
            {
                if (measurements[index].status != "PASS")
                {
                    return "MEASURED";
                }
            }

            return anyPassOrFail ? "PASS" : "MEASURED";
        }

        /// <summary>构造具备当前场景、坐标约定和证据路径的报告。</summary>
        private static LayoutMeasurementReport CreateReport(LayoutMeasurementRequest request)
        {
            bool isUgui = string.Equals(request.uiSystem, "UGUI", StringComparison.Ordinal);
            return new LayoutMeasurementReport
            {
                status = "MEASURED",
                taskId = request.taskId,
                candidateId = request.candidateId ?? string.Empty,
                scenePath = Normalize(request.scenePath),
                uiSystem = request.uiSystem,
                coordinateSpace = request.coordinateSpace,
                unit = isUgui ? "PIXEL" : "POINT",
                origin = isUgui ? "SCREEN_TOP_LEFT" : "UIDOCUMENT_ROOT_TOP_LEFT",
                generatedAtUtc = UtcNow(),
                outputPath = Normalize(request.outputPath),
                gapAxis = request.gapAxis ?? string.Empty
            };
        }

        /// <summary>生成不含绝对主机路径的失败或阻断报告，不写入不完整证据。</summary>
        private static LayoutMeasurementReport Failure(
            string status,
            string errorCode,
            string message,
            LayoutMeasurementRequest request)
        {
            return new LayoutMeasurementReport
            {
                status = status,
                errorCode = errorCode ?? string.Empty,
                message = message ?? "布局测量失败。",
                taskId = request == null ? string.Empty : request.taskId ?? string.Empty,
                candidateId = request == null ? string.Empty : request.candidateId ?? string.Empty,
                scenePath = request == null ? string.Empty : Normalize(request.scenePath),
                uiSystem = request == null ? string.Empty : request.uiSystem ?? string.Empty,
                coordinateSpace = request == null ? string.Empty : request.coordinateSpace ?? string.Empty,
                origin = request != null && string.Equals(request.uiSystem, "UI_TOOLKIT", StringComparison.Ordinal)
                    ? "UIDOCUMENT_ROOT_TOP_LEFT"
                    : "SCREEN_TOP_LEFT",
                outputPath = request == null ? string.Empty : Normalize(request.outputPath),
                generatedAtUtc = UtcNow(),
                gapAxis = request == null ? string.Empty : request.gapAxis ?? string.Empty
            };
        }

        /// <summary>获取完整层级路径以确保对象名解析不依赖搜索顺序。</summary>
        private static string GetHierarchyPath(Transform transform)
        {
            string path = transform.name;
            Transform parent = transform.parent;
            while (parent != null)
            {
                path = parent.name + "/" + path;
                parent = parent.parent;
            }

            return path;
        }

        /// <summary>复制用户声明的矩形，避免报告引用输入对象。</summary>
        private static LayoutRect CopyRect(LayoutRect value)
        {
            return new LayoutRect { x = value.x, y = value.y, width = value.width, height = value.height };
        }

        /// <summary>验证矩形尺寸和分量均为有限值。</summary>
        private static bool IsValidRect(LayoutRect rect)
        {
            return rect != null && IsFinite(rect.x) && IsFinite(rect.y) &&
                   IsFinite(rect.width) && IsFinite(rect.height) && rect.width > 0f && rect.height > 0f;
        }

        /// <summary>验证 Unity Rect 已完成布局并具有有限非零宽高。</summary>
        private static bool IsUsableRect(Rect rect)
        {
            return IsFinite(rect.xMin) && IsFinite(rect.yMin) && IsFinite(rect.width) &&
                   IsFinite(rect.height) && rect.width > 0f && rect.height > 0f;
        }

        /// <summary>检查浮点数不是 NaN 或无穷大。</summary>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        /// <summary>校验工作流任务 ID 可作为报告身份使用。</summary>
        private static bool IsValidTaskId(string value)
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

        /// <summary>统一项目相对路径和层级路径的分隔符。</summary>
        private static string Normalize(string path)
        {
            return (path ?? string.Empty).Replace('\\', '/');
        }

        /// <summary>去除对象路径两端分隔符，使路径比较保持稳定。</summary>
        private static string NormalizeHierarchyPath(string path)
        {
            return Normalize(path).Trim('/');
        }

        /// <summary>使用固定 UTC 格式记录本次测量时间。</summary>
        private static string UtcNow()
        {
            return DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }

        /// <summary>携带可序列化错误码的受控测量异常。</summary>
        private sealed class MeasurementException : Exception
        {
            /// <summary>创建一条不含主机路径的测量失败原因。</summary>
            public MeasurementException(string code, string message) : base(message)
            {
                Code = code;
            }

            /// <summary>获取用于报告的稳定错误码。</summary>
            public string Code { get; }
        }
    }
}
