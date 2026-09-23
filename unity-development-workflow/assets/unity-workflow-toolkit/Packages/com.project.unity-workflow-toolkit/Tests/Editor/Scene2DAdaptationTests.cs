using System.Collections.Generic;
using NUnit.Framework;
using Project.UnityWorkflow.ProjectValidation;
using Project.UnityWorkflow.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>
    /// 验证 2D 方向基准、边带布局和纯视觉约束。
    /// </summary>
    public sealed class Scene2DAdaptationTests
    {
        private readonly List<Object> ownedObjects = new List<Object>();

        /// <summary>
        /// 清理每个测试创建的临时 Unity 对象。
        /// </summary>
        [TearDown]
        public void TearDown()
        {
            for (int index = ownedObjects.Count - 1; index >= 0; index--)
            {
                Object.DestroyImmediate(ownedObjects[index]);
            }

            ownedObjects.Clear();
        }

        /// <summary>
        /// 竖屏固定宽度时，较窄窗口必须产生等高上下边带且 UI match 为 0。
        /// </summary>
        [Test]
        public void Calculate_PortraitNarrowerScreen_CreatesTopBottomBands()
        {
            Scene2DAdaptationLayout layout = Scene2DAdaptationCalculator.Calculate(
                Scene2DOrientation.Portrait,
                new Vector2Int(1080, 1920),
                100f,
                1080,
                2400);

            Assert.That(layout.VisibleWidth, Is.EqualTo(10.8f).Within(0.0001f));
            Assert.That(layout.VisibleHeight, Is.EqualTo(24f).Within(0.0001f));
            Assert.That(layout.OrthographicSize, Is.EqualTo(12f).Within(0.0001f));
            Assert.That(layout.Outcome, Is.EqualTo(Scene2DAdaptationOutcome.TopBottomBands));
            Assert.That(layout.BandThicknessPerSide, Is.EqualTo(2.4f).Within(0.0001f));
            Assert.That(layout.PanelMatch, Is.EqualTo(0f));
        }

        /// <summary>
        /// 横屏固定高度时，较宽窗口必须产生等宽左右边带且 UI match 为 1。
        /// </summary>
        [Test]
        public void Calculate_LandscapeWiderScreen_CreatesLeftRightBands()
        {
            Scene2DAdaptationLayout layout = Scene2DAdaptationCalculator.Calculate(
                Scene2DOrientation.Landscape,
                new Vector2Int(1920, 1080),
                100f,
                2400,
                1080);

            Assert.That(layout.VisibleWidth, Is.EqualTo(24f).Within(0.0001f));
            Assert.That(layout.VisibleHeight, Is.EqualTo(10.8f).Within(0.0001f));
            Assert.That(layout.OrthographicSize, Is.EqualTo(5.4f).Within(0.0001f));
            Assert.That(layout.Outcome, Is.EqualTo(Scene2DAdaptationOutcome.LeftRightBands));
            Assert.That(layout.BandThicknessPerSide, Is.EqualTo(2.4f).Within(0.0001f));
            Assert.That(layout.PanelMatch, Is.EqualTo(1f));
        }

        /// <summary>
        /// 目标比例与唯一设计参考比例一致时，不应产生边带或裁切。
        /// </summary>
        [TestCase(Scene2DOrientation.Portrait, 1080, 1920, 0f)]
        [TestCase(Scene2DOrientation.Landscape, 1920, 1080, 1f)]
        public void Calculate_ReferenceResolution_IsExact(
            Scene2DOrientation orientation,
            int width,
            int height,
            float expectedPanelMatch)
        {
            Scene2DAdaptationLayout layout = Scene2DAdaptationCalculator.Calculate(
                orientation,
                orientation == Scene2DOrientation.Portrait
                    ? new Vector2Int(1080, 1920)
                    : new Vector2Int(1920, 1080),
                100f,
                width,
                height);

            Assert.That(layout.Outcome, Is.EqualTo(Scene2DAdaptationOutcome.Exact));
            Assert.That(layout.BandThicknessPerSide, Is.Zero);
            Assert.That(layout.PanelMatch, Is.EqualTo(expectedPanelMatch));
        }

        /// <summary>
        /// 竖屏较宽和横屏较窄时固定边长不变，超出设计范围的另一边应裁切。
        /// </summary>
        [TestCase(Scene2DOrientation.Portrait, 1280, 1920)]
        [TestCase(Scene2DOrientation.Landscape, 1600, 1200)]
        public void Calculate_OutsideBandSide_CropsWithoutBands(
            Scene2DOrientation orientation,
            int width,
            int height)
        {
            Scene2DAdaptationLayout layout = Scene2DAdaptationCalculator.Calculate(
                orientation,
                orientation == Scene2DOrientation.Portrait
                    ? new Vector2Int(1080, 1920)
                    : new Vector2Int(1920, 1080),
                100f,
                width,
                height);

            Assert.That(layout.Outcome, Is.EqualTo(Scene2DAdaptationOutcome.Crop));
            Assert.That(layout.BandThicknessPerSide, Is.Zero);
        }

        /// <summary>
        /// 参考分辨率方向错误时必须显式失败，不能猜测或交换宽高。
        /// </summary>
        [Test]
        public void Calculate_MismatchedReferenceOrientation_Throws()
        {
            Assert.Throws<System.ArgumentException>(() => Scene2DAdaptationCalculator.Calculate(
                Scene2DOrientation.Portrait,
                new Vector2Int(1920, 1080),
                100f,
                1920,
                1080));
        }

        /// <summary>
        /// 方向正确但不符合规定值的设计分辨率也必须被拒绝。
        /// </summary>
        [TestCase(Scene2DOrientation.Portrait, 720, 1280)]
        [TestCase(Scene2DOrientation.Landscape, 1280, 720)]
        public void Calculate_NonStandardReferenceResolution_Throws(
            Scene2DOrientation orientation,
            int referenceWidth,
            int referenceHeight)
        {
            Vector2Int referenceResolution = new Vector2Int(referenceWidth, referenceHeight);

            Assert.Throws<System.ArgumentException>(() => Scene2DAdaptationCalculator.Calculate(
                orientation,
                referenceResolution,
                100f,
                referenceWidth,
                referenceHeight));
        }

        /// <summary>
        /// 应用竖屏适配后，PanelSettings 固定宽度并将两张背景放到上下边带。
        /// </summary>
        [Test]
        public void ApplyResolution_Portrait_ConfiguresPanelAndBands()
        {
            Adaptive2DViewport viewport = CreateViewport(Scene2DOrientation.Portrait, out Camera camera, out PanelSettings panel, out SpriteRenderer first, out SpriteRenderer second);

            viewport.ApplyResolution(1080, 2400);

            Assert.That(camera.rect, Is.EqualTo(new Rect(0f, 0f, 1f, 1f)));
            Assert.That(camera.orthographicSize, Is.EqualTo(12f).Within(0.0001f));
            Assert.That(panel.scaleMode, Is.EqualTo(PanelScaleMode.ScaleWithScreenSize));
            Assert.That(panel.screenMatchMode, Is.EqualTo(PanelScreenMatchMode.MatchWidthOrHeight));
            Assert.That(panel.match, Is.EqualTo(0f));
            Assert.That(panel.referenceResolution, Is.EqualTo(new Vector2Int(1080, 1920)));
            Assert.That(first.gameObject.activeSelf, Is.True);
            Assert.That(second.gameObject.activeSelf, Is.True);
            Assert.That(first.transform.position.y, Is.GreaterThan(camera.transform.position.y));
            Assert.That(second.transform.position.y, Is.LessThan(camera.transform.position.y));
            Assert.That(viewport.TryValidateVisibleBands(out string visibilityError), Is.True, visibilityError);
        }

        /// <summary>
        /// 应用横屏适配后，PanelSettings 固定高度并将两张背景放到左右边带。
        /// </summary>
        [Test]
        public void ApplyResolution_Landscape_ConfiguresPanelAndBands()
        {
            Adaptive2DViewport viewport = CreateViewport(Scene2DOrientation.Landscape, out Camera camera, out PanelSettings panel, out SpriteRenderer first, out SpriteRenderer second);

            viewport.ApplyResolution(2400, 1080);

            Assert.That(camera.orthographicSize, Is.EqualTo(5.4f).Within(0.0001f));
            Assert.That(panel.scaleMode, Is.EqualTo(PanelScaleMode.ScaleWithScreenSize));
            Assert.That(panel.screenMatchMode, Is.EqualTo(PanelScreenMatchMode.MatchWidthOrHeight));
            Assert.That(panel.match, Is.EqualTo(1f));
            Assert.That(panel.referenceResolution, Is.EqualTo(new Vector2Int(1920, 1080)));
            Assert.That(first.gameObject.activeSelf, Is.True);
            Assert.That(second.gameObject.activeSelf, Is.True);
            Assert.That(first.transform.position.x, Is.LessThan(camera.transform.position.x));
            Assert.That(second.transform.position.x, Is.GreaterThan(camera.transform.position.x));
            Assert.That(viewport.TryValidateVisibleBands(out string visibilityError), Is.True, visibilityError);
        }

        /// <summary>
        /// 任何附加 Collider 都会破坏纯视觉约束并阻止场景校验通过。
        /// </summary>
        [Test]
        public void Validate_BandWithCollider_ReturnsIssue()
        {
            Adaptive2DViewport viewport = CreateViewport(Scene2DOrientation.Portrait, out _, out _, out SpriteRenderer first, out _);
            first.gameObject.AddComponent<BoxCollider2D>();

            Scene2DAdaptationValidationIssue[] issues = new Scene2DAdaptationValidationService().Validate(new[] { viewport });

            Assert.That(issues, Has.Length.EqualTo(1));
            Assert.That(issues[0].Message, Does.Contain("只能包含"));
        }

        /// <summary>
        /// 被禁用或被相机剔除的背景必须阻止 Unity 配置证据通过。
        /// </summary>
        [Test]
        public void Validate_DisabledOrCulledBand_ReturnsIssue()
        {
            Adaptive2DViewport viewport = CreateViewport(Scene2DOrientation.Portrait, out Camera camera, out _, out SpriteRenderer first, out _);
            first.enabled = false;

            Scene2DAdaptationValidationIssue[] disabledIssues = new Scene2DAdaptationValidationService().Validate(new[] { viewport });

            Assert.That(disabledIssues, Has.Length.EqualTo(1));
            Assert.That(disabledIssues[0].Message, Does.Contain("必须启用"));

            first.enabled = true;
            camera.cullingMask &= ~(1 << first.gameObject.layer);
            Scene2DAdaptationValidationIssue[] culledIssues = new Scene2DAdaptationValidationService().Validate(new[] { viewport });
            Assert.That(culledIssues, Has.Length.EqualTo(1));
            Assert.That(culledIssues[0].Message, Does.Contain("剔除"));
        }

        /// <summary>
        /// 透明纹理和错误排序都不能作为有效背景绕过校验。
        /// </summary>
        [Test]
        public void Validate_TransparentOrForegroundBand_ReturnsIssue()
        {
            Adaptive2DViewport viewport = CreateViewport(Scene2DOrientation.Portrait, out _, out _, out SpriteRenderer first, out _);
            Texture2D texture = first.sprite.texture;
            texture.SetPixels(new[] { Color.clear, Color.clear, Color.clear, Color.clear });
            texture.Apply();

            Scene2DAdaptationValidationIssue[] transparentIssues = new Scene2DAdaptationValidationService().Validate(new[] { viewport });

            Assert.That(transparentIssues, Has.Length.EqualTo(1));
            Assert.That(transparentIssues[0].Message, Does.Contain("Alpha 覆盖率"));

            texture.SetPixels(new[] { Color.white, Color.white, Color.white, Color.white });
            texture.Apply();
            first.sortingOrder = 0;
            Scene2DAdaptationValidationIssue[] foregroundIssues = new Scene2DAdaptationValidationService().Validate(new[] { viewport });
            Assert.That(foregroundIssues, Has.Length.EqualTo(1));
            Assert.That(foregroundIssues[0].Message, Does.Contain("Sorting Layer/Order"));
        }

        /// <summary>
        /// 创建字段完整、可直接应用的 2D 适配组件。
        /// </summary>
        private Adaptive2DViewport CreateViewport(
            Scene2DOrientation requestedOrientation,
            out Camera camera,
            out PanelSettings panel,
            out SpriteRenderer first,
            out SpriteRenderer second)
        {
            GameObject viewportObject = Own(new GameObject("Viewport"));
            camera = viewportObject.AddComponent<Camera>();
            camera.orthographic = true;
            Adaptive2DViewport viewport = viewportObject.AddComponent<Adaptive2DViewport>();
            panel = Own(ScriptableObject.CreateInstance<PanelSettings>());
            first = CreateBand("FirstBand");
            second = CreateBand("SecondBand");

            Vector2Int reference = requestedOrientation == Scene2DOrientation.Portrait
                ? new Vector2Int(1080, 1920)
                : new Vector2Int(1920, 1080);
            SerializedObject serialized = new SerializedObject(viewport);
            serialized.FindProperty("targetCamera").objectReferenceValue = camera;
            serialized.FindProperty("orientation").enumValueIndex = (int)requestedOrientation;
            serialized.FindProperty("referenceResolution").vector2IntValue = reference;
            serialized.FindProperty("pixelsPerUnit").floatValue = 100f;
            SerializedProperty panels = serialized.FindProperty("panelSettings");
            panels.arraySize = 1;
            panels.GetArrayElementAtIndex(0).objectReferenceValue = panel;
            serialized.FindProperty("firstDecorativeBand").objectReferenceValue = first;
            serialized.FindProperty("secondDecorativeBand").objectReferenceValue = second;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            return viewport;
        }

        /// <summary>
        /// 创建仅含 Transform 与 SpriteRenderer 的临时纯视觉边带。
        /// </summary>
        private SpriteRenderer CreateBand(string name)
        {
            GameObject gameObject = Own(new GameObject(name));
            SpriteRenderer renderer = gameObject.AddComponent<SpriteRenderer>();
            Texture2D texture = Own(new Texture2D(2, 2));
            texture.SetPixels(new[] { Color.white, Color.white, Color.white, Color.white });
            texture.Apply();
            renderer.sprite = Own(Sprite.Create(texture, new Rect(0f, 0f, 2f, 2f), Vector2.one * 0.5f, 1f));
            renderer.sortingLayerName = "Default";
            renderer.sortingOrder = -32000;
            return renderer;
        }

        /// <summary>
        /// 登记临时 Unity 对象并保持其具体类型。
        /// </summary>
        private T Own<T>(T instance) where T : Object
        {
            ownedObjects.Add(instance);
            return instance;
        }
    }
}
