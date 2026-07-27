using System;
using System.IO;
using UnityEngine;

namespace Project.UnityWorkflow.Core
{
    /// <summary>
    /// 提供受项目根目录约束的路径解析，防止工作流任务访问项目外文件。
    /// </summary>
    public static class WorkflowPaths
    {
        /// <summary>
        /// 获取当前 Unity 项目的规范化根目录。
        /// </summary>
        public static string ProjectRoot
        {
            get
            {
                var projectDirectory = Directory.GetParent(Application.dataPath);
                if (projectDirectory == null)
                {
                    throw new InvalidOperationException("无法从 Application.dataPath 解析 Unity 项目根目录。");
                }

                return TrimEndingSeparators(Path.GetFullPath(projectDirectory.FullName));
            }
        }

        /// <summary>
        /// 把使用正斜杠的项目相对路径解析为绝对路径，并拒绝绝对路径与父目录跳转。
        /// </summary>
        /// <param name="projectRelativePath">相对于 Unity 项目根目录的路径。</param>
        /// <returns>位于项目根目录内的规范化绝对路径。</returns>
        public static string ResolveProjectRelative(string projectRelativePath)
        {
            if (string.IsNullOrWhiteSpace(projectRelativePath))
            {
                throw new ArgumentException("项目相对路径不能为空。", nameof(projectRelativePath));
            }

            if (Path.IsPathRooted(projectRelativePath) || projectRelativePath.IndexOf(':') >= 0)
            {
                throw new ArgumentException("不允许使用绝对路径或驱动器路径。", nameof(projectRelativePath));
            }

            var normalized = projectRelativePath.Replace('\\', '/');
            var segments = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var segment in segments)
            {
                if (segment == "..")
                {
                    throw new ArgumentException("项目相对路径不得包含父目录跳转。", nameof(projectRelativePath));
                }
            }

            var root = ProjectRoot;
            var candidate = Path.GetFullPath(Path.Combine(root, normalized.Replace('/', Path.DirectorySeparatorChar)));
            if (!IsWithinRoot(root, candidate))
            {
                throw new ArgumentException("解析后的路径超出 Unity 项目根目录。", nameof(projectRelativePath));
            }

            EnsureNoReparsePoint(root, candidate);

            return candidate;
        }

        /// <summary>
        /// 将项目内绝对路径转换为使用正斜杠的项目相对路径。
        /// </summary>
        /// <param name="absolutePath">待转换的绝对路径。</param>
        /// <returns>项目相对路径。</returns>
        public static string ToProjectRelative(string absolutePath)
        {
            if (string.IsNullOrWhiteSpace(absolutePath) || !Path.IsPathRooted(absolutePath))
            {
                throw new ArgumentException("必须提供绝对路径。", nameof(absolutePath));
            }

            var root = ProjectRoot;
            var candidate = Path.GetFullPath(absolutePath);
            if (!IsWithinRoot(root, candidate))
            {
                throw new ArgumentException("绝对路径不位于 Unity 项目根目录内。", nameof(absolutePath));
            }

            EnsureNoReparsePoint(root, candidate);

            if (string.Equals(root, candidate, PathComparison))
            {
                return ".";
            }

            return candidate.Substring(root.Length + 1).Replace('\\', '/');
        }

        private static StringComparison PathComparison
        {
            get
            {
                return Application.platform == RuntimePlatform.WindowsEditor
                    ? StringComparison.OrdinalIgnoreCase
                    : StringComparison.Ordinal;
            }
        }

        /// <summary>检查候选路径是否等于或位于指定项目根目录内。</summary>
        private static bool IsWithinRoot(string root, string candidate)
        {
            if (string.Equals(root, candidate, PathComparison))
            {
                return true;
            }

            var prefix = root + Path.DirectorySeparatorChar;
            return candidate.StartsWith(prefix, PathComparison);
        }

        /// <summary>
        /// 拒绝项目路径上的符号链接或目录联接，防止合法前缀经重解析点逃逸。
        /// </summary>
        private static void EnsureNoReparsePoint(string root, string candidate)
        {
            if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0)
            {
                throw new ArgumentException("Unity 项目根目录不得是符号链接或目录联接。", nameof(candidate));
            }

            string relative = candidate.Length == root.Length
                ? string.Empty
                : candidate.Substring(root.Length + 1);
            string current = root;
            foreach (string segment in relative.Split(new[] { Path.DirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries))
            {
                current = Path.Combine(current, segment);
                if (!File.Exists(current) && !Directory.Exists(current))
                {
                    // 首个不存在的祖先之后不可能已有更深路径，无需继续访问文件系统。
                    break;
                }

                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                {
                    throw new ArgumentException("项目路径不得经过符号链接或目录联接。", nameof(candidate));
                }
            }
        }

        /// <summary>移除根目录末尾分隔符，保证后续前缀比较稳定。</summary>
        private static string TrimEndingSeparators(string value)
        {
            return value.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }
    }
}
