using System;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Project.UnityWorkflow.Core.Models;
using Project.UnityWorkflow.RiggingValidation;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.U2D;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>验证角色级 2D 骨骼资产检查器对真实 Unity 资源的工程判断。</summary>
    public sealed class RiggingValidationTests
    {
        private RiggingTestAssets assets;

        /// <summary>每项检查使用独立导入目录，避免测试之间共享或污染资源。</summary>
        [SetUp]
        public void SetUp()
        {
            assets = RiggingTestAssets.Create();
        }

        /// <summary>无论断言成功或失败都删除本测试独占的资源目录。</summary>
        [TearDown]
        public void TearDown()
        {
            if (assets != null)
            {
                RiggingTestAssets.Cleanup(assets.RootPath);
                assets = null;
            }
        }

        /// <summary>确认实际导入的蒙皮角色、控制器、片段、事件接收器和兼容变体可通过工程检查。</summary>
        [Test]
        public void Validate_CompleteImportedCharacter_PassesEngineeringChecksAndDoesNotModifySources()
        {
            Assert.That(assets.InitialSkinState, Is.EqualTo(SpriteSkinState.Ready), "夹具必须使用真实 SpriteSkin 绑定进入 Ready。");
            Assert.That(assets.BaseSprite.GetBones().Length, Is.EqualTo(2), "Sprite 必须在重导入后保留两根运行时骨骼。");
            Assert.That(assets.BaseSprite.GetBindPoses().Length, Is.EqualTo(2), "Sprite 必须在重导入后生成匹配的 bind pose。");

            Dictionary<string, string> sourceSnapshot = assets.CaptureSourceSnapshot();
            QualityReportDto report = Validate(CreateRequest());

            Assert.That(report.Status, Is.EqualTo("PASS"), FormatChecks(report));
            Assert.That(report.Checks, Is.Not.Empty);
            Assert.That(report.Checks.All(check => check.Status == "PASS"), Is.True, FormatChecks(report));
            QualityCheckDto scope = FindCheck(report, "engineering-only-scope");
            Assert.That(scope.Status, Is.EqualTo("PASS"));
            StringAssert.Contains("运行行为为 NOT_RUN", scope.Message);
            StringAssert.Contains("视觉表现为 NOT_RUN", scope.Message);
            Assert.That(report.Checks.Any(check => check.Id.Contains("runtime-behavior")), Is.False,
                "工程报告不能把未运行的角色回归误报为 PASS。");
            Assert.That(report.Checks.Any(check => check.Id.Contains("visual-quality")), Is.False,
                "工程报告不能把人工视觉验收误报为 PASS。");

            CollectionAssert.AreEquivalent(sourceSnapshot, assets.CaptureSourceSnapshot(),
                "资产检查服务只能读取输入，不能改写 Prefab、Sprite、Clip 或其元数据。");
        }

        /// <summary>确认成功检查报告只使用 Unity 读取到的 Prefab、动画、变体和递归依赖 GUID。</summary>
        [Test]
        public void Validate_ImportedSources_ReportsActualPrefabAndRecursiveAssetGuids()
        {
            RiggingValidationRequest request = CreateRequest();
            QualityReportDto report = Validate(request);

            AssertCheckStatus(report, "asset-source-evidence", "PASS");
            EvidenceDto prefab = report.Evidence.Single(evidence => evidence.Type == "rigging-prefab");
            Assert.That(prefab.Path, Is.EqualTo(assets.PrefabPath));
            Assert.That(prefab.SubjectId, Is.EqualTo(AssetDatabase.AssetPathToGUID(assets.PrefabPath).ToLowerInvariant()));
            Assert.That(prefab.SubjectVersion, Is.EqualTo(request.SourceRevision));
            Assert.That(prefab.SourceRevision, Is.EqualTo(request.SourceRevision));

            EvidenceDto[] dependencies = report.Evidence.Where(evidence => evidence.Type == "rigging-dependency").ToArray();
            Assert.That(dependencies, Is.Not.Empty, "门禁需要真实的项目资源依赖身份。");
            Assert.That(dependencies.Any(evidence => evidence.Path == assets.PrefabPath), Is.False,
                "Prefab 只应使用专用 rigging-prefab 类型记录。");
            foreach (string expectedPath in new[]
                     {
                         assets.ControllerPath,
                         assets.IdleClipPath,
                         assets.ActionClipPath,
                         assets.HitClipPath,
                         assets.BaseSpritePath,
                         assets.VariantSpritePath
                     })
            {
                Assert.That(dependencies.Any(evidence => evidence.Path == expectedPath), Is.True,
                    "递归来源清单缺少输入资源 " + expectedPath + "。");
            }

            foreach (EvidenceDto evidence in report.Evidence)
            {
                Assert.That(evidence.SubjectId, Is.EqualTo(AssetDatabase.AssetPathToGUID(evidence.Path).ToLowerInvariant()));
                Assert.That(evidence.SubjectVersion, Is.EqualTo(request.SourceRevision));
                Assert.That(evidence.SourceRevision, Is.EqualTo(request.SourceRevision));
                string absolutePath = Project.UnityWorkflow.Core.WorkflowPaths.ResolveProjectRelative(evidence.Path);
                Assert.That(System.IO.File.Exists(absolutePath), Is.True, "来源必须对应真实项目文件。");
                Assert.That(System.IO.File.Exists(absolutePath + ".meta"), Is.True, "来源必须有真实 Unity meta 文件。");
            }
        }

        /// <summary>确认缺失 Clip 不会因请求文本而伪装成已经加载的来源证据。</summary>
        [Test]
        public void Validate_MissingRequestedClip_FailsSourceEvidenceWithoutClaimingItsPath()
        {
            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].ClipPath = assets.RootPath + "/Missing.anim";

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertCheckStatus(report, "asset-source-evidence", "FAIL");
            Assert.That(report.Evidence.Any(evidence => evidence.Path == request.Clips[1].ClipPath), Is.False,
                "未能由 AssetDatabase 加载的请求路径不得进入来源清单。");
            Assert.That(report.Evidence.All(evidence => !string.IsNullOrWhiteSpace(evidence.SubjectId)), Is.True,
                "失败报告也不得包含伪造或空的资源身份。");
        }

        /// <summary>确认越界变体路径在来源加载阶段被拒绝且不会进入来源证据。</summary>
        [Test]
        public void Validate_VariantPathTraversal_FailsBeforeSourceEvidence()
        {
            RiggingValidationRequest request = CreateRequest();
            request.Variants[0].SpritePath = "Assets/../Outside.png";

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertCheckStatus(report, "asset-source-evidence", "FAIL");
            Assert.That(report.Evidence.Any(evidence => evidence.Path == request.Variants[0].SpritePath), Is.False,
                "越界请求路径不得被读取或写入来源清单。");
            AssertCheckStatus(report, "variant-00-sprite-resource", "FAIL");
        }

        /// <summary>确认缺少 SpriteSkin 的角色被拒绝。</summary>
        [Test]
        public void Validate_CharacterWithoutSpriteSkin_FailsSkinPresence()
        {
            MutatePrefab(root => UnityEngine.Object.DestroyImmediate(root.GetComponentInChildren<SpriteSkin>(true)));

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertCheckStatus(report, "sprite-skin-presence", "FAIL");
        }

        /// <summary>确认缺少根骨的蒙皮映射不会通过。</summary>
        [Test]
        public void Validate_SpriteSkinWithoutRootBone_FailsSkinMapping()
        {
            MutatePrefab(root => root.GetComponentInChildren<SpriteSkin>(true).SetRootBone(null));

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.Contains("skin-mapping"));
        }

        /// <summary>确认重复使用同一 Transform 绑定多个 SpriteBone 时会失败。</summary>
        [Test]
        public void Validate_DuplicateBoneTransform_FailsSkinMapping()
        {
            MutatePrefab(root =>
            {
                SpriteSkin skin = root.GetComponentInChildren<SpriteSkin>(true);
                Transform[] transforms = skin.boneTransforms;
                Assert.That(transforms, Has.Length.EqualTo(2));
                skin.SetBoneTransforms(new[] { transforms[0], transforms[0] });
            });

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.Contains("skin-mapping"));
        }

        /// <summary>确认可持久化的越界正权重骨骼索引由检查器拒绝。</summary>
        [Test]
        public void Validate_PersistedOutOfRangeBoneWeightIndex_FailsWeightCheck()
        {
            RewriteBaseSpriteData((vertices, _) =>
            {
                BoneWeight weight = vertices[0].boneWeight;
                weight.boneIndex0 = 99;
                weight.weight0 = 1f;
                weight.weight1 = 0f;
                weight.weight2 = 0f;
                weight.weight3 = 0f;
                vertices[0].boneWeight = weight;
            });
            Vertex2DMetaData[] persisted = ReadBaseSpriteVertices();
            Assert.That(persisted[0].boneWeight.boneIndex0, Is.EqualTo(99),
                "只有确认非法索引经 AssetDatabase 重导入后仍可观察，才把它作为坏资产送入检查器。");

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.EndsWith("-bone-weights", StringComparison.Ordinal));
        }

        /// <summary>确认 Unity 可持久化的退化三角形由网格检查拒绝。</summary>
        [Test]
        public void Validate_PersistedDegenerateTriangle_FailsMeshTopology()
        {
            RewriteBaseSpriteData((vertices, _) => vertices[2].position = vertices[1].position);
            Vertex2DMetaData[] persisted = ReadBaseSpriteVertices();
            Assert.That(persisted[1].position, Is.EqualTo(persisted[2].position),
                "只有确认退化顶点经重导入后仍可观察，才把它作为坏网格送入检查器。");

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.EndsWith("-mesh-topology", StringComparison.Ordinal));
        }

        /// <summary>确认 Controller 未引用请求动作片段时报告绑定失败。</summary>
        [Test]
        public void Validate_ControllerStateWithoutRequestedClip_FailsClipBinding()
        {
            AnimatorState actionState = assets.Controller.layers[0].stateMachine.states
                .Select(child => child.state)
                .Single(state => state.name == "Action");
            actionState.motion = null;
            EditorUtility.SetDirty(assets.Controller);
            AssetDatabase.SaveAssets();

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.StartsWith("clip-01-", StringComparison.Ordinal) &&
                id.EndsWith("controller-reference", StringComparison.Ordinal));
        }

        /// <summary>确认缺少必需动画事件的动作片段失败。</summary>
        [Test]
        public void Validate_ClipMissingRequiredAnimationEvent_FailsEventRequirement()
        {
            AnimationUtility.SetAnimationEvents(assets.ActionClip, Array.Empty<AnimationEvent>());
            EditorUtility.SetDirty(assets.ActionClip);
            AssetDatabase.SaveAssets();

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.Contains("event"));
        }

        /// <summary>确认已保存的 AnimationEvent 可将 Texture2D 引用传给匹配的 Unity 对象接收器。</summary>
        [Test]
        public void Validate_ClipEventWithMatchingObjectParameter_PassesAfterReload()
        {
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(assets.BaseSpritePath);
            PersistActionEvents(new AnimationEvent
            {
                time = assets.ActionClip.length * 0.375f,
                functionName = "OnImpactTexture",
                objectReferenceParameter = texture
            });
            AnimationEvent persisted = AnimationUtility.GetAnimationEvents(
                AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.ActionClipPath)).Single();
            Assert.That(persisted.functionName, Is.EqualTo("OnImpactTexture"));
            Assert.That(persisted.objectReferenceParameter, Is.TypeOf<Texture2D>());
            Assert.That(AssetDatabase.GetAssetPath(persisted.objectReferenceParameter), Is.EqualTo(assets.BaseSpritePath));

            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].RequiredEvents = new List<string> { "OnImpactTexture" };
            QualityReportDto report = Validate(request);

            Assert.That(report.Status, Is.EqualTo("PASS"), FormatChecks(report));
            AssertCheckStatus(report, "clip-01-events", "PASS");
        }

        /// <summary>确认对象引用与接收器参数不兼容时，即使事件名称匹配也会失败。</summary>
        [Test]
        public void Validate_ClipEventTextureReferenceToTransformReceiver_FailsAfterReload()
        {
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(assets.BaseSpritePath);
            PersistActionEvents(new AnimationEvent
            {
                time = assets.ActionClip.length * 0.375f,
                functionName = "OnImpactTransform",
                objectReferenceParameter = texture
            });
            AnimationEvent persisted = AnimationUtility.GetAnimationEvents(
                AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.ActionClipPath)).Single();
            Assert.That(persisted.functionName, Is.EqualTo("OnImpactTransform"));
            Assert.That(persisted.objectReferenceParameter, Is.TypeOf<Texture2D>());
            Assert.That(AssetDatabase.GetAssetPath(persisted.objectReferenceParameter), Is.EqualTo(assets.BaseSpritePath));

            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].RequiredEvents = new List<string> { "OnImpactTransform" };
            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertCheckStatus(report, "clip-01-events", "FAIL");
        }

        /// <summary>确认空 Unity 对象参数不会被错误地当成不匹配的非空引用。</summary>
        [Test]
        public void Validate_ClipEventWithNullObjectParameter_PassesAfterReload()
        {
            PersistActionEvents(new AnimationEvent
            {
                time = assets.ActionClip.length * 0.375f,
                functionName = "OnImpactTexture",
                objectReferenceParameter = null
            });
            AnimationEvent persisted = AnimationUtility.GetAnimationEvents(
                AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.ActionClipPath)).Single();
            Assert.That(persisted.functionName, Is.EqualTo("OnImpactTexture"));
            Assert.That(persisted.objectReferenceParameter, Is.Null);

            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].RequiredEvents = new List<string> { "OnImpactTexture" };
            QualityReportDto report = Validate(request);

            Assert.That(report.Status, Is.EqualTo("PASS"), FormatChecks(report));
            AssertCheckStatus(report, "clip-01-events", "PASS");
        }

        /// <summary>确认 Simple1D BlendTree 的 Float 参数缺失或声明为 Trigger 都会失败。</summary>
        /// <param name="parameterName">BlendTree 实际使用的参数。</param>
        /// <param name="expectedType">参数若存在时应为 Float；测试夹具故意创建其他类型。</param>
        [TestCase("MissingBlendWeight", AnimatorControllerParameterType.Float)]
        [TestCase("Action", AnimatorControllerParameterType.Trigger)]
        public void Validate_BlendTreeWithMissingOrWrongFloatParameter_FailsControllerGraph(
            string parameterName,
            AnimatorControllerParameterType expectedType)
        {
            var blendTree = new BlendTree
            {
                name = "ActionBlendTree",
                blendType = BlendTreeType.Simple1D,
                blendParameter = parameterName,
                useAutomaticThresholds = false
            };
            blendTree.AddChild(assets.IdleClip, 0f);
            blendTree.AddChild(assets.ActionClip, 1f);
            AssetDatabase.AddObjectToAsset(blendTree, assets.Controller);
            AnimatorState actionState = assets.Controller.layers[0].stateMachine.states
                .Select(child => child.state)
                .Single(state => state.name == "Action");
            actionState.motion = blendTree;
            EditorUtility.SetDirty(blendTree);
            EditorUtility.SetDirty(assets.Controller);
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(assets.ControllerPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);

            AnimatorController persistedController = AssetDatabase.LoadAssetAtPath<AnimatorController>(assets.ControllerPath);
            AnimatorState persistedAction = persistedController.layers[0].stateMachine.states
                .Select(child => child.state)
                .Single(state => state.name == "Action");
            Assert.That(persistedAction.motion, Is.TypeOf<BlendTree>(), "负例必须是已保存的真实 BlendTree。");
            AnimatorControllerParameter persistedParameter = persistedController.parameters
                .SingleOrDefault(parameter => parameter.name == parameterName);
            if (expectedType == AnimatorControllerParameterType.Trigger)
            {
                Assert.That(persistedParameter, Is.Not.Null, "错误类型负例参数需在 Controller 重载后仍然存在。");
                Assert.That(persistedParameter.type, Is.EqualTo(expectedType));
            }
            else
            {
                Assert.That(persistedParameter, Is.Null, "缺失参数需在 Controller 重载后仍然缺失。");
            }

            string expectedControllerError = expectedType == AnimatorControllerParameterType.Trigger
                ? "BlendTree \"ActionBlendTree\" in state \"Action\" in Controller \"Actor\" uses parameter \"Action\" which is not float type."
                : "BlendTree \"ActionBlendTree\" in state \"Action\" in Controller \"Actor\" uses parameter \"MissingBlendWeight\" which does not exist.";
            LogAssert.Expect(LogType.Error, expectedControllerError);
            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertCheckStatus(report, "controller-transition-parameters", "FAIL");
            AssertCheckStatus(report, "clip-01-controller-reference", "PASS");
        }

        /// <summary>确认 Unity 持久化时扩展片段时长以覆盖事件时间，检查器按重导入后的边界接受它。</summary>
        [Test]
        public void Validate_AnimationEventBeyondClipLength_ExtendsClipDuration()
        {
            float originalLength = assets.ActionClip.length;
            PersistActionEvents(new AnimationEvent
            {
                time = originalLength + 0.2f,
                functionName = "OnImpact"
            });
            AnimationClip persistedClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.ActionClipPath);
            AnimationEvent[] persisted = AnimationUtility.GetAnimationEvents(persistedClip);
            Assert.That(persisted, Has.Length.EqualTo(1));
            Assert.That(persistedClip.length, Is.GreaterThan(originalLength));
            Assert.That(persisted[0].time, Is.EqualTo(persistedClip.length).Within(0.0001f),
                "Unity 会扩展片段末尾并将事件保留在末尾，因此此输入不再是可持久化的越界缺陷。");

            QualityReportDto report = Validate(CreateRequest());

            Assert.That(report.Status, Is.EqualTo("PASS"), FormatChecks(report));
            AssertCheckStatus(report, "clip-01-events", "PASS");
        }

        /// <summary>确认片段实际循环设置与请求不符时失败。</summary>
        [Test]
        public void Validate_ActionClipLoopMismatch_FailsLoopRequirement()
        {
            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(assets.ActionClip);
            settings.loopTime = true;
            AnimationUtility.SetAnimationClipSettings(assets.ActionClip, settings);
            EditorUtility.SetDirty(assets.ActionClip);
            AssetDatabase.SaveAssets();

            QualityReportDto report = Validate(CreateRequest());

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.Contains("loop"));
        }

        /// <summary>确认骨骼名称不兼容的实际 Sprite 变体不能映射到角色骨架。</summary>
        [Test]
        public void Validate_VariantWithDifferentSkeleton_FailsSkeletonCompatibility()
        {
            RiggingValidationRequest request = CreateRequest();
            request.Variants[0].SpritePath = assets.IncompatibleSpritePath;
            request.Variants[0].SpriteName = "IncompatibleSprite";

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertAnyFailedCheck(report, id => id.Contains("skeleton-compatibility"));
        }

        /// <summary>确认重复动画需求 ID 被请求边界校验拒绝。</summary>
        [Test]
        public void Validate_DuplicateClipRequirementId_FailsRequestValidation()
        {
            RiggingValidationRequest request = CreateRequest();
            request.Clips.Add(new RiggingClipRequirement
            {
                Id = "action",
                ClipPath = assets.ActionClipPath,
                Loop = false,
                RequiredEvents = new List<string> { "OnImpact" }
            });

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            Assert.That(report.Checks.Select(check => check.Id).Distinct(StringComparer.Ordinal).Count(),
                Is.EqualTo(report.Checks.Count), "重复请求仍需生成唯一、可追踪的报告检查 ID。");
            AssertCheckStatus(report, "clip-requirement-action-duplicate-02", "FAIL");
        }

        /// <summary>确认路径穿越请求在读取角色资源之前被拒绝。</summary>
        [Test]
        public void Validate_PrefabPathTraversal_FailsBeforeAssetRead()
        {
            RiggingValidationRequest request = CreateRequest();
            request.PrefabPath = "Assets/../outside.prefab";

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertCheckStatus(report, "prefab-path", "FAIL");
            AssertCheckStatus(report, "prefab-load", "BLOCKED");
        }

        /// <summary>确认动画资源路径穿越在请求边界处被拒绝。</summary>
        [Test]
        public void Validate_ClipPathTraversal_FailsRequestValidation()
        {
            RiggingValidationRequest request = CreateRequest();
            request.Clips[1].ClipPath = "Assets/../outside.anim";

            QualityReportDto report = Validate(request);

            AssertFailure(report);
            AssertCheckStatus(report, "clip-requirement-action", "FAIL");
        }

        /// <summary>创建符合当前测试资产的服务输入契约。</summary>
        /// <returns>包含三个实际动画片段与一个骨架兼容变体的请求。</returns>
        private RiggingValidationRequest CreateRequest()
        {
            return new RiggingValidationRequest
            {
                SchemaVersion = "1.0",
                TaskId = "rigging-editor-regression",
                ProjectId = "unity-workflow-toolkit-tests",
                SourceRevision = "test-fixture",
                PrefabPath = assets.PrefabPath,
                OutputPath = "Artifacts/rigging-tests/" + System.IO.Path.GetFileName(assets.RootPath) + ".json",
                Clips = new List<RiggingClipRequirement>
                {
                    new RiggingClipRequirement { Id = "idle", ClipPath = assets.IdleClipPath, Loop = true },
                    new RiggingClipRequirement
                    {
                        Id = "action",
                        ClipPath = assets.ActionClipPath,
                        Loop = false,
                        RequiredEvents = new List<string> { "OnImpact" }
                    },
                    new RiggingClipRequirement { Id = "hit", ClipPath = assets.HitClipPath, Loop = false }
                },
                Variants = new List<RiggingVariantRequirement>
                {
                    new RiggingVariantRequirement
                    {
                        Id = "alternate-pose",
                        RendererPath = "VisualRig",
                        SpritePath = assets.VariantSpritePath,
                        SpriteName = "VariantSprite"
                    }
                }
            };
        }

        /// <summary>对当前请求执行只读资产验证服务。</summary>
        /// <param name="request">待验证的角色要求。</param>
        /// <returns>服务生成的检查报告。</returns>
        private static QualityReportDto Validate(RiggingValidationRequest request)
        {
            return new RiggingValidationService().Validate(request);
        }

        /// <summary>在临时加载的 Prefab 内容上执行变更并保存至当前隔离夹具。</summary>
        /// <param name="mutate">仅修改测试专属 Prefab 的操作。</param>
        private void MutatePrefab(Action<GameObject> mutate)
        {
            GameObject root = PrefabUtility.LoadPrefabContents(assets.PrefabPath);
            try
            {
                mutate(root);
                PrefabUtility.SaveAsPrefabAsset(root, assets.PrefabPath);
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(root);
            }
        }

        /// <summary>通过公开 Sprite Editor 数据提供器修改并重新导入基础 Sprite 网格。</summary>
        /// <param name="mutate">接收可变顶点和索引的测试缺陷注入操作。</param>
        private void RewriteBaseSpriteData(Action<Vertex2DMetaData[], int[]> mutate)
        {
            var importer = AssetImporter.GetAtPath(assets.BaseSpritePath) as TextureImporter;
            Assert.That(importer, Is.Not.Null, "测试基础 Sprite 必须使用 TextureImporter。");
            var factories = new SpriteDataProviderFactories();
            factories.Init();
            ISpriteEditorDataProvider provider = factories.GetSpriteEditorDataProviderFromObject(importer);
            Assert.That(provider, Is.Not.Null, "测试纹理必须支持公开 Sprite Editor 数据接口。");
            provider.InitSpriteEditorDataProvider();
            SpriteRect spriteRect = provider.GetSpriteRects().Single(rect => rect.name == "BaseSprite");
            ISpriteMeshDataProvider meshProvider = provider.GetDataProvider<ISpriteMeshDataProvider>();
            Assert.That(meshProvider, Is.Not.Null);
            Vertex2DMetaData[] vertices = meshProvider.GetVertices(spriteRect.spriteID);
            int[] indices = meshProvider.GetIndices(spriteRect.spriteID);
            Vector2Int[] edges = meshProvider.GetEdges(spriteRect.spriteID);
            mutate(vertices, indices);
            meshProvider.SetVertices(spriteRect.spriteID, vertices);
            meshProvider.SetIndices(spriteRect.spriteID, indices);
            // Apply 会完整重建网格序列化数据；即使只变更顶点，也需保留并回写已有边集。
            meshProvider.SetEdges(spriteRect.spriteID, edges);
            provider.Apply();
            AssetDatabase.WriteImportSettingsIfDirty(assets.BaseSpritePath);
            AssetDatabase.ImportAsset(assets.BaseSpritePath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
        }

        /// <summary>保存并重新导入动作片段中的事件，确保验证读取到的是持久化数据。</summary>
        /// <param name="animationEvent">待保存的真实 Unity AnimationEvent。</param>
        private void PersistActionEvents(AnimationEvent animationEvent)
        {
            AnimationUtility.SetAnimationEvents(assets.ActionClip, new[] { animationEvent });
            EditorUtility.SetDirty(assets.ActionClip);
            AssetDatabase.SaveAssets();
            AssetDatabase.ImportAsset(assets.ActionClipPath,
                ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
        }

        /// <summary>重导入后重新读取基础 Sprite 的持久化编辑器顶点。</summary>
        /// <returns>经导入管线保存的顶点与权重。</returns>
        private Vertex2DMetaData[] ReadBaseSpriteVertices()
        {
            var importer = AssetImporter.GetAtPath(assets.BaseSpritePath) as TextureImporter;
            var factories = new SpriteDataProviderFactories();
            factories.Init();
            ISpriteEditorDataProvider provider = factories.GetSpriteEditorDataProviderFromObject(importer);
            provider.InitSpriteEditorDataProvider();
            SpriteRect spriteRect = provider.GetSpriteRects().Single(rect => rect.name == "BaseSprite");
            return provider.GetDataProvider<ISpriteMeshDataProvider>().GetVertices(spriteRect.spriteID);
        }

        /// <summary>断言报告整体失败，避免只检查局部提示而放过错误汇总状态。</summary>
        /// <param name="report">待断言报告。</param>
        private static void AssertFailure(QualityReportDto report)
        {
            Assert.That(report.Status, Is.EqualTo("FAIL"), FormatChecks(report));
        }

        /// <summary>断言指定检查 ID 的状态。</summary>
        /// <param name="report">待检查报告。</param>
        /// <param name="id">稳定检查 ID。</param>
        /// <param name="status">预期状态。</param>
        private static void AssertCheckStatus(QualityReportDto report, string id, string status)
        {
            Assert.That(FindCheck(report, id).Status, Is.EqualTo(status), FormatChecks(report));
        }

        /// <summary>在报告中查找指定 ID，并提供实际 ID 清单帮助定位合同变更。</summary>
        /// <param name="report">待查报告。</param>
        /// <param name="id">目标检查 ID。</param>
        /// <returns>唯一匹配的检查项。</returns>
        private static QualityCheckDto FindCheck(QualityReportDto report, string id)
        {
            QualityCheckDto check = report.Checks.SingleOrDefault(candidate => candidate.Id == id);
            Assert.That(check, Is.Not.Null, "缺少检查项 " + id + "。当前项：" + FormatChecks(report));
            return check;
        }

        /// <summary>确认报告中至少存在一项 ID 符合条件的失败检查。</summary>
        /// <param name="report">待检查报告。</param>
        /// <param name="predicate">检查 ID 过滤条件。</param>
        private static void AssertAnyFailedCheck(QualityReportDto report, Func<string, bool> predicate)
        {
            Assert.That(report.Checks.Any(check => predicate(check.Id) && check.Status == "FAIL"), Is.True,
                "未找到预期失败检查。实际项：" + FormatChecks(report));
        }

        /// <summary>将报告检查 ID、状态和消息格式化到 NUnit 失败输出。</summary>
        /// <param name="report">待格式化报告。</param>
        /// <returns>简短的报告检查摘要。</returns>
        private static string FormatChecks(QualityReportDto report)
        {
            return report == null ? "报告为空。" : string.Join("; ", report.Checks.Select(check =>
                check.Id + "=" + check.Status + " (" + check.Message + ")"));
        }
    }
}
