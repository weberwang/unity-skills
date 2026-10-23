import {
  getResourcesPathInfo,
  indexRows,
  isGuid,
  isNonEmptyString,
  isProjectAssetPath,
  isRecord,
  validateInspectionEnvelope,
} from "./resource-handoff-shape.mjs";

const FORMAL_STATUSES = new Set(["IMPORTED", "VALIDATED"]);
const REGISTER_STATUSES = new Set(["PLANNED", "REVIEWING", "APPROVED", "IMPORTED", "VALIDATED", "SUPERSEDED", "BLOCKED"]);
const LOADING_MODES = new Set(["SERIALIZED", "RESOURCES", "ADDRESSABLES"]);

/** 核对资源登记声明与 Unity AssetDatabase 的路径、GUID、Resources 键和 Addressables 事实。 */
export function validateResourceLoading(register, report) {
  try {
    const errors = [];
    if (!isRecord(register)) return ["资源登记必须是对象。"];
    if (register.schemaVersion !== "1.0") errors.push("资源登记 schemaVersion 必须为 1.0。");
    if (!Array.isArray(register.assets)) return ["资源登记 assets 必须是数组。"];

    const registerById = new Map();
    const formalAssets = new Map();
    for (const [index, asset] of register.assets.entries()) {
      if (!isRecord(asset)) {
        errors.push(`资源登记 assets[${index}] 必须是对象。`);
        continue;
      }
      if (!isNonEmptyString(asset.id)) {
        errors.push(`资源登记 assets[${index}].id 必须是非空字符串。`);
        continue;
      }
      if (registerById.has(asset.id)) errors.push(`资源登记重复 id ${asset.id}。`);
      else registerById.set(asset.id, asset);

      if (!REGISTER_STATUSES.has(asset.status)) {
        errors.push(`资源 ${asset.id} 的 status 必须是已知登记状态。`);
        continue;
      }
      if (!FORMAL_STATUSES.has(asset.status)) continue;
      formalAssets.set(asset.id, asset);
      validateRegisteredAsset(asset, errors);
    }
    if (formalAssets.size === 0) errors.push("资源登记没有可核验的 IMPORTED 或 VALIDATED 正式资产。");

    const reportRows = indexRows(report?.assets, "resourceId", "运行报告 assets", errors);
    validateInspectionEnvelope(report, errors);
    for (const [resourceId, row] of reportRows) {
      if (!formalAssets.has(resourceId)) errors.push(`运行报告包含未登记为正式资源的未知 resourceId ${resourceId}。`);
      validateObservedAssetShape(row, resourceId, errors);
    }

    for (const [resourceId, asset] of formalAssets) {
      const observed = reportRows.get(resourceId);
      if (!observed) {
        errors.push(`运行报告缺少正式资源 ${resourceId}。`);
        continue;
      }
      compareAssetIdentity(asset, observed, resourceId, errors);
      compareLoadingMode(asset, observed, resourceId, errors);
    }
    return [...new Set(errors)];
  } catch {
    return ["无法安全校验资源加载交接：输入登记或 Unity 读回报告字段损坏。"];
  }
}

/** 检查已导入登记项的身份字段与加载方式声明，避免未完整的条目冒充正式资源。 */
function validateRegisteredAsset(asset, errors) {
  if (!isProjectAssetPath(asset.path)) errors.push(`正式资源 ${asset.id} 的 path 必须是规范 Assets 路径。`);
  if (!isGuid(asset.guid)) errors.push(`正式资源 ${asset.id} 的 guid 必须是 32 位十六进制 GUID。`);
  if (!isRecord(asset.loading)) {
    errors.push(`正式资源 ${asset.id} 必须声明 loading.mode。`);
    return;
  }
  const unknownKeys = Object.keys(asset.loading).filter((key) => !["mode", "key"].includes(key));
  if (unknownKeys.length > 0) errors.push(`正式资源 ${asset.id} 的 loading 含未知字段：${unknownKeys.join("、")}。`);
  if (!LOADING_MODES.has(asset.loading.mode)) {
    errors.push(`正式资源 ${asset.id} 的 loading.mode 必须是 SERIALIZED、RESOURCES 或 ADDRESSABLES。`);
    return;
  }
  const keyPresent = Object.hasOwn(asset.loading, "key");
  if (keyPresent && !isNonEmptyString(asset.loading.key)) errors.push(`正式资源 ${asset.id} 的 loading.key 不能是空值。`);
  if (asset.loading.mode === "SERIALIZED" && keyPresent) errors.push(`SERIALIZED 资源 ${asset.id} 不应声明动态 key。`);
  if (["RESOURCES", "ADDRESSABLES"].includes(asset.loading.mode) && !isNonEmptyString(asset.loading.key)) {
    errors.push(`${asset.loading.mode} 资源 ${asset.id} 必须显式声明 loading.key。`);
  }
  if (asset.loading.mode === "SERIALIZED" && isProjectAssetPath(asset.path)
    && getResourcesPathInfo(asset.path).directoryCount > 0) {
    errors.push(`SERIALIZED 资源 ${asset.id} 位于 Resources 目录，加载方式声明与路径冲突。`);
  }
}

/** 核对报告实测路径和 GUID，保持路径大小写及 GUID 身份的逐字对应。 */
function compareAssetIdentity(asset, observed, resourceId, errors) {
  if (observed.assetPath !== asset.path) errors.push(`资源 ${resourceId} 的实际 assetPath 与登记 path 不一致。`);
  if (!isGuid(asset.guid) || !isGuid(observed.assetGuid) || observed.assetGuid.toLowerCase() !== asset.guid.toLowerCase()) {
    errors.push(`资源 ${resourceId} 的实际 assetGuid 与登记 GUID 不一致。`);
  }
}

/** 验证 C# 真实读回字段及其 Resources 冲突清单，覆盖重名与缺字段情况。 */
function validateObservedAssetShape(observed, resourceId, errors) {
  if (!isProjectAssetPath(observed.assetPath)) errors.push(`资源 ${resourceId} 的实际 assetPath 不是规范 Assets 路径。`);
  if (!isGuid(observed.assetGuid)) errors.push(`资源 ${resourceId} 的实际 assetGuid 无效。`);
  const pathInfo = getResourcesPathInfo(observed.assetPath);
  if (pathInfo.directoryCount > 1) errors.push(`资源 ${resourceId} 位于嵌套 Resources 目录，无法形成唯一加载键。`);
  const expectedKey = pathInfo.directoryCount === 1 ? pathInfo.key : "";
  if (typeof observed.resourcesKey !== "string") errors.push(`资源 ${resourceId} 必须保留实际 resourcesKey 字符串。`);
  else if (observed.resourcesKey !== expectedKey) errors.push(`资源 ${resourceId} 的实际 resourcesKey 与路径计算结果不一致。`);

  if (!Array.isArray(observed.resourcesMatches)) {
    errors.push(`资源 ${resourceId} 的 resourcesMatches 必须是完整数组。`);
  } else {
    validateResourcesMatches(observed.resourcesMatches, expectedKey, resourceId, errors);
  }
  if (!isRecord(observed.addressables) || typeof observed.addressables.configured !== "boolean") {
    errors.push(`资源 ${resourceId} 必须保留 Addressables configured 实际状态。`);
  } else if (observed.addressables.configured) {
    if (!isNonEmptyString(observed.addressables.address) || !isNonEmptyString(observed.addressables.group)) {
      errors.push(`资源 ${resourceId} 的已配置 Addressables 必须包含实际 address 与 group。`);
    }
  } else if ((observed.addressables.address !== "" && observed.addressables.address != null)
    || (observed.addressables.group !== "" && observed.addressables.group != null)) {
    errors.push(`资源 ${resourceId} 声明 Addressables 未配置时不能保留伪造的 address 或 group。`);
  }
}

/** 验证 Resources 实际同键资产集合，拒绝缺失、重复、错误路径和跨目录重名。 */
function validateResourcesMatches(matches, expectedKey, resourceId, errors) {
  const seenPaths = new Set();
  for (const match of matches) {
    if (!isRecord(match) || !isProjectAssetPath(match.assetPath) || !isGuid(match.assetGuid)) {
      errors.push(`资源 ${resourceId} 的 resourcesMatches 含损坏资产身份。`);
      continue;
    }
    if (seenPaths.has(match.assetPath)) errors.push(`资源 ${resourceId} 的 resourcesMatches 重复路径 ${match.assetPath}。`);
    seenPaths.add(match.assetPath);
    const info = getResourcesPathInfo(match.assetPath);
    if (info.directoryCount !== 1 || info.key !== expectedKey || !expectedKey) {
      errors.push(`资源 ${resourceId} 的 resourcesMatches 包含不属于当前动态键的资产。`);
    }
  }
}

/** 按静态引用、Resources 键或已配置 Addressables 地址逐项验证声明和实测事实。 */
function compareLoadingMode(asset, observed, resourceId, errors) {
  if (!isRecord(asset.loading)) return;
  const mode = asset.loading.mode;
  if (mode === "SERIALIZED") {
    if (observed.resourcesKey !== "") errors.push(`SERIALIZED 资源 ${resourceId} 的实际路径位于 Resources 目录。`);
    return;
  }
  if (mode === "RESOURCES") {
    const pathInfo = getResourcesPathInfo(observed.assetPath);
    if (pathInfo.directoryCount > 1) errors.push(`RESOURCES 资源 ${resourceId} 位于嵌套 Resources 目录。`);
    if (pathInfo.directoryCount !== 1 || pathInfo.key !== asset.loading.key) {
      errors.push(`RESOURCES 资源 ${resourceId} 的声明 key 与实际路径不一致。`);
    }
    if (observed.resourcesKey !== asset.loading.key) errors.push(`RESOURCES 资源 ${resourceId} 的实际 resourcesKey 与声明 key 不一致。`);
    const matches = Array.isArray(observed.resourcesMatches) ? observed.resourcesMatches : [];
    if (matches.length !== 1) errors.push(`RESOURCES 资源 ${resourceId} 的实际动态键必须唯一，当前匹配 ${matches.length} 项。`);
    else if (matches[0]?.assetPath !== observed.assetPath
      || !isGuid(matches[0]?.assetGuid) || !isGuid(observed.assetGuid)
      || matches[0].assetGuid.toLowerCase() !== observed.assetGuid.toLowerCase()) {
      errors.push(`RESOURCES 资源 ${resourceId} 的唯一键匹配项与目标资产身份不一致。`);
    }
    return;
  }
  if (mode === "ADDRESSABLES") {
    const addressables = observed.addressables;
    if (!isRecord(addressables) || addressables.configured !== true) {
      errors.push(`ADDRESSABLES 资源 ${resourceId} 没有实际配置的 Addressables entry。`);
      return;
    }
    if (addressables.address !== asset.loading.key) errors.push(`ADDRESSABLES 资源 ${resourceId} 的实际 address 与声明 key 不一致。`);
  }
}
