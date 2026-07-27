using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace Project.UnityWorkflow.Core
{
    /// <summary>
    /// 将结构化报告以无 BOM UTF-8 原子写入项目目录。
    /// </summary>
    public static class ReportWriter
    {
        /// <summary>
        /// 序列化报告并在同一目录内完成原子替换。
        /// </summary>
        /// <typeparam name="T">可被 JsonUtility 序列化的报告类型。</typeparam>
        /// <param name="projectRelativePath">报告的项目相对路径。</param>
        /// <param name="report">待写入的报告实例。</param>
        /// <returns>报告的规范化绝对路径。</returns>
        public static string Write<T>(string projectRelativePath, T report)
        {
            if (ReferenceEquals(report, null))
            {
                throw new ArgumentNullException(nameof(report));
            }

            var targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            var targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("报告目标缺少父目录。");
            }

            Directory.CreateDirectory(targetDirectory);
            // 目录创建后重新执行路径边界与重解析点校验，缩小检查与写入之间的链接替换窗口。
            targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("报告目标缺少父目录。");
            }

            var json = JsonUtility.ToJson(report, true) + "\n";
            var temporaryPath = Path.Combine(targetDirectory, $".{Path.GetFileName(targetPath)}.{Guid.NewGuid():N}.tmp");

            try
            {
                File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));
                if (File.Exists(targetPath))
                {
                    // 临时文件与目标同目录，File.Replace 不会暴露半写入报告。
                    File.Replace(temporaryPath, targetPath, null);
                }
                else
                {
                    File.Move(temporaryPath, targetPath);
                }
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }

            return targetPath;
        }

        /// <summary>
        /// 序列化不可变报告并以原子移动写入，目标已存在时拒绝覆盖。
        /// </summary>
        /// <typeparam name="T">可被 JsonUtility 序列化的报告类型。</typeparam>
        /// <param name="projectRelativePath">报告的项目相对路径。</param>
        /// <param name="report">待写入的报告实例。</param>
        /// <returns>报告的规范化绝对路径。</returns>
        public static string WriteNew<T>(string projectRelativePath, T report)
        {
            if (ReferenceEquals(report, null))
            {
                throw new ArgumentNullException(nameof(report));
            }

            string targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            string targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("报告目标缺少父目录。");
            }

            Directory.CreateDirectory(targetDirectory);
            targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("报告目标缺少父目录。");
            }

            string json = JsonUtility.ToJson(report, true) + "\n";
            string temporaryPath = Path.Combine(
                targetDirectory,
                $".{Path.GetFileName(targetPath)}.{Guid.NewGuid():N}.tmp");
            try
            {
                File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));
                // File.Move 拒绝覆盖，使并发任务无法替换已形成的审计事实。
                File.Move(temporaryPath, targetPath);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }

            return targetPath;
        }
    }
}
