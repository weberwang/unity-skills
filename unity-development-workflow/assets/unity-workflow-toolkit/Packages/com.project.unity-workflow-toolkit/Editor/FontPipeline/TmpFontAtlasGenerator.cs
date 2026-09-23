using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Project.UnityWorkflow.Runtime;
using TMPro;
using UnityEditor;
using UnityEditor.Localization;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.Localization.Tables;

namespace Project.UnityWorkflow.FontPipeline
{
    /// <summary>
    /// 从项目 String Tables 汇总五语言字形，生成静态 TMP 图集并配置文本绑定器。
    /// </summary>
    public static class TmpFontAtlasGenerator
    {
        private static readonly string[] RequiredLocales = { "en", "zh-CN", "ja", "ru", "es" };

        /// <summary>使用项目窗口选中的计划执行生成和应用。</summary>
        [MenuItem("Tools/Unity Workflow/Build TMP Font Atlases")]
        public static void BuildSelectedPlan()
        {
            if (Selection.activeObject is not TmpFontAtlasPlan plan)
            {
                throw new InvalidOperationException("请先选中 TmpFontAtlasPlan 资产。");
            }

            GenerateAndApply(plan);
        }

        /// <summary>构建缺失的内容寻址字体资产，再应用到计划列出的绑定器。</summary>
        public static void GenerateAndApply(TmpFontAtlasPlan plan)
        {
            ValidatePlan(plan);
            var targets = new HashSet<LocalizedTmpFontBinder>(plan.Targets);
            // ScriptableObject 无法持久引用场景实例，因此同时处理当前已打开场景中的绑定器。
            foreach (LocalizedTmpFontBinder sceneTarget in UnityEngine.Object.FindObjectsByType<LocalizedTmpFontBinder>(
                         FindObjectsInactive.Include, FindObjectsSortMode.None))
            {
                if (sceneTarget.gameObject.scene.IsValid())
                {
                    targets.Add(sceneTarget);
                }
            }

            if (targets.Count == 0)
            {
                throw new InvalidOperationException("请在计划中列出 Prefab 绑定器，或打开包含字体绑定器的场景。");
            }

            Dictionary<string, SortedSet<uint>> tableCharacters = CollectStringTableCharacters();
            var prepared = new List<(TmpFontAtlasGroup Group, uint[] Characters)>();

            foreach (TmpFontAtlasGroup group in plan.Groups)
            {
                var characters = new SortedSet<uint>();
                foreach (string localeCode in group.LocaleCodes)
                {
                    if (!tableCharacters.TryGetValue(localeCode, out SortedSet<uint> localeCharacters)
                        || localeCharacters.Count == 0)
                    {
                        throw new InvalidOperationException($"{localeCode} 没有 String Table 文案，不能生成可验证的字体图集。");
                    }

                    characters.UnionWith(localeCharacters);
                }

                foreach (TextAsset extra in group.ExtraCharacterFiles ?? Array.Empty<TextAsset>())
                {
                    if (extra != null)
                    {
                        AddCharacters(characters, extra.text);
                    }
                }

                prepared.Add((group, characters.ToArray()));
            }

            EnsureOutputFolder(plan.OutputFolder);
            var localeFonts = new List<LocalizedTmpFontEntry>();
            foreach (var item in prepared)
            {
                TMP_FontAsset fontAsset = GetOrCreateStaticFont(plan.OutputFolder, item.Group, item.Characters);
                foreach (string localeCode in item.Group.LocaleCodes)
                {
                    localeFonts.Add(new LocalizedTmpFontEntry(localeCode, fontAsset));
                }
            }

            // 全部图集通过字形检查后才修改目标组件，避免缺字时只应用一半语言。
            foreach (LocalizedTmpFontBinder target in targets)
            {
                Undo.RecordObject(target, "应用多语言 TMP 字体");
                target.Configure(localeFonts);
                EditorUtility.SetDirty(target);
                PrefabUtility.RecordPrefabInstancePropertyModifications(target);
                if (target.gameObject.scene.IsValid())
                {
                    EditorSceneManager.MarkSceneDirty(target.gameObject.scene);
                }
            }

            AssetDatabase.SaveAssets();
            Debug.Log($"TMP 字体图集已生成并应用：{prepared.Count} 组，{targets.Count} 个绑定器。", plan);
        }

        /// <summary>验证路径、语言、源字体和目标，禁止生成阶段才发现计划不完整。</summary>
        private static void ValidatePlan(TmpFontAtlasPlan plan)
        {
            if (plan == null || plan.Groups == null || plan.Groups.Length == 0 || plan.Targets == null)
            {
                throw new InvalidOperationException("字体计划必须包含字体分组和非空目标数组。");
            }

            string folder = plan.OutputFolder;
            if (string.IsNullOrWhiteSpace(folder) || !folder.StartsWith("Assets/", StringComparison.Ordinal)
                || folder.Contains("..") || folder.Contains('\\') || folder.Contains("//"))
            {
                throw new InvalidOperationException("字体输出目录必须是 Assets/ 下的规范项目路径。");
            }

            var seenLocales = new HashSet<string>(StringComparer.Ordinal);
            var seenNames = new HashSet<string>(StringComparer.Ordinal);
            foreach (TmpFontAtlasGroup group in plan.Groups)
            {
                if (group == null || string.IsNullOrWhiteSpace(group.AssetName)
                    || group.AssetName.Any(character => !char.IsLetterOrDigit(character) && character != '-' && character != '_')
                    || !seenNames.Add(group.AssetName))
                {
                    throw new InvalidOperationException("字体分组名称必须唯一且仅含字母、数字、横线或下划线。");
                }

                if (group.SourceFont == null || !AssetDatabase.GetAssetPath(group.SourceFont).StartsWith("Assets/", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException($"{group.AssetName} 必须引用项目 Assets 内的完整源字体文件。");
                }

                if (group.LocaleCodes == null || group.LocaleCodes.Length == 0 || group.SamplingPointSize <= 0
                    || group.Padding < 0 || group.AtlasSize < 256 || group.AtlasSize > 4096)
                {
                    throw new InvalidOperationException($"{group.AssetName} 的语言或图集参数无效。");
                }

                if (group.DynamicFallback != null
                    && group.DynamicFallback.atlasPopulationMode != AtlasPopulationMode.Dynamic)
                {
                    throw new InvalidOperationException($"{group.AssetName} 的可选回退字体必须为 Dynamic TMP_FontAsset。");
                }

                foreach (string code in group.LocaleCodes)
                {
                    if (!RequiredLocales.Contains(code) || !seenLocales.Add(code))
                    {
                        throw new InvalidOperationException($"字体计划出现重复或不支持的语言：{code}。");
                    }
                }
            }

            if (!seenLocales.SetEquals(RequiredLocales) || plan.Targets.Any(target => target == null))
            {
                throw new InvalidOperationException("字体计划必须且只能覆盖 en、zh-CN、ja、ru、es，目标不能缺失。");
            }
        }

        /// <summary>汇总所有 String Table 中的可见文字，Smart String 占位符交由额外字符文件覆盖。</summary>
        private static Dictionary<string, SortedSet<uint>> CollectStringTableCharacters()
        {
            var result = new Dictionary<string, SortedSet<uint>>(StringComparer.Ordinal);
            foreach (StringTableCollection collection in LocalizationEditorSettings.GetStringTableCollections())
            {
                foreach (StringTable table in collection.StringTables)
                {
                    string code = CanonicalLocale(table.LocaleIdentifier.Code);
                    if (code == null)
                    {
                        continue;
                    }

                    if (!result.TryGetValue(code, out SortedSet<uint> characters))
                    {
                        characters = new SortedSet<uint>();
                        result.Add(code, characters);
                    }

                    AddCharacters(characters, table.GenerateCharacterSet());
                }
            }

            return result;
        }

        /// <summary>将 Unity Locale 代码映射到本工作流要求的五种语言。</summary>
        private static string CanonicalLocale(string code)
        {
            if (string.IsNullOrWhiteSpace(code))
            {
                return null;
            }

            if (code.Equals("zh-CN", StringComparison.OrdinalIgnoreCase)
                || code.StartsWith("zh-CN-", StringComparison.OrdinalIgnoreCase)
                || code.Equals("zh-Hans", StringComparison.OrdinalIgnoreCase)
                || code.StartsWith("zh-Hans-", StringComparison.OrdinalIgnoreCase))
            {
                return "zh-CN";
            }

            foreach (string locale in RequiredLocales)
            {
                if (locale == "zh-CN")
                {
                    continue;
                }

                if (code.Equals(locale, StringComparison.OrdinalIgnoreCase)
                    || code.StartsWith(locale + "-", StringComparison.OrdinalIgnoreCase))
                {
                    return locale;
                }
            }

            return null;
        }

        /// <summary>按 Unicode 码点去重，保留非 BMP 字符并略过控制字符。</summary>
        private static void AddCharacters(SortedSet<uint> characters, string text)
        {
            for (int index = 0; index < text.Length; index++)
            {
                char current = text[index];
                if (char.IsControl(current))
                {
                    continue;
                }

                if (char.IsHighSurrogate(current) && index + 1 < text.Length && char.IsLowSurrogate(text[index + 1]))
                {
                    characters.Add((uint)char.ConvertToUtf32(current, text[++index]));
                }
                else if (!char.IsSurrogate(current))
                {
                    characters.Add(current);
                }
            }
        }

        /// <summary>按源文件和实际字符生成内容寻址资产，重复执行不会覆盖已有 GUID。</summary>
        private static TMP_FontAsset GetOrCreateStaticFont(string folder, TmpFontAtlasGroup group, uint[] characters)
        {
            string sourcePath = AssetDatabase.GetAssetPath(group.SourceFont);
            string fallbackPath = group.DynamicFallback == null ? null : AssetDatabase.GetAssetPath(group.DynamicFallback);
            // GUID 不会随源字体文件内容变化；依赖哈希确保替换字体后生成新的静态图集。
            string sourceHash = AssetDatabase.GetAssetDependencyHash(sourcePath).ToString();
            string fallbackHash = fallbackPath == null ? "none" : AssetDatabase.GetAssetDependencyHash(fallbackPath).ToString();
            string signature = string.Join("|", sourceHash, fallbackHash, group.SamplingPointSize,
                group.Padding, group.AtlasSize, string.Join(",", characters));
            byte[] digest;
            using (SHA256 sha256 = SHA256.Create())
            {
                digest = sha256.ComputeHash(Encoding.UTF8.GetBytes(signature));
            }
            string hash = BitConverter.ToString(digest).Replace("-", string.Empty).Substring(0, 12).ToLowerInvariant();
            string path = $"{folder}/{group.AssetName}-{hash}.asset";

            if (AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(path) is TMP_FontAsset existing)
            {
                if (existing.atlasPopulationMode != AtlasPopulationMode.Static
                    || characters.Any(character => !existing.HasCharacter((int)character))
                    || (group.DynamicFallback != null && !existing.fallbackFontAssetTable.Contains(group.DynamicFallback))
                    || (group.DynamicFallback == null && existing.fallbackFontAssetTable.Count != 0))
                {
                    throw new InvalidDataException($"已有图集内容不匹配：{path}。");
                }

                return existing;
            }

            if (AssetDatabase.LoadMainAssetAtPath(path) != null)
            {
                throw new InvalidDataException($"目标路径已被其他资产占用：{path}。");
            }

            TMP_FontAsset generated = TMP_FontAsset.CreateFontAsset(group.SourceFont,
                group.SamplingPointSize, group.Padding, GlyphRenderMode.SDFAA,
                group.AtlasSize, group.AtlasSize, AtlasPopulationMode.Dynamic, true);
            if (generated == null)
            {
                throw new InvalidOperationException($"无法读取 {group.AssetName} 源字体，请检查 Import Settings 的 Include Font Data。");
            }

            // 先在动态模式填满已知文案，再冻结为 Static；未知玩家输入才使用可选动态回退。
            if (!generated.TryAddCharacters(characters, out uint[] missing, true))
            {
                UnityEngine.Object.DestroyImmediate(generated);
                throw new InvalidOperationException($"{group.AssetName} 源字体缺字或图集容量不足：{string.Join(",", missing.Select(value => $"U+{value:X}"))}。");
            }

            generated.atlasPopulationMode = AtlasPopulationMode.Static;
            if (group.DynamicFallback != null)
            {
                generated.fallbackFontAssetTable.Add(group.DynamicFallback);
            }

            if (generated.material == null || generated.atlasTextures == null || generated.atlasTextures.Length == 0)
            {
                UnityEngine.Object.DestroyImmediate(generated);
                throw new InvalidOperationException($"{group.AssetName} 没有生成 TMP 材质或图集纹理，请确认 TMP 资源可用。");
            }

            AssetDatabase.CreateAsset(generated, path);
            foreach (Texture2D texture in generated.atlasTextures)
            {
                AssetDatabase.AddObjectToAsset(texture, generated);
                EditorUtility.SetDirty(texture);
            }

            generated.material.mainTexture = generated.atlasTexture;
            AssetDatabase.AddObjectToAsset(generated.material, generated);
            EditorUtility.SetDirty(generated.material);
            EditorUtility.SetDirty(generated);
            AssetDatabase.SaveAssets();

            UnityEngine.Object[] saved = AssetDatabase.LoadAllAssetsAtPath(path);
            if (!saved.Any(asset => asset is Material) || !saved.Any(asset => asset is Texture2D))
            {
                AssetDatabase.DeleteAsset(path);
                throw new InvalidDataException($"{path} 未持久化 TMP 材质或字形图集。");
            }

            return generated;
        }

        /// <summary>在 Assets 内逐级建立计划指定的输出目录。</summary>
        private static void EnsureOutputFolder(string folder)
        {
            string current = "Assets";
            foreach (string part in folder.Substring("Assets/".Length).Split('/'))
            {
                string next = current + "/" + part;
                if (!AssetDatabase.IsValidFolder(next))
                {
                    AssetDatabase.CreateFolder(current, part);
                }

                current = next;
            }
        }
    }
}
