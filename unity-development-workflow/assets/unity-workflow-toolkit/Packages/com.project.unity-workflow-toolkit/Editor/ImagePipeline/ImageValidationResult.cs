using System;
using System.Collections.Generic;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 表示一项图片技术校验问题。
    /// </summary>
    [Serializable]
    public sealed class ImageValidationIssue
    {
        [SerializeField] private string code;
        [SerializeField] private string message;

        /// <summary>获取或设置稳定的问题代码。</summary>
        public string Code { get => code; set => code = value; }

        /// <summary>获取或设置面向操作者的问题说明。</summary>
        public string Message { get => message; set => message = value; }
    }

    /// <summary>
    /// 表示源图片、批准记录与目标路径的结构化校验结果。
    /// </summary>
    [Serializable]
    public sealed class ImageValidationResult
    {
        [SerializeField] private bool isValid;
        [SerializeField] private int width;
        [SerializeField] private int height;
        [SerializeField] private string format;
        [SerializeField] private bool hasAlpha;
        [SerializeField] private List<ImageValidationIssue> issues = new List<ImageValidationIssue>();

        /// <summary>获取或设置是否通过全部技术门禁。</summary>
        public bool IsValid { get => isValid; set => isValid = value; }

        /// <summary>获取或设置解码后的宽度。</summary>
        public int Width { get => width; set => width = value; }

        /// <summary>获取或设置解码后的高度。</summary>
        public int Height { get => height; set => height = value; }

        /// <summary>获取或设置实际识别出的 PNG 或 JPEG 格式。</summary>
        public string Format { get => format; set => format = value; }

        /// <summary>获取或设置源图片是否声明 Alpha 通道。</summary>
        public bool HasAlpha { get => hasAlpha; set => hasAlpha = value; }

        /// <summary>获取或设置校验问题列表。</summary>
        public List<ImageValidationIssue> Issues
        {
            get => issues;
            set => issues = value ?? new List<ImageValidationIssue>();
        }

        /// <summary>
        /// 添加一项失败问题并把汇总状态更新为失败。
        /// </summary>
        /// <param name="code">稳定问题代码。</param>
        /// <param name="message">问题说明。</param>
        public void AddIssue(string code, string message)
        {
            Issues.Add(new ImageValidationIssue { Code = code, Message = message });
            IsValid = false;
        }
    }

    /// <summary>
    /// 表示图片导入阶段的一项结构化错误。
    /// </summary>
    [Serializable]
    public sealed class ImageImportError
    {
        [SerializeField] private string code;
        [SerializeField] private string message;

        /// <summary>获取或设置稳定错误代码。</summary>
        public string Code { get => code; set => code = value; }

        /// <summary>获取或设置错误说明。</summary>
        public string Message { get => message; set => message = value; }
    }

    /// <summary>
    /// 表示图片导入、Importer 复核与报告落盘的最终结果。
    /// </summary>
    [Serializable]
    public sealed class ImageImportResult
    {
        [SerializeField] private bool success;
        [SerializeField] private string operationId;
        [SerializeField] private string taskId;
        [SerializeField] private string resourceId;
        [SerializeField] private string sourceVersion;
        [SerializeField] private string visualVersion;
        [SerializeField] private string sourceSha256;
        [SerializeField] private string assetPath;
        [SerializeField] private string assetGuid;
        [SerializeField] private ImageImporterSummary importerSummary;
        [SerializeField] private string registrationRecordPath;
        [SerializeField] private string reportPath;
        [SerializeField] private ImageValidationResult validation;
        [SerializeField] private List<ImageImportError> errors = new List<ImageImportError>();

        /// <summary>获取或设置导入是否完整成功。</summary>
        public bool Success { get => success; set => success = value; }

        /// <summary>获取或设置本次导入事务的唯一 ID。</summary>
        public string OperationId { get => operationId; set => operationId = value; }

        /// <summary>获取或设置图片任务 ID。</summary>
        public string TaskId { get => taskId; set => taskId = value; }

        /// <summary>获取或设置资源唯一 ID。</summary>
        public string ResourceId { get => resourceId; set => resourceId = value; }

        /// <summary>获取或设置源效果图版本。</summary>
        public string SourceVersion { get => sourceVersion; set => sourceVersion = value; }

        /// <summary>获取或设置批准候选视觉版本。</summary>
        public string VisualVersion { get => visualVersion; set => visualVersion = value; }

        /// <summary>获取或设置批准候选 SHA-256。</summary>
        public string SourceSha256 { get => sourceSha256; set => sourceSha256 = value; }

        /// <summary>获取或设置 Unity 资产相对路径。</summary>
        public string AssetPath { get => assetPath; set => assetPath = value; }

        /// <summary>获取或设置 Unity 资产 GUID。</summary>
        public string AssetGuid { get => assetGuid; set => assetGuid = value; }

        /// <summary>获取或设置从 Unity 重新读取的实际 Importer 摘要。</summary>
        public ImageImporterSummary ImporterSummary { get => importerSummary; set => importerSummary = value; }

        /// <summary>获取或设置不可变资源登记记录路径。</summary>
        public string RegistrationRecordPath { get => registrationRecordPath; set => registrationRecordPath = value; }

        /// <summary>获取或设置结构化报告相对路径。</summary>
        public string ReportPath { get => reportPath; set => reportPath = value; }

        /// <summary>获取或设置导入前技术校验结果。</summary>
        public ImageValidationResult Validation { get => validation; set => validation = value; }

        /// <summary>获取或设置导入阶段错误。</summary>
        public List<ImageImportError> Errors
        {
            get => errors;
            set => errors = value ?? new List<ImageImportError>();
        }

        /// <summary>
        /// 添加一项导入错误并把成功状态更新为失败。
        /// </summary>
        /// <param name="code">稳定错误代码。</param>
        /// <param name="message">错误说明。</param>
        public void AddError(string code, string message)
        {
            Errors.Add(new ImageImportError { Code = code, Message = message });
            Success = false;
        }
    }
}
