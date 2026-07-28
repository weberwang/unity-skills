using System;
using System.Collections.Generic;
using Project.UnityWorkflow.Runtime;
using UnityEngine;

namespace Project.UnityWorkflow.ProjectValidation
{
    /// <summary>
    /// 保存单个 2D 适配组件的校验问题。
    /// </summary>
    [Serializable]
    public sealed class Scene2DAdaptationValidationIssue
    {
        /// <summary>获取或设置组件对象名称。</summary>
        public string ObjectName = string.Empty;

        /// <summary>获取或设置阻止场景通过的问题说明。</summary>
        public string Message = string.Empty;
    }

    /// <summary>
    /// 对场景中的 2D 适配组件执行无写入的严格配置校验。
    /// </summary>
    public sealed class Scene2DAdaptationValidationService
    {
        /// <summary>
        /// 校验所有传入组件，缺少组件时也返回失败，防止 2D 场景静默跳过适配。
        /// </summary>
        public Scene2DAdaptationValidationIssue[] Validate(IEnumerable<Adaptive2DViewport> viewports)
        {
            if (viewports == null)
            {
                return new[] { CreateIssue("Scene", "未提供 2D 适配组件。") };
            }

            List<Scene2DAdaptationValidationIssue> issues = new List<Scene2DAdaptationValidationIssue>();
            int count = 0;
            foreach (Adaptive2DViewport viewport in viewports)
            {
                count++;
                if (viewport == null)
                {
                    issues.Add(CreateIssue("Missing", "2D 适配组件引用为空。"));
                    continue;
                }

                if (!viewport.TryValidateConfiguration(out string error))
                {
                    issues.Add(CreateIssue(viewport.gameObject.name, error));
                    continue;
                }

                if (!HasOpaqueSpriteCoverage(viewport.FirstDecorativeBand, viewport.MinimumVisibleAlpha, out error) ||
                    !HasOpaqueSpriteCoverage(viewport.SecondDecorativeBand, viewport.MinimumVisibleAlpha, out error))
                {
                    issues.Add(CreateIssue(viewport.gameObject.name, error));
                }
            }

            if (count == 0)
            {
                issues.Add(CreateIssue("Scene", "2D 场景必须包含 Adaptive2DViewport。"));
            }

            return issues.ToArray();
        }

        /// <summary>
        /// 扫描 Sprite 实际纹理区域，阻止完全透明或几乎透明的图片伪装成背景。
        /// </summary>
        private static bool HasOpaqueSpriteCoverage(
            SpriteRenderer renderer,
            float minimumAlpha,
            out string error)
        {
            Texture2D texture = renderer.sprite.texture;
            if (!texture.isReadable)
            {
                error = "边带纹理必须开启 Read/Write，才能生成 Alpha 覆盖率机器证据。";
                return false;
            }

            Rect rect;
            try
            {
                rect = renderer.sprite.textureRect;
            }
            catch (UnityException)
            {
                error = "边带 Sprite 不得使用无法独立读取的紧密图集。";
                return false;
            }
            int startX = Mathf.Clamp(Mathf.FloorToInt(rect.x), 0, texture.width - 1);
            int startY = Mathf.Clamp(Mathf.FloorToInt(rect.y), 0, texture.height - 1);
            int endX = Mathf.Clamp(Mathf.CeilToInt(rect.xMax), startX + 1, texture.width);
            int endY = Mathf.Clamp(Mathf.CeilToInt(rect.yMax), startY + 1, texture.height);
            Color32[] pixels = texture.GetPixels32();
            int visiblePixels = 0;
            int totalPixels = 0;
            byte minimumAlphaByte = (byte)Mathf.Clamp(Mathf.CeilToInt(minimumAlpha * 255f), 1, 255);
            for (int y = startY; y < endY; y++)
            {
                for (int x = startX; x < endX; x++)
                {
                    totalPixels++;
                    if (pixels[y * texture.width + x].a >= minimumAlphaByte)
                    {
                        visiblePixels++;
                    }
                }
            }

            // 背景必须近乎全不透明，避免局部透明区域露出摄像机清屏色形成黑边。
            if (totalPixels == 0 || (float)visiblePixels / totalPixels < 0.99f)
            {
                error = "边带 Sprite 的有效 Alpha 覆盖率低于 99%。";
                return false;
            }

            error = string.Empty;
            return true;
        }

        /// <summary>
        /// 创建稳定字段结构的校验问题。
        /// </summary>
        private static Scene2DAdaptationValidationIssue CreateIssue(string objectName, string message)
        {
            return new Scene2DAdaptationValidationIssue
            {
                ObjectName = objectName,
                Message = message
            };
        }
    }
}
