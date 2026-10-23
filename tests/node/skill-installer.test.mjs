import assert from "node:assert/strict";
import { copyFileSync, existsSync, readFileSync, readdirSync, symlinkSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parse, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const INSTALLER_PATH = resolve(ROOT, "scripts/install-project-skills.mjs");
// 逐项核对实际安装集合，防止新增技能仅能在仓库中发现而遗漏安装交付。
const EXPECTED_SKILL_NAMES = [
  "unity-game-workflow-control", "unity-development-workflow", "unity-game-grilling", "unity-game-3d-modeling", "unity-game-3d-texturing", "unity-game-3d-rigging", "unity-game-3d-animation", "unity-game-architecture", "unity-game-audio", "unity-game-balance", "unity-game-production", "unity-game-qa-performance", "unity-game-release", "unity-game-visual-assets", "unity-game-spine-reskin", "unity-game-2d-rigging", "unity-game-2d-animation-ta", "unity-gameplay-development", "unity-game-juice",
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
  assert.ok(existsSync(resolve(targetRoot, "unity-game-3d-rigging/SKILL.md")));
  assert.ok(existsSync(resolve(targetRoot, "unity-game-3d-animation/SKILL.md")));
  assert.ok(existsSync(resolve(targetRoot, "unity-development-workflow/references/3d-character-handoff.md")));
  assert.ok(existsSync(resolve(targetRoot, "unity-development-workflow/references/3d-character-unity-import.md")));
}));

test("安装器默认替换本地修改和过时文件，保留清单外技能", () => withTempDirectory((root) => {
  assert.equal(runInstaller([root]).status, 0);
  const target = resolve(root, ".agents/skills/unity-game-audio/SKILL.md");
  const obsolete = resolve(root, ".agents/skills/unity-game-audio/obsolete.txt");
  const unrelated = resolve(root, ".agents/skills/custom-skill/SKILL.md");
  writeFileSync(target, "本地修改", "utf8");
  writeFileSync(obsolete, "上个版本残留文件", "utf8");
  mkdirSync(resolve(unrelated, ".."), { recursive: true });
  writeFileSync(unrelated, "独立技能", "utf8");
  const replaced = runInstaller([root]);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.equal(readFileSync(target, "utf8"), readFileSync(resolve(ROOT, "unity-game-audio/SKILL.md"), "utf8"));
  assert.equal(existsSync(obsolete), false);
  assert.equal(readFileSync(unrelated, "utf8"), "独立技能");
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
  const result = runInstaller([linked]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是符号链接或目录联接/);
  assert.equal(existsSync(resolve(actual, ".agents")), false);
}));

/** 创建不依赖仓库内容的最小安装包，以验证重叠路径被拒绝时不会删除安装源。 */
function createTestPackage(packageRoot) {
  mkdirSync(resolve(packageRoot, "scripts"), { recursive: true });
  const script = resolve(packageRoot, "scripts/install-project-skills.mjs");
  copyFileSync(INSTALLER_PATH, script);
  for (const name of EXPECTED_SKILL_NAMES) {
    mkdirSync(resolve(packageRoot, name), { recursive: true });
    writeFileSync(resolve(packageRoot, name, "SKILL.md"), "安装源：" + name, "utf8");
  }
  return script;
}

test("安装源与目标相同或相互包含时，在覆盖前拒绝并保留源文件", () => withTempDirectory((root) => {
  const cases = [
    { packageRoot: resolve(root, "same/.agents/skills"), projectRoot: resolve(root, "same") },
    { packageRoot: resolve(root, "target-inside-source/package"), projectRoot: resolve(root, "target-inside-source/package/unity-development-workflow") },
    { packageRoot: resolve(root, "source-inside-target/.agents/skills/unity-development-workflow/package"), projectRoot: resolve(root, "source-inside-target") },
  ];
  for (const { packageRoot, projectRoot } of cases) {
    const script = createTestPackage(packageRoot);
    const result = spawnSync(process.execPath, [script, projectRoot], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /安装源与目标不能重叠/);
    assert.equal(readFileSync(resolve(packageRoot, "unity-development-workflow/SKILL.md"), "utf8"), "安装源：unity-development-workflow");
    assert.equal(existsSync(script), true);
  }
}));

test("同名Skill链接在任何覆盖发生前被拒绝，链接外内容保留", () => withTempDirectory((root) => {
  const projectRoot = resolve(root, "project");
  const targetRoot = resolve(projectRoot, ".agents/skills");
  const outside = resolve(root, "outside");
  mkdirSync(targetRoot, { recursive: true });
  mkdirSync(outside);
  writeFileSync(resolve(outside, "sentinel.txt"), "保留", "utf8");
  symlinkSync(outside, resolve(targetRoot, "unity-game-audio"), process.platform === "win32" ? "junction" : "dir");
  const result = runInstaller([projectRoot]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /不能是符号链接或目录联接/);
  assert.equal(readFileSync(resolve(outside, "sentinel.txt"), "utf8"), "保留");
  assert.equal(existsSync(resolve(targetRoot, "unity-game-workflow-control")), false);
}));
