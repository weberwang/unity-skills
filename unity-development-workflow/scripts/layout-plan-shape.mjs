const ROOT_IDS = new Set(["viewport", "safe-area"]);
const LAYOUT_COORDINATE_SPACES = new Set(["SCENE_LOCAL", "PREFAB_LOCAL", "CANVAS_LOCAL", "UI_TOOLKIT_PANEL", "SCREEN_SAFE_AREA"]);
const LAYOUT_DRIVERS = new Set(["RECT_TRANSFORM", "LAYOUT_GROUP", "CONTENT_SIZE_FITTER", "ASPECT_RATIO_FITTER", "UITOOLKIT_LAYOUT", "UITOOLKIT_STYLE", "SCRIPT", "ANIMATION"]);
const PROJECT_RELATIVE_PATH_PATTERN = /^(?!\/)(?![A-Za-z]:\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/;

/** 将字段约束错误统一标注为可定位的中文路径。 */
function addError(errors, path, message) {
  errors.push(`字段 ${path} ${message}。`);
}

/** 检查对象类型、必填字段和白名单字段。 */
function checkObject(value, path, allowedKeys, requiredKeys, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    addError(errors, path, "必须是对象");
    return false;
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) addError(errors, path, `缺少必填字段「${key}」`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) addError(errors, path, `包含未声明字段「${key}」`);
  }
  return true;
}

/** 检查非空字符串、枚举值和可选字段。 */
function checkString(value, path, errors, allowedValues = null, pattern = null) {
  if (typeof value !== "string") {
    addError(errors, path, "必须是字符串");
    return;
  }
  if (value.trim().length < 1) addError(errors, path, "不能为空或仅包含空白字符");
  if (allowedValues && !allowedValues.has(value)) addError(errors, path, "值不符合允许范围");
  if (pattern && !pattern.test(value)) addError(errors, path, "值不符合路径格式");
}

/** 检查只含项目相对路径的工件引用，避免计划逃逸到目标工程以外。 */
function checkProjectArtifactRef(value, path, errors) {
  if (!checkObject(value, path, new Set(["path"]), ["path"], errors)) return;
  checkString(value.path, `${path}.path`, errors, null, PROJECT_RELATIVE_PATH_PATTERN);
}

/** 检查有限数值并应用开区间下界。 */
function checkNumber(value, path, errors, minimum = null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(errors, path, "必须是有限数字");
    return;
  }
  if (minimum !== null && value <= minimum) addError(errors, path, `必须大于 ${minimum}`);
}

/** 检查二维坐标对象。 */
function checkVector2(value, path, errors) {
  if (!checkObject(value, path, new Set(["x", "y"]), ["x", "y"], errors)) return;
  checkNumber(value.x, `${path}.x`, errors);
  checkNumber(value.y, `${path}.y`, errors);
}

/** 检查正尺寸矩形。 */
function checkRect(value, path, errors) {
  if (!checkObject(value, path, new Set(["x", "y", "width", "height"]), ["x", "y", "width", "height"], errors)) return;
  checkNumber(value.x, `${path}.x`, errors);
  checkNumber(value.y, `${path}.y`, errors);
  checkNumber(value.width, `${path}.width`, errors, 0);
  checkNumber(value.height, `${path}.height`, errors, 0);
}

/** 检查两轴对齐枚举。 */
function checkAxisAlignment(value, path, errors) {
  if (!checkObject(value, path, new Set(["horizontal", "vertical"]), ["horizontal", "vertical"], errors)) return;
  checkString(value.horizontal, `${path}.horizontal`, errors, new Set(["left", "center", "right"]));
  checkString(value.vertical, `${path}.vertical`, errors, new Set(["top", "center", "bottom"]));
}

/** 检查单轴严格居中或有理由的参考补偿。 */
function checkCenterAxis(value, path, errors) {
  if (!checkObject(value, path, new Set(["mode", "offset", "reason"]), ["mode"], errors)) return;
  checkString(value.mode, `${path}.mode`, errors, new Set(["strict", "reference"]));
  if (value.offset !== undefined) checkNumber(value.offset, `${path}.offset`, errors);
  if (value.reason !== undefined) checkString(value.reason, `${path}.reason`, errors);
  if (value.mode === "reference") {
    if (!Object.hasOwn(value, "offset")) addError(errors, path, "reference 居中缺少必填字段「offset」");
    if (!Object.hasOwn(value, "reason")) addError(errors, path, "reference 居中缺少必填字段「reason」");
  }
  if (value.mode === "strict" && value.offset !== undefined && value.offset !== 0) {
    addError(errors, `${path}.offset`, "strict 居中必须为零");
  }
}

/** 检查中心策略及其可选成员集合。 */
function checkCenterAlignment(value, path, errors) {
  if (!checkObject(value, path, new Set(["horizontal", "vertical", "memberIds"]), [], errors)) return;
  if (value.horizontal === undefined && value.vertical === undefined) addError(errors, path, "至少需要声明一个居中轴");
  if (value.horizontal !== undefined) checkCenterAxis(value.horizontal, `${path}.horizontal`, errors);
  if (value.vertical !== undefined) checkCenterAxis(value.vertical, `${path}.vertical`, errors);
  if (value.memberIds !== undefined) {
    if (!Array.isArray(value.memberIds)) addError(errors, `${path}.memberIds`, "必须是数组");
    else {
      if (value.memberIds.length < 2) addError(errors, `${path}.memberIds`, "至少需要两个成员");
      const seen = new Set();
      value.memberIds.forEach((memberId, index) => {
        checkString(memberId, `${path}.memberIds[${index}]`, errors);
        if (seen.has(memberId)) addError(errors, `${path}.memberIds`, "成员不能重复");
        seen.add(memberId);
      });
    }
  }
}

/** 检查 UI 布局策略和溢出、容器职责声明。 */
function checkUiLayout(value, path, errors) {
  const keys = new Set([
    "groupingBasis", "layoutOwner", "positionDriver", "sizeDrivers", "imageSizing", "sizePolicy", "overflowPolicy", "safeAreaPolicy",
    "interactionPolicy", "visualOverflow", "independentContainerReason", "minimumSize",
  ]);
  const required = ["groupingBasis", "layoutOwner", "sizePolicy", "overflowPolicy", "safeAreaPolicy", "interactionPolicy"];
  if (!checkObject(value, path, keys, required, errors)) return;

  const basisValues = new Set(["POSITION", "LAYOUT", "INTERACTION", "STATE", "CLIP", "REUSE"]);
  if (!Array.isArray(value.groupingBasis)) addError(errors, `${path}.groupingBasis`, "必须是数组");
  else {
    if (value.groupingBasis.length < 1) addError(errors, `${path}.groupingBasis`, "PARENT_CHILD 节点至少需要一个分组依据");
    const seen = new Set();
    value.groupingBasis.forEach((basis, index) => {
      checkString(basis, `${path}.groupingBasis[${index}]`, errors, basisValues);
      if (seen.has(basis)) addError(errors, `${path}.groupingBasis`, "列表中不能包含重复项");
      seen.add(basis);
    });
  }
  checkString(value.layoutOwner, `${path}.layoutOwner`, errors, new Set(["PARENT", "SELF", "NONE"]));
  if (value.positionDriver !== undefined) checkString(value.positionDriver, `${path}.positionDriver`, errors, LAYOUT_DRIVERS);
  if (value.sizeDrivers !== undefined) {
    const drivers = value.sizeDrivers;
    if (checkObject(drivers, `${path}.sizeDrivers`, new Set(["width", "height"]), ["width", "height"], errors)) {
      checkString(drivers.width, `${path}.sizeDrivers.width`, errors, LAYOUT_DRIVERS);
      checkString(drivers.height, `${path}.sizeDrivers.height`, errors, LAYOUT_DRIVERS);
    }
  }
  if (value.imageSizing !== undefined) {
    const imageSizing = value.imageSizing;
    if (checkObject(imageSizing, `${path}.imageSizing`, new Set(["mode", "reason"]), ["mode"], errors)) {
      checkString(imageSizing.mode, `${path}.imageSizing.mode`, errors, new Set(["NATIVE", "EXPLICIT", "SLICED"]));
      if (imageSizing.reason !== undefined) checkString(imageSizing.reason, `${path}.imageSizing.reason`, errors);
      if (imageSizing.mode === "EXPLICIT" && imageSizing.reason === undefined) addError(errors, `${path}.imageSizing`, "EXPLICIT 模式必须提供 reason");
    }
  }
  checkString(value.sizePolicy, `${path}.sizePolicy`, errors, new Set(["FIXED", "STRETCH", "CONTENT", "FLEX"]));
  checkString(value.overflowPolicy, `${path}.overflowPolicy`, errors, new Set(["KEEP_VISIBLE", "DECORATIVE_CROP", "REFLOW", "SCROLL"]));
  checkString(value.safeAreaPolicy, `${path}.safeAreaPolicy`, errors, new Set(["FULL_BLEED", "INSIDE_SAFE_AREA"]));
  checkString(value.interactionPolicy, `${path}.interactionPolicy`, errors, new Set(["HIT_TARGET", "DELEGATE_TO_PARENT", "NON_INTERACTIVE"]));

  if (value.visualOverflow !== undefined) {
    const overflow = value.visualOverflow;
    if (checkObject(overflow, `${path}.visualOverflow`, new Set(["reason"]), ["reason"], errors)) {
      checkString(overflow.reason, `${path}.visualOverflow.reason`, errors);
    }
  }
  if (value.independentContainerReason !== undefined) checkString(value.independentContainerReason, `${path}.independentContainerReason`, errors);
  if (value.minimumSize !== undefined) {
    const size = value.minimumSize;
    if (checkObject(size, `${path}.minimumSize`, new Set(["width", "height"]), ["width", "height"], errors)) {
      checkNumber(size.width, `${path}.minimumSize.width`, errors, 0);
      checkNumber(size.height, `${path}.minimumSize.height`, errors, 0);
    }
  }
}

/** 检查既有布局绑定字段和新增参照、对齐字段。 */
function checkLayoutBinding(value, path, errors) {
  const keys = new Set([
    "parentElementId", "positionReferenceId", "axisAlignment", "centerAlignment", "hierarchyRelation",
    "coordinateSpace", "uiLayout", "anchor", "pivot", "constraints", "resizePolicy",
  ]);
  const required = ["parentElementId", "hierarchyRelation", "coordinateSpace", "uiLayout", "axisAlignment", "anchor", "pivot", "constraints"];
  if (!checkObject(value, path, keys, required, errors)) return;

  checkString(value.parentElementId, `${path}.parentElementId`, errors);
  if (value.positionReferenceId !== undefined) checkString(value.positionReferenceId, `${path}.positionReferenceId`, errors);
  checkString(value.hierarchyRelation, `${path}.hierarchyRelation`, errors, new Set(["PARENT_CHILD"]));
  checkString(value.coordinateSpace, `${path}.coordinateSpace`, errors, LAYOUT_COORDINATE_SPACES);
  if (value.axisAlignment !== undefined) checkAxisAlignment(value.axisAlignment, `${path}.axisAlignment`, errors);
  if (value.centerAlignment !== undefined) checkCenterAlignment(value.centerAlignment, `${path}.centerAlignment`, errors);
  if (value.uiLayout !== undefined) checkUiLayout(value.uiLayout, `${path}.uiLayout`, errors);

  const anchor = value.anchor;
  if (checkObject(anchor, `${path}.anchor`, new Set(["min", "max"]), ["min", "max"], errors)) {
    checkVector2(anchor.min, `${path}.anchor.min`, errors);
    checkVector2(anchor.max, `${path}.anchor.max`, errors);
  }
  checkVector2(value.pivot, `${path}.pivot`, errors);
  if (!Array.isArray(value.constraints)) addError(errors, `${path}.constraints`, "必须是数组");
  else {
    if (value.constraints.length < 1) addError(errors, `${path}.constraints`, "至少需要一条约束说明");
    const seen = new Set();
    value.constraints.forEach((constraint, index) => {
      checkString(constraint, `${path}.constraints[${index}]`, errors);
      if (seen.has(constraint)) addError(errors, `${path}.constraints`, "列表中不能包含重复项");
      seen.add(constraint);
    });
  }
  if (value.resizePolicy !== undefined) {
    checkString(value.resizePolicy, `${path}.resizePolicy`, errors,
      new Set(["FIXED", "SCALE_WITH_PARENT", "LAYOUT_REBUILD", "SAFE_AREA_INSET", "CAMERA_RELATIVE"]));
  }
}

/** 检查单个计划节点，targetBounds 是可选派生字段。 */
function checkNode(value, path, errors) {
  const keys = new Set(["id", "decompositionElementId", "parentElementId", "semanticGrouping", "renderKind", "bounds", "layoutBinding", "targetBounds", "expectedActive", "nineSlice"]);
  const required = ["id", "decompositionElementId", "parentElementId", "semanticGrouping", "renderKind", "bounds", "layoutBinding"];
  if (!checkObject(value, path, keys, required, errors)) return;

  checkString(value.id, `${path}.id`, errors);
  checkString(value.decompositionElementId, `${path}.decompositionElementId`, errors, null, /^[a-z0-9][a-z0-9.-]{0,95}$/);
  checkString(value.parentElementId, `${path}.parentElementId`, errors);
  const semantic = value.semanticGrouping;
  if (checkObject(semantic, `${path}.semanticGrouping`, new Set(["kind", "rationale"]), ["kind", "rationale"], errors)) {
    checkString(semantic.kind, `${path}.semanticGrouping.kind`, errors, new Set(["region", "component", "part", "standalone"]));
    checkString(semantic.rationale, `${path}.semanticGrouping.rationale`, errors);
  }
  checkString(value.renderKind, `${path}.renderKind`, errors, new Set(["SPRITE", "STRUCTURE", "TEXT", "BACKGROUND"]));
  checkRect(value.bounds, `${path}.bounds`, errors);
  checkLayoutBinding(value.layoutBinding, `${path}.layoutBinding`, errors);
  if (value.targetBounds !== undefined) checkRect(value.targetBounds, `${path}.targetBounds`, errors);
  if (value.expectedActive !== undefined && typeof value.expectedActive !== "boolean") addError(errors, `${path}.expectedActive`, "必须是布尔值");
  if (value.nineSlice !== undefined) checkNineSlice(value.nineSlice, `${path}.nineSlice`, errors);
}

/** 检查节点引用的既有九宫格合同，避免运行计划引入另一套字段格式。 */
function checkNineSlice(value, path, errors) {
  if (!checkObject(value, path, new Set(["mode", "reason", "sourceSize", "border"]), ["mode", "reason"], errors)) return;
  checkString(value.mode, `${path}.mode`, errors, new Set(["stretch", "not-applicable"]));
  checkString(value.reason, `${path}.reason`, errors);
  if (value.mode === "stretch") {
    if (!Object.hasOwn(value, "sourceSize")) addError(errors, path, "stretch 模式缺少 sourceSize");
    if (!Object.hasOwn(value, "border")) addError(errors, path, "stretch 模式缺少 border");
  } else if (Object.hasOwn(value, "sourceSize") || Object.hasOwn(value, "border")) {
    addError(errors, path, "not-applicable 模式不能包含 sourceSize 或 border");
  }
  if (value.sourceSize !== undefined) {
    const size = value.sourceSize;
    if (checkObject(size, `${path}.sourceSize`, new Set(["width", "height"]), ["width", "height"], errors)) {
      checkNumber(size.width, `${path}.sourceSize.width`, errors, 0);
      checkNumber(size.height, `${path}.sourceSize.height`, errors, 0);
      if (!Number.isInteger(size.width)) addError(errors, `${path}.sourceSize.width`, "必须是正整数源像素尺寸");
      if (!Number.isInteger(size.height)) addError(errors, `${path}.sourceSize.height`, "必须是正整数源像素尺寸");
    }
  }
  if (value.border !== undefined) {
    if (!Array.isArray(value.border) || value.border.length !== 4) addError(errors, `${path}.border`, "必须是 left,bottom,right,top 四个非负整数");
    else {
      value.border.forEach((border, index) => {
        if (!Number.isInteger(border) || border < 0) addError(errors, `${path}.border[${index}]`, "必须是非负整数");
      });
      if (value.mode === "stretch" && !value.border.some((border) => Number.isInteger(border) && border > 0)) {
        addError(errors, `${path}.border`, "stretch 模式至少需要一个正边框");
      }
    }
  }
}

/** 验证 UI 布局计划在本 Skill 中实际使用的 JSON Schema 字段约束子集。 */
export function validateUiLayoutPlanShape(plan) {
  const errors = [];
  const keys = new Set(["schemaVersion", "sceneId", "scenePath", "stateId", "displayLayerId", "uiSystem", "coordinateSpace", "splitPlanRef", "prefabStructureRef", "prefabAssemblyRef", "roots", "nodes"]);
  const required = ["schemaVersion", "sceneId", "stateId", "uiSystem", "coordinateSpace", "roots", "nodes"];
  if (!checkObject(plan, "根对象", keys, required, errors)) return errors;

  if (plan.schemaVersion !== "1.0") addError(errors, "schemaVersion", "必须为 1.0");
  checkString(plan.sceneId, "sceneId", errors);
  if (plan.scenePath !== undefined) {
    checkString(plan.scenePath, "scenePath", errors);
    if (typeof plan.scenePath === "string") {
      const safeRelativePath = !plan.scenePath.startsWith("/")
        && !/^[A-Za-z]:\//.test(plan.scenePath)
        && !/(^|\/)\.\.(\/|$)/.test(plan.scenePath)
        && !plan.scenePath.includes("\\");
      if (!safeRelativePath || !/^Assets\/.+\.unity$/.test(plan.scenePath)) {
        addError(errors, "scenePath", "必须是项目相对 Assets/*.unity 路径");
      }
    }
  }
  checkString(plan.stateId, "stateId", errors);
  if (plan.displayLayerId !== undefined) checkString(plan.displayLayerId, "displayLayerId", errors);
  checkString(plan.uiSystem, "uiSystem", errors, new Set(["UGUI", "UI_TOOLKIT"]));
  checkString(plan.coordinateSpace, "coordinateSpace", errors, new Set(["SCREEN_SPACE_PIXELS", "UI_TOOLKIT_LOGICAL_POINTS"]));
  for (const key of ["splitPlanRef", "prefabStructureRef", "prefabAssemblyRef"]) {
    if (plan[key] !== undefined) checkProjectArtifactRef(plan[key], key, errors);
  }

  if (checkObject(plan.roots, "roots", ROOT_IDS, ["viewport", "safe-area"], errors)) {
    checkRect(plan.roots.viewport, "roots.viewport", errors);
    checkRect(plan.roots["safe-area"], "roots.safe-area", errors);
  }
  if (!Array.isArray(plan.nodes)) addError(errors, "nodes", "必须是数组");
  else {
    if (plan.nodes.length < 1) addError(errors, "nodes", "至少需要一个 UI 节点");
    plan.nodes.forEach((node, index) => checkNode(node, `nodes[${index}]`, errors));
  }
  return errors;
}
