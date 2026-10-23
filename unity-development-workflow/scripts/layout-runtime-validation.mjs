import { validateNineSliceDecision } from "./nine-slice-contract.mjs";
import { validateUiLayoutPlan } from "./layout-plan-validation.mjs";

const ROOT_IDS = new Set(["viewport", "safe-area"]);
const WRITER_KINDS = new Set(["RECT_TRANSFORM", "LAYOUT_GROUP", "CONTENT_SIZE_FITTER", "ASPECT_RATIO_FITTER", "UITOOLKIT_LAYOUT", "UITOOLKIT_STYLE", "SCRIPT", "ANIMATION"]);
const ACTIVE_REPORT_STATUSES = new Set(["MEASURED", "PASS", "FAIL"]);
const EPSILON = 1e-4;

/** 判断输入是否是可以安全读取的普通对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 检查二维尺寸的字段与数值，允许调用方决定是否接受零值。 */
function readSize(value, path, errors, { positive = true } = {}) {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是包含 width 和 height 的对象。`);
    return null;
  }
  const { width, height } = value;
  const invalidSize = positive ? width <= 0 || height <= 0 : width < 0 || height < 0;
  if (![width, height].every(Number.isFinite) || invalidSize) {
    errors.push(`${path} 必须包含${positive ? "正" : "有限非负"}尺寸。`);
    return null;
  }
  return { width, height };
}

/** 检查布局矩形并返回可用于后续几何比较的安全副本。 */
function readRect(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path} 必须是实测矩形对象。`);
    return null;
  }
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    errors.push(`${path} 必须具有有限坐标和正尺寸。`);
    return null;
  }
  return { x, y, width, height };
}

/** 比较两个矩形各分量，采用运行布局合同规定的绝对误差。 */
function sameRect(left, right) {
  return Boolean(left && right && ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= EPSILON));
}

/** 判断矩形是否落在指定边界内，允许仅有 epsilon 级浮点误差。 */
function isContained(inner, outer) {
  return inner.x >= outer.x - EPSILON
    && inner.y >= outer.y - EPSILON
    && inner.x + inner.width <= outer.x + outer.width + EPSILON
    && inner.y + inner.height <= outer.y + outer.height + EPSILON;
}

/** 按实际 UI 系统选出节点可用于相互引用的稳定路径。 */
function getMeasurementPath(measurement, uiSystem) {
  const path = uiSystem === "UGUI" ? measurement.objectPath : measurement.elementName;
  return typeof path === "string" && path.trim() ? path : null;
}

/** 只接受明确标注 UTC 的可解析 ISO 时间，避免本地时区字符串被误当成采集时间。 */
function isUtcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/i.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.slice(0, 8).split(":").map(Number);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

/** 从有效测量建立唯一 ID 索引，并同时检查不完整和重复的覆盖项。 */
function indexMeasurements(plan, report, errors) {
  if (!Array.isArray(report.measurements)) {
    errors.push("运行报告 measurements 必须是数组。");
    return new Map();
  }

  const byId = new Map();
  for (const measurement of report.measurements) {
    if (!isRecord(measurement) || typeof measurement.id !== "string" || !measurement.id.trim()) {
      errors.push("运行报告包含缺少稳定节点 ID 的 measurement。");
      continue;
    }
    if (byId.has(measurement.id)) errors.push(`运行报告重复测量节点 ${measurement.id}。`);
    else byId.set(measurement.id, measurement);
  }

  const planIds = new Set(plan.nodes.map((node) => node.id));
  for (const node of plan.nodes) {
    if (!byId.has(node.id)) errors.push(`运行报告缺少计划节点 ${node.id} 的测量。`);
  }
  for (const id of byId.keys()) {
    if (!planIds.has(id)) errors.push(`运行报告包含计划之外的测量节点 ${id}。`);
  }
  return byId;
}

/** 沿功能父链继承安全区要求；祖先要求不会被后代 FULL_BLEED 覆盖。 */
function requiresSafeArea(node, nodesById) {
  if (node.layoutBinding.uiLayout.safeAreaPolicy === "INSIDE_SAFE_AREA") return true;
  let parentId = node.parentElementId;
  const visited = new Set();
  while (!ROOT_IDS.has(parentId) && nodesById.has(parentId) && !visited.has(parentId)) {
    const parent = nodesById.get(parentId);
    if (parent.layoutBinding.uiLayout.safeAreaPolicy === "INSIDE_SAFE_AREA") return true;
    visited.add(parentId);
    parentId = parent.parentElementId;
  }
  return parentId === "safe-area";
}

/** 核对配置快照的基础形状、活动状态和实际属性写入者列表。 */
function validateSnapshotBase(node, measurement, errors) {
  const snapshot = measurement.componentSnapshot;
  if (!isRecord(snapshot)) {
    errors.push(`节点 ${node.id} 缺少真实 componentSnapshot。`);
    return null;
  }

  if (typeof snapshot.active !== "boolean") errors.push(`节点 ${node.id} 的 componentSnapshot.active 必须为布尔值。`);
  if (snapshot.observationScope !== "ENGINE_COMPONENTS_AND_REGISTERED_WRITERS") {
    errors.push(`节点 ${node.id} 的 observationScope 未声明引擎组件与登记写入者边界。`);
  }
  for (const key of ["layoutGroup", "parentLayoutGroup", "contentSizeFitter", "aspectRatioFitter"]) {
    if (snapshot[key] !== null && !isRecord(snapshot[key])) errors.push(`节点 ${node.id} 的 ${key} 必须是组件快照或 null。`);
  }
  if (isRecord(snapshot.aspectRatioFitter)) {
    const fitter = snapshot.aspectRatioFitter;
    if (typeof fitter.enabled !== "boolean"
      || !["FitInParent", "EnvelopeParent", "WidthControlsHeight", "HeightControlsWidth", "None"].includes(fitter.aspectMode)
      || !Number.isFinite(fitter.aspectRatio) || fitter.aspectRatio <= 0) {
      errors.push(`节点 ${node.id} 的 aspectRatioFitter 配置不完整或无效。`);
    }
  }
  const writers = {};
  for (const key of ["positionWriters", "widthWriters", "heightWriters"]) {
    if (!Array.isArray(snapshot[key]) || snapshot[key].some((writer) => typeof writer !== "string" || !WRITER_KINDS.has(writer))) {
      errors.push(`节点 ${node.id} 的 ${key} 必须是已知写入者名称数组。`);
      writers[key] = [];
    } else writers[key] = snapshot[key];
  }

  const expectedActive = node.expectedActive !== false;
  if (snapshot.active !== expectedActive) errors.push(`节点 ${node.id} 的实际活动状态与 expectedActive 不一致。`);
  if (expectedActive) {
    if (!ACTIVE_REPORT_STATUSES.has(measurement.status)) errors.push(`节点 ${node.id} 活动时必须使用可审阅的测量状态。`);
  } else {
    if (measurement.status !== "INACTIVE") errors.push(`节点 ${node.id} 计划为非活动时，measurement.status 必须是 INACTIVE。`);
    if (measurement.margins !== null) errors.push(`非活动节点 ${node.id} 的 margins 必须为 null，不能伪造零边距。`);
    for (const [key, value] of Object.entries(writers)) {
      if (value.length > 0) errors.push(`非活动节点 ${node.id} 的 ${key} 必须为空。`);
    }
  }

  return { snapshot, writers, expectedActive };
}

/** 要求活动节点的每项布局属性恰由计划指定的唯一机制写入。 */
function validateWriters(node, snapshotData, uiSystem, errors) {
  const { writers, expectedActive } = snapshotData;
  const uiLayout = node.layoutBinding.uiLayout;
  if (!WRITER_KINDS.has(uiLayout.positionDriver)) errors.push(`节点 ${node.id} 必须显式声明有效 positionDriver。`);
  const sizeDrivers = uiLayout.sizeDrivers;
  if (!isRecord(sizeDrivers) || !WRITER_KINDS.has(sizeDrivers.width) || !WRITER_KINDS.has(sizeDrivers.height)) {
    errors.push(`节点 ${node.id} 必须显式声明有效的 width 与 height sizeDrivers。`);
  }
  validateRegisteredWriters(node, snapshotData.snapshot, writers, errors);
  if (expectedActive) validateWriterCompatibility(node, snapshotData.snapshot, uiSystem, uiLayout, errors);
  if (!expectedActive) return;

  const declarations = [
    ["positionWriters", uiLayout.positionDriver, "position"],
    ["widthWriters", sizeDrivers?.width, "width"],
    ["heightWriters", sizeDrivers?.height, "height"],
  ];
  for (const [listKey, expected, label] of declarations) {
    const actual = writers[listKey];
    if (actual.length !== 1) errors.push(`节点 ${node.id} 的 ${label} 必须恰有一个实际写入者，当前为 ${actual.length} 个。`);
    if (actual.length === 1 && actual[0] !== expected) errors.push(`节点 ${node.id} 的 ${label} 实际写入者与计划声明不一致。`);
  }
}

/** 将计划写入者与 Unity 实际组件能力交叉核对，拒绝明显不可能的控制声明。 */
function validateWriterCompatibility(node, snapshot, uiSystem, uiLayout, errors) {
  const declarations = [
    ["position", uiLayout.positionDriver],
    ["width", uiLayout.sizeDrivers?.width],
    ["height", uiLayout.sizeDrivers?.height],
  ];
  const isUguiDriver = (driver) => ["RECT_TRANSFORM", "LAYOUT_GROUP", "CONTENT_SIZE_FITTER", "ASPECT_RATIO_FITTER"].includes(driver);
  const isToolkitDriver = (driver) => ["UITOOLKIT_LAYOUT", "UITOOLKIT_STYLE"].includes(driver);

  for (const [property, driver] of declarations) {
    if (typeof driver !== "string") continue;
    if (uiSystem === "UGUI" && isToolkitDriver(driver)) {
      errors.push(`uGUI 节点 ${node.id} 不能声明 UI Toolkit 写入者 ${driver}。`);
      continue;
    }
    if (uiSystem === "UI_TOOLKIT" && isUguiDriver(driver)) {
      errors.push(`UI Toolkit 节点 ${node.id} 不能声明 uGUI 写入者 ${driver}。`);
      continue;
    }
    if (uiSystem === "UI_TOOLKIT") {
      const position = snapshot.uiToolkit?.position;
      if (property === "position" && driver === "UITOOLKIT_LAYOUT" && position !== "Relative") {
        errors.push(`UI Toolkit 节点 ${node.id} 的相对布局写入者与实际 position 不一致。`);
      }
      if (property === "position" && driver === "UITOOLKIT_STYLE" && position !== "Absolute") {
        errors.push(`UI Toolkit 节点 ${node.id} 的绝对样式写入者与实际 position 不一致。`);
      }
      if (property !== "position" && driver === "UITOOLKIT_STYLE") {
        errors.push(`UI Toolkit 节点 ${node.id} 的 ${property} 尺寸不能声明 UITK_STYLE 写入者。`);
      }
      continue;
    }

    if (driver === "CONTENT_SIZE_FITTER") {
      const fitter = snapshot.contentSizeFitter;
      const fit = property === "width" ? fitter?.horizontalFit : fitter?.verticalFit;
      if (property === "position") errors.push(`节点 ${node.id} 的 ContentSizeFitter 不能写入 position。`);
      else if (fitter?.enabled !== true || typeof fit !== "string" || fit.toLowerCase() === "unconstrained") {
        errors.push(`节点 ${node.id} 的 ContentSizeFitter ${property} 写入者与实际启用轴不一致。`);
      }
    }
    if (driver === "ASPECT_RATIO_FITTER") {
      const fitter = snapshot.aspectRatioFitter;
      const controlsProperty = fitter?.enabled === true && aspectRatioProperties(fitter.aspectMode).includes(property);
      if (!controlsProperty) errors.push(`节点 ${node.id} 的 AspectRatioFitter 实际模式不写入 ${property}。`);
    }
    if (driver === "LAYOUT_GROUP") {
      const group = snapshot.parentLayoutGroup;
      if (group?.enabled !== true) {
        errors.push(`节点 ${node.id} 声称由 LAYOUT_GROUP 写入，但没有启用的父 LayoutGroup。`);
      } else if (property !== "position") {
        const suffix = property === "width" ? "Width" : "Height";
        const gridCell = group.type === "GridLayoutGroup" && isRecord(group.cellSize);
        if (!gridCell && group[`childControl${suffix}`] !== true) {
          errors.push(`节点 ${node.id} 的父 LayoutGroup 未控制 ${property} 尺寸轴。`);
        }
      }
    }
  }
}

/** 核对 SCRIPT 与 ANIMATION 来自活动的显式登记，并保留同类重复写入冲突。 */
function validateRegisteredWriters(node, snapshot, writers, errors) {
  const external = snapshot.externalWriters;
  if (!Array.isArray(external)) {
    errors.push(`节点 ${node.id} 的 externalWriters 必须是数组。`);
    return;
  }
  for (const entry of external) {
    if (!isRecord(entry)) {
      errors.push(`节点 ${node.id} 的 externalWriters 含无效登记项。`);
      continue;
    }
    if (!["SCRIPT", "ANIMATION"].includes(entry.driver) || typeof entry.active !== "boolean") {
      errors.push(`节点 ${node.id} 的外部写入登记必须声明 SCRIPT/ANIMATION 与活动状态。`);
      continue;
    }
    if (typeof entry.ownerType !== "string" || !entry.ownerType.trim()
      || typeof entry.ownerPath !== "string" || !entry.ownerPath.trim()
      || typeof entry.elementName !== "string") {
      errors.push(`节点 ${node.id} 的外部写入登记必须保留实际 ownerType、ownerPath 与 elementName。`);
    }
    if (snapshot.active === false && entry.active === true) errors.push(`非活动节点 ${node.id} 不能包含有效外部写入登记。`);
    for (const flag of ["position", "width", "height"]) {
      if (typeof entry[flag] !== "boolean") errors.push(`节点 ${node.id} 的外部写入登记 ${flag} 必须为布尔值。`);
    }
    if (entry.active !== true) continue;
  }

  for (const driver of ["SCRIPT", "ANIMATION"]) {
    for (const [key, property] of [["positionWriters", "position"], ["widthWriters", "width"], ["heightWriters", "height"]]) {
      const declaredCount = writers[key].filter((writer) => writer === driver).length;
      const expectedCount = external.reduce((total, entry) => total
        + (isRecord(entry) && entry.driver === driver && entry.active === true && entry[property] === true ? 1 : 0), 0);
      if (declaredCount !== expectedCount) {
        errors.push(`节点 ${node.id} 的 ${driver} ${property} 写入者与活动登记数量不一致。`);
      }
    }
  }

  const aspectFitter = snapshot.aspectRatioFitter;
  if (aspectFitter !== null && isRecord(aspectFitter) && typeof aspectFitter.enabled === "boolean") {
    const expectedProperties = snapshot.active === true && aspectFitter.enabled
      ? aspectRatioProperties(aspectFitter.aspectMode)
      : [];
    for (const [key, property] of [["positionWriters", "position"], ["widthWriters", "width"], ["heightWriters", "height"]]) {
      const count = writers[key].filter((writer) => writer === "ASPECT_RATIO_FITTER").length;
      const expectedCount = expectedProperties.includes(property) ? 1 : 0;
      if (count !== expectedCount) {
        errors.push(`节点 ${node.id} 的 AspectRatioFitter ${property} 写入者与实际 aspectMode 不一致。`);
      }
    }
  } else if (["positionWriters", "widthWriters", "heightWriters"].some((key) => writers[key].includes("ASPECT_RATIO_FITTER"))) {
    errors.push(`节点 ${node.id} 声称存在 AspectRatioFitter 写入者，但没有实际 fitter 快照。`);
  }
}

/** 将 Unity AspectRatioFitter 的模式映射到引擎实际控制的属性轴。 */
function aspectRatioProperties(mode) {
  if (["FitInParent", "EnvelopeParent"].includes(mode)) return ["position", "width", "height"];
  if (mode === "WidthControlsHeight") return ["height"];
  if (mode === "HeightControlsWidth") return ["width"];
  return [];
}

/** 校验 UI 系统对应的实际组件快照，杜绝计划声明和快照类型混用。 */
function validateUiSystemSnapshot(node, snapshot, uiSystem, errors, rectTransformSize) {
  if (uiSystem === "UGUI") {
    if (!isRecord(snapshot.rectTransform)) errors.push(`uGUI 节点 ${node.id} 缺少 rectTransform 快照。`);
    if (snapshot.uiToolkit !== null) errors.push(`uGUI 节点 ${node.id} 不能带 uiToolkit 快照。`);
  } else {
    if (!isRecord(snapshot.uiToolkit)) errors.push(`UI Toolkit 节点 ${node.id} 缺少 uiToolkit 快照。`);
    if (snapshot.rectTransform !== null) errors.push(`UI Toolkit 节点 ${node.id} 不能带 rectTransform 快照。`);
    if (snapshot.image !== null) errors.push(`UI Toolkit 节点 ${node.id} 不能伪造 uGUI Image 快照。`);
  }

  if (["STRUCTURE", "TEXT"].includes(node.renderKind) && snapshot.image !== null) {
    errors.push(`${node.renderKind} 节点 ${node.id} 不能伪造 Image 快照。`);
  }
  if (node.renderKind === "SPRITE") {
    const sizing = node.layoutBinding.uiLayout.imageSizing;
    if (!isRecord(sizing) || !["NATIVE", "EXPLICIT", "SLICED"].includes(sizing.mode)) {
      errors.push(`SPRITE 节点 ${node.id} 必须显式声明 imageSizing。`);
    } else {
      if (sizing.mode === "EXPLICIT" && (typeof sizing.reason !== "string" || !sizing.reason.trim())) {
        errors.push(`SPRITE 节点 ${node.id} 的 EXPLICIT imageSizing 必须填写 reason。`);
      }
      if (sizing.mode === "NATIVE" && uiSystem !== "UGUI") {
        errors.push(`节点 ${node.id} 的 NATIVE imageSizing 仅适用于 uGUI Image。`);
      }
      if (sizing.mode !== "SLICED" && node.nineSlice?.mode === "stretch") {
        errors.push(`节点 ${node.id} 的 stretch nineSlice 必须与 SLICED imageSizing 一致。`);
      }
      if (sizing.mode === "SLICED") validateSlicedSizing(node, snapshot, uiSystem, errors);
      if (uiSystem === "UGUI" && isRecord(snapshot.image)) {
        validateImageSnapshot(node, snapshot.image, sizing.mode, errors, rectTransformSize, snapshot.active === true);
      }
      if (uiSystem === "UGUI" && !isRecord(snapshot.image)) errors.push(`uGUI SPRITE 节点 ${node.id} 缺少实际 Image 快照。`);
      if (uiSystem === "UI_TOOLKIT") {
        const guid = snapshot.uiToolkit?.backgroundAssetGuid;
        if (typeof guid !== "string" || !guid.trim()) errors.push(`UI Toolkit SPRITE 节点 ${node.id} 缺少真实背景资源 GUID。`);
      }
    }
  } else if (node.renderKind === "BACKGROUND") {
    const sizing = node.layoutBinding.uiLayout.imageSizing;
    if (sizing !== undefined) {
      if (!isRecord(sizing) || !["NATIVE", "EXPLICIT", "SLICED"].includes(sizing.mode)) {
        errors.push(`BACKGROUND 节点 ${node.id} 的 imageSizing.mode 无效。`);
      } else {
        if (sizing.mode === "EXPLICIT" && (typeof sizing.reason !== "string" || !sizing.reason.trim())) {
          errors.push(`BACKGROUND 节点 ${node.id} 的 EXPLICIT imageSizing 必须填写 reason。`);
        }
        if (sizing.mode === "NATIVE" && uiSystem !== "UGUI") {
          errors.push(`节点 ${node.id} 的 NATIVE imageSizing 仅适用于 uGUI Image。`);
        }
        if (sizing.mode === "SLICED") validateSlicedSizing(node, snapshot, uiSystem, errors);
      }
    }
    if (uiSystem === "UGUI" && isRecord(snapshot.image)) {
      validateImageSnapshot(node, snapshot.image, sizing?.mode, errors, rectTransformSize, snapshot.active === true);
    }
    const toolkitBackground = snapshot.uiToolkit?.backgroundAssetGuid;
    if (uiSystem === "UI_TOOLKIT" && sizing?.mode === "SLICED"
      && (typeof toolkitBackground !== "string" || !toolkitBackground.trim())) {
      errors.push(`UI Toolkit BACKGROUND 节点 ${node.id} 的 SLICED 样式缺少真实背景资源 GUID。`);
    }
  }
}

/** 校验 uGUI Image 的资产身份、PPU 换算和源尺寸与本地显示尺寸关系。 */
function validateImageSnapshot(node, image, sizingMode, errors, rectTransformSize, active = true) {
  for (const field of ["assetGuid", "localId", "assetPath", "type"]) {
    if (typeof image[field] !== "string" || !image[field].trim()) errors.push(`节点 ${node.id} 的 Image.${field} 必须是实际非空值。`);
  }
  const source = readSize(image.sourceSize, `节点 ${node.id} 的 Image.sourceSize`, errors);
  const local = readSize(image.localSize, `节点 ${node.id} 的 Image.localSize`, errors, { positive: active });
  const native = readSize(image.nativeSize, `节点 ${node.id} 的 Image.nativeSize`, errors);
  const scales = ["pixelsPerUnit", "imagePixelsPerUnit", "referencePixelsPerUnit", "pixelsPerUnitMultiplier"];
  for (const field of scales) {
    if (!Number.isFinite(image[field]) || image[field] <= 0) errors.push(`节点 ${node.id} 的 Image.${field} 必须是有限正数。`);
  }
  if (typeof image.hasBorder !== "boolean" || typeof image.preserveAspect !== "boolean") {
    errors.push(`节点 ${node.id} 的 Image.hasBorder 与 preserveAspect 必须是布尔值。`);
  }
  if (!Array.isArray(image.border) || image.border.length !== 4 || image.border.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push(`节点 ${node.id} 的 Image.border 必须是 left,bottom,right,top 四个有限非负值。`);
  }

  if (["pixelsPerUnit", "imagePixelsPerUnit", "referencePixelsPerUnit"].every((field) => Number.isFinite(image[field]) && image[field] > 0)) {
    const derivedImagePpu = image.pixelsPerUnit / image.referencePixelsPerUnit;
    if (Math.abs(image.imagePixelsPerUnit - derivedImagePpu) > EPSILON) {
      errors.push(`节点 ${node.id} 的 Image.imagePixelsPerUnit 与 Sprite/reference PPU 比值不一致。`);
    }
    if (source && native) {
      const expectedNative = {
        width: source.width / image.imagePixelsPerUnit,
        height: source.height / image.imagePixelsPerUnit,
      };
      if (Math.abs(native.width - expectedNative.width) > EPSILON || Math.abs(native.height - expectedNative.height) > EPSILON) {
        errors.push(`节点 ${node.id} 的 Image.nativeSize 必须按 sourceSize/imagePixelsPerUnit 计算。`);
      }
      if (active && sizingMode === "NATIVE" && local
        && (Math.abs(local.width - expectedNative.width) > EPSILON || Math.abs(local.height - expectedNative.height) > EPSILON)) {
        errors.push(`节点 ${node.id} 的 NATIVE Image.localSize 必须等于 nativeSize。`);
      }
    }
  }

  const transformLocalSize = rectTransformSize;
  if (active && local && transformLocalSize
    && (Math.abs(local.width - transformLocalSize.width) > EPSILON || Math.abs(local.height - transformLocalSize.height) > EPSILON)) {
    errors.push(`节点 ${node.id} 的 Image.localSize 与 RectTransform.localSize 不一致。`);
  }
  if (sizingMode === "NATIVE" && (!source || !local || !native)) errors.push(`节点 ${node.id} 的 NATIVE Image 快照字段不完整。`);
  if (sizingMode === "SLICED" && !Array.isArray(image.border)) errors.push(`节点 ${node.id} 的 SLICED Image 缺少实际 border。`);
}

/** 使用冻结九宫格合同核验实际 uGUI Image 或 UI Toolkit 样式切片。 */
function validateSlicedSizing(node, snapshot, uiSystem, errors) {
  const decision = node.nineSlice;
  if (!isRecord(decision) || decision.mode !== "stretch") {
    errors.push(`SLICED 节点 ${node.id} 必须引用 mode=stretch 的冻结 nineSlice。`);
    return;
  }
  errors.push(...validateNineSliceDecision(decision).map((message) => `节点 ${node.id}：${message}`));
  if (uiSystem === "UGUI") {
    const image = snapshot.image;
    if (!isRecord(image)) return;
    if (image.type !== "Sliced" || image.hasBorder !== true) errors.push(`节点 ${node.id} 的实际 uGUI Image 必须启用 Sliced 与边框。`);
    compareSourceAndBorder(node.id, decision, image.sourceSize, image.border, errors);
    return;
  }

  const style = snapshot.uiToolkit;
  if (!isRecord(style)) return;
  const actualBorder = [style.sliceLeft, style.sliceBottom, style.sliceRight, style.sliceTop];
  compareSourceAndBorder(node.id, decision, null, actualBorder, errors);
  if (!Number.isFinite(style.sliceScale) || style.sliceScale <= 0) errors.push(`节点 ${node.id} 的 UI Toolkit sliceScale 必须是有限正数。`);
}

/** 比较冻结源像素和边框与 Unity 实际读取值，epsilon 仅用于浮点序列化误差。 */
function compareSourceAndBorder(nodeId, decision, actualSource, actualBorder, errors) {
  if (actualSource !== null && !sameSize(decision.sourceSize, actualSource)) errors.push(`节点 ${nodeId} 的实际切片 sourceSize 与冻结 nineSlice 不一致。`);
  if (!Array.isArray(actualBorder) || actualBorder.length !== 4
    || actualBorder.some((value, index) => !Number.isFinite(value) || Math.abs(value - decision.border[index]) > EPSILON)) {
    errors.push(`节点 ${nodeId} 的实际切片 border 与冻结 nineSlice 不一致。`);
  }
}

/** 比较源图尺寸或本地尺寸的宽高值。 */
function sameSize(expected, actual) {
  return isRecord(expected) && isRecord(actual)
    && Number.isFinite(actual.width) && Number.isFinite(actual.height)
    && Math.abs(expected.width - actual.width) <= EPSILON
    && Math.abs(expected.height - actual.height) <= EPSILON;
}

/** 核对测量中的父级与位置参照路径、矩形确实来自本批实际节点或逻辑根。 */
function validateMeasurementReferences(node, measurement, measurements, measurementPaths, actualRects, roots, errors) {
  const expectedParentId = node.parentElementId;
  const expectedReferenceId = node.layoutBinding.positionReferenceId ?? expectedParentId;
  const expectedParent = ROOT_IDS.has(expectedParentId) ? roots[expectedParentId] : actualRects.get(expectedParentId);
  const expectedReference = ROOT_IDS.has(expectedReferenceId) ? roots[expectedReferenceId] : actualRects.get(expectedReferenceId);
  const expectedParentPath = ROOT_IDS.has(expectedParentId) ? null : measurementPaths.get(expectedParentId);
  const expectedReferencePath = ROOT_IDS.has(expectedReferenceId) ? expectedReferenceId : measurementPaths.get(expectedReferenceId);

  if (ROOT_IDS.has(expectedParentId)
    ? typeof measurement.parentPath !== "string" || !measurement.parentPath.trim()
    : measurement.parentPath !== expectedParentPath) {
    errors.push(`节点 ${node.id} 的 parentPath 未指向本批实际父级或根框。`);
  }
  if (!sameRectOrNull(measurement.parentRect, expectedParent)) errors.push(`节点 ${node.id} 的 parentRect 未与本批父级实测矩形一致。`);
  if (measurement.referenceId !== expectedReferenceId) errors.push(`节点 ${node.id} 的 referenceId 与计划位置参照不一致。`);
  if (measurement.referencePath !== expectedReferencePath) errors.push(`节点 ${node.id} 的 referencePath 未指向本批实际参照或逻辑根。`);
  if (!sameRectOrNull(measurement.referenceRect, expectedReference)) errors.push(`节点 ${node.id} 的 referenceRect 未与本批参照实测矩形一致。`);

  if (!ROOT_IDS.has(expectedParentId) && !measurements.has(expectedParentId)) {
    errors.push(`节点 ${node.id} 的父级 ${expectedParentId} 不在本批测量中。`);
  }
  if (!ROOT_IDS.has(expectedReferenceId) && !measurements.has(expectedReferenceId)) {
    errors.push(`节点 ${node.id} 的位置参照 ${expectedReferenceId} 不在本批测量中。`);
  }
}

/** 为可空的父级/参照矩形构造安全比较值；非法内容与预期实测值不匹配。 */
function readRectOptional(value) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || ![value.x, value.y, value.width, value.height].every(Number.isFinite)
    || value.width <= 0 || value.height <= 0) return null;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

/** 允许实际非活动参照和对应矩形同时为空，其他情况必须数值一致。 */
function sameRectOrNull(actualValue, expected) {
  if (expected === null || expected === undefined) return actualValue === null;
  return sameRect(readRectOptional(actualValue), expected);
}

/** 仅在报告声明目标矩形或容差时，按该节点的派生目标复核实测差值。 */
function validateMeasurementTarget(node, measurement, actualRect, errors) {
  if (measurement.status === "FAIL") errors.push(`节点 ${node.id} 的 measurement.status 为 FAIL，不能作为通过证据。`);
  if (!Object.hasOwn(measurement, "targetRect") || !Object.hasOwn(measurement, "delta") || !Object.hasOwn(measurement, "tolerance")) {
    errors.push(`节点 ${node.id} 的 targetRect、delta 与 tolerance 字段必须显式保留。`);
    return;
  }

  const hasTarget = measurement.targetRect !== null;
  const hasTolerance = measurement.tolerance !== null;
  if (!hasTarget) {
    if (hasTolerance || measurement.delta !== null) errors.push(`节点 ${node.id} 没有 targetRect 时不能声明 tolerance 或 delta。`);
    return;
  }

  const targetRect = readRect(measurement.targetRect, `节点 ${node.id} 的 targetRect`, errors);
  if (!targetRect) return;
  if (!sameRect(targetRect, node.targetBounds)) {
    errors.push(`节点 ${node.id} 的实际报告 targetRect 与计划派生 targetBounds 不一致。`);
  }
  if (!actualRect) {
    errors.push(`节点 ${node.id} 声明 targetRect 时缺少实际矩形，无法重算 delta。`);
    return;
  }
  const expectedDelta = {
    x: actualRect.x - targetRect.x,
    y: actualRect.y - targetRect.y,
    width: actualRect.width - targetRect.width,
    height: actualRect.height - targetRect.height,
  };
  if (!isRecord(measurement.delta)
    || ![measurement.delta.x, measurement.delta.y, measurement.delta.width, measurement.delta.height].every(Number.isFinite)) {
    errors.push(`节点 ${node.id} 声明 targetRect 时必须提供完整有限 delta。`);
    return;
  }
  for (const axis of ["x", "y", "width", "height"]) {
    if (Math.abs(measurement.delta[axis] - expectedDelta[axis]) > EPSILON) {
      errors.push(`节点 ${node.id} 的 delta.${axis} 与实际矩形重算结果不一致。`);
    }
  }

  if (hasTolerance) {
    const maxAbsDelta = measurement.tolerance?.maxAbsDelta;
    if (!Number.isFinite(maxAbsDelta) || maxAbsDelta < 0) {
      errors.push(`节点 ${node.id} 的 tolerance.maxAbsDelta 必须是有限非负数。`);
    } else if (Math.max(...Object.values(expectedDelta).map(Math.abs)) > maxAbsDelta + EPSILON) {
      errors.push(`节点 ${node.id} 的实际 delta 超出显式 tolerance。`);
    }
  }
  if (measurement.status === "PASS" && hasTolerance
    && Math.max(...Object.values(expectedDelta).map(Math.abs)) > measurement.tolerance.maxAbsDelta + EPSILON) {
    errors.push(`节点 ${node.id} 声明 PASS，但实际 delta 超出 tolerance。`);
  }
}

/** 以实际边界复核活动节点，不允许 visualOverflow 绕过 viewport 或继承的安全区。 */
function validateActualGeometry(node, actualRect, nodesById, actualRects, roots, errors) {
  if (!actualRect) return;
  if (roots.viewport && !isContained(actualRect, roots.viewport)) errors.push(`节点 ${node.id} 的实际矩形超出 viewport。`);
  if (requiresSafeArea(node, nodesById) && roots["safe-area"] && !isContained(actualRect, roots["safe-area"])) {
    errors.push(`节点 ${node.id} 的实际矩形未落入继承的 safe-area。`);
  }
  const parent = ROOT_IDS.has(node.parentElementId) ? roots[node.parentElementId] : actualRects.get(node.parentElementId);
  const parentNode = nodesById.get(node.parentElementId);
  if (parent && !isContained(actualRect, parent)) {
    const hasNonRootParent = Boolean(parentNode);
    const overflow = node.layoutBinding.uiLayout.visualOverflow;
    if (!hasNonRootParent || !overflow?.reason?.trim()) errors.push(`节点 ${node.id} 的实际矩形超出父级且没有合规 visualOverflow。`);
  }
}

/** 按每条实际中心关系重算单节点中心或图文组的联合包围框中心。 */
function validateActualCentering(plan, measurements, actualRects, roots, errors) {
  const groupByMemberAndAxis = new Map();
  for (const leader of plan.nodes) {
    const centerAlignment = leader.layoutBinding.centerAlignment;
    const memberIds = centerAlignment?.memberIds;
    if (!Array.isArray(memberIds)) continue;
    for (const axis of ["horizontal", "vertical"]) {
      if (!centerAlignment[axis]) continue;
      for (const memberId of memberIds) groupByMemberAndAxis.set(`${axis}:${memberId}`, leader);
    }
  }

  // 组的 leader 可以隐藏；只要任一成员活动，就独立核验整组实际几何，不能依赖 leader 的循环入口。
  for (const leader of plan.nodes) {
    const group = leader.layoutBinding.centerAlignment;
    if (!Array.isArray(group?.memberIds)) continue;
    const memberMeasurements = group.memberIds.map((memberId) => measurements.get(memberId));
    const hasActiveMember = memberMeasurements.some((row) => row?.componentSnapshot?.active === true);
    if (!hasActiveMember) continue;

    for (const axis of ["horizontal", "vertical"]) {
      if (!group[axis]) continue;
      const missingMember = group.memberIds.some((memberId, index) =>
        memberMeasurements[index]?.componentSnapshot?.active !== true || !actualRects.get(memberId));
      if (missingMember) {
        errors.push(`居中成员组 ${leader.id} 的 ${axis} 轴缺少活动成员的实际矩形。`);
        continue;
      }
      const referenceId = leader.layoutBinding.positionReferenceId ?? leader.parentElementId;
      const leaderMeasurement = measurements.get(leader.id);
      const referenceRect = ROOT_IDS.has(referenceId)
        ? roots[referenceId]
        : actualRects.get(referenceId) ?? readRectOptional(leaderMeasurement?.referenceRect);
      if (!referenceRect) {
        errors.push(`居中成员组 ${leader.id} 的 ${axis} 轴缺少实际位置参照矩形。`);
        continue;
      }
      const memberRects = group.memberIds.map((memberId) => actualRects.get(memberId));
      const union = unionRects(memberRects);
      const offset = group[axis].mode === "reference" ? group[axis].offset : 0;
      if (Math.abs(centerCoordinate(union, axis) - centerCoordinate(referenceRect, axis) - offset) > EPSILON) {
        errors.push(`居中成员组 ${leader.id} 的实际 ${axis} 联合包围框未按声明策略居中。`);
      }
    }
  }

  for (const node of plan.nodes) {
    const measurement = measurements.get(node.id);
    const rect = actualRects.get(node.id);
    if (!measurement || !rect || measurement.componentSnapshot?.active !== true) continue;
    const referenceId = node.layoutBinding.positionReferenceId ?? node.parentElementId;
    const referenceMeasurement = ROOT_IDS.has(referenceId) ? null : measurements.get(referenceId);
    const referenceRect = ROOT_IDS.has(referenceId)
      ? null
      : readRectOptional(referenceMeasurement?.actualRect);
    const actualReference = referenceRect ?? (measurement.referenceRect ? readRectOptional(measurement.referenceRect) : null);
    const rootReference = ROOT_IDS.has(referenceId) ? roots[referenceId] : null;
    const observedReference = actualReference ?? rootReference;

    for (const axis of ["horizontal", "vertical"]) {
      const strategy = node.layoutBinding.centerAlignment?.[axis];
      const aligned = node.layoutBinding.axisAlignment?.[axis] === "center";
      const owner = groupByMemberAndAxis.get(`${axis}:${node.id}`);
      if (owner) continue;

      if (!strategy && !aligned) continue;
      if (!observedReference) {
        errors.push(`节点 ${node.id} 的 ${axis} 居中缺少实际位置参照矩形。`);
        continue;
      }
      const offset = strategy?.mode === "reference" ? strategy.offset : 0;
      if (Math.abs(centerCoordinate(rect, axis) - centerCoordinate(observedReference, axis) - offset) > EPSILON) {
        errors.push(`节点 ${node.id} 的实际 ${axis} 中心未按声明策略对齐。`);
      }
    }
  }
}

/** 合并多个活动成员矩形，提供组居中的实测联合包围框。 */
function unionRects(rects) {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 读取屏幕左上坐标系中指定轴的中心点。 */
function centerCoordinate(rect, axis) {
  return axis === "horizontal" ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
}

/** 校验 Unity Editor 同批运行证据、实测几何、组件控制权和源图尺寸。 */
export function validateUiLayoutRuntime(plan, report, options = {}) {
  try {
    const planErrors = validateUiLayoutPlan(plan, { requireDerived: true });
    if (planErrors.length > 0) return planErrors;
    const errors = [];
    if (!isRecord(options)) options = {};
    if (!isRecord(report)) return ["运行报告必须是 Unity Editor 布局测量对象。"];

    if (report.measurementSource !== "UNITY_EDITOR_LOADED_SCENE") errors.push("measurementSource 必须是 UNITY_EDITOR_LOADED_SCENE。");
    if (typeof report.runId !== "string" || !report.runId.trim()) errors.push("运行报告 runId 必须是非空字符串。");
    if (!isUtcTimestamp(report.generatedAtUtc)) errors.push("运行报告 generatedAtUtc 必须是有效 UTC ISO 时间。");
    if (!Number.isInteger(report.frameCount) || report.frameCount < 0) errors.push("运行报告 frameCount 必须是非负整数。");
    if (report.includesComponentSnapshots !== true) errors.push("运行报告必须声明 includesComponentSnapshots=true。");
    if (report.uiSystem !== plan.uiSystem) errors.push("运行报告 uiSystem 与计划不一致。");
    if (report.coordinateSpace !== plan.coordinateSpace) errors.push("运行报告 coordinateSpace 与计划不一致。");
    if (report.stateId !== plan.stateId) errors.push("运行报告 stateId 与计划不一致。");
    if (typeof options.candidateId === "string" && options.candidateId.trim()
      && (typeof report.candidateId !== "string" || report.candidateId !== options.candidateId)) {
      errors.push("运行报告 candidateId 与指定候选不一致。");
    }
    const scenePath = typeof options.scenePath === "string" && options.scenePath.trim() ? options.scenePath : plan.scenePath;
    if (scenePath && report.scenePath !== scenePath) errors.push("运行报告 scenePath 与计划或指定场景不一致。");
    if (typeof options.scenePath === "string" && options.scenePath.trim() && plan.scenePath && options.scenePath !== plan.scenePath) {
      errors.push("指定 scenePath 与计划 scenePath 不一致。");
    }
    if (!ACTIVE_REPORT_STATUSES.has(report.status)) errors.push("运行报告 status 必须是可审阅的 MEASURED、PASS 或 FAIL 结果。");
    if (report.status === "FAIL") errors.push("运行报告 status 为 FAIL，不能作为通过证据。");

    const viewport = readRect(report.viewportRect, "运行报告 viewportRect", errors);
    const safeArea = readRect(report.safeAreaRect, "运行报告 safeAreaRect", errors);
    const roots = { viewport, "safe-area": safeArea };
    if (!sameRect(viewport, plan.roots.viewport)) errors.push("运行报告 viewportRect 与计划根范围不一致。");
    if (!sameRect(safeArea, plan.roots["safe-area"])) errors.push("运行报告 safeAreaRect 与计划根范围不一致。");
    if (viewport && safeArea && !isContained(safeArea, viewport)) errors.push("运行报告 safeAreaRect 必须位于 viewportRect 内。");

    const measurements = indexMeasurements(plan, report, errors);
    const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
    const measurementPaths = new Map();
    const seenPaths = new Set();
    for (const [id, measurement] of measurements) {
      const path = getMeasurementPath(measurement, plan.uiSystem);
      if (!path) errors.push(`节点 ${id} 缺少当前 UI 系统的实际稳定路径。`);
      else {
        if (seenPaths.has(path)) errors.push(`节点 ${id} 的实际路径与本批其他节点重复。`);
        else seenPaths.add(path);
        measurementPaths.set(id, path);
      }
    }

    const actualRects = new Map();
    const snapshots = new Map();
    for (const node of plan.nodes) {
      const measurement = measurements.get(node.id);
      if (!measurement) continue;
      const snapshotData = validateSnapshotBase(node, measurement, errors);
      if (snapshotData) {
        snapshots.set(node.id, snapshotData);
        validateWriters(node, snapshotData, plan.uiSystem, errors);
        const rectSize = plan.uiSystem === "UGUI"
          ? readSize(snapshotData.snapshot.rectTransform?.localSize, `节点 ${node.id} 的 RectTransform.localSize`, errors, { positive: snapshotData.expectedActive })
          : null;
        validateUiSystemSnapshot(node, snapshotData.snapshot, plan.uiSystem, errors, rectSize);
        if (snapshotData.expectedActive && snapshotData.snapshot.active && measurement.actualRect !== null) {
          actualRects.set(node.id, readRect(measurement.actualRect, `节点 ${node.id} 的 actualRect`, errors));
        } else if (measurement.actualRect !== null && measurement.actualRect !== undefined) {
          actualRects.set(node.id, readRect(measurement.actualRect, `节点 ${node.id} 的 actualRect`, errors));
        }
      }
    }

    for (const node of plan.nodes) {
      const measurement = measurements.get(node.id);
      const snapshotData = snapshots.get(node.id);
      if (!measurement || !snapshotData) continue;
      validateMeasurementReferences(node, measurement, measurements, measurementPaths, actualRects, roots, errors);
      const rect = actualRects.get(node.id);
      if (snapshotData.expectedActive && !rect) errors.push(`计划要求活动的节点 ${node.id} 缺少实际正尺寸 actualRect。`);
      validateMeasurementTarget(node, measurement, rect, errors);
      const parentNode = nodesById.get(node.parentElementId);
      const parentSnapshot = snapshots.get(node.parentElementId);
      if (parentNode && parentSnapshot?.snapshot.active === false && snapshotData.snapshot.active === true) {
        errors.push(`节点 ${node.id} 的父级 ${parentNode.id} 非活动时，子节点不能活动。`);
      }
      if (snapshotData.snapshot.active === true) validateActualGeometry(node, rect, nodesById, actualRects, roots, errors);
    }

    validateActualCentering(plan, measurements, actualRects, roots, errors);
    return [...new Set(errors)];
  } catch {
    return ["无法安全校验 UI 布局运行证据：输入结构或运行快照字段损坏。"];
  }
}
