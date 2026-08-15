#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, normalize, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/** 审计 P3-002 玩家角色完整候选的技术文件和逐层证据门禁。 */

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const TARGET_RELATIVE_PATH = "Artifacts/Visual/P4/g1-v0.6/p3-002/v5/target-board/p3-002-v5-neutral-target-r3.png";
export let TARGET_SHA256 = "3c4da040649bd6f3a52dbd9ee423493ccd063b32619ed25a34a29334bbfb5ce6";
/** 测试或外部编排在重新绑定权威目标后更新目标摘要。 */
export function setTargetSha256(value) {
  TARGET_SHA256 = value;
}
export const EXPECTED_LAYERS = [
  ["Hair/Back", "curls-dark-back-v2", "hair-back-curls-dark-v2.png"],
  ["Body/Base", "skin-warm-medium-v2", "body-base-skin-warm-medium-v2.png"],
  ["Outfit/Bottom", "ivory-wide-leg-v2", "outfit-bottom-ivory-wide-leg-v2.png"],
  ["Shoes", "white-sneakers-v2", "shoes-white-sneakers-v2.png"],
  ["Outfit/Top", "creator-blue-jacket-cream-top-v2", "outfit-top-creator-blue-jacket-cream-top-v2.png"],
  ["Hair/Front", "curls-dark-front-v2", "hair-front-curls-dark-v2.png"],
  ["Face/Brows", "neutral-v2", "face-brows-neutral-v2.png"],
  ["Face/Brows", "raised-v2", "face-brows-raised-v2.png"],
  ["Face/Eyes", "open-brown-v2", "face-eyes-open-brown-v2.png"],
  ["Face/Eyes", "blink-v2", "face-eyes-blink-v2.png"],
  ["Face/Nose", "natural-medium-v2", "face-nose-natural-medium-v2.png"],
  ["Face/Mouth", "neutral-rose-v2", "face-mouth-neutral-rose-v2.png"],
  ["Face/Mouth", "smile-v2", "face-mouth-smile-v2.png"],
  ["Face/Mouth", "open-v2", "face-mouth-open-v2.png"],
  ["Face/Mouth", "frown-v2", "face-mouth-frown-v2.png"],
  ["Accessory/Necklace", "simple-chain-v2", "accessory-necklace-simple-chain-v2.png"],
  ["Accessory/Earrings", "simple-hoops-v2", "accessory-earrings-simple-hoops-v2.png"],
];
export const EXPECTED_LAYER_FILES = EXPECTED_LAYERS.map((layer) => layer[2]);
export const REQUIRED_LAYER_EVIDENCE_KEYS = ["layerPreview", "fullComposite", "threeBackgrounds", "targetDetailComparison", "occlusionLeak"];
export const EXPECTED_PROJECT_BASELINE_CHECK_IDS = [
  "authority.target-binding",
  "authority.approval-binding",
  "project.unity-root",
  "layers.runtime-set",
  "import.sprite-settings",
  "sprite-library.mapping",
  "sprite-atlas.membership",
  "prefab.references",
];
export const EXPECTED_VISUAL_REGION_IDS = ["full-body", "face", "hair", "shoulders-chest", "hands", "waist-hips", "pants-shoes"];
export const EXPECTED_VISUAL_STATE_IDS = ["neutral", "smile", "speaking", "frown", "blink", "raised-brows", "accessories-on", "accessories-off"];
export const EXPECTED_PROJECT_MARKERS = { packagesManifest: "Packages/manifest.json", projectVersion: "ProjectSettings/ProjectVersion.txt" };
export const EXPECTED_RUNTIME_ASSET_PATHS = {
  spriteLibrary: "Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteLib",
  spriteAtlas: "Assets/Art/Runtime/Characters/Player/PlayerCharacter.spriteatlasv2",
  playerPrefab: "Assets/Prefabs/Characters/Player/PlayerCharacter.prefab",
  performancePrefab: "Assets/Prefabs/Characters/Performance/DualCharacterPerformance.prefab",
};
export const PROJECT_BASELINE_SCHEMA_PATH = resolve(SCRIPT_DIRECTORY, "..", "schemas", "player-character-project-baseline.schema.json");

/** 解析工作区、项目基线、生产图层、逐项记录和可选报告路径。 */
export function parseArgs(argv = process.argv.slice(2)) {
  // 保留 --workspace/--baseline/--layers/--reviews/--report 五个稳定 CLI 参数。
  const args = {};
  const names = new Set(["workspace", "baseline", "layers", "reviews", "report"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--")) throw new Error(`未知参数：${argument}`);
    const key = argument.slice(2);
    if (!names.has(key)) throw new Error(`未知参数：${argument}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) throw new Error(`${argument} 必须提供路径`);
    args[key] = argv[++index];
  }
  for (const key of ["workspace", "baseline", "layers", "reviews"]) if (!args[key]) throw new Error(`缺少必需参数：--${key}`);
  return args;
}

/** 计算文件 SHA-256，避免读取摘要文件代替真实内容。 */
export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** 将路径转换为跨平台报告使用的 POSIX 形式。 */
function toPosix(path) {
  return normalize(String(path)).replaceAll("\\", "/");
}

/** 解析工作区内路径，并拒绝绝对路径或符号链接逃逸。 */
export function resolveInside(workspace, value) {
  const workspacePath = realPath(workspace);
  const raw = String(value);
  const candidate = isAbsolute(raw) ? resolve(raw) : resolve(workspacePath, raw);
  let resolvedCandidate;
  try {
    resolvedCandidate = resolveExistingParents(candidate);
  } catch {
    resolvedCandidate = candidate;
  }
  const relativePath = relative(workspacePath, resolvedCandidate);
  if (relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relativePath)) throw new Error(`路径越出工作区：${value}`);
  return resolvedCandidate;
}

/** 读取真实路径；Windows 下同步解析联接，避免证据目录逃逸。 */
function realPath(path) {
  return realpathSync(path);
}

/** 解析不存在路径的现有父级，确保符号链接父目录也参与边界检查。 */
function resolveExistingParents(path) {
  let current = path;
  const tail = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return path;
    tail.unshift(current.slice(parent.length + 1));
    current = parent;
  }
  return resolve(realpathSync(current), ...tail);
}

/** 直接读取 PNG IHDR，核对画布、位深和 RGBA 色彩类型。 */
export function inspectPng(path) {
  const header = readFileSync(path).subarray(0, 33);
  if (header.length < 33 || !header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error("不是有效 PNG 文件");
  if (header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG 缺少标准 IHDR");
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), bitDepth: header.readUInt8(24), colorType: header.readUInt8(25) };
}

/** 读取 YAML 映射，拒绝空文件和非映射根节点。 */
export function readYamlMapping(path) {
  const payload = YAML.parse(readFileSync(path, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("逐项记录根节点必须是映射");
  return payload;
}

/** 把 JSON Schema 路径格式化成稳定且易定位的字段路径。 */
export function formatJsonPath(instancePath) {
  if (!instancePath) return "$";
  return `$${instancePath.split("/").filter(Boolean).map((part) => {
    const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
    return /^\d+$/.test(decoded) ? `[${decoded}]` : `.${decoded}`;
  }).join("")}`;
}

/** 要求规范化对照项完整、唯一并保持合同顺序。 */
export function validateExpectedIds(items, key, expected, label, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${label} 必须是列表`);
    return;
  }
  const actual = items.filter((item) => item && typeof item === "object").map((item) => item[key]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label} 必须严格等于：${expected.join(", ")}`);
}

/** 递归重算基线内全部文件绑定，防止对照记录在项目变化后继续生效。 */
export function validateAllBindings(workspace, value, label, errors) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 2 && keys.includes("path") && keys.includes("sha256")) {
      validateBinding(workspace, value, label, errors);
      return;
    }
    for (const [key, nested] of Object.entries(value)) validateAllBindings(workspace, nested, `${label}.${key}`, errors);
  } else if (Array.isArray(value)) {
    value.forEach((nested, index) => validateAllBindings(workspace, nested, `${label}[${index}]`, errors));
  }
}

/** 读取 Unity meta 的稳定 GUID；格式异常时返回空值交由调用者阻断。 */
export function readUnityGuid(metaPath) {
  const match = readFileSync(metaPath, "utf8").match(/^guid:\s*([0-9a-f]{32})\s*$/m);
  return match?.[1] ?? null;
}

/** 核对记录 GUID 与真实 meta，避免只比较文件名却丢失 Unity 身份。 */
export function validateUnityGuid(workspace, payload, label, errors) {
  const meta = payload?.meta;
  const expectedGuid = payload?.guid;
  if (!meta || typeof meta.path !== "string") {
    errors.push(`${label} 缺少 meta 路径`);
    return;
  }
  let metaPath;
  try {
    metaPath = resolveInside(workspace, meta.path);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return;
  }
  if (!isFile(metaPath)) return;
  let actualGuid;
  try {
    actualGuid = readUnityGuid(metaPath);
  } catch (error) {
    errors.push(`${label} 无法读取 GUID：${error.message}`);
    return;
  }
  if (actualGuid !== expectedGuid) errors.push(`${label} GUID 与 meta 不一致`);
}

/** 校验当前项目基线的 Schema、固定矩阵、文件哈希、GUID 和汇总结论。 */
export function validateProjectBaseline(workspace, baselinePath, errors) {
  if (!isFile(baselinePath)) {
    errors.push(`项目基线不存在：${baselinePath}`);
    return null;
  }
  let payload;
  let schema;
  try {
    payload = readYamlMapping(baselinePath);
    schema = JSON.parse(readFileSync(PROJECT_BASELINE_SCHEMA_PATH, "utf8"));
  } catch (error) {
    errors.push(`无法读取项目基线或 Schema：${error.message}`);
    return null;
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  if (!ajv.validate(schema, payload)) {
    for (const error of ajv.errors ?? []) {
      const detail = error.keyword === "required" ? `must have required property '${error.params.missingProperty}'` : error.message;
      errors.push(`项目基线 ${formatJsonPath(error.instancePath)}: ${detail}`);
    }
    return payload;
  }

  const target = payload.authorityBindings.target;
  if (target.path !== TARGET_RELATIVE_PATH || target.sha256 !== TARGET_SHA256) errors.push("项目基线目标绑定与人物合同不一致");
  if (JSON.stringify(payload.visualComparison.target) !== JSON.stringify(target)) errors.push("视觉对照目标必须复用同一权威绑定");
  const layerValues = payload.layerMappings.map((item) => [item.category, item.label, item.filename]);
  if (JSON.stringify(layerValues) !== JSON.stringify(EXPECTED_LAYERS)) errors.push("项目基线的 17 项类别、标签或文件顺序与人物合同不一致");
  for (const mapping of payload.layerMappings) {
    const expectedRuntime = `Assets/Art/Runtime/Characters/Player/Sprites/${mapping.filename}`;
    if (mapping.runtime.path !== expectedRuntime) errors.push(`运行时图层路径与人物合同不一致：${mapping.filename}`);
    if (mapping.meta.path !== `${expectedRuntime}.meta`) errors.push(`运行时图层 meta 路径与人物合同不一致：${mapping.filename}`);
  }
  for (const [name, expectedPath] of Object.entries(EXPECTED_PROJECT_MARKERS)) if (payload.projectMarkers[name].path !== expectedPath) errors.push(`项目根标记路径不规范：${name}`);
  for (const [name, expectedPath] of Object.entries(EXPECTED_RUNTIME_ASSET_PATHS)) {
    const asset = payload.runtimeAssets[name];
    if (asset.asset.path !== expectedPath || asset.meta.path !== `${expectedPath}.meta`) errors.push(`Unity 运行时资产路径与人物合同不一致：${name}`);
  }
  const allGuids = [...payload.layerMappings.map((item) => item.guid), ...Object.values(payload.runtimeAssets).map((asset) => asset.guid)];
  if (allGuids.length !== new Set(allGuids).size) errors.push("项目基线包含重复 Unity GUID");
  validateExpectedIds(payload.checks, "checkId", EXPECTED_PROJECT_BASELINE_CHECK_IDS, "项目基线检查 ID", errors);
  validateExpectedIds(payload.visualComparison.regions, "id", EXPECTED_VISUAL_REGION_IDS, "视觉区域 ID", errors);
  validateExpectedIds(payload.visualComparison.states, "id", EXPECTED_VISUAL_STATE_IDS, "视觉状态 ID", errors);

  const comparisonItems = [...payload.checks, ...payload.visualComparison.regions, ...payload.visualComparison.states];
  const statuses = new Set(comparisonItems.map((item) => item.status));
  const expectedResult = statuses.has("MISSING") || statuses.has("UNREADABLE") ? "BLOCKED" : statuses.has("DIFFERENT") ? "DIFFERENCES_FOUND" : "MATCHED";
  const expectedStatus = expectedResult === "BLOCKED" ? "PLAYER_CHARACTER_BASELINE_BLOCKED" : "PLAYER_CHARACTER_BASELINE_AUDITED";
  if (payload.summary.result !== expectedResult || payload.status !== expectedStatus) errors.push("项目基线汇总结论与逐项状态不一致");
  if (expectedResult === "BLOCKED" && payload.summary.blockingReasons.length === 0) errors.push("阻断基线必须记录 blockingReasons");
  if (expectedResult === "BLOCKED") errors.push("项目基线仍有 MISSING 或 UNREADABLE，禁止进入候选审计");

  validateAllBindings(workspace, payload, "项目基线", errors);
  payload.layerMappings.forEach((mapping, index) => validateUnityGuid(workspace, mapping, `layerMappings[${index}]`, errors));
  Object.entries(payload.runtimeAssets).forEach(([name, asset]) => validateUnityGuid(workspace, asset, `runtimeAssets.${name}`, errors));
  return payload;
}

/** 兼容纯路径字符串和包含 path 字段的绑定对象。 */
export function extractPath(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.path === "string") return value.path;
  return null;
}

/** 验证路径与哈希绑定，并返回已解析文件。 */
export function validateBinding(workspace, binding, label, errors) {
  if (!binding || typeof binding !== "object" || typeof binding.path !== "string" || typeof binding.sha256 !== "string") {
    errors.push(`${label} ${binding && typeof binding === "object" ? "缺少 path 或 sha256" : "必须包含 path 和 sha256"}`);
    return null;
  }
  let path;
  try {
    path = resolveInside(workspace, binding.path);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return null;
  }
  if (!isFile(path)) {
    errors.push(`${label} 文件不存在：${binding.path}`);
    return null;
  }
  if (sha256(path) !== binding.sha256.toLowerCase()) errors.push(`${label} 哈希不一致：${binding.path}`);
  return path;
}

/** 收集显式标记为人物逐项审查的 YAML 记录。 */
export function collectLayerReviewRecords(reviewRoot, errors) {
  const records = [];
  if (!isDirectory(reviewRoot)) {
    errors.push(`逐项审查目录不存在：${reviewRoot}`);
    return records;
  }
  for (const path of walkFiles(reviewRoot).filter((item) => /\.(?:yaml|yml)$/i.test(item)).sort()) {
    try {
      const payload = readYamlMapping(path);
      if (payload.recordType === "PLAYER_CHARACTER_LAYER_REVIEW") records.push([path, payload]);
    } catch (error) {
      errors.push(`无法读取逐项记录 ${path}: ${error.message}`);
    }
  }
  return records;
}

/** 验证一份逐项记录并返回其输出文件名。 */
export function validateLayerReviewRecord(workspace, recordPath, payload, errors) {
  const prefix = toPosix(recordPath);
  if (payload.status !== "PLAYER_CHARACTER_LAYER_VISUAL_TECHNICAL_PASS") errors.push(`${prefix} 状态不是 PLAYER_CHARACTER_LAYER_VISUAL_TECHNICAL_PASS`);
  validateBinding(workspace, payload.master, `${prefix} master`, errors);
  const outputPath = validateBinding(workspace, payload.output, `${prefix} output`, errors);
  if (!payload.evidence || typeof payload.evidence !== "object" || Array.isArray(payload.evidence)) {
    errors.push(`${prefix} 缺少 evidence 映射`);
  } else {
    for (const key of REQUIRED_LAYER_EVIDENCE_KEYS) {
      const pathValue = extractPath(payload.evidence[key]);
      if (pathValue === null) {
        errors.push(`${prefix} 缺少证据 ${key}`);
        continue;
      }
      let evidencePath;
      try {
        evidencePath = resolveInside(workspace, pathValue);
      } catch (error) {
        errors.push(`${prefix} ${key}: ${error.message}`);
        continue;
      }
      if (!isFile(evidencePath)) errors.push(`${prefix} 证据不存在 ${key}: ${pathValue}`);
    }
  }
  if (!payload.reviews || typeof payload.reviews !== "object" || Array.isArray(payload.reviews)) errors.push(`${prefix} 缺少 reviews 映射`);
  else for (const discipline of ["visual", "technical", "ux"]) if (payload.reviews[discipline] !== "PASS") errors.push(`${prefix} ${discipline} 未通过`);
  if (typeof payload.category !== "string" || typeof payload.label !== "string") errors.push(`${prefix} 缺少 category 或 label`);
  return outputPath ? basename(outputPath) : null;
}

/** 执行目标、17 张图层和逐项审查证据的确定性审计。 */
export function audit(args) {
  const workspace = realPath(args.workspace);
  const errors = [];
  const layerResults = [];
  if (!isDirectory(workspace) || dirname(workspace) === workspace) throw new Error(`工作区无效：${workspace}`);
  const baselinePath = resolveInside(workspace, args.baseline);
  const baseline = validateProjectBaseline(workspace, baselinePath, errors);
  const target = resolveInside(workspace, TARGET_RELATIVE_PATH);
  if (!isFile(target)) errors.push(`批准目标不存在：${TARGET_RELATIVE_PATH}`);
  else if (sha256(target) !== TARGET_SHA256) errors.push("批准目标哈希变化，必须重新绑定用户批准");

  const layerRoot = resolveInside(workspace, args.layers);
  if (!isDirectory(layerRoot)) errors.push(`生产图层目录不存在：${layerRoot}`);
  else {
    for (const filename of EXPECTED_LAYER_FILES) {
      const path = resolve(layerRoot, filename);
      const result = { filename, path: toPosix(path) };
      if (!isFile(path)) {
        errors.push(`缺少生产图层：${filename}`);
        result.status = "PLAYER_CHARACTER_LAYER_FILE_MISSING";
        layerResults.push(result);
        continue;
      }
      let png;
      try { png = inspectPng(path); } catch (error) {
        errors.push(`PNG 无效 ${filename}: ${error.message}`);
        result.status = "PLAYER_CHARACTER_LAYER_FILE_INVALID";
        layerResults.push(result);
        continue;
      }
      Object.assign(result, png, { sha256: sha256(path), status: "PLAYER_CHARACTER_LAYER_FILE_TECHNICAL_PASS" });
      if (png.width !== 2048 || png.height !== 2048) {
        errors.push(`画布不是 2048x2048：${filename}`);
        result.status = "PLAYER_CHARACTER_LAYER_FILE_TECHNICAL_FAIL";
      }
      if (png.bitDepth !== 8 || png.colorType !== 6) {
        errors.push(`PNG 不是 8-bit RGBA：${filename}`);
        result.status = "PLAYER_CHARACTER_LAYER_FILE_TECHNICAL_FAIL";
      }
      layerResults.push(result);
    }
  }

  const reviewRoot = resolveInside(workspace, args.reviews);
  const records = collectLayerReviewRecords(reviewRoot, errors);
  const reviewedOutputs = [];
  for (const [recordPath, payload] of records) {
    const outputName = validateLayerReviewRecord(workspace, recordPath, payload, errors);
    if (outputName !== null) reviewedOutputs.push(outputName);
  }
  const duplicates = [...new Set(reviewedOutputs.filter((name, index) => reviewedOutputs.indexOf(name) !== index))].sort();
  if (duplicates.length > 0) errors.push(`逐项记录重复绑定输出：${duplicates.join(", ")}`);
  const missingReviews = EXPECTED_LAYER_FILES.filter((name) => !reviewedOutputs.includes(name)).sort();
  const unexpectedReviews = [...new Set(reviewedOutputs.filter((name) => !EXPECTED_LAYER_FILES.includes(name)))].sort();
  if (missingReviews.length > 0) errors.push(`缺少逐项审查：${missingReviews.join(", ")}`);
  if (unexpectedReviews.length > 0) errors.push(`存在未知输出审查：${unexpectedReviews.join(", ")}`);
  return {
    schemaVersion: "1.0",
    status: errors.length > 0 ? "PLAYER_CHARACTER_AUDIT_FAILED" : "PLAYER_CHARACTER_EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED",
    workspace: toPosix(workspace),
    projectBaseline: toPosix(baselinePath),
    projectBaselineResult: baseline?.summary?.result ?? null,
    target: TARGET_RELATIVE_PATH,
    expectedLayerCount: EXPECTED_LAYER_FILES.length,
    reviewRecordCount: records.length,
    layers: layerResults,
    errors,
  };
}

/** 执行审计、输出 JSON，并在阻断项存在时返回非零退出码。 */
export function main(argv = process.argv.slice(2)) {
  let args;
  let result;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log("用法：node audit_player_character.mjs --workspace <path> --baseline <path> --layers <path> --reviews <path> [--report <path>]");
      return 0;
    }
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  try {
    result = audit(args);
  } catch (error) {
    result = { schemaVersion: "1.0", status: "PLAYER_CHARACTER_AUDIT_FAILED", errors: [error instanceof Error ? error.message : String(error)] };
  }
  const serialized = JSON.stringify(result, null, 2);
  if (args?.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, `${serialized}\n`, "utf8");
  }
  console.log(serialized);
  return result.status === "PLAYER_CHARACTER_AUDIT_FAILED" ? 2 : 0;
}

/** 判断路径是否为普通文件；审计缺失证据时返回 false 而不中断汇总。 */
function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/** 判断路径是否为目录，统一处理目录不存在和权限异常。 */
function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** 提取跨平台路径的文件名，保持报告字段与 Python 版本一致。 */
function basename(path) {
  return String(path).split(/[\\/]/).at(-1);
}

/** 递归收集审查目录中的普通文件，并由调用方统一排序。 */
function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main();
