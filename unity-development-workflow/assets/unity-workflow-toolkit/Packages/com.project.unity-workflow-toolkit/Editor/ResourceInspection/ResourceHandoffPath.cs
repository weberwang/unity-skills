using System;
using System.IO;
using Project.UnityWorkflow.Core;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>约束交接请求中的项目路径并拒绝重解析点路径。</summary>
    internal static class ResourceHandoffPath
    {
        /// <summary>验证并规范化必须位于 Assets 下的资产路径。</summary>
        /// <param name="path">请求提供的 Assets 路径。</param>
        /// <returns>使用正斜杠的规范路径。</returns>
        public static string RequireAssetPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("Assets/", StringComparison.Ordinal))
            {
                throw new ArgumentException("资产路径必须位于 Assets/ 下。", nameof(path));
            }

            ValidateSegments(path);
            WorkflowPaths.ResolveProjectRelative(path);
            return path;
        }

        /// <summary>验证项目内新 JSON 报告路径，并执行符号链接检查。</summary>
        /// <param name="path">请求提供的项目相对报告路径。</param>
        /// <returns>经过验证并保留 POSIX 分隔符的路径。</returns>
        public static string RequireOutputPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) ||
                !string.Equals(Path.GetExtension(path), ".json", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("报告路径必须是项目内 JSON 文件。", nameof(path));
            }

            ValidateSegments(path);
            WorkflowPaths.ResolveProjectRelative(path);
            return path;
        }

        /// <summary>拒绝绝对路径、空路径段、点路径段和父目录回跳。</summary>
        /// <param name="path">待验证的正斜杠相对路径。</param>
        private static void ValidateSegments(string path)
        {
            if (Path.IsPathRooted(path) || path.IndexOf(':') >= 0 || path.IndexOf('\\') >= 0)
            {
                throw new ArgumentException("路径必须使用项目内正斜杠相对形式。", nameof(path));
            }

            string[] segments = path.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..")
                {
                    throw new ArgumentException("路径包含空段或点路径段。", nameof(path));
                }
            }
        }
    }
}
