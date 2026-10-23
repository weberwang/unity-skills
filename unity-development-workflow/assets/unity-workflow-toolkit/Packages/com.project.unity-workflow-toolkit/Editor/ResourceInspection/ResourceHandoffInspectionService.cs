using System;
using System.Collections.Generic;
using System.Globalization;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>编排 AssetDatabase 资源和 AnimationClip 的只读交接快照。</summary>
    public sealed class ResourceHandoffInspectionService
    {
        /// <summary>读取请求中的真实 Unity 资产事实并写入不可覆盖的新报告。</summary>
        /// <param name="request">编译后的资源交接请求。</param>
        /// <returns>MEASURED 的成功报告或包含部分快照的 FAIL 报告。</returns>
        public ResourceHandoffInspectionReport Inspect(ResourceHandoffInspectionRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException(nameof(request));
            }

            string outputPath = ResourceHandoffPath.RequireOutputPath(request.outputPath);
            var report = new ResourceHandoffInspectionReport
            {
                taskId = request.taskId,
                outputPath = outputPath,
                runId = Guid.NewGuid().ToString("N"),
                generatedAtUtc = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture)
            };
            var errors = new List<string>();

            if (!string.Equals(request.schemaVersion, "1.0", StringComparison.Ordinal))
            {
                errors.Add("不支持资源交接请求 Schema 版本。");
            }

            if (string.IsNullOrWhiteSpace(request.taskId))
            {
                errors.Add("资源交接请求缺少 taskId。");
            }

            if ((request.assets == null || request.assets.Count == 0) &&
                (request.animations == null || request.animations.Count == 0))
            {
                errors.Add("资源交接请求至少需要一项资产或动画。");
            }

            if (request.assets != null)
            {
                foreach (ResourceHandoffAssetRequest asset in request.assets)
                {
                    ResourceHandoffAssetSnapshot snapshot = ResourceAssetSnapshotReader.Read(asset, out string error);
                    report.assets.Add(snapshot);
                    if (!string.IsNullOrEmpty(error))
                    {
                        errors.Add(error);
                    }
                }
            }

            if (request.animations != null)
            {
                foreach (ResourceHandoffAnimationRequest animation in request.animations)
                {
                    ResourceHandoffAnimationSnapshot snapshot =
                        FrameAnimationSnapshotReader.Read(animation, out string error);
                    report.animations.Add(snapshot);
                    if (!string.IsNullOrEmpty(error))
                    {
                        errors.Add(error);
                    }
                }
            }

            report.status = errors.Count == 0 ? "MEASURED" : "FAIL";
            report.message = errors.Count == 0
                ? "资源加载配置与序列帧消费者事实已从 Unity Editor 读取。"
                : string.Join("；", errors);
            ResourceHandoffReportWriter.WriteNew(outputPath, report);
            return report;
        }
    }
}
