using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Localization;
using UnityEngine.Localization.Settings;

namespace Project.UnityWorkflow.Runtime
{
    /// <summary>
    /// 保存某个语言标签对应的 TextMesh Pro 字体资产。
    /// </summary>
    [Serializable]
    public sealed class LocalizedTmpFontEntry
    {
        [SerializeField] private string localeCode;
        [SerializeField] private TMP_FontAsset fontAsset;

        /// <summary>
        /// 使用语言标签和字体资产创建映射项。
        /// </summary>
        /// <param name="localeCode">语言标签，例如 en、zh-CN、ja、ru 或 es。</param>
        /// <param name="fontAsset">该语言使用的 TextMesh Pro 字体资产。</param>
        public LocalizedTmpFontEntry(string localeCode, TMP_FontAsset fontAsset)
        {
            this.localeCode = localeCode;
            this.fontAsset = fontAsset;
        }

        /// <summary>获取配置的语言标签。</summary>
        public string LocaleCode => localeCode;

        /// <summary>获取配置的 TextMesh Pro 字体资产。</summary>
        public TMP_FontAsset FontAsset => fontAsset;
    }

    /// <summary>
    /// 根据 Unity Localization 当前语言，为同一 GameObject 上的 TMP_Text 切换字体。
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class LocalizedTmpFontBinder : MonoBehaviour
    {
        [SerializeField] private List<LocalizedTmpFontEntry> fontEntries = new List<LocalizedTmpFontEntry>();

        private readonly Dictionary<string, TMP_FontAsset> fontAssetsByLanguage = new Dictionary<string, TMP_FontAsset>(StringComparer.OrdinalIgnoreCase);
        private TMP_Text targetText;
        private string lastUnmappedLocaleCode;

        /// <summary>
        /// 替换语言字体映射。重复或不支持的语言标签、空字体资产会明确抛出参数异常。
        /// </summary>
        /// <param name="entries">需要应用的语言标签与字体资产映射。</param>
        public void Configure(IReadOnlyList<LocalizedTmpFontEntry> entries)
        {
            var copiedEntries = CopyEntries(entries);
            var fontMap = BuildFontMap(copiedEntries);

            fontEntries = copiedEntries;
            fontAssetsByLanguage.Clear();
            foreach (var pair in fontMap)
            {
                fontAssetsByLanguage.Add(pair.Key, pair.Value);
            }

            lastUnmappedLocaleCode = null;
            if (isActiveAndEnabled && targetText != null)
            {
                ApplySelectedLocale();
            }
        }

        /// <summary>启用时缓存文本组件、读取序列化映射并订阅语言切换事件。</summary>
        private void OnEnable()
        {
            targetText = GetComponent<TMP_Text>();
            if (targetText == null)
            {
                Debug.LogError("LocalizedTmpFontBinder 需要与 TMP_Text 挂在同一个 GameObject 上。", this);
                return;
            }

            try
            {
                ReplaceRuntimeMap(BuildFontMap(fontEntries));
            }
            catch (ArgumentException exception)
            {
                fontAssetsByLanguage.Clear();
                Debug.LogError($"LocalizedTmpFontBinder 的字体映射无效：{exception.Message}", this);
            }

            LocalizationSettings.SelectedLocaleChanged += HandleSelectedLocaleChanged;
            ApplySelectedLocale();
        }

        /// <summary>禁用时取消语言切换订阅，避免静态事件持有组件。</summary>
        private void OnDisable()
        {
            LocalizationSettings.SelectedLocaleChanged -= HandleSelectedLocaleChanged;
            targetText = null;
        }

        /// <summary>Localization 选择语言后立即应用对应字体。</summary>
        /// <param name="locale">新选择的语言；空值会保留当前字体并记录错误。</param>
        private void HandleSelectedLocaleChanged(Locale locale)
        {
            if (locale == null)
            {
                Debug.LogError("Unity Localization 切换到了空 Locale；保留 TMP_Text 当前字体。", this);
                return;
            }

            ApplyLocaleCode(locale.Identifier.Code);
        }

        /// <summary>读取当前选择的 Locale 并应用字体映射。</summary>
        private void ApplySelectedLocale()
        {
            var locale = LocalizationSettings.SelectedLocale;
            if (locale == null)
            {
                WarnUnmappedLocale("<未选择>");
                return;
            }

            ApplyLocaleCode(locale.Identifier.Code);
        }

        /// <summary>将具体 Locale 标签归一化为受支持的语言，并应用对应字体。</summary>
        /// <param name="localeCode">Unity Localization 提供的 Locale 标识。</param>
        private void ApplyLocaleCode(string localeCode)
        {
            if (targetText == null)
            {
                return;
            }

            if (TryNormalizeLocaleCode(localeCode, out var languageCode)
                && fontAssetsByLanguage.TryGetValue(languageCode, out var fontAsset))
            {
                targetText.font = fontAsset;
                lastUnmappedLocaleCode = null;
                return;
            }

            // 缺少映射或遇到繁体中文时保留已有字体，并提示配置问题，避免误套用另一语言的资产。
            WarnUnmappedLocale(localeCode);
        }

        /// <summary>只接受支持的语言族，并转换为映射表使用的规范键。</summary>
        /// <param name="localeCode">待解析的 BCP-47 风格语言标签。</param>
        /// <param name="normalizedCode">输出的规范键，失败时为空字符串。</param>
        /// <returns>标签属于支持的语言族时返回 true。</returns>
        private static bool TryNormalizeLocaleCode(string localeCode, out string normalizedCode)
        {
            normalizedCode = string.Empty;
            if (string.IsNullOrWhiteSpace(localeCode))
            {
                return false;
            }

            var parts = localeCode.Trim().Replace('_', '-').Split('-');
            for (var index = 0; index < parts.Length; index++)
            {
                if (string.IsNullOrWhiteSpace(parts[index]))
                {
                    return false;
                }
            }

            var language = parts[0];
            if (string.Equals(language, "zh", StringComparison.OrdinalIgnoreCase))
            {
                // 任何显式 Hant 标签都不进入简体中文映射，避免 zh-Hant 被当作 zh-CN。
                for (var index = 1; index < parts.Length; index++)
                {
                    if (string.Equals(parts[index], "Hant", StringComparison.OrdinalIgnoreCase))
                    {
                        return false;
                    }
                }

                if (parts.Length > 1
                    && (string.Equals(parts[1], "Hans", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(parts[1], "CN", StringComparison.OrdinalIgnoreCase)))
                {
                    normalizedCode = "zh-CN";
                    return true;
                }

                return false;
            }

            if (string.Equals(language, "en", StringComparison.OrdinalIgnoreCase)
                || string.Equals(language, "ja", StringComparison.OrdinalIgnoreCase)
                || string.Equals(language, "ru", StringComparison.OrdinalIgnoreCase)
                || string.Equals(language, "es", StringComparison.OrdinalIgnoreCase))
            {
                normalizedCode = language.ToLowerInvariant();
                return true;
            }

            return false;
        }

        /// <summary>构建并校验规范语言键到字体资产的运行时映射。</summary>
        /// <param name="entries">输入映射项。</param>
        /// <returns>规范语言键到字体资产的映射。</returns>
        private static Dictionary<string, TMP_FontAsset> BuildFontMap(IReadOnlyList<LocalizedTmpFontEntry> entries)
        {
            if (entries == null)
            {
                throw new ArgumentNullException(nameof(entries));
            }

            var result = new Dictionary<string, TMP_FontAsset>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < entries.Count; index++)
            {
                var entry = entries[index];
                if (entry == null)
                {
                    throw new ArgumentException($"字体映射第 {index} 项为空。", nameof(entries));
                }

                if (!TryNormalizeLocaleCode(entry.LocaleCode, out var normalizedCode))
                {
                    throw new ArgumentException($"不支持或无法识别语言标签“{entry.LocaleCode}”。", nameof(entries));
                }

                if (entry.FontAsset == null)
                {
                    throw new ArgumentException($"语言“{entry.LocaleCode}”没有配置 TMP_FontAsset。", nameof(entries));
                }

                if (result.ContainsKey(normalizedCode))
                {
                    throw new ArgumentException($"多个字体映射归一化到了“{normalizedCode}”；每种语言只能配置一个字体。", nameof(entries));
                }

                result.Add(normalizedCode, entry.FontAsset);
            }

            return result;
        }

        /// <summary>复制配置项，避免外部列表后续变动影响组件序列化状态。</summary>
        /// <param name="entries">待复制的配置项。</param>
        /// <returns>组件持有的独立配置列表。</returns>
        private static List<LocalizedTmpFontEntry> CopyEntries(IReadOnlyList<LocalizedTmpFontEntry> entries)
        {
            if (entries == null)
            {
                throw new ArgumentNullException(nameof(entries));
            }

            var copy = new List<LocalizedTmpFontEntry>(entries.Count);
            for (var index = 0; index < entries.Count; index++)
            {
                var entry = entries[index];
                copy.Add(entry == null ? null : new LocalizedTmpFontEntry(entry.LocaleCode, entry.FontAsset));
            }

            return copy;
        }

        /// <summary>以已校验的字体映射替换运行时缓存。</summary>
        /// <param name="fontMap">新运行时映射。</param>
        private void ReplaceRuntimeMap(Dictionary<string, TMP_FontAsset> fontMap)
        {
            fontAssetsByLanguage.Clear();
            foreach (var pair in fontMap)
            {
                fontAssetsByLanguage.Add(pair.Key, pair.Value);
            }
        }

        /// <summary>对当前 Locale 缺少字体映射时只提示一次，并保留文本当前字体。</summary>
        /// <param name="localeCode">未映射的 Locale 标签。</param>
        private void WarnUnmappedLocale(string localeCode)
        {
            var displayCode = string.IsNullOrWhiteSpace(localeCode) ? "<空>" : localeCode;
            if (string.Equals(lastUnmappedLocaleCode, displayCode, StringComparison.Ordinal))
            {
                return;
            }

            lastUnmappedLocaleCode = displayCode;
            Debug.LogWarning($"Locale“{displayCode}”没有可用的 TMP 字体映射；保留 TMP_Text 当前字体。请检查语言资产配置。", this);
        }
    }
}
