using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.PipelineCommands;
using Project.UnityWorkflow.ResourceInspection;
using Project.UnityWorkflow.Tests.Rigging;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using UnityEngine.UI;

namespace Project.UnityWorkflow.Tests
{
    /// <summary>验证资源交接命令从真实 Unity 资产读取 Resources、Clip、Sprite 和 Prefab 事实。</summary>
    public sealed class ResourceHandoffInspectionTests
    {
        private readonly List<string> temporaryFiles = new List<string>();
        private string assetRoot;

        /// <summary>输出文件路径必须拒绝 Windows 分隔符，避免跨平台规范化差异。</summary>
        [Test]
        public void Inspect_RejectsBackslashesInOutputPath()
        {
            var request = new ResourceHandoffInspectionRequest
            {
                taskId = "WI-ASSET_bad-output",
                outputPath = "Library/UwtResourceHandoffTests\\invalid.json",
                assets = new List<ResourceHandoffAssetRequest>
                {
                    new ResourceHandoffAssetRequest
                    {
                        resourceId = "unused",
                        assetPath = "Assets/missing.png"
                    }
                }
            };

            Assert.Throws<ArgumentException>(() => new ResourceHandoffInspectionService().Inspect(request));
        }

        /// <summary>为每项测试创建隔离的 Assets 临时目录。</summary>
        [SetUp]
        public void SetUp()
        {
            assetRoot = "Assets/UwtResourceHandoffTests/" + Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(assetRoot));
            AssetDatabase.Refresh();
        }

        /// <summary>删除测试创建的资产和临时 Job，保留成功 wire 报告供跨语言校验。</summary>
        [TearDown]
        public void TearDown()
        {
            if (!string.IsNullOrEmpty(assetRoot))
            {
                AssetDatabase.DeleteAsset(assetRoot);
                AssetDatabase.Refresh();
            }

            foreach (string path in temporaryFiles)
            {
                string absolutePath = WorkflowPaths.ResolveProjectRelative(path);
                if (File.Exists(absolutePath))
                {
                    File.Delete(absolutePath);
                }
            }
        }

        /// <summary>资源快照应发现不同 Resources 目录下重复 key，并报告未配置的 Addressables。</summary>
        [Test]
        public void InspectResources_ReportsGlobalKeyCollisionAndUnconfiguredAddressables()
        {
            string first = assetRoot + "/One/Resources/shared.asset.png";
            string second = assetRoot + "/Two/Resources/shared.asset.png";
            string staticAsset = assetRoot + "/Static/static.png";
            CreateTextureAsset(first, 8, 8);
            CreateTextureAsset(second, 8, 8);
            CreateTextureAsset(staticAsset, 8, 8);

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-ASSET_COLLISION",
                assets = new List<ResourceHandoffAssetRequest>
                {
                    new ResourceHandoffAssetRequest { resourceId = "icon-shared", assetPath = first },
                    new ResourceHandoffAssetRequest { resourceId = "static-image", assetPath = staticAsset }
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("MEASURED"));
            JObject asset = (JObject)report["assets"][0];
            Assert.That((string)asset["resourcesKey"], Is.EqualTo("shared.asset"));
            Assert.That((string)asset["assetGuid"], Is.EqualTo(AssetDatabase.AssetPathToGUID(first)));
            Assert.That((int)asset["resourcesMatches"].Count(), Is.EqualTo(2));
            Assert.That((bool)asset["addressables"]["configured"], Is.False);
            Assert.That((string)asset["addressables"]["address"], Is.Empty);
            Assert.That((string)asset["addressables"]["group"], Is.Empty);
            Assert.That((string)report["assets"][1]["resourcesKey"], Is.Empty);
            Assert.That(report["assets"][1]["resourcesMatches"].Count(), Is.EqualTo(0));
        }

        /// <summary>含嵌套 Resources 的路径不得被压成一个看似有效的动态 key。</summary>
        [Test]
        public void InspectResources_RejectsNestedResourcesDirectories()
        {
            string nested = assetRoot + "/Resources/Nested/Resources/icon.png";
            CreateTextureAsset(nested, 8, 8);

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-ASSET_nested",
                assets = new List<ResourceHandoffAssetRequest>
                {
                    new ResourceHandoffAssetRequest { resourceId = "nested-icon", assetPath = nested }
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("FAIL"));
            Assert.That((string)report["assets"][0]["assetGuid"], Is.Not.Empty);
            Assert.That((string)report["assets"][0]["resourcesKey"], Is.Empty);
        }

        /// <summary>SpriteRenderer 和 uGUI Image 曲线应保留多 Sprite 的同 GUID 不同 localId。</summary>
        [Test]
        public void InspectAnimations_ReadsSpriteRendererAndImageFramesWithSubassetIdentity()
        {
            string texturePath = assetRoot + "/Frames/multi.png";
            CreateSpriteTexture(texturePath, SpriteImportMode.Multiple);
            Sprite[] sprites = LoadSprites(texturePath);
            Assert.That(sprites.Length, Is.EqualTo(2));

            string rendererClipPath = assetRoot + "/Clips/renderer.anim";
            string imageClipPath = assetRoot + "/Clips/image.anim";
            string rendererPrefabPath = assetRoot + "/Prefabs/renderer.prefab";
            string imagePrefabPath = assetRoot + "/Prefabs/image.prefab";
            CreateClip(rendererClipPath, "Target", typeof(SpriteRenderer), sprites);
            CreateClip(imageClipPath, "Target", typeof(Image), sprites);
            CreateAnimationPrefab(
                rendererPrefabPath,
                "Target",
                typeof(SpriteRenderer),
                true,
                LoadClip(rendererClipPath),
                includeLifecycleProbe: true);
            CreateAnimationPrefab(imagePrefabPath, "Target", typeof(Image), true, LoadClip(imageClipPath));

            string wirePath = "Artifacts/TestResults/resource-handoff-wire-" + Guid.NewGuid().ToString("N") + ".json";
            ResourceHandoffLifecycleProbe.ResetCounts();
            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-FRAME_readback",
                outputPath = wirePath,
                assets = new List<ResourceHandoffAssetRequest>
                {
                    new ResourceHandoffAssetRequest { resourceId = "frame-sheet", assetPath = texturePath }
                },
                animations = new List<ResourceHandoffAnimationRequest>
                {
                    AnimationRequest("renderer", rendererClipPath, rendererPrefabPath, "SpriteRenderer"),
                    AnimationRequest("image", imageClipPath, imagePrefabPath, "Image")
                }
            }, preserveReport: true);

            Assert.That((string)report["status"], Is.EqualTo("MEASURED"));
            Assert.That((string)report["measurementSource"], Is.EqualTo("UNITY_EDITOR_ASSET_DATABASE"));
            Assert.That((string)report["taskId"], Is.EqualTo("WI-FRAME_readback"));
            Assert.That((string)report["runId"], Is.Not.Empty);
            Assert.That((string)report["generatedAtUtc"], Does.EndWith("Z"));
            Assert.That(report["animations"].Count(), Is.EqualTo(2));

            foreach (JObject animation in report["animations"].Cast<JObject>())
            {
                Assert.That((bool)animation["consumer"]["referencesClip"], Is.True);
                Assert.That((bool)animation["consumer"]["bindingResolved"], Is.True);
                Assert.That((string)animation["propertyName"], Is.EqualTo("m_Sprite"));
                Assert.That((float)animation["frameRate"], Is.EqualTo(4f));
                Assert.That((float)animation["duration"], Is.GreaterThan(0f));
                Assert.That((bool)animation["loop"], Is.True);
                Assert.That(animation["frames"].Count(), Is.EqualTo(2));
                Assert.That((string)animation["frames"][0]["assetGuid"],
                    Is.EqualTo((string)animation["frames"][1]["assetGuid"]));
                Assert.That((string)animation["frames"][0]["localId"],
                    Is.Not.EqualTo((string)animation["frames"][1]["localId"]));
                Assert.That((float)animation["frames"][0]["pixelsPerUnit"], Is.EqualTo(100f));
                Assert.That((float)animation["frames"][0]["pivot"]["x"], Is.EqualTo(0.25f).Within(0.0001f));
                Assert.That((float)animation["frames"][0]["pivot"]["y"], Is.EqualTo(0.75f).Within(0.0001f));
            }

            Assert.That((string)report["animations"][0]["componentType"], Is.EqualTo("SpriteRenderer"));
            Assert.That((string)report["animations"][1]["componentType"], Is.EqualTo("Image"));
            Assert.That(File.Exists(WorkflowPaths.ResolveProjectRelative(wirePath)), Is.True);
            Assert.That(ResourceHandoffLifecycleProbe.AwakeCount, Is.Zero);
            Assert.That(ResourceHandoffLifecycleProbe.OnEnableCount, Is.Zero);
            Assert.That(ResourceHandoffLifecycleProbe.OnDisableCount, Is.Zero);
            Assert.That(ResourceHandoffLifecycleProbe.OnDestroyCount, Is.Zero);
        }

        /// <summary>真实 AnimatorController 应引用并读取非 Legacy Clip 的帧与绑定。</summary>
        [Test]
        public void InspectAnimator_ReadsNonLegacyClipFromAnimatorController()
        {
            string texturePath = assetRoot + "/Animator/sprite.png";
            CreateSpriteTexture(texturePath, SpriteImportMode.Single);
            Sprite sprite = LoadSprites(texturePath).Single();
            string clipPath = assetRoot + "/Clips/mecanim.anim";
            string controllerPath = assetRoot + "/Controllers/mecanim.controller";
            string prefabPath = assetRoot + "/Prefabs/animator.prefab";
            CreateClip(clipPath, "Target", typeof(SpriteRenderer), new[] { sprite }, legacy: false);
            AnimationClip clip = LoadClip(clipPath);
            AnimatorController controller = CreateAnimatorController(controllerPath, clip);
            CreateAnimatorPrefab(prefabPath, controller, "Target", typeof(SpriteRenderer));

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-FRAME_animator",
                animations = new List<ResourceHandoffAnimationRequest>
                {
                    AnimationRequest("mecanim", clipPath, prefabPath, "SpriteRenderer", "Animator")
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("MEASURED"));
            Assert.That((bool)report["animations"][0]["consumer"]["referencesClip"], Is.True);
            Assert.That((bool)report["animations"][0]["consumer"]["bindingResolved"], Is.True);
            Assert.That(report["animations"][0]["frames"].Count(), Is.EqualTo(2));
            Assert.That((float)report["animations"][0]["duration"], Is.GreaterThan(0f));
        }

        /// <summary>Legacy Animation 和 Animator Controller 必须拒绝相反类型的 Clip。</summary>
        [Test]
        public void InspectAnimation_RejectsLegacyAndMecanimConsumerMismatches()
        {
            string texturePath = assetRoot + "/Modes/sprite.png";
            CreateSpriteTexture(texturePath, SpriteImportMode.Single);
            Sprite sprite = LoadSprites(texturePath).Single();
            string mecanimClipPath = assetRoot + "/Clips/mecanim.anim";
            string legacyClipPath = assetRoot + "/Clips/legacy.anim";
            string animationPrefabPath = assetRoot + "/Prefabs/legacy-consumer.prefab";
            string animatorPrefabPath = assetRoot + "/Prefabs/mecanim-consumer.prefab";
            CreateClip(mecanimClipPath, "Target", typeof(SpriteRenderer), new[] { sprite }, legacy: false);
            CreateClip(legacyClipPath, "Target", typeof(SpriteRenderer), new[] { sprite }, legacy: true);
            CreateAnimationPrefab(animationPrefabPath, "Target", typeof(SpriteRenderer), false, null);
            CreateAnimatorPrefab(animatorPrefabPath, null, "Target", typeof(SpriteRenderer));

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-FRAME_mode-mismatch",
                animations = new List<ResourceHandoffAnimationRequest>
                {
                    AnimationRequest("legacy-needs-legacy", mecanimClipPath, animationPrefabPath, "SpriteRenderer"),
                    AnimationRequest("animator-needs-mecanim", legacyClipPath, animatorPrefabPath, "SpriteRenderer", "Animator")
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("FAIL"));
            Assert.That((bool)report["animations"][0]["consumer"]["referencesClip"], Is.False);
            Assert.That((bool)report["animations"][1]["consumer"]["referencesClip"], Is.False);
            Assert.That((string)report["message"], Does.Contain("只能引用 legacy AnimationClip"));
            Assert.That((string)report["message"], Does.Contain("不能引用 legacy AnimationClip"));
        }

        /// <summary>空曲线和未被 Prefab 消费的 Clip 必须失败且不得伪造完整交接。</summary>
        [Test]
        public void InspectAnimations_RejectsEmptySpriteCurveAndUnreferencedClip()
        {
            string texturePath = assetRoot + "/Single/sprite.png";
            CreateSpriteTexture(texturePath, SpriteImportMode.Single);
            Sprite sprite = LoadSprites(texturePath).Single();

            string emptyClipPath = assetRoot + "/Clips/empty.anim";
            string unreferencedClipPath = assetRoot + "/Clips/unreferenced.anim";
            string prefabPath = assetRoot + "/Prefabs/consumer.prefab";
            CreateClip(emptyClipPath, "Target", typeof(SpriteRenderer), Array.Empty<Sprite>());
            CreateClip(unreferencedClipPath, "Target", typeof(SpriteRenderer), new[] { sprite });
            CreateAnimationPrefab(prefabPath, "Target", typeof(SpriteRenderer), false, null);

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-FRAME_failure",
                animations = new List<ResourceHandoffAnimationRequest>
                {
                    AnimationRequest("empty", emptyClipPath, prefabPath, "SpriteRenderer"),
                    AnimationRequest("unreferenced", unreferencedClipPath, prefabPath, "SpriteRenderer")
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("FAIL"));
            Assert.That(report["animations"].Count(), Is.EqualTo(2));
            Assert.That(report["animations"][0]["frames"].Count(), Is.EqualTo(0));
            Assert.That((float)report["animations"][0]["duration"], Is.EqualTo(LoadClip(emptyClipPath).length));
            Assert.That((bool)report["animations"][1]["consumer"]["referencesClip"], Is.False);
        }

        /// <summary>独立 .anim 以外的 AnimationClip 容器不支持被序列帧读回选取。</summary>
        [Test]
        public void InspectAnimation_RejectsClipSubassetsInUnsupportedContainer()
        {
            string multiClipPath = assetRoot + "/Clips/multiple.asset";
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(assetRoot + "/Clips"));
            var first = new AnimationClip { name = "First" };
            var second = new AnimationClip { name = "Second" };
            AssetDatabase.CreateAsset(first, multiClipPath);
            AssetDatabase.AddObjectToAsset(second, multiClipPath);
            AssetDatabase.SaveAssets();

            JObject report = RunRequest(new ResourceHandoffInspectionRequest
            {
                taskId = "WI-FRAME_multiple",
                animations = new List<ResourceHandoffAnimationRequest>
                {
                    AnimationRequest("multiple", multiClipPath, "Assets/missing.prefab", "SpriteRenderer")
                }
            });

            Assert.That((string)report["status"], Is.EqualTo("FAIL"));
            Assert.That((string)report["message"], Does.Contain("仅支持独立的 .anim AnimationClip 主资源"));
            Assert.That(report["animations"][0]["clipGuid"].Type, Is.EqualTo(JTokenType.Null));
            Assert.That(report["animations"][0]["frames"].Count(), Is.EqualTo(0));
        }

        /// <summary>运行真实 Pipeline 命令并返回其新写入的 JSON 报告。</summary>
        /// <param name="request">资源交接请求。</param>
        /// <param name="preserveReport">是否保留成功 wire 报告。</param>
        /// <returns>从磁盘重读的报告 JSON。</returns>
        private JObject RunRequest(ResourceHandoffInspectionRequest request, bool preserveReport = false)
        {
            if (string.IsNullOrEmpty(request.outputPath))
            {
                request.outputPath = "Library/UwtResourceHandoffTests/" + Guid.NewGuid().ToString("N") + ".json";
            }

            string jobPath = "Library/UwtResourceHandoffTests/" + Guid.NewGuid().ToString("N") + ".json";
            string sourcePath = Path.ChangeExtension(jobPath, ".source.yaml").Replace('\\', '/');
            string absoluteJob = WorkflowPaths.ResolveProjectRelative(jobPath);
            Directory.CreateDirectory(Path.GetDirectoryName(absoluteJob));
            File.WriteAllText(WorkflowPaths.ResolveProjectRelative(sourcePath), "kind: resource-handoff-inspection\n");
            JObject job = new JObject
            {
                ["schemaVersion"] = "1.0",
                ["kind"] = "resource-handoff-inspection",
                ["sourcePath"] = sourcePath,
                ["compiledAtUtc"] = DateTime.UtcNow.ToString("O"),
                ["payload"] = JObject.Parse(JsonConvert.SerializeObject(request))
            };
            File.WriteAllText(absoluteJob, job.ToString(Formatting.Indented), new UTF8Encoding(false));
            temporaryFiles.Add(jobPath);
            temporaryFiles.Add(sourcePath);

            PipelineCommandResult result = InspectResourceHandoffCommand.Execute(jobPath);
            Assert.That(result, Is.Not.Null);
            Assert.That(result.Data, Is.TypeOf<ResourceHandoffInspectionReport>());
            string absoluteReport = WorkflowPaths.ResolveProjectRelative(request.outputPath);
            Assert.That(File.Exists(absoluteReport), Is.True, result.Message);
            if (!preserveReport)
            {
                temporaryFiles.Add(request.outputPath);
            }

            using (var reader = new JsonTextReader(
                       new StringReader(File.ReadAllText(absoluteReport, new UTF8Encoding(false, true)))))
            {
                // Newtonsoft 默认会把 ISO 时间字符串转成当前区域 DateTime，跨语言 wire 断言必须保留原始文本。
                reader.DateParseHandling = DateParseHandling.None;
                return JObject.Load(reader);
            }
        }

        /// <summary>创建 PNG 纹理文件并刷新 AssetDatabase。</summary>
        /// <param name="assetPath">项目内纹理路径。</param>
        /// <param name="width">纹理像素宽度。</param>
        /// <param name="height">纹理像素高度。</param>
        private static void CreateTextureAsset(string assetPath, int width, int height)
        {
            EnsureParent(assetPath);
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
            try
            {
                texture.SetPixels(Enumerable.Repeat(Color.white, width * height).ToArray());
                texture.Apply();
                File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(assetPath), texture.EncodeToPNG());
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }

            AssetDatabase.Refresh();
        }

        /// <summary>创建显式 Single 或 Multiple Sprite import 设置的测试纹理。</summary>
        /// <param name="assetPath">项目内 PNG 路径。</param>
        /// <param name="mode">要验证的 TextureImporter Sprite 模式。</param>
        private static void CreateSpriteTexture(string assetPath, SpriteImportMode mode)
        {
            CreateTextureAsset(assetPath, 32, 16);
            var importer = (TextureImporter)AssetImporter.GetAtPath(assetPath);
            Assert.That(importer, Is.Not.Null);
            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = mode;
            importer.spritePixelsPerUnit = 100f;
            if (mode == SpriteImportMode.Multiple)
            {
#pragma warning disable CS0618
                importer.spritesheet = new[]
                {
                    new SpriteMetaData
                    {
                        name = "FrameA",
                        rect = new Rect(0f, 0f, 16f, 16f),
                        pivot = new Vector2(0.25f, 0.75f),
                        alignment = (int)SpriteAlignment.Custom
                    },
                    new SpriteMetaData
                    {
                        name = "FrameB",
                        rect = new Rect(16f, 0f, 16f, 16f),
                        pivot = new Vector2(0.5f, 0.5f),
                        alignment = (int)SpriteAlignment.Custom
                    }
                };
#pragma warning restore CS0618
            }

            importer.SaveAndReimport();
        }

        /// <summary>读取纹理路径下全部真实 Sprite 主资源和子资源。</summary>
        /// <param name="assetPath">AssetDatabase 中的纹理路径。</param>
        /// <returns>按名称排序的 Sprite 实例。</returns>
        private static Sprite[] LoadSprites(string assetPath)
        {
            return AssetDatabase.LoadAllAssetsAtPath(assetPath)
                .OfType<Sprite>()
                .OrderBy(sprite => sprite.name, StringComparer.Ordinal)
                .ToArray();
        }

        /// <summary>创建含指定 Sprite 对象引用曲线的实际 AnimationClip 资产。</summary>
        /// <param name="clipPath">项目内 Clip 路径。</param>
        /// <param name="bindingPath">动画绑定相对路径。</param>
        /// <param name="componentType">SpriteRenderer 或 Image 类型。</param>
        /// <param name="sprites">要按顺序绑定的真实 Sprite 对象。</param>
        private static void CreateClip(
            string clipPath,
            string bindingPath,
            Type componentType,
            Sprite[] sprites,
            bool legacy = true)
        {
            EnsureParent(clipPath);
            var clip = new AnimationClip
            {
                name = Path.GetFileNameWithoutExtension(clipPath),
                frameRate = 4f,
                legacy = legacy
            };
            if (sprites.Length > 0)
            {
                Sprite[] curveSprites = sprites.Length == 1
                    ? new[] { sprites[0], sprites[0] }
                    : sprites;
                ObjectReferenceKeyframe[] keys = curveSprites.Select((sprite, index) => new ObjectReferenceKeyframe
                {
                    time = index / clip.frameRate,
                    value = sprite
                }).ToArray();
                EditorCurveBinding binding = EditorCurveBinding.PPtrCurve(bindingPath, componentType, "m_Sprite");
                AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
            }

            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            AssetDatabase.CreateAsset(clip, clipPath);
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(clipPath);
        }

        /// <summary>从 AssetDatabase 读取唯一 Clip，用于把真实对象引用写入测试 Prefab。</summary>
        /// <param name="clipPath">项目内 Clip 路径。</param>
        /// <returns>实际 AnimationClip 实例。</returns>
        private static AnimationClip LoadClip(string clipPath)
        {
            return AssetDatabase.LoadAllAssetsAtPath(clipPath).OfType<AnimationClip>().Single();
        }

        /// <summary>创建真实 Animation 消费者 Prefab，并可选择写入 Clip 引用。</summary>
        /// <param name="prefabPath">项目内 Prefab 路径。</param>
        /// <param name="bindingName">目标子节点名称。</param>
        /// <param name="rendererType">SpriteRenderer 或 Image。</param>
        /// <param name="attachClip">是否将 Clip 注册为消费者的实际 state。</param>
        /// <param name="clip">需要引用的实际 Clip 对象。</param>
        private static void CreateAnimationPrefab(
            string prefabPath,
            string bindingName,
            Type rendererType,
            bool attachClip,
            AnimationClip clip,
            bool includeLifecycleProbe = false)
        {
            EnsureParent(prefabPath);
            var root = new GameObject("AnimationRoot");
            try
            {
                Animation animation = root.AddComponent<Animation>();
                if (includeLifecycleProbe)
                {
                    root.AddComponent<ResourceHandoffLifecycleProbe>();
                }

                var target = new GameObject(bindingName);
                target.transform.SetParent(root.transform, false);
                if (rendererType == typeof(SpriteRenderer))
                {
                    target.AddComponent<SpriteRenderer>();
                }
                else if (rendererType == typeof(Image))
                {
                    target.AddComponent<Image>();
                }

                if (attachClip)
                {
                    animation.AddClip(clip, "Sequence");
                    animation.clip = clip;
                }

                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(prefabPath);
        }

        /// <summary>创建引用指定非 Legacy Clip 的真实 AnimatorController 资产。</summary>
        /// <param name="controllerPath">项目内 Controller 资产路径。</param>
        /// <param name="clip">已保存的非 Legacy AnimationClip。</param>
        /// <returns>写入默认状态并保存后的 Controller。</returns>
        private static AnimatorController CreateAnimatorController(string controllerPath, AnimationClip clip)
        {
            EnsureParent(controllerPath);
            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            AnimatorStateMachine stateMachine = controller.layers[0].stateMachine;
            AnimatorState state = stateMachine.AddState("ResourceHandoffSequence");
            state.motion = clip;
            stateMachine.defaultState = state;
            EditorUtility.SetDirty(controller);
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(controllerPath);
            return AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
        }

        /// <summary>创建含 SpriteRenderer 绑定目标和可选 Controller 的 Animator 消费者 Prefab。</summary>
        /// <param name="prefabPath">项目内 Prefab 路径。</param>
        /// <param name="controller">Prefab Animator 应引用的 Controller；兼容性失败夹具传 null。</param>
        /// <param name="bindingName">Sprite 曲线绑定的子节点名。</param>
        /// <param name="rendererType">SpriteRenderer 或 Image。</param>
        private static void CreateAnimatorPrefab(
            string prefabPath,
            RuntimeAnimatorController controller,
            string bindingName,
            Type rendererType)
        {
            EnsureParent(prefabPath);
            var root = new GameObject("AnimatorRoot");
            try
            {
                Animator animator = root.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                var target = new GameObject(bindingName);
                target.transform.SetParent(root.transform, false);
                if (rendererType == typeof(SpriteRenderer))
                {
                    target.AddComponent<SpriteRenderer>();
                }
                else if (rendererType == typeof(Image))
                {
                    target.AddComponent<Image>();
                }

                PrefabUtility.SaveAsPrefabAsset(root, prefabPath);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(prefabPath);
        }

        /// <summary>生成与实际资源文件夹结构对应的请求对象。</summary>
        /// <param name="animationId">交接动画 ID。</param>
        /// <param name="clipPath">Clip 路径。</param>
        /// <param name="prefabPath">消费者 Prefab 路径。</param>
        /// <param name="componentType">SpriteRenderer 或 Image。</param>
        /// <returns>指向实际测试资产的动画请求。</returns>
        private static ResourceHandoffAnimationRequest AnimationRequest(
            string animationId,
            string clipPath,
            string prefabPath,
            string componentType,
            string consumerComponent = "Animation")
        {
            return new ResourceHandoffAnimationRequest
            {
                animationId = animationId,
                clipPath = clipPath,
                consumerPrefabPath = prefabPath,
                consumerComponent = consumerComponent,
                bindingPath = "Target",
                componentType = componentType
            };
        }

        /// <summary>确保测试资产父目录存在且仍位于 Unity 工程目录中。</summary>
        /// <param name="assetPath">项目内资产路径。</param>
        private static void EnsureParent(string assetPath)
        {
            string directory = Path.GetDirectoryName(assetPath).Replace('\\', '/');
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(directory));
        }
    }
}
