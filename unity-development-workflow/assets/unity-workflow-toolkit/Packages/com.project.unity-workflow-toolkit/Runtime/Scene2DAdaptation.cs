using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>
    /// 定义 2D 场景采用竖屏宽度基准或横屏高度基准。
    /// </summary>
    public enum Scene2DOrientation
    {
        Portrait,
        Landscape
    }

    /// <summary>
    /// 描述目标分辨率相对参考画面的可见结果。
    /// </summary>
    public enum Scene2DAdaptationOutcome
    {
        Exact,
        LeftRightBands,
        TopBottomBands,
        Crop
    }

    /// <summary>
    /// 保存一次 2D 屏幕适配的确定性计算结果。
    /// </summary>
    public readonly struct Scene2DAdaptationLayout
    {
        /// <summary>
        /// 创建不可变的适配计算结果。
        /// </summary>
        public Scene2DAdaptationLayout(
            float orthographicSize,
            float visibleWidth,
            float visibleHeight,
            float contentWidth,
            float contentHeight,
            float bandThicknessPerSide,
            float panelMatch,
            Scene2DAdaptationOutcome outcome)
        {
            OrthographicSize = orthographicSize;
            VisibleWidth = visibleWidth;
            VisibleHeight = visibleHeight;
            ContentWidth = contentWidth;
            ContentHeight = contentHeight;
            BandThicknessPerSide = bandThicknessPerSide;
            PanelMatch = panelMatch;
            Outcome = outcome;
        }

        /// <summary>获取正交摄像机垂直半尺寸。</summary>
        public float OrthographicSize { get; }

        /// <summary>获取目标窗口在世界空间中的可见宽度。</summary>
        public float VisibleWidth { get; }

        /// <summary>获取目标窗口在世界空间中的可见高度。</summary>
        public float VisibleHeight { get; }

        /// <summary>获取参考内容在世界空间中的宽度。</summary>
        public float ContentWidth { get; }

        /// <summary>获取参考内容在世界空间中的高度。</summary>
        public float ContentHeight { get; }

        /// <summary>获取每一侧装饰边带的世界空间厚度。</summary>
        public float BandThicknessPerSide { get; }

        /// <summary>获取 UI Toolkit Match Width or Height 参数。</summary>
        public float PanelMatch { get; }

        /// <summary>获取当前目标比例的适配结果。</summary>
        public Scene2DAdaptationOutcome Outcome { get; }
    }

    /// <summary>
    /// 提供与 Unity 状态无关的 2D 方向基准适配计算。
    /// </summary>
    public static class Scene2DAdaptationCalculator
    {
        private const float AspectTolerance = 0.000001f;

        /// <summary>
        /// 按方向、参考分辨率和目标分辨率计算摄像机及边带布局。
        /// </summary>
        public static Scene2DAdaptationLayout Calculate(
            Scene2DOrientation orientation,
            Vector2Int referenceResolution,
            float pixelsPerUnit,
            int screenWidth,
            int screenHeight)
        {
            ValidateArguments(orientation, referenceResolution, pixelsPerUnit, screenWidth, screenHeight);

            float targetAspect = (float)screenWidth / screenHeight;
            float referenceAspect = (float)referenceResolution.x / referenceResolution.y;
            float contentWidth = referenceResolution.x / pixelsPerUnit;
            float contentHeight = referenceResolution.y / pixelsPerUnit;
            float orthographicSize;
            float visibleWidth;
            float visibleHeight;
            float bandThickness;
            Scene2DAdaptationOutcome outcome;

            if (orientation == Scene2DOrientation.Portrait)
            {
                // 竖屏固定设计宽度；窄屏露出上下背景，宽屏裁掉设计内容的上下部分。
                visibleWidth = contentWidth;
                visibleHeight = visibleWidth / targetAspect;
                orthographicSize = visibleHeight * 0.5f;
                bandThickness = Mathf.Max(0f, (visibleHeight - contentHeight) * 0.5f);
                outcome = ResolvePortraitOutcome(targetAspect, referenceAspect);
                return new Scene2DAdaptationLayout(
                    orthographicSize,
                    visibleWidth,
                    visibleHeight,
                    contentWidth,
                    contentHeight,
                    bandThickness,
                    0f,
                    outcome);
            }

            // 横屏固定设计高度；宽屏露出左右背景，窄屏裁掉设计内容的左右部分。
            visibleHeight = contentHeight;
            visibleWidth = visibleHeight * targetAspect;
            orthographicSize = visibleHeight * 0.5f;
            bandThickness = Mathf.Max(0f, (visibleWidth - contentWidth) * 0.5f);
            outcome = ResolveLandscapeOutcome(targetAspect, referenceAspect);
            return new Scene2DAdaptationLayout(
                orthographicSize,
                visibleWidth,
                visibleHeight,
                contentWidth,
                contentHeight,
                bandThickness,
                1f,
                outcome);
        }

        /// <summary>
        /// 检查计算参数及方向对应的唯一参考分辨率，阻止错误配置静默产生错误画面。
        /// </summary>
        private static void ValidateArguments(
            Scene2DOrientation orientation,
            Vector2Int referenceResolution,
            float pixelsPerUnit,
            int screenWidth,
            int screenHeight)
        {
            if (referenceResolution.x <= 0 || referenceResolution.y <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(referenceResolution), "参考分辨率必须为正数。");
            }

            if (pixelsPerUnit <= 0f || screenWidth <= 0 || screenHeight <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(pixelsPerUnit), "PPU 与目标分辨率必须为正数。");
            }

            Vector2Int expectedReferenceResolution;
            if (orientation == Scene2DOrientation.Portrait)
            {
                expectedReferenceResolution = new Vector2Int(1080, 1920);
            }
            else if (orientation == Scene2DOrientation.Landscape)
            {
                expectedReferenceResolution = new Vector2Int(1920, 1080);
            }
            else
            {
                throw new ArgumentOutOfRangeException(nameof(orientation), "2D 场景方向无效。");
            }

            if (referenceResolution != expectedReferenceResolution)
            {
                string direction = orientation == Scene2DOrientation.Portrait ? "竖屏" : "横屏";
                throw new ArgumentException(
                    $"{direction}参考分辨率必须为 {expectedReferenceResolution.x}x{expectedReferenceResolution.y}。",
                    nameof(referenceResolution));
            }
        }

        /// <summary>
        /// 根据目标比例判断竖屏固定宽度后是否需要上下边带或裁切外围。
        /// </summary>
        private static Scene2DAdaptationOutcome ResolvePortraitOutcome(float targetAspect, float referenceAspect)
        {
            if (Mathf.Abs(targetAspect - referenceAspect) <= AspectTolerance)
            {
                return Scene2DAdaptationOutcome.Exact;
            }

            return targetAspect < referenceAspect
                ? Scene2DAdaptationOutcome.TopBottomBands
                : Scene2DAdaptationOutcome.Crop;
        }

        /// <summary>
        /// 根据目标比例判断横屏固定高度后是否需要左右边带或裁切外围。
        /// </summary>
        private static Scene2DAdaptationOutcome ResolveLandscapeOutcome(float targetAspect, float referenceAspect)
        {
            if (Mathf.Abs(targetAspect - referenceAspect) <= AspectTolerance)
            {
                return Scene2DAdaptationOutcome.Exact;
            }

            return targetAspect > referenceAspect
                ? Scene2DAdaptationOutcome.LeftRightBands
                : Scene2DAdaptationOutcome.Crop;
        }
    }

    /// <summary>
    /// 将确定性适配结果应用到正交摄像机、UI Toolkit 与纯视觉边带。
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class Adaptive2DViewport : MonoBehaviour
    {
        [SerializeField] private Camera targetCamera;
        [SerializeField] private Scene2DOrientation orientation = Scene2DOrientation.Portrait;
        [SerializeField] private Vector2Int referenceResolution = new Vector2Int(1080, 1920);
        [SerializeField] private float pixelsPerUnit = 100f;
        [SerializeField] private PanelSettings[] panelSettings = Array.Empty<PanelSettings>();
        [SerializeField] private SpriteRenderer firstDecorativeBand;
        [SerializeField] private SpriteRenderer secondDecorativeBand;
        [SerializeField] private string decorativeSortingLayerName = "Default";
        [SerializeField] private int decorativeSortingOrder = -32000;
        [SerializeField] private string gameplaySortingLayerName = "Default";
        [SerializeField] private int minimumGameplaySortingOrder;
        [SerializeField, Range(0.99f, 1f)] private float minimumVisibleAlpha = 0.99f;

        private int appliedWidth;
        private int appliedHeight;

        /// <summary>获取当前方向。</summary>
        public Scene2DOrientation Orientation => orientation;

        /// <summary>获取参考分辨率。</summary>
        public Vector2Int ReferenceResolution => referenceResolution;

        /// <summary>获取目标摄像机。</summary>
        public Camera TargetCamera => targetCamera;

        /// <summary>获取第一张装饰边带，供 Editor 证据校验读取。</summary>
        public SpriteRenderer FirstDecorativeBand => firstDecorativeBand;

        /// <summary>获取第二张装饰边带，供 Editor 证据校验读取。</summary>
        public SpriteRenderer SecondDecorativeBand => secondDecorativeBand;

        /// <summary>获取最低可见 Alpha 阈值。</summary>
        public float MinimumVisibleAlpha => minimumVisibleAlpha;

        /// <summary>
        /// 组件启用时立即应用当前窗口，避免第一帧出现清屏色边缘。
        /// </summary>
        private void OnEnable()
        {
            // 运行时首帧立即应用；EditMode 由显式校验/测试入口驱动，避免未完成序列化时误报。
            if (Application.isPlaying)
            {
                ApplyCurrentResolution();
            }
        }

        /// <summary>
        /// 仅在目标窗口尺寸变化时重算，避免每帧重复修改资源和 Transform。
        /// </summary>
        private void LateUpdate()
        {
            if (Application.isPlaying && (Screen.width != appliedWidth || Screen.height != appliedHeight))
            {
                ApplyCurrentResolution();
            }
        }

        /// <summary>
        /// 使用当前 Screen 分辨率应用适配。
        /// </summary>
        public void ApplyCurrentResolution()
        {
            ApplyResolution(Screen.width, Screen.height);
        }

        /// <summary>
        /// 应用指定目标分辨率，便于 EditMode 和设备矩阵复用同一入口。
        /// </summary>
        public void ApplyResolution(int screenWidth, int screenHeight)
        {
            if (!TryValidateConfiguration(out string error))
            {
                Debug.LogError("2D 场景适配配置无效：" + error, this);
                return;
            }

            Scene2DAdaptationLayout layout = Scene2DAdaptationCalculator.Calculate(
                orientation,
                referenceResolution,
                pixelsPerUnit,
                screenWidth,
                screenHeight);
            targetCamera.rect = new Rect(0f, 0f, 1f, 1f);
            targetCamera.orthographicSize = layout.OrthographicSize;
            ApplyPanelSettings(layout.PanelMatch);
            ApplyDecorativeBands(layout);
            appliedWidth = screenWidth;
            appliedHeight = screenHeight;
        }

        /// <summary>
        /// 校验摄像机、方向、面板与边带是否满足严格的纯视觉约束。
        /// </summary>
        public bool TryValidateConfiguration(out string error)
        {
            if (targetCamera == null || !targetCamera.orthographic)
            {
                error = "必须指定正交摄像机。";
                return false;
            }

            if (Quaternion.Angle(targetCamera.transform.rotation, Quaternion.identity) > 0.01f)
            {
                error = "目标摄像机必须沿世界 Z 轴观察 2D 平面。";
                return false;
            }

            try
            {
                Scene2DAdaptationCalculator.Calculate(orientation, referenceResolution, pixelsPerUnit, 1, 1);
            }
            catch (ArgumentException exception)
            {
                error = exception.Message;
                return false;
            }

            if (panelSettings == null || panelSettings.Length == 0 || Array.Exists(panelSettings, panel => panel == null))
            {
                error = "至少需要一个有效的 UI Toolkit PanelSettings。";
                return false;
            }

            if (!IsPureVisualBand(firstDecorativeBand) || !IsPureVisualBand(secondDecorativeBand))
            {
                error = "两张边带必须存在 Sprite，且对象层级只能包含 Transform 与 SpriteRenderer。";
                return false;
            }

            if (!TryValidateSortingPolicy(out error))
            {
                return false;
            }

            if (!TryValidateBandRenderer(firstDecorativeBand, out error) ||
                !TryValidateBandRenderer(secondDecorativeBand, out error))
            {
                return false;
            }

            error = string.Empty;
            return true;
        }

        /// <summary>
        /// 校验当前启用的两张边带确实处于激活、可见且后景渲染状态。
        /// </summary>
        public bool TryValidateVisibleBands(out string error)
        {
            if (!TryValidateConfiguration(out error))
            {
                return false;
            }

            if (!firstDecorativeBand.gameObject.activeInHierarchy ||
                !secondDecorativeBand.gameObject.activeInHierarchy)
            {
                error = "目标分辨率产生边带时，两张装饰背景必须同时激活。";
                return false;
            }

            error = string.Empty;
            return true;
        }

        /// <summary>
        /// 判断边带层级是否没有 Collider、脚本或其他可交互组件。
        /// </summary>
        public static bool IsPureVisualBand(SpriteRenderer renderer)
        {
            if (renderer == null || renderer.sprite == null || renderer.transform.parent != null)
            {
                return false;
            }

            foreach (Component component in renderer.GetComponentsInChildren<Component>(true))
            {
                if (!(component is Transform) && !(component is SpriteRenderer))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// 校验装饰排序层相对玩法排序层确实处于后方。
        /// </summary>
        private bool TryValidateSortingPolicy(out string error)
        {
            if (!TryGetSortingLayerValue(decorativeSortingLayerName, out int decorativeLayerValue) ||
                !TryGetSortingLayerValue(gameplaySortingLayerName, out int gameplayLayerValue))
            {
                error = "装饰或玩法 Sorting Layer 不存在。";
                return false;
            }

            bool isBehind = decorativeLayerValue < gameplayLayerValue ||
                            decorativeLayerValue == gameplayLayerValue &&
                            decorativeSortingOrder < minimumGameplaySortingOrder;
            if (!isBehind)
            {
                error = "装饰边带的 Sorting Layer/Order 必须严格位于玩法内容后方。";
                return false;
            }

            error = string.Empty;
            return true;
        }

        /// <summary>
        /// 校验单张边带不会因禁用、透明、相机剔除或排序错误而露出清屏色。
        /// </summary>
        private bool TryValidateBandRenderer(SpriteRenderer renderer, out string error)
        {
            if (!renderer.enabled)
            {
                error = "装饰边带 SpriteRenderer 必须启用。";
                return false;
            }

            if (renderer.color.a < minimumVisibleAlpha)
            {
                error = "装饰边带 Alpha 低于最低可见阈值。";
                return false;
            }

            Material material = renderer.sharedMaterial;
            if (material == null || material.shader == null || !material.shader.isSupported)
            {
                error = "装饰边带必须使用当前平台支持的有效材质。";
                return false;
            }

            if (material.HasProperty("_Color") && material.GetColor("_Color").a < minimumVisibleAlpha)
            {
                error = "装饰边带材质 Alpha 低于不透明背景阈值。";
                return false;
            }

            if ((targetCamera.cullingMask & (1 << renderer.gameObject.layer)) == 0)
            {
                error = "装饰边带所在 Layer 被目标摄像机剔除。";
                return false;
            }

            if (!string.Equals(renderer.sortingLayerName, decorativeSortingLayerName, StringComparison.Ordinal) ||
                renderer.sortingOrder != decorativeSortingOrder)
            {
                error = "装饰边带必须使用声明的背景 Sorting Layer/Order。";
                return false;
            }

            error = string.Empty;
            return true;
        }

        /// <summary>
        /// 查找 Sorting Layer 的渲染值，并区分不存在与默认层值为零。
        /// </summary>
        private static bool TryGetSortingLayerValue(string layerName, out int value)
        {
            foreach (SortingLayer layer in SortingLayer.layers)
            {
                if (string.Equals(layer.name, layerName, StringComparison.Ordinal))
                {
                    value = layer.value;
                    return true;
                }
            }

            value = 0;
            return false;
        }

        /// <summary>
        /// 写入 Unity 官方 Match Width or Height 口径：竖屏固定宽度为 0，横屏固定高度为 1。
        /// </summary>
        private void ApplyPanelSettings(float panelMatch)
        {
            foreach (PanelSettings panel in panelSettings)
            {
                panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                panel.match = panelMatch;
                panel.referenceResolution = referenceResolution;
            }
        }

        /// <summary>
        /// 仅在存在边带时启用对应两张图；裁切和同宽高比场景不显示边带。
        /// </summary>
        private void ApplyDecorativeBands(Scene2DAdaptationLayout layout)
        {
            firstDecorativeBand.gameObject.SetActive(false);
            secondDecorativeBand.gameObject.SetActive(false);
            if (layout.Outcome == Scene2DAdaptationOutcome.LeftRightBands)
            {
                float centerOffset = layout.ContentWidth * 0.5f + layout.BandThicknessPerSide * 0.5f;
                ConfigureBand(firstDecorativeBand, -centerOffset, 0f, layout.BandThicknessPerSide, layout.VisibleHeight);
                ConfigureBand(secondDecorativeBand, centerOffset, 0f, layout.BandThicknessPerSide, layout.VisibleHeight);
            }
            else if (layout.Outcome == Scene2DAdaptationOutcome.TopBottomBands)
            {
                float centerOffset = layout.ContentHeight * 0.5f + layout.BandThicknessPerSide * 0.5f;
                ConfigureBand(firstDecorativeBand, 0f, centerOffset, layout.VisibleWidth, layout.BandThicknessPerSide);
                ConfigureBand(secondDecorativeBand, 0f, -centerOffset, layout.VisibleWidth, layout.BandThicknessPerSide);
            }
        }

        /// <summary>
        /// 将单张纯视觉图片铺满一侧边带矩形，并保留其既有 Z 与排序设置。
        /// </summary>
        private void ConfigureBand(SpriteRenderer renderer, float offsetX, float offsetY, float width, float height)
        {
            Vector2 spriteSize = renderer.sprite.bounds.size;
            if (spriteSize.x <= 0f || spriteSize.y <= 0f)
            {
                throw new InvalidOperationException("边带 Sprite 尺寸必须为正数。");
            }

            Vector3 cameraPosition = targetCamera.transform.position;
            Vector3 rendererPosition = renderer.transform.position;
            renderer.transform.position = new Vector3(
                cameraPosition.x + offsetX,
                cameraPosition.y + offsetY,
                rendererPosition.z);
            renderer.transform.localScale = new Vector3(width / spriteSize.x, height / spriteSize.y, 1f);
            renderer.gameObject.SetActive(true);
        }
    }
}
