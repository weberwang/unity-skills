import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, symlinkSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parse, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const INSTALLER_PATH = resolve(ROOT, "scripts/install-project-skills.mjs");
const EXPECTED_SKILL_NAMES = [
  "unity-game-build-player-character", "unity-development-workflow", "unity-game-grilling", "unity-game-3d-modeling", "unity-game-3d-texturing", "unity-game-architecture", "unity-game-audio", "unity-game-balance", "unity-game-production", "unity-game-qa-performance", "unity-game-release", "unity-game-visual-assets", "unity-game-spine-reskin", "unity-gameplay-development",
];

/** 创建短生命周期的临时项目目录，并在测试回调结束后清理。 */
function withTempDirectory(callback) {
  const path = resolve(tmpdir(), `unity-installer-node-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path, { recursive: true });
  try { return callback(path); } finally { rmSync(path, { recursive: true, force: true }); }
}

/** 调用真实 Node 安装入口，保留 stdout、stderr 和退出码供断言。 */
function runInstaller(args) {
  const result = spawnSync(process.execPath, [INSTALLER_PATH, ...args], { cwd: ROOT, encoding: "utf8" });
  return result;
}

test("安装器复制全部已发现 Skill", () => withTempDirectory((root) => {
  const result = runInstaller([root]);
  assert.equal(result.status, 0, result.stderr);
  const targetRoot = resolve(root, ".agents/skills");
  assert.deepEqual(readdirSync(targetRoot).sort(), [...EXPECTED_SKILL_NAMES].sort());
  assert.ok(existsSync(resolve(targetRoot, "unity-development-workflow/SKILL.md")));
  assert.ok(existsSync(resolve(targetRoot, "unity-game-3d-modeling/SKILL.md")));
  assert.ok(existsSync(resolve(targetRoot, "unity-game-3d-texturing/SKILL.md")));
}));

test("安装器默认拒绝覆盖、force 替换本地修改", () => withTempDirectory((root) => {
  assert.equal(runInstaller([root]).status, 0);
  const target = resolve(root, ".agents/skills/unity-game-audio/SKILL.md");
  writeFileSync(target, "本地修改", "utf8");
  const refused = runInstaller([root]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /拒绝覆盖/);
  assert.equal(readFileSync(target, "utf8"), "本地修改");
  const replaced = runInstaller([root, "--force"]);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.equal(readFileSync(target, "utf8"), readFileSync(resolve(ROOT, "unity-game-audio/SKILL.md"), "utf8"));
}));

test("安装器拒绝文件系统根目录", () => {
  const result = runInstaller([parse(ROOT).root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是文件系统根目录/);
});

test("安装器拒绝符号链接项目根目录", () => withTempDirectory((root) => {
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
