using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Project.UnityWorkflow.Core;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>以保留真实 null 的方式原子写入新资源交接报告。</summary>
    internal static class ResourceHandoffReportWriter
    {
        /// <summary>将交接报告写入一个不存在的项目内 JSON 文件。</summary>
        /// <param name="projectRelativePath">项目相对报告路径。</param>
        /// <param name="report">实测报告对象。</param>
        /// <returns>报告规范化后的项目绝对路径。</returns>
        public static string WriteNew(string projectRelativePath, ResourceHandoffInspectionReport report)
        {
            if (report == null)
            {
                throw new ArgumentNullException(nameof(report));
            }

            string targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            string targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("交接报告目标缺少父目录。");
            }

            Directory.CreateDirectory(targetDirectory);
            // 创建目录后重做路径检查，避免目录联接绕过项目边界与重解析点保护。
            targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            targetDirectory = Path.GetDirectoryName(targetPath);
            var settings = new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Include,
                DefaultValueHandling = DefaultValueHandling.Include
            };
            string json = JsonConvert.SerializeObject(report, Formatting.Indented, settings) + "\n";
            string temporaryPath = Path.Combine(
                targetDirectory,
                $".{Path.GetFileName(targetPath)}.{Guid.NewGuid():N}.tmp");
            try
            {
                File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));
                // 原子移动会拒绝覆盖，避免并发任务替换已形成的审计事实。
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
