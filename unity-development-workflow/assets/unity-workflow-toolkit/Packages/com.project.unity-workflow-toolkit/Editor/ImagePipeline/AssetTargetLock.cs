using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Project.UnityWorkflow.Core;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 表示同一正式资源目标已被另一个进程持有。
    /// </summary>
    public sealed class AssetTargetLockUnavailableException : IOException
    {
        /// <summary>使用稳定且不包含本机路径的消息创建锁冲突异常。</summary>
        public AssetTargetLockUnavailableException()
            : base("正式资源目标当前由另一个导入任务持有。")
        {
        }
    }

    /// <summary>
    /// 使用项目 Library 内确定性文件锁保护单个正式资源目标，支持跨 Unity 进程互斥。
    /// </summary>
    public sealed class AssetTargetLock : IDisposable
    {
        private const string LockRoot = "Library/UnityWorkflow/Locks/AssetTargets";
        private readonly FileStream stream;
        private bool disposed;

        /// <summary>保存已打开的独占锁句柄。</summary>
        private AssetTargetLock(FileStream stream)
        {
            this.stream = stream;
        }

        /// <summary>
        /// 为项目内正式资源路径获取跨进程独占锁。
        /// </summary>
        /// <param name="assetPath">以 Assets/ 开头的项目相对路径。</param>
        /// <returns>必须在导入事务结束时释放的锁句柄。</returns>
        public static AssetTargetLock Acquire(string assetPath)
        {
            if (string.IsNullOrWhiteSpace(assetPath) ||
                !assetPath.Replace('\\', '/').StartsWith("Assets/", StringComparison.Ordinal))
            {
                throw new ArgumentException("资源锁只接受 Assets/ 下的目标路径。", nameof(assetPath));
            }

            // 先走公共路径边界，再以大小写归一化路径生成确定键，避免 Windows 路径别名绕过互斥。
            WorkflowPaths.ResolveProjectRelative(assetPath);
            var normalizedTarget = assetPath.Replace('\\', '/').ToLowerInvariant();
            var lockRelativePath = LockRoot + "/" + ComputeSha256(normalizedTarget) + ".lock";
            var lockAbsolutePath = WorkflowPaths.ResolveProjectRelative(lockRelativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(lockAbsolutePath));

            FileStream stream = null;
            try
            {
                stream = new FileStream(
                    lockAbsolutePath,
                    FileMode.OpenOrCreate,
                    FileAccess.ReadWrite,
                    FileShare.None,
                    4096,
                    FileOptions.WriteThrough);
                stream.SetLength(0);
                var metadata = Encoding.UTF8.GetBytes(normalizedTarget + "\n");
                stream.Write(metadata, 0, metadata.Length);
                stream.Flush(true);
                return new AssetTargetLock(stream);
            }
            catch (IOException)
            {
                stream?.Dispose();
                throw new AssetTargetLockUnavailableException();
            }
        }

        /// <summary>释放独占句柄；确定性锁文件保留在 Library 中供后续事务复用。</summary>
        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            stream.Dispose();
        }

        /// <summary>计算目标锁文件名使用的小写 SHA-256。</summary>
        private static string ComputeSha256(string value)
        {
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(Encoding.UTF8.GetBytes(value)))
                    .Replace("-", string.Empty)
                    .ToLowerInvariant();
            }
        }
    }
}
