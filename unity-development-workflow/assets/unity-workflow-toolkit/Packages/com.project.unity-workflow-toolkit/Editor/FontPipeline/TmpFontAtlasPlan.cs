using System;
using Project.UnityWorkflow.Runtime;
using TMPro;
using UnityEngine;

namespace Project.UnityWorkflow.FontPipeline
{
    /// <summary>
    /// 描述共用一份静态字形图集的语言和源字体。
    /// </summary>
    [Serializable]
    public sealed class TmpFontAtlasGroup
    {
        [SerializeField] private string assetName;
        [SerializeField] private string[] localeCodes;
        [SerializeField] private Font sourceFont;
        [SerializeField] private TMP_FontAsset dynamicFallback;
        [SerializeField] private TextAsset[] extraCharacterFiles;
        [SerializeField] private int samplingPointSize = 48;
        [SerializeField] private int padding = 5;
        [SerializeField] private int atlasSize = 2048;

        /// <summary>获取生成资产的稳定名称。</summary>
        public string AssetName => assetName;

        /// <summary>获取共用字形的语言代码。</summary>
        public string[] LocaleCodes => localeCodes;

        /// <summary>获取已导入 Unity 的完整源字体。</summary>
        public Font SourceFont => sourceFont;

        /// <summary>获取可选的动态 TMP 回退字体。</summary>
        public TMP_FontAsset DynamicFallback => dynamicFallback;

        /// <summary>获取表格之外还可能出现的固定文字。</summary>
        public TextAsset[] ExtraCharacterFiles => extraCharacterFiles;

        /// <summary>获取图集采样字号。</summary>
        public int SamplingPointSize => samplingPointSize;

        /// <summary>获取 SDF 字形边距。</summary>
        public int Padding => padding;

        /// <summary>获取方形图集的边长。</summary>
        public int AtlasSize => atlasSize;
    }

    /// <summary>
    /// 保存五语言 TMP 字体生成和应用所需的项目配置。
    /// </summary>
    [CreateAssetMenu(fileName = "TmpFontAtlasPlan", menuName = "Unity Workflow/TMP Font Atlas Plan")]
    public sealed class TmpFontAtlasPlan : ScriptableObject
    {
        [SerializeField] private string outputFolder = "Assets/UI/Fonts/Generated";
        [SerializeField] private TmpFontAtlasGroup[] groups;
        [SerializeField] private LocalizedTmpFontBinder[] targets;

        /// <summary>获取生成资产的项目内文件夹。</summary>
        public string OutputFolder => outputFolder;

        /// <summary>获取按字体分组的语言配置。</summary>
        public TmpFontAtlasGroup[] Groups => groups;

        /// <summary>获取要配置的 Prefab 文本绑定器；已打开场景的绑定器由生成器自动发现。</summary>
        public LocalizedTmpFontBinder[] Targets => targets;
    }
}
