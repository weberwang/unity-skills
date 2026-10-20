using System;
using Project.UnityWorkflow.Core.Models;
using UnityEditor;
using UnityEngine;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 只读检查角色 Prefab、骨骼网格、动画 Controller 与 Sprite 变体，并返回工程事实报告。
    /// </summary>
    public sealed class RiggingValidationService
    {
        /// <summary>执行角色骨骼资产工程检查，不修改源资源或写入报告文件。</summary>
        /// <param name="request">角色、动画和 Sprite 变体检查要求。</param>
        /// <returns>逐项记录通过、失败和未覆盖范围的质量报告。</returns>
        public QualityReportDto Validate(RiggingValidationRequest request)
        {
            QualityReportDto report = RiggingValidationReportBuilder.Create(request);
            RiggingValidationRequestState requestState;
            try
            {
                requestState = RiggingValidationRequestValidator.Validate(request, report);
            }
            catch (Exception)
            {
                RiggingValidationReportBuilder.AddCheck(report, "request-validation", "schema", "FAIL",
                    "请求验证意外中断；报告不包含底层异常文本或环境路径。");
                requestState = new RiggingValidationRequestState();
            }

            if (requestState.PrefabPathValid)
            {
                ValidatePrefab(requestState.PrefabPath, request, report);
            }
            else
            {
                RiggingValidationReportBuilder.AddCheck(report, "prefab-load", "asset", "BLOCKED",
                    "Prefab 路径未通过项目边界检查，未读取任何角色资源。");
                AddPrefabInspectionBlockedChecks(report, "Prefab 路径不可安全读取。");
                RiggingClipValidator.AddUnavailableChecks(request == null ? null : request.Clips, report);
                RiggingVariantValidator.Validate(null, request == null ? null : request.Variants, report);
            }

            // 工程报告不把未执行的运行或视觉检查误记成骨骼资产失败或通过。
            RiggingValidationReportBuilder.AddCheck(report, "engineering-only-scope", "scope", "PASS",
                "本报告只陈述骨骼资产工程事实；仅接受角色层级中的唯一 Animator。运行行为为 NOT_RUN，由独立角色回归测试验证；视觉表现为 NOT_RUN，由人工预览验收。");
            RiggingValidationReportBuilder.Complete(report);
            return report;
        }

        /// <summary>在临时 Prefab 内容场景中核查必需组件，并始终卸载临时对象。</summary>
        /// <param name="prefabPath">通过项目路径边界检查的 Assets 路径。</param>
        /// <param name="request">动画与变体检查要求。</param>
        /// <param name="report">接收结果的报告。</param>
        private static void ValidatePrefab(string prefabPath, RiggingValidationRequest request, QualityReportDto report)
        {
            GameObject root = null;
            bool loaded = false;
            try
            {
                if (AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath) == null)
                {
                    RiggingValidationReportBuilder.AddCheck(report, "prefab-load", "asset", "FAIL",
                        "指定 Assets 路径不存在可加载的角色 Prefab。");
                    AddPrefabInspectionBlockedChecks(report, "Prefab 未能加载。");
                    RiggingClipValidator.AddUnavailableChecks(request == null ? null : request.Clips, report);
                    RiggingVariantValidator.Validate(null, request == null ? null : request.Variants, report);
                    return;
                }

                try
                {
                    root = PrefabUtility.LoadPrefabContents(prefabPath);
                }
                catch (Exception)
                {
                    RiggingValidationReportBuilder.AddCheck(report, "prefab-load", "asset", "FAIL",
                        "Unity 无法在临时内容场景中加载指定 Prefab。");
                    AddPrefabInspectionBlockedChecks(report, "Prefab 内容不可用。");
                    RiggingClipValidator.AddUnavailableChecks(request == null ? null : request.Clips, report);
                    RiggingVariantValidator.Validate(null, request == null ? null : request.Variants, report);
                    return;
                }

                loaded = root != null;
                RiggingValidationReportBuilder.AddCheck(report, "prefab-load", "asset",
                    loaded ? "PASS" : "FAIL",
                    loaded ? "Prefab 已在临时内容场景中只读加载。" : "Unity 未能从指定路径加载 Prefab 内容。");
                if (!loaded)
                {
                    AddPrefabInspectionBlockedChecks(report, "Prefab 内容不可用。");
                    RiggingClipValidator.AddUnavailableChecks(request == null ? null : request.Clips, report);
                    RiggingVariantValidator.Validate(null, request == null ? null : request.Variants, report);
                    return;
                }

                RiggingValidationEvidenceBuilder.AddSourceEvidence(report, prefabPath, root, request);

                try
                {
                    ValidateRequiredComponents(root, request, report);
                }
                catch (Exception)
                {
                    RiggingValidationReportBuilder.AddCheck(report, "prefab-inspection", "asset", "FAIL",
                        "Prefab 工程数据检查意外中断；报告不包含底层异常文本或环境路径。");
                }
            }
            finally
            {
                if (loaded && root != null)
                {
                    try
                    {
                        PrefabUtility.UnloadPrefabContents(root);
                        RiggingValidationReportBuilder.AddCheck(report, "prefab-unload", "asset", "PASS",
                            "临时 Prefab 内容已在检查结束时卸载。");
                    }
                    catch (Exception)
                    {
                        RiggingValidationReportBuilder.AddCheck(report, "prefab-unload", "asset", "FAIL",
                            "Unity 未能卸载临时 Prefab 内容。");
                    }
                }
            }
        }

        /// <summary>检查角色 SpriteSkin、骨骼网格、唯一 Animator、Controller 与变体。</summary>
        /// <param name="root">临时加载的角色 Prefab 根节点。</param>
        /// <param name="request">动画与变体检查要求。</param>
        /// <param name="report">接收结果的报告。</param>
        private static void ValidateRequiredComponents(GameObject root, RiggingValidationRequest request, QualityReportDto report)
        {
            int missingScriptCount = CountMissingScripts(root);
            RiggingValidationReportBuilder.AddCheck(report, "prefab-missing-scripts", "asset",
                missingScriptCount == 0 ? "PASS" : "FAIL",
                missingScriptCount == 0
                    ? "角色 Prefab 层级未发现缺失的 MonoBehaviour 脚本引用。"
                    : $"角色 Prefab 层级中发现 {missingScriptCount} 个缺失的 MonoBehaviour 脚本引用。");

            SpriteSkin[] skins = root.GetComponentsInChildren<SpriteSkin>(true);
            RiggingValidationReportBuilder.AddCheck(report, "sprite-skin-presence", "rigging",
                skins.Length > 0 ? "PASS" : "FAIL",
                skins.Length > 0
                    ? $"角色层级中发现 {skins.Length} 个 SpriteSkin，逐个检查 Sprite 网格和骨骼映射。"
                    : "角色 Prefab 不含 SpriteSkin，不能判定为有效骨骼角色。");

            for (int index = 0; index < skins.Length; index++)
            {
                SpriteSkin skin = skins[index];
                string prefix = "skin-" + index.ToString("D2");
                SpriteRenderer renderer = skin == null ? null : skin.GetComponent<SpriteRenderer>();
                Sprite sprite = renderer == null ? null : renderer.sprite;
                RiggingSpriteData data = RiggingSpriteMeshValidator.ValidateSprite(sprite, prefix, report);
                RiggingSpriteMeshValidator.ValidateSkinMapping(skin, root, data, prefix, report);
            }

            Animator[] animators = root.GetComponentsInChildren<Animator>(true);
            bool uniqueAnimator = animators.Length == 1;
            RiggingValidationReportBuilder.AddCheck(report, "animator-presence", "animation",
                uniqueAnimator ? "PASS" : "FAIL",
                uniqueAnimator
                    ? "角色层级中存在唯一 Animator，可确定动画绑定根节点。"
                    : $"角色层级应包含唯一 Animator；当前发现 {animators.Length} 个，无法可靠确定角色动画根节点。");

            if (!uniqueAnimator)
            {
                RiggingValidationReportBuilder.AddCheck(report, "animator-controller", "animation", "FAIL",
                    "Animator 数量不是一，无法确定唯一的运行时 Controller。");
                RiggingClipValidator.AddUnavailableChecks(request == null ? null : request.Clips, report);
            }
            else
            {
                Animator animator = animators[0];
                RuntimeAnimatorController controller = animator.runtimeAnimatorController;
                bool hasController = controller != null;
                RiggingValidationReportBuilder.AddCheck(report, "animator-controller", "animation",
                    hasController ? "PASS" : "FAIL",
                    hasController ? "唯一 Animator 已引用运行时 Controller。" : "唯一 Animator 没有运行时 Controller。");
                RiggingClipValidator.Validate(animator, controller, request == null ? null : request.Clips, report);
            }

            RiggingVariantValidator.Validate(root, request == null ? null : request.Variants, report);
        }

        /// <summary>只统计 Unity 明确标记的缺失 MonoBehaviour 引用，不推断可选字段的空值。</summary>
        /// <param name="root">临时加载的角色 Prefab 根节点。</param>
        /// <returns>角色层级中缺失脚本引用总数。</returns>
        private static int CountMissingScripts(GameObject root)
        {
            int count = 0;
            Transform[] transforms = root.GetComponentsInChildren<Transform>(true);
            foreach (Transform transform in transforms)
            {
                if (transform != null)
                {
                    count += GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(transform.gameObject);
                }
            }

            return count;
        }

        /// <summary>Prefab 不可读取时，为必需组件记录阻断状态。</summary>
        /// <param name="report">接收结果的报告。</param>
        /// <param name="reason">当前阻断原因。</param>
        private static void AddPrefabInspectionBlockedChecks(QualityReportDto report, string reason)
        {
            RiggingValidationReportBuilder.AddCheck(report, "sprite-skin-presence", "rigging", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, "animator-presence", "animation", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, "animator-controller", "animation", "BLOCKED", reason);
        }
    }
}
