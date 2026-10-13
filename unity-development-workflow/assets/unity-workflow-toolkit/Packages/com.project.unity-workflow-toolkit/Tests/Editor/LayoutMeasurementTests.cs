using System;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.VisualQA;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>验证布局测量读取 Unity 实际几何、应用显式容差并拒绝不一致坐标空间。</summary>
    public sealed class LayoutMeasurementTests
    {
        private string testScenePath;
        private string taskId;
        private readonly List<string> createdPaths = new List<string>();
        private SceneSetup[] originalSceneSetup = Array.Empty<SceneSetup>();

        /// <summary>建立已保存的隔离场景，避免稳定状态检查被测试本身的脏场景阻断。</summary>
        [SetUp]
        public void SetUp()
        {
            originalSceneSetup = EditorSceneManager.GetSceneManagerSetup();
            taskId = "layout-test-" + Guid.NewGuid().ToString("N");
            testScenePath = "Assets/__UWTLayoutTests-" + Guid.NewGuid().ToString("N") + ".unity";
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Assert.That(EditorSceneManager.SaveScene(scene, testScenePath), Is.True);
        }

        /// <summary>恢复原有场景并删除本测试创建的文件。</summary>
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
            for (int index = 0; index < createdPaths.Count; index++)
            {
                if (File.Exists(createdPaths[index]))
                {
                    File.Delete(createdPaths[index]);
                }

                string directory = Path.GetDirectoryName(createdPaths[index]);
                if (!string.IsNullOrEmpty(directory) && Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0)
                {
                    Directory.Delete(directory);
                }
            }
        }

        /// <summary>验证 uGUI 实测矩形与父框边距来自 RectTransform，且零容差捕获真实偏差。</summary>
        [Test]
        public void MeasureUgui_ReadsActualRectAndFailsOutsideDeclaredTolerance()
        {
            RectTransform target = CreateUguiHierarchy();
            string outputPath = CreateOutputPath("ugui-tolerance-fail.json");
            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                candidateId = "candidate-a",
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = outputPath,
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget
                    {
                        id = "card",
                        objectPath = "Canvas/Panel/Card",
                        parentObjectPath = "Canvas/Panel",
                        targetRect = new LayoutRect { x = 0f, y = 0f, width = 1f, height = 1f },
                        tolerance = new LayoutTolerance { maxAbsDelta = 0f }
                    }
                }
            });

            Assert.That(target, Is.Not.Null);
            Assert.That(report.status, Is.EqualTo("FAIL"));
            Assert.That(report.measurements, Has.Count.EqualTo(1));
            Assert.That(report.measurements[0].actualRect.width, Is.EqualTo(75f).Within(0.1f));
            Assert.That(report.measurements[0].actualRect.height, Is.EqualTo(41f).Within(0.1f));
            Assert.That(report.measurements[0].parentRect.width, Is.GreaterThan(1f));
            Assert.That(report.measurements[0].margins, Is.Not.Null);
            Assert.That(report.measurements[0].delta.width, Is.GreaterThan(0f));
            Assert.That(File.Exists(WorkflowPaths.ResolveProjectRelative(outputPath)), Is.True);
        }

        /// <summary>验证未声明目标矩形和容差时只返回 MEASURED，不自行制造 PASS 阈值。</summary>
        [Test]
        public void MeasureUgui_WithoutToleranceRemainsMeasurementOnly()
        {
            CreateUguiHierarchy();
            string outputPath = CreateOutputPath("ugui-measure-only.json");
            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = outputPath,
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget
                    {
                        id = "card",
                        objectPath = "Canvas/Panel/Card",
                        parentObjectPath = "Canvas/Panel"
                    }
                }
            });

            Assert.That(report.status, Is.EqualTo("MEASURED"));
            Assert.That(report.measurements[0].status, Is.EqualTo("MEASURED"));
            Assert.That(report.measurements[0].targetRect, Is.Null);
            Assert.That(report.measurements[0].delta, Is.Null);
            Assert.That(report.measurements[0].tolerance, Is.Null);
            Assert.That(File.Exists(WorkflowPaths.ResolveProjectRelative(outputPath)), Is.True);
        }

        /// <summary>验证不匹配的坐标空间在任何场景读取和文件写入前被拒绝。</summary>
        [Test]
        public void Measure_MixedCoordinateSpaceFailsWithoutReport()
        {
            CreateUguiHierarchy();
            string outputPath = CreateOutputPath("mixed-space.json");
            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "UI_TOOLKIT_LOGICAL_POINTS",
                outputPath = outputPath,
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget { id = "card", objectPath = "Canvas/Panel/Card", parentObjectPath = "Canvas/Panel" }
                }
            });

            Assert.That(report.status, Is.EqualTo("FAIL"));
            Assert.That(report.errorCode, Is.EqualTo("INCONSISTENT_COORDINATE_SPACE"));
            Assert.That(File.Exists(WorkflowPaths.ResolveProjectRelative(outputPath)), Is.False);
        }

        /// <summary>验证 UI Toolkit 请求拒绝跨 UIDocument 混用不同根坐标原点。</summary>
        [Test]
        public void MeasureUiToolkit_MultipleDocumentsFailBeforePanelRead()
        {
            string outputPath = CreateOutputPath("mixed-documents.json");
            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                scenePath = testScenePath,
                uiSystem = "UI_TOOLKIT",
                coordinateSpace = "UI_TOOLKIT_LOGICAL_POINTS",
                outputPath = outputPath,
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget
                    {
                        id = "title",
                        documentPath = "Menu/DocumentA",
                        elementName = "title",
                        parentElementName = "header"
                    },
                    new LayoutMeasurementTarget
                    {
                        id = "subtitle",
                        documentPath = "Menu/DocumentB",
                        elementName = "subtitle",
                        parentElementName = "header"
                    }
                }
            });

            Assert.That(report.status, Is.EqualTo("FAIL"));
            Assert.That(report.errorCode, Is.EqualTo("MIXED_UI_DOCUMENTS"));
            Assert.That(report.origin, Is.EqualTo("UIDOCUMENT_ROOT_TOP_LEFT"));
            Assert.That(File.Exists(WorkflowPaths.ResolveProjectRelative(outputPath)), Is.False);
        }

        /// <summary>验证间距取自实测矩形边界，并保留负间距表示的节点重叠。</summary>
        [TestCase(102f, 10f)]
        [TestCase(82f, -10f)]
        public void MeasureUgui_GapUsesActualAdjacentEdges(float siblingX, float expectedGap)
        {
            RectTransform first = CreateUguiHierarchy();
            RectTransform parent = first.parent as RectTransform;
            RectTransform second = CreateSibling(parent, "CardB", siblingX);
            Assert.That(EditorSceneManager.SaveScene(first.gameObject.scene, testScenePath), Is.True);
            string outputPath = CreateOutputPath("ugui-gap-" + (expectedGap < 0f ? "overlap" : "separated") + ".json");
            float targetSecondX = 500f + expectedGap + first.rect.width;

            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = outputPath,
                gapAxis = "horizontal",
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget
                    {
                        id = "card-a",
                        objectPath = "Canvas/Panel/Card",
                        parentObjectPath = "Canvas/Panel",
                        targetRect = new LayoutRect { x = 500f, y = 400f, width = first.rect.width, height = first.rect.height }
                    },
                    new LayoutMeasurementTarget
                    {
                        id = "card-b",
                        objectPath = "Canvas/Panel/CardB",
                        parentObjectPath = "Canvas/Panel",
                        targetRect = new LayoutRect { x = targetSecondX, y = 400f, width = second.rect.width, height = second.rect.height }
                    }
                }
            });

            Assert.That(report.status, Is.EqualTo("MEASURED"));
            Assert.That(report.gapAxis, Is.EqualTo("horizontal"));
            Assert.That(report.gaps, Has.Count.EqualTo(1));
            Assert.That(report.gaps[0].fromId, Is.EqualTo("card-a"));
            Assert.That(report.gaps[0].toId, Is.EqualTo("card-b"));
            Assert.That(report.gaps[0].actualGap, Is.EqualTo(expectedGap).Within(0.1f));
            Assert.That(report.gaps[0].targetGap.value, Is.EqualTo(expectedGap).Within(0.1f));
            Assert.That(report.gaps[0].deltaGap.value, Is.EqualTo(0f).Within(0.1f));
            Assert.That(report.gapNote, Does.Contain("不表示已检查父级的全部子项"));
        }

        /// <summary>验证不同直接父级的选中节点不会被拼成一条间距链。</summary>
        [Test]
        public void MeasureUgui_GapDoesNotCrossParentGroups()
        {
            RectTransform first = CreateUguiHierarchy();
            RectTransform secondParent = new GameObject("OtherPanel", typeof(RectTransform)).GetComponent<RectTransform>();
            secondParent.SetParent(first.parent.parent, false);
            secondParent.anchorMin = Vector2.zero;
            secondParent.anchorMax = Vector2.one;
            secondParent.offsetMin = Vector2.zero;
            secondParent.offsetMax = Vector2.zero;
            CreateSibling(secondParent, "OtherCard", 17f);
            Assert.That(EditorSceneManager.SaveScene(first.gameObject.scene, testScenePath), Is.True);

            LayoutMeasurementReport report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
            {
                taskId = taskId,
                scenePath = testScenePath,
                uiSystem = "UGUI",
                coordinateSpace = "SCREEN_SPACE_PIXELS",
                outputPath = CreateOutputPath("ugui-gap-cross-parent.json"),
                gapAxis = "horizontal",
                targets = new List<LayoutMeasurementTarget>
                {
                    new LayoutMeasurementTarget { id = "card-a", objectPath = "Canvas/Panel/Card", parentObjectPath = "Canvas/Panel" },
                    new LayoutMeasurementTarget { id = "card-b", objectPath = "Canvas/OtherPanel/OtherCard", parentObjectPath = "Canvas/OtherPanel" }
                }
            });

            Assert.That(report.status, Is.EqualTo("MEASURED"));
            Assert.That(report.gaps, Is.Empty);
        }

        /// <summary>创建具有固定尺寸且路径唯一的 Screen Space Overlay Canvas 结构。</summary>
        private RectTransform CreateUguiHierarchy()
        {
            GameObject canvasObject = new GameObject("Canvas", typeof(RectTransform), typeof(Canvas));
            Canvas canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            RectTransform canvasRect = canvasObject.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(Mathf.Max(Screen.width, 800), Mathf.Max(Screen.height, 600));

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

        /// <summary>在给定父框下创建固定尺寸的兄弟元素，供实测间距断言使用。</summary>
        private static RectTransform CreateSibling(RectTransform parent, string name, float x)
        {
            GameObject targetObject = new GameObject(name, typeof(RectTransform));
            RectTransform target = targetObject.GetComponent<RectTransform>();
            target.SetParent(parent, false);
            target.anchorMin = new Vector2(0.5f, 0.5f);
            target.anchorMax = new Vector2(0.5f, 0.5f);
            target.pivot = new Vector2(0.5f, 0.5f);
            target.anchoredPosition = new Vector2(x, -19f);
            target.sizeDelta = new Vector2(75f, 41f);
            Canvas.ForceUpdateCanvases();
            return target;
        }

        /// <summary>注册该测试唯一的项目内报告路径，并供 TearDown 安全删除。</summary>
        private string CreateOutputPath(string fileName)
        {
            string relativePath = "Artifacts/Visual/" + taskId + "/" + fileName;
            createdPaths.Add(WorkflowPaths.ResolveProjectRelative(relativePath));
            return relativePath;
        }
    }
}
