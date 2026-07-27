using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace Project.UnityWorkflow.Core
{
    /// <summary>
    /// 保存一次 Unity Editor 稳定状态快照，供纯规则测试和服务入口复用。
    /// </summary>
    [Serializable]
    public sealed class EditorStabilitySnapshot
    {
        public bool IsCompiling;
        public bool IsUpdating;
        public bool IsPlaying;
        public bool IsPlayingOrWillChangePlaymode;
        public bool HasDirtyScenes;
    }

    /// <summary>
    /// 表示 Editor 是否允许执行会写入项目或生成视觉证据的操作。
    /// </summary>
    [Serializable]
    public sealed class EditorStabilityResult
    {
        public bool IsStable;
        public string ErrorCode = string.Empty;
        public string Message = string.Empty;
    }

    /// <summary>
    /// 在工作流写入或截图前阻断编译、导入、播放模式切换和未保存场景。
    /// </summary>
    public static class EditorStabilityGuard
    {
        /// <summary>
        /// 读取当前 Editor 状态并按操作是否允许稳定 Play Mode 进行检查。
        /// </summary>
        /// <param name="allowStablePlayMode">截图可为 true；项目资产写入必须为 false。</param>
        /// <returns>稳定状态或可共享的阻断原因。</returns>
        public static EditorStabilityResult Check(bool allowStablePlayMode)
        {
            return Evaluate(CaptureSnapshot(), allowStablePlayMode);
        }

        /// <summary>
        /// 对显式快照执行确定性规则，避免测试依赖真实编译或播放模式切换。
        /// </summary>
        /// <param name="snapshot">待评估的 Editor 状态。</param>
        /// <param name="allowStablePlayMode">是否允许已经稳定进入的 Play Mode。</param>
        /// <returns>稳定状态或首个高优先级阻断原因。</returns>
        public static EditorStabilityResult Evaluate(
            EditorStabilitySnapshot snapshot,
            bool allowStablePlayMode)
        {
            if (snapshot == null)
            {
                return Blocked("editor.state-unavailable", "无法读取 Unity Editor 稳定状态。");
            }

            if (snapshot.IsCompiling)
            {
                return Blocked("editor.compiling", "Unity 正在编译脚本，当前操作已阻断。");
            }

            if (snapshot.IsUpdating)
            {
                return Blocked("editor.asset-update", "Unity 正在刷新或导入资源，当前操作已阻断。");
            }

            if (snapshot.IsPlaying != snapshot.IsPlayingOrWillChangePlaymode)
            {
                return Blocked("editor.playmode-transition", "Unity 正在切换播放模式，当前操作已阻断。");
            }

            if (snapshot.IsPlaying && !allowStablePlayMode)
            {
                return Blocked("editor.playmode-write", "播放模式中禁止写入正式项目资源。");
            }

            if (snapshot.HasDirtyScenes)
            {
                return Blocked("editor.scene-dirty", "存在未保存场景，保存场景后再执行当前操作。");
            }

            return new EditorStabilityResult
            {
                IsStable = true
            };
        }

        /// <summary>
        /// 收集当前 Editor 和全部已加载非预览场景的只读状态。
        /// </summary>
        private static EditorStabilitySnapshot CaptureSnapshot()
        {
            bool hasDirtyScenes = false;
            for (int index = 0; index < SceneManager.sceneCount; index++)
            {
                Scene scene = SceneManager.GetSceneAt(index);
                if (scene.isLoaded && !EditorSceneManager.IsPreviewScene(scene) && scene.isDirty)
                {
                    hasDirtyScenes = true;
                    break;
                }
            }

            return new EditorStabilitySnapshot
            {
                IsCompiling = EditorApplication.isCompiling,
                IsUpdating = EditorApplication.isUpdating,
                IsPlaying = EditorApplication.isPlaying,
                IsPlayingOrWillChangePlaymode = EditorApplication.isPlayingOrWillChangePlaymode,
                HasDirtyScenes = hasDirtyScenes
            };
        }

        /// <summary>
        /// 构造不包含本机路径或异常细节的阻断结果。
        /// </summary>
        private static EditorStabilityResult Blocked(string errorCode, string message)
        {
            return new EditorStabilityResult
            {
                IsStable = false,
                ErrorCode = errorCode,
                Message = message
            };
        }
    }
}
