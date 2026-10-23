using System;
using System.Collections.Generic;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>描述一次从已加载场景读取 UI 实际几何的请求。</summary>
    [Serializable]
    public sealed class LayoutMeasurementRequest
    {
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string uiSystem = string.Empty;
        public string coordinateSpace = string.Empty;
        public string outputPath = string.Empty;
        public string gapAxis = string.Empty;
        public bool includeComponentSnapshots;
        public string stateId = string.Empty;
        public string evidenceRoot = string.Empty;
        public List<LayoutMeasurementTarget> targets = new List<LayoutMeasurementTarget>();
    }

    /// <summary>描述需要测量的 uGUI RectTransform 或 UI Toolkit 元素及其直接父框。</summary>
    [Serializable]
    public sealed class LayoutMeasurementTarget
    {
        public string id = string.Empty;
        public string objectPath = string.Empty;
        public string parentObjectPath = string.Empty;
        public string documentPath = string.Empty;
        public string elementName = string.Empty;
        public string parentElementName = string.Empty;
        public string referenceId = string.Empty;
        public string referenceObjectPath = string.Empty;
        public string referenceElementName = string.Empty;
        public string referenceRoot = string.Empty;
        public LayoutRect targetRect;
        public LayoutTolerance tolerance;
    }

    /// <summary>记录一个统一采用左上原点的实际矩形。</summary>
    [Serializable]
    public sealed class LayoutRect
    {
        public float x;
        public float y;
        public float width;
        public float height;
    }

    /// <summary>用一个声明的最大绝对差值同时约束位置和尺寸四个分量。</summary>
    [Serializable]
    public sealed class LayoutTolerance
    {
        public float maxAbsDelta;
    }

    /// <summary>记录实际节点相对直接父框的四边距离。</summary>
    [Serializable]
    public sealed class LayoutMargins
    {
        public float left;
        public float top;
        public float right;
        public float bottom;
    }

    /// <summary>返回一次布局测量的实测值、声明目标与容差结论。</summary>
    [Serializable]
    public sealed class LayoutMeasurementItem
    {
        public string id = string.Empty;
        public string objectPath = string.Empty;
        public string elementName = string.Empty;
        public string parentPath = string.Empty;
        public string referenceId = string.Empty;
        public string referencePath = string.Empty;
        public LayoutRect actualRect;
        public LayoutRect parentRect;
        public LayoutRect referenceRect;
        public LayoutComponentSnapshot componentSnapshot;
        public LayoutMargins margins;
        public LayoutRect targetRect;
        public LayoutRect delta;
        public LayoutTolerance tolerance;
        public string status = "MEASURED";
    }

    /// <summary>表示布局测量结果；MEASURED 不代表通过未声明的精确度阈值。</summary>
    [Serializable]
    public sealed class LayoutMeasurementReport
    {
        public string schemaVersion = "1.0";
        public string status = "FAIL";
        public string errorCode = string.Empty;
        public string message = string.Empty;
        public string taskId = string.Empty;
        public string candidateId = string.Empty;
        public string scenePath = string.Empty;
        public string uiSystem = string.Empty;
        public string coordinateSpace = string.Empty;
        public string unit = string.Empty;
        public string origin = "SCREEN_TOP_LEFT";
        public string generatedAtUtc = string.Empty;
        public string outputPath = string.Empty;
        public string measurementSource = string.Empty;
        public string runId = string.Empty;
        public int frameCount;
        public string stateId = string.Empty;
        public bool includesComponentSnapshots;
        public LayoutRect viewportRect;
        public LayoutRect safeAreaRect;
        public List<LayoutMeasurementItem> measurements = new List<LayoutMeasurementItem>();
        public string gapAxis = string.Empty;
        public string gapNote = string.Empty;
        public List<LayoutGapMeasurement> gaps = new List<LayoutGapMeasurement>();
    }
}
