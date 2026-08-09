#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_FILES = Object.freeze(["project-profile.yaml", "GDD.md", "TDD.md", "control-plane.md"]);
const OPTIONAL_FILES = Object.freeze({
  balance: ["balance.md"],
  assets: ["asset-register.yaml"],
  audio: ["audio-plan.md"],
  qa: ["qa-plan.md"],
  distribution: ["distribution-matrix.md"],
  release: ["release-checklist.md", "privacy-review.md", "third-party-notices.md"],
});
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,95}$/;

/** 解析 `--名称 值` 与布尔开关，拒绝位置参数和重复参数。 */
export function parseOptions(argumentsList) {
  const options = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const token = argumentsList[index];
    if (!token.startsWith("--")) throw new Error("不支持位置参数：" + token);
    const name = token.slice(2);
    if (options.has(name)) throw new Error("参数重复：--" + name);
    if (name === "force" || name === "help") {
      options.set(name, true);
      continue;
    }
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error("参数缺少值：--" + name);
    options.set(name, value);
    index += 1;
  }
  return options;
}

/** 取得必填参数。 */
function requireOption(options, name) {
  const value = options.get(name);
  if (typeof value !== "string" || value.length === 0) throw new Error("缺少参数：--" + name);
  return value;
}

/** 拒绝当前子命令不认识的参数，避免拼写错误被静默忽略。 */
function rejectUnknownOptions(options, allowedNames) {
  const unknown = [...options.keys()].filter((name) => !allowedNames.includes(name));
  if (unknown.length > 0) throw new Error("未知参数：" + unknown.map((name) => "--" + name).join("、"));
}

/** 校验项目根目录，避免文件操作扩大到磁盘根或符号链接。 */
export function validateProjectRoot(input) {
  const root = resolve(input);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("项目根目录不存在：" + root);
  if (dirname(root) === root) throw new Error("项目根目录不能是文件系统根目录。");
  if (lstatSync(root).isSymbolicLink()) throw new Error("项目根目录不能是符号链接或目录联接。");
  return root;
}

/** 确保目标位于项目内，且已有路径段不经过符号链接。 */
export function ensureInsideProject(path, projectRoot, label) {
  const absolute = resolve(path);
  const local = relative(projectRoot, absolute);
  if (local === "" || local.startsWith(".." + sep) || isAbsolute(local)) {
    throw new Error(label + "必须位于项目根目录内：" + absolute);
  }
  let cursor = projectRoot;
  for (const part of local.split(sep)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      throw new Error(label + "路径不能经过符号链接：" + cursor);
    }
  }
  return absolute;
}

/** 计算文件原始字节的 SHA-256。 */
export function sha256File(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error("文件不存在：" + absolute);
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}

/** 将 JSON 对象按键排序，生成与 Toolkit 一致的稳定哈希输入。 */
export function canonicalizeJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalizeJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalizeJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

/** 原子写入文本；临时文件严格位于目标目录。 */
function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".tmp-" + process.pid;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** 初始化核心或按阶段选择的项目文档。 */
export function initializeDocs({ projectRoot, projectId, include, force = false }) {
  const root = validateProjectRoot(projectRoot);
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error("项目 ID 格式无效。");
  const names = include === undefined ? CORE_FILES : include.split(",").filter(Boolean).flatMap((key) => {
    const files = OPTIONAL_FILES[key];
    if (files === undefined) throw new Error("不支持的交付物：" + key);
    return files;
  });
  const uniqueNames = [...new Set(names)];
  const targets = uniqueNames.map((name) => ensureInsideProject(resolve(root, "docs", name), root, "文档目标"));
  const existing = targets.filter(existsSync);
  if (existing.length > 0 && !force) throw new Error("拒绝覆盖已有文档：" + existing.map((path) => path.split(sep).at(-1)).join("、"));

  mkdirSync(resolve(root, "docs"), { recursive: true });
  for (let index = 0; index < uniqueNames.length; index += 1) {
    const name = uniqueNames[index];
    const source = name === "project-profile.yaml"
      ? resolve(SKILL_ROOT, "templates", name)
      : resolve(SKILL_ROOT, "templates", "project-docs", name);
    if (name === "project-profile.yaml") {
      const rendered = readFileSync(source, "utf8").replace(/^projectId: .+$/m, "projectId: " + projectId);
      writeAtomic(targets[index], rendered);
    } else {
      copyFileSync(source, targets[index]);
    }
  }
  return targets;
}

/** 将项目内 JSON 契约封装成 Toolkit 可校验的 JSON Job。 */
export function compileJsonJob({ projectRoot, kind, source, output }) {
  const root = validateProjectRoot(projectRoot);
  const sourcePath = ensureInsideProject(source, root, "源 JSON");
  const outputPath = ensureInsideProject(output, root, "输出 Job");
  const sourceBytes = readFileSync(sourcePath);
  let payload;
  try {
    payload = JSON.parse(sourceBytes.toString("utf8"));
  } catch (error) {
    throw new Error("源文件不是有效 JSON：" + error.message);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("源 JSON 根必须是对象。");
  const job = {
    schemaVersion: "1.0",
    kind,
    sourcePath: relative(root, sourcePath).split(sep).join("/"),
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    payloadSha256: createHash("sha256").update(canonicalizeJson(payload), "utf8").digest("hex"),
    compiledAtUtc: new Date().toISOString(),
    payload,
  };
  writeAtomic(outputPath, JSON.stringify(job, null, 2) + "\n");
  return outputPath;
}

/** 执行最小文件工具命令。 */
export function main(argumentsList = process.argv.slice(2)) {
  const command = argumentsList[0];
  const options = parseOptions(argumentsList.slice(1));
  if (command === "init-docs") {
    rejectUnknownOptions(options, ["project-root", "project-id", "include", "force"]);
    return initializeDocs({
      projectRoot: requireOption(options, "project-root"),
      projectId: requireOption(options, "project-id"),
      include: options.get("include"),
      force: options.get("force") === true,
    }).join("\n");
  }
  if (command === "sha256") {
    rejectUnknownOptions(options, ["file"]);
    return sha256File(requireOption(options, "file"));
  }
  if (command === "compile-json") {
    rejectUnknownOptions(options, ["project-root", "kind", "source", "output"]);
    return compileJsonJob({
      projectRoot: requireOption(options, "project-root"),
      kind: requireOption(options, "kind"),
      source: requireOption(options, "source"),
      output: requireOption(options, "output"),
    });
  }
  throw new Error("用法：workflow-files.mjs <init-docs|sha256|compile-json> [参数]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main());
  } catch (error) {
    console.error("文件工具失败：" + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
