using System;
using System.Collections;
using System.IO;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.VisualQA;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>验证布局测量服务能从真实 UI Toolkit Panel 读取运行时几何。</summary>
    public sealed class UIToolkitLayoutMeasurementTests
    {
        private SceneSetup[] originalSceneSetup = Array.Empty<SceneSetup>();
        private string taskId = string.Empty;
        private string testScenePath = string.Empty;
        private string panelSettingsAssetPath = string.Empty;
        private string outputPath = string.Empty;
        private string absoluteOutputPath = string.Empty;
        private bool originalEnterPlayModeOptionsEnabled;
        private EnterPlayModeOptions originalEnterPlayModeOptions;
        private bool editorSettingsCaptured;

        /// <summary>在隔离场景中挂载临时 UIDocument，并读取真实布局、边距和容差结论。</summary>
        [UnityTest]
        public IEnumerator Measure_ReadsAttachedPanelGeometryAndPassesDeclaredTolerance()
        {
            originalSceneSetup = EditorSceneManager.GetSceneManagerSetup();
            taskId = "uitk-layout-test-" + Guid.NewGuid().ToString("N");
            testScenePath = "Assets/__UWTUIToolkitLayout-" + Guid.NewGuid().ToString("N") + ".unity";
            panelSettingsAssetPath = "Assets/__UWTUIToolkitPanel-" + Guid.NewGuid().ToString("N") + ".asset";
            outputPath = "Artifacts/Visual/" + taskId + "/measurement.json";
            absoluteOutputPath = WorkflowPaths.ResolveProjectRelative(outputPath);

            originalEnterPlayModeOptionsEnabled = EditorSettings.enterPlayModeOptionsEnabled;
            originalEnterPlayModeOptions = EditorSettings.enterPlayModeOptions;
            editorSettingsCaptured = true;
            EditorSettings.enterPlayModeOptions = originalEnterPlayModeOptions | EnterPlayModeOptions.DisableDomainReload;
            EditorSettings.enterPlayModeOptionsEnabled = true;

            PanelSettings panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            panelSettings.scaleMode = PanelScaleMode.ConstantPixelSize;
            AssetDatabase.CreateAsset(panelSettings, panelSettingsAssetPath);

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject documentObject = new GameObject("Menu", typeof(UIDocument));
            UIDocument document = documentObject.GetComponent<UIDocument>();
            document.panelSettings = panelSettings;
            Assert.That(EditorSceneManager.SaveScene(scene, testScenePath), Is.True);

            // 禁用临时测试期间的域重载，避免编辑器测试夹具在 Play Mode 中重新运行同步场景 SetUp。
            yield return new EnterPlayMode(expectDomainReload: false);

            GameObject runtimeDocumentObject = GameObject.Find("Menu");
            UIDocument runtimeDocument = runtimeDocumentObject == null ? null : runtimeDocumentObject.GetComponent<UIDocument>();
            VisualElement root = runtimeDocument == null ? null : runtimeDocument.rootVisualElement;
            for (int frame = 0; frame < 120 &&
                 (root == null || root.panel == null || !(root.worldBound.width > 0f && root.worldBound.height > 0f)); frame++)
            {
                yield return null;
            }

            bool panelReady = root != null && root.panel != null && root.worldBound.width > 0f && root.worldBound.height > 0f;
            bool layoutReady = false;
            string layoutDiagnostics = "父子元素未创建。";
            LayoutMeasurementReport report = null;
            if (panelReady)
            {
                var parent = new VisualElement { name = "layout-parent" };
                parent.style.position = Position.Absolute;
                parent.style.left = 40f;
                parent.style.top = 30f;
                parent.style.width = 300f;
                parent.style.height = 200f;
                parent.style.marginLeft = 0f;
                parent.style.marginTop = 0f;
                parent.style.marginRight = 0f;
                parent.style.marginBottom = 0f;
                parent.style.paddingLeft = 0f;
                parent.style.paddingTop = 0f;
                parent.style.paddingRight = 0f;
                parent.style.paddingBottom = 0f;

                var target = new VisualElement { name = "layout-target" };
                target.style.position = Position.Absolute;
                target.style.left = 17f;
                target.style.top = 19f;
                target.style.width = 75f;
                target.style.height = 41f;
                target.style.marginLeft = 0f;
                target.style.marginTop = 0f;
                target.style.marginRight = 0f;
                target.style.marginBottom = 0f;
                parent.Add(target);
                root.Add(parent);

                for (int frame = 0; frame < 120 &&
                     !(parent.worldBound.width > 0f && parent.worldBound.height > 0f &&
                       target.worldBound.width > 0f && target.worldBound.height > 0f); frame++)
                {
                    yield return null;
                }

                layoutReady = parent.panel == root.panel && target.panel == root.panel &&
                              parent.worldBound.width > 0f && parent.worldBound.height > 0f &&
                              target.worldBound.width > 0f && target.worldBound.height > 0f;
                layoutDiagnostics = "parentPanelMatches=" + (parent.panel == root.panel) +
                                    ", targetPanelMatches=" + (target.panel == root.panel) +
                                    ", parent.worldBound=" + parent.worldBound +
                                    ", parent.layout=" + parent.layout +
                                    ", parent.resolvedSize=" + parent.resolvedStyle.width + "x" + parent.resolvedStyle.height +
                                    ", target.worldBound=" + target.worldBound +
                                    ", target.layout=" + target.layout +
                                    ", target.resolvedSize=" + target.resolvedStyle.width + "x" + target.resolvedStyle.height;
                if (layoutReady)
                {
                    report = new LayoutMeasurementService().Measure(new LayoutMeasurementRequest
                    {
                        taskId = taskId,
                        candidateId = "candidate-a",
                        scenePath = testScenePath,
                        uiSystem = "UI_TOOLKIT",
                        coordinateSpace = "UI_TOOLKIT_LOGICAL_POINTS",
                        outputPath = outputPath,
                        targets = new System.Collections.Generic.List<LayoutMeasurementTarget>
                        {
                            new LayoutMeasurementTarget
                            {
                                id = "card",
                                documentPath = "Menu",
                                elementName = "layout-target",
                                parentElementName = "layout-parent",
                                targetRect = new LayoutRect { x = 57f, y = 49f, width = 75f, height = 41f },
                                tolerance = new LayoutTolerance { maxAbsDelta = 0.5f }
                            }
                        }
                    });
                }
            }

            yield return new ExitPlayMode();
            RestoreEditorSettings();

            Assert.That(panelReady, Is.True, "UIDocument 必须连接到具有非零布局尺寸的真实 Panel。");
            Assert.That(layoutReady, Is.True, "目标与父元素必须完成真实 Panel 布局。" + layoutDiagnostics);
            Assert.That(report, Is.Not.Null, "只有真实 Panel 布局完成后才调用测量服务。");
            Assert.That(report.status, Is.EqualTo("PASS"), report.errorCode + " " + report.message);
            Assert.That(report.origin, Is.EqualTo("UIDOCUMENT_ROOT_TOP_LEFT"));
            Assert.That(report.unit, Is.EqualTo("POINT"));
            Assert.That(report.measurements, Has.Count.EqualTo(1));

            LayoutMeasurementItem measurement = report.measurements[0];
            Assert.That(measurement.status, Is.EqualTo("PASS"));
            Assert.That(measurement.actualRect.x, Is.EqualTo(57f).Within(0.1f));
            Assert.That(measurement.actualRect.y, Is.EqualTo(49f).Within(0.1f));
            Assert.That(measurement.actualRect.width, Is.EqualTo(75f).Within(0.1f));
            Assert.That(measurement.actualRect.height, Is.EqualTo(41f).Within(0.1f));
            Assert.That(measurement.parentRect.x, Is.EqualTo(40f).Within(0.1f));
            Assert.That(measurement.parentRect.y, Is.EqualTo(30f).Within(0.1f));
            Assert.That(measurement.parentRect.width, Is.EqualTo(300f).Within(0.1f));
            Assert.That(measurement.parentRect.height, Is.EqualTo(200f).Within(0.1f));
            Assert.That(measurement.margins.left, Is.EqualTo(17f).Within(0.1f));
            Assert.That(measurement.margins.top, Is.EqualTo(19f).Within(0.1f));
            Assert.That(measurement.margins.right, Is.EqualTo(208f).Within(0.1f));
            Assert.That(measurement.margins.bottom, Is.EqualTo(140f).Within(0.1f));
            Assert.That(measurement.delta.x, Is.EqualTo(0f).Within(0.1f));
            Assert.That(measurement.delta.y, Is.EqualTo(0f).Within(0.1f));
            Assert.That(measurement.delta.width, Is.EqualTo(0f).Within(0.1f));
            Assert.That(measurement.delta.height, Is.EqualTo(0f).Within(0.1f));
            Assert.That(measurement.tolerance.maxAbsDelta, Is.EqualTo(0.5f));
            Assert.That(File.Exists(absoluteOutputPath), Is.True);
        }

        /// <summary>即使测试中途失败，也先退出 Play Mode，再恢复场景并删除临时资产和报告。</summary>
        [UnityTearDown]
        public IEnumerator RestoreSceneAndDeleteFixtures()
        {
            if (EditorApplication.isPlaying)
            {
                yield return new ExitPlayMode();
            }

            try
            {
                if (originalSceneSetup.Length > 0)
                {
                    EditorSceneManager.RestoreSceneManagerSetup(originalSceneSetup);
                }
                else
                {
                    EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                }

                if (!string.IsNullOrEmpty(testScenePath))
                {
                    AssetDatabase.DeleteAsset(testScenePath);
                }

                if (!string.IsNullOrEmpty(panelSettingsAssetPath))
                {
                    AssetDatabase.DeleteAsset(panelSettingsAssetPath);
                }

                DeleteReportFixture();
            }
            finally
            {
                RestoreEditorSettings();
            }
        }

        /// <summary>恢复测试前的播放选项，避免临时关闭域重载影响其他编辑器操作。</summary>
        private void RestoreEditorSettings()
        {
            if (!editorSettingsCaptured)
            {
                return;
            }

            EditorSettings.enterPlayModeOptions = originalEnterPlayModeOptions;
            EditorSettings.enterPlayModeOptionsEnabled = originalEnterPlayModeOptionsEnabled;
            editorSettingsCaptured = false;
        }

        /// <summary>删除测量报告及其测试专用空目录。</summary>
        private void DeleteReportFixture()
        {
            if (!string.IsNullOrEmpty(absoluteOutputPath) && File.Exists(absoluteOutputPath))
            {
                File.Delete(absoluteOutputPath);
            }

            string outputDirectory = Path.GetDirectoryName(absoluteOutputPath);
            if (!string.IsNullOrEmpty(outputDirectory) && Directory.Exists(outputDirectory) &&
                Directory.GetFileSystemEntries(outputDirectory).Length == 0)
            {
                Directory.Delete(outputDirectory);
            }

            string taskDirectory = string.IsNullOrEmpty(outputDirectory) ? string.Empty : Path.GetDirectoryName(outputDirectory);
            if (!string.IsNullOrEmpty(taskDirectory) && Directory.Exists(taskDirectory) &&
                Directory.GetFileSystemEntries(taskDirectory).Length == 0)
            {
                Directory.Delete(taskDirectory);
            }
        }
    }
}
