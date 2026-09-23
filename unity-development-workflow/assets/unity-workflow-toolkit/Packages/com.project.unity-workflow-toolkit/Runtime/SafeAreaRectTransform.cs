using UnityEngine;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>
    /// 将全屏 Canvas 的直接子节点限制在实时屏幕安全区内。
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaRectTransform : MonoBehaviour
    {
        private RectTransform target;
        private Rect lastSafeArea;
        private int lastWidth = -1;
        private int lastHeight = -1;

        /// <summary>组件启用时立即读取安全区。</summary>
        private void OnEnable()
        {
            target = GetComponent<RectTransform>();
            ApplyIfChanged();
        }

        /// <summary>窗口尺寸、方向或系统安全区改变后刷新布局。</summary>
        private void LateUpdate()
        {
            ApplyIfChanged();
        }

        /// <summary>仅在输入变化时写入锚点，避免每帧触发 UI 布局重建。</summary>
        private void ApplyIfChanged()
        {
            int width = Screen.width;
            int height = Screen.height;
            if (width <= 0 || height <= 0)
            {
                return;
            }

            Rect safeArea = Screen.safeArea;
            if (width == lastWidth && height == lastHeight && safeArea == lastSafeArea)
            {
                return;
            }

            SafeAreaInsets insets = SafeAreaLayout.Calculate(safeArea, width, height);
            target.anchorMin = new Vector2(insets.Left, insets.Bottom);
            target.anchorMax = new Vector2(1f - insets.Right, 1f - insets.Top);
            target.offsetMin = Vector2.zero;
            target.offsetMax = Vector2.zero;

            lastWidth = width;
            lastHeight = height;
            lastSafeArea = safeArea;
        }
    }
}
