using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Runtime;
using Project.UnityWorkflow.VisualQA;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>验证布局快照取自真实 uGUI 组件、实际参照关系及活动层级。</summary>
    public sealed class LayoutComponentSnapshotTests
    {
        private string testScenePath;
        private string taskId;
        private string evidenceRoot;
        private readonly List<string> createdFiles = new List<string>();
        private SceneSetup[] originalSceneSetup = Array.Empty<SceneSetup>();

        /// <summary>创建并保存隔离场景，确保编辑器稳定性门禁可读取实际场景。</summary>
        [SetUp]
        public void SetUp()
        {
            originalSceneSetup = EditorSceneManager.GetSceneManagerSetup();
            taskId = "layout-snapshot-test-" + Guid.NewGuid().ToString("N");
            evidenceRoot = "Artifacts/Visual/" + taskId;
            testScenePath = "Assets/__UWTLayoutSnapshot-" + Guid.NewGuid().ToString("N") + ".unity";
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Assert.That(EditorSceneManager.SaveScene(scene, testScenePath), Is.True);
        }

        /// <summary>恢复原场景并清理本测试创建的场景、报告与图片资产。</summary>
        [TearDown]
        public void TearDown()
        {
            if (originalSceneSetup.Length > 0)
            {
                EditorSceneManager.RestoreSceneManagerSetup(originalSceneSetup);
            }
            else
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            }

            AssetDatabase.DeleteAsset(testScenePath);
            for (int index = 0; index < createdFiles.Count; index++)
            {
                string path = createdFiles[index];
                if (path.StartsWith("Assets/", StringComparison.Ordinal))
                {
                    AssetDatabase.DeleteAsset(path);
                    continue;
                }

                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }

            DeleteEmptyEvidenceDirectory();
            AssetDatabase.Refresh();
        }

        /// <summary>验证同一轴保留多个真实写入者、不同轴可由不同组件分别控制。</summary>
        [Test]
        public void MeasureUguiSnapshot_PreservesConflictingWritersAndIndependentAxes()
        {
            RectTransform target = CreateUguiHierarchy();
            HorizontalLayoutGroup parentGroup = target.parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            parentGroup.childControlWidth = true;
            parentGroup.childControlHeight = false;
            parentGroup.childForceExpandWidth = false;
            parentGroup.childForceExpandHeight = false;

            ContentSizeFitter fitter = target.gameObject.AddComponent<ContentSizeFitter>();
            fitter.horizontalFit = ContentSizeFitter.FitMode.Unconstrained;
            fitter.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            Animator animator = target.gameObject.AddComponent<Animator>();
            LayoutWriterRegistration registration = target.gameObject.AddComponent<LayoutWriterRegistration>();
            registration.entries.Add(new LayoutWriterRegistrationEntry
            {
                writer = animator,
                driver = LayoutWriterDriver.Animation,
                width = true
            });

            SaveCurrentScene();
            LayoutMeasurementReport report = Measure("multi-writer.json", new LayoutMeasurementTarget
            {
                id = "card",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel"
            });

            Assert.That(report.status, Is.EqualTo("MEASURED"));
            Assert.That(report.measurements, Has.Count.EqualTo(1));
            LayoutComponentSnapshot snapshot = report.measurements[0].componentSnapshot;
            Assert.That(snapshot.active, Is.True);
            Assert.That(snapshot.positionWriters, Is.EqualTo(new[] { "LAYOUT_GROUP" }));
            Assert.That(snapshot.widthWriters, Is.EqualTo(new[] { "LAYOUT_GROUP", "ANIMATION" }));
            Assert.That(snapshot.heightWriters, Is.EqualTo(new[] { "CONTENT_SIZE_FITTER" }));
            Assert.That(snapshot.parentLayoutGroup.type, Is.EqualTo("HorizontalLayoutGroup"));
            Assert.That(snapshot.parentLayoutGroup.childControlWidth, Is.True);
            Assert.That(snapshot.parentLayoutGroup.childControlHeight, Is.False);
            Assert.That(snapshot.contentSizeFitter.horizontalFit, Is.EqualTo("Unconstrained"));
            Assert.That(snapshot.contentSizeFitter.verticalFit, Is.EqualTo("PreferredSize"));
            Assert.That(snapshot.externalWriters, Has.Count.EqualTo(1));
            Assert.That(snapshot.externalWriters[0].ownerType, Does.Contain("Animator"));
            Assert.That(snapshot.externalWriters[0].active, Is.True);
        }

        /// <summary>验证 FitInParent 会与父布局器同时写入位置和两条尺寸轴。</summary>
        [Test]
        public void MeasureUguiSnapshot_AspectRatioFitterReportsPositionAndSizeConflicts()
        {
            RectTransform target = CreateUguiHierarchy();
            target.parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            AspectRatioFitter fitter = target.gameObject.AddComponent<AspectRatioFitter>();
            fitter.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            fitter.aspectRatio = 1.5f;
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("aspect-ratio-conflicts.json", new LayoutMeasurementTarget
            {
                id = "aspect-card",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel"
            });

            LayoutComponentSnapshot snapshot = report.measurements[0].componentSnapshot;
            Assert.That(snapshot.positionWriters, Is.EqualTo(new[] { "LAYOUT_GROUP", "ASPECT_RATIO_FITTER" }));
            Assert.That(snapshot.widthWriters, Does.Contain("ASPECT_RATIO_FITTER"));
            Assert.That(snapshot.heightWriters, Does.Contain("ASPECT_RATIO_FITTER"));
            Assert.That(snapshot.aspectRatioFitter.enabled, Is.True);
            Assert.That(snapshot.aspectRatioFitter.aspectMode, Is.EqualTo("FitInParent"));
            Assert.That(snapshot.aspectRatioFitter.aspectRatio, Is.EqualTo(1.5f));
        }

        /// <summary>验证 LayoutElement.ignoreLayout 会停用父布局写入并恢复固定 RectTransform 来源。</summary>
        [Test]
        public void MeasureUguiSnapshot_IgnoreLayoutUsesRectTransformFallback()
        {
            RectTransform target = CreateUguiHierarchy();
            HorizontalLayoutGroup parentGroup = target.parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            parentGroup.childControlWidth = true;
            parentGroup.childControlHeight = true;
            LayoutElement layoutElement = target.gameObject.AddComponent<LayoutElement>();
            layoutElement.ignoreLayout = true;
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("ignore-layout.json", new LayoutMeasurementTarget
            {
                id = "ignored-card",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel"
            });

            LayoutComponentSnapshot snapshot = report.measurements[0].componentSnapshot;
            Assert.That(snapshot.positionWriters, Is.EqualTo(new[] { "RECT_TRANSFORM" }));
            Assert.That(snapshot.widthWriters, Is.EqualTo(new[] { "RECT_TRANSFORM" }));
            Assert.That(snapshot.heightWriters, Is.EqualTo(new[] { "RECT_TRANSFORM" }));
        }

        /// <summary>验证仅强制扩展不会被误报为父布局器直接写入子项尺寸。</summary>
        [Test]
        public void MeasureUguiSnapshot_ForceExpandWithoutChildControlKeepsRectTransformSizeWriter()
        {
            RectTransform target = CreateUguiHierarchy();
            HorizontalLayoutGroup parentGroup = target.parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            parentGroup.childControlWidth = false;
            parentGroup.childControlHeight = false;
            parentGroup.childForceExpandWidth = true;
            parentGroup.childForceExpandHeight = true;
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("force-expand-only.json", new LayoutMeasurementTarget
            {
                id = "expanded-card",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel"
            });

            LayoutComponentSnapshot snapshot = report.measurements[0].componentSnapshot;
            Assert.That(snapshot.positionWriters, Is.EqualTo(new[] { "LAYOUT_GROUP" }));
            Assert.That(snapshot.widthWriters, Is.EqualTo(new[] { "RECT_TRANSFORM" }));
            Assert.That(snapshot.heightWriters, Is.EqualTo(new[] { "RECT_TRANSFORM" }));
        }

        /// <summary>验证非直接父级的兄弟 RectTransform 被同 Canvas 真实测量为参照。</summary>
        [Test]
        public void MeasureUguiSnapshot_UsesSiblingReferenceGeometry()
        {
            RectTransform target = CreateUguiHierarchy();
            RectTransform reference = CreateSibling(target.parent as RectTransform, "Reference", 170f);
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("sibling-reference.json", new LayoutMeasurementTarget
            {
                id = "card",
                referenceId = "reference-node",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel",
                referenceObjectPath = "Canvas/Panel/Reference"
            });

            LayoutMeasurementItem item = report.measurements[0];
            Assert.That(item.referenceId, Is.EqualTo("reference-node"));
            Assert.That(item.referencePath, Is.EqualTo("Canvas/Panel/Reference"));
            Assert.That(item.referenceRect, Is.Not.Null);
            Assert.That(item.referenceRect.width, Is.EqualTo(reference.rect.width).Within(0.1f));
            Assert.That(item.referenceRect.height, Is.EqualTo(reference.rect.height).Within(0.1f));
            Assert.That(item.referenceRect.x, Is.Not.EqualTo(item.parentRect.x).Within(0.1f));
        }

        /// <summary>验证 inactive parent 与 inactive child 都产生空几何和无有效写入者的快照。</summary>
        [Test]
        public void MeasureUguiSnapshot_InactiveParentAndChildHaveNoMeasuredGeometryOrWriters()
        {
            RectTransform activeTarget = CreateUguiHierarchy();
            RectTransform panel = activeTarget.parent as RectTransform;
            RectTransform inactiveParent = new GameObject("Closed", typeof(RectTransform)).GetComponent<RectTransform>();
            inactiveParent.SetParent(panel, false);
            RectTransform underInactiveParent = new GameObject("NestedCard", typeof(RectTransform)).GetComponent<RectTransform>();
            underInactiveParent.SetParent(inactiveParent, false);
            underInactiveParent.sizeDelta = new Vector2(32f, 21f);
            inactiveParent.gameObject.SetActive(false);

            RectTransform inactiveChild = new GameObject("InactiveCard", typeof(RectTransform)).GetComponent<RectTransform>();
            inactiveChild.SetParent(panel, false);
            inactiveChild.sizeDelta = new Vector2(24f, 18f);
            inactiveChild.gameObject.SetActive(false);
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("inactive-objects.json", new LayoutMeasurementTarget
            {
                id = "parent-hidden-card",
                referenceId = "closed-reference",
                objectPath = "Canvas/Panel/Closed/NestedCard",
                parentObjectPath = "Canvas/Panel/Closed"
            }, new LayoutMeasurementTarget
            {
                id = "inactive-child",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/InactiveCard",
                parentObjectPath = "Canvas/Panel"
            });

            Assert.That(report.measurements, Has.Count.EqualTo(2));
            foreach (LayoutMeasurementItem item in report.measurements)
            {
                Assert.That(item.status, Is.EqualTo("INACTIVE"));
                Assert.That(item.actualRect, Is.Null);
                Assert.That(item.margins, Is.Null);
                Assert.That(item.componentSnapshot.active, Is.False);
                Assert.That(item.componentSnapshot.positionWriters, Is.Empty);
                Assert.That(item.componentSnapshot.widthWriters, Is.Empty);
                Assert.That(item.componentSnapshot.heightWriters, Is.Empty);
            }

            Assert.That(report.measurements[0].referenceRect, Is.Null);
            Assert.That(report.measurements[1].referenceRect, Is.Not.Null);
            Assert.That(report.viewportRect, Is.Not.Null);
            Assert.That(report.safeAreaRect, Is.Not.Null);
        }

        /// <summary>验证 Image 源像素、PPU、边框及原生尺寸来自持久 Sprite 实际数据。</summary>
        [Test]
        public void MeasureUguiSnapshot_ImageNativeSizeUsesImagePixelsPerUnitWithoutMultiplier()
        {
            const string texturePath = "Assets/__UWTLayoutSnapshotSprite.png";
            const string overrideTexturePath = "Assets/__UWTLayoutSnapshotOverrideSprite.png";
            createdFiles.Add(texturePath);
            createdFiles.Add(overrideTexturePath);
            var source = new Texture2D(100, 50, TextureFormat.RGBA32, false);
            File.WriteAllBytes(texturePath, source.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(source);
            AssetDatabase.ImportAsset(texturePath, ImportAssetOptions.ForceUpdate);
            TextureImporter importer = AssetImporter.GetAtPath(texturePath) as TextureImporter;
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Single;
            importer.spritePixelsPerUnit = 50f;
            importer.SaveAndReimport();
            Sprite sprite = AssetDatabase.LoadAssetAtPath<Sprite>(texturePath);
            Assert.That(sprite, Is.Not.Null);

            var overrideSource = new Texture2D(120, 60, TextureFormat.RGBA32, false);
            File.WriteAllBytes(overrideTexturePath, overrideSource.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(overrideSource);
            AssetDatabase.ImportAsset(overrideTexturePath, ImportAssetOptions.ForceUpdate);
            TextureImporter overrideImporter = AssetImporter.GetAtPath(overrideTexturePath) as TextureImporter;
            overrideImporter.textureType = TextureImporterType.Sprite;
            overrideImporter.spriteImportMode = SpriteImportMode.Single;
            overrideImporter.spritePixelsPerUnit = 20f;
            overrideImporter.spriteBorder = new Vector4(5f, 7f, 9f, 11f);
            overrideImporter.SaveAndReimport();
            Sprite overrideSprite = AssetDatabase.LoadAssetAtPath<Sprite>(overrideTexturePath);
            Assert.That(overrideSprite, Is.Not.Null);

            RectTransform target = CreateUguiHierarchy();
            Image image = target.gameObject.AddComponent<Image>();
            image.sprite = sprite;
            image.overrideSprite = overrideSprite;
            image.type = Image.Type.Sliced;
            image.pixelsPerUnitMultiplier = 3f;
            SaveCurrentScene();

            LayoutMeasurementReport report = Measure("image-native-size.json", new LayoutMeasurementTarget
            {
                id = "sprite-card",
                referenceId = "panel-reference",
                objectPath = "Canvas/Panel/Card",
                parentObjectPath = "Canvas/Panel"
            });

            LayoutImageSnapshot snapshot = report.measurements[0].componentSnapshot.image;
            Assert.That(snapshot, Is.Not.Null);
            Assert.That(snapshot.assetGuid, Is.Not.Empty);
            Assert.That(snapshot.localId, Is.Not.Empty);
            Assert.That(image.sprite, Is.SameAs(sprite));
            Assert.That(image.overrideSprite, Is.SameAs(overrideSprite));
            Assert.That(snapshot.assetGuid, Is.EqualTo(AssetDatabase.AssetPathToGUID(overrideTexturePath)));
            Assert.That(snapshot.sourceSize.width, Is.EqualTo(overrideSprite.rect.width));
            Assert.That(snapshot.sourceSize.height, Is.EqualTo(overrideSprite.rect.height));
            Assert.That(snapshot.pixelsPerUnit, Is.EqualTo(overrideSprite.pixelsPerUnit));
            Assert.That(snapshot.imagePixelsPerUnit, Is.EqualTo(image.pixelsPerUnit));
            Assert.That(snapshot.referencePixelsPerUnit,
                Is.EqualTo(overrideSprite.pixelsPerUnit / image.pixelsPerUnit).Within(0.001f));
            Assert.That(snapshot.pixelsPerUnitMultiplier, Is.EqualTo(3f));
            Assert.That(snapshot.type, Is.EqualTo("Sliced"));
            Assert.That(snapshot.hasBorder, Is.True);
            Assert.That(snapshot.border, Is.EqualTo(new[] { 5f, 7f, 9f, 11f }));
            Assert.That(snapshot.nativeSize.width, Is.EqualTo(overrideSprite.rect.width / image.pixelsPerUnit).Within(0.001f));
            Assert.That(snapshot.nativeSize.height, Is.EqualTo(overrideSprite.rect.height / image.pixelsPerUnit).Within(0.001f));
        }

        /// <summary>验证非零左右和上下留白映射到 Panel 根坐标时保留安全区原点。</summary>
        [Test]
        public void PanelSafeArea_MapsInsetsFromPanelRootOrigin()
        {
            // 通过反射调用 internal 采集器，避免为了纯坐标换算扩大 Toolkit 的公开 API。
            Type collectorType = typeof(LayoutMeasurementService).Assembly.GetType(
                "Project.UnityWorkflow.VisualQA.LayoutComponentSnapshotCollector");
            MethodInfo mapper = collectorType.GetMethod("CreatePanelSafeArea", BindingFlags.Public | BindingFlags.Static,
                null, new[] { typeof(Rect), typeof(SafeAreaInsets) }, null);
            Assert.That(mapper, Is.Not.Null);

            var rootBounds = new Rect(12f, 20f, 400f, 200f);
            var insets = new SafeAreaInsets(0.1f, 0.05f, 0.2f, 0.1f);
            var safeArea = (LayoutRect)mapper.Invoke(null, new object[] { rootBounds, insets });

            Assert.That(safeArea.x, Is.EqualTo(40f).Within(0.001f));
            Assert.That(safeArea.y, Is.EqualTo(40f).Within(0.001f));
            Assert.That(safeArea.width, Is.EqualTo(340f).Within(0.001f));
            Assert.That(safeArea.height, Is.EqualTo(140f).Within(0.001f));
        }

        /// <summary>保留 uGUI 快照测试专用 JSON，供主代理跨语言核验实际序列化字段。</summary>
        [Test]
        public void MeasureUguiSnapshot_WritesPersistentWireValidationReport()
        {
            RectTransform target = CreateUguiHierarchy();
            target.parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            target.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            RectTransform inactiveParent = new GameObject("Closed", typeof(RectTransform)).GetComponent<RectTransform>();
            inactiveParent.SetParent(target.parent, false);
            RectTransform inactiveTarget = new GameObject("NestedCard", typeof(RectTransform)).GetComponent<RectTransform>();
            inactiveTarget.SetParent(inactiveParent, false);
            inactiveParent.gameObject.SetActive(false);
            SaveCurrentScene();

            string wireTaskId = "ui-layout-wire-test-" + Guid.NewGuid().ToString("N");
            string wireEvidenceRoot = "Artifacts/TestResults";
            string outputPath = wireEvidenceRoot + "/ui-layout-snapshot-wire-" + Guid.NewGuid().ToString("N") + ".json";
            string absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(outputPath);
            var request = new LayoutMeasurementRequest
            {
                taskId = wireTaskId,
                candidateId = "wire-validation",
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = outputPath,
                includeComponentSnapshots = true,
                stateId = "wire-layout-state",
                evidenceRoot = wireEvidenceRoot,
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget
                    {
                        id = "wire-structure-card",
                        referenceId = "viewport",
                        referenceRoot = "viewport",
                        objectPath = "Canvas/Panel/Card",
                        parentObjectPath = "Canvas/Panel"
                    },
                    new LayoutMeasurementTarget
                    {
                        id = "closed-reference",
                        referenceId = "viewport",
                        referenceRoot = "viewport",
                        objectPath = "Canvas/Panel/Closed",
                        parentObjectPath = "Canvas/Panel"
                    },
                    new LayoutMeasurementTarget
                    {
                        id = "wire-inactive-card",
                        referenceId = "closed-reference",
                        objectPath = "Canvas/Panel/Closed/NestedCard",
                        parentObjectPath = "Canvas/Panel/Closed"
                    }
                }
            };

            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(request);

            Assert.That(report.errorCode, Is.Empty, report.message);
            Assert.That(report.measurements, Has.Count.EqualTo(3));
            Assert.That(report.measurements[0].componentSnapshot, Is.Not.Null);
            AssertRectContainedIn(report.measurements[0].parentRect, report.viewportRect);
            AssertRectContainedIn(report.measurements[0].actualRect, report.viewportRect);
            Assert.That(File.Exists(absoluteOutputPath), Is.True);

            JObject serialized = JObject.Parse(File.ReadAllText(absoluteOutputPath));
            JArray measurements = (JArray)serialized["measurements"];
            Assert.That(measurements, Has.Count.EqualTo(3));
            Assert.That(measurements[0]["componentSnapshot"]["active"].Value<bool>(), Is.True);
            Assert.That(measurements[0]["actualRect"].Type, Is.EqualTo(JTokenType.Object));
            Assert.That(measurements[0]["componentSnapshot"]["image"].Type, Is.EqualTo(JTokenType.Null));
            for (int index = 1; index < measurements.Count; index++)
            {
                Assert.That(measurements[index]["status"].Value<string>(), Is.EqualTo("INACTIVE"));
                Assert.That(measurements[index]["actualRect"].Type, Is.EqualTo(JTokenType.Null));
                Assert.That(measurements[index]["margins"].Type, Is.EqualTo(JTokenType.Null));
                Assert.That(measurements[index]["componentSnapshot"]["active"].Value<bool>(), Is.False);
                Assert.That(measurements[index]["componentSnapshot"]["widthWriters"], Is.Empty);
            }

            Assert.That(measurements[2]["referenceRect"].Type, Is.EqualTo(JTokenType.Null));
            Assert.That(measurements[2]["referenceId"].Value<string>(), Is.EqualTo("closed-reference"));
            TestContext.Progress.WriteLine("LAYOUT_SNAPSHOT_WIRE_REPORT=" + outputPath);
        }

        /// <summary>写入一个快照请求并确保只采集当前已加载场景的实际对象。</summary>
        private LayoutMeasurementReport Measure(string fileName, params LayoutMeasurementTarget[] targets)
        {
            string outputPath = evidenceRoot + "/" + fileName;
            createdFiles.Add(WorkflowPaths.ResolveProjectRelative(outputPath));
            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                candidateId = "candidate-a",
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = outputPath,
                includeComponentSnapshots = true,
                stateId = "layout-state",
                evidenceRoot = evidenceRoot,
                gapAxis = "horizontal",
                targets = new List<LayoutMeasurementTarget>(targets)
            });

            Assert.That(report.errorCode, Is.Empty, report.message);
            Assert.That(report.measurementSource, Is.EqualTo("UNITY_EDITOR_LOADED_SCENE"));
            Assert.That(report.runId, Is.Not.Empty);
            Assert.That(report.frameCount, Is.GreaterThanOrEqualTo(0));
            Assert.That(report.stateId, Is.EqualTo("layout-state"));
            Assert.That(report.includesComponentSnapshots, Is.True);
            return report;
        }

        /// <summary>创建固定尺寸的 Screen Space Overlay Canvas、直接父容器与目标。</summary>
        private RectTransform CreateUguiHierarchy()
        {
            GameObject canvasObject = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            Canvas canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            RectTransform canvasRect = canvasObject.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(Screen.width, Screen.height);

            GameObject parentObject = new GameObject("Panel", typeof(RectTransform));
            RectTransform parentRect = parentObject.GetComponent<RectTransform>();
            parentRect.SetParent(canvasRect, false);
            parentRect.anchorMin = Vector2.zero;
            parentRect.anchorMax = Vector2.one;
            parentRect.offsetMin = Vector2.zero;
            parentRect.offsetMax = Vector2.zero;

            GameObject targetObject = new GameObject("Card", typeof(RectTransform));
            RectTransform target = targetObject.GetComponent<RectTransform>();
            target.SetParent(parentRect, false);
            target.anchorMin = new Vector2(0.5f, 0.5f);
            target.anchorMax = new Vector2(0.5f, 0.5f);
            target.pivot = new Vector2(0.5f, 0.5f);
            target.anchoredPosition = new Vector2(17f, -19f);
            target.sizeDelta = new Vector2(75f, 41f);
            Canvas.ForceUpdateCanvases();
            Assert.That(EditorSceneManager.SaveScene(canvasObject.scene, testScenePath), Is.True);
            return target;
        }

        /// <summary>在父容器下创建固定尺寸的兄弟参照元素。</summary>
        private static RectTransform CreateSibling(RectTransform parent, string name, float x)
        {
            RectTransform sibling = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            sibling.SetParent(parent, false);
            sibling.anchorMin = new Vector2(0.5f, 0.5f);
            sibling.anchorMax = new Vector2(0.5f, 0.5f);
            sibling.pivot = new Vector2(0.5f, 0.5f);
            sibling.anchoredPosition = new Vector2(x, -19f);
            sibling.sizeDelta = new Vector2(75f, 41f);
            Canvas.ForceUpdateCanvases();
            return sibling;
        }

        /// <summary>确保真实 uGUI 几何没有超出当前运行时视口。</summary>
        private static void AssertRectContainedIn(LayoutRect rect, LayoutRect container)
        {
            const float epsilon = 0.001f;
            Assert.That(rect, Is.Not.Null);
            Assert.That(container, Is.Not.Null);
            Assert.That(rect.x, Is.GreaterThanOrEqualTo(container.x - epsilon));
            Assert.That(rect.y, Is.GreaterThanOrEqualTo(container.y - epsilon));
            Assert.That(rect.x + rect.width, Is.LessThanOrEqualTo(container.x + container.width + epsilon));
            Assert.That(rect.y + rect.height, Is.LessThanOrEqualTo(container.y + container.height + epsilon));
        }

        /// <summary>保存当前场景，满足测量服务只读取已保存稳定场景的前置条件。</summary>
        private void SaveCurrentScene()
        {
            Assert.That(EditorSceneManager.SaveScene(SceneManager.GetActiveScene(), testScenePath), Is.True);
        }

        /// <summary>删除本测试使用的空 evidenceRoot，不触碰其他任务的产物。</summary>
        private void DeleteEmptyEvidenceDirectory()
        {
            string directory = WorkflowPaths.ResolveProjectRelative(evidenceRoot);
            if (Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0)
            {
                Directory.Delete(directory);
            }
        }
    }
}
