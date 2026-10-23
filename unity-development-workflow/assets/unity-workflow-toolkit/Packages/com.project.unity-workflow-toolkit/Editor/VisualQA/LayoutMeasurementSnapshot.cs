using System;
using System.Collections.Generic;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>保存二维向量实际分量。</summary>
    [Serializable]
    public sealed class LayoutVector2
    {
        /// <summary>向量 X 分量。</summary>
        public float x;
        /// <summary>向量 Y 分量。</summary>
        public float y;
    }

    /// <summary>保存布局宽高，单位沿用当前 UI 系统的原生布局单位。</summary>
    [Serializable]
    public sealed class LayoutSize
    {
        /// <summary>实际宽度。</summary>
        public float width;
        /// <summary>实际高度。</summary>
        public float height;
    }

    /// <summary>保存 RectTransform 的实际锚点、局部尺寸和驱动组件信息。</summary>
    [Serializable]
    public sealed class LayoutRectTransformSnapshot
    {
        /// <summary>实际最小锚点。</summary>
        public LayoutVector2 anchorMin;
        /// <summary>实际最大锚点。</summary>
        public LayoutVector2 anchorMax;
        /// <summary>实际枢轴点。</summary>
        public LayoutVector2 pivot;
        /// <summary>实际 sizeDelta。</summary>
        public LayoutVector2 sizeDelta;
        /// <summary>实际 anchoredPosition。</summary>
        public LayoutVector2 anchoredPosition;
        /// <summary>RectTransform 当前局部矩形尺寸。</summary>
        public LayoutSize localSize;
        /// <summary>Unity 当前报告的实际驱动对象类型；未驱动时为空。</summary>
        public string drivenBy = string.Empty;
    }

    /// <summary>保存目标自身或直接父级 LayoutGroup 的实际控制配置。</summary>
    [Serializable]
    public sealed class LayoutGroupSnapshot
    {
        /// <summary>LayoutGroup 具体组件类型。</summary>
        public string type = string.Empty;
        /// <summary>组件 Inspector 启用状态。</summary>
        public bool enabled;
        /// <summary>是否控制子项宽度。</summary>
        public bool childControlWidth;
        /// <summary>是否控制子项高度。</summary>
        public bool childControlHeight;
        /// <summary>是否强制扩展子项宽度。</summary>
        public bool childForceExpandWidth;
        /// <summary>是否强制扩展子项高度。</summary>
        public bool childForceExpandHeight;
        /// <summary>GridLayoutGroup 的单元格宽高；非网格布局为空。</summary>
        public LayoutSize cellSize;
    }

    /// <summary>保存 ContentSizeFitter 的实际轴向尺寸策略。</summary>
    [Serializable]
    public sealed class LayoutContentSizeFitterSnapshot
    {
        /// <summary>组件 Inspector 启用状态。</summary>
        public bool enabled;
        /// <summary>实际水平适配策略。</summary>
        public string horizontalFit = string.Empty;
        /// <summary>实际垂直适配策略。</summary>
        public string verticalFit = string.Empty;
    }

    /// <summary>保存 AspectRatioFitter 的实际启用状态和轴向控制模式。</summary>
    [Serializable]
    public sealed class LayoutAspectRatioFitterSnapshot
    {
        /// <summary>组件 Inspector 启用状态。</summary>
        public bool enabled;
        /// <summary>AspectRatioFitter 实际宽高控制模式。</summary>
        public string aspectMode = string.Empty;
        /// <summary>组件实际宽高比配置。</summary>
        public float aspectRatio;
    }

    /// <summary>保存 uGUI Image 与其实际 Sprite 资源和原生尺寸关系。</summary>
    [Serializable]
    public sealed class LayoutImageSnapshot
    {
        /// <summary>Sprite 资源 GUID；非持久资产时为空。</summary>
        public string assetGuid = string.Empty;
        /// <summary>以字符串保留精度的 Sprite 本地文件 ID。</summary>
        public string localId = string.Empty;
        /// <summary>Sprite 实际资源路径。</summary>
        public string assetPath = string.Empty;
        /// <summary>Sprite 源像素尺寸。</summary>
        public LayoutSize sourceSize;
        /// <summary>Sprite 导入时的 Pixels Per Unit。</summary>
        public float pixelsPerUnit;
        /// <summary>Image 组件计算出的实际 pixelsPerUnit。</summary>
        public float imagePixelsPerUnit;
        /// <summary>所在 Canvas 的参考 Pixels Per Unit。</summary>
        public float referencePixelsPerUnit;
        /// <summary>Image 的像素单位倍率；该字段不参与 nativeSize 公式。</summary>
        public float pixelsPerUnitMultiplier;
        /// <summary>Image 的实际类型。</summary>
        public string type = string.Empty;
        /// <summary>Image RectTransform 的局部显示尺寸。</summary>
        public LayoutSize localSize;
        /// <summary>按 Sprite.rect / Image.pixelsPerUnit 得到的原生尺寸。</summary>
        public LayoutSize nativeSize;
        /// <summary>Sprite 是否含九宫格边框。</summary>
        public bool hasBorder;
        /// <summary>Sprite 边框，顺序为 left、bottom、right、top。</summary>
        public float[] border = new float[4];
        /// <summary>Image 是否保持源图宽高比。</summary>
        public bool preserveAspect;
    }

    /// <summary>保存 UI Toolkit 元素当前 Panel 计算出的布局与背景切片属性。</summary>
    [Serializable]
    public sealed class LayoutUiToolkitSnapshot
    {
        /// <summary>实际 position 样式。</summary>
        public string position = string.Empty;
        /// <summary>实际 display 样式。</summary>
        public string display = string.Empty;
        /// <summary>Panel 完成布局后的宽度。</summary>
        public float width;
        /// <summary>Panel 完成布局后的高度。</summary>
        public float height;
        /// <summary>实际 flexGrow。</summary>
        public float flexGrow;
        /// <summary>实际 flexShrink。</summary>
        public float flexShrink;
        /// <summary>实际 flexDirection。</summary>
        public string flexDirection = string.Empty;
        /// <summary>实际 alignItems。</summary>
        public string alignItems = string.Empty;
        /// <summary>实际 justifyContent。</summary>
        public string justifyContent = string.Empty;
        /// <summary>实际背景资源 GUID；无背景资产时为空。</summary>
        public string backgroundAssetGuid = string.Empty;
        /// <summary>背景九宫格左切边。</summary>
        public float sliceLeft;
        /// <summary>背景九宫格右切边。</summary>
        public float sliceRight;
        /// <summary>背景九宫格上切边。</summary>
        public float sliceTop;
        /// <summary>背景九宫格下切边。</summary>
        public float sliceBottom;
        /// <summary>背景九宫格缩放系数。</summary>
        public float sliceScale;
    }

    /// <summary>保存一个已安装登记组件观察到的真实外部写入者。</summary>
    [Serializable]
    public sealed class LayoutExternalWriterSnapshot
    {
        /// <summary>写入来源枚举名称。</summary>
        public string driver = string.Empty;
        /// <summary>实际 Behaviour 的具体类型。</summary>
        public string ownerType = string.Empty;
        /// <summary>实际 Behaviour 所在对象的层级路径。</summary>
        public string ownerPath = string.Empty;
        /// <summary>Behaviour 当前是否启用且层级活动。</summary>
        public bool active;
        /// <summary>该登记绑定的 UI Toolkit 元素名；uGUI 时为空。</summary>
        public string elementName = string.Empty;
        /// <summary>该 Behaviour 是否写入位置。</summary>
        public bool position;
        /// <summary>该 Behaviour 是否写入宽度。</summary>
        public bool width;
        /// <summary>该 Behaviour 是否写入高度。</summary>
        public bool height;
    }

    /// <summary>保存布局属性的真实 Unity 组件写入者与配置快照。</summary>
    [Serializable]
    public sealed class LayoutComponentSnapshot
    {
        /// <summary>目标当前是否活动并参与 UI 布局。</summary>
        public bool active;
        /// <summary>实际位置写入者；同轴冲突保留重复项。</summary>
        public List<string> positionWriters = new List<string>();
        /// <summary>实际宽度写入者；同轴冲突保留重复项。</summary>
        public List<string> widthWriters = new List<string>();
        /// <summary>实际高度写入者；同轴冲突保留重复项。</summary>
        public List<string> heightWriters = new List<string>();
        /// <summary>写入者的观测范围，明确包含引擎组件和显式登记者。</summary>
        public string observationScope = "ENGINE_COMPONENTS_AND_REGISTERED_WRITERS";
        /// <summary>uGUI RectTransform 配置；UI Toolkit 时为空。</summary>
        public LayoutRectTransformSnapshot rectTransform;
        /// <summary>目标自身的 LayoutGroup 配置；不适用时为空。</summary>
        public LayoutGroupSnapshot layoutGroup;
        /// <summary>直接父级 LayoutGroup 配置；不适用时为空。</summary>
        public LayoutGroupSnapshot parentLayoutGroup;
        /// <summary>目标自身 ContentSizeFitter 配置；不适用时为空。</summary>
        public LayoutContentSizeFitterSnapshot contentSizeFitter;
        /// <summary>目标自身 AspectRatioFitter 配置；不适用时为空。</summary>
        public LayoutAspectRatioFitterSnapshot aspectRatioFitter;
        /// <summary>uGUI Image 配置；UI Toolkit 时为空。</summary>
        public LayoutImageSnapshot image;
        /// <summary>UI Toolkit 实际计算样式；uGUI 时为空。</summary>
        public LayoutUiToolkitSnapshot uiToolkit;
        /// <summary>真实安装登记组件中观察到的外部写入关系。</summary>
        public List<LayoutExternalWriterSnapshot> externalWriters = new List<LayoutExternalWriterSnapshot>();
    }
}
