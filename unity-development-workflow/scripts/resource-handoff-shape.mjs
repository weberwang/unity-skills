const GUID_PATTERN = /^[a-fA-F0-9]{32}$/;
const REPORT_SOURCE = "UNITY_EDITOR_ASSET_DATABASE";
const EPSILON = 1e-4;

/** 判断输入是否为非数组对象，供损坏报告的安全分支使用。 */
export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 检查必需文本字段，拒绝空白字符冒充稳定身份。 */
export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** 校验 Unity GUID 的十六进制形状，不将其转换为可能失精度的数字。 */
export function isGuid(value) {
  return typeof value === "string" && GUID_PATTERN.test(value);
}

/** 校验 Unity 子资源 localId 的字符串整数形状，保留超大 ID 精度。 */
export function isLocalId(value) {
  return typeof value === "string" && /^-?[0-9]+$/.test(value);
}

/** 校验规范的 Unity 项目资产路径，拒绝绝对路径、反斜杠、冒号与越界段。 */
export function isProjectAssetPath(value) {
  if (typeof value !== "string" || !value.startsWith("Assets/") || value.includes("\\") || value.includes(":")) return false;
  const segments = value.split("/");
  return segments.length > 1 && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/** 从实际资产路径提取 Resources 加载键，并报告嵌套 Resources 目录。 */
export function getResourcesPathInfo(assetPath) {
  if (!isProjectAssetPath(assetPath)) return { validPath: false, directoryCount: 0, key: "" };
  const segments = assetPath.split("/");
  const directories = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === "Resources") directories.push(index);
  }
  if (directories.length !== 1) return { validPath: true, directoryCount: directories.length, key: "" };
  const relativeSegments = segments.slice(directories[0] + 1);
  const filename = relativeSegments.pop();
  const extensionIndex = filename.lastIndexOf(".");
  const basename = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return { validPath: true, directoryCount: 1, key: [...relativeSegments, basename].join("/") };
}

/** 仅接受可以往返解析且明确标为 UTC 的 ISO 时间。 */
export function isUtcTimestamp(value) {
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

/** 验证 AssetDatabase 检查报告共同信封，避免静态或失败报告进入下游合同。 */
export function validateInspectionEnvelope(report, errors) {
  const initialErrorCount = errors.length;
  if (!isRecord(report)) {
    errors.push("资源交接报告必须是对象。");
    return false;
  }
  if (report.schemaVersion !== "1.0") errors.push("资源交接报告 schemaVersion 必须为 1.0。");
  if (!isNonEmptyString(report.taskId)) errors.push("资源交接报告 taskId 必须是非空字符串。");
  if (!isSafeProjectJsonPath(report.outputPath)) errors.push("资源交接报告 outputPath 必须是安全的 POSIX 项目相对 JSON 路径。");
  if (!Array.isArray(report.assets)) errors.push("资源交接报告 assets 必须是数组，即使本次没有资源也要保留空数组。");
  if (!Array.isArray(report.animations)) errors.push("资源交接报告 animations 必须是数组，即使本次没有动画也要保留空数组。");
  if (report.measurementSource !== REPORT_SOURCE) errors.push(`资源交接报告 measurementSource 必须是 ${REPORT_SOURCE}。`);
  if (!isNonEmptyString(report.runId)) errors.push("资源交接报告 runId 必须是非空字符串。");
  if (!isUtcTimestamp(report.generatedAtUtc)) errors.push("资源交接报告 generatedAtUtc 必须是有效 UTC ISO 时间。");
  if (typeof report.message !== "string") errors.push("资源交接报告 message 必须保留为字符串。");
  if (!["MEASURED", "FAIL"].includes(report.status)) errors.push("资源交接报告 status 必须是 MEASURED 或 FAIL。");
  if (report.status === "FAIL") errors.push("资源交接报告 status 为 FAIL，不能作为通过证据。");
  return errors.length === initialErrorCount;
}

/** 校验项目相对 JSON 路径，拒绝绝对路径、Windows 分隔符及点路径段。 */
function isSafeProjectJsonPath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.includes(":")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    && segments.at(-1).toLowerCase().endsWith(".json");
}

/** 比较 Unity 浮点序列化产生的小误差，误差边界仅用于数值读回。 */
export function nearlyEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON;
}

/** 建立唯一 ID 索引，同时返回重复项诊断并保留首个有效记录。 */
export function indexRows(rows, idKey, label, errors) {
  if (!Array.isArray(rows)) {
    errors.push(`${label} 必须是数组。`);
    return new Map();
  }
  const byId = new Map();
  for (const row of rows) {
    if (!isRecord(row) || !isNonEmptyString(row[idKey])) {
      errors.push(`${label} 含缺少 ${idKey} 的记录。`);
      continue;
    }
    if (byId.has(row[idKey])) errors.push(`${label} 重复 ${idKey} ${row[idKey]}。`);
    else byId.set(row[idKey], row);
  }
  return byId;
}
