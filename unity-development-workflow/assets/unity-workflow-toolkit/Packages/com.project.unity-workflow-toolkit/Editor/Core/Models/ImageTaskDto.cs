using System;
using System.Collections.Generic;
using UnityEngine;

namespace Project.UnityWorkflow.Core.Models
{
    /// <summary>
    /// 表示与 image-task.schema.json 对齐的图片生产任务。
    /// </summary>
    [Serializable]
    public sealed class ImageTaskDto
    {
        [SerializeField] private string schemaVersion = "1.0";
        [SerializeField] private string id;
        [SerializeField] private string resourceId;
        [SerializeField] private string sourceVersion;
        [SerializeField] private string module;
        [SerializeField] private string assetType;
        [SerializeField] private string useCase;
        [SerializeField] private string brief;
        [SerializeField] private List<string> references = new List<string>();
        [SerializeField] private ImageOutputDto output = new ImageOutputDto();
        [SerializeField] private SelectedImageCandidateDto selectedCandidate;
        [SerializeField] private EvidenceDto finalVisualReview;
        [SerializeField] private ImageUnityImportDto unityImport = new ImageUnityImportDto();
        [SerializeField] private List<AcceptanceCriterionDto> acceptance = new List<AcceptanceCriterionDto>();
        [SerializeField] private string status;
        [SerializeField] private List<ApprovalDto> approvals = new List<ApprovalDto>();

        /// <summary>获取或设置 Schema 版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置图片任务 ID。</summary>
        public string Id { get => id; set => id = value; }

        /// <summary>获取或设置资源唯一 ID。</summary>
        public string ResourceId { get => resourceId; set => resourceId = value; }

        /// <summary>获取或设置源视觉版本。</summary>
        public string SourceVersion { get => sourceVersion; set => sourceVersion = value; }

        /// <summary>获取或设置归属模块。</summary>
        public string Module { get => module; set => module = value; }

        /// <summary>获取或设置资源类型。</summary>
        public string AssetType { get => assetType; set => assetType = value; }

        /// <summary>获取或设置游戏内用途。</summary>
        public string UseCase { get => useCase; set => useCase = value; }

        /// <summary>获取或设置生成简报。</summary>
        public string Brief { get => brief; set => brief = value; }

        /// <summary>获取或设置项目内参考图路径。</summary>
        public List<string> References
        {
            get => references;
            set => references = value ?? new List<string>();
        }

        /// <summary>获取或设置输出约束。</summary>
        public ImageOutputDto Output { get => output; set => output = value ?? new ImageOutputDto(); }

        /// <summary>获取或设置已批准候选；未批准时允许为空。</summary>
        public SelectedImageCandidateDto SelectedCandidate { get => selectedCandidate; set => selectedCandidate = value; }

        /// <summary>获取或设置最终视觉审查证据；未批准时允许为空。</summary>
        public EvidenceDto FinalVisualReview { get => finalVisualReview; set => finalVisualReview = value; }

        /// <summary>获取或设置 Unity 导入参数。</summary>
        public ImageUnityImportDto UnityImport { get => unityImport; set => unityImport = value ?? new ImageUnityImportDto(); }

        /// <summary>获取或设置验收条件。</summary>
        public List<AcceptanceCriterionDto> Acceptance
        {
            get => acceptance;
            set => acceptance = value ?? new List<AcceptanceCriterionDto>();
        }

        /// <summary>获取或设置工作流状态。</summary>
        public string Status { get => status; set => status = value; }

        /// <summary>获取或设置批准记录。</summary>
        public List<ApprovalDto> Approvals
        {
            get => approvals;
            set => approvals = value ?? new List<ApprovalDto>();
        }
    }

    /// <summary>
    /// 表示图片候选数量、画幅和正式目标路径。
    /// </summary>
    [Serializable]
    public sealed class ImageOutputDto
    {
        [SerializeField] private int candidateCount;
        [SerializeField] private string aspectRatio;
        [SerializeField] private bool alphaRequired;
        [SerializeField] private string targetPath;
        [SerializeField] private string filename;

        /// <summary>获取或设置候选数量。</summary>
        public int CandidateCount { get => candidateCount; set => candidateCount = value; }

        /// <summary>获取或设置宽高比。</summary>
        public string AspectRatio { get => aspectRatio; set => aspectRatio = value; }

        /// <summary>获取或设置是否需要 Alpha 通道。</summary>
        public bool AlphaRequired { get => alphaRequired; set => alphaRequired = value; }

        /// <summary>获取或设置正式目标目录。</summary>
        public string TargetPath { get => targetPath; set => targetPath = value; }

        /// <summary>获取或设置正式文件名。</summary>
        public string Filename { get => filename; set => filename = value; }
    }

    /// <summary>
    /// 表示用户已批准的单个候选图片及其不可变版本信息。
    /// </summary>
    [Serializable]
    public sealed class SelectedImageCandidateDto
    {
        [SerializeField] private string path;
        [SerializeField] private string sha256;
        [SerializeField] private string visualVersion;

        /// <summary>获取或设置 processed 区源路径。</summary>
        public string Path { get => path; set => path = value; }

        /// <summary>获取或设置源图片 SHA-256。</summary>
        public string Sha256 { get => sha256; set => sha256 = value; }

        /// <summary>获取或设置候选视觉版本。</summary>
        public string VisualVersion { get => visualVersion; set => visualVersion = value; }
    }

    /// <summary>
    /// 表示 Unity TextureImporter 的声明式设置。
    /// </summary>
    [Serializable]
    public sealed class ImageUnityImportDto
    {
        [SerializeField] private string textureType;
        [SerializeField] private string spriteMode;
        [SerializeField] private float pixelsPerUnit;
        [SerializeField] private string filterMode;
        [SerializeField] private string wrapMode;
        [SerializeField] private int maxSize;
        [SerializeField] private string compression;
        [SerializeField] private bool sRgb;
        [SerializeField] private bool alphaIsTransparency;
        [SerializeField] private bool mipmaps;
        [SerializeField] private bool readWriteEnabled;

        /// <summary>获取或设置 Default、Sprite 或 NormalMap 类型。</summary>
        public string TextureType { get => textureType; set => textureType = value; }

        /// <summary>获取或设置 Single、Multiple 或 None Sprite 模式。</summary>
        public string SpriteMode { get => spriteMode; set => spriteMode = value; }

        /// <summary>获取或设置每单位像素数。</summary>
        public float PixelsPerUnit { get => pixelsPerUnit; set => pixelsPerUnit = value; }

        /// <summary>获取或设置过滤模式。</summary>
        public string FilterMode { get => filterMode; set => filterMode = value; }

        /// <summary>获取或设置寻址模式。</summary>
        public string WrapMode { get => wrapMode; set => wrapMode = value; }

        /// <summary>获取或设置最大纹理尺寸。</summary>
        public int MaxSize { get => maxSize; set => maxSize = value; }

        /// <summary>获取或设置压缩等级。</summary>
        public string Compression { get => compression; set => compression = value; }

        /// <summary>获取或设置是否使用 sRGB 采样。</summary>
        public bool SRgb { get => sRgb; set => sRgb = value; }

        /// <summary>获取或设置是否将 Alpha 解释为透明度。</summary>
        public bool AlphaIsTransparency { get => alphaIsTransparency; set => alphaIsTransparency = value; }

        /// <summary>获取或设置是否生成 Mipmap。</summary>
        public bool Mipmaps { get => mipmaps; set => mipmaps = value; }

        /// <summary>获取或设置运行时读写开关。</summary>
        public bool ReadWriteEnabled { get => readWriteEnabled; set => readWriteEnabled = value; }
    }

    /// <summary>
    /// 表示一项必须明确是否要求通过的验收标准。
    /// </summary>
    [Serializable]
    public sealed class AcceptanceCriterionDto
    {
        [SerializeField] private string type;
        [SerializeField] private bool required;

        /// <summary>获取或设置验收类型。</summary>
        public string Type { get => type; set => type = value; }

        /// <summary>获取或设置该条件是否为硬门禁。</summary>
        public bool Required { get => required; set => required = value; }
    }
}
