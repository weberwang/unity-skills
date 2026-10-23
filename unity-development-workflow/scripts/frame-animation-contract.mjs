import {
  indexRows,
  isGuid,
  isLocalId,
  isNonEmptyString,
  isProjectAssetPath,
  isRecord,
  nearlyEqual,
  validateInspectionEnvelope,
} from "./resource-handoff-shape.mjs";

const COMPONENT_TYPES = new Set(["SpriteRenderer", "Image"]);
const CONSUMER_TYPES = new Set(["Animator", "Animation"]);
const EPSILON = 1e-4;

/** 对照序列帧计划与 Unity 实际 Clip、Sprite 身份、消费者绑定和可选图集读回。 */
export function validateFrameAnimationHandoff(plan, report) {
  try {
    const errors = [];
    if (!isRecord(plan)) return ["序列帧计划必须是对象。"];
    if (plan.schemaVersion !== "1.0") errors.push("序列帧计划 schemaVersion 必须为 1.0。");
    if (!Array.isArray(plan.animations) || plan.animations.length === 0) {
      return [...errors, "序列帧计划 animations 必须是非空数组。"];
    }
    validateInspectionEnvelope(report, errors);
    const planned = indexRows(plan.animations, "animationId", "序列帧计划 animations", errors);
    const observed = indexRows(report?.animations, "animationId", "运行报告 animations", errors);
    for (const [animationId, row] of observed) {
      if (!planned.has(animationId)) errors.push(`运行报告包含计划之外的未知 animationId ${animationId}。`);
      validateObservedAnimationShape(row, animationId, errors);
    }
    for (const [animationId, animation] of planned) {
      const actual = observed.get(animationId);
      validatePlanAnimationShape(animation, animationId, errors);
      if (!actual) {
        errors.push(`运行报告缺少计划动作 ${animationId}。`);
        continue;
      }
      compareAnimation(animation, actual, animationId, errors);
    }
    return [...new Set(errors)];
  } catch {
    return ["无法安全校验序列帧交接：输入计划或 Unity 读回报告字段损坏。"];
  }
}

/** 验证计划动作的 Clip、消费者、序列帧身份及其独立时间轴字段。 */
function validatePlanAnimationShape(animation, animationId, errors) {
  if (!isRecord(animation)) return;
  if (!isStandaloneAnimationClipPath(animation.clipPath)) errors.push(`计划动作 ${animationId} 的 clipPath 必须指向独立 .anim 文件。`);
  if (!isGuid(animation.clipGuid)) errors.push(`计划动作 ${animationId} 的 clipGuid 无效。`);
  if (!isLocalId(animation.clipLocalId)) errors.push(`计划动作 ${animationId} 的 clipLocalId 必须是字符串整数。`);
  if (!Number.isFinite(animation.frameRate) || animation.frameRate <= 0) errors.push(`计划动作 ${animationId} 的 frameRate 必须为正有限数。`);
  if (!Number.isFinite(animation.duration) || animation.duration <= 0) errors.push(`计划动作 ${animationId} 的 duration 必须为正有限数。`);
  if (typeof animation.loop !== "boolean") errors.push(`计划动作 ${animationId} 的 loop 必须是布尔值。`);
  if (typeof animation.bindingPath !== "string" || !isValidBindingPath(animation.bindingPath)) {
    errors.push(`计划动作 ${animationId} 的 bindingPath 必须是相对路径，根绑定用空字符串。`);
  }
  if (!COMPONENT_TYPES.has(animation.componentType)) errors.push(`计划动作 ${animationId} 的 componentType 必须是 SpriteRenderer 或 Image。`);
  validateConsumerPlan(animation.consumer, animationId, errors);
  validateAtlasPlan(animation.atlas, animationId, errors);
  validateFrameList(animation.frames, animation.frameRate, animation.duration, animationId, "计划", errors);
}

/** 校验计划中的 Prefab 消费者身份，避免只用字符串伪称组件已接入。 */
function validateConsumerPlan(consumer, animationId, errors) {
  if (!isRecord(consumer)) {
    errors.push(`计划动作 ${animationId} 必须声明 consumer。`);
    return;
  }
  if (!isProjectAssetPath(consumer.prefabPath)) errors.push(`计划动作 ${animationId} 的 consumer.prefabPath 必须是 Assets 路径。`);
  if (!isGuid(consumer.prefabGuid)) errors.push(`计划动作 ${animationId} 的 consumer.prefabGuid 无效。`);
  if (!CONSUMER_TYPES.has(consumer.componentType)) errors.push(`计划动作 ${animationId} 的消费者 componentType 必须是 Animator 或 Animation。`);
}

/** 校验可选 SpriteAtlas 身份；其存在仅表示指定图集必须能绑定全部帧。 */
function validateAtlasPlan(atlas, animationId, errors) {
  if (atlas === undefined) return;
  if (!isRecord(atlas)) {
    errors.push(`计划动作 ${animationId} 的 atlas 必须是对象或省略。`);
    return;
  }
  if (!isProjectAssetPath(atlas.assetPath)) errors.push(`计划动作 ${animationId} 的 atlas.assetPath 必须是 Assets 路径。`);
  if (!isGuid(atlas.assetGuid)) errors.push(`计划动作 ${animationId} 的 atlas.assetGuid 无效。`);
}

/** 验证帧列表有序、从零开始、位于 FPS 网格且没有超过各自动作时长。 */
function validateFrameList(frames, frameRate, duration, animationId, label, errors) {
  if (!Array.isArray(frames) || frames.length === 0) {
    errors.push(`${label}动作 ${animationId} 的 frames 必须是非空数组。`);
    return;
  }
  let previousTime = -Infinity;
  for (const [index, frame] of frames.entries()) {
    if (!isRecord(frame)) {
      errors.push(`${label}动作 ${animationId} 的第 ${index} 帧必须是对象。`);
      continue;
    }
    validateFrameIdentity(frame, animationId, label, index, errors);
    if (!Number.isFinite(frame.time) || frame.time < 0) {
      errors.push(`${label}动作 ${animationId} 的第 ${index} 帧 time 必须是有限非负数。`);
    } else {
      if (index === 0 && Math.abs(frame.time) > EPSILON) errors.push(`${label}动作 ${animationId} 必须从 time=0 开始。`);
      if (frame.time <= previousTime) errors.push(`${label}动作 ${animationId} 的帧 time 必须严格递增且保持序列顺序。`);
      previousTime = frame.time;
      if (Number.isFinite(frameRate) && frameRate > 0) {
        const nearestFrameTime = Math.round(frame.time * frameRate) / frameRate;
        if (Math.abs(frame.time - nearestFrameTime) > EPSILON) errors.push(`${label}动作 ${animationId} 的第 ${index} 帧不在 frameRate 网格上。`);
      }
      if (Number.isFinite(duration) && frame.time > duration + EPSILON) {
        errors.push(`${label}动作 ${animationId} 的第 ${index} 帧超出 duration。`);
      }
    }
  }
}

/** 检查Sprite子资源的完整身份、归一化枢轴和源图像素密度字段。 */
function validateFrameIdentity(frame, animationId, label, index, errors) {
  const prefix = `${label}动作 ${animationId} 的第 ${index} 帧`;
  if (!isProjectAssetPath(frame.assetPath)) errors.push(`${prefix} assetPath 必须是 Assets 路径。`);
  if (!isGuid(frame.assetGuid)) errors.push(`${prefix} assetGuid 无效。`);
  if (!isLocalId(frame.localId)) errors.push(`${prefix} localId 必须是字符串整数，不能仅使用主资产 GUID。`);
  if (!isRecord(frame.pivot) || !Number.isFinite(frame.pivot.x) || !Number.isFinite(frame.pivot.y)) {
    errors.push(`${prefix} pivot 必须保留有限归一化坐标。`);
  }
  if (label === "实测" && (!isRecord(frame.rect)
    || ![frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height].every(Number.isFinite)
    || frame.rect.width <= 0 || frame.rect.height <= 0)) {
    errors.push(`${prefix} rect 必须保留有限源图像素矩形和正尺寸。`);
  }
  if (label === "实测" && !isNonEmptyString(frame.spriteName)) errors.push(`${prefix} spriteName 必须保留实际 Sprite 名称。`);
  if (!Number.isFinite(frame.pixelsPerUnit) || frame.pixelsPerUnit <= 0) errors.push(`${prefix} pixelsPerUnit 必须为正有限数。`);
}

/** 验证实际报告保留了Clip曲线和Sprite对象引用所需的所有字段。 */
function validateObservedAnimationShape(animation, animationId, errors) {
  if (!isStandaloneAnimationClipPath(animation.clipPath)) errors.push(`实测动作 ${animationId} 的 clipPath 必须指向独立 .anim 文件。`);
  if (!isGuid(animation.clipGuid)) errors.push(`实测动作 ${animationId} 的 clipGuid 无效。`);
  if (!isLocalId(animation.clipLocalId)) errors.push(`实测动作 ${animationId} 的 clipLocalId 必须是字符串整数。`);
  if (!Number.isFinite(animation.frameRate) || animation.frameRate <= 0) errors.push(`实测动作 ${animationId} 的 frameRate 无效。`);
  if (!Number.isFinite(animation.duration) || animation.duration <= 0) errors.push(`实测动作 ${animationId} 的 duration 无效。`);
  if (typeof animation.loop !== "boolean") errors.push(`实测动作 ${animationId} 的 loop 必须是布尔值。`);
  if (typeof animation.bindingPath !== "string" || !isValidBindingPath(animation.bindingPath)) errors.push(`实测动作 ${animationId} 的 bindingPath 无效。`);
  if (!COMPONENT_TYPES.has(animation.componentType)) errors.push(`实测动作 ${animationId} 的 componentType 必须是 SpriteRenderer 或 Image。`);
  if (animation.propertyName !== "m_Sprite") errors.push(`实测动作 ${animationId} 必须读回唯一 m_Sprite 对象引用曲线。`);
  validateConsumerObservation(animation.consumer, animationId, errors);
  if (!Object.hasOwn(animation, "atlas")) errors.push(`实测动作 ${animationId} 必须显式保留 atlas 对象或 null。`);
  else if (animation.atlas !== null) validateAtlasObservation(animation.atlas, animationId, errors);
  validateFrameList(animation.frames, animation.frameRate, animation.duration, animationId, "实测", errors);
}

/** 确保 Unity 读回的消费者存在且实际引用了相同 Clip。 */
function validateConsumerObservation(consumer, animationId, errors) {
  if (!isRecord(consumer)) {
    errors.push(`实测动作 ${animationId} 缺少 consumer 对象。`);
    return;
  }
  if (!isProjectAssetPath(consumer.prefabPath)) errors.push(`实测动作 ${animationId} 的 consumer.prefabPath 无效。`);
  if (!isGuid(consumer.prefabGuid)) errors.push(`实测动作 ${animationId} 的 consumer.prefabGuid 无效。`);
  if (!CONSUMER_TYPES.has(consumer.componentType)) errors.push(`实测动作 ${animationId} 的消费者 componentType 无效。`);
  if (consumer.referencesClip !== true) errors.push(`实测动作 ${animationId} 的 Prefab 消费者没有实际引用该 Clip。`);
  if (consumer.bindingResolved !== true) errors.push(`实测动作 ${animationId} 的 Prefab bindingPath 未解析到目标组件。`);
}

/** 验证可选实测图集的身份及逐帧 CanBindTo 结果。 */
function validateAtlasObservation(atlas, animationId, errors) {
  if (!isRecord(atlas)) {
    errors.push(`实测动作 ${animationId} 的 atlas 必须是对象或 null。`);
    return;
  }
  if (!isProjectAssetPath(atlas.assetPath)) errors.push(`实测动作 ${animationId} 的 atlas.assetPath 无效。`);
  if (!isGuid(atlas.assetGuid)) errors.push(`实测动作 ${animationId} 的 atlas.assetGuid 无效。`);
  if (typeof atlas.allFramesBindable !== "boolean") errors.push(`实测动作 ${animationId} 的 atlas.allFramesBindable 必须是布尔值。`);
}

/** 将路径限制为 Prefab 动画根的相对绑定，允许空字符串表示根对象。 */
function isValidBindingPath(value) {
  return value === "" || (typeof value === "string"
    && !value.startsWith("/")
    && !value.includes("\\")
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."));
}

/** 限定序列帧交接使用独立 .anim 主资产，排除 FBX 和自定义容器子 Clip。 */
function isStandaloneAnimationClipPath(value) {
  return isProjectAssetPath(value) && /\.anim$/i.test(value);
}

/** 对齐单个动作身份、帧时间轴、Sprite 子资源和Prefab实际消费事实。 */
function compareAnimation(plan, actual, animationId, errors) {
  comparePath(actual.clipPath, plan.clipPath, `动作 ${animationId} clipPath`, errors);
  compareGuid(actual.clipGuid, plan.clipGuid, `动作 ${animationId} clipGuid`, errors);
  compareString(actual.clipLocalId, plan.clipLocalId, `动作 ${animationId} clipLocalId`, errors);
  compareNumber(actual.frameRate, plan.frameRate, `动作 ${animationId} frameRate`, errors);
  compareNumber(actual.duration, plan.duration, `动作 ${animationId} duration`, errors);
  if (actual.loop !== plan.loop) errors.push(`动作 ${animationId} loop 与实际 Clip 不一致。`);
  compareString(actual.bindingPath, plan.bindingPath, `动作 ${animationId} bindingPath`, errors);
  compareString(actual.componentType, plan.componentType, `动作 ${animationId} componentType`, errors);
  if (actual.propertyName !== "m_Sprite") errors.push(`动作 ${animationId} 的实际曲线属性必须是 m_Sprite。`);
  compareConsumer(plan.consumer, actual.consumer, animationId, errors);
  compareAtlas(plan.atlas, actual.atlas, animationId, errors);
  compareFrames(plan.frames, actual.frames, animationId, errors);
}

/** 对比计划消费者与实际 Animator/Animation 组件、Clip 引用和绑定解析结果。 */
function compareConsumer(expected, actual, animationId, errors) {
  if (!isRecord(expected) || !isRecord(actual)) return;
  comparePath(actual.prefabPath, expected.prefabPath, `动作 ${animationId} consumer.prefabPath`, errors);
  compareGuid(actual.prefabGuid, expected.prefabGuid, `动作 ${animationId} consumer.prefabGuid`, errors);
  compareString(actual.componentType, expected.componentType, `动作 ${animationId} consumer.componentType`, errors);
  if (actual.referencesClip !== true) errors.push(`动作 ${animationId} 的 Prefab 消费者没有实际引用计划 Clip。`);
  if (actual.bindingResolved !== true) errors.push(`动作 ${animationId} 的 Prefab 消费绑定没有实际解析。`);
}

/** 对比可选图集身份；没有计划图集时要求报告明确保留 null。 */
function compareAtlas(expected, actual, animationId, errors) {
  if (expected === undefined) {
    if (actual !== null) errors.push(`动作 ${animationId} 实测 atlas 与计划不一致，未声明时必须为 null。`);
    return;
  }
  if (!isRecord(expected) || !isRecord(actual)) {
    errors.push(`动作 ${animationId} 缺少计划要求的实际 atlas。`);
    return;
  }
  comparePath(actual.assetPath, expected.assetPath, `动作 ${animationId} atlas.assetPath`, errors);
  compareGuid(actual.assetGuid, expected.assetGuid, `动作 ${animationId} atlas.assetGuid`, errors);
  if (actual.allFramesBindable !== true) errors.push(`动作 ${animationId} 的指定图集不能绑定全部实际帧。`);
}

/** 按计划顺序逐帧比较对象引用时间与 Sprite 的独立子资源身份。 */
function compareFrames(expectedFrames, actualFrames, animationId, errors) {
  if (!Array.isArray(expectedFrames) || !Array.isArray(actualFrames)) return;
  if (actualFrames.length !== expectedFrames.length) errors.push(`动作 ${animationId} 实际帧数与计划不一致。`);
  const count = Math.min(expectedFrames.length, actualFrames.length);
  for (let index = 0; index < count; index += 1) {
    const expected = expectedFrames[index];
    const actual = actualFrames[index];
    if (!isRecord(expected) || !isRecord(actual)) continue;
    const prefix = `动作 ${animationId} 第 ${index} 帧`;
    compareNumber(actual.time, expected.time, `${prefix} time`, errors);
    compareGuid(actual.assetGuid, expected.assetGuid, `${prefix} assetGuid`, errors);
    compareString(actual.localId, expected.localId, `${prefix} localId`, errors);
    comparePath(actual.assetPath, expected.assetPath, `${prefix} assetPath`, errors);
    compareNumber(actual.pivot?.x, expected.pivot?.x, `${prefix} pivot.x`, errors);
    compareNumber(actual.pivot?.y, expected.pivot?.y, `${prefix} pivot.y`, errors);
    compareNumber(actual.pixelsPerUnit, expected.pixelsPerUnit, `${prefix} pixelsPerUnit`, errors);
  }
}

/** 比较项目路径时保留精确大小写，避免登记引用与读回资产路径漂移。 */
function comparePath(actual, expected, label, errors) {
  if (actual !== expected) errors.push(`${label} 与计划不一致。`);
}

/** 比较十六进制 GUID 时忽略大小写，但始终保留精确 localId 子资源身份。 */
function compareGuid(actual, expected, label, errors) {
  if (typeof actual !== "string" || typeof expected !== "string" || actual.toLowerCase() !== expected.toLowerCase()) {
    errors.push(`${label} 与计划不一致。`);
  }
}

/** 比较 Clip 和 Sprite 子资源的字符串 localId，避免数字解析造成失精度。 */
function compareString(actual, expected, label, errors) {
  if (actual !== expected) errors.push(`${label} 与计划不一致。`);
}

/** 以 Unity float 序列化误差范围对比帧率、时长、时间和几何元数据。 */
function compareNumber(actual, expected, label, errors) {
  if (!nearlyEqual(actual, expected)) errors.push(`${label} 与计划不一致。`);
}
