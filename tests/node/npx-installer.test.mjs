import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parse, relative, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE_PATH = resolve(ROOT, "package.json");
const INSTALLER_PATH = resolve(ROOT, "scripts/install-project-skills.mjs");
const EXPECTED_SKILL_NAMES = [
  "unity-game-build-player-character", "unity-development-workflow", "unity-game-grilling", "unity-game-3d-modeling", "unity-game-3d-texturing", "unity-game-architecture", "unity-game-audio", "unity-game-balance", "unity-game-production", "unity-game-qa-performance", "unity-game-release", "unity-game-visual-assets", "unity-game-spine-reskin", "unity-gameplay-development",
];

/** 创建短生命周期的临时项目目录，并在回调结束后清理测试副本。 */
function withTempDirectory(callback) {
  const path = resolve(tmpdir(), `unity-npx-node-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path, { recursive: true });
  try { return callback(path); } finally { rmSync(path, { recursive: true, force: true }); }
}

/** 执行 npx 安装器本体，统一返回最终用户可见的输出与退出码。 */
function runInstaller(args) {
  return spawnSync(process.execPath, [INSTALLER_PATH, ...args], { cwd: ROOT, encoding: "utf8" });
}

/** 递归收集 Skill 目录中的普通文件，用于核对安装产物未丢失。 */
function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

test("根 npm 包暴露单一 npx 入口", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(packageJson.name, "unity-skills");
  assert.equal(packageJson.type, "module");
  assert.deepEqual(packageJson.bin, { "unity-skills": "./scripts/install-project-skills.mjs" });
  assert.equal(packageJson.engines.node, ">=22.20.0");
  assert.deepEqual(packageJson.files, ["scripts/install-project-skills.mjs", ...EXPECTED_SKILL_NAMES]);
});

test("npx 安装器绑定固定 Skill 白名单", () => {
  const source = readFileSync(INSTALLER_PATH, "utf8");
  const allowlist = source.match(/const SKILL_NAMES = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.match(source, /const PACKAGE_ROOT/);
  assert.ok(allowlist);
  const installedNames = [...allowlist[1].matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(installedNames, EXPECTED_SKILL_NAMES);
  assert.match(source, /resolve\(projectRoot, "\.agents"\)/);
  assert.match(source, /cpSync\(source, target/);
  assert.doesNotMatch(source, /skills@/);
});

test("npx 安装器帮助使用短命令", () => {
  const result = runInstaller(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /npx -y github:weberwang\/unity-skills/);
});

test("npx 安装器拒绝文件系统根目录", () => {
  const result = runInstaller([parse(ROOT).root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是文件系统根目录/);
});

test("npx 安装器复制当前包并要求 force", () => withTempDirectory((root) => {
  const first = runInstaller([root]);
  assert.equal(first.status, 0, first.stderr);
  const targetRoot = resolve(root, ".agents/skills");
  assert.deepEqual(readdirSync(targetRoot).sort(), [...EXPECTED_SKILL_NAMES].sort());
  for (const name of EXPECTED_SKILL_NAMES) {
    const sourceRoot = resolve(ROOT, name);
    const sourceFiles = listFiles(sourceRoot).map((path) => relative(sourceRoot, path)).sort();
    const targetFiles = listFiles(resolve(targetRoot, name)).map((path) => relative(resolve(targetRoot, name), path)).sort();
    assert.deepEqual(targetFiles, sourceFiles);
    for (const relativePath of sourceFiles) assert.deepEqual(readFileSync(resolve(targetRoot, name, relativePath)), readFileSync(resolve(sourceRoot, relativePath)));
  }
  const modified = resolve(targetRoot, "unity-game-audio/SKILL.md");
  writeFileSync(modified, "本地修改", "utf8");
  const refused = runInstaller([root]);
  assert.equal(refused.status, 1);
  assert.equal(readFileSync(modified, "utf8"), "本地修改");
  const replaced = runInstaller([root, "--force"]);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.deepEqual(readFileSync(modified), readFileSync(resolve(ROOT, "unity-game-audio/SKILL.md")));
}));

test("npx 安装器拒绝符号链接项目根目录", () => withTempDirectory((root) => {
  const actual = resolve(root, "actual");
  const linked = resolve(root, "linked");
  mkdirSync(actual);
  try {
    symlinkSync(actual, linked, "junction");
  } catch {
    return;
  }
  const result = runInstaller([linked, "--force"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是符号链接或目录联接/);
  assert.equal(existsSync(resolve(actual, ".agents")), false);
}));
