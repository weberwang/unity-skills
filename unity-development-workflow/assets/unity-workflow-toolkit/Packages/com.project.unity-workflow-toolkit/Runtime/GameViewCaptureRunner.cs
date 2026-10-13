using System;
using System.Collections;
using UnityEngine;

namespace Project.UnityWorkflow.VisualQA
{
    /// <summary>在现有 Play Mode 帧末发出回调的临时组件，不依赖 UnityEditor 程序集。</summary>
    public sealed class GameViewCaptureRunner : MonoBehaviour
    {
        private string requestId = string.Empty;
        private Action<string, GameViewCaptureRunner> onFrameEnd;
        private Action<string> onDestroyed;
        private bool terminal;

        /// <summary>创建隐藏临时组件并等待当前 Game View 实际帧渲染结束。</summary>
        /// <param name="captureRequestId">用于把帧末事件关联到 Editor 端的请求。</param>
        /// <param name="frameEndCallback">帧末通知；截图和状态写入仍由 Editor service 负责。</param>
        /// <param name="destroyedCallback">非正常销毁通知，供 Editor 端完成取消清理。</param>
        /// <returns>已启动帧末协程的临时组件。</returns>
        public static GameViewCaptureRunner Create(
            string captureRequestId,
            Action<string, GameViewCaptureRunner> frameEndCallback,
            Action<string> destroyedCallback)
        {
            var runnerObject = new GameObject("UWT Game View Capture")
            {
                hideFlags = HideFlags.HideAndDontSave
            };
            GameViewCaptureRunner runner = runnerObject.AddComponent<GameViewCaptureRunner>();
            runner.requestId = captureRequestId;
            runner.onFrameEnd = frameEndCallback;
            runner.onDestroyed = destroyedCallback;
            runner.StartCoroutine(runner.CaptureAtFrameEnd());
            return runner;
        }

        /// <summary>标记采集已正常结束，避免销毁回调把终态误判为异常取消。</summary>
        public void MarkComplete()
        {
            terminal = true;
        }

        /// <summary>在 Unity 完成当前帧渲染后将控制权交回 Editor 采集服务。</summary>
        private IEnumerator CaptureAtFrameEnd()
        {
            yield return new WaitForEndOfFrame();
            onFrameEnd?.Invoke(requestId, this);
        }

        /// <summary>销毁临时对象时仅回调 Editor 注入的取消处理器。</summary>
        private void OnDestroy()
        {
            if (!terminal && !string.IsNullOrEmpty(requestId))
            {
                onDestroyed?.Invoke(requestId);
            }
        }
    }
}
