using UnityEngine;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>仅供骨骼角色 PlayMode 回归测试接收动画事件并记录其时间。</summary>
    public sealed class RiggingAnimationEventProbe : MonoBehaviour
    {
        /// <summary>获取当前角色实例收到的命中事件次数。</summary>
        public int ImpactCount { get; private set; }

        /// <summary>获取最近一次事件到达时的缩放游戏时间。</summary>
        public float LastImpactTime { get; private set; }

        /// <summary>由 Animator 的实际 AnimationEvent 调用并记录事件到达。</summary>
        public void OnImpact()
        {
            ImpactCount++;
            LastImpactTime = Time.time;
        }

        /// <summary>供资产检查和回归测试验证匹配 Texture2D 参数的动画事件接收器。</summary>
        /// <param name="texture">AnimationEvent 序列化的纹理对象引用。</param>
        public void OnImpactTexture(Texture2D texture)
        {
            if (texture != null)
            {
                ImpactCount++;
                LastImpactTime = Time.time;
            }
        }

        /// <summary>供缺陷回归构造 Transform 参数与 Texture2D 事件引用不匹配的接收器。</summary>
        /// <param name="target">接收器声明的 Transform 类型参数。</param>
        public void OnImpactTransform(Transform target)
        {
            if (target != null)
            {
                ImpactCount++;
                LastImpactTime = Time.time;
            }
        }
    }
}
