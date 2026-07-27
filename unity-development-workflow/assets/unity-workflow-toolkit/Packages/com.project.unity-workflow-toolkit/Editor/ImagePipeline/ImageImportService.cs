using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline
{
    /// <summary>
    /// 表示带稳定代码且无需向调用方泄露本机异常信息的导入事务失败。
    /// </summary>
    internal sealed class ImageImportOperationException : Exception
    {
        /// <summary>使用稳定错误代码和安全消息创建事务异常。</summary>
        public ImageImportOperationException(string code, string safeMessage)
            : base(safeMessage)
        {
            Code = code;
        }

        /// <summary>获取稳定错误代码。</summary>
        public string Code { get; }
    }

    /// <summary>
    /// 通过 Library 暂存、跨进程目标锁和原子落位导入图片，并输出不可变资源登记事实。
    /// </summary>
    public sealed class ImageImportService
    {
        private const string StagingRoot = "Library/UnityWorkflow/Staging/Images";
        private const string RegistrationRoot = "Artifacts/AssetRegistry/records";

        /// <summary>
        /// 执行稳定状态检查、技术校验、暂存、互斥落位、Importer 复核、登记和报告写入。
        /// </summary>
        /// <param name="request">完整图片导入请求。</param>
        /// <returns>不会抛出业务失败的结构化导入结果。</returns>
        public ImageImportResult Import(ImageImportRequest request)
        {
            var result = CreateResult(request);
            var createdAssetPath = string.Empty;
            var createdRecordPath = string.Empty;
            var stagingDirectory = string.Empty;
            AssetTargetLock targetLock = null;

            EditorStabilityResult stability = EditorStabilityGuard.Check(false);
            if (!stability.IsStable)
            {
                result.AddError(stability.ErrorCode, stability.Message);
                // Editor 不稳定时禁止任何项目写入，阻断结果仅通过调用响应返回。
                return result;
            }

            result.Validation = ImageValidationService.Validate(request);
            if (!result.Validation.IsValid)
            {
                result.AddError("validation.failed", "图片未通过导入前技术校验。");
                TryWriteFailureReport(request, result);
                return result;
            }

            try
            {
                var sourcePath = WorkflowPaths.ResolveProjectRelative(request.SourcePath);
                var assetPath = (request.TargetDirectory.TrimEnd('/', '\\') + "/" + request.FileName).Replace('\\', '/');
                var targetPath = WorkflowPaths.ResolveProjectRelative(assetPath);
                var stagedPath = StageSource(sourcePath, request.SourceSha256, request.FileName, out stagingDirectory);

                targetLock = AssetTargetLock.Acquire(assetPath);
                EnsureTargetStillAvailable(targetPath);
                AtomicPlace(stagedPath, targetPath);
                createdAssetPath = assetPath;

                AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                var importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
                if (importer == null)
                {
                    throw new ImageImportOperationException("importer.missing", "Unity 未为目标资源创建 TextureImporter。");
                }

                ApplySettings(importer, request);
                importer.SaveAndReimport();

                var reloadedImporter = AssetImporter.GetAtPath(assetPath) as TextureImporter;
                if (reloadedImporter == null || !SettingsMatch(reloadedImporter, request))
                {
                    throw new ImageImportOperationException(
                        "importer.verification-failed",
                        "TextureImporter 实际设置与请求不一致。");
                }

                var assetGuid = AssetDatabase.AssetPathToGUID(assetPath);
                if (string.IsNullOrWhiteSpace(assetGuid))
                {
                    throw new ImageImportOperationException("asset.guid-missing", "Unity 未生成可登记的资产 GUID。");
                }

                result.AssetPath = assetPath;
                result.AssetGuid = assetGuid;
                result.ImporterSummary = CreateImporterSummary(reloadedImporter);
                result.ReportPath = ResolveReportPath(request, result);

                var record = CreateRegistrationRecord(request, result);
                result.RegistrationRecordPath = RegistrationRoot + "/" + record.RecordId + ".json";
                WriteImmutableRecord(result.RegistrationRecordPath, record);
                createdRecordPath = result.RegistrationRecordPath;

                result.Success = true;
                ReportWriter.WriteNew(result.ReportPath, result);
                return result;
            }
            catch (AssetTargetLockUnavailableException)
            {
                result.AddError("target.lock-busy", "正式资源目标当前由另一个导入任务持有。");
                RollbackCreatedRecord(createdRecordPath, result);
                RollbackCreatedAsset(createdAssetPath, result);
                ResetRolledBackOutputs(result);
                TryWriteFailureReport(request, result);
                return result;
            }
            catch (ImageImportOperationException exception)
            {
                result.AddError(exception.Code, exception.Message);
                RollbackCreatedRecord(createdRecordPath, result);
                RollbackCreatedAsset(createdAssetPath, result);
                ResetRolledBackOutputs(result);
                TryWriteFailureReport(request, result);
                return result;
            }
            catch (Exception exception)
            {
                RollbackCreatedRecord(createdRecordPath, result);
                RollbackCreatedAsset(createdAssetPath, result);
                ResetRolledBackOutputs(result);
                result.AddError("import.exception", "图片导入发生异常，已回滚本次创建的目标和登记记录。");
                Debug.LogError($"Unity Workflow Toolkit 图片导入失败（{exception.GetType().Name} / import.exception）。");
                TryWriteFailureReport(request, result);
                return result;
            }
            finally
            {
                targetLock?.Dispose();
                CleanupStaging(stagingDirectory);
            }
        }

        /// <summary>创建携带资源溯源字段的初始失败结果。</summary>
        private static ImageImportResult CreateResult(ImageImportRequest request)
        {
            return new ImageImportResult
            {
                Success = false,
                OperationId = Guid.NewGuid().ToString("N"),
                TaskId = request?.TaskId,
                ResourceId = request?.ResourceId,
                SourceVersion = request?.SourceVersion,
                VisualVersion = request?.VisualVersion,
                SourceSha256 = request?.SourceSha256
            };
        }

        /// <summary>把源文件复制到唯一 Library 目录，并再次验证暂存字节哈希。</summary>
        private static string StageSource(
            string sourcePath,
            string expectedSha256,
            string fileName,
            out string stagingDirectory)
        {
            var stagingRelativeDirectory = StagingRoot + "/" + Guid.NewGuid().ToString("N");
            stagingDirectory = WorkflowPaths.ResolveProjectRelative(stagingRelativeDirectory);
            Directory.CreateDirectory(stagingDirectory);
            // 创建目录后再次校验实际目录链，避免暂存路径在检查后被替换为链接。
            stagingDirectory = WorkflowPaths.ResolveProjectRelative(stagingRelativeDirectory);
            var stagedPath = Path.Combine(stagingDirectory, Path.GetFileName(fileName));
            File.Copy(sourcePath, stagedPath, false);

            if (!string.Equals(ComputeFileSha256(stagedPath), expectedSha256, StringComparison.OrdinalIgnoreCase))
            {
                throw new ImageImportOperationException(
                    "source.changed-during-staging",
                    "源图片在校验与暂存之间发生变化，未写入正式资产区。");
            }

            return stagedPath;
        }

        /// <summary>在持有目标锁后再次检查目标和 .meta，封闭校验到写入之间的竞态。</summary>
        private static void EnsureTargetStillAvailable(string targetPath)
        {
            if (File.Exists(targetPath) || Directory.Exists(targetPath) || File.Exists(targetPath + ".meta"))
            {
                throw new ImageImportOperationException("target.raced", "正式资源目标已被其他任务创建，未执行覆盖。");
            }
        }

        /// <summary>确认暂存与目标位于同一卷后，以无覆盖 File.Move 原子落位。</summary>
        private static void AtomicPlace(string stagedPath, string targetPath)
        {
            var sourceRoot = Path.GetPathRoot(Path.GetFullPath(stagedPath));
            var targetRoot = Path.GetPathRoot(Path.GetFullPath(targetPath));
            if (!string.Equals(sourceRoot, targetRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new ImageImportOperationException("target.cross-volume", "暂存区与正式资产区不在同一卷，无法原子落位。");
            }

            var targetDirectory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrWhiteSpace(targetDirectory))
            {
                throw new ImageImportOperationException("target.directory-invalid", "无法解析目标父目录。");
            }

            Directory.CreateDirectory(targetDirectory);
            // 目录就绪后重新解析目标，确保最终移动仍落在项目内的普通目录。
            var targetRelativePath = WorkflowPaths.ToProjectRelative(targetPath);
            targetPath = WorkflowPaths.ResolveProjectRelative(targetRelativePath);
            File.Move(stagedPath, targetPath);
        }

        /// <summary>把已校验的声明式参数写入 TextureImporter。</summary>
        private static void ApplySettings(TextureImporter importer, ImageImportRequest request)
        {
            importer.textureType = ParseTextureType(request.TextureType);
            importer.spriteImportMode = ParseSpriteMode(request.SpriteMode);
            importer.spritePixelsPerUnit = request.PixelsPerUnit;
            importer.filterMode = ParseFilterMode(request.FilterMode);
            importer.wrapMode = ParseWrapMode(request.WrapMode);
            importer.maxTextureSize = request.MaxSize;
            importer.textureCompression = ParseCompression(request.Compression);
            importer.sRGBTexture = request.SRgb;
            importer.alphaIsTransparency = request.AlphaIsTransparency;
            importer.alphaSource = request.AlphaRequired || request.AlphaIsTransparency
                ? TextureImporterAlphaSource.FromInput
                : TextureImporterAlphaSource.None;
            importer.mipmapEnabled = request.Mipmaps;
            importer.isReadable = request.ReadWriteEnabled;
        }

        /// <summary>重新读取并比较实际 Importer 设置，防止 Unity 静默修正未被发现。</summary>
        private static bool SettingsMatch(TextureImporter importer, ImageImportRequest request)
        {
            if (importer.textureType != ParseTextureType(request.TextureType) ||
                importer.spriteImportMode != ParseSpriteMode(request.SpriteMode) ||
                importer.filterMode != ParseFilterMode(request.FilterMode) ||
                importer.wrapMode != ParseWrapMode(request.WrapMode) ||
                importer.maxTextureSize != request.MaxSize ||
                importer.textureCompression != ParseCompression(request.Compression) ||
                importer.sRGBTexture != request.SRgb ||
                importer.alphaIsTransparency != request.AlphaIsTransparency ||
                importer.mipmapEnabled != request.Mipmaps ||
                importer.isReadable != request.ReadWriteEnabled)
            {
                return false;
            }

            return request.TextureType != "Sprite" ||
                   Mathf.Approximately(importer.spritePixelsPerUnit, request.PixelsPerUnit);
        }

        /// <summary>从重新加载的 TextureImporter 创建实际设置摘要。</summary>
        private static ImageImporterSummary CreateImporterSummary(TextureImporter importer)
        {
            return new ImageImporterSummary
            {
                TextureType = importer.textureType.ToString(),
                SpriteMode = importer.spriteImportMode.ToString(),
                PixelsPerUnit = importer.spritePixelsPerUnit,
                FilterMode = importer.filterMode.ToString(),
                WrapMode = importer.wrapMode.ToString(),
                MaxSize = importer.maxTextureSize,
                Compression = importer.textureCompression.ToString(),
                SRgb = importer.sRGBTexture,
                AlphaIsTransparency = importer.alphaIsTransparency,
                Mipmaps = importer.mipmapEnabled,
                ReadWriteEnabled = importer.isReadable
            };
        }

        /// <summary>创建包含来源、GUID、批准证据和实际 Importer 的不可变登记事实。</summary>
        private static ResourceRegistrationRecord CreateRegistrationRecord(
            ImageImportRequest request,
            ImageImportResult result)
        {
            var identity = string.Join("\n", new[]
            {
                request.ResourceId,
                request.SourceVersion,
                request.VisualVersion,
                request.SourceSha256,
                result.AssetGuid
            });
            var evidencePaths = new List<string>();
            foreach (var approval in request.Approvals)
            {
                if (approval != null && !string.IsNullOrWhiteSpace(approval.EvidencePath))
                {
                    evidencePaths.Add(approval.EvidencePath);
                }
            }

            return new ResourceRegistrationRecord
            {
                RecordId = ComputeSha256(Encoding.UTF8.GetBytes(identity)),
                TaskId = request.TaskId,
                ResourceId = request.ResourceId,
                Module = request.Module,
                Type = request.TextureType == "Sprite" ? "sprite" : "texture",
                Purpose = string.IsNullOrWhiteSpace(request.UseCase) ? request.ResourceId : request.UseCase,
                SourceVersion = request.SourceVersion,
                VisualVersion = request.VisualVersion,
                SourcePath = request.SourcePath,
                SourceSha256 = request.SourceSha256,
                AssetPath = result.AssetPath,
                Address = result.AssetPath,
                AssetGuid = result.AssetGuid,
                Importer = result.ImporterSummary,
                Approvals = new List<ApprovalDto>(request.Approvals),
                ApprovalEvidencePaths = evidencePaths,
                ImportReportPath = result.ReportPath,
                GeneratedAtUtc = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
            };
        }

        /// <summary>以同目录临时文件和无覆盖原子移动写入不可变登记记录。</summary>
        private static void WriteImmutableRecord(string projectRelativePath, ResourceRegistrationRecord record)
        {
            var targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            var directory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrWhiteSpace(directory))
            {
                throw new ImageImportOperationException("registry.path-invalid", "无法解析资源登记记录目录。");
            }

            Directory.CreateDirectory(directory);
            // 目录创建可能改变路径实体，写入不可变记录前必须重新执行完整路径校验。
            targetPath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            directory = Path.GetDirectoryName(targetPath);
            if (string.IsNullOrWhiteSpace(directory))
            {
                throw new ImageImportOperationException("registry.path-invalid", "无法解析资源登记记录目录。");
            }

            if (File.Exists(targetPath))
            {
                throw new ImageImportOperationException("registry.record-exists", "相同资源事实已存在，禁止覆盖不可变登记记录。");
            }

            var temporaryPath = Path.Combine(directory, "." + Path.GetFileName(targetPath) + "." + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                File.WriteAllText(temporaryPath, JsonUtility.ToJson(record, true) + "\n", new UTF8Encoding(false));
                File.Move(temporaryPath, targetPath);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
        }

        /// <summary>把契约纹理类型映射为 Unity 枚举。</summary>
        private static TextureImporterType ParseTextureType(string value)
        {
            switch (value)
            {
                case "Sprite": return TextureImporterType.Sprite;
                case "NormalMap": return TextureImporterType.NormalMap;
                default: return TextureImporterType.Default;
            }
        }

        /// <summary>把契约 Sprite 模式映射为 Unity 枚举。</summary>
        private static SpriteImportMode ParseSpriteMode(string value)
        {
            switch (value)
            {
                case "Single": return SpriteImportMode.Single;
                case "Multiple": return SpriteImportMode.Multiple;
                default: return SpriteImportMode.None;
            }
        }

        /// <summary>把契约过滤模式映射为 Unity 枚举。</summary>
        private static FilterMode ParseFilterMode(string value)
        {
            switch (value)
            {
                case "Point": return FilterMode.Point;
                case "Trilinear": return FilterMode.Trilinear;
                default: return FilterMode.Bilinear;
            }
        }

        /// <summary>把契约寻址模式映射为 Unity 枚举。</summary>
        private static TextureWrapMode ParseWrapMode(string value)
        {
            switch (value)
            {
                case "Repeat": return TextureWrapMode.Repeat;
                case "Mirror": return TextureWrapMode.Mirror;
                case "MirrorOnce": return TextureWrapMode.MirrorOnce;
                default: return TextureWrapMode.Clamp;
            }
        }

        /// <summary>把契约压缩质量映射为 Unity 枚举。</summary>
        private static TextureImporterCompression ParseCompression(string value)
        {
            switch (value)
            {
                case "None": return TextureImporterCompression.Uncompressed;
                case "LowQuality": return TextureImporterCompression.CompressedLQ;
                case "HighQuality": return TextureImporterCompression.CompressedHQ;
                default: return TextureImporterCompression.Compressed;
            }
        }

        /// <summary>选择显式报告路径或安全的任务级默认路径。</summary>
        private static string ResolveReportPath(ImageImportRequest request, ImageImportResult result)
        {
            return string.IsNullOrWhiteSpace(request.ReportPath)
                ? $"Artifacts/ImagePipeline/{request.TaskId}-{result.OperationId}-import-report.json"
                : request.ReportPath.Replace('\\', '/');
        }

        /// <summary>尽力持久化失败证据，但不以报告异常替换原始业务错误。</summary>
        private static void TryWriteFailureReport(ImageImportRequest request, ImageImportResult result)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.TaskId))
            {
                return;
            }

            try
            {
                result.ReportPath = ResolveReportPath(request, result);
                ReportWriter.WriteNew(result.ReportPath, result);
            }
            catch (Exception)
            {
                result.AddError("report.write-failed", "导入失败报告无法写入项目内目标路径。");
            }
        }

        /// <summary>仅回滚本次成功创建的不可变登记记录。</summary>
        private static void RollbackCreatedRecord(string recordPath, ImageImportResult result)
        {
            if (string.IsNullOrWhiteSpace(recordPath))
            {
                return;
            }

            try
            {
                var absolutePath = WorkflowPaths.ResolveProjectRelative(recordPath);
                if (File.Exists(absolutePath))
                {
                    File.Delete(absolutePath);
                }
            }
            catch (Exception)
            {
                result.AddError("registry.rollback-failed", "无法回滚本次创建的资源登记记录。");
            }
        }

        /// <summary>仅回滚本次原子落位的正式资源及其新 GUID，不触碰 processed 源文件。</summary>
        private static void RollbackCreatedAsset(string assetPath, ImageImportResult result)
        {
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                return;
            }

            try
            {
                if (!AssetDatabase.DeleteAsset(assetPath))
                {
                    var absolutePath = WorkflowPaths.ResolveProjectRelative(assetPath);
                    if (File.Exists(absolutePath))
                    {
                        File.Delete(absolutePath);
                    }

                    if (File.Exists(absolutePath + ".meta"))
                    {
                        File.Delete(absolutePath + ".meta");
                    }

                    AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                }
            }
            catch (Exception)
            {
                result.AddError("rollback.failed", "无法完整回滚本次新建目标，请人工检查目标资源与 .meta。");
            }
        }

        /// <summary>清空已回滚的正式输出字段，避免失败报告误称资源仍然有效。</summary>
        private static void ResetRolledBackOutputs(ImageImportResult result)
        {
            result.Success = false;
            result.AssetPath = null;
            result.AssetGuid = null;
            result.ImporterSummary = null;
            result.RegistrationRecordPath = null;
        }

        /// <summary>删除本事务唯一 Library 暂存目录，不触碰其他并行任务。</summary>
        private static void CleanupStaging(string stagingDirectory)
        {
            if (string.IsNullOrWhiteSpace(stagingDirectory) || !Directory.Exists(stagingDirectory))
            {
                return;
            }

            try
            {
                Directory.Delete(stagingDirectory, true);
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Unity Workflow Toolkit 暂存清理失败（{exception.GetType().Name} / staging.cleanup-failed）。");
            }
        }

        /// <summary>计算文件小写 SHA-256。</summary>
        private static string ComputeFileSha256(string path)
        {
            using (var stream = File.OpenRead(path))
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(stream)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>计算字节数组小写 SHA-256。</summary>
        private static string ComputeSha256(byte[] bytes)
        {
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
    }
}
