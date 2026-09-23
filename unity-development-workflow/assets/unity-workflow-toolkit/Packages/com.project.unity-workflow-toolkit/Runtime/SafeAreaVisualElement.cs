using UnityEngine;
using UnityEngine.UIElements;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>
    /// 将 UIDocument 根节点的指定直接子节点限制在实时屏幕安全区内。
    /// </summary>
    [RequireComponent(typeof(UIDocument))]
    public sealed class SafeAreaVisualElement : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        [SerializeField] private string safeAreaElementName = "SafeAreaRoot";

        private VisualElement root;
        private VisualElement target;
        private Rect lastSafeArea;
        private Vector2 lastPanelSize;
        private int lastWidth = -1;
        private int lastHeight = -1;

        /// <summary>组件启用时解析 UIDocument 与目标节点。</summary>
        private void OnEnable()
        {
            if (document == null)
            {
                document = GetComponent<UIDocument>();
            }

            Refresh();
        }

        /// <summary>追踪安全区、方向以及 Panel 缩放后的实际尺寸变化。</summary>
        private void Update()
        {
            Refresh();
        }

        /// <summary>重新取得可能因 UIDocument 重建而失效的节点。</summary>
        private void Refresh()
        {
            if (document == null || string.IsNullOrWhiteSpace(safeAreaElementName))
            {
                return;
            }

            VisualElement currentRoot = document.rootVisualElement;
            if (currentRoot == null)
            {
                return;
            }

            if (currentRoot != root)
            {
                root = currentRoot;
                target = null;
            }

            if (target == null || target.parent != root)
            {
                target = root.Q<VisualElement>(safeAreaElementName);
                if (target == null || target.parent != root)
                {
                    target = null;
                    return;
                }

                // 目标必须是全屏根节点的直接子节点，否则四边留白会以错误的父级计算。
                lastWidth = -1;
            }

            int width = Screen.width;
            int height = Screen.height;
            Vector2 panelSize = root.layout.size;
            if (width <= 0 || height <= 0 || float.IsNaN(panelSize.x) || float.IsNaN(panelSize.y)
                || float.IsInfinity(panelSize.x) || float.IsInfinity(panelSize.y)
                || panelSize.x <= 0f || panelSize.y <= 0f)
            {
                return;
            }

            Rect safeArea = Screen.safeArea;
            if (width == lastWidth && height == lastHeight && safeArea == lastSafeArea && panelSize == lastPanelSize)
            {
                return;
            }

            SafeAreaInsets insets = SafeAreaLayout.Calculate(safeArea, width, height);
            target.style.position = Position.Absolute;
            target.style.left = panelSize.x * insets.Left;
            target.style.right = panelSize.x * insets.Right;
            target.style.top = panelSize.y * insets.Top;
            target.style.bottom = panelSize.y * insets.Bottom;

            lastWidth = width;
            lastHeight = height;
            lastSafeArea = safeArea;
            lastPanelSize = panelSize;
        }
    }
}
