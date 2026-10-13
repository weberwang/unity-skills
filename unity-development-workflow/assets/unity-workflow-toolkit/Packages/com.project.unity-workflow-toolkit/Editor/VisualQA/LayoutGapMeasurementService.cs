using System;
using System.Collections.Generic;
using Project.UnityWorkflow.VisualQA;
using UnityEngine;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>存放可选间距数据的数值，缺少目标间距时以 null 表达未声明。</summary>
    [Serializable]
    public sealed class LayoutGapValue
    {
        public float value;
    }

    /// <summary>记录同父级已选兄弟节点按实际轴位置排序后的相邻边界间距。</summary>
    [Serializable]
    public sealed class LayoutGapMeasurement
    {
        public string parentPath = string.Empty;
        public string fromId = string.Empty;
        public string toId = string.Empty;
        public float actualGap;
        public LayoutGapValue targetGap;
        public LayoutGapValue deltaGap;
    }

    /// <summary>只对请求中选出的同父级节点计算边界间距，不调整布局也不推断未选节点。</summary>
    public static class LayoutGapMeasurementService
    {
        /// <summary>按父级分组并沿声明轴排序，生成所选节点之间的实际及可选目标间距。</summary>
        /// <param name="report">已经包含实际节点矩形和父级路径的测量报告。</param>
        /// <param name="gapAxis">水平或垂直边界方向；空值表示不测量间距。</param>
        public static void Populate(LayoutMeasurementReport report, string gapAxis)
        {
            report.gapAxis = gapAxis ?? string.Empty;
            report.gapNote = string.IsNullOrEmpty(gapAxis)
                ? string.Empty
                : "仅报告本请求所选节点在同一直接父级内的相邻边界间距，不表示已检查父级的全部子项。";
            report.gaps = new List<LayoutGapMeasurement>();
            if (string.IsNullOrEmpty(gapAxis) || report.measurements == null)
            {
                return;
            }

            var groups = new Dictionary<string, List<LayoutMeasurementItem>>(StringComparer.Ordinal);
            for (int index = 0; index < report.measurements.Count; index++)
            {
                LayoutMeasurementItem item = report.measurements[index];
                if (!groups.TryGetValue(item.parentPath, out List<LayoutMeasurementItem> siblings))
                {
                    siblings = new List<LayoutMeasurementItem>();
                    groups.Add(item.parentPath, siblings);
                }

                siblings.Add(item);
            }

            var parentPaths = new List<string>(groups.Keys);
            parentPaths.Sort(StringComparer.Ordinal);
            for (int parentIndex = 0; parentIndex < parentPaths.Count; parentIndex++)
            {
                string parentPath = parentPaths[parentIndex];
                List<LayoutMeasurementItem> siblings = groups[parentPath];
                siblings.Sort((left, right) => CompareByAxis(left, right, gapAxis));
                for (int siblingIndex = 0; siblingIndex + 1 < siblings.Count; siblingIndex++)
                {
                    LayoutMeasurementItem from = siblings[siblingIndex];
                    LayoutMeasurementItem to = siblings[siblingIndex + 1];
                    float actualGap = GetBoundaryGap(from.actualRect, to.actualRect, gapAxis);
                    var gap = new LayoutGapMeasurement
                    {
                        parentPath = parentPath,
                        fromId = from.id,
                        toId = to.id,
                        actualGap = actualGap
                    };

                    if (from.targetRect != null && to.targetRect != null)
                    {
                        float targetGap = GetBoundaryGap(from.targetRect, to.targetRect, gapAxis);
                        gap.targetGap = new LayoutGapValue { value = targetGap };
                        gap.deltaGap = new LayoutGapValue { value = actualGap - targetGap };
                    }

                    report.gaps.Add(gap);
                }
            }
        }

        /// <summary>以节点起始坐标排序，并用稳定 ID 处理相同起点的并列情况。</summary>
        private static int CompareByAxis(LayoutMeasurementItem left, LayoutMeasurementItem right, string gapAxis)
        {
            float leftStart = gapAxis == "horizontal" ? left.actualRect.x : left.actualRect.y;
            float rightStart = gapAxis == "horizontal" ? right.actualRect.x : right.actualRect.y;
            int positionOrder = leftStart.CompareTo(rightStart);
            return positionOrder != 0 ? positionOrder : string.Compare(left.id, right.id, StringComparison.Ordinal);
        }

        /// <summary>计算两矩形边缘间距；负数表示重叠，不使用中心点距离。</summary>
        private static float GetBoundaryGap(LayoutRect from, LayoutRect to, string gapAxis)
        {
            return gapAxis == "horizontal"
                ? to.x - (from.x + from.width)
                : to.y - (from.y + from.height);
        }
    }
}
