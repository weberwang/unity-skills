using System;
using System.Collections.Generic;
using UnityEngine;

namespace Project.UnityWorkflow.Core.Models
{
    /// <summary>
    /// 暴露已编译 Job 的完整性字段与只读验证状态。
    /// </summary>
    public interface IWorkflowJobDto
    {
        /// <summary>获取源契约项目相对路径。</summary>
        string SourcePath { get; }

        /// <summary>获取源契约 SHA-256。</summary>
        string SourceSha256 { get; }

        /// <summary>获取规范化 payload SHA-256。</summary>
        string PayloadSha256 { get; }

        /// <summary>获取该实例是否已由 ManifestLoader 完成完整性验证。</summary>
        bool IntegrityVerified { get; }
    }

    /// <summary>
    /// 保存只读完整性状态，并仅允许 Core 程序集在验证后标记。
    /// </summary>
    [Serializable]
    public abstract class WorkflowJobIntegrityState
    {
        [NonSerialized] private bool integrityVerified;

        /// <summary>获取源文件和 payload 是否均已通过完整性验证。</summary>
        public bool IntegrityVerified => integrityVerified;

        /// <summary>由 ManifestLoader 在全部哈希通过后设置可信状态。</summary>
        internal void MarkIntegrityVerified()
        {
            integrityVerified = true;
        }
    }

    /// <summary>
    /// 表示一次由责任人确认并带有证据的工作流批准。
    /// </summary>
    [Serializable]
    public sealed class ApprovalDto
    {
        [SerializeField] private string approvalType;
        [SerializeField] private string authority;
        [SerializeField] private string subjectId;
        [SerializeField] private string subjectVersion;
        [SerializeField] private string approvedBy;
        [SerializeField] private string approvedAtUtc;
        [SerializeField] private string evidencePath;
        [SerializeField] private string evidenceSha256;
        [SerializeField] private string reviewTaskId;
        [SerializeField] private string reviewDiscipline;

        /// <summary>获取或设置批准类型。</summary>
        public string ApprovalType { get => approvalType; set => approvalType = value; }

        /// <summary>获取或设置批准权限来源。</summary>
        public string Authority { get => authority; set => authority = value; }

        /// <summary>获取或设置批准所绑定的主体 ID。</summary>
        public string SubjectId { get => subjectId; set => subjectId = value; }

        /// <summary>获取或设置批准所绑定的主体版本。</summary>
        public string SubjectVersion { get => subjectVersion; set => subjectVersion = value; }

        /// <summary>获取或设置批准人。</summary>
        public string ApprovedBy { get => approvedBy; set => approvedBy = value; }

        /// <summary>获取或设置 UTC 批准时间。</summary>
        public string ApprovedAtUtc { get => approvedAtUtc; set => approvedAtUtc = value; }

        /// <summary>获取或设置项目内批准证据路径。</summary>
        public string EvidencePath { get => evidencePath; set => evidencePath = value; }

        /// <summary>获取或设置批准证据文件 SHA-256。</summary>
        public string EvidenceSha256 { get => evidenceSha256; set => evidenceSha256 = value; }

        /// <summary>获取或设置独立审查任务 ID；用户批准时允许为空。</summary>
        public string ReviewTaskId { get => reviewTaskId; set => reviewTaskId = value; }

        /// <summary>获取或设置独立审查专业；用户批准时允许为空。</summary>
        public string ReviewDiscipline { get => reviewDiscipline; set => reviewDiscipline = value; }
    }

    /// <summary>
    /// 表示带 SHA-256 的工作流证据文件。
    /// </summary>
    [Serializable]
    public sealed class EvidenceDto
    {
        [SerializeField] private string type;
        [SerializeField] private string path;
        [SerializeField] private string sha256;
        [SerializeField] private string subjectId;
        [SerializeField] private string subjectVersion;
        [SerializeField] private string sourceRevision;
        [SerializeField] private string buildVersion;

        /// <summary>获取或设置证据类型。</summary>
        public string Type { get => type; set => type = value; }

        /// <summary>获取或设置项目相对路径。</summary>
        public string Path { get => path; set => path = value; }

        /// <summary>获取或设置文件 SHA-256。</summary>
        public string Sha256 { get => sha256; set => sha256 = value; }

        /// <summary>获取或设置证据绑定的主体 ID。</summary>
        public string SubjectId { get => subjectId; set => subjectId = value; }

        /// <summary>获取或设置证据绑定的主体版本。</summary>
        public string SubjectVersion { get => subjectVersion; set => subjectVersion = value; }

        /// <summary>获取或设置证据绑定的源码修订。</summary>
        public string SourceRevision { get => sourceRevision; set => sourceRevision = value; }

        /// <summary>获取或设置证据绑定的构建版本。</summary>
        public string BuildVersion { get => buildVersion; set => buildVersion = value; }
    }

    /// <summary>
    /// 表示 Python 契约编译器生成的通用 Unity JSON Job。
    /// </summary>
    /// <typeparam name="TPayload">Job 中 payload 的 DTO 类型。</typeparam>
    [Serializable]
    public sealed class WorkflowJobDto<TPayload> : WorkflowJobIntegrityState, IWorkflowJobDto
    {
        [SerializeField] private string schemaVersion;
        [SerializeField] private string kind;
        [SerializeField] private string sourcePath;
        [SerializeField] private string sourceSha256;
        [SerializeField] private string payloadSha256;
        [SerializeField] private string compiledAtUtc;
        [SerializeField] private TPayload payload;

        /// <summary>获取或设置 Job Schema 版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置契约类型。</summary>
        public string Kind { get => kind; set => kind = value; }

        /// <summary>获取或设置源 YAML 路径。</summary>
        public string SourcePath { get => sourcePath; set => sourcePath = value; }

        /// <summary>获取或设置源 YAML SHA-256。</summary>
        public string SourceSha256 { get => sourceSha256; set => sourceSha256 = value; }

        /// <summary>获取或设置规范化 payload SHA-256。</summary>
        public string PayloadSha256 { get => payloadSha256; set => payloadSha256 = value; }

        /// <summary>获取或设置编译时间。</summary>
        public string CompiledAtUtc { get => compiledAtUtc; set => compiledAtUtc = value; }

        /// <summary>获取或设置已校验的契约负载。</summary>
        public TPayload Payload { get => payload; set => payload = value; }

    }

    /// <summary>
    /// 表示 quality-report.schema.json 中的一项质量检查。
    /// </summary>
    [Serializable]
    public sealed class QualityCheckDto
    {
        [SerializeField] private string id;
        [SerializeField] private string category;
        [SerializeField] private string status;
        [SerializeField] private string message;
        [SerializeField] private string command;
        [SerializeField] private string environment;
        [SerializeField] private string startedAtUtc;
        [SerializeField] private string finishedAtUtc;
        [SerializeField] private string failureReason;
        [SerializeField] private List<EvidenceDto> evidence = new List<EvidenceDto>();

        /// <summary>获取或设置检查 ID。</summary>
        public string Id { get => id; set => id = value; }

        /// <summary>获取或设置检查类别。</summary>
        public string Category { get => category; set => category = value; }

        /// <summary>获取或设置 PASS、FAIL、BLOCKED 或 NOT_RUN 状态。</summary>
        public string Status { get => status; set => status = value; }

        /// <summary>获取或设置检查摘要。</summary>
        public string Message { get => message; set => message = value; }

        /// <summary>获取或设置实际执行命令；未执行时允许为空。</summary>
        public string Command { get => command; set => command = value; }

        /// <summary>获取或设置执行环境；不适用时允许为空。</summary>
        public string Environment { get => environment; set => environment = value; }

        /// <summary>获取或设置检查开始 UTC 时间；未执行时允许为空。</summary>
        public string StartedAtUtc { get => startedAtUtc; set => startedAtUtc = value; }

        /// <summary>获取或设置检查结束 UTC 时间；未执行时允许为空。</summary>
        public string FinishedAtUtc { get => finishedAtUtc; set => finishedAtUtc = value; }

        /// <summary>获取或设置失败原因；成功时允许为空。</summary>
        public string FailureReason { get => failureReason; set => failureReason = value; }

        /// <summary>获取或设置该项检查的证据集合。</summary>
        public List<EvidenceDto> Evidence
        {
            get => evidence;
            set => evidence = value ?? new List<EvidenceDto>();
        }
    }

    /// <summary>
    /// 表示与 quality-report.schema.json 对齐的质量报告。
    /// </summary>
    [Serializable]
    public sealed class QualityReportDto
    {
        [SerializeField] private string schemaVersion = "1.0";
        [SerializeField] private string taskId;
        [SerializeField] private string projectId;
        [SerializeField] private string sourceRevision;
        [SerializeField] private string buildVersion;
        [SerializeField] private string generatedAtUtc;
        [SerializeField] private List<QualityCheckDto> checks = new List<QualityCheckDto>();
        [SerializeField] private string status;
        [SerializeField] private List<EvidenceDto> evidence = new List<EvidenceDto>();

        /// <summary>获取或设置 Schema 版本。</summary>
        public string SchemaVersion { get => schemaVersion; set => schemaVersion = value; }

        /// <summary>获取或设置所属任务 ID。</summary>
        public string TaskId { get => taskId; set => taskId = value; }

        /// <summary>获取或设置报告所属项目 ID。</summary>
        public string ProjectId { get => projectId; set => projectId = value; }

        /// <summary>获取或设置报告绑定的源码修订。</summary>
        public string SourceRevision { get => sourceRevision; set => sourceRevision = value; }

        /// <summary>获取或设置报告绑定的构建版本。</summary>
        public string BuildVersion { get => buildVersion; set => buildVersion = value; }

        /// <summary>获取或设置报告生成 UTC 时间。</summary>
        public string GeneratedAtUtc { get => generatedAtUtc; set => generatedAtUtc = value; }

        /// <summary>获取或设置结构化检查集合。</summary>
        public List<QualityCheckDto> Checks
        {
            get => checks;
            set => checks = value ?? new List<QualityCheckDto>();
        }

        /// <summary>获取或设置报告汇总状态。</summary>
        public string Status { get => status; set => status = value; }

        /// <summary>获取或设置报告级证据集合。</summary>
        public List<EvidenceDto> Evidence
        {
            get => evidence;
            set => evidence = value ?? new List<EvidenceDto>();
        }
    }
}
