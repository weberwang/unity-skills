using System;
using System.Collections.Generic;
using System.Linq;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 创建并汇总骨骼资产工程检查报告，不写入任何文件。
    /// </summary>
    internal static class RiggingValidationReportBuilder
    {
        /// <summary>根据请求创建带有输入元数据的报告。</summary>
        /// <param name="request">检查请求；允许为空以便返回结构化失败报告。</param>
        /// <returns>尚未汇总状态的质量报告。</returns>
        public static QualityReportDto Create(RiggingValidationRequest request)
        {
            return new QualityReportDto
            {
                SchemaVersion = "1.0",
                TaskId = request == null ? string.Empty : request.TaskId,
                ProjectId = request == null ? string.Empty : request.ProjectId,
                SourceRevision = request == null ? string.Empty : request.SourceRevision,
                BuildVersion = PlayerSettings.bundleVersion,
                GeneratedAtUtc = DateTime.UtcNow.ToString("O"),
                Checks = new List<QualityCheckDto>(),
                Status = "NOT_RUN"
            };
        }

        /// <summary>向报告追加一项骨骼资产检查结果。</summary>
        /// <param name="report">待更新报告。</param>
        /// <param name="id">稳定的检查标识。</param>
        /// <param name="category">检查类别。</param>
        /// <param name="status">PASS、FAIL 或 BLOCKED。</param>
        /// <param name="message">检查证据或失败原因。</param>
        public static void AddCheck(QualityReportDto report, string id, string category, string status, string message)
        {
            if (report == null)
            {
                return;
            }

            string uniqueId = CreateUniqueCheckId(report, id);
            string timestamp = DateTime.UtcNow.ToString("O");
            report.Checks.Add(new QualityCheckDto
            {
                Id = uniqueId,
                Category = category,
                Status = status,
                Message = message,
                Environment = GetEnvironmentDescription(),
                StartedAtUtc = timestamp,
                FinishedAtUtc = timestamp,
                FailureReason = status == "PASS" ? string.Empty : message
            });
        }

        /// <summary>为重复检查标识追加确定性序号，保持报告中的所有检查 ID 唯一。</summary>
        /// <param name="report">已追加前序检查的报告。</param>
        /// <param name="id">本次检查原始标识。</param>
        /// <returns>未占用的检查标识；无冲突时保留原始标识。</returns>
        private static string CreateUniqueCheckId(QualityReportDto report, string id)
        {
            string originalId = id ?? string.Empty;
            if (!report.Checks.Any(check => check != null &&
                                           string.Equals(check.Id, originalId, StringComparison.Ordinal)))
            {
                return originalId;
            }

            // 相同输入会产生重复诊断，按报告追加顺序编号，不修改请求实体或首个检查 ID。
            int duplicateIndex = 2;
            string candidate;
            do
            {
                candidate = originalId + "-duplicate-" + duplicateIndex.ToString("D2");
                duplicateIndex++;
            }
            while (report.Checks.Any(check => check != null &&
                                               string.Equals(check.Id, candidate, StringComparison.Ordinal)));

            return candidate;
        }

        /// <summary>仅当每项检查都通过时将报告标记为 PASS。</summary>
        /// <param name="report">所有检查均已完成的质量报告。</param>
        public static void Complete(QualityReportDto report)
        {
            if (report == null)
            {
                return;
            }

            List<QualityCheckDto> checks = report.Checks ?? new List<QualityCheckDto>();
            if (checks.Count == 0 || checks.Any(check => check == null || check.Status == "FAIL"))
            {
                report.Status = "FAIL";
                return;
            }

            report.Status = checks.Any(check => check.Status == "BLOCKED") ? "BLOCKED" : "PASS";
        }

        /// <summary>在每项检查的环境字段中记录实际 Editor 与已解析 Animation 包版本。</summary>
        /// <returns>当前 Unity Editor 版本和 2D Animation 包版本。</returns>
        private static string GetEnvironmentDescription()
        {
            string animationVersion = "未知";
            try
            {
                UnityEditor.PackageManager.PackageInfo package =
                    UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(SpriteSkin).Assembly);
                if (package != null && !string.IsNullOrWhiteSpace(package.version))
                {
                    animationVersion = package.version;
                }
            }
            catch (Exception)
            {
                // 报告保留“未知”而不暴露底层环境或绝对路径信息。
            }

            return $"Unity Editor {Application.unityVersion}; com.unity.2d.animation {animationVersion}";
        }
    }
}
