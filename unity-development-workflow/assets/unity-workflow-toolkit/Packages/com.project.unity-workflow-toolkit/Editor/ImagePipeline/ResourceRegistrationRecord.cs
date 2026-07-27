using System;
using System.Collections.Generic;
using Project.UnityWorkflow.Core.Models;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 保存从 Unity 重新读取的实际 TextureImporter 设置。
    /// </summary>
    [Serializable]
    public sealed class ImageImporterSummary
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

        /// <summary>获取或设置实际纹理类型。</summary>
        public string TextureType { get => textureType; set => textureType = value; }

        /// <summary>获取或设置实际 Sprite 模式。</summary>
        public string SpriteMode { get => spriteMode; set => spriteMode = value; }

        /// <summary>获取或设置实际每单位像素数。</summary>
        public float PixelsPerUnit { get => pixelsPerUnit; set => pixelsPerUnit = value; }

        /// <summary>获取或设置实际过滤模式。</summary>
        public string FilterMode { get => filterMode; set => filterMode = value; }

        /// <summary>获取或设置实际寻址模式。</summary>
        public string WrapMode { get => wrapMode; set => wrapMode = value; }

        /// <summary>获取或设置实际最大纹理尺寸。</summary>
        public int MaxSize { get => maxSize; set => maxSize = value; }

        /// <summary>获取或设置实际压缩模式。</summary>
        public string Compression { get => compression; set => compression = value; }

        /// <summary>获取或设置实际 sRGB 开关。</summary>
        public bool SRgb { get => sRgb; set => sRgb = value; }

        /// <summary>获取或设置实际 Alpha 透明度开关。</summary>
        public bool AlphaIsTransparency { get => alphaIsTransparency; set => alphaIsTransparency = value; }

        /// <summary>获取或设置实际 Mipmap 开关。</summary>
        public bool Mipmaps { get => mipmaps; set => mipmaps = value; }

        /// <summary>获取或设置实际运行时读写开关。</summary>
        public bool ReadWriteEnabled { get => readWriteEnabled; set => readWriteEnabled = value; }
    }

    /// <summary>
    /// 表示一个可独立合并、禁止覆盖的正式资源登记事实。
    /// </summary>
    [Serializable]
    public sealed class ResourceRegistrationRecord
    {
        [SerializeField] private string schemaVersion = "1.0";
        [SerializeField] private string recordId;
        [SerializeField] private string taskId;
        [SerializeField] private string resourceId;
        [SerializeField] private string module;
        [SerializeField] private string type;
        [SerializeField] private string purpose;
        [SerializeField] private string sourceVersion;
        [SerializeField] private string visualVersion;
        [SerializeField] private string sourcePath;
        [SerializeField] private string sourceSha256;
        [SerializeField] private string assetPath;
        [SerializeField] private string address;
        [SerializeField] private string assetGuid;
        [SerializeField] private ImageImporterSummary importer;
        [SerializeField] private List<ApprovalDto> approvals = new List<ApprovalDto>();
        [SerializeField] private List<string> approvalEvidencePaths = new List<string>();
        [SerializeField] private string importReportPath;
        [SerializeField] private string status = "VALIDATED";
        [SerializeField] private string licenseStatus = "PENDING";
        [SerializeField] private string unityValidation = "PASS";
        [SerializeField] private string generatedAtUtc;

        /// <summary>获取或设置登记记录 Schema 版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置确定性记录 ID。</summary>
        public string RecordId { get => recordId; set => recordId = value; }

        /// <summary>获取或设置来源任务 ID。</summary>
        public string TaskId { get => taskId; set => taskId = value; }

        /// <summary>获取或设置资源唯一 ID。</summary>
        public string ResourceId { get => resourceId; set => resourceId = value; }

        /// <summary>获取或设置资源归属模块。</summary>
        public string Module { get => module; set => module = value; }

        /// <summary>获取或设置可合并到 asset-register 的资源类型。</summary>
        public string Type { get => type; set => type = value; }

        /// <summary>获取或设置可合并到 asset-register 的资源用途。</summary>
        public string Purpose { get => purpose; set => purpose = value; }

        /// <summary>获取或设置源效果图版本。</summary>
        public string SourceVersion { get => sourceVersion; set => sourceVersion = value; }

        /// <summary>获取或设置批准候选视觉版本。</summary>
        public string VisualVersion { get => visualVersion; set => visualVersion = value; }

        /// <summary>获取或设置 processed 源路径。</summary>
        public string SourcePath { get => sourcePath; set => sourcePath = value; }

        /// <summary>获取或设置批准候选 SHA-256。</summary>
        public string SourceSha256 { get => sourceSha256; set => sourceSha256 = value; }

        /// <summary>获取或设置正式 Unity 资产路径。</summary>
        public string AssetPath { get => assetPath; set => assetPath = value; }

        /// <summary>获取或设置运行时寻址建议；首版使用正式资产路径。</summary>
        public string Address { get => address; set => address = value; }

        /// <summary>获取或设置 Unity 资产 GUID。</summary>
        public string AssetGuid { get => assetGuid; set => assetGuid = value; }

        /// <summary>获取或设置 Unity 实际 Importer 摘要。</summary>
        public ImageImporterSummary Importer { get => importer; set => importer = value; }

        /// <summary>获取或设置完整批准记录，供汇总登记时复核主体、版本、权限和证据哈希。</summary>
        public List<ApprovalDto> Approvals
        {
            get => approvals;
            set => approvals = value ?? new List<ApprovalDto>();
        }

        /// <summary>获取或设置批准证据路径列表。</summary>
        public List<string> ApprovalEvidencePaths
        {
            get => approvalEvidencePaths;
            set => approvalEvidencePaths = value ?? new List<string>();
        }

        /// <summary>获取或设置对应导入报告路径。</summary>
        public string ImportReportPath { get => importReportPath; set => importReportPath = value; }

        /// <summary>获取或设置可合并到 asset-register 的资源状态。</summary>
        public string Status { get => status; set => status = value; }

        /// <summary>获取或设置许可证状态；自动导入不会擅自批准许可证。</summary>
        public string LicenseStatus { get => licenseStatus; set => licenseStatus = value; }

        /// <summary>获取或设置 Unity 技术验证状态。</summary>
        public string UnityValidation { get => unityValidation; set => unityValidation = value; }

        /// <summary>获取或设置记录生成 UTC 时间。</summary>
        public string GeneratedAtUtc { get => generatedAtUtc; set => generatedAtUtc = value; }
    }
}
