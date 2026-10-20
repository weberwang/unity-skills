using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.Tests.Rigging
{
    /// <summary>在 Unity PlayMode 中回归真实 Animator、SpriteSkin 和动画事件实例行为。</summary>
    public sealed class RiggingCharacterRuntimeTests
    {
        private const string RootPathSessionKey = "UwtRiggingRuntimeFixtureRoot";
        private const string InstancePrefixSessionKey = "UwtRiggingRuntimeInstancePrefix";
        private const string PreviousCaptureDeltaSessionKey = "UwtRiggingPreviousCaptureDelta";
        private const string PreviousTimeScaleSessionKey = "UwtRiggingPreviousTimeScale";
        private const float FixedCaptureDelta = 1f / 60f;

        private RiggingTestAssets assets;

        /// <summary>先构建持久化 Unity 资产，并记录域重载后恢复夹具所需的唯一标识。</summary>
        [SetUp]
        public void SetUp()
        {
            string existingRootPath = SessionState.GetString(RootPathSessionKey, string.Empty);
            if (!string.IsNullOrEmpty(existingRootPath))
            {
                if (!existingRootPath.StartsWith("Assets/__UwtRiggingTests_", System.StringComparison.Ordinal) ||
                    existingRootPath.IndexOf("..", System.StringComparison.Ordinal) >= 0)
                {
                    throw new System.InvalidOperationException("运行时夹具 SessionState 路径无效，拒绝覆盖原标识。");
                }

                // Unity 在 EnterPlayMode 域重载后可能再次运行 [SetUp]；继续复用原夹具以免丢失清理路径。
                assets = RiggingTestAssets.Restore(existingRootPath);
                if (assets.Prefab == null || assets.BaseSprite == null || assets.ActionClip == null || assets.Controller == null)
                {
                    throw new System.InvalidOperationException("域重载后无法恢复原运行时夹具，保留其 SessionState 供 TearDown 清理。");
                }

                if (string.IsNullOrEmpty(SessionState.GetString(InstancePrefixSessionKey, string.Empty)))
                {
                    SessionState.SetString(
                        InstancePrefixSessionKey,
                        "UwtRiggingActor_" + System.Guid.NewGuid().ToString("N"));
                }

                return;
            }

            assets = RiggingTestAssets.Create();
            SessionState.SetString(RootPathSessionKey, assets.RootPath);
            SessionState.SetString(InstancePrefixSessionKey, "UwtRiggingActor_" + System.Guid.NewGuid().ToString("N"));
            SessionState.SetFloat(PreviousCaptureDeltaSessionKey, Time.captureDeltaTime);
            SessionState.SetFloat(PreviousTimeScaleSessionKey, Time.timeScale);
        }

        /// <summary>失败或成功时都恢复时间缩放、退出 PlayMode 并清理独占资产。</summary>
        [UnityTearDown]
        public IEnumerator TearDown()
        {
            if (EditorApplication.isPlaying)
            {
                Time.timeScale = 1f;
                DestroyRuntimeActors();
                yield return new ExitPlayMode();
            }

            RestoreTimeSettings();
            CleanupAssets();
        }

        /// <summary>在真实 Animator 中验证循环、过渡、事件、中断、暂停、变体、实例隔离和池复用重置。</summary>
        [UnityTest]
        public IEnumerator CharacterAnimatorRuntime_TransitionsEventsPauseVariantsIsolationAndPoolReuse()
        {
            yield return new EnterPlayMode();
            // EnterPlayMode 会触发域重载；只从持久 SessionState 恢复标识，避免依赖协程局部变量。
            string rootPath = SessionState.GetString(RootPathSessionKey, string.Empty);
            string instancePrefix = SessionState.GetString(InstancePrefixSessionKey, string.Empty);
            Assert.That(rootPath, Does.StartWith("Assets/__UwtRiggingTests_"));
            Assert.That(instancePrefix, Does.StartWith("UwtRiggingActor_"));
            // 固定模拟步长让事件窗口与中断时点可重复，不依赖宿主实际帧率。
            Time.captureDeltaTime = FixedCaptureDelta;
            Time.timeScale = 1f;
            assets = RiggingTestAssets.Restore(rootPath);
            GameObject first = Object.Instantiate(assets.Prefab);
            first.name = instancePrefix + "_First";
            GameObject second = Object.Instantiate(assets.Prefab);
            second.name = instancePrefix + "_Second";

            Animator firstAnimator = first.GetComponent<Animator>();
            Animator secondAnimator = second.GetComponent<Animator>();
            SpriteSkin firstSkin = first.GetComponentInChildren<SpriteSkin>(true);
            SpriteSkin secondSkin = second.GetComponentInChildren<SpriteSkin>(true);
            SpriteRenderer firstRenderer = first.GetComponentInChildren<SpriteRenderer>(true);
            RiggingAnimationEventProbe firstProbe = first.GetComponent<RiggingAnimationEventProbe>();
            RiggingAnimationEventProbe secondProbe = second.GetComponent<RiggingAnimationEventProbe>();
            Assert.That(firstAnimator, Is.Not.Null);
            Assert.That(secondAnimator, Is.Not.Null);
            Assert.That(firstSkin.boneTransforms[0], Is.Not.SameAs(secondSkin.boneTransforms[0]),
                "每個角色实例必须拥有独立骨骼 Transform。");

            yield return null;
            yield return null;
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True);
            Assert.That(secondAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True);
            yield return WaitForDeformedVertices(firstSkin);
            Vector3[] idleVertices = ReadDeformedVertices(firstSkin);

            yield return AdvanceFrames(70);
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).normalizedTime, Is.GreaterThan(1f),
                "待机状态应真实跨过一个循环周期并继续运行。");
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True);

            firstRenderer.sprite = assets.VariantSprite;
            yield return null;
            Assert.That(firstRenderer.sprite, Is.SameAs(assets.VariantSprite));
            Assert.That(firstSkin.SetRootBone(firstSkin.rootBone), Is.EqualTo(SpriteSkinState.Ready));
            Assert.That(firstSkin.SetBoneTransforms(firstSkin.boneTransforms), Is.EqualTo(SpriteSkinState.Ready));
            yield return WaitForDeformedVertices(firstSkin);
            firstRenderer.sprite = assets.BaseSprite;
            yield return null;
            Assert.That(firstRenderer.sprite, Is.SameAs(assets.BaseSprite));
            Assert.That(firstSkin.SetRootBone(firstSkin.rootBone), Is.EqualTo(SpriteSkinState.Ready));
            Assert.That(firstSkin.SetBoneTransforms(firstSkin.boneTransforms), Is.EqualTo(SpriteSkinState.Ready));
            yield return WaitForDeformedVertices(firstSkin);

            firstAnimator.ResetTrigger("Action");
            firstAnimator.SetTrigger("Action");
            float actionStartedAt = Time.time;
            yield return WaitForState(firstAnimator, "Action");
            Assert.That(secondAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True,
                "触发一个实例的动作不得改变另一个实例的 Animator 状态。");
            Assert.That(firstProbe.ImpactCount, Is.EqualTo(0), "AnimationEvent 不应在动作片段进入时立即触发。");

            yield return AdvanceFrames(3);
            float pausedNormalizedTime = firstAnimator.GetCurrentAnimatorStateInfo(0).normalizedTime;
            float pausedArmAngle = firstSkin.boneTransforms[1].localEulerAngles.z;
            Time.timeScale = 0f;
            yield return AdvanceFrames(5);
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).normalizedTime,
                Is.EqualTo(pausedNormalizedTime).Within(0.0001f), "暂停时 Animator 进度应保持不变。");
            Assert.That(Mathf.DeltaAngle(pausedArmAngle, firstSkin.boneTransforms[1].localEulerAngles.z),
                Is.EqualTo(0f).Within(0.01f), "暂停时骨骼姿势应保持不变。");
            Time.timeScale = 1f;

            yield return WaitForImpactCount(firstProbe, 1);
            Assert.That(firstProbe.LastImpactTime, Is.GreaterThan(actionStartedAt + 0.1f),
                "动画事件应按片段时间在动作中段到达，而非在状态切换时触发。");
            Assert.That(firstProbe.LastImpactTime, Is.LessThan(actionStartedAt + 0.7f));
            yield return WaitForDeformedVertices(firstSkin);
            Vector3[] actionVertices = ReadDeformedVertices(firstSkin);
            Assert.That(HasVertexPositionsChanged(idleVertices, actionVertices), Is.True,
                "骨骼动作应在运行时产生实际 Sprite 顶点变形。");
            Assert.That(secondProbe.ImpactCount, Is.EqualTo(0), "一个角色收到的事件不得串到另一个实例。");

            yield return WaitForState(firstAnimator, "Idle");
            firstAnimator.ResetTrigger("Action");
            firstAnimator.SetTrigger("Action");
            yield return WaitForState(firstAnimator, "Action");
            yield return AdvanceFrames(2);
            firstAnimator.SetTrigger("Interrupt");
            yield return WaitForState(firstAnimator, "Hit");
            Assert.That(firstProbe.ImpactCount, Is.EqualTo(1), "受击中断应在 Action 事件到达前取消该事件。");
            Assert.That(secondAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True);

            yield return WaitForState(firstAnimator, "Idle");
            firstAnimator.ResetTrigger("Action");
            firstAnimator.ResetTrigger("Interrupt");
            firstAnimator.SetTrigger("Action");
            yield return WaitForState(firstAnimator, "Action");
            yield return AdvanceFrames(2);
            first.SetActive(false);
            firstAnimator.ResetTrigger("Action");
            firstAnimator.ResetTrigger("Interrupt");
            firstAnimator.Rebind();
            first.SetActive(true);
            firstAnimator.Update(0f);
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).IsName("Idle"), Is.True,
                "对象池租用流程必须显式重置 Animator；本测试调用 Rebind 后应回到默认待机状态。");
            Assert.That(firstAnimator.GetCurrentAnimatorStateInfo(0).normalizedTime,
                Is.EqualTo(0f).Within(0.001f), "池复用时不得继承上一次租用的动画进度。");
            yield return AdvanceFrames(20);
            Assert.That(firstProbe.ImpactCount, Is.EqualTo(1), "池重置后不应收到上一次租用遗留的动画事件。");
            Assert.That(secondProbe.ImpactCount, Is.EqualTo(0));

            DestroyRuntimeActors();
            Time.timeScale = 1f;
            yield return new ExitPlayMode();
        }

        /// <summary>等待指定 Animator 状态，超时后以断言失败结束而不依赖静态曲线读取。</summary>
        /// <param name="animator">实际运行的角色 Animator。</param>
        /// <param name="stateName">Controller 中的状态名。</param>
        /// <param name="maxFrames">允许等待的最大帧数。</param>
        /// <returns>逐帧检查状态的 Unity 协程。</returns>
        private static IEnumerator WaitForState(Animator animator, string stateName, int maxFrames = 120)
        {
            for (int frame = 0; frame < maxFrames; frame++)
            {
                if (animator.GetCurrentAnimatorStateInfo(0).IsName(stateName))
                {
                    yield break;
                }

                yield return null;
            }

            Assert.Fail("Animator 在 " + maxFrames + " 帧内未进入状态 " + stateName + "。");
        }

        /// <summary>等待指定实例收到真实 AnimationEvent。</summary>
        /// <param name="probe">该角色自己的事件接收器。</param>
        /// <param name="expectedCount">预期事件次数。</param>
        /// <param name="maxFrames">允许等待的最大帧数。</param>
        /// <returns>逐帧检查动画事件计数的 Unity 协程。</returns>
        private static IEnumerator WaitForImpactCount(
            RiggingAnimationEventProbe probe,
            int expectedCount,
            int maxFrames = 120)
        {
            for (int frame = 0; frame < maxFrames; frame++)
            {
                if (probe.ImpactCount >= expectedCount)
                {
                    yield break;
                }

                yield return null;
            }

            Assert.Fail("Animator 在 " + maxFrames + " 帧内未派发预期动画事件。");
        }

        /// <summary>等待 Unity 实际生成 SpriteSkin 变形顶点，避免读取尚未准备的缓冲区。</summary>
        /// <param name="skin">当前角色的 SpriteSkin。</param>
        /// <param name="maxFrames">允许等待的最大帧数。</param>
        /// <returns>等待当前帧变形数据的 Unity 协程。</returns>
        private static IEnumerator WaitForDeformedVertices(SpriteSkin skin, int maxFrames = 60)
        {
            for (int frame = 0; frame < maxFrames; frame++)
            {
                if (skin.HasCurrentDeformedVertices())
                {
                    yield break;
                }

                yield return null;
            }

            Assert.Fail("SpriteSkin 在 " + maxFrames + " 帧内没有当前变形顶点数据。");
        }

        /// <summary>只在 Unity 确认变形顶点有效时复制当前角色网格位置。</summary>
        /// <param name="skin">已准备变形数据的角色 SpriteSkin。</param>
        /// <returns>当前帧的顶点位置副本。</returns>
        private static Vector3[] ReadDeformedVertices(SpriteSkin skin)
        {
            Assert.That(skin.HasCurrentDeformedVertices(), Is.True,
                "读取 SpriteSkin 顶点前必须通过 HasCurrentDeformedVertices 检查。");
            Vector3[] positions = skin.GetDeformedVertexPositionData().ToArray();
            Assert.That(positions, Is.Not.Empty);
            return positions;
        }

        /// <summary>将同一 Sprite 的两个变形快照逐顶点比较。</summary>
        /// <param name="before">动画前的顶点位置。</param>
        /// <param name="after">动画后的顶点位置。</param>
        /// <returns>至少一个顶点移动超过容差时返回 true。</returns>
        private static bool HasVertexPositionsChanged(Vector3[] before, Vector3[] after)
        {
            if (before == null || after == null || before.Length != after.Length)
            {
                return false;
            }

            for (int index = 0; index < before.Length; index++)
            {
                if ((before[index] - after[index]).sqrMagnitude > 0.000001f)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>逐帧推进 Unity PlayMode，并让 Animator 和 SpriteSkin 执行真实更新。</summary>
        /// <param name="frameCount">需要推进的帧数。</param>
        /// <returns>逐帧等待协程。</returns>
        private static IEnumerator AdvanceFrames(int frameCount)
        {
            for (int frame = 0; frame < frameCount; frame++)
            {
                yield return null;
            }
        }

        /// <summary>销毁当前测试专属事件探针所在的角色根对象。</summary>
        private static void DestroyRuntimeActors()
        {
            string instancePrefix = SessionState.GetString(InstancePrefixSessionKey, string.Empty);
            if (string.IsNullOrEmpty(instancePrefix))
            {
                return;
            }

            RiggingAnimationEventProbe[] probes = Object.FindObjectsByType<RiggingAnimationEventProbe>(FindObjectsSortMode.None);
            foreach (RiggingAnimationEventProbe probe in probes)
            {
                if (probe != null && probe.gameObject.name.StartsWith(instancePrefix, System.StringComparison.Ordinal))
                {
                    Object.Destroy(probe.gameObject);
                }
            }
        }

        /// <summary>从编辑器测试夹具目录清理已创建的导入资源。</summary>
        private void CleanupAssets()
        {
            string rootPath = SessionState.GetString(RootPathSessionKey, string.Empty);
            if (string.IsNullOrEmpty(rootPath))
            {
                rootPath = assets == null ? string.Empty : assets.RootPath;
                if (string.IsNullOrEmpty(rootPath))
                {
                    // 清理凭据缺失时保留其他 SessionState，避免把可能的残留状态伪装成已完成清理。
                    return;
                }
            }

            if (!rootPath.StartsWith("Assets/__UwtRiggingTests_", System.StringComparison.Ordinal) ||
                rootPath.IndexOf("..", System.StringComparison.Ordinal) >= 0)
            {
                throw new System.InvalidOperationException("清理阶段拒绝删除非测试专属 Assets 路径：" + rootPath);
            }

            RiggingTestAssets.Cleanup(rootPath);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            string diskPath = System.IO.Path.Combine(UnityEngine.Application.dataPath, System.IO.Path.GetFileName(rootPath));
            string[] remainingAssets = AssetDatabase.FindAssets(string.Empty, new[] { rootPath });
            if (AssetDatabase.IsValidFolder(rootPath) || remainingAssets.Length > 0 || System.IO.Directory.Exists(diskPath))
            {
                // 保留 SessionState 清理凭据，让下一次 TearDown 或诊断能定位尚未清除的目录。
                throw new System.InvalidOperationException("运行时测试夹具清理未完成：" + rootPath);
            }

            SessionState.EraseString(RootPathSessionKey);
            SessionState.EraseString(InstancePrefixSessionKey);
            SessionState.EraseString(PreviousCaptureDeltaSessionKey);
            SessionState.EraseString(PreviousTimeScaleSessionKey);
            assets = null;
        }

        /// <summary>在 PlayMode 退出后恢复测试开始前的全局时间设置。</summary>
        private static void RestoreTimeSettings()
        {
            Time.captureDeltaTime = SessionState.GetFloat(PreviousCaptureDeltaSessionKey, 0f);
            Time.timeScale = SessionState.GetFloat(PreviousTimeScaleSessionKey, 1f);
        }
    }
}
