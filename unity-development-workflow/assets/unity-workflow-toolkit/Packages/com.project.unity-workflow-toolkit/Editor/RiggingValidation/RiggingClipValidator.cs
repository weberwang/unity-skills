using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 只读核查角色 Controller 图、动画片段曲线、循环设置和 AnimationEvent 接收方法。
    /// </summary>
    internal static class RiggingClipValidator
    {
        /// <summary>检查请求动画及唯一 Animator 使用的 Controller。</summary>
        /// <param name="animator">角色唯一 Animator；不可确定时传入 null。</param>
        /// <param name="controller">Animator 实际引用的运行时 Controller。</param>
        /// <param name="requirements">必须由 Controller 使用的动画需求。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        public static void Validate(
            Animator animator,
            RuntimeAnimatorController controller,
            IList<RiggingClipRequirement> requirements,
            QualityReportDto report)
        {
            ControllerSnapshot snapshot = InspectController(controller);
            AddControllerChecks(snapshot, report);

            int count = requirements == null ? 0 : requirements.Count;
            for (int index = 0; index < count; index++)
            {
                ValidateRequirement(animator, requirements[index], index, snapshot, report);
            }
        }

        /// <summary>对缺少唯一 Animator 的角色补齐片段级未完成检查。</summary>
        /// <param name="requirements">请求中的片段需求。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        public static void AddUnavailableChecks(IList<RiggingClipRequirement> requirements, QualityReportDto report)
        {
            Validate(null, null, requirements, report);
        }

        /// <summary>从项目资源中唯一解析 AnimationClip，并检查其工程属性与 Controller 引用。</summary>
        /// <param name="animator">角色唯一 Animator。</param>
        /// <param name="requirement">待验证片段要求。</param>
        /// <param name="index">请求列表位置，用于生成稳定检查 ID。</param>
        /// <param name="snapshot">已读取的 Controller 图快照。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateRequirement(
            Animator animator,
            RiggingClipRequirement requirement,
            int index,
            ControllerSnapshot snapshot,
            QualityReportDto report)
        {
            string prefix = "clip-" + index.ToString("D2");
            if (requirement == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-resource", "animation", "FAIL",
                    "动画需求为空，无法解析资源或检查绑定。");
                AddClipDependentChecks(prefix, report, "动画需求为空，相关片段检查未执行。");
                return;
            }

            AnimationClip clip = ResolveUniqueClip(requirement.ClipPath, out string resolveFailure);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-resource", "animation",
                clip != null ? "PASS" : "FAIL",
                clip != null
                    ? "已从项目内资源唯一解析到请求的 AnimationClip。"
                    : resolveFailure);

            if (clip == null)
            {
                AddClipDependentChecks(prefix, report, "AnimationClip 资源未能唯一解析，片段属性与绑定检查未执行。");
                return;
            }

            bool durationValid = IsFinite(clip.length) && clip.length > 0f;
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-duration", "animation",
                durationValid ? "PASS" : "FAIL",
                durationValid
                    ? $"AnimationClip 时长为 {clip.length:0.###} 秒。"
                    : "AnimationClip 时长必须为有限正数，空片段不能判定为有效动画。");

            ValidateControllerReference(clip, prefix, snapshot, report);
            ValidateLoopSetting(clip, requirement, prefix, report);
            ValidateFloatCurves(clip, animator, prefix, report);
            ValidateObjectCurves(clip, animator, prefix, report);
            ValidateCurveBindingConflicts(clip, prefix, report);
            ValidateEvents(clip, animator, requirement, prefix, report);
        }

        /// <summary>确认请求片段在实际 Animator Controller 图中恰好出现一次。</summary>
        /// <param name="clip">唯一解析的资源片段。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="snapshot">Controller 图快照。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateControllerReference(
            AnimationClip clip,
            string prefix,
            ControllerSnapshot snapshot,
            QualityReportDto report)
        {
            if (!snapshot.CanInspectReferences || !snapshot.GraphValid)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-controller-reference", "animation", "BLOCKED",
                    "当前 Controller 类型或图结构无法通过公开状态图接口完整枚举，片段引用次数未验证。");
                return;
            }

            int referenceCount = 0;
            foreach (AnimationClip referencedClip in snapshot.EffectiveClips)
            {
                if (referencedClip == clip)
                {
                    referenceCount++;
                }
            }

            bool valid = referenceCount > 0;
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-controller-reference", "animation",
                valid ? "PASS" : "FAIL",
                valid
                    ? $"请求片段在角色 Animator 的有效状态图中引用 {referenceCount} 次；多个状态或层复用同一片段是允许的。"
                    : "请求片段没有出现在角色 Animator 的有效状态图中。");
        }

        /// <summary>读取 AnimationClip 实际 loopTime 标志并与请求预期比较。</summary>
        /// <param name="clip">待验证片段。</param>
        /// <param name="requirement">片段循环预期。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateLoopSetting(
            AnimationClip clip,
            RiggingClipRequirement requirement,
            string prefix,
            QualityReportDto report)
        {
            try
            {
                bool actualLoop = AnimationUtility.GetAnimationClipSettings(clip).loopTime;
                bool valid = actualLoop == requirement.Loop;
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-loop", "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? $"片段 loopTime 与预期一致（{actualLoop}）。"
                        : $"片段 loopTime 为 {actualLoop}，与预期 {requirement.Loop} 不一致。");
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-loop", "animation", "BLOCKED",
                    "Unity 无法读取该 AnimationClip 的 loopTime 元数据。");
            }
        }

        /// <summary>检查浮点曲线绑定目标、关键帧值、时间、切线模式和加权手柄。</summary>
        /// <param name="clip">待验证片段。</param>
        /// <param name="animator">Animator 绑定根节点。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateFloatCurves(
            AnimationClip clip,
            Animator animator,
            string prefix,
            QualityReportDto report)
        {
            if (animator == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-float-curves", "animation", "BLOCKED",
                    "角色 Animator 根节点无法确定，浮点曲线的路径和组件绑定未验证。");
                return;
            }

            try
            {
                EditorCurveBinding[] bindings = AnimationUtility.GetCurveBindings(clip) ?? Array.Empty<EditorCurveBinding>();
                bool valid = true;
                foreach (EditorCurveBinding binding in bindings)
                {
                    if (!IsBindingResolved(animator.gameObject, binding))
                    {
                        valid = false;
                        break;
                    }

                    AnimationCurve curve = AnimationUtility.GetEditorCurve(clip, binding);
                    if (!IsFiniteCurve(curve))
                    {
                        valid = false;
                        break;
                    }
                }

                RiggingValidationReportBuilder.AddCheck(report, prefix + "-float-curves", "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? $"已验证 {bindings.Length} 条浮点曲线的角色层级绑定与有限关键帧数据。"
                        : "浮点曲线的路径、组件、属性或关键帧数据无效。");
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-float-curves", "animation", "FAIL",
                    "Unity 无法读取或解析该片段的浮点曲线数据。");
            }
        }

        /// <summary>检查对象引用曲线的绑定目标和关键帧时间。</summary>
        /// <param name="clip">待验证片段。</param>
        /// <param name="animator">Animator 绑定根节点。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateObjectCurves(
            AnimationClip clip,
            Animator animator,
            string prefix,
            QualityReportDto report)
        {
            if (animator == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-object-curves", "animation", "BLOCKED",
                    "角色 Animator 根节点无法确定，对象引用曲线的路径和组件绑定未验证。");
                return;
            }

            try
            {
                EditorCurveBinding[] bindings = AnimationUtility.GetObjectReferenceCurveBindings(clip) ?? Array.Empty<EditorCurveBinding>();
                bool valid = true;
                foreach (EditorCurveBinding binding in bindings)
                {
                    if (!IsBindingResolved(animator.gameObject, binding))
                    {
                        valid = false;
                        break;
                    }

                    ObjectReferenceKeyframe[] keys = AnimationUtility.GetObjectReferenceCurve(clip, binding) ??
                                                       Array.Empty<ObjectReferenceKeyframe>();
                    foreach (ObjectReferenceKeyframe key in keys)
                    {
                        // null 可用于清空 Sprite/对象引用；这里只要求时点有效，不擅自禁止这类曲线值。
                        if (!IsFinite(key.time) || key.time < 0f || key.time > clip.length)
                        {
                            valid = false;
                            break;
                        }
                    }

                    if (!valid)
                    {
                        break;
                    }
                }

                RiggingValidationReportBuilder.AddCheck(report, prefix + "-object-curves", "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? $"已验证 {bindings.Length} 条对象引用曲线的角色层级绑定与关键帧时点。"
                        : "对象引用曲线的路径、组件或关键帧时点无效。");
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-object-curves", "animation", "FAIL",
                    "Unity 无法读取或解析该片段的对象引用曲线数据。");
            }
        }

        /// <summary>拒绝同一片段中重复声明或互相冲突的曲线目标。</summary>
        /// <param name="clip">待验证片段。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateCurveBindingConflicts(AnimationClip clip, string prefix, QualityReportDto report)
        {
            try
            {
                EditorCurveBinding[] floatBindings = AnimationUtility.GetCurveBindings(clip) ?? Array.Empty<EditorCurveBinding>();
                EditorCurveBinding[] objectBindings = AnimationUtility.GetObjectReferenceCurveBindings(clip) ?? Array.Empty<EditorCurveBinding>();
                HashSet<string> targets = new HashSet<string>(StringComparer.Ordinal);
                bool valid = AddBindingTargets(floatBindings, targets) && AddBindingTargets(objectBindings, targets);
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-curve-binding-conflicts", "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? "该片段的浮点曲线与对象引用曲线没有重复目标。"
                        : "该片段存在多个曲线通道写入同一对象路径、组件类型和属性。");
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-curve-binding-conflicts", "animation", "FAIL",
                    "Unity 无法读取该片段的曲线目标，无法排除目标冲突。");
            }
        }

        /// <summary>将曲线目标加入集合，并检测同一片段内的重复目标。</summary>
        /// <param name="bindings">待检查曲线目标。</param>
        /// <param name="targets">已发现的目标标识。</param>
        /// <returns>本集合与此前集合均无目标冲突时返回 true。</returns>
        private static bool AddBindingTargets(EditorCurveBinding[] bindings, HashSet<string> targets)
        {
            foreach (EditorCurveBinding binding in bindings)
            {
                string typeName = binding.type == null ? string.Empty : binding.type.AssemblyQualifiedName;
                string target = (binding.path ?? string.Empty) + "\0" + typeName + "\0" + (binding.propertyName ?? string.Empty);
                if (!targets.Add(target))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>同时确认曲线路径、组件对象和具体属性都能绑定到 Animator 层级。</summary>
        /// <param name="root">Animator 的动画根节点。</param>
        /// <param name="binding">曲线绑定定义。</param>
        /// <returns>目标对象与属性类型均可解析时返回 true。</returns>
        private static bool IsBindingResolved(GameObject root, EditorCurveBinding binding)
        {
            return !string.IsNullOrWhiteSpace(binding.propertyName) && binding.type != null &&
                   AnimationUtility.GetAnimatedObject(root, binding) != null &&
                   AnimationUtility.GetEditorCurveValueType(root, binding) != null;
        }

        /// <summary>检查 AnimationEvent 时点、请求事件名和 Animator 根节点接收方法。</summary>
        /// <param name="clip">待验证片段。</param>
        /// <param name="animator">Animator 绑定根节点。</param>
        /// <param name="requirement">请求中的必需事件。</param>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateEvents(
            AnimationClip clip,
            Animator animator,
            RiggingClipRequirement requirement,
            string prefix,
            QualityReportDto report)
        {
            if (animator == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-events", "animation", "BLOCKED",
                    "角色 Animator 根节点无法确定，事件接收方法未验证。");
                return;
            }

            try
            {
                AnimationEvent[] events = AnimationUtility.GetAnimationEvents(clip) ?? Array.Empty<AnimationEvent>();
                bool valid = true;
                foreach (AnimationEvent animationEvent in events)
                {
                    if (animationEvent == null || string.IsNullOrWhiteSpace(animationEvent.functionName) ||
                        !IsFinite(animationEvent.time) || animationEvent.time < 0f || animationEvent.time > clip.length ||
                        !HasSupportedReceiver(animator.gameObject, animationEvent))
                    {
                        valid = false;
                        break;
                    }
                }

                IList<string> requiredEvents = requirement.RequiredEvents ?? new List<string>();
                foreach (string requiredName in requiredEvents)
                {
                    bool found = !string.IsNullOrWhiteSpace(requiredName) &&
                                 Array.Exists(events, animationEvent => animationEvent != null &&
                                     string.Equals(animationEvent.functionName, requiredName, StringComparison.Ordinal));
                    valid &= found;
                }

                RiggingValidationReportBuilder.AddCheck(report, prefix + "-events", "animation",
                    valid ? "PASS" : "FAIL",
                    valid
                        ? $"已验证 {events.Length} 个 AnimationEvent 的时点和接收签名，并找到全部必需事件。"
                        : "AnimationEvent 时点、函数名或 Animator 根节点接收方法无效，或缺少必需事件。");
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, prefix + "-events", "animation", "FAIL",
                    "Unity 无法读取或解析该片段的 AnimationEvent 数据。");
            }
        }

        /// <summary>检查 Animator 根节点是否有可接收该事件且类型兼容的实例方法。</summary>
        /// <param name="target">Animator 所在 GameObject。</param>
        /// <param name="animationEvent">完整事件数据，用于核实对象参数的实际类型。</param>
        /// <returns>存在 void、零参数或受支持且类型匹配的单参数方法时返回 true。</returns>
        private static bool HasSupportedReceiver(GameObject target, AnimationEvent animationEvent)
        {
            if (target == null || animationEvent == null || string.IsNullOrWhiteSpace(animationEvent.functionName))
            {
                return false;
            }

            UnityEngine.Object objectParameter = animationEvent.objectReferenceParameter;
            MonoBehaviour[] behaviours = target.GetComponents<MonoBehaviour>();
            foreach (MonoBehaviour behaviour in behaviours)
            {
                if (behaviour == null)
                {
                    continue;
                }

                for (Type current = behaviour.GetType(); current != null && typeof(MonoBehaviour).IsAssignableFrom(current);
                     current = current.BaseType)
                {
                    MethodInfo[] methods = current.GetMethods(BindingFlags.Instance | BindingFlags.Public |
                                                               BindingFlags.NonPublic | BindingFlags.DeclaredOnly);
                    foreach (MethodInfo method in methods)
                    {
                        if (!string.Equals(method.Name, animationEvent.functionName, StringComparison.Ordinal) ||
                            method.IsStatic || method.IsGenericMethodDefinition || method.ReturnType != typeof(void))
                        {
                            continue;
                        }

                        ParameterInfo[] parameters = method.GetParameters();
                        if (parameters.Length == 0)
                        {
                            return true;
                        }

                        if (parameters.Length == 1 && IsSupportedEventParameter(parameters[0].ParameterType) &&
                            IsCompatibleObjectEventParameter(parameters[0].ParameterType, objectParameter))
                        {
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        /// <summary>限制事件接收参数为 Unity AnimationEvent 可传递的公开参数类别。</summary>
        /// <param name="parameterType">接收方法的单个参数类型。</param>
        /// <returns>参数是 float、int、string、UnityEngine.Object 子类或 AnimationEvent 时返回 true。</returns>
        private static bool IsSupportedEventParameter(Type parameterType)
        {
            return parameterType == typeof(float) || parameterType == typeof(int) || parameterType == typeof(string) ||
                   parameterType == typeof(AnimationEvent) || typeof(UnityEngine.Object).IsAssignableFrom(parameterType);
        }

        /// <summary>仅对 UnityEngine.Object 接收器核对非空事件对象的具体类型。</summary>
        /// <param name="parameterType">接收方法的单个参数类型。</param>
        /// <param name="objectParameter">事件携带的对象参数，可为空。</param>
        /// <returns>非对象载荷可按签名接收；对象载荷仅在缺省或类型兼容时可被 Object 参数接收。</returns>
        private static bool IsCompatibleObjectEventParameter(Type parameterType, UnityEngine.Object objectParameter)
        {
            if (!typeof(UnityEngine.Object).IsAssignableFrom(parameterType) || objectParameter == null)
            {
                return true;
            }

            return parameterType.IsInstanceOfType(objectParameter);
        }

        /// <summary>验证曲线关键帧数据，同时尊重 Constant 切线允许无穷斜率的规则。</summary>
        /// <param name="curve">Unity 曲线数据。</param>
        /// <returns>关键帧时间、数值、切线及已启用加权手柄均有效时返回 true。</returns>
        private static bool IsFiniteCurve(AnimationCurve curve)
        {
            if (curve == null)
            {
                return false;
            }

            Keyframe[] keys = curve.keys;
            for (int index = 0; index < keys.Length; index++)
            {
                Keyframe key = keys[index];
                AnimationUtility.TangentMode leftMode = AnimationUtility.GetKeyLeftTangentMode(curve, index);
                AnimationUtility.TangentMode rightMode = AnimationUtility.GetKeyRightTangentMode(curve, index);
                if (!IsFinite(key.time) || !IsFinite(key.value) ||
                    !IsTangentValid(key.inTangent, leftMode) || !IsTangentValid(key.outTangent, rightMode) ||
                    !IsWeightedHandleValid(key.inWeight, key.weightedMode, WeightedMode.In) ||
                    !IsWeightedHandleValid(key.outWeight, key.weightedMode, WeightedMode.Out))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>对 Constant 切线容许正负无穷，其他模式要求有限斜率。</summary>
        /// <param name="tangent">切线斜率。</param>
        /// <param name="mode">Unity 切线模式。</param>
        /// <returns>切线符合其模式时返回 true。</returns>
        private static bool IsTangentValid(float tangent, AnimationUtility.TangentMode mode)
        {
            return mode == AnimationUtility.TangentMode.Constant ? !float.IsNaN(tangent) : IsFinite(tangent);
        }

        /// <summary>仅在对应加权手柄已启用时核实权重有限且处于 Unity 有效区间。</summary>
        /// <param name="weight">关键帧手柄权重。</param>
        /// <param name="weightedMode">该关键帧启用的加权方向。</param>
        /// <param name="direction">正在检查的手柄方向。</param>
        /// <returns>未加权或加权值位于 0 到 1 时返回 true。</returns>
        private static bool IsWeightedHandleValid(float weight, WeightedMode weightedMode, WeightedMode direction)
        {
            return (weightedMode & direction) == 0 || (IsFinite(weight) && weight >= 0f && weight <= 1f);
        }

        /// <summary>读取 Animator Controller 的状态图并统计各状态有效片段引用。</summary>
        /// <param name="controller">Animator 实际引用的运行时 Controller。</param>
        /// <returns>图结构、参数检查结果及有效片段清单。</returns>
        private static ControllerSnapshot InspectController(RuntimeAnimatorController controller)
        {
            ControllerSnapshot snapshot = new ControllerSnapshot();
            if (controller == null)
            {
                snapshot.Failure = "Animator 未引用 Controller。";
                return snapshot;
            }

            AnimatorController animatorController;
            Dictionary<AnimationClip, AnimationClip> overrides = null;
            if (controller is AnimatorOverrideController overrideController)
            {
                animatorController = overrideController.runtimeAnimatorController as AnimatorController;
                if (animatorController == null)
                {
                    snapshot.Failure = "嵌套或非 AnimatorController 基础的 Override Controller 不在当前工程检查范围内。";
                    return snapshot;
                }

                try
                {
                    List<KeyValuePair<AnimationClip, AnimationClip>> entries = new List<KeyValuePair<AnimationClip, AnimationClip>>();
                    overrideController.GetOverrides(entries);
                    overrides = new Dictionary<AnimationClip, AnimationClip>();
                    foreach (KeyValuePair<AnimationClip, AnimationClip> entry in entries)
                    {
                        if (entry.Key != null)
                        {
                            overrides[entry.Key] = entry.Value;
                        }
                    }
                }
                catch (Exception)
                {
                    snapshot.Failure = "Unity 无法读取 Override Controller 的片段替换映射。";
                    return snapshot;
                }
            }
            else
            {
                animatorController = controller as AnimatorController;
                if (animatorController == null)
                {
                    snapshot.Failure = "当前运行时 Controller 类型不支持公开 Animator 状态图枚举。";
                    return snapshot;
                }
            }

            try
            {
                AnimatorControllerLayer[] layers = animatorController.layers ?? Array.Empty<AnimatorControllerLayer>();
                if (layers.Length == 0)
                {
                    snapshot.Failure = "Animator Controller 不含状态机层。";
                    return snapshot;
                }

                Dictionary<string, AnimatorControllerParameterType> parameterTypes = snapshot.ParameterTypes;
                AnimatorControllerParameter[] parameters = animatorController.parameters ?? Array.Empty<AnimatorControllerParameter>();
                foreach (AnimatorControllerParameter parameter in parameters)
                {
                    if (parameter == null || string.IsNullOrWhiteSpace(parameter.name) ||
                        parameterTypes.ContainsKey(parameter.name))
                    {
                        snapshot.ParametersValid = false;
                        continue;
                    }

                    parameterTypes.Add(parameter.name, parameter.type);
                }

                foreach (AnimatorCondition condition in EnumerateConditions(animatorController))
                {
                    if (!parameterTypes.ContainsKey(condition.parameter))
                    {
                        snapshot.ParametersValid = false;
                    }
                }

                for (int layerIndex = 0; layerIndex < layers.Length; layerIndex++)
                {
                    AnimatorStateMachine stateMachine = layers[layerIndex].stateMachine;
                    if (stateMachine == null)
                    {
                        snapshot.GraphValid = false;
                        continue;
                    }

                    CollectStateMachine(stateMachine, layerIndex, animatorController, overrides,
                        new HashSet<AnimatorStateMachine>(), new HashSet<Motion>(), snapshot);
                }

                snapshot.CanInspectReferences = true;
            }
            catch (Exception)
            {
                snapshot.CanInspectReferences = false;
                snapshot.GraphValid = false;
                snapshot.Failure = "Unity 无法完整枚举 Animator Controller 的层、状态、转场或 Motion。";
            }

            return snapshot;
        }

        /// <summary>递归检查状态机、有效状态 Motion 和子状态机转场。</summary>
        /// <param name="stateMachine">待遍历的状态机。</param>
        /// <param name="layerIndex">当前 Controller 层索引。</param>
        /// <param name="controller">基础 Animator Controller。</param>
        /// <param name="overrides">可选的单层 Override Controller 映射。</param>
        /// <param name="stateMachineStack">当前递归链，用于识别状态机环。</param>
        /// <param name="motionStack">当前 BlendTree 递归链，用于识别 Motion 环。</param>
        /// <param name="snapshot">累积检查结果。</param>
        private static void CollectStateMachine(
            AnimatorStateMachine stateMachine,
            int layerIndex,
            AnimatorController controller,
            Dictionary<AnimationClip, AnimationClip> overrides,
            HashSet<AnimatorStateMachine> stateMachineStack,
            HashSet<Motion> motionStack,
            ControllerSnapshot snapshot)
        {
            if (!stateMachineStack.Add(stateMachine))
            {
                snapshot.GraphValid = false;
                return;
            }

            foreach (AnimatorState state in EnumerateStates(stateMachine))
            {
                if (state == null)
                {
                    snapshot.GraphValid = false;
                    snapshot.StateMotionsValid = false;
                    continue;
                }

                Motion motion = controller.GetStateEffectiveMotion(state, layerIndex);
                if (motion == null)
                {
                    snapshot.StateMotionsValid = false;
                }
                else
                {
                    CollectMotion(motion, overrides, motionStack, snapshot);
                }

            }

            foreach (ChildAnimatorStateMachine child in stateMachine.stateMachines)
            {
                if (child.stateMachine == null)
                {
                    snapshot.GraphValid = false;
                    continue;
                }

                CollectStateMachine(child.stateMachine, layerIndex, controller, overrides,
                    stateMachineStack, motionStack, snapshot);
            }

            stateMachineStack.Remove(stateMachine);
        }

        /// <summary>递归收集 Clip 引用，并拒绝空子 Motion 或循环 BlendTree。</summary>
        /// <param name="motion">状态或 BlendTree 子节点 Motion。</param>
        /// <param name="overrides">可选的单层 Override Controller 映射。</param>
        /// <param name="motionStack">当前 Motion 递归链。</param>
        /// <param name="snapshot">累积检查结果。</param>
        private static void CollectMotion(
            Motion motion,
            Dictionary<AnimationClip, AnimationClip> overrides,
            HashSet<Motion> motionStack,
            ControllerSnapshot snapshot)
        {
            if (motion is AnimationClip clip)
            {
                if (overrides != null && overrides.TryGetValue(clip, out AnimationClip replacement) && replacement != null)
                {
                    snapshot.EffectiveClips.Add(replacement);
                }
                else
                {
                    snapshot.EffectiveClips.Add(clip);
                }

                return;
            }

            if (!(motion is BlendTree blendTree))
            {
                snapshot.StateMotionsValid = false;
                snapshot.GraphValid = false;
                return;
            }

            if (!motionStack.Add(blendTree))
            {
                snapshot.StateMotionsValid = false;
                snapshot.GraphValid = false;
                return;
            }

            if (!RiggingBlendTreeParameterValidator.ValidateParameters(blendTree, snapshot.ParameterTypes))
            {
                snapshot.ParametersValid = false;
            }

            ChildMotion[] children = blendTree.children ?? Array.Empty<ChildMotion>();
            if (children.Length == 0)
            {
                snapshot.StateMotionsValid = false;
            }

            foreach (ChildMotion child in children)
            {
                if (child.motion == null)
                {
                    snapshot.StateMotionsValid = false;
                    continue;
                }

                CollectMotion(child.motion, overrides, motionStack, snapshot);
            }

            motionStack.Remove(blendTree);
        }

        /// <summary>枚举当前状态机直接包含的状态。</summary>
        /// <param name="stateMachine">状态机。</param>
        /// <returns>直接状态。</returns>
        private static IEnumerable<AnimatorState> EnumerateStates(AnimatorStateMachine stateMachine)
        {
            ChildAnimatorState[] states = stateMachine.states ?? Array.Empty<ChildAnimatorState>();
            foreach (ChildAnimatorState child in states)
            {
                yield return child.state;
            }
        }

        /// <summary>枚举状态机 Any State、Entry 及子状态机转场的条件。</summary>
        /// <param name="stateMachine">状态机。</param>
        /// <returns>所有可读取转场条件。</returns>
        private static IEnumerable<AnimatorCondition> EnumerateMachineConditions(AnimatorStateMachine stateMachine)
        {
            AnimatorStateTransition[] anyStateTransitions = stateMachine.anyStateTransitions ?? Array.Empty<AnimatorStateTransition>();
            foreach (AnimatorStateTransition transition in anyStateTransitions)
            {
                foreach (AnimatorCondition condition in transition.conditions)
                {
                    yield return condition;
                }
            }

            AnimatorTransition[] entryTransitions = stateMachine.entryTransitions ?? Array.Empty<AnimatorTransition>();
            foreach (AnimatorTransition transition in entryTransitions)
            {
                foreach (AnimatorCondition condition in transition.conditions)
                {
                    yield return condition;
                }
            }
        }

        /// <summary>递归收集所有状态及状态机转场条件，用于检查参数名是否存在。</summary>
        /// <param name="controller">Animator Controller。</param>
        /// <returns>状态图中的所有转场条件。</returns>
        private static IEnumerable<AnimatorCondition> EnumerateConditions(AnimatorController controller)
        {
            foreach (AnimatorControllerLayer layer in controller.layers ?? Array.Empty<AnimatorControllerLayer>())
            {
                if (layer.stateMachine == null)
                {
                    continue;
                }

                foreach (AnimatorCondition condition in EnumerateConditionsInMachine(layer.stateMachine, new HashSet<AnimatorStateMachine>()))
                {
                    yield return condition;
                }
            }
        }

        /// <summary>遍历当前状态机及其子状态机中的全部转场条件。</summary>
        /// <param name="stateMachine">当前状态机。</param>
        /// <param name="visited">当前递归链。</param>
        /// <returns>所有可读取转场条件。</returns>
        private static IEnumerable<AnimatorCondition> EnumerateConditionsInMachine(
            AnimatorStateMachine stateMachine,
            HashSet<AnimatorStateMachine> visited)
        {
            if (!visited.Add(stateMachine))
            {
                yield break;
            }

            foreach (AnimatorCondition condition in EnumerateMachineConditions(stateMachine))
            {
                yield return condition;
            }

            foreach (AnimatorState state in EnumerateStates(stateMachine))
            {
                if (state == null)
                {
                    continue;
                }

                foreach (AnimatorStateTransition transition in state.transitions)
                {
                    foreach (AnimatorCondition condition in transition.conditions)
                    {
                        yield return condition;
                    }
                }
            }

            foreach (ChildAnimatorStateMachine child in stateMachine.stateMachines)
            {
                if (child.stateMachine == null)
                {
                    continue;
                }

                foreach (AnimatorTransition transition in stateMachine.GetStateMachineTransitions(child.stateMachine))
                {
                    foreach (AnimatorCondition condition in transition.conditions)
                    {
                        yield return condition;
                    }
                }

                foreach (AnimatorCondition condition in EnumerateConditionsInMachine(child.stateMachine, visited))
                {
                    yield return condition;
                }
            }

            visited.Remove(stateMachine);
        }

        /// <summary>记录 Controller 图和可明确验证的状态 Motion、转场参数结果。</summary>
        /// <param name="snapshot">Controller 图快照。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void AddControllerChecks(ControllerSnapshot snapshot, QualityReportDto report)
        {
            string graphStatus = !snapshot.CanInspectReferences ? "BLOCKED" : snapshot.GraphValid ? "PASS" : "FAIL";
            RiggingValidationReportBuilder.AddCheck(report, "controller-graph", "animation", graphStatus,
                snapshot.CanInspectReferences
                    ? snapshot.GraphValid
                        ? "已通过公开接口枚举 Animator Controller 状态机、状态 Motion、BlendTree 与单层 override 替换。"
                        : "Animator Controller 含无法完整遍历的状态机或图结构异常。"
                    : snapshot.Failure ?? "Controller 图不可枚举。");

            RiggingValidationReportBuilder.AddCheck(report, "controller-state-motions", "animation",
                !snapshot.CanInspectReferences ? "BLOCKED" :
                !snapshot.GraphValid ? "BLOCKED" : snapshot.StateMotionsValid ? "PASS" : "FAIL",
                !snapshot.CanInspectReferences
                    ? "Controller 图不可枚举，无法检查缺失状态 Motion。"
                    : !snapshot.GraphValid
                        ? "状态机图不完整，状态 Motion 检查未覆盖所有状态。"
                        : snapshot.StateMotionsValid
                        ? "所有状态及 BlendTree 子项都引用了有效 Motion。"
                        : "Controller 含空状态 Motion、空 BlendTree 子项、空 BlendTree 或循环 Motion 引用。");

            RiggingValidationReportBuilder.AddCheck(report, "controller-transition-parameters", "animation",
                !snapshot.CanInspectReferences || !snapshot.GraphValid
                    ? "BLOCKED"
                    : snapshot.ParametersValid ? "PASS" : "FAIL",
                !snapshot.CanInspectReferences
                    ? "Controller 图不可枚举，无法检查转场参数。"
                    : !snapshot.GraphValid
                        ? "状态机图不完整，转场参数检查未覆盖所有条件。"
                        : snapshot.ParametersValid
                        ? "所有状态图条件与 BlendTree 输入都引用了已声明且类型匹配的 Controller 参数。"
                        : "Controller 参数名称重复或未声明，或转场/BlendTree 输入引用了不存在或类型不匹配的参数。");
        }

        /// <summary>将资源路径限制在项目 Assets/ 后唯一解析 AnimationClip 子资源。</summary>
        /// <param name="path">项目相对动画资源路径。</param>
        /// <param name="failure">失败时的固定诊断信息。</param>
        /// <returns>恰好一个片段时返回资源，否则返回 null。</returns>
        private static AnimationClip ResolveUniqueClip(string path, out string failure)
        {
            failure = "ClipPath 必须位于项目 Assets/，且资源中必须唯一包含一个 AnimationClip。";
            if (!RiggingValidationRequestValidator.TryValidateAssetPath(path, null, out string assetPath))
            {
                return null;
            }

            try
            {
                UnityEngine.Object[] assets = AssetDatabase.LoadAllAssetsAtPath(assetPath);
                AnimationClip[] matches = assets.OfType<AnimationClip>().ToArray();
                if (matches.Length == 1)
                {
                    failure = string.Empty;
                    return matches[0];
                }

                failure = $"资源 {assetPath} 中发现 {matches.Length} 个 AnimationClip；请求没有子资源名字段，无法唯一确定片段。";
                return null;
            }
            catch (Exception)
            {
                failure = "Unity 无法读取指定动画资源中的 AnimationClip 子资源。";
                return null;
            }
        }

        /// <summary>为无法解析的片段补齐资源依赖项的阻断结果。</summary>
        /// <param name="prefix">片段检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        /// <param name="reason">未能执行检查的原因。</param>
        private static void AddClipDependentChecks(string prefix, QualityReportDto report, string reason)
        {
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-duration", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-controller-reference", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-loop", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-float-curves", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-object-curves", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, prefix + "-events", "animation", "BLOCKED", reason);
        }

        /// <summary>检查单精度值是否有限。</summary>
        /// <param name="value">待检查数值。</param>
        /// <returns>非 NaN 且非正负无穷时返回 true。</returns>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        /// <summary>保存 Controller 可验证范围与片段引用的内部快照。</summary>
        private sealed class ControllerSnapshot
        {
            /// <summary>记录有效层级中的最终 Clip 引用；重复项表示允许的多状态或多层复用。</summary>
            public readonly List<AnimationClip> EffectiveClips = new List<AnimationClip>();

            /// <summary>保存有效且唯一的 Controller 参数名称和类型，供转场与 BlendTree 输入校验。</summary>
            public readonly Dictionary<string, AnimatorControllerParameterType> ParameterTypes =
                new Dictionary<string, AnimatorControllerParameterType>(StringComparer.Ordinal);

            /// <summary>Controller 类型及状态图能否通过受支持的公开 API 完整枚举。</summary>
            public bool CanInspectReferences;

            /// <summary>状态机结构是否可递归遍历。</summary>
            public bool GraphValid = true;

            /// <summary>所有状态和 BlendTree 是否都有可读取 Motion。</summary>
            public bool StateMotionsValid = true;

            /// <summary>所有转场条件是否引用唯一已声明参数。</summary>
            public bool ParametersValid = true;

            /// <summary>无法覆盖时给出的固定诊断信息。</summary>
            public string Failure;
        }
    }
}
