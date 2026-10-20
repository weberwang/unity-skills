using System;
using System.Collections.Generic;
using System.Linq;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 核对角色 Sprite 变体资源、目标渲染器、骨架兼容性、PPU 和 Pivot 局部约定。
    /// </summary>
    internal static class RiggingVariantValidator
    {
        private const float LocalConventionTolerance = 0.0001f;

        /// <summary>按请求逐个只读检查 Sprite 变体及其目标蒙皮。</summary>
        /// <param name="characterRoot">临时加载的角色 Prefab 根节点。</param>
        /// <param name="variants">请求中的变体要求。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        public static void Validate(
            GameObject characterRoot,
            IList<RiggingVariantRequirement> variants,
            QualityReportDto report)
        {
            if (variants == null || variants.Count == 0)
            {
                return;
            }

            for (int index = 0; index < variants.Count; index++)
            {
                RiggingVariantRequirement requirement = variants[index];
                string checkPrefix = "variant-" + index.ToString("D2");
                if (requirement == null)
                {
                    AddFailedVariant(report, checkPrefix, "变体需求为空。");
                    continue;
                }

                ValidateVariant(characterRoot, requirement, checkPrefix, report);
            }
        }

        /// <summary>检查单个变体的目标层级、Sprite 资源和蒙皮映射。</summary>
        /// <param name="characterRoot">角色 Prefab 根节点。</param>
        /// <param name="requirement">变体需求。</param>
        /// <param name="checkPrefix">稳定检查 ID 前缀。</param>
        /// <param name="report">接收检查结果的质量报告。</param>
        private static void ValidateVariant(
            GameObject characterRoot,
            RiggingVariantRequirement requirement,
            string checkPrefix,
            QualityReportDto report)
        {
            Transform targetTransform = null;
            bool rendererPathValid = characterRoot != null &&
                                     TryResolveRendererTransform(characterRoot.transform, requirement.RendererPath, out targetTransform);
            SpriteRenderer renderer = rendererPathValid ? targetTransform.GetComponent<SpriteRenderer>() : null;
            SpriteSkin[] skins = rendererPathValid
                ? targetTransform.GetComponents<SpriteSkin>()
                : Array.Empty<SpriteSkin>();
            bool rendererValid = renderer != null && skins.Length == 1 && renderer.sprite != null;
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-renderer", "variant",
                rendererValid ? "PASS" : "FAIL",
                rendererValid
                    ? $"变体目标节点 {requirement.RendererPath} 包含唯一 SpriteRenderer/SpriteSkin 和当前 Sprite。"
                    : "RendererPath 必须唯一解析到包含 SpriteRenderer、唯一 SpriteSkin 和当前 Sprite 的角色节点。");

            bool spritePathValid = RiggingValidationRequestValidator.TryValidateAssetPath(
                requirement.SpritePath, null, out string spritePath);
            Sprite variantSprite = spritePathValid ? ResolveUniqueSprite(spritePath, requirement.SpriteName) : null;
            bool variantSpriteResolved = variantSprite != null;
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-sprite-resource", "variant",
                variantSpriteResolved ? "PASS" : "FAIL",
                variantSpriteResolved
                    ? $"已从 {spritePath} 唯一解析名为 {requirement.SpriteName} 的 Sprite 子资源。"
                    : "SpritePath 必须位于 Assets/，并且其中必须存在唯一匹配 SpriteName 的 Sprite 子资源。");

            if (!rendererValid || !variantSpriteResolved)
            {
                AddBlockedCompatibilityChecks(report, checkPrefix,
                    "目标 Renderer 或 Sprite 子资源无效，无法检查变体骨架和 PPU/Pivot。");
                return;
            }

            Sprite sourceSprite = renderer.sprite;
            RiggingSpriteData sourceData = RiggingSpriteMeshValidator.ValidateSprite(
                sourceSprite, checkPrefix + "-source", report);
            RiggingSpriteData variantData = RiggingSpriteMeshValidator.ValidateSprite(
                variantSprite, checkPrefix + "-candidate", report);

            bool variantMapsToSkin = RiggingSpriteMeshValidator.ValidateSkinMapping(
                skins[0], characterRoot, variantData, checkPrefix + "-variant", report, false);
            bool skeletonCompatible = sourceData != null && variantData != null &&
                                      RiggingSpriteMeshValidator.HasCompatibleSkeleton(sourceData, variantData) &&
                                      variantMapsToSkin;
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-skeleton-compatibility", "variant",
                skeletonCompatible ? "PASS" : "FAIL",
                skeletonCompatible
                    ? "变体骨骼数量、顺序、名称与父级索引符合当前 SpriteSkin 的蒙皮映射。"
                    : "变体的骨骼数量、顺序、名称或父级索引与当前 Sprite/SpriteSkin 不一致。");

            EvaluateLocalConvention(sourceSprite, variantSprite, out string conventionStatus, out string conventionMessage);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-ppu-pivot", "variant",
                conventionStatus, conventionMessage);
        }

        /// <summary>以明确层级路径唯一定位目标节点，避免 Find 误选同名兄弟节点。</summary>
        /// <param name="root">角色根節點 Transform。</param>
        /// <param name="path">相對於角色根節點的路徑；空字符串表示根節點。</param>
        /// <param name="target">成功時返回唯一目標。</param>
        /// <returns>路徑完整且每段都唯一時返回 true。</returns>
        private static bool TryResolveRendererTransform(Transform root, string path, out Transform target)
        {
            target = null;
            if (root == null || path == null)
            {
                return false;
            }

            if (path.Length == 0)
            {
                target = root;
                return true;
            }

            Transform current = root;
            foreach (string segment in path.Split('/'))
            {
                Transform match = null;
                for (int childIndex = 0; childIndex < current.childCount; childIndex++)
                {
                    Transform child = current.GetChild(childIndex);
                    if (!string.Equals(child.name, segment, StringComparison.Ordinal))
                    {
                        continue;
                    }

                    if (match != null)
                    {
                        return false;
                    }

                    match = child;
                }

                if (match == null)
                {
                    return false;
                }

                current = match;
            }

            target = current;
            return true;
        }

        /// <summary>在已通过 Assets 路径边界检查的资源中按子资源名唯一解析 Sprite。</summary>
        /// <param name="spritePath">项目内 Sprite 纹理资源路径。</param>
        /// <param name="spriteName">Sprite 子资源名。</param>
        /// <returns>恰好一个匹配 Sprite 时返回资源，否则返回 null。</returns>
        private static Sprite ResolveUniqueSprite(string spritePath, string spriteName)
        {
            try
            {
                Sprite[] matches = AssetDatabase.LoadAllAssetsAtPath(spritePath)
                    .OfType<Sprite>()
                    .Where(sprite => string.Equals(sprite.name, spriteName, StringComparison.Ordinal))
                    .ToArray();
                return matches.Length == 1 ? matches[0] : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>检查 PPU 和 Pivot 的局部坐标事实，不要求不同尺寸与角度的 Sprite 共用画布坐标。</summary>
        /// <param name="source">角色当前 Sprite。</param>
        /// <param name="variant">待验证变体。</param>
        /// <param name="status">检查状态。</param>
        /// <param name="message">检查诊断。</param>
        private static void EvaluateLocalConvention(Sprite source, Sprite variant, out string status, out string message)
        {
            if (source == null || variant == null || !IsFinite(source.pixelsPerUnit) ||
                !IsFinite(variant.pixelsPerUnit) || source.pixelsPerUnit <= 0f || variant.pixelsPerUnit <= 0f ||
                !Mathf.Approximately(source.pixelsPerUnit, variant.pixelsPerUnit) ||
                !IsValidRectAndPivot(source) || !IsValidRectAndPivot(variant))
            {
                status = "FAIL";
                message = "来源和变体必须使用相同有效 PPU，且 Rect/Pivot 必须为有限正尺寸与 Rect 内的有效局部坐标。";
                return;
            }

            Vector2 sourcePivotUnits = source.pivot / source.pixelsPerUnit;
            Vector2 variantPivotUnits = variant.pivot / variant.pixelsPerUnit;
            bool directPlacementMatches = IsFinite(sourcePivotUnits) && IsFinite(variantPivotUnits) &&
                                          Mathf.Abs(sourcePivotUnits.x - variantPivotUnits.x) <= LocalConventionTolerance &&
                                          Mathf.Abs(sourcePivotUnits.y - variantPivotUnits.y) <= LocalConventionTolerance;
            if (!directPlacementMatches)
            {
                // 变体请求没有声明额外局部偏移，无法据此推断不同 Pivot 是否仍能直接替换对齐。
                status = "BLOCKED";
                message = "来源和变体的 PPU 与 Pivot 数据有效，但 Pivot 局部位置不同；请求未声明补偿偏移，不能证明直接替换时局部对齐。";
                return;
            }

            status = "PASS";
            message = "来源和变体 PPU 一致，Pivot 均合法且局部位置一致；不同画布尺寸、网格轮廓和视觉接缝未验证。";
        }

        /// <summary>确认 Sprite Rect 尺寸、Pivot 数值有限且 Pivot 落在各自 Rect 内。</summary>
        /// <param name="sprite">待检查 Sprite。</param>
        /// <returns>几何坐标可用时返回 true。</returns>
        private static bool IsValidRectAndPivot(Sprite sprite)
        {
            return IsFinite(sprite.rect.width) && IsFinite(sprite.rect.height) &&
                   sprite.rect.width > 0f && sprite.rect.height > 0f && IsFinite(sprite.pivot) &&
                   sprite.pivot.x >= 0f && sprite.pivot.x <= sprite.rect.width &&
                   sprite.pivot.y >= 0f && sprite.pivot.y <= sprite.rect.height;
        }

        /// <summary>为无法解析的变体记录后续兼容性检查未执行。</summary>
        /// <param name="report">接收结果的质量报告。</param>
        /// <param name="checkPrefix">稳定检查 ID 前缀。</param>
        /// <param name="reason">未能执行检查的原因。</param>
        private static void AddBlockedCompatibilityChecks(QualityReportDto report, string checkPrefix, string reason)
        {
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-skeleton-compatibility", "variant", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-ppu-pivot", "variant", "BLOCKED", reason);
        }

        /// <summary>为缺失的变体条目补齐失败和阻断记录。</summary>
        /// <param name="report">接收结果的质量报告。</param>
        /// <param name="checkPrefix">稳定检查 ID 前缀。</param>
        /// <param name="reason">需求错误原因。</param>
        private static void AddFailedVariant(QualityReportDto report, string checkPrefix, string reason)
        {
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-renderer", "variant", "FAIL", reason);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-sprite-resource", "variant", "FAIL", reason);
            AddBlockedCompatibilityChecks(report, checkPrefix, reason);
        }

        /// <summary>检查浮点数是否有限。</summary>
        /// <param name="value">待检查数值。</param>
        /// <returns>不是 NaN 或无穷值时返回 true。</returns>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        /// <summary>检查 Vector2 的两个分量是否有限。</summary>
        /// <param name="value">待检查向量。</param>
        /// <returns>两个分量均有限时返回 true。</returns>
        private static bool IsFinite(Vector2 value)
        {
            return IsFinite(value.x) && IsFinite(value.y);
        }
    }
}
