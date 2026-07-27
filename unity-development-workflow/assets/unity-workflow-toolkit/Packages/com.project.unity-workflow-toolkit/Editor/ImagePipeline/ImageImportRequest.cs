using System;
using System.Collections.Generic;
using Project.UnityWorkflow.Core.Models;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 描述一张已批准候选图从 processed 区导入正式 Unity 资产区所需的全部约束。
    /// </summary>
    [Serializable]
    public sealed class ImageImportRequest
    {
        [SerializeField] private string taskId;
        [SerializeField] private string resourceId;
        [SerializeField] private string module;
        [SerializeField] private string assetType;
        [SerializeField] private string useCase;
        [SerializeField] private string sourceVersion;
        [SerializeField] private string sourcePath;
        [SerializeField] private string sourceSha256;
        [SerializeField] private string visualVersion;
        [SerializeField] private string status;
        [SerializeField] private EvidenceDto finalVisualReview;
        [SerializeField] private List<ApprovalDto> approvals = new List<ApprovalDto>();
        [SerializeField] private string targetDirectory;
        [SerializeField] private string fileName;
        [SerializeField] private string expectedAspectRatio;
        [SerializeField] private bool alphaRequired;
        [SerializeField] private int minimumWidth = 1;
        [SerializeField] private int minimumHeight = 1;
        [SerializeField] private int maximumWidth = 16384;
        [SerializeField] private int maximumHeight = 16384;
        [SerializeField] private string textureType;
        [SerializeField] private string spriteMode;
        [SerializeField] private float pixelsPerUnit = 100f;
        [SerializeField] private string filterMode;
        [SerializeField] private string wrapMode;
        [SerializeField] private int maxSize = 2048;
        [SerializeField] private string compression;
        [SerializeField] private bool sRgb = true;
        [SerializeField] private bool alphaIsTransparency;
        [SerializeField] private bool mipmaps;
        [SerializeField] private bool readWriteEnabled;
        [SerializeField] private string reportPath;

        /// <summary>获取或设置图片任务 ID。</summary>
        public string TaskId { get => taskId; set => taskId = value; }

        /// <summary>获取或设置资源唯一 ID。</summary>
        public string ResourceId { get => resourceId; set => resourceId = value; }

        /// <summary>获取或设置资源归属模块。</summary>
        public string Module { get => module; set => module = value; }

        /// <summary>获取或设置图片任务声明的资源类型。</summary>
        public string AssetType { get => assetType; set => assetType = value; }

        /// <summary>获取或设置资源业务用途。</summary>
        public string UseCase { get => useCase; set => useCase = value; }

        /// <summary>获取或设置源效果图版本。</summary>
        public string SourceVersion { get => sourceVersion; set => sourceVersion = value; }

        /// <summary>获取或设置 selectedCandidate.path 对应的 processed 区路径。</summary>
        public string SourcePath { get => sourcePath; set => sourcePath = value; }

        /// <summary>获取或设置 selectedCandidate.sha256。</summary>
        public string SourceSha256 { get => sourceSha256; set => sourceSha256 = value; }

        /// <summary>获取或设置 selectedCandidate.visualVersion。</summary>
        public string VisualVersion { get => visualVersion; set => visualVersion = value; }

        /// <summary>获取或设置任务状态；导入只接受 APPROVED。</summary>
        public string Status { get => status; set => status = value; }

        /// <summary>获取或设置绑定选中候选的最终视觉审查证据。</summary>
        public EvidenceDto FinalVisualReview { get => finalVisualReview; set => finalVisualReview = value; }

        /// <summary>获取或设置用户批准记录。</summary>
        public List<ApprovalDto> Approvals
        {
            get => approvals;
            set => approvals = value ?? new List<ApprovalDto>();
        }

        /// <summary>获取或设置正式资产目标目录。</summary>
        public string TargetDirectory { get => targetDirectory; set => targetDirectory = value; }

        /// <summary>获取或设置正式资产文件名。</summary>
        public string FileName { get => fileName; set => fileName = value; }

        /// <summary>获取或设置 W:H 形式的预期宽高比。</summary>
        public string ExpectedAspectRatio { get => expectedAspectRatio; set => expectedAspectRatio = value; }

        /// <summary>获取或设置源图片是否必须包含 Alpha 通道。</summary>
        public bool AlphaRequired { get => alphaRequired; set => alphaRequired = value; }

        /// <summary>获取或设置最小宽度。</summary>
        public int MinimumWidth { get => minimumWidth; set => minimumWidth = value; }

        /// <summary>获取或设置最小高度。</summary>
        public int MinimumHeight { get => minimumHeight; set => minimumHeight = value; }

        /// <summary>获取或设置最大宽度；小于等于零表示不额外限制。</summary>
        public int MaximumWidth { get => maximumWidth; set => maximumWidth = value; }

        /// <summary>获取或设置最大高度；小于等于零表示不额外限制。</summary>
        public int MaximumHeight { get => maximumHeight; set => maximumHeight = value; }

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

        /// <summary>获取或设置 TextureImporter 最大尺寸。</summary>
        public int MaxSize { get => maxSize; set => maxSize = value; }

        /// <summary>获取或设置压缩质量。</summary>
        public string Compression { get => compression; set => compression = value; }

        /// <summary>获取或设置是否使用 sRGB 采样。</summary>
        public bool SRgb { get => sRgb; set => sRgb = value; }

        /// <summary>获取或设置是否将 Alpha 解释为透明度。</summary>
        public bool AlphaIsTransparency { get => alphaIsTransparency; set => alphaIsTransparency = value; }

        /// <summary>获取或设置是否生成 Mipmap。</summary>
        public bool Mipmaps { get => mipmaps; set => mipmaps = value; }

        /// <summary>获取或设置运行时读写开关。</summary>
        public bool ReadWriteEnabled { get => readWriteEnabled; set => readWriteEnabled = value; }

        /// <summary>获取或设置导入报告路径；为空时使用任务级默认路径。</summary>
        public string ReportPath { get => reportPath; set => reportPath = value; }

        /// <summary>
        /// 从已批准图片任务创建导入请求，源路径和哈希严格取自 selectedCandidate。
        /// </summary>
        /// <param name="task">已由 Schema 校验的图片任务。</param>
        /// <returns>尚可补充尺寸限制和报告路径的导入请求。</returns>
        public static ImageImportRequest FromTask(ImageTaskDto task)
        {
            if (task == null)
            {
                throw new ArgumentNullException(nameof(task));
            }

            var candidate = task.SelectedCandidate;
            var output = task.Output ?? new ImageOutputDto();
            var settings = task.UnityImport ?? new ImageUnityImportDto();
            return new ImageImportRequest
            {
                TaskId = task.Id,
                ResourceId = task.ResourceId,
                Module = task.Module,
                AssetType = task.AssetType,
                UseCase = task.UseCase,
                SourceVersion = task.SourceVersion,
                SourcePath = candidate?.Path,
                SourceSha256 = candidate?.Sha256,
                VisualVersion = candidate?.VisualVersion,
                Status = task.Status,
                FinalVisualReview = task.FinalVisualReview,
                Approvals = task.Approvals,
                TargetDirectory = output.TargetPath,
                FileName = output.Filename,
                ExpectedAspectRatio = output.AspectRatio,
                AlphaRequired = output.AlphaRequired,
                TextureType = settings.TextureType,
                SpriteMode = settings.SpriteMode,
                PixelsPerUnit = settings.PixelsPerUnit,
                FilterMode = settings.FilterMode,
                WrapMode = settings.WrapMode,
                MaxSize = settings.MaxSize,
                Compression = settings.Compression,
                SRgb = settings.SRgb,
                AlphaIsTransparency = settings.AlphaIsTransparency,
                Mipmaps = settings.Mipmaps,
                ReadWriteEnabled = settings.ReadWriteEnabled
            };
        }
    }
}
