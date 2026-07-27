using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using NUnit.Framework;
using Project.UnityWorkflow.Core;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;

namespace Project.UnityWorkflow.ImagePipeline.Tests
{
    /// <summary>
    /// 验证图片来源、批准、规格、白名单、无覆盖导入和失败回滚。
    /// </summary>
    public sealed class ImagePipelineTests
    {
        private const string TaskId = "uwt-image-tests";
        private const string SourceRoot = "ArtSource/Generated/uwt-image-tests/processed";
        private const string ForeignSourceRoot = "ArtSource/Generated/uwt-other-task/processed";
        private const string TargetRoot = "Assets/Art/Runtime/__UWTImageTests";
        private const string ReportRoot = "Artifacts/__UWTImageTests";
        private const string RegistrationRoot = "Artifacts/AssetRegistry/records";

        /// <summary>
        /// 每个测试前确保测试专属目录存在。
        /// </summary>
        [SetUp]
        public void SetUp()
        {
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(SourceRoot));
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(TargetRoot));
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(ReportRoot));
            File.WriteAllBytes(
                WorkflowPaths.ResolveProjectRelative(ReportRoot + "/approval.png"),
                new byte[] { 1, 2, 3 });
        }

        /// <summary>
        /// 每个测试后仅删除本测试类创建的源、目标和报告目录。
        /// </summary>
        [TearDown]
        public void TearDown()
        {
            if (AssetDatabase.IsValidFolder(TargetRoot))
            {
                AssetDatabase.DeleteAsset(TargetRoot);
            }
            else
            {
                DeleteOwnedDirectory(TargetRoot);
                var folderMeta = WorkflowPaths.ResolveProjectRelative(TargetRoot + ".meta");
                if (File.Exists(folderMeta))
                {
                    File.Delete(folderMeta);
                }
            }

            DeleteOwnedDirectory("ArtSource/Generated/uwt-image-tests");
            DeleteOwnedDirectory("ArtSource/Generated/uwt-other-task");
            DeleteOwnedDirectory(ReportRoot);
            DeleteOwnedRegistrationRecords();
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        }

        /// <summary>
        /// 有效批准 PNG 应通过来源、尺寸、Alpha 和目标技术校验。
        /// </summary>
        [Test]
        public void Validate_ApprovedPng_Passes()
        {
            var request = CreatePngRequest("valid.png", 64, 64);

            var result = ImageValidationService.Validate(request);

            Assert.IsTrue(result.IsValid, string.Join(" | ", result.Issues.Select(issue => issue.Code)));
            Assert.AreEqual(64, result.Width);
            Assert.AreEqual(64, result.Height);
            Assert.AreEqual("PNG", result.Format);
            Assert.IsTrue(result.HasAlpha);
        }

        /// <summary>
        /// 从任务创建请求时必须使用 selectedCandidate 的路径、哈希和视觉版本。
        /// </summary>
        [Test]
        public void FromTask_UsesSelectedCandidateProvenance()
        {
            var task = new ImageTaskDto
            {
                Id = TaskId,
                ResourceId = "ui.from-task",
                SourceVersion = "source-v2",
                Status = "APPROVED",
                FinalVisualReview = new EvidenceDto
                {
                    Type = "visual-review",
                    Path = ReportRoot + "/approval.png",
                    Sha256 = new string('b', 64)
                },
                SelectedCandidate = new SelectedImageCandidateDto
                {
                    Path = SourceRoot + "/selected.png",
                    Sha256 = new string('a', 64),
                    VisualVersion = "candidate-v3"
                }
            };

            var request = ImageImportRequest.FromTask(task);

            Assert.AreEqual(task.SelectedCandidate.Path, request.SourcePath);
            Assert.AreEqual(task.SelectedCandidate.Sha256, request.SourceSha256);
            Assert.AreEqual(task.SelectedCandidate.VisualVersion, request.VisualVersion);
            Assert.AreSame(task.FinalVisualReview, request.FinalVisualReview);
        }

        /// <summary>
        /// 未批准状态和缺失批准证据必须阻断正式导入。
        /// </summary>
        [Test]
        public void Validate_UnapprovedTask_IsRejected()
        {
            var request = CreatePngRequest("unapproved.png", 64, 64);
            request.Status = "REVIEWING";
            request.Approvals.Clear();

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "approval.status");
            AssertIssue(result, "approval.missing");
        }

        /// <summary>
        /// 批准时间必须是 UTC，且批准证据必须是实际存在的项目内文件。
        /// </summary>
        [Test]
        public void Validate_InvalidApprovalEvidence_IsRejected()
        {
            var invalidTime = CreatePngRequest("approval-time.png", 64, 64);
            invalidTime.Approvals[0].ApprovedAtUtc = "2026-07-27T08:00:00+08:00";
            var ambiguousTime = CreatePngRequest("approval-timezone.png", 64, 64);
            ambiguousTime.Approvals[0].ApprovedAtUtc = "2026-07-27T00:00:00";
            var missingEvidence = CreatePngRequest("approval-evidence.png", 64, 64);
            missingEvidence.Approvals[0].EvidencePath = ReportRoot + "/missing.png";
            var unsafeEvidence = CreatePngRequest("approval-path.png", 64, 64);
            unsafeEvidence.Approvals[0].EvidencePath = "../outside.png";
            var missingFinalReview = CreatePngRequest("final-review.png", 64, 64);
            missingFinalReview.FinalVisualReview = null;

            AssertIssue(ImageValidationService.Validate(invalidTime), "approval.time-invalid");
            AssertIssue(ImageValidationService.Validate(ambiguousTime), "approval.time-invalid");
            AssertIssue(ImageValidationService.Validate(missingEvidence), "approval.evidence-missing");
            AssertIssue(ImageValidationService.Validate(unsafeEvidence), "approval.evidence-path-invalid");
            AssertIssue(ImageValidationService.Validate(missingFinalReview), "final-review.incomplete");
        }

        /// <summary>
        /// 批准主体、版本和证据哈希必须与当前图片任务及实际证据文件完全绑定。
        /// </summary>
        [Test]
        public void Validate_ApprovalBindingAndHashMismatch_AreRejected()
        {
            var wrongSubject = CreatePngRequest("approval-subject.png", 64, 64);
            wrongSubject.Approvals[0].SubjectId = "visual.other-task";
            var wrongVersion = CreatePngRequest("approval-version.png", 64, 64);
            wrongVersion.Approvals[0].SubjectVersion = "old-visual-version";
            var wrongHash = CreatePngRequest("approval-hash.png", 64, 64);
            wrongHash.Approvals[0].EvidenceSha256 = new string('0', 64);

            AssertIssue(ImageValidationService.Validate(wrongSubject), "approval.subject-mismatch");
            AssertIssue(ImageValidationService.Validate(wrongVersion), "approval.version-mismatch");
            AssertIssue(ImageValidationService.Validate(wrongHash), "approval.evidence-hash-mismatch");
        }

        /// <summary>
        /// 独立审查必须带任务和专业，且不能代替最终用户批准。
        /// </summary>
        [Test]
        public void Validate_IndependentReviewWithoutMetadataOrUserApproval_IsRejected()
        {
            var incompleteReview = CreatePngRequest("approval-review.png", 64, 64);
            ApprovalDto approval = incompleteReview.Approvals[0];
            approval.Authority = "INDEPENDENT_REVIEWER";
            approval.ReviewTaskId = string.Empty;
            approval.ReviewDiscipline = string.Empty;

            ImageValidationResult result = ImageValidationService.Validate(incompleteReview);
            var missingDiscipline = CreatePngRequest("approval-discipline.png", 64, 64);
            missingDiscipline.Approvals.RemoveAll(item => item.ReviewDiscipline == "UX_READABILITY");

            AssertIssue(result, "approval.review-incomplete");
            AssertIssue(result, "approval.user-required");
            AssertIssue(ImageValidationService.Validate(missingDiscipline), "approval.reviews-required");
        }

        /// <summary>
        /// 超过编码文件上限的源图必须在读取和解码前被拒绝。
        /// </summary>
        [Test]
        public void Validate_OversizedSource_IsRejectedBeforeDecode()
        {
            const string relativePath = SourceRoot + "/oversized.png";
            string absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            using (FileStream stream = File.Create(absolutePath))
            {
                stream.SetLength(ImageValidationService.MaximumSourceFileBytes + 1);
            }

            var request = CreateBaseRequest(
                "oversized.png",
                relativePath,
                new string('0', 64));

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.file-size");
        }

        /// <summary>
        /// selectedCandidate.sha256 与源文件不一致时必须拒绝导入。
        /// </summary>
        [Test]
        public void Validate_HashMismatch_IsRejected()
        {
            var request = CreatePngRequest("hash.png", 64, 64);
            request.SourceSha256 = new string('0', 64);

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.hash-mismatch");
        }

        /// <summary>
        /// 扩展名或内容不是 PNG/JPEG 时必须返回稳定格式错误。
        /// </summary>
        [Test]
        public void Validate_UnsupportedFormat_IsRejected()
        {
            const string relativePath = SourceRoot + "/invalid.gif";
            var bytes = new byte[] { 1, 2, 3, 4 };
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(relativePath), bytes);
            var request = CreateBaseRequest("invalid.gif", relativePath, ComputeSha256(bytes));

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.format-extension");
        }

        /// <summary>
        /// 尺寸和宽高比不符合任务声明时必须同时报告，便于一次修正。
        /// </summary>
        [Test]
        public void Validate_SizeAndAspectMismatch_AreReported()
        {
            var request = CreatePngRequest("dimensions.png", 64, 32);
            request.MinimumWidth = 128;
            request.MinimumHeight = 128;
            request.ExpectedAspectRatio = "1:1";

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.too-small");
            AssertIssue(result, "source.aspect-mismatch");
        }

        /// <summary>
        /// JPG 不具备 Alpha 通道，不能满足透明图片任务。
        /// </summary>
        [Test]
        public void Validate_JpegWhenAlphaRequired_IsRejected()
        {
            const string relativePath = SourceRoot + "/opaque.jpg";
            var bytes = CreateImageBytes(64, 64, false);
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(relativePath), bytes);
            var request = CreateBaseRequest("opaque.jpg", relativePath, ComputeSha256(bytes));
            request.AlphaRequired = true;
            request.AlphaIsTransparency = true;

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.alpha-missing");
            AssertIssue(result, "import.alpha-transparency-invalid");
        }

        /// <summary>
        /// 源路径必须严格属于当前任务 processed 目录，目标必须位于运行时美术根。
        /// </summary>
        [Test]
        public void Validate_SourceAndTargetOutsideWhitelist_AreRejected()
        {
            Directory.CreateDirectory(WorkflowPaths.ResolveProjectRelative(ForeignSourceRoot));
            const string foreignPath = ForeignSourceRoot + "/foreign.png";
            var bytes = CreateImageBytes(64, 64, true);
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(foreignPath), bytes);
            var request = CreateBaseRequest("foreign.png", foreignPath, ComputeSha256(bytes));
            request.TargetDirectory = "Assets/Editor/Generated";

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "source.outside-processed");
            AssertIssue(result, "target.not-allowed");
        }

        /// <summary>
        /// 已有正式文件或孤立 .meta 都必须阻断覆盖与 GUID 重建。
        /// </summary>
        [Test]
        public void Validate_ExistingAssetAndMeta_AreProtected()
        {
            var request = CreatePngRequest("protected.png", 64, 64);
            var target = WorkflowPaths.ResolveProjectRelative(TargetRoot + "/protected.png");
            File.WriteAllBytes(target, new byte[] { 1 });
            File.WriteAllText(target + ".meta", "fileFormatVersion: 2");

            var result = ImageValidationService.Validate(request);

            AssertIssue(result, "target.exists");
            AssertIssue(result, "target.meta-exists");
        }

        /// <summary>
        /// 同一正式目标的第二个进程级锁请求必须失败，释放后应可重新获取。
        /// </summary>
        [Test]
        public void AssetTargetLock_SerializesSameTargetAcrossHandles()
        {
            const string assetPath = TargetRoot + "/locked.png";
            using (AssetTargetLock.Acquire(assetPath))
            {
                Assert.Throws<AssetTargetLockUnavailableException>(() => AssetTargetLock.Acquire(assetPath));
            }

            using (AssetTargetLock.Acquire(assetPath))
            {
                Assert.Pass();
            }
        }

        /// <summary>
        /// Sprite 导入必须按请求设置像素密度、过滤、寻址、压缩与读写属性。
        /// </summary>
        [Test]
        public void Import_Sprite_AppliesAndVerifiesImporterSettings()
        {
            var request = CreatePngRequest("sprite.png", 64, 64);
            request.FilterMode = "Point";
            request.Compression = "None";
            request.ReadWriteEnabled = true;

            var result = new ImageImportService().Import(request);
            var importer = AssetImporter.GetAtPath(result.AssetPath) as TextureImporter;

            Assert.IsTrue(result.Success, string.Join(" | ", result.Errors.Select(error => error.Code)));
            Assert.IsNotNull(importer);
            Assert.AreEqual(TextureImporterType.Sprite, importer.textureType);
            Assert.AreEqual(SpriteImportMode.Single, importer.spriteImportMode);
            Assert.AreEqual(FilterMode.Point, importer.filterMode);
            Assert.AreEqual(TextureImporterCompression.Uncompressed, importer.textureCompression);
            Assert.IsTrue(importer.isReadable);
            Assert.IsNotEmpty(result.AssetGuid);
            Assert.AreEqual(AssetDatabase.AssetPathToGUID(result.AssetPath), result.AssetGuid);
            Assert.IsNotNull(result.ImporterSummary);
            Assert.AreEqual("Sprite", result.ImporterSummary.TextureType);
            Assert.AreEqual("Point", result.ImporterSummary.FilterMode);
            Assert.IsNotEmpty(result.RegistrationRecordPath);
            var recordPath = WorkflowPaths.ResolveProjectRelative(result.RegistrationRecordPath);
            Assert.IsTrue(File.Exists(recordPath));
            var recordJson = File.ReadAllText(recordPath);
            ResourceRegistrationRecord record = JsonUtility.FromJson<ResourceRegistrationRecord>(recordJson);
            var reportJson = File.ReadAllText(WorkflowPaths.ResolveProjectRelative(result.ReportPath));
            StringAssert.Contains(result.AssetGuid, reportJson);
            StringAssert.Contains("\"importerSummary\"", reportJson);
            StringAssert.Contains(result.AssetGuid, recordJson);
            StringAssert.Contains("\"licenseStatus\": \"PENDING\"", recordJson);
            StringAssert.Contains("\"unityValidation\": \"PASS\"", recordJson);
            Assert.That(record.Approvals, Has.Count.EqualTo(request.Approvals.Count));
            Assert.AreEqual(request.Approvals[0].ApprovalType, record.Approvals[0].ApprovalType);
            Assert.AreEqual(request.Approvals[0].Authority, record.Approvals[0].Authority);
            Assert.AreEqual(request.TaskId, record.Approvals[0].SubjectId);
            Assert.AreEqual(request.VisualVersion, record.Approvals[0].SubjectVersion);
            Assert.AreEqual(request.Approvals[0].EvidencePath, record.Approvals[0].EvidencePath);
            Assert.AreEqual(request.Approvals[0].EvidenceSha256, record.Approvals[0].EvidenceSha256);
            Assert.That(record.ApprovalEvidencePaths, Does.Contain(request.Approvals[0].EvidencePath));
            var stagingRoot = WorkflowPaths.ResolveProjectRelative("Library/UnityWorkflow/Staging/Images");
            if (Directory.Exists(stagingRoot))
            {
                Assert.IsEmpty(Directory.GetFiles(stagingRoot, "sprite.png", SearchOption.AllDirectories));
            }
            Assert.IsTrue(File.Exists(WorkflowPaths.ResolveProjectRelative(request.SourcePath)), "导入不得删除源文件。");
        }

        /// <summary>
        /// Default 纹理必须保持非 Sprite 模式并应用声明的采样设置。
        /// </summary>
        [Test]
        public void Import_DefaultTexture_AppliesDefaultImporterSettings()
        {
            var request = CreatePngRequest("default.png", 64, 64);
            request.TextureType = "Default";
            request.SpriteMode = "None";
            request.WrapMode = "Repeat";
            request.Mipmaps = true;

            var result = new ImageImportService().Import(request);
            var importer = AssetImporter.GetAtPath(result.AssetPath) as TextureImporter;

            Assert.IsTrue(result.Success, string.Join(" | ", result.Errors.Select(error => error.Code)));
            Assert.IsNotNull(importer);
            Assert.AreEqual(TextureImporterType.Default, importer.textureType);
            Assert.AreEqual(SpriteImportMode.None, importer.spriteImportMode);
            Assert.AreEqual(TextureWrapMode.Repeat, importer.wrapMode);
            Assert.IsTrue(importer.mipmapEnabled);
        }

        /// <summary>
        /// 导入后报告写入失败时仅回滚本次新建资源和 .meta，源文件必须保留。
        /// </summary>
        [Test]
        public void Import_PostCopyFailure_RollsBackCreatedAssetOnly()
        {
            var request = CreatePngRequest("rollback.png", 64, 64);
            request.ReportPath = "../outside-report.json";
            var target = WorkflowPaths.ResolveProjectRelative(TargetRoot + "/rollback.png");

            var result = new ImageImportService().Import(request);

            Assert.IsFalse(result.Success);
            Assert.IsTrue(result.Errors.Any(error => error.Code == "import.exception"));
            Assert.IsFalse(File.Exists(target));
            Assert.IsFalse(File.Exists(target + ".meta"));
            Assert.IsEmpty(GetOwnedRegistrationRecords(), "失败事务不得残留资源登记记录。");
            Assert.IsTrue(File.Exists(WorkflowPaths.ResolveProjectRelative(request.SourcePath)));
        }

        /// <summary>创建源文件和与其哈希匹配的 PNG 导入请求。</summary>
        private static ImageImportRequest CreatePngRequest(string fileName, int width, int height)
        {
            var relativePath = SourceRoot + "/" + fileName;
            var bytes = CreateImageBytes(width, height, true);
            File.WriteAllBytes(WorkflowPaths.ResolveProjectRelative(relativePath), bytes);
            return CreateBaseRequest(fileName, relativePath, ComputeSha256(bytes));
        }

        /// <summary>创建具备用户批准与完整 Importer 参数的请求。</summary>
        private static ImageImportRequest CreateBaseRequest(string fileName, string sourcePath, string sha256)
        {
            return new ImageImportRequest
            {
                TaskId = TaskId,
                ResourceId = "ui.test-image",
                Module = "Presentation.Tests",
                AssetType = "ui",
                UseCase = "图片管线自动化测试",
                SourceVersion = "visual-v1",
                SourcePath = sourcePath,
                SourceSha256 = sha256,
                VisualVersion = "candidate-v1",
                Status = "APPROVED",
                FinalVisualReview = new EvidenceDto
                {
                    Type = "visual-review",
                    Path = ReportRoot + "/approval.png",
                    Sha256 = ComputeFileSha256(ReportRoot + "/approval.png")
                },
                Approvals = new List<ApprovalDto>
                {
                    CreateApproval("USER", null),
                    CreateApproval("INDEPENDENT_REVIEWER", "VISUAL_CONSISTENCY"),
                    CreateApproval("INDEPENDENT_REVIEWER", "UNITY_FEASIBILITY"),
                    CreateApproval("INDEPENDENT_REVIEWER", "UX_READABILITY")
                },
                TargetDirectory = TargetRoot,
                FileName = fileName,
                ExpectedAspectRatio = "1:1",
                AlphaRequired = true,
                MinimumWidth = 1,
                MinimumHeight = 1,
                MaximumWidth = 4096,
                MaximumHeight = 4096,
                TextureType = "Sprite",
                SpriteMode = "Single",
                PixelsPerUnit = 100f,
                FilterMode = "Bilinear",
                WrapMode = "Clamp",
                MaxSize = 2048,
                Compression = "HighQuality",
                SRgb = true,
                AlphaIsTransparency = true,
                Mipmaps = false,
                ReadWriteEnabled = false,
                ReportPath = ReportRoot + "/" + Path.GetFileNameWithoutExtension(fileName) + ".json"
            };
        }

        /// <summary>创建绑定选中候选和真实证据的用户批准或独立审查记录。</summary>
        private static ApprovalDto CreateApproval(string authority, string discipline)
        {
            bool independent = authority == "INDEPENDENT_REVIEWER";
            return new ApprovalDto
            {
                ApprovalType = "GAME_VISUAL",
                Authority = authority,
                SubjectId = TaskId,
                SubjectVersion = "candidate-v1",
                ApprovedBy = independent ? "reviewer-" + discipline : "test-owner",
                ApprovedAtUtc = "2026-07-27T00:00:00Z",
                EvidencePath = ReportRoot + "/approval.png",
                EvidenceSha256 = ComputeFileSha256(ReportRoot + "/approval.png"),
                ReviewTaskId = independent ? "review." + discipline.ToLowerInvariant() : string.Empty,
                ReviewDiscipline = independent ? discipline : string.Empty
            };
        }

        /// <summary>生成测试专用 PNG 或 JPEG 字节，不依赖仓库固定图片。</summary>
        private static byte[] CreateImageBytes(int width, int height, bool png)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
            try
            {
                var pixels = new Color[width * height];
                for (var index = 0; index < pixels.Length; index++)
                {
                    pixels[index] = new Color(0.2f, 0.4f, 0.8f, png ? 0.5f : 1f);
                }

                texture.SetPixels(pixels);
                texture.Apply();
                return png ? texture.EncodeToPNG() : texture.EncodeToJPG(90);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(texture);
            }
        }

        /// <summary>计算测试源文件 SHA-256。</summary>
        private static string ComputeSha256(byte[] bytes)
        {
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>计算项目内测试证据文件的 SHA-256。</summary>
        private static string ComputeFileSha256(string projectRelativePath)
        {
            return ComputeSha256(File.ReadAllBytes(WorkflowPaths.ResolveProjectRelative(projectRelativePath)));
        }

        /// <summary>断言结构化校验结果包含指定稳定代码。</summary>
        private static void AssertIssue(ImageValidationResult result, string code)
        {
            Assert.IsTrue(result.Issues.Any(issue => issue.Code == code),
                $"预期问题 {code}，实际为 {string.Join(", ", result.Issues.Select(issue => issue.Code))}");
        }

        /// <summary>只删除测试类声明拥有的项目相对目录。</summary>
        private static void DeleteOwnedDirectory(string relativePath)
        {
            var absolutePath = WorkflowPaths.ResolveProjectRelative(relativePath);
            if (Directory.Exists(absolutePath))
            {
                Directory.Delete(absolutePath, true);
            }
        }

        /// <summary>查找仅属于当前测试任务的不可变资源登记记录。</summary>
        private static List<string> GetOwnedRegistrationRecords()
        {
            var root = WorkflowPaths.ResolveProjectRelative(RegistrationRoot);
            if (!Directory.Exists(root))
            {
                return new List<string>();
            }

            return Directory.GetFiles(root, "*.json", SearchOption.TopDirectoryOnly)
                .Where(path => File.ReadAllText(path).Contains("\"taskId\": \"" + TaskId + "\""))
                .ToList();
        }

        /// <summary>删除当前测试任务生成的独立登记记录，不修改总 asset-register。</summary>
        private static void DeleteOwnedRegistrationRecords()
        {
            foreach (var path in GetOwnedRegistrationRecords())
            {
                File.Delete(path);
            }
        }
    }
}
