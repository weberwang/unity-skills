using System;
using UnityEngine;

namespace Project.UnityWorkflow.Core.Models
{
    /// <summary>表示图片任务中明确声明的九宫格切片决策。</summary>
    [Serializable]
    public sealed class NineSliceDto
    {
        [SerializeField] private string mode;
        [SerializeField] private string reason;
        [SerializeField] private NineSliceSourceSizeDto sourceSize;
        [SerializeField] private float[] border;

        /// <summary>获取或设置 stretch 或 not-applicable 决策。</summary>
        public string Mode { get => mode; set => mode = value; }

        /// <summary>获取或设置切片适用性说明。</summary>
        public string Reason { get => reason; set => reason = value; }

        /// <summary>获取或设置生产源图的预期像素尺寸。</summary>
        public NineSliceSourceSizeDto SourceSize { get => sourceSize; set => sourceSize = value; }

        /// <summary>获取或设置源像素边框，顺序为 [left, bottom, right, top]。</summary>
        public float[] Border { get => border; set => border = value; }
    }

    /// <summary>表示九宫格任务声明的源图像素尺寸。</summary>
    [Serializable]
    public sealed class NineSliceSourceSizeDto
    {
        [SerializeField] private int width;
        [SerializeField] private int height;

        /// <summary>获取或设置源图宽度像素。</summary>
        public int Width { get => width; set => width = value; }

        /// <summary>获取或设置源图高度像素。</summary>
        public int Height { get => height; set => height = value; }
    }
}
