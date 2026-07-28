#!/usr/bin/env node

import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_NAMES = Object.freeze([
  "unity-development-workflow",
  "unity-game-architecture",
  "unity-game-audio",
  "unity-game-balance",
  "unity-game-production",
  "unity-game-qa-performance",
  "unity-game-release",
  "unity-game-visual-assets",
  "unity-gameplay-development",
]);

/**
 * 解析目标目录和显式覆盖授权。
 *
 * @returns {{ help: boolean, force: boolean, requestedPath: string | undefined }} 安装参数。
 */
function parseArguments() {
  let help = false;
  let force = false;
  let requestedPath;

  for (const argument of process.argv.slice(2)) {
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--force") {
      force = true;
    } else if (argument.startsWith("-")) {
      throw new Error("未知参数：" + argument);
    } else if (requestedPath === undefined) {
      requestedPath = argument;
    } else {
      throw new Error("最多只能传入一个目标项目目录。");
    }
  }

  return { help, force, requestedPath };
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
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error(label + "不能是符号链接或目录联接：" + path);
  }
}

/**
 * 校验 npm 包中固定的九个 Skill 完整存在。
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
 * @param {boolean} force 是否显式替换同名 Skill。
 * @returns {string[]} 安装后的绝对路径。
 */
function installSkills(projectRoot, force) {
  const sources = validateSources();
  const agentsRoot = resolve(projectRoot, ".agents");
  const targetRoot = resolve(agentsRoot, "skills");
  const targets = sources.map(({ name, source }) => ({ name, source, target: resolve(targetRoot, name) }));

  rejectSymbolicLink(agentsRoot, ".agents 目录");
  rejectSymbolicLink(targetRoot, "Skills 目录");
  for (const { target } of targets) {
    rejectSymbolicLink(target, "Skill 目标");
  }

  const existing = targets.filter(({ target }) => existsSync(target));
  if (existing.length > 0 && !force) {
    const names = existing.map(({ name }) => name).join("、");
    throw new Error("拒绝覆盖已有 Skills：" + names + "。如确需替换，请传入 --force。");
  }

  mkdirSync(targetRoot, { recursive: true });
  for (const { source, target } of targets) {
    if (existsSync(target)) {
      // --force 是用户显式授权；删除范围只限固定白名单中的同名 Skill 目录。
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
  const { help, force, requestedPath } = parseArguments();
  if (help) {
    console.log("用法：npx -y github:weberwang/unity-skills [目标项目目录] [--force]");
    return;
  }

  const projectRoot = parseTargetDirectory(requestedPath);
  const installed = installSkills(projectRoot, force);
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
