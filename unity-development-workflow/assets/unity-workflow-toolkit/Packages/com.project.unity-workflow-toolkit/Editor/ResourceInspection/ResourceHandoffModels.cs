using System;
using System.Collections.Generic;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>描述要从当前 Unity 工程读取的资源与序列帧交接事实。</summary>
    [Serializable]
    public sealed class ResourceHandoffInspectionRequest
    {
        /// <summary>交接契约版本。</summary>
        public string schemaVersion = "1.0";

        /// <summary>触发本次只读检查的工作项 ID。</summary>
        public string taskId = string.Empty;

        /// <summary>项目内新 JSON 报告路径。</summary>
        public string outputPath = string.Empty;

        /// <summary>需要检查实际导入路径与加载入口的资源。</summary>
        public List<ResourceHandoffAssetRequest> assets = new List<ResourceHandoffAssetRequest>();

        /// <summary>需要读取实际 Sprite 曲线与 Prefab 消费者的动画。</summary>
        public List<ResourceHandoffAnimationRequest> animations = new List<ResourceHandoffAnimationRequest>();
    }

    /// <summary>标识一个正式资源登记项对应的 Unity 资产路径。</summary>
    [Serializable]
    public sealed class ResourceHandoffAssetRequest
    {
        /// <summary>资产登记表中的稳定资源 ID。</summary>
        public string resourceId = string.Empty;

        /// <summary>项目内 Assets 路径。</summary>
        public string assetPath = string.Empty;
    }

    /// <summary>描述一个序列帧片段、Sprite 绑定和实际 Prefab 消费者。</summary>
    [Serializable]
    public sealed class ResourceHandoffAnimationRequest
    {
        /// <summary>动画计划中的稳定动画 ID。</summary>
        public string animationId = string.Empty;

        /// <summary>项目内 AnimationClip 路径。</summary>
        public string clipPath = string.Empty;

        /// <summary>项目内消费该动画的 Prefab 路径。</summary>
        public string consumerPrefabPath = string.Empty;

        /// <summary>实际消费者组件类型，只允许 Animator 或 Animation。</summary>
        public string consumerComponent = string.Empty;

        /// <summary>动画根节点下的相对绑定路径；空字符串代表根节点。</summary>
        public string bindingPath = string.Empty;

        /// <summary>曲线所绑定的 SpriteRenderer 或 uGUI Image 类型。</summary>
        public string componentType = string.Empty;

        /// <summary>可选的项目内 SpriteAtlas 路径。</summary>
        public string atlasPath;
    }

    /// <summary>记录一次真实 Unity AssetDatabase 资源交接检查。</summary>
    [Serializable]
    public sealed class ResourceHandoffInspectionReport
    {
        /// <summary>报告契约版本。</summary>
        public string schemaVersion = "1.0";

        /// <summary>报告来源工作项 ID。</summary>
        public string taskId;

        /// <summary>项目内报告路径。</summary>
        public string outputPath;

        /// <summary>只读数据的真实 Unity 来源。</summary>
        public string measurementSource = "UNITY_EDITOR_ASSET_DATABASE";

        /// <summary>本次读取的唯一运行 ID。</summary>
        public string runId;

        /// <summary>以 UTC 表示的报告生成时刻。</summary>
        public string generatedAtUtc;

        /// <summary>所有请求事实均完整读取时为 MEASURED，否则为 FAIL。</summary>
        public string status = "FAIL";

        /// <summary>汇总成功信息或中文失败诊断。</summary>
        public string message = string.Empty;

        /// <summary>资源加载入口和实际资源身份快照。</summary>
        public List<ResourceHandoffAssetSnapshot> assets = new List<ResourceHandoffAssetSnapshot>();

        /// <summary>动画曲线、帧身份和实际消费者快照。</summary>
        public List<ResourceHandoffAnimationSnapshot> animations = new List<ResourceHandoffAnimationSnapshot>();
    }

    /// <summary>保存一个资源的 GUID、Resources key 冲突和 Addressables 事实。</summary>
    [Serializable]
    public sealed class ResourceHandoffAssetSnapshot
    {
        /// <summary>资产登记表中的资源 ID。</summary>
        public string resourceId;

        /// <summary>AssetDatabase 返回的实际项目路径。</summary>
        public string assetPath;

        /// <summary>AssetDatabase 中实际主资源 GUID。</summary>
        public string assetGuid;

        /// <summary>资源位于唯一 Resources 文件夹时的实际动态加载 key；不在其中时为空字符串。</summary>
        public string resourcesKey = string.Empty;

        /// <summary>全工程中拥有相同动态加载 key 的实际主资源。</summary>
        public List<ResourceHandoffResourceMatch> resourcesMatches = new List<ResourceHandoffResourceMatch>();

        /// <summary>只从已安装 Addressables Editor API 读取到的配置事实。</summary>
        public ResourceHandoffAddressablesSnapshot addressables;
    }

    /// <summary>表示同一 Resources key 对应的一个实际主资源。</summary>
    [Serializable]
    public sealed class ResourceHandoffResourceMatch
    {
        /// <summary>AssetDatabase 返回的实际路径。</summary>
        public string assetPath;

        /// <summary>AssetDatabase 返回的资产 GUID。</summary>
        public string assetGuid;
    }

    /// <summary>表示 AssetDatabase 中真实 Addressables entry 的字段。</summary>
    [Serializable]
    public sealed class ResourceHandoffAddressablesSnapshot
    {
        /// <summary>Addressables 设置中是否存在该 GUID 的 entry。</summary>
        public bool configured;

        /// <summary>entry 实际 address；未配置时为空字符串。</summary>
        public string address = string.Empty;

        /// <summary>entry 所属实际组名；未配置时为空字符串。</summary>
        public string group = string.Empty;
    }

    /// <summary>记录一个 AnimationClip 的实际序列帧与消费绑定。</summary>
    [Serializable]
    public sealed class ResourceHandoffAnimationSnapshot
    {
        /// <summary>动画计划中的稳定动画 ID。</summary>
        public string animationId;

        /// <summary>AssetDatabase 返回的实际 AnimationClip 路径。</summary>
        public string clipPath;

        /// <summary>AssetDatabase 返回的 AnimationClip GUID。</summary>
        public string clipGuid;

        /// <summary>字符串形式的 AnimationClip 子资源 localId。</summary>
        public string clipLocalId;

        /// <summary>Unity AnimationClip 的实际采样帧率。</summary>
        public float? frameRate;

        /// <summary>Unity AnimationClip 的实际时长（秒）。</summary>
        public float? duration;

        /// <summary>AnimationClip 的实际 loopTime 设置。</summary>
        public bool? loop;

        /// <summary>Sprite 曲线的 Prefab 相对绑定路径。</summary>
        public string bindingPath;

        /// <summary>曲线绑定的实际组件类型。</summary>
        public string componentType;

        /// <summary>实际对象引用曲线属性名，始终为 m_Sprite。</summary>
        public string propertyName = "m_Sprite";

        /// <summary>从唯一 Sprite 对象引用曲线读取到的真实帧。</summary>
        public List<ResourceHandoffFrameSnapshot> frames = new List<ResourceHandoffFrameSnapshot>();

        /// <summary>从 Prefab 实际读取到的消费者引用与绑定状态。</summary>
        public ResourceHandoffConsumerSnapshot consumer;

        /// <summary>可选图集的真实身份及逐帧 CanBindTo 结果。</summary>
        public ResourceHandoffAtlasSnapshot atlas;
    }

    /// <summary>记录对象引用曲线中一个 Sprite 的真实源资源身份和几何。</summary>
    [Serializable]
    public sealed class ResourceHandoffFrameSnapshot
    {
        /// <summary>Sprite 对象引用曲线给出的实际时间（秒）。</summary>
        public float time;

        /// <summary>Sprite 所属纹理或资产的 GUID。</summary>
        public string assetGuid;

        /// <summary>字符串形式的 Sprite 子资源 localId。</summary>
        public string localId;

        /// <summary>Sprite 对应的实际 AssetDatabase 路径。</summary>
        public string assetPath;

        /// <summary>Unity Sprite 资产的实际名称。</summary>
        public string spriteName;

        /// <summary>Sprite 源纹理内的像素矩形。</summary>
        public ResourceHandoffRect rect;

        /// <summary>由像素 pivot 按源矩形尺寸换算的比例值，允许超出 0 到 1。</summary>
        public ResourceHandoffPoint pivot;

        /// <summary>Sprite 的实际 pixelsPerUnit。</summary>
        public float pixelsPerUnit;
    }

    /// <summary>描述实际帧像素矩形。</summary>
    [Serializable]
    public sealed class ResourceHandoffRect
    {
        /// <summary>源纹理矩形左下角 X 像素。</summary>
        public float x;

        /// <summary>源纹理矩形左下角 Y 像素。</summary>
        public float y;

        /// <summary>源纹理矩形宽度（像素）。</summary>
        public float width;

        /// <summary>源纹理矩形高度（像素）。</summary>
        public float height;
    }

    /// <summary>描述按源矩形尺寸换算且允许越界的二维比例值。</summary>
    [Serializable]
    public sealed class ResourceHandoffPoint
    {
        /// <summary>归一化 X 值。</summary>
        public float x;

        /// <summary>归一化 Y 值。</summary>
        public float y;
    }

    /// <summary>描述指定 Prefab 组件是否真正引用并解析了动画绑定。</summary>
    [Serializable]
    public sealed class ResourceHandoffConsumerSnapshot
    {
        /// <summary>实际消费 Prefab 路径。</summary>
        public string prefabPath;

        /// <summary>实际消费 Prefab GUID。</summary>
        public string prefabGuid;

        /// <summary>实际检查的唯一组件类型。</summary>
        public string componentType;

        /// <summary>组件配置是否引用同一个 AnimationClip 资产对象。</summary>
        public bool referencesClip;

        /// <summary>Prefab 中是否存在唯一目标绑定对象与渲染组件。</summary>
        public bool bindingResolved;
    }

    /// <summary>记录可选 SpriteAtlas 的真实项目身份与绑定能力。</summary>
    [Serializable]
    public sealed class ResourceHandoffAtlasSnapshot
    {
        /// <summary>实际 SpriteAtlas 资产路径。</summary>
        public string assetPath;

        /// <summary>实际 SpriteAtlas 资产 GUID。</summary>
        public string assetGuid;

        /// <summary>图集是否可绑定请求中的每一帧 Sprite。</summary>
        public bool allFramesBindable;
    }
}
