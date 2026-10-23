#!/usr/bin/env node

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 固定可安装技能范围，避免把仓库中的研究文档或临时目录复制到目标项目。
const SKILL_NAMES = Object.freeze([
  "unity-game-workflow-control",
  "unity-development-workflow",
  "unity-game-grilling",
  "unity-game-3d-modeling",
  "unity-game-3d-texturing",
  "unity-game-3d-rigging",
  "unity-game-3d-animation",
  "unity-game-architecture",
  "unity-game-audio",
  "unity-game-balance",
  "unity-game-production",
  "unity-game-qa-performance",
  "unity-game-release",
  "unity-game-visual-assets",
  "unity-game-spine-reskin",
  "unity-game-2d-rigging",
  "unity-game-2d-animation-ta",
  "unity-gameplay-development",
  "unity-game-juice",
]);

/**
 * 解析目标目录与帮助参数；安装默认替换清单内的同名 Skill。
 *
 * @returns {{ help: boolean, requestedPath: string | undefined }} 安装参数。
 */
function parseArguments() {
  let help = false;
  let requestedPath;

  for (const argument of process.argv.slice(2)) {
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new Error("未知参数：" + argument);
    } else if (requestedPath === undefined) {
      requestedPath = argument;
    } else {
      throw new Error("最多只能传入一个目标项目目录。");
    }
  }

  return { help, requestedPath };
}

/**
 * 解析目标项目目录，并拒绝不存在、非目录或文件系统根目录。
 *
 * @param {string | undefined} requestedPath 用户传入的目标目录。
 * @returns {string} 规范化后的绝对目录。
 */
function parseTargetDirectory(requestedPath) {
  const targetDirectory = resolve(requestedPath ?? process.cwd());

  if (!existsSync(targetDirectory) || !statSync(targetDirectory).isDirectory()) {
    throw new Error("目标项目目录不存在或不是目录：" + targetDirectory);
  }
  rejectSymbolicLink(targetDirectory, "目标项目目录");
  if (dirname(targetDirectory) === targetDirectory) {
    throw new Error("目标项目不能是文件系统根目录：" + targetDirectory);
  }

  return targetDirectory;
}

/**
 * 拒绝符号链接或 Windows Junction，避免覆盖操作越过目标项目边界。
 *
 * @param {string} path 待检查路径。
 * @param {string} label 错误信息中的路径标签。
 */
function rejectSymbolicLink(path, label) {
  let entry;
  try {
    entry = lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  // 失效链接同样不能作为安装目标，不能用 existsSync 的结果跳过链接检查。
  if (entry.isSymbolicLink()) {
    throw new Error(label + "不能是符号链接或目录联接：" + path);
  }
}

/** 判断已规范化的绝对路径是否位于指定目录内，包含目录自身。 */
function isWithinDirectory(directory, candidate) {
  const local = relative(directory, candidate);
  return local === "" || (local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local));
}

/** 在删除前检查全部安装目标，避免安装源被替换或复制进自身目录。 */
function validateInstallTargets(projectRoot, targets, sources) {
  for (const { target } of targets) {
    if (target === projectRoot || !isWithinDirectory(projectRoot, target)) {
      throw new Error("Skill 目标必须位于目标项目内：" + target);
    }
    rejectSymbolicLink(target, "Skill 目标");
    if (sources.some(({ source }) => isWithinDirectory(source, target) || isWithinDirectory(target, source))) {
      throw new Error("Skill 安装源与目标不能重叠：" + target);
    }
  }
}

/**
 * 校验 npm 包白名单中的 Skill 完整存在。
 *
 * @returns {Array<{ name: string, source: string }>} 已验证的安装源。
 */
function validateSources() {
  return SKILL_NAMES.map((name) => {
    const source = resolve(PACKAGE_ROOT, name);
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new Error("安装包缺少 Skill 目录：" + name);
    }
    if (!existsSync(resolve(source, "SKILL.md"))) {
      throw new Error("安装包缺少 Skill 入口：" + name + "/SKILL.md");
    }
    return { name, source };
  });
}

/**
 * 把当前 npx 包内的全部 Skills 复制到目标项目。
 *
 * @param {string} projectRoot 已验证的项目根目录。
 * @returns {string[]} 安装后的绝对路径。
 */
function installSkills(projectRoot) {
  const sources = validateSources();
  const agentsRoot = resolve(projectRoot, ".agents");
  const targetRoot = resolve(agentsRoot, "skills");
  const targets = sources.map(({ name, source }) => ({ name, source, target: resolve(targetRoot, name) }));

  rejectSymbolicLink(agentsRoot, ".agents 目录");
  rejectSymbolicLink(targetRoot, "Skills 目录");
  validateInstallTargets(projectRoot, targets, sources);

  mkdirSync(targetRoot, { recursive: true });
  for (const { source, target } of targets) {
    if (existsSync(target)) {
      // 完整替换清单内的同名目录，清除过时文件；删除范围已在写入前统一校验。
      rmSync(target, { recursive: true, force: true });
    }
    cpSync(source, target, { recursive: true, errorOnExist: true });
  }

  return targets.map(({ target }) => target);
}

/**
 * 执行安装并输出可审计的目标路径。
 */
function main() {
  const { help, requestedPath } = parseArguments();
  if (help) {
    console.log("用法：npx -y github:weberwang/unity-skills [目标项目目录]");
    console.log("默认覆盖 .agents/skills/ 中安装清单内的同名 Skill 目录。");
    return;
  }

  const projectRoot = parseTargetDirectory(requestedPath);
  const installed = installSkills(projectRoot);
  console.log("已安装 Unity 游戏协作 Skills：");
  for (const path of installed) {
    console.log(path);
  }
}

try {
  main();
} catch (error) {
  console.error("安装失败：" + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
