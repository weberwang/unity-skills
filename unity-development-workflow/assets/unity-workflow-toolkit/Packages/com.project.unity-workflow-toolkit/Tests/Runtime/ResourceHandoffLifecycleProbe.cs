using UnityEngine;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>记录只读资源检查期间意外触发的 ExecuteAlways 生命周期回调。</summary>
    [ExecuteAlways]
    public sealed class ResourceHandoffLifecycleProbe : MonoBehaviour
    {
        /// <summary>获取 Awake 回调次数。</summary>
        public static int AwakeCount { get; private set; }

        /// <summary>获取 OnEnable 回调次数。</summary>
        public static int OnEnableCount { get; private set; }

        /// <summary>获取 OnDisable 回调次数。</summary>
        public static int OnDisableCount { get; private set; }

        /// <summary>获取 OnDestroy 回调次数。</summary>
        public static int OnDestroyCount { get; private set; }

        /// <summary>重置计数，使测试只观察资源检查期间的回调。</summary>
        public static void ResetCounts()
        {
            AwakeCount = 0;
            OnEnableCount = 0;
            OnDisableCount = 0;
            OnDestroyCount = 0;
        }

        /// <summary>记录 Unity 在启用该组件时调用的 Awake 生命周期。</summary>
        private void Awake()
        {
            AwakeCount++;
        }

        /// <summary>记录 Unity 在该组件进入启用状态时的回调。</summary>
        private void OnEnable()
        {
            OnEnableCount++;
        }

        /// <summary>记录 Unity 在该组件离开启用状态时的回调。</summary>
        private void OnDisable()
        {
            OnDisableCount++;
        }

        /// <summary>记录 Unity 销毁该组件实例时的回调。</summary>
        private void OnDestroy()
        {
            OnDestroyCount++;
        }
    }
}
