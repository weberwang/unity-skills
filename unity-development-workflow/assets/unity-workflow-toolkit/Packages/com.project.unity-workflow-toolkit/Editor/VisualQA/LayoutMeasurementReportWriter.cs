using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Project.UnityWorkflow.Core;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>用保留 null 的 JSON 序列化器写入布局测量报告。</summary>
    internal static class LayoutMeasurementReportWriter
    {
        /// <summary>将布局报告原子写入新文件，并保留未采集几何的真实 null。</summary>
        /// <param name="projectRelativePath">项目相对的报告路径。</param>
        /// <param name="report">已从真实场景采集的报告。</param>
        /// <returns>规范化后的完整报告路径。</returns>
        public static string WriteNew(string projectRelativePath, LayoutMeasurementReport report)
        {
            if (report == null)
            {
                throw new ArgumentNullException(nameof(report));
            }

            string targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            string targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("布局报告目标缺少父目录。");
            }

            Directory.CreateDirectory(targetDirectory);
            // 创建目录后再次解析路径，以保留通用报告写入器的项目边界与重解析点检查。
            targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrEmpty(targetDirectory))
            {
                throw new InvalidOperationException("布局报告目标缺少父目录。");
            }

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
                // 新报告只允许原子移动到空路径，禁止覆盖已有审计证据。
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
