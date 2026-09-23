using System;
using UnityEngine;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>
    /// 保存安全区域相对屏幕四边的归一化留白。
    /// </summary>
    public readonly struct SafeAreaInsets
    {
        /// <summary>创建四边留白。</summary>
        public SafeAreaInsets(float left, float right, float top, float bottom)
        {
            Left = left;
            Right = right;
            Top = top;
            Bottom = bottom;
        }

        /// <summary>获取左侧留白。</summary>
        public float Left { get; }

        /// <summary>获取右侧留白。</summary>
        public float Right { get; }

        /// <summary>获取顶部留白。</summary>
        public float Top { get; }

        /// <summary>获取底部留白。</summary>
        public float Bottom { get; }
    }

    /// <summary>
    /// 将 Unity 屏幕像素安全区转换为 UI 系统共用的归一化留白。
    /// </summary>
    public static class SafeAreaLayout
    {
        /// <summary>
        /// 计算四边留白，并将越界的安全区限制在当前屏幕内。
        /// </summary>
        public static SafeAreaInsets Calculate(Rect safeArea, int screenWidth, int screenHeight)
        {
            if (screenWidth <= 0 || screenHeight <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(screenWidth), "屏幕宽高必须为正数。");
            }

            float left = Mathf.Clamp(safeArea.xMin, 0f, screenWidth);
            float right = Mathf.Clamp(safeArea.xMax, left, screenWidth);
            float bottom = Mathf.Clamp(safeArea.yMin, 0f, screenHeight);
            float top = Mathf.Clamp(safeArea.yMax, bottom, screenHeight);

            // Screen.safeArea 的原点在左下角；顶部留白需从屏幕高度反算。
            return new SafeAreaInsets(
                left / screenWidth,
                (screenWidth - right) / screenWidth,
                (screenHeight - top) / screenHeight,
                bottom / screenHeight);
        }
    }
}
