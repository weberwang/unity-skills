using System;
using System.Collections.Generic;
using UnityEngine;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 表示一次只读 2D 骨骼资产工程检查的输入契约。
    /// </summary>
    [Serializable]
    public sealed class RiggingValidationRequest
    {
        [SerializeField] private string schemaVersion = "1.0";
        [SerializeField] private string taskId;
        [SerializeField] private string projectId;
        [SerializeField] private string sourceRevision;
        [SerializeField] private string prefabPath;
        [SerializeField] private string outputPath;
        [SerializeField] private List<RiggingClipRequirement> clips = new List<RiggingClipRequirement>();
        [SerializeField] private List<RiggingVariantRequirement> variants = new List<RiggingVariantRequirement>();

        /// <summary>获取或设置请求契约版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置工作任务 ID。</summary>
        public string TaskId { get => taskId; set => taskId = value; }

        /// <summary>获取或设置项目 ID。</summary>
        public string ProjectId { get => projectId; set => projectId = value; }

        /// <summary>获取或设置源代码修订标识。</summary>
        public string SourceRevision { get => sourceRevision; set => sourceRevision = value; }

        /// <summary>获取或设置项目内角色 Prefab 路径。</summary>
        public string PrefabPath { get => prefabPath; set => prefabPath = value; }

        /// <summary>获取或设置仅供命令层写入报告的项目内输出路径。</summary>
        public string OutputPath { get => outputPath; set => outputPath = value; }

        /// <summary>获取或设置必须存在于角色 Controller 中的动画需求。</summary>
        public List<RiggingClipRequirement> Clips
        {
            get => clips;
            set => clips = value ?? new List<RiggingClipRequirement>();
        }

        /// <summary>获取或设置需要核对的 Sprite 变体需求。</summary>
        public List<RiggingVariantRequirement> Variants
        {
            get => variants;
            set => variants = value ?? new List<RiggingVariantRequirement>();
        }
    }

    /// <summary>
    /// 声明一个必须由角色 Animator Controller 驱动的动画片段及其检查要求。
    /// </summary>
    [Serializable]
    public sealed class RiggingClipRequirement
    {
        [SerializeField] private string id;
        [SerializeField] private string clipPath;
        [SerializeField] private bool loop;
        [SerializeField] private List<string> requiredEvents = new List<string>();

        /// <summary>获取或设置动画需求的唯一 ID。</summary>
        public string Id { get => id; set => id = value; }

        /// <summary>获取或设置项目内动画资源路径。</summary>
        public string ClipPath { get => clipPath; set => clipPath = value; }

        /// <summary>获取或设置该动画是否预期循环。</summary>
        public bool Loop { get => loop; set => loop = value; }

        /// <summary>获取或设置必须存在于片段中的动画事件函数名。</summary>
        public List<string> RequiredEvents
        {
            get => requiredEvents;
            set => requiredEvents = value ?? new List<string>();
        }
    }

    /// <summary>
    /// 声明一个需要检查的角色 Sprite 变体及其目标渲染节点。
    /// </summary>
    [Serializable]
    public sealed class RiggingVariantRequirement
    {
        [SerializeField] private string id;
        [SerializeField] private string rendererPath;
        [SerializeField] private string spritePath;
        [SerializeField] private string spriteName;

        /// <summary>获取或设置变体需求的唯一 ID。</summary>
        public string Id { get => id; set => id = value; }

        /// <summary>获取或设置相对于角色 Prefab 根节点的 SpriteRenderer 路径；根节点使用空字符串。</summary>
        public string RendererPath { get => rendererPath; set => rendererPath = value; }

        /// <summary>获取或设置 Sprite 资源所在的项目内路径。</summary>
        public string SpritePath { get => spritePath; set => spritePath = value; }

        /// <summary>获取或设置该资源中的 Sprite 子资源名称。</summary>
        public string SpriteName { get => spriteName; set => spriteName = value; }
    }
}
