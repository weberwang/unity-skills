using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Project.UnityWorkflow.Core;
using UnityEditor;
using UnityEngine;
using UnityEngine.U2D;
using UnityEngine.UI;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>从 AnimationClip 对象引用曲线和 Prefab 实例数据读取序列帧交接事实。</summary>
    internal static class FrameAnimationSnapshotReader
    {
        private const string SpritePropertyName = "m_Sprite";

        /// <summary>读取动画请求的唯一 Clip、Sprite 曲线、消费者和可选图集。</summary>
        /// <param name="request">单条动画请求。</param>
        /// <param name="error">任一实际数据缺失时返回中文诊断。</param>
        /// <returns>包含实际读取字段或空字段的动画快照。</returns>
        public static ResourceHandoffAnimationSnapshot Read(
            ResourceHandoffAnimationRequest request,
            out string error)
        {
            error = null;
            var snapshot = new ResourceHandoffAnimationSnapshot
            {
                animationId = request == null ? null : request.animationId,
                bindingPath = request == null ? null : request.bindingPath,
                componentType = request == null ? null : request.componentType,
                frames = new List<ResourceHandoffFrameSnapshot>()
            };

            if (request == null || string.IsNullOrWhiteSpace(request.animationId))
            {
                error = "存在缺少 animationId 的动画请求。";
                return snapshot;
            }

            try
            {
                snapshot.clipPath = ResourceHandoffPath.RequireAssetPath(request.clipPath);
                if (!string.Equals(Path.GetExtension(snapshot.clipPath), ".anim", StringComparison.OrdinalIgnoreCase) ||
                    AssetDatabase.GetMainAssetTypeAtPath(snapshot.clipPath) != typeof(AnimationClip))
                {
                    error = "序列帧检查仅支持独立的 .anim AnimationClip 主资源。";
                    return snapshot;
                }

                AnimationClip clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(snapshot.clipPath);
                if (clip == null)
                {
                    error = "独立 .anim AnimationClip 主资源无法读取。";
                    return snapshot;
                }

                if (!AssetDatabase.TryGetGUIDAndLocalFileIdentifier(clip, out string clipGuid, out long clipLocalId) ||
                    string.IsNullOrWhiteSpace(clipGuid))
                {
                    error = "AnimationClip 缺少可验证的 GUID 和 localId。";
                    return snapshot;
                }

                snapshot.clipPath = AssetDatabase.GetAssetPath(clip);
                snapshot.clipGuid = clipGuid;
                snapshot.clipLocalId = clipLocalId.ToString(CultureInfo.InvariantCulture);
                snapshot.frameRate = clip.frameRate;
                snapshot.duration = clip.length;
                snapshot.loop = AnimationUtility.GetAnimationClipSettings(clip).loopTime;
                if (!IsFinite(clip.frameRate) || clip.frameRate <= 0f)
                {
                    error = "AnimationClip 的实际帧率必须是有限正值。";
                }

                if (!IsFinite(clip.length) || clip.length <= 0f)
                {
                    error = AppendError(error, "AnimationClip 的实际时长必须是有限正值。保留读取到的原值供诊断。");
                }

                var frameSprites = new List<Sprite>();
                if (!TryGetBoundSpriteCurve(clip, request, snapshot.frames, frameSprites, out string curveError))
                {
                    error = AppendError(error, curveError);
                }

                snapshot.consumer = ReadConsumer(request, clip, out string consumerError);
                if (!string.IsNullOrEmpty(consumerError))
                {
                    error = AppendError(error, consumerError);
                }

                if (!string.IsNullOrWhiteSpace(request.atlasPath))
                {
                    snapshot.atlas = ReadAtlas(request, frameSprites, out string atlasError);
                    if (!string.IsNullOrEmpty(atlasError))
                    {
                        error = AppendError(error, atlasError);
                    }
                }
            }
            catch (ArgumentException)
            {
                error = AppendError(error, "动画、Prefab 或图集路径不符合项目内 Assets 路径约定。");
            }
            catch (Exception)
            {
                error = AppendError(error, "Unity 无法读取动画曲线或消费者 Prefab 实际数据。");
            }

            return snapshot;
        }

        /// <summary>读取请求组件和绑定路径上的唯一 m_Sprite 对象引用曲线。</summary>
        /// <param name="clip">实际 AnimationClip。</param>
        /// <param name="request">请求的组件与相对绑定路径。</param>
        /// <param name="frames">接收实测帧的列表。</param>
        /// <param name="frameSprites">保留真实曲线 Sprite 对象供后续图集绑定判断。</param>
        /// <param name="error">曲线缺失、歧义或值非法时的诊断。</param>
        /// <returns>曲线唯一且含有效 Sprite 帧时为 true。</returns>
        private static bool TryGetBoundSpriteCurve(
            AnimationClip clip,
            ResourceHandoffAnimationRequest request,
            List<ResourceHandoffFrameSnapshot> frames,
            List<Sprite> frameSprites,
            out string error)
        {
            error = null;
            if (!TryGetCurveComponentType(request.componentType, out Type componentType) ||
                !IsValidBindingPath(request.bindingPath))
            {
                error = "Sprite 曲线组件类型或绑定路径无效。";
                return false;
            }

            EditorCurveBinding[] matchingBindings =
                (AnimationUtility.GetObjectReferenceCurveBindings(clip) ?? Array.Empty<EditorCurveBinding>())
                .Where(binding =>
                    string.Equals(binding.path ?? string.Empty, request.bindingPath, StringComparison.Ordinal) &&
                    binding.type == componentType &&
                    string.Equals(binding.propertyName, SpritePropertyName, StringComparison.Ordinal))
                .ToArray();
            if (matchingBindings.Length != 1)
            {
                error = "AnimationClip 未提供该组件和绑定路径的唯一 m_Sprite 曲线。";
                return false;
            }

            ObjectReferenceKeyframe[] keys = AnimationUtility.GetObjectReferenceCurve(clip, matchingBindings[0]) ??
                                              Array.Empty<ObjectReferenceKeyframe>();
            if (keys.Length == 0)
            {
                error = "AnimationClip 的 m_Sprite 曲线没有关键帧。";
                return false;
            }

            foreach (ObjectReferenceKeyframe key in keys)
            {
                if (!IsFinite(key.time) || key.time < 0f || !(key.value is Sprite sprite))
                {
                    error = "m_Sprite 曲线包含无效时间或非 Sprite 对象引用。";
                    frames.Clear();
                    frameSprites.Clear();
                    return false;
                }

                if (!TryBuildFrame(key.time, sprite, out ResourceHandoffFrameSnapshot frame))
                {
                    error = "曲线 Sprite 缺少有效的 GUID、localId、像素矩形、pivot 或 PPU。";
                    frames.Clear();
                    frameSprites.Clear();
                    return false;
                }

                frames.Add(frame);
                frameSprites.Add(sprite);
            }

            return true;
        }

        /// <summary>把实际 Sprite 对象转换为保留子资源身份与源像素数据的帧记录。</summary>
        /// <param name="time">AnimationClip 中实际关键帧时间。</param>
        /// <param name="sprite">曲线引用的 Sprite 子资源。</param>
        /// <param name="frame">成功读取时生成的帧记录。</param>
        /// <returns>所有必需源事实均可读取时为 true。</returns>
        private static bool TryBuildFrame(float time, Sprite sprite, out ResourceHandoffFrameSnapshot frame)
        {
            frame = null;
            if (sprite == null ||
                !AssetDatabase.TryGetGUIDAndLocalFileIdentifier(sprite, out string guid, out long localId) ||
                string.IsNullOrWhiteSpace(guid))
            {
                return false;
            }

            Rect rect = sprite.rect;
            Vector2 pixelPivot = sprite.pivot;
            float pixelsPerUnit = sprite.pixelsPerUnit;
            if (rect.width <= 0f || rect.height <= 0f || pixelsPerUnit <= 0f ||
                !IsFinite(rect.x) || !IsFinite(rect.y) || !IsFinite(rect.width) || !IsFinite(rect.height) ||
                !IsFinite(pixelPivot.x) || !IsFinite(pixelPivot.y) || !IsFinite(pixelsPerUnit))
            {
                return false;
            }

            string assetPath = AssetDatabase.GetAssetPath(sprite);
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                return false;
            }

            try
            {
                assetPath = ResourceHandoffPath.RequireAssetPath(assetPath);
            }
            catch (ArgumentException)
            {
                return false;
            }

            frame = new ResourceHandoffFrameSnapshot
            {
                time = time,
                assetGuid = guid,
                localId = localId.ToString(CultureInfo.InvariantCulture),
                assetPath = assetPath,
                spriteName = sprite.name,
                rect = new ResourceHandoffRect
                {
                    x = rect.x,
                    y = rect.y,
                    width = rect.width,
                    height = rect.height
                },
                // Unity 的 pivot 以像素记录；不裁剪画外枢轴，保留实际比例供计划比较。
                pivot = new ResourceHandoffPoint
                {
                    x = pixelPivot.x / rect.width,
                    y = pixelPivot.y / rect.height
                },
                pixelsPerUnit = pixelsPerUnit
            };
            return true;
        }

        /// <summary>直接检查持久 Prefab 资产中的唯一消费者组件、Clip 引用和 Sprite 绑定目标。</summary>
        /// <param name="request">消费者组件及绑定请求。</param>
        /// <param name="clip">本次验证的实际 Clip 对象。</param>
        /// <param name="error">缺失或歧义事实的中文诊断。</param>
        /// <returns>保存 Prefab 实际身份与两项布尔验证结果的快照。</returns>
        private static ResourceHandoffConsumerSnapshot ReadConsumer(
            ResourceHandoffAnimationRequest request,
            AnimationClip clip,
            out string error)
        {
            error = null;
            var consumer = new ResourceHandoffConsumerSnapshot
            {
                prefabPath = request.consumerPrefabPath,
                prefabGuid = null,
                componentType = request.consumerComponent,
                referencesClip = false,
                bindingResolved = false
            };

            string prefabPath = ResourceHandoffPath.RequireAssetPath(request.consumerPrefabPath);
            GameObject prefabAsset = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (prefabAsset == null ||
                !string.Equals(Path.GetExtension(prefabPath), ".prefab", StringComparison.OrdinalIgnoreCase))
            {
                error = "消费者路径没有可加载的 Prefab。";
                return consumer;
            }

            consumer.prefabPath = prefabPath;
            consumer.prefabGuid = AssetDatabase.AssetPathToGUID(prefabPath);
            if (string.IsNullOrWhiteSpace(consumer.prefabGuid))
            {
                error = "消费者 Prefab 缺少 AssetDatabase GUID。";
                return consumer;
            }

            try
            {
                // 直接读取 AssetDatabase 返回的持久对象，避免加载 Prefab Contents 触发 ExecuteAlways 生命周期。
                if (!TryFindUniqueConsumer(prefabAsset, request.consumerComponent, out Component component))
                {
                    error = "Prefab 中没有唯一的指定 Animator 或 Animation 组件。";
                    return consumer;
                }

                bool expectsLegacyClip = component is Animation;
                if (clip.legacy != expectsLegacyClip)
                {
                    error = expectsLegacyClip
                        ? "Legacy Animation 消费者只能引用 legacy AnimationClip。"
                        : "Animator Controller 消费者不能引用 legacy AnimationClip。";
                    return consumer;
                }

                consumer.referencesClip = ConsumerReferencesClip(component, clip);
                if (!TryResolveBinding(component.transform, request.bindingPath, out Transform target) ||
                    !HasUniqueRenderer(target, request.componentType))
                {
                    error = "Prefab 动画根下不存在唯一的指定 SpriteRenderer 或 Image 绑定目标。";
                    return consumer;
                }

                consumer.bindingResolved = true;
                if (!consumer.referencesClip)
                {
                    error = "指定消费者组件未引用同一个 AnimationClip 资产对象。";
                }
            }
            catch (Exception)
            {
                error = "Unity 无法读取消费者 Prefab 的组件层级。";
            }

            return consumer;
        }

        /// <summary>确认 Prefab 中只存在一个请求的 Animator 或 Animation 组件。</summary>
        /// <param name="root">AssetDatabase 返回的持久 Prefab 根对象。</param>
        /// <param name="componentType">Animator 或 Animation。</param>
        /// <param name="component">找到的唯一组件。</param>
        /// <returns>组件类型合法且唯一时为 true。</returns>
        private static bool TryFindUniqueConsumer(GameObject root, string componentType, out Component component)
        {
            component = null;
            if (string.Equals(componentType, "Animator", StringComparison.Ordinal))
            {
                Animator[] matches = root.GetComponentsInChildren<Animator>(true);
                if (matches.Length != 1)
                {
                    return false;
                }

                component = matches[0];
                return true;
            }

            if (string.Equals(componentType, "Animation", StringComparison.Ordinal))
            {
                Animation[] matches = root.GetComponentsInChildren<Animation>(true);
                if (matches.Length != 1)
                {
                    return false;
                }

                component = matches[0];
                return true;
            }

            return false;
        }

        /// <summary>读取 Animator Controller 或 Animation State 中实际引用的 Clip 对象。</summary>
        /// <param name="consumer">Prefab 中唯一消费者组件。</param>
        /// <param name="clip">请求的实际 AnimationClip 对象。</param>
        /// <returns>消费者配置包含同一个对象引用时为 true。</returns>
        private static bool ConsumerReferencesClip(Component consumer, AnimationClip clip)
        {
            if (consumer is Animator animator)
            {
                return animator.runtimeAnimatorController != null &&
                       animator.runtimeAnimatorController.animationClips.Any(candidate => candidate == clip);
            }

            if (consumer is Animation animation)
            {
                // 组件重载仅查询 Legacy Animation Player；GameObject 重载还会合并其它 IAnimationClipSource。
#pragma warning disable CS0618
                AnimationClip[] referencedClips = AnimationUtility.GetAnimationClips(animation);
#pragma warning restore CS0618
                return referencedClips
                    .Any(candidate => candidate == clip);
            }

            return false;
        }

        /// <summary>按 Unity 动画根和相对路径唯一解析绑定 Transform。</summary>
        /// <param name="root">Animator 或 Animation 所在根节点。</param>
        /// <param name="bindingPath">相对路径；空字符串表示根节点自身。</param>
        /// <param name="target">成功解析到的唯一 Transform。</param>
        /// <returns>每一级层级名称都唯一且存在时为 true。</returns>
        private static bool TryResolveBinding(Transform root, string bindingPath, out Transform target)
        {
            target = null;
            if (root == null || !IsValidBindingPath(bindingPath))
            {
                return false;
            }

            if (string.IsNullOrEmpty(bindingPath))
            {
                target = root;
                return true;
            }

            Transform current = root;
            foreach (string segment in bindingPath.Split('/'))
            {
                Transform match = null;
                for (int index = 0; index < current.childCount; index++)
                {
                    Transform child = current.GetChild(index);
                    if (!string.Equals(child.name, segment, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    if (match != null)
                    {
                        return false;
                    }

                    match = child;
                }

                if (match == null)
                {
                    return false;
                }

                current = match;
            }

            target = current;
            return true;
        }

        /// <summary>确认目标 GameObject 恰有一个请求的渲染组件实例。</summary>
        /// <param name="target">已解析的动画绑定对象。</param>
        /// <param name="componentType">SpriteRenderer 或 Image。</param>
        /// <returns>请求组件存在且唯一时为 true。</returns>
        private static bool HasUniqueRenderer(Transform target, string componentType)
        {
            if (target == null)
            {
                return false;
            }

            if (string.Equals(componentType, "SpriteRenderer", StringComparison.Ordinal))
            {
                return target.GetComponents<SpriteRenderer>().Length == 1;
            }

            if (string.Equals(componentType, "Image", StringComparison.Ordinal))
            {
                return target.GetComponents<Image>().Length == 1;
            }

            return false;
        }

        /// <summary>加载可选 SpriteAtlas 并对曲线中保留的真实 Sprite 逐个调用 Unity CanBindTo。</summary>
        /// <param name="request">包含 Atlas 路径的动画请求。</param>
        /// <param name="sprites">从真实 AnimationClip 曲线保留的 Sprite 对象。</param>
        /// <param name="error">图集或帧身份无法读取时的诊断。</param>
        /// <returns>实际图集身份和逐帧绑定结果。</returns>
        private static ResourceHandoffAtlasSnapshot ReadAtlas(
            ResourceHandoffAnimationRequest request,
            List<Sprite> sprites,
            out string error)
        {
            error = null;
            string atlasPath = ResourceHandoffPath.RequireAssetPath(request.atlasPath);
            if (AssetDatabase.GetMainAssetTypeAtPath(atlasPath) != typeof(SpriteAtlas))
            {
                error = "图集路径必须指向独立 SpriteAtlas 主资源。";
                return null;
            }

            SpriteAtlas atlas = AssetDatabase.LoadAssetAtPath<SpriteAtlas>(atlasPath);
            string guid = AssetDatabase.AssetPathToGUID(atlasPath);
            if (atlas == null || string.IsNullOrWhiteSpace(guid) || sprites.Count == 0)
            {
                error = "指定图集或用于图集检查的实际 Sprite 帧不可用。";
                return null;
            }

            bool allFramesBindable = true;
            foreach (Sprite sprite in sprites)
            {
                if (sprite == null || !atlas.CanBindTo(sprite))
                {
                    allFramesBindable = false;
                    break;
                }
            }

            return new ResourceHandoffAtlasSnapshot
            {
                assetPath = AssetDatabase.GetAssetPath(atlas),
                assetGuid = guid,
                allFramesBindable = allFramesBindable
            };
        }

        /// <summary>把多个采集失败诊断连成一条不含环境异常的中文消息。</summary>
        /// <param name="current">已有诊断。</param>
        /// <param name="next">新增诊断。</param>
        /// <returns>合并后的诊断。</returns>
        private static string AppendError(string current, string next)
        {
            return string.IsNullOrEmpty(current) ? next : current + "；" + next;
        }

        /// <summary>确认绑定路径不含开头、结尾、空白或空名称段。</summary>
        /// <param name="path">Prefab 相对动画路径。</param>
        /// <returns>空根路径或格式正确的层级路径时为 true。</returns>
        private static bool IsValidBindingPath(string path)
        {
            if (path == null)
            {
                return false;
            }

            if (path.Length == 0)
            {
                return true;
            }

            return !path.StartsWith("/", StringComparison.Ordinal) &&
                   !path.EndsWith("/", StringComparison.Ordinal) &&
                   path.IndexOf('\\') < 0 &&
                   path.Split('/').All(segment =>
                       !string.IsNullOrWhiteSpace(segment) && segment != "." && segment != "..");
        }

        /// <summary>映射受支持的组件名到明确的 Unity 渲染组件类型。</summary>
        /// <param name="componentName">请求声明的组件名。</param>
        /// <param name="componentType">成功时返回的 Unity 类型。</param>
        /// <returns>名称只匹配 SpriteRenderer 或 uGUI Image 时为 true。</returns>
        private static bool TryGetCurveComponentType(string componentName, out Type componentType)
        {
            if (string.Equals(componentName, "SpriteRenderer", StringComparison.Ordinal))
            {
                componentType = typeof(SpriteRenderer);
                return true;
            }

            if (string.Equals(componentName, "Image", StringComparison.Ordinal))
            {
                componentType = typeof(Image);
                return true;
            }

            componentType = null;
            return false;
        }

        /// <summary>验证帧时间和 Sprite 几何数值均为有限浮点数。</summary>
        /// <param name="value">待验证数值。</param>
        /// <returns>非 NaN 且非无穷时为 true。</returns>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
