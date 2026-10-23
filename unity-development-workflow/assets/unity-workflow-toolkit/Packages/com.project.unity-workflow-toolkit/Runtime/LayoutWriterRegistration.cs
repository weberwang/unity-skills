using System;
using System.Collections.Generic;
using UnityEngine;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>标记登记写入者属于脚本还是动画系统。</summary>
    public enum LayoutWriterDriver
    {
        /// <summary>表示写入来自脚本组件。</summary>
        Script,
        /// <summary>表示写入来自动画组件。</summary>
        Animation
    }

    /// <summary>保存一个真实 Behaviour 到布局属性的人工登记关系。</summary>
    [Serializable]
    public sealed class LayoutWriterRegistrationEntry
    {
        /// <summary>实际负责写入布局的 Behaviour 引用。</summary>
        public Behaviour writer;
        /// <summary>UI Toolkit 目标元素名称；uGUI 登记时留空。</summary>
        public string elementName = string.Empty;
        /// <summary>该 Behaviour 声明的写入来源类别。</summary>
        public LayoutWriterDriver driver = LayoutWriterDriver.Script;
        /// <summary>该 Behaviour 是否写入目标位置。</summary>
        public bool position;
        /// <summary>该 Behaviour 是否写入目标宽度。</summary>
        public bool width;
        /// <summary>该 Behaviour 是否写入目标高度。</summary>
        public bool height;
    }

    /// <summary>仅供布局取证读取外部写入者登记，不执行或代理任何布局行为。</summary>
    public sealed class LayoutWriterRegistration : MonoBehaviour
    {
        /// <summary>获取场景作者登记的实际写入组件及其属性范围。</summary>
        public List<LayoutWriterRegistrationEntry> entries = new List<LayoutWriterRegistrationEntry>();
    }
}
