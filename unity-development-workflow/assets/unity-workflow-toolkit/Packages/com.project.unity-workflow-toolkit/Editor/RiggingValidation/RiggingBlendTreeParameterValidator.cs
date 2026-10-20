using System.Collections.Generic;
using UnityEditor.Animations;
using UnityEngine;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>验证 BlendTree 实际使用的 Animator 参数名称和数值类型。</summary>
    internal static class RiggingBlendTreeParameterValidator
    {
        /// <summary>按 BlendTree 模式检查必需输入参数是否存在且为 Float。</summary>
        /// <param name="blendTree">待检查的 BlendTree。</param>
        /// <param name="parameterTypes">Controller 已声明的参数名称与类型。</param>
        /// <returns>所有模式输入都引用已声明 Float 参数时返回 true。</returns>
        public static bool ValidateParameters(
            BlendTree blendTree,
            IReadOnlyDictionary<string, AnimatorControllerParameterType> parameterTypes)
        {
            if (blendTree == null || parameterTypes == null)
            {
                return false;
            }

            switch (blendTree.blendType)
            {
                case BlendTreeType.Simple1D:
                    return IsFloatParameter(blendTree.blendParameter, parameterTypes);
                case BlendTreeType.SimpleDirectional2D:
                case BlendTreeType.FreeformDirectional2D:
                case BlendTreeType.FreeformCartesian2D:
                    return IsFloatParameter(blendTree.blendParameter, parameterTypes) &&
                           IsFloatParameter(blendTree.blendParameterY, parameterTypes);
                case BlendTreeType.Direct:
                    return ValidateDirectChildren(blendTree.children, parameterTypes);
                default:
                    return false;
            }
        }

        /// <summary>验证 Direct 模式每个子项单独指定的混合权重参数。</summary>
        /// <param name="children">Direct BlendTree 的子项。</param>
        /// <param name="parameterTypes">Controller 已声明的参数名称与类型。</param>
        /// <returns>存在子项且每个权重参数均为已声明 Float 时返回 true。</returns>
        private static bool ValidateDirectChildren(
            ChildMotion[] children,
            IReadOnlyDictionary<string, AnimatorControllerParameterType> parameterTypes)
        {
            if (children == null || children.Length == 0)
            {
                return false;
            }

            foreach (ChildMotion child in children)
            {
                if (!IsFloatParameter(child.directBlendParameter, parameterTypes))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>确认参数名称有效且其 Controller 类型为 Float。</summary>
        /// <param name="name">BlendTree 声明的参数名。</param>
        /// <param name="parameterTypes">Controller 参数映射。</param>
        /// <returns>参数存在且为 Float 时返回 true。</returns>
        private static bool IsFloatParameter(
            string name,
            IReadOnlyDictionary<string, AnimatorControllerParameterType> parameterTypes)
        {
            return !string.IsNullOrWhiteSpace(name) &&
                   parameterTypes.TryGetValue(name, out AnimatorControllerParameterType type) &&
                   type == AnimatorControllerParameterType.Float;
        }
    }
}
