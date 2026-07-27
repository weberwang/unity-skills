using System;
using UnityEngine;

namespace Project.UnityWorkflow.Core.Models
{
    /// <summary>
    /// 表示与 project-profile.schema.json 对齐的 Unity 项目画像。
    /// </summary>
    [Serializable]
    public sealed class ProjectProfileDto
    {
        [SerializeField] private string schemaVersion = "1.0";
        [SerializeField] private string projectId;
        [SerializeField] private ProjectWorkflowDto workflow = new ProjectWorkflowDto();
        [SerializeField] private UnityProfileDto unity = new UnityProfileDto();
        [SerializeField] private DeliveryProfileDto delivery = new DeliveryProfileDto();
        [SerializeField] private CapabilityProfileDto capabilities = new CapabilityProfileDto();
        [SerializeField] private ProjectPathProfileDto paths = new ProjectPathProfileDto();
        [SerializeField] private QualityBudgetDto quality = new QualityBudgetDto();

        /// <summary>获取或设置 Schema 版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置项目 ID。</summary>
        public string ProjectId { get => projectId; set => projectId = value; }

        /// <summary>获取或设置工作流通道与门禁状态。</summary>
        public ProjectWorkflowDto Workflow { get => workflow; set => workflow = value ?? new ProjectWorkflowDto(); }

        /// <summary>获取或设置 Unity 技术基线。</summary>
        public UnityProfileDto Unity { get => unity; set => unity = value ?? new UnityProfileDto(); }

        /// <summary>获取或设置交付平台信息。</summary>
        public DeliveryProfileDto Delivery { get => delivery; set => delivery = value ?? new DeliveryProfileDto(); }

        /// <summary>获取或设置联网与商业能力开关。</summary>
        public CapabilityProfileDto Capabilities { get => capabilities; set => capabilities = value ?? new CapabilityProfileDto(); }

        /// <summary>获取或设置工作流约定路径。</summary>
        public ProjectPathProfileDto Paths { get => paths; set => paths = value ?? new ProjectPathProfileDto(); }

        /// <summary>获取或设置质量预算。</summary>
        public QualityBudgetDto Quality { get => quality; set => quality = value ?? new QualityBudgetDto(); }
    }

    /// <summary>
    /// 表示工作流通道、阶段门禁与质量目标确认状态。
    /// </summary>
    [Serializable]
    public sealed class ProjectWorkflowDto
    {
        [SerializeField] private string channel;
        [SerializeField] private string gate;
        [SerializeField] private string qualityTargetsStatus;

        /// <summary>获取或设置 QUICK、STANDARD 或 RELEASE 通道。</summary>
        public string Channel { get => channel; set => channel = value; }

        /// <summary>获取或设置 G0 至 G3 门禁。</summary>
        public string Gate { get => gate; set => gate = value; }

        /// <summary>获取或设置质量目标是否已批准。</summary>
        public string QualityTargetsStatus { get => qualityTargetsStatus; set => qualityTargetsStatus = value; }
    }

    /// <summary>
    /// 表示 Unity 编辑器版本与渲染管线基线。
    /// </summary>
    [Serializable]
    public sealed class UnityProfileDto
    {
        [SerializeField] private string version;
        [SerializeField] private string renderPipeline;

        /// <summary>获取或设置 Unity 主版本。</summary>
        public string Version { get => version; set => version = value; }

        /// <summary>获取或设置渲染管线。</summary>
        public string RenderPipeline { get => renderPipeline; set => renderPipeline = value; }
    }

    /// <summary>
    /// 表示目标平台与分发渠道。
    /// </summary>
    [Serializable]
    public sealed class DeliveryProfileDto
    {
        [SerializeField] private string platform;
        [SerializeField] private string distributionChannel;

        /// <summary>获取或设置交付平台。</summary>
        public string Platform { get => platform; set => platform = value; }

        /// <summary>获取或设置分发渠道。</summary>
        public string DistributionChannel { get => distributionChannel; set => distributionChannel = value; }
    }

    /// <summary>
    /// 表示会影响安全、隐私和平台验收的项目能力开关。
    /// </summary>
    [Serializable]
    public sealed class CapabilityProfileDto
    {
        [SerializeField] private bool login;
        [SerializeField] private bool cloudSave;
        [SerializeField] private bool purchases;
        [SerializeField] private bool ads;
        [SerializeField] private bool analytics;
        [SerializeField] private bool crashReporting;
        [SerializeField] private bool online;

        /// <summary>获取或设置是否包含登录。</summary>
        public bool Login { get => login; set => login = value; }

        /// <summary>获取或设置是否包含云存档。</summary>
        public bool CloudSave { get => cloudSave; set => cloudSave = value; }

        /// <summary>获取或设置是否包含购买。</summary>
        public bool Purchases { get => purchases; set => purchases = value; }

        /// <summary>获取或设置是否包含广告。</summary>
        public bool Ads { get => ads; set => ads = value; }

        /// <summary>获取或设置是否包含分析采集。</summary>
        public bool Analytics { get => analytics; set => analytics = value; }

        /// <summary>获取或设置是否包含崩溃报告。</summary>
        public bool CrashReporting { get => crashReporting; set => crashReporting = value; }

        /// <summary>获取或设置是否依赖联网。</summary>
        public bool Online { get => online; set => online = value; }
    }

    /// <summary>
    /// 表示生成源、运行时美术和制品目录约定。
    /// </summary>
    [Serializable]
    public sealed class ProjectPathProfileDto
    {
        [SerializeField] private string generatedSourceRoot;
        [SerializeField] private string runtimeArtRoot;
        [SerializeField] private string artifactRoot;

        /// <summary>获取或设置生成源根目录。</summary>
        public string GeneratedSourceRoot { get => generatedSourceRoot; set => generatedSourceRoot = value; }

        /// <summary>获取或设置运行时美术根目录。</summary>
        public string RuntimeArtRoot { get => runtimeArtRoot; set => runtimeArtRoot = value; }

        /// <summary>获取或设置制品根目录。</summary>
        public string ArtifactRoot { get => artifactRoot; set => artifactRoot = value; }
    }

    /// <summary>
    /// 表示项目级帧率、耗时、内存、渲染与包体预算。
    /// </summary>
    [Serializable]
    public sealed class QualityBudgetDto
    {
        [SerializeField] private float minimumFps;
        [SerializeField] private float maximumCpuFrameTimeMs;
        [SerializeField] private float maximumGpuFrameTimeMs;
        [SerializeField] private float maximumMemoryMb;
        [SerializeField] private float maximumGcAllocKbPerFrame;
        [SerializeField] private float maximumDrawCalls;
        [SerializeField] private float maximumTextureMemoryMb;
        [SerializeField] private float maximumBuildSizeMb;
        [SerializeField] private float maximumLoadTimeSeconds;

        /// <summary>获取或设置最低帧率。</summary>
        public float MinimumFps { get => minimumFps; set => minimumFps = value; }

        /// <summary>获取或设置 CPU 最大单帧耗时。</summary>
        public float MaximumCpuFrameTimeMs { get => maximumCpuFrameTimeMs; set => maximumCpuFrameTimeMs = value; }

        /// <summary>获取或设置 GPU 最大单帧耗时。</summary>
        public float MaximumGpuFrameTimeMs { get => maximumGpuFrameTimeMs; set => maximumGpuFrameTimeMs = value; }

        /// <summary>获取或设置最大内存占用。</summary>
        public float MaximumMemoryMb { get => maximumMemoryMb; set => maximumMemoryMb = value; }

        /// <summary>获取或设置每帧最大 GC 分配。</summary>
        public float MaximumGcAllocKbPerFrame { get => maximumGcAllocKbPerFrame; set => maximumGcAllocKbPerFrame = value; }

        /// <summary>获取或设置最大 Draw Call 数。</summary>
        public float MaximumDrawCalls { get => maximumDrawCalls; set => maximumDrawCalls = value; }

        /// <summary>获取或设置最大纹理内存。</summary>
        public float MaximumTextureMemoryMb { get => maximumTextureMemoryMb; set => maximumTextureMemoryMb = value; }

        /// <summary>获取或设置最大构建体积。</summary>
        public float MaximumBuildSizeMb { get => maximumBuildSizeMb; set => maximumBuildSizeMb = value; }

        /// <summary>获取或设置最大加载耗时。</summary>
        public float MaximumLoadTimeSeconds { get => maximumLoadTimeSeconds; set => maximumLoadTimeSeconds = value; }
    }
}
