using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.U2D;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>
    /// 创建和清理可重导入的 2D 骨骼测试资产，并保持资产路径隔离。
    /// </summary>
    internal sealed class RiggingTestAssets
    {
        private const int TextureSize = 32;
        private const float PixelsPerUnit = 100f;

        /// <summary>创建并导入一组骨骼、网格、动画、控制器和变体资产。</summary>
        /// <returns>当前测试独占的资源目录及其关键资产路径。</returns>
        public static RiggingTestAssets Create()
        {
            var assets = new RiggingTestAssets();
            assets.RootPath = "Assets/__UwtRiggingTests_" + Guid.NewGuid().ToString("N");
            assets.AbsoluteRootPath = Path.Combine(Application.dataPath, Path.GetFileName(assets.RootPath));
            Directory.CreateDirectory(assets.AbsoluteRootPath);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            try
            {
                assets.BaseSpritePath = assets.RootPath + "/Base.png";
                assets.VariantSpritePath = assets.RootPath + "/Variant.png";
                assets.IncompatibleSpritePath = assets.RootPath + "/Incompatible.png";
                assets.IdleClipPath = assets.RootPath + "/Idle.anim";
                assets.ActionClipPath = assets.RootPath + "/Action.anim";
                assets.HitClipPath = assets.RootPath + "/Hit.anim";
                assets.ControllerPath = assets.RootPath + "/Actor.controller";
                assets.PrefabPath = assets.RootPath + "/Actor.prefab";

                assets.BaseSprite = CreateSkinnedSprite(assets.BaseSpritePath, "BaseSprite", "Arm");
                assets.VariantSprite = CreateSkinnedSprite(assets.VariantSpritePath, "VariantSprite", "Arm");
                assets.IncompatibleSprite = CreateSkinnedSprite(assets.IncompatibleSpritePath, "IncompatibleSprite", "Hand");
                assets.IdleClip = CreateClip(assets.IdleClipPath, "Idle", 1f, true, 0f, 18f, 0f, null);
                assets.ActionClip = CreateClip(assets.ActionClipPath, "Action", 0.8f, false, 0f, 85f, 0f, "OnImpact");
                assets.HitClip = CreateClip(assets.HitClipPath, "Hit", 0.45f, false, 0f, -55f, 0f, null);
                assets.Controller = CreateController(assets.ControllerPath, assets.IdleClip, assets.ActionClip, assets.HitClip);
                assets.Prefab = CreateCharacterPrefab(
                    assets.PrefabPath,
                    assets.BaseSprite,
                    assets.Controller,
                    out SpriteSkinState skinState);
                assets.InitialSkinState = skinState;

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                return assets;
            }
            catch
            {
                // 夹具创建失败时立即回收唯一目录，避免后续测试把残留资源误判为输入。
                Cleanup(assets.RootPath);
                throw;
            }
        }

        /// <summary>在域重载后按原有唯一路径恢复测试资产句柄。</summary>
        /// <param name="rootPath">已创建的 Assets 子目录。</param>
        /// <returns>按固定文件名恢复的资源路径和加载对象。</returns>
        public static RiggingTestAssets Restore(string rootPath)
        {
            var assets = new RiggingTestAssets
            {
                RootPath = rootPath,
                AbsoluteRootPath = Path.Combine(Application.dataPath, Path.GetFileName(rootPath)),
                BaseSpritePath = rootPath + "/Base.png",
                VariantSpritePath = rootPath + "/Variant.png",
                IncompatibleSpritePath = rootPath + "/Incompatible.png",
                IdleClipPath = rootPath + "/Idle.anim",
                ActionClipPath = rootPath + "/Action.anim",
                HitClipPath = rootPath + "/Hit.anim",
                ControllerPath = rootPath + "/Actor.controller",
                PrefabPath = rootPath + "/Actor.prefab"
            };

            assets.BaseSprite = LoadSprite(assets.BaseSpritePath, "BaseSprite");
            assets.VariantSprite = LoadSprite(assets.VariantSpritePath, "VariantSprite");
            assets.IncompatibleSprite = LoadSprite(assets.IncompatibleSpritePath, "IncompatibleSprite");
            assets.IdleClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.IdleClipPath);
            assets.ActionClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.ActionClipPath);
            assets.HitClip = AssetDatabase.LoadAssetAtPath<AnimationClip>(assets.HitClipPath);
            assets.Controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(assets.ControllerPath);
            assets.Prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assets.PrefabPath);
            return assets;
        }

        /// <summary>删除当前测试独占的 Assets 子目录和它生成的 Unity 元数据。</summary>
        /// <param name="rootPath">需要清理的测试目录。</param>
        public static void Cleanup(string rootPath)
        {
            if (string.IsNullOrWhiteSpace(rootPath) ||
                !rootPath.StartsWith("Assets/__UwtRiggingTests_", StringComparison.Ordinal) ||
                rootPath.IndexOf("..", StringComparison.Ordinal) >= 0)
            {
                return;
            }

            if (AssetDatabase.IsValidFolder(rootPath))
            {
                AssetDatabase.DeleteAsset(rootPath);
            }

            string absoluteRoot = Path.Combine(Application.dataPath, Path.GetFileName(rootPath));
            if (Directory.Exists(absoluteRoot))
            {
                Directory.Delete(absoluteRoot, true);
            }

            string folderMeta = absoluteRoot + ".meta";
            if (File.Exists(folderMeta))
            {
                File.Delete(folderMeta);
            }

            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        }

        /// <summary>计算测试资产目录内每个文件的 SHA-256 快照，用于证明服务只读。</summary>
        /// <returns>相对路径到内容摘要的稳定映射。</returns>
        public Dictionary<string, string> CaptureSourceSnapshot()
        {
            var snapshot = new Dictionary<string, string>(StringComparer.Ordinal);
            if (!Directory.Exists(AbsoluteRootPath))
            {
                return snapshot;
            }

            foreach (string filePath in Directory.GetFiles(AbsoluteRootPath, "*", SearchOption.AllDirectories))
            {
                string relativePath = filePath.Substring(AbsoluteRootPath.Length + 1).Replace('\\', '/');
                using (SHA256 sha = SHA256.Create())
                using (FileStream stream = File.OpenRead(filePath))
                {
                    snapshot[relativePath] = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", string.Empty);
                }
            }

            return snapshot;
        }

        /// <summary>获取角色 Prefab 中负责网格变形的 SpriteSkin 状态。</summary>
        public SpriteSkinState InitialSkinState { get; private set; }

        /// <summary>获取当前测试专属 Unity 资源目录。</summary>
        public string RootPath { get; private set; }

        /// <summary>获取测试资源目录的绝对磁盘路径。</summary>
        public string AbsoluteRootPath { get; private set; }

        /// <summary>获取基础 Sprite 的项目相对路径。</summary>
        public string BaseSpritePath { get; private set; }

        /// <summary>获取兼容骨架变体 Sprite 的项目相对路径。</summary>
        public string VariantSpritePath { get; private set; }

        /// <summary>获取骨架不兼容变体 Sprite 的项目相对路径。</summary>
        public string IncompatibleSpritePath { get; private set; }

        /// <summary>获取待机动画片段路径。</summary>
        public string IdleClipPath { get; private set; }

        /// <summary>获取动作动画片段路径。</summary>
        public string ActionClipPath { get; private set; }

        /// <summary>获取受击动画片段路径。</summary>
        public string HitClipPath { get; private set; }

        /// <summary>获取 Animator Controller 路径。</summary>
        public string ControllerPath { get; private set; }

        /// <summary>获取角色 Prefab 路径。</summary>
        public string PrefabPath { get; private set; }

        /// <summary>获取基础 Sprite 资源。</summary>
        public Sprite BaseSprite { get; private set; }

        /// <summary>获取兼容骨架变体 Sprite 资源。</summary>
        public Sprite VariantSprite { get; private set; }

        /// <summary>获取骨架不兼容变体 Sprite 资源。</summary>
        public Sprite IncompatibleSprite { get; private set; }

        /// <summary>获取待机动画资源。</summary>
        public AnimationClip IdleClip { get; private set; }

        /// <summary>获取动作动画资源。</summary>
        public AnimationClip ActionClip { get; private set; }

        /// <summary>获取受击动画资源。</summary>
        public AnimationClip HitClip { get; private set; }

        /// <summary>获取角色 Animator Controller。</summary>
        public AnimatorController Controller { get; private set; }

        /// <summary>获取角色 Prefab。</summary>
        public GameObject Prefab { get; private set; }

        /// <summary>创建像素确定、无需外部图片文件的有效 Sprite 骨骼网格。</summary>
        /// <param name="assetPath">PNG 资源路径。</param>
        /// <param name="spriteName">Sprite 子资源名称。</param>
        /// <param name="armBoneName">第二根骨骼名称；可用其他名称构造不兼容变体。</param>
        /// <returns>经资产数据库重新导入并加载的 Sprite。</returns>
        private static Sprite CreateSkinnedSprite(string assetPath, string spriteName, string armBoneName)
        {
            File.WriteAllBytes(AbsolutePath(assetPath), CreateTextureBytes());
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);

            var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null)
            {
                throw new InvalidOperationException("测试 PNG 未被导入为 TextureImporter：" + assetPath);
            }

            importer.textureType = TextureImporterType.Sprite;
            // Multiple 模式会保留 SpriteRect.name；Single 模式在部分 Unity 版本中强制以纹理名命名子资源。
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.spritePixelsPerUnit = PixelsPerUnit;
            var importerSettings = new TextureImporterSettings();
            importer.ReadTextureSettings(importerSettings);
            importerSettings.spriteMeshType = SpriteMeshType.FullRect;
            importer.SetTextureSettings(importerSettings);
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.isReadable = true;
            importer.SaveAndReimport();

            importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
            if (importer == null)
            {
                throw new InvalidOperationException("测试 PNG 重导入后无法取得 TextureImporter：" + assetPath);
            }

            var factories = new SpriteDataProviderFactories();
            factories.Init();
            ISpriteEditorDataProvider provider = factories.GetSpriteEditorDataProviderFromObject(importer);
            if (provider == null)
            {
                throw new InvalidOperationException("测试纹理缺少 Sprite Editor 数据提供器：" + assetPath);
            }

            provider.InitSpriteEditorDataProvider();
            SpriteRect[] spriteRects = provider.GetSpriteRects();
            SpriteRect spriteRect = spriteRects.Length == 0 ? new SpriteRect() : spriteRects[0];
            spriteRect.spriteID = GUID.Generate();
            spriteRect.name = spriteName;
            spriteRect.rect = new Rect(0f, 0f, TextureSize, TextureSize);
            spriteRect.alignment = SpriteAlignment.Center;
            spriteRect.pivot = new Vector2(0.5f, 0.5f);
            provider.SetSpriteRects(new[] { spriteRect });

            ISpriteBoneDataProvider boneProvider = provider.GetDataProvider<ISpriteBoneDataProvider>();
            ISpriteMeshDataProvider meshProvider = provider.GetDataProvider<ISpriteMeshDataProvider>();
            if (boneProvider == null || meshProvider == null)
            {
                throw new InvalidOperationException("测试纹理缺少骨骼或网格数据提供器：" + assetPath);
            }

            boneProvider.SetBones(spriteRect.spriteID, CreateSpriteBones(armBoneName));
            meshProvider.SetVertices(spriteRect.spriteID, CreateVertices());
            meshProvider.SetIndices(spriteRect.spriteID, new[] { 0, 1, 2, 0, 2, 3 });
            meshProvider.SetEdges(spriteRect.spriteID, new[]
            {
                new Vector2Int(0, 1),
                new Vector2Int(1, 2),
                new Vector2Int(2, 3),
                new Vector2Int(3, 0)
            });
            provider.Apply();
            AssetDatabase.WriteImportSettingsIfDirty(assetPath);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);

            Sprite importedSprite = LoadSprite(assetPath, spriteName);
            if (importedSprite == null)
            {
                string importedNames = string.Join(", ", AssetDatabase.LoadAllAssetsAtPath(assetPath)
                    .OfType<Sprite>()
                    .Select(sprite => sprite.name));
                throw new InvalidOperationException(
                    "带骨骼的测试 Sprite 重新导入失败：" + assetPath + "；请求名称=" + spriteName + "；实际子资源=" + importedNames);
            }

            return importedSprite;
        }

        /// <summary>创建根骨与子骨，子骨名称允许用于构造骨架不兼容的 Sprite。</summary>
        /// <param name="armBoneName">第二根骨骼名称。</param>
        /// <returns>按父骨在前的顺序排列的骨骼定义。</returns>
        private static List<SpriteBone> CreateSpriteBones(string armBoneName)
        {
            return new List<SpriteBone>
            {
                new SpriteBone
                {
                    name = "RootBone",
                    position = new Vector3(TextureSize * 0.5f, 0f, 0f),
                    rotation = Quaternion.identity,
                    length = TextureSize,
                    parentId = -1,
                    guid = GUID.Generate().ToString()
                },
                new SpriteBone
                {
                    name = armBoneName,
                    position = new Vector3(TextureSize * 0.5f, TextureSize * 0.5f, 0f),
                    rotation = Quaternion.identity,
                    length = TextureSize * 0.5f,
                    parentId = 0,
                    guid = GUID.Generate().ToString()
                }
            };
        }

        /// <summary>创建带有确定性顶点和有效单骨权重的矩形 Sprite 网格。</summary>
        /// <returns>覆盖纹理区域的四个网格顶点。</returns>
        private static Vertex2DMetaData[] CreateVertices()
        {
            return new[]
            {
                CreateVertex(new Vector2(0f, 0f), 0),
                CreateVertex(new Vector2(TextureSize, 0f), 1),
                CreateVertex(new Vector2(TextureSize, TextureSize), 1),
                CreateVertex(new Vector2(0f, TextureSize), 0)
            };
        }

        /// <summary>为单个网格顶点分配 100% 到指定骨骼的权重。</summary>
        /// <param name="position">顶点在 Sprite 局部空间的位置。</param>
        /// <param name="boneIndex">目标骨骼索引。</param>
        /// <returns>包含位置和 BoneWeight 的 Sprite Editor 顶点元数据。</returns>
        private static Vertex2DMetaData CreateVertex(Vector2 position, int boneIndex)
        {
            return new Vertex2DMetaData
            {
                position = position,
                boneWeight = new BoneWeight
                {
                    boneIndex0 = boneIndex,
                    weight0 = 1f,
                    boneIndex1 = 0,
                    weight1 = 0f,
                    boneIndex2 = 0,
                    weight2 = 0f,
                    boneIndex3 = 0,
                    weight3 = 0f
                }
            };
        }

        /// <summary>生成所有像素一致的技术 PNG，用于避免测试依赖视觉生成素材。</summary>
        /// <returns>32×32、RGBA32 格式的确定性 PNG 字节。</returns>
        private static byte[] CreateTextureBytes()
        {
            var texture = new Texture2D(TextureSize, TextureSize, TextureFormat.RGBA32, false);
            try
            {
                var pixels = new Color32[TextureSize * TextureSize];
                for (int index = 0; index < pixels.Length; index++)
                {
                    byte shade = (byte)(96 + index % 128);
                    pixels[index] = new Color32(shade, (byte)(255 - shade), 180, 255);
                }

                texture.SetPixels32(pixels);
                texture.Apply(false, false);
                return texture.EncodeToPNG();
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        /// <summary>创建可驱动骨骼旋转的真实 Animator Clip，并可添加动画事件。</summary>
        /// <param name="assetPath">动画资源路径。</param>
        /// <param name="name">动画资源名称。</param>
        /// <param name="duration">动画时长。</param>
        /// <param name="loop">是否循环。</param>
        /// <param name="startAngle">起始骨骼角度。</param>
        /// <param name="middleAngle">中间骨骼角度。</param>
        /// <param name="endAngle">结束骨骼角度。</param>
        /// <param name="eventFunction">可选的动画事件函数名。</param>
        /// <returns>已保存到 AssetDatabase 的动画片段。</returns>
        private static AnimationClip CreateClip(
            string assetPath,
            string name,
            float duration,
            bool loop,
            float startAngle,
            float middleAngle,
            float endAngle,
            string eventFunction)
        {
            var clip = new AnimationClip
            {
                name = name,
                frameRate = 30f
            };
            var curve = new AnimationCurve(
                new Keyframe(0f, startAngle),
                new Keyframe(duration * 0.5f, middleAngle),
                new Keyframe(duration, endAngle));
            AnimationUtility.SetEditorCurve(
                clip,
                EditorCurveBinding.FloatCurve("VisualRig/RootBone/Arm", typeof(Transform), "localEulerAnglesRaw.z"),
                curve);

            AnimationClipSettings settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = loop;
            settings.loopBlend = false;
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            if (!string.IsNullOrWhiteSpace(eventFunction))
            {
                AnimationUtility.SetAnimationEvents(clip, new[]
                {
                    new AnimationEvent { time = duration * 0.375f, functionName = eventFunction }
                });
            }

            AssetDatabase.CreateAsset(clip, assetPath);
            return clip;
        }

        /// <summary>创建含待机、动作、受击状态及真实过渡条件的 Animator Controller。</summary>
        /// <param name="assetPath">Controller 资源路径。</param>
        /// <param name="idleClip">循环待机片段。</param>
        /// <param name="actionClip">触发动作片段。</param>
        /// <param name="hitClip">可中断动作的受击片段。</param>
        /// <returns>已保存的 Controller。</returns>
        private static AnimatorController CreateController(
            string assetPath,
            AnimationClip idleClip,
            AnimationClip actionClip,
            AnimationClip hitClip)
        {
            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(assetPath);
            controller.AddParameter("Action", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Interrupt", AnimatorControllerParameterType.Trigger);

            AnimatorStateMachine machine = controller.layers[0].stateMachine;
            AnimatorState idle = machine.defaultState;
            if (idle == null)
            {
                idle = machine.AddState("Idle");
                machine.defaultState = idle;
            }

            idle.name = "Idle";
            idle.motion = idleClip;
            AnimatorState action = machine.AddState("Action", new Vector3(240f, 0f, 0f));
            action.motion = actionClip;
            AnimatorState hit = machine.AddState("Hit", new Vector3(240f, 100f, 0f));
            hit.motion = hitClip;

            AnimatorStateTransition actionTransition = idle.AddTransition(action);
            actionTransition.AddCondition(AnimatorConditionMode.If, 0f, "Action");
            actionTransition.hasExitTime = false;
            actionTransition.duration = 0f;

            AnimatorStateTransition actionReturn = action.AddTransition(idle);
            actionReturn.hasExitTime = true;
            actionReturn.exitTime = 1f;
            actionReturn.duration = 0f;

            AnimatorStateTransition interruptTransition = machine.AddAnyStateTransition(hit);
            interruptTransition.AddCondition(AnimatorConditionMode.If, 0f, "Interrupt");
            interruptTransition.hasExitTime = false;
            interruptTransition.duration = 0f;
            interruptTransition.canTransitionToSelf = false;

            AnimatorStateTransition hitReturn = hit.AddTransition(idle);
            hitReturn.hasExitTime = true;
            hitReturn.exitTime = 1f;
            hitReturn.duration = 0f;

            EditorUtility.SetDirty(controller);
            return controller;
        }

        /// <summary>创建包含真实 SpriteSkin 绑定、Animator 和目标组件层级的角色 Prefab。</summary>
        /// <param name="assetPath">Prefab 资源路径。</param>
        /// <param name="sprite">角色当前使用的骨骼 Sprite。</param>
        /// <param name="controller">实际 Animator Controller。</param>
        /// <param name="skinState">接收 Unity SpriteSkin 的绑定状态。</param>
        /// <returns>保存并重新加载的角色 Prefab。</returns>
        private static GameObject CreateCharacterPrefab(
            string assetPath,
            Sprite sprite,
            AnimatorController controller,
            out SpriteSkinState skinState)
        {
            var actor = new GameObject("Actor");
            try
            {
                Animator animator = actor.AddComponent<Animator>();
                animator.runtimeAnimatorController = controller;
                actor.AddComponent<RiggingAnimationEventProbe>();

                var visualRig = new GameObject("VisualRig");
                visualRig.transform.SetParent(actor.transform, false);
                SpriteRenderer renderer = visualRig.AddComponent<SpriteRenderer>();
                renderer.sprite = sprite;

                SpriteSkin skin = visualRig.AddComponent<SpriteSkin>();
                skin.autoRebind = false;
                skin.alwaysUpdate = true;
                skin.forceCpuDeformation = true;

                Transform rootBone = CreateBone(visualRig.transform, "RootBone", new Vector3(0f, -0.16f, 0f));
                Transform armBone = CreateBone(rootBone, "Arm", new Vector3(0f, 0.16f, 0f));
                SpriteSkinState rootState = skin.SetRootBone(rootBone);
                skinState = skin.SetBoneTransforms(new[] { rootBone, armBone });
                if (skinState != SpriteSkinState.Ready)
                {
                    throw new InvalidOperationException(
                        "测试夹具骨骼绑定未进入 Ready 状态；root=" + rootState + ", bones=" + skinState);
                }

                GameObject prefab = PrefabUtility.SaveAsPrefabAsset(actor, assetPath);
                if (prefab == null)
                {
                    throw new InvalidOperationException("测试角色 Prefab 保存失败：" + assetPath);
                }

                GameObject importedPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
                if (importedPrefab == null || importedPrefab.GetComponent<RiggingAnimationEventProbe>() == null)
                {
                    throw new InvalidOperationException("测试 Prefab 重载后缺少动画事件接收组件：" + assetPath);
                }

                return importedPrefab;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(actor);
            }
        }

        /// <summary>在指定父节点下创建符合 SpriteBone 名称和本地姿势的骨骼 Transform。</summary>
        /// <param name="parent">父节点。</param>
        /// <param name="name">骨骼名称。</param>
        /// <param name="localPosition">绑定姿势位置。</param>
        /// <returns>新骨骼的 Transform。</returns>
        private static Transform CreateBone(Transform parent, string name, Vector3 localPosition)
        {
            var bone = new GameObject(name);
            bone.transform.SetParent(parent, false);
            bone.transform.localPosition = localPosition;
            bone.transform.localRotation = Quaternion.identity;
            return bone.transform;
        }

        /// <summary>加载纹理中名称唯一匹配的 Sprite 子资源。</summary>
        /// <param name="assetPath">Sprite 纹理路径。</param>
        /// <param name="spriteName">预期 Sprite 名称。</param>
        /// <returns>匹配的 Sprite；未找到时返回空。</returns>
        private static Sprite LoadSprite(string assetPath, string spriteName)
        {
            return AssetDatabase.LoadAllAssetsAtPath(assetPath)
                .OfType<Sprite>()
                .SingleOrDefault(sprite => string.Equals(sprite.name, spriteName, StringComparison.Ordinal));
        }

        /// <summary>将项目 Assets 相对资源路径映射到磁盘绝对路径。</summary>
        /// <param name="assetPath">Assets/ 开头的资源路径。</param>
        /// <returns>当前 Unity 项目中的绝对路径。</returns>
        private static string AbsolutePath(string assetPath)
        {
            return Path.Combine(Application.dataPath, assetPath.Substring("Assets/".Length).Replace('/', Path.DirectorySeparatorChar));
        }
    }

}
