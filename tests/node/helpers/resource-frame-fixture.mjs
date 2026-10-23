const GUIDS = Object.freeze({
  serialized: "11111111111111111111111111111111",
  resource: "22222222222222222222222222222222",
  addressable: "33333333333333333333333333333333",
  clip: "44444444444444444444444444444444",
  prefab: "55555555555555555555555555555555",
  sprites: "66666666666666666666666666666666",
  atlas: "77777777777777777777777777777777",
});

/** 构造三种加载方式各一项的登记与 AssetDatabase 读回样本。 */
export function makeResourceFixture() {
  const register = {
    schemaVersion: "1.0",
    assets: [
      { id: "portrait-static", status: "IMPORTED", path: "Assets/Characters/Hero.png", guid: GUIDS.serialized, address: "untrusted-general-address", loading: { mode: "SERIALIZED" } },
      { id: "button-resource", status: "VALIDATED", path: "Assets/UI/Resources/Buttons/start.png", guid: GUIDS.resource, address: "legacy-path-value", loading: { mode: "RESOURCES", key: "Buttons/start" } },
      { id: "theme-addressable", status: "IMPORTED", path: "Assets/Content/theme.json", guid: GUIDS.addressable, address: "not-a-runtime-proof", loading: { mode: "ADDRESSABLES", key: "content/theme" } },
      { id: "future-asset", status: "PLANNED", path: "Assets/Future/item.png", guid: undefined },
    ],
  };
  const report = makeReport({
    assets: [
      assetObservation("portrait-static", "Assets/Characters/Hero.png", GUIDS.serialized, "", [], { configured: false, address: "", group: "" }),
      assetObservation("button-resource", "Assets/UI/Resources/Buttons/start.png", GUIDS.resource, "Buttons/start", [
        { assetPath: "Assets/UI/Resources/Buttons/start.png", assetGuid: GUIDS.resource },
      ], { configured: false, address: "", group: "" }),
      assetObservation("theme-addressable", "Assets/Content/theme.json", GUIDS.addressable, "", [], {
        configured: true,
        address: "content/theme",
        group: "Content",
      }),
    ],
  });
  return { register, report };
}

/** 构造拥有不同 Sprite 子资源 localId 的两帧计划与实际曲线读回。 */
export function makeFrameFixture() {
  const frames = [
    { time: 0, assetPath: "Assets/Characters/Hero.png", assetGuid: GUIDS.sprites, localId: "21300000", pivot: { x: 0.5, y: 0.5 }, pixelsPerUnit: 100 },
    { time: 0.1, assetPath: "Assets/Characters/Hero.png", assetGuid: GUIDS.sprites, localId: "21300001", pivot: { x: 1.25, y: -0.2 }, pixelsPerUnit: 100 },
  ];
  const plan = {
    schemaVersion: "1.0",
    animations: [{
      animationId: "hero-run",
      clipPath: "Assets/Characters/Animations/Run.anim",
      clipGuid: GUIDS.clip,
      clipLocalId: "7400000",
      frameRate: 10,
      duration: 0.2,
      loop: true,
      bindingPath: "Visual/Body",
      componentType: "SpriteRenderer",
      consumer: {
        prefabPath: "Assets/Characters/Hero.prefab",
        prefabGuid: GUIDS.prefab,
        componentType: "Animator",
      },
      atlas: { assetPath: "Assets/Characters/Hero.spriteatlas", assetGuid: GUIDS.atlas },
      frames: structuredClone(frames),
    }],
  };
  const report = makeReport({
    animations: [{
      animationId: "hero-run",
      clipPath: plan.animations[0].clipPath,
      clipGuid: GUIDS.clip,
      clipLocalId: "7400000",
      frameRate: 10,
      duration: 0.2,
      loop: true,
      bindingPath: "Visual/Body",
      componentType: "SpriteRenderer",
      propertyName: "m_Sprite",
      frames: frames.map((frame, index) => ({
        ...structuredClone(frame),
        spriteName: `Hero_${index}`,
        rect: { x: index * 16, y: 0, width: 16, height: 24 },
      })),
      consumer: {
        prefabPath: "Assets/Characters/Hero.prefab",
        prefabGuid: GUIDS.prefab,
        componentType: "Animator",
        referencesClip: true,
        bindingResolved: true,
      },
      atlas: { assetPath: "Assets/Characters/Hero.spriteatlas", assetGuid: GUIDS.atlas, allFramesBindable: true },
    }],
  });
  return { plan, report };
}

/** 生成符合检查器共同运行信封的数据，可按场景传入资源或动画实测行。 */
function makeReport({ assets = [], animations = [], status = "MEASURED" } = {}) {
  return {
    schemaVersion: "1.0",
    taskId: "WI-RESOURCE-FRAME",
    outputPath: ".workflow-control/evidence/WI-RESOURCE-FRAME/resource-handoff.json",
    measurementSource: "UNITY_EDITOR_ASSET_DATABASE",
    runId: "editor-run-17",
    generatedAtUtc: "2026-10-23T08:00:00.000Z",
    status,
    message: "从 Unity Editor AssetDatabase 读回资源和动画事实。",
    assets,
    animations,
  };
}

/** 创建一项资源的完整 AssetDatabase 实测记录。 */
function assetObservation(resourceId, assetPath, assetGuid, resourcesKey, resourcesMatches, addressables) {
  return { resourceId, assetPath, assetGuid, resourcesKey, resourcesMatches, addressables };
}
