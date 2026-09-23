using System;
using NUnit.Framework;
using Project.UnityWorkflow.Runtime;
using UnityEngine;

namespace Project.UnityWorkflow.Tests.Editor
{
    /// <summary>
    /// 验证屏幕安全区在横竖屏和异常边界下的归一化结果。
    /// </summary>
    public sealed class SafeAreaLayoutTests
    {
        /// <summary>竖屏刘海和底部手势区应分别产生顶部、底部留白。</summary>
        [Test]
        public void Calculate_PortraitCutout_ReservesTopAndBottom()
        {
            SafeAreaInsets insets = SafeAreaLayout.Calculate(new Rect(0f, 80f, 1080f, 1760f), 1080, 1920);

            Assert.That(insets.Left, Is.Zero);
            Assert.That(insets.Right, Is.Zero);
            Assert.That(insets.Top, Is.EqualTo(80f / 1920f).Within(0.0001f));
            Assert.That(insets.Bottom, Is.EqualTo(80f / 1920f).Within(0.0001f));
        }

        /// <summary>横屏两侧挖孔应映射为左右留白，不能误用屏幕纵轴。</summary>
        [Test]
        public void Calculate_LandscapeSideInsets_ReservesLeftAndRight()
        {
            SafeAreaInsets insets = SafeAreaLayout.Calculate(new Rect(120f, 0f, 2220f, 1080f), 2560, 1080);

            Assert.That(insets.Left, Is.EqualTo(120f / 2560f).Within(0.0001f));
            Assert.That(insets.Right, Is.EqualTo(220f / 2560f).Within(0.0001f));
            Assert.That(insets.Top, Is.Zero);
            Assert.That(insets.Bottom, Is.Zero);
        }

        /// <summary>系统报告越界值时，结果仍必须限制在屏幕内。</summary>
        [Test]
        public void Calculate_OutOfBounds_ClampsToScreen()
        {
            SafeAreaInsets insets = SafeAreaLayout.Calculate(new Rect(-20f, -10f, 1200f, 2100f), 1080, 1920);

            Assert.That(insets.Left, Is.Zero);
            Assert.That(insets.Right, Is.Zero);
            Assert.That(insets.Top, Is.Zero);
            Assert.That(insets.Bottom, Is.Zero);
        }

        /// <summary>无效屏幕尺寸不得产生除零或不可用的锚点。</summary>
        [Test]
        public void Calculate_ZeroScreenSize_RejectsInput()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => SafeAreaLayout.Calculate(new Rect(0f, 0f, 1f, 1f), 0, 1920));
        }
    }
}
