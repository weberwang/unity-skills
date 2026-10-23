using System;
using System.Collections.Generic;
using System.Globalization;
using Project.UnityWorkflow.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>从已加载场景中的真实组件与 UI Toolkit Panel 收集布局配置和写入来源。</summary>
    internal static class LayoutComponentSnapshotCollector
    {
        private const string RectTransformWriter = "RECT_TRANSFORM";
        private const string LayoutGroupWriter = "LAYOUT_GROUP";
        private const string ContentSizeFitterWriter = "CONTENT_SIZE_FITTER";
        private const string AspectRatioFitterWriter = "ASPECT_RATIO_FITTER";

        /// <summary>采集 uGUI 目标、父级布局器、Image 与真实登记脚本的实际状态。</summary>
        public static LayoutComponentSnapshot CaptureUgui(GameObject target, GameObject parent)
        {
            AspectRatioFitter aspectRatioFitter = target.GetComponent<AspectRatioFitter>();
            var snapshot = new LayoutComponentSnapshot
            {
                active = target.activeInHierarchy,
                rectTransform = CaptureRectTransform(target.GetComponent<RectTransform>()),
                layoutGroup = CaptureLayoutGroup(target.GetComponent<LayoutGroup>()),
                parentLayoutGroup = CaptureLayoutGroup(parent.GetComponent<LayoutGroup>()),
                contentSizeFitter = CaptureContentSizeFitter(target.GetComponent<ContentSizeFitter>()),
                aspectRatioFitter = CaptureAspectRatioFitter(aspectRatioFitter),
                image = CaptureImage(target.GetComponent<UnityEngine.UI.Image>())
            };

            List<LayoutExternalWriterSnapshot> externalWriters = CaptureExternalWriters(
                target, string.Empty, false, snapshot.active);
            snapshot.externalWriters.AddRange(externalWriters);
            if (!snapshot.active)
            {
                return snapshot;
            }

            bool ignoredByParent = IsIgnoredByParentLayout(target);
            LayoutGroup parentGroup = parent.GetComponent<LayoutGroup>();
            if (!ignoredByParent && parentGroup != null && parentGroup.isActiveAndEnabled)
            {
                snapshot.positionWriters.Add(LayoutGroupWriter);
                bool widthDriven;
                bool heightDriven;
                GetParentLayoutSizeAxes(parentGroup, out widthDriven, out heightDriven);
                if (widthDriven)
                {
                    snapshot.widthWriters.Add(LayoutGroupWriter);
                }

                if (heightDriven)
                {
                    snapshot.heightWriters.Add(LayoutGroupWriter);
                }
            }

            ContentSizeFitter fitter = target.GetComponent<ContentSizeFitter>();
            if (fitter != null && fitter.isActiveAndEnabled)
            {
                if (fitter.horizontalFit != ContentSizeFitter.FitMode.Unconstrained)
                {
                    snapshot.widthWriters.Add(ContentSizeFitterWriter);
                }

                if (fitter.verticalFit != ContentSizeFitter.FitMode.Unconstrained)
                {
                    snapshot.heightWriters.Add(ContentSizeFitterWriter);
                }
            }

            AddAspectRatioFitterWriters(aspectRatioFitter, snapshot);
            AppendActiveExternalWriters(externalWriters, snapshot.positionWriters, snapshot.widthWriters, snapshot.heightWriters);
            AddRectTransformFallback(snapshot.positionWriters, snapshot.widthWriters, snapshot.heightWriters);
            return snapshot;
        }

        /// <summary>采集 UI Toolkit 元素的 Panel 样式、切片资源和真实登记写入者。</summary>
        public static LayoutComponentSnapshot CaptureUiToolkit(GameObject documentObject, VisualElement element, string elementName)
        {
            LayoutUiToolkitSnapshot uiToolkit = CaptureUiToolkitStyle(element);
            bool active = IsUiToolkitElementLayoutActive(documentObject, element);
            var snapshot = new LayoutComponentSnapshot
            {
                active = active,
                uiToolkit = uiToolkit
            };

            List<LayoutExternalWriterSnapshot> externalWriters = CaptureExternalWriters(
                documentObject, elementName, true, active);
            snapshot.externalWriters.AddRange(externalWriters);
            if (!active)
            {
                return snapshot;
            }

            VisualElement parent = element.parent;
            IResolvedStyle style = element.resolvedStyle;
            bool positionIsStyleDriven = style.position == Position.Absolute;
            AddWriter(snapshot.positionWriters, positionIsStyleDriven ? "UITOOLKIT_STYLE" : "UITOOLKIT_LAYOUT");
            // 所有元素尺寸最终均由 Panel 布局引擎计算，显式样式只作为输入约束，不是独立写入者。
            snapshot.widthWriters.Add("UITOOLKIT_LAYOUT");
            snapshot.heightWriters.Add("UITOOLKIT_LAYOUT");

            bool flexControlsWidth;
            bool flexControlsHeight;
            GetUiToolkitFlexSizeAxes(element, out flexControlsWidth, out flexControlsHeight);
            AppendActiveExternalWriters(
                externalWriters,
                snapshot.positionWriters,
                snapshot.widthWriters,
                snapshot.heightWriters,
                true,
                !flexControlsWidth,
                !flexControlsHeight);
            return snapshot;
        }

        /// <summary>创建屏幕左上原点上的 Viewport 矩形。</summary>
        public static LayoutRect CreateScreenViewport(int width, int height)
        {
            return new LayoutRect { x = 0f, y = 0f, width = width, height = height };
        }

        /// <summary>根据 Unity 屏幕安全区生成屏幕左上原点上的实际安全区矩形。</summary>
        public static LayoutRect CreateScreenSafeArea(int width, int height)
        {
            if (width <= 0 || height <= 0)
            {
                return null;
            }

            SafeAreaInsets insets = SafeAreaLayout.Calculate(Screen.safeArea, width, height);
            return new LayoutRect
            {
                x = insets.Left * width,
                y = insets.Top * height,
                width = width * (1f - insets.Left - insets.Right),
                height = height * (1f - insets.Top - insets.Bottom)
            };
        }

        /// <summary>把同批屏幕安全区按真实 Panel 根尺寸归一化到 UI Toolkit 逻辑坐标。</summary>
        public static LayoutRect CreatePanelSafeArea(Rect rootBounds)
        {
            if (!IsUsableRect(rootBounds) || Screen.width <= 0 || Screen.height <= 0)
            {
                return null;
            }

            SafeAreaInsets insets = SafeAreaLayout.Calculate(Screen.safeArea, Screen.width, Screen.height);
            return CreatePanelSafeArea(rootBounds, insets);
        }

        /// <summary>将归一化安全区留白换算为 Panel 根坐标中的安全区矩形。</summary>
        public static LayoutRect CreatePanelSafeArea(Rect rootBounds, SafeAreaInsets insets)
        {
            if (!IsUsableRect(rootBounds))
            {
                return null;
            }

            return new LayoutRect
            {
                x = insets.Left * rootBounds.width,
                y = insets.Top * rootBounds.height,
                width = rootBounds.width * (1f - insets.Left - insets.Right),
                height = rootBounds.height * (1f - insets.Top - insets.Bottom)
            };
        }

        /// <summary>判断 UI Toolkit 元素是否挂载在活动 UIDocument 的可见布局链中。</summary>
        public static bool IsUiToolkitElementLayoutActive(GameObject documentObject, VisualElement element)
        {
            UIDocument document = documentObject == null ? null : documentObject.GetComponent<UIDocument>();
            if (document == null || !document.isActiveAndEnabled || element == null || element.panel == null)
            {
                return false;
            }

            // display:none 会让祖先的整个子树退出布局；禁用控件仍可显示并占据真实布局空间。
            for (VisualElement current = element; current != null; current = current.parent)
            {
                if (current.resolvedStyle.display == DisplayStyle.None)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>将 UI Toolkit 根节点世界边界转换为根左上原点的实际 Viewport。</summary>
        public static LayoutRect CreatePanelViewport(Rect rootBounds)
        {
            return IsUsableRect(rootBounds)
                ? new LayoutRect { x = 0f, y = 0f, width = rootBounds.width, height = rootBounds.height }
                : null;
        }

        /// <summary>判断引用节点是否是目标的祖先或同父级兄弟。</summary>
        public static bool IsAllowedUguiReference(Transform target, Transform reference)
        {
            if (target == null || reference == null || target == reference)
            {
                return false;
            }

            if (reference == target.parent)
            {
                return true;
            }

            if (target.parent != null && reference.parent == target.parent)
            {
                return true;
            }

            Transform ancestor = target.parent;
            while (ancestor != null)
            {
                if (ancestor == reference)
                {
                    return true;
                }

                ancestor = ancestor.parent;
            }

            return false;
        }

        /// <summary>判断引用元素是否是目标的祖先或同父级兄弟。</summary>
        public static bool IsAllowedUiToolkitReference(VisualElement target, VisualElement reference)
        {
            if (target == null || reference == null || target == reference)
            {
                return false;
            }

            if (target.parent != null && reference.parent == target.parent)
            {
                return true;
            }

            VisualElement ancestor = target.parent;
            while (ancestor != null)
            {
                if (ancestor == reference)
                {
                    return true;
                }

                ancestor = ancestor.parent;
            }

            return false;
        }

        /// <summary>将屏幕矩形转换为左上原点坐标，并拒绝位于不可见 Canvas 后方的目标。</summary>
        public static LayoutRect ToScreenRect(RectTransform transform, Camera camera, int screenHeight)
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
                    throw new InvalidOperationException("Screen Space Camera 的 RectTransform 位于摄像机后方。");
                }

                Vector2 point = RectTransformUtility.WorldToScreenPoint(camera, corners[index]);
                if (!IsFinite(point.x) || !IsFinite(point.y))
                {
                    throw new InvalidOperationException("RectTransform 投影坐标无效。");
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

        /// <summary>把 Panel 元素边界转换为 UI Toolkit 根左上原点的逻辑坐标。</summary>
        public static LayoutRect FromPanelRect(Rect elementBounds, Rect rootBounds)
        {
            return new LayoutRect
            {
                x = elementBounds.xMin - rootBounds.xMin,
                y = elementBounds.yMin - rootBounds.yMin,
                width = elementBounds.width,
                height = elementBounds.height
            };
        }

        /// <summary>验证真实 Unity Rect 的尺寸和坐标均为有限值且尺寸非零。</summary>
        public static bool IsUsableRect(Rect rect)
        {
            return IsFinite(rect.xMin) && IsFinite(rect.yMin) && IsFinite(rect.width) &&
                   IsFinite(rect.height) && rect.width > 0f && rect.height > 0f;
        }

        /// <summary>获取完整对象路径，保证登记写入者身份不依赖搜索顺序。</summary>
        public static string GetHierarchyPath(Transform transform)
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

        /// <summary>采集目标 RectTransform 的实际布局数据与 Unity 当前驱动对象类型。</summary>
        private static LayoutRectTransformSnapshot CaptureRectTransform(RectTransform transform)
        {
            if (transform == null)
            {
                return null;
            }

            UnityEngine.Object drivenBy = transform.drivenByObject;
            return new LayoutRectTransformSnapshot
            {
                anchorMin = ToVectorSnapshot(transform.anchorMin),
                anchorMax = ToVectorSnapshot(transform.anchorMax),
                pivot = ToVectorSnapshot(transform.pivot),
                sizeDelta = ToVectorSnapshot(transform.sizeDelta),
                anchoredPosition = ToVectorSnapshot(transform.anchoredPosition),
                localSize = ToSizeSnapshot(transform.rect.size),
                drivenBy = drivenBy == null ? string.Empty : drivenBy.GetType().FullName
            };
        }

        /// <summary>采集 LayoutGroup 的实际轴向配置；GridLayoutGroup 以真实 cellSize 表达。</summary>
        private static LayoutGroupSnapshot CaptureLayoutGroup(LayoutGroup group)
        {
            if (group == null)
            {
                return null;
            }

            var result = new LayoutGroupSnapshot
            {
                type = group.GetType().Name,
                enabled = group.enabled
            };
            HorizontalOrVerticalLayoutGroup linear = group as HorizontalOrVerticalLayoutGroup;
            if (linear != null)
            {
                result.childControlWidth = linear.childControlWidth;
                result.childControlHeight = linear.childControlHeight;
                result.childForceExpandWidth = linear.childForceExpandWidth;
                result.childForceExpandHeight = linear.childForceExpandHeight;
            }

            GridLayoutGroup grid = group as GridLayoutGroup;
            if (grid != null)
            {
                result.cellSize = ToSizeSnapshot(grid.cellSize);
            }

            return result;
        }

        /// <summary>采集 ContentSizeFitter 的真实开关和两轴适配模式。</summary>
        private static LayoutContentSizeFitterSnapshot CaptureContentSizeFitter(ContentSizeFitter fitter)
        {
            return fitter == null
                ? null
                : new LayoutContentSizeFitterSnapshot
                {
                    enabled = fitter.enabled,
                    horizontalFit = fitter.horizontalFit.ToString(),
                    verticalFit = fitter.verticalFit.ToString()
                };
        }

        /// <summary>采集 AspectRatioFitter 的实际启用状态和宽高控制模式。</summary>
        private static LayoutAspectRatioFitterSnapshot CaptureAspectRatioFitter(AspectRatioFitter fitter)
        {
            return fitter == null
                ? null
                : new LayoutAspectRatioFitterSnapshot
                {
                    enabled = fitter.enabled,
                    aspectMode = fitter.aspectMode.ToString(),
                    aspectRatio = fitter.aspectRatio
                };
        }

        /// <summary>采集 Image 的真实 Sprite 身份、边框、PPU 与按 Unity 原生算法得到的尺寸。</summary>
        private static LayoutImageSnapshot CaptureImage(UnityEngine.UI.Image image)
        {
            if (image == null || image.overrideSprite == null)
            {
                return null;
            }

            // Unity 的 nativeSize、PPU 和切片边框均以实际生效的 overrideSprite 为准。
            Sprite sprite = image.overrideSprite;
            Rect sourceRect = sprite.rect;
            RectTransform rectTransform = image.rectTransform;
            Canvas canvas = image.canvas;
            string guid;
            long localId;
            bool hasAssetIdentity = AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite, out guid, out localId);
            float imagePixelsPerUnit = image.pixelsPerUnit;
            float referencePixelsPerUnit = imagePixelsPerUnit > 0f && IsFinite(imagePixelsPerUnit)
                ? sprite.pixelsPerUnit / imagePixelsPerUnit
                : canvas == null ? 100f : canvas.referencePixelsPerUnit;
            LayoutSize nativeSize = imagePixelsPerUnit > 0f && IsFinite(imagePixelsPerUnit)
                ? new LayoutSize { width = sourceRect.width / imagePixelsPerUnit, height = sourceRect.height / imagePixelsPerUnit }
                : null;
            Vector4 border = sprite.border;
            return new LayoutImageSnapshot
            {
                assetGuid = hasAssetIdentity ? guid : string.Empty,
                localId = hasAssetIdentity ? localId.ToString(CultureInfo.InvariantCulture) : string.Empty,
                assetPath = AssetDatabase.GetAssetPath(sprite),
                sourceSize = new LayoutSize { width = sourceRect.width, height = sourceRect.height },
                pixelsPerUnit = sprite.pixelsPerUnit,
                imagePixelsPerUnit = imagePixelsPerUnit,
                // 从 Image 的有效换算比反推参考单位，保留失效 Canvas 后 Image 缓存的实际值。
                referencePixelsPerUnit = referencePixelsPerUnit,
                pixelsPerUnitMultiplier = image.pixelsPerUnitMultiplier,
                type = image.type.ToString(),
                localSize = rectTransform == null ? null : ToSizeSnapshot(rectTransform.rect.size),
                nativeSize = nativeSize,
                hasBorder = border != Vector4.zero,
                border = new[] { border.x, border.y, border.z, border.w },
                preserveAspect = image.preserveAspect
            };
        }

        /// <summary>读取 UI Toolkit 在真实 Panel 上的计算样式和背景资源身份。</summary>
        private static LayoutUiToolkitSnapshot CaptureUiToolkitStyle(VisualElement element)
        {
            IResolvedStyle style = element.resolvedStyle;
            return new LayoutUiToolkitSnapshot
            {
                position = style.position.ToString(),
                display = style.display.ToString(),
                width = style.width,
                height = style.height,
                flexGrow = style.flexGrow,
                flexShrink = style.flexShrink,
                flexDirection = style.flexDirection.ToString(),
                alignItems = style.alignItems.ToString(),
                justifyContent = style.justifyContent.ToString(),
                backgroundAssetGuid = GetBackgroundGuid(style.backgroundImage),
                sliceLeft = style.unitySliceLeft,
                sliceRight = style.unitySliceRight,
                sliceTop = style.unitySliceTop,
                sliceBottom = style.unitySliceBottom,
                sliceScale = style.unitySliceScale
            };
        }

        /// <summary>解析真实 Panel 背景中的 Sprite、纹理或矢量资源 GUID。</summary>
        private static string GetBackgroundGuid(Background background)
        {
            UnityEngine.Object asset = background.sprite != null ? (UnityEngine.Object)background.sprite :
                background.texture != null ? background.texture :
                background.renderTexture != null ? background.renderTexture :
                background.vectorImage;
            if (asset == null)
            {
                return string.Empty;
            }

            string path = AssetDatabase.GetAssetPath(asset);
            return string.IsNullOrEmpty(path) ? string.Empty : AssetDatabase.AssetPathToGUID(path);
        }

        /// <summary>收集登记组件持有的真实 Behaviour，不把请求或计划字段当作运行时写入者。</summary>
        private static List<LayoutExternalWriterSnapshot> CaptureExternalWriters(
            GameObject owner,
            string elementName,
            bool isUiToolkit,
            bool targetActive)
        {
            var result = new List<LayoutExternalWriterSnapshot>();
            LayoutWriterRegistration[] registrations = owner.GetComponents<LayoutWriterRegistration>();
            for (int registrationIndex = 0; registrationIndex < registrations.Length; registrationIndex++)
            {
                LayoutWriterRegistration registration = registrations[registrationIndex];
                if (registration == null || registration.entries == null)
                {
                    continue;
                }

                for (int entryIndex = 0; entryIndex < registration.entries.Count; entryIndex++)
                {
                    LayoutWriterRegistrationEntry entry = registration.entries[entryIndex];
                    if (entry == null || entry.writer == null || !string.Equals(entry.elementName ?? string.Empty,
                        isUiToolkit ? elementName : string.Empty, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    Behaviour writer = entry.writer;
                    bool active = targetActive && writer.isActiveAndEnabled;
                    result.Add(new LayoutExternalWriterSnapshot
                    {
                        driver = entry.driver == LayoutWriterDriver.Animation ? "ANIMATION" : "SCRIPT",
                        ownerType = writer == null ? string.Empty : writer.GetType().FullName,
                        ownerPath = writer == null ? string.Empty : GetHierarchyPath(writer.transform),
                        active = active,
                        elementName = entry.elementName ?? string.Empty,
                        position = entry.position,
                        width = entry.width,
                        height = entry.height
                    });
                }
            }

            return result;
        }

        /// <summary>按活动外部登记的属性标记追加 SCRIPT 或 ANIMATION 写入者，保留重复登记。</summary>
        private static void AppendActiveExternalWriters(
            List<LayoutExternalWriterSnapshot> externalWriters,
            List<string> positionWriters,
            List<string> widthWriters,
            List<string> heightWriters,
            bool replaceStyleWriter = false,
            bool replaceUiToolkitLayoutWidth = false,
            bool replaceUiToolkitLayoutHeight = false)
        {
            for (int index = 0; index < externalWriters.Count; index++)
            {
                LayoutExternalWriterSnapshot writer = externalWriters[index];
                if (!writer.active)
                {
                    continue;
                }

                string writerName = writer.driver;
                if (writer.position)
                {
                    ReplaceExplicitStyleWriter(positionWriters, replaceStyleWriter);
                    positionWriters.Add(writerName);
                }

                if (writer.width)
                {
                    ReplaceExplicitStyleWriter(widthWriters, replaceStyleWriter);
                    ReplaceUiToolkitLayoutWriter(widthWriters, replaceUiToolkitLayoutWidth);
                    widthWriters.Add(writerName);
                }

                if (writer.height)
                {
                    ReplaceExplicitStyleWriter(heightWriters, replaceStyleWriter);
                    ReplaceUiToolkitLayoutWriter(heightWriters, replaceUiToolkitLayoutHeight);
                    heightWriters.Add(writerName);
                }
            }
        }

        /// <summary>清除被外部脚本明确替代的固定 UITK 样式，同时保留布局引擎并行控制。</summary>
        private static void ReplaceExplicitStyleWriter(List<string> writers, bool replaceStyleWriter)
        {
            if (replaceStyleWriter)
            {
                writers.Remove("UITOOLKIT_STYLE");
            }
        }

        /// <summary>无 Flex 动态约束时，让真实外部尺寸写入替代 Panel 的固定输入来源。</summary>
        private static void ReplaceUiToolkitLayoutWriter(List<string> writers, bool replaceLayoutWriter)
        {
            if (replaceLayoutWriter)
            {
                writers.Remove("UITOOLKIT_LAYOUT");
            }
        }

        /// <summary>按 Panel 实际主轴伸缩与子项交叉轴对齐判断 Flex 尺寸控制轴。</summary>
        private static void GetUiToolkitFlexSizeAxes(VisualElement element, out bool widthDriven, out bool heightDriven)
        {
            IResolvedStyle style = element.resolvedStyle;
            VisualElement parent = element.parent;
            IResolvedStyle parentStyle = parent == null ? null : parent.resolvedStyle;
            bool parentUsesRowAxis = parentStyle != null &&
                                     (parentStyle.flexDirection == FlexDirection.Row ||
                                      parentStyle.flexDirection == FlexDirection.RowReverse);
            bool participatesInFlex = style.position != Position.Absolute;
            // 子项 alignSelf 会覆盖父 alignItems；只有继承或显式指定 Stretch 才能控制交叉轴尺寸。
            bool crossAxisStretch = parentStyle != null &&
                                    (style.alignSelf == Align.Stretch ||
                                     style.alignSelf == Align.Auto && parentStyle.alignItems == Align.Stretch);
            // 明确的 inline 尺寸会覆盖交叉轴 stretch；Auto/Null 表示仍由 Flex 计算。
            bool crossAxisSizeIsExplicit = HasExplicitInlineSize(element, !parentUsesRowAxis);
            crossAxisStretch &= !crossAxisSizeIsExplicit;
            bool mainAxisFlexible = style.flexGrow > 0f || style.flexShrink > 0f;
            widthDriven = participatesInFlex && (parentUsesRowAxis ? mainAxisFlexible : crossAxisStretch);
            heightDriven = participatesInFlex && (parentUsesRowAxis ? crossAxisStretch : mainAxisFlexible);
        }

        /// <summary>仅在某项属性没有任何有效动态写入者时登记其 RectTransform 固定配置。</summary>
        private static void AddRectTransformFallback(
            List<string> positionWriters,
            List<string> widthWriters,
            List<string> heightWriters)
        {
            AddFallback(positionWriters);
            AddFallback(widthWriters);
            AddFallback(heightWriters);
        }

        /// <summary>在指定轴缺少动态写入者时记录实际 RectTransform 固定配置。</summary>
        private static void AddFallback(List<string> writers)
        {
            if (writers.Count == 0)
            {
                writers.Add(RectTransformWriter);
            }
        }

        /// <summary>根据父级布局器类型和实际选项计算其控制的子项尺寸轴。</summary>
        private static void GetParentLayoutSizeAxes(LayoutGroup group, out bool widthDriven, out bool heightDriven)
        {
            GridLayoutGroup grid = group as GridLayoutGroup;
            if (grid != null)
            {
                widthDriven = true;
                heightDriven = true;
                return;
            }

            HorizontalOrVerticalLayoutGroup linear = group as HorizontalOrVerticalLayoutGroup;
            // ForceExpand 只影响分配与位置；RectTransform 尺寸由 childControl 明确接管时才算父布局写入。
            widthDriven = linear != null && linear.childControlWidth;
            heightDriven = linear != null && linear.childControlHeight;
        }

        /// <summary>检查活动 LayoutElement 是否要求父级布局器忽略目标。</summary>
        private static bool IsIgnoredByParentLayout(GameObject target)
        {
            LayoutElement layoutElement = target.GetComponent<LayoutElement>();
            return layoutElement != null && layoutElement.isActiveAndEnabled && layoutElement.ignoreLayout;
        }

        /// <summary>按实际 AspectRatioFitter 模式向其会改写的位置或尺寸轴登记来源。</summary>
        private static void AddAspectRatioFitterWriters(AspectRatioFitter fitter, LayoutComponentSnapshot snapshot)
        {
            if (fitter == null || !fitter.isActiveAndEnabled)
            {
                return;
            }

            if (fitter.aspectMode == AspectRatioFitter.AspectMode.FitInParent ||
                fitter.aspectMode == AspectRatioFitter.AspectMode.EnvelopeParent)
            {
                // 这两种模式会重写锚点、位置和两个尺寸轴，需与父级布局冲突一并保留。
                snapshot.positionWriters.Add(AspectRatioFitterWriter);
                snapshot.widthWriters.Add(AspectRatioFitterWriter);
                snapshot.heightWriters.Add(AspectRatioFitterWriter);
                return;
            }

            if (fitter.aspectMode == AspectRatioFitter.AspectMode.WidthControlsHeight)
            {
                snapshot.heightWriters.Add(AspectRatioFitterWriter);
            }
            else if (fitter.aspectMode == AspectRatioFitter.AspectMode.HeightControlsWidth)
            {
                snapshot.widthWriters.Add(AspectRatioFitterWriter);
            }
        }

        /// <summary>将 Unity Vector2 转换为可序列化 DTO。</summary>
        private static LayoutVector2 ToVectorSnapshot(Vector2 value)
        {
            return new LayoutVector2 { x = value.x, y = value.y };
        }

        /// <summary>将 Unity Vector2 尺寸转换为可序列化 DTO。</summary>
        private static LayoutSize ToSizeSnapshot(Vector2 value)
        {
            return new LayoutSize { width = value.x, height = value.y };
        }

        /// <summary>将一个有效的基础布局写入者追加到属性轴。</summary>
        private static void AddWriter(List<string> writers, string writer)
        {
            writers.Add(writer);
        }

        /// <summary>检查数值不是 NaN 或无穷大。</summary>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        /// <summary>判断 UI Toolkit 元素是否具有明确的 inline 交叉轴尺寸。</summary>
        private static bool HasExplicitInlineSize(VisualElement element, bool widthAxis)
        {
            // resolvedStyle 不公开 USS 规则来源；这里只识别 inline 固定值，不解析 USS 选择器。
            StyleLength value = widthAxis ? element.style.width : element.style.height;
            return value.keyword != StyleKeyword.Null && value.keyword != StyleKeyword.Auto;
        }
    }
}
