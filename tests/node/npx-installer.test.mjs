import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, parse, relative, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../..");
const PACKAGE_PATH = resolve(ROOT, "package.json");
const INSTALLER_PATH = resolve(ROOT, "scripts/install-project-skills.mjs");
// 打包白名单与实际安装产物同时校验，确保技能及其参考文件完整交付。
const EXPECTED_SKILL_NAMES = [
  "unity-game-workflow-control", "unity-development-workflow", "unity-game-grilling", "unity-game-3d-modeling", "unity-game-3d-texturing", "unity-game-3d-rigging", "unity-game-3d-animation", "unity-game-architecture", "unity-game-audio", "unity-game-balance", "unity-game-production", "unity-game-qa-performance", "unity-game-release", "unity-game-visual-assets", "unity-game-spine-reskin", "unity-game-2d-rigging", "unity-game-2d-animation-ta", "unity-gameplay-development", "unity-game-juice",
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

/** 把 Markdown 标题转换为可供本地链接检查的锚点，并为同名标题追加序号。 */
function addHeadingAnchor(anchors, duplicateCounts, heading) {
  const slug = heading
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
  let duplicateIndex = duplicateCounts.get(slug) ?? 0;
  let anchor = duplicateIndex === 0 ? slug : `${slug}-${duplicateIndex}`;
  // 不同标题可能产生同一基础 slug 或与重复标题后缀碰撞，统一跳过已占用锚点。
  while (anchors.has(anchor)) {
    duplicateIndex += 1;
    anchor = `${slug}-${duplicateIndex}`;
  }
  duplicateCounts.set(slug, duplicateIndex + 1);
  anchors.add(anchor);
}

/** 读取 Markdown 标题和显式 HTML id/name；代码围栏内的示例不算真实锚点。 */
function readMarkdownAnchors(path) {
  const anchors = new Set();
  const duplicateCounts = new Map();
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let fenceMarker;
  let fenceLength = 0;
  let setextCandidate;

  for (const line of lines) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      if (!fenceMarker) {
        fenceMarker = marker;
        fenceLength = fence[1].length;
      } else if (marker === fenceMarker && fence[1].length >= fenceLength && /^\s*$/.test(line.slice(fence[0].length))) {
        fenceMarker = undefined;
        fenceLength = 0;
      }
      setextCandidate = undefined;
      continue;
    }
    if (fenceMarker) continue;

    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      addHeadingAnchor(anchors, duplicateCounts, heading[1]);
      setextCandidate = undefined;
    } else if (/^ {0,3}(?:=+|-+)\s*$/.test(line) && setextCandidate) {
      addHeadingAnchor(anchors, duplicateCounts, setextCandidate);
      setextCandidate = undefined;
    } else {
      setextCandidate = line.trim() && !/^\s*</.test(line) ? line.trim() : undefined;
    }

    // 显式 id/name 可放在任意 HTML 元素上；先去掉行内代码和 HTML 注释，避免示例被当成真实目标。
    const htmlLine = line.replace(/`+[^`]*`+/g, "").replace(/<!--.*?-->/g, "");
    for (const match of htmlLine.matchAll(/<[^>]*\b(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi)) {
      anchors.add(match[1] ?? match[2] ?? match[3]);
    }
  }

  return anchors;
}

/** 解析本地 Markdown 引用，并在锚点比对前解码 URL fragment。 */
function resolveMarkdownReference(document, destination) {
  const fragmentIndex = destination.indexOf("#");
  const localPath = fragmentIndex < 0 ? destination : destination.slice(0, fragmentIndex);
  let fragment = "";
  if (fragmentIndex >= 0) {
    try {
      fragment = decodeURIComponent(destination.slice(fragmentIndex + 1));
    } catch {
      assert.fail(`引用片段不是有效 URL 编码：${document} -> ${destination}`);
    }
  }
  return { target: localPath ? resolve(dirname(document), localPath) : document, fragment };
}

test("Markdown 锚点读取支持中文、重复标题与显式 HTML 锚点并忽略代码围栏", () => {
  const path = resolve(tmpdir(), `unity-markdown-anchor-${process.pid}-${Date.now()}.md`);
  writeFileSync(path, [
    "## 角色交接",
    "## 重复标题",
    "## 重复标题",
    "## 重复标题-1",
    "## 间隔  标题",
    "## 间隔--标题",
    "## cafe\u0301",
    "```md",
    "## 代码中的假标题",
    "<span id=\"代码中的假锚点\"></span>",
    "```",
    "<span id=\"显式锚点\"></span>",
    "<a name='旧式锚点'></a>",
  ].join("\n"), "utf8");
  try {
    const anchors = readMarkdownAnchors(path);
    assert.ok(anchors.has("角色交接"));
    assert.ok(anchors.has("重复标题"));
    assert.ok(anchors.has("重复标题-1"));
    assert.ok(anchors.has("重复标题-1-1"));
    assert.ok(anchors.has("间隔--标题"));
    assert.ok(anchors.has("间隔--标题-1"));
    assert.ok(anchors.has("cafe\u0301"));
    assert.ok(!anchors.has("代码中的假标题"));
    assert.ok(!anchors.has("代码中的假锚点"));
    assert.ok(anchors.has("显式锚点"));
    assert.ok(anchors.has("旧式锚点"));
    const selfLink = resolveMarkdownReference(path, "#%E8%A7%92%E8%89%B2%E4%BA%A4%E6%8E%A5");
    assert.equal(selfLink.target, path);
    assert.ok(readMarkdownAnchors(selfLink.target).has(selfLink.fragment));
  } finally {
    rmSync(path, { force: true });
  }
});

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
  assert.match(result.stdout, /默认覆盖/);
  assert.doesNotMatch(result.stdout, /--force/);
});

test("npx 安装器拒绝文件系统根目录", () => {
  const result = runInstaller([parse(ROOT).root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是文件系统根目录/);
});

test("npx 安装器首次安装与默认覆盖均完整复制当前包", () => withTempDirectory((root) => {
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
  const replaced = runInstaller([root]);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.deepEqual(readFileSync(modified), readFileSync(resolve(ROOT, "unity-game-audio/SKILL.md")));
}));

test("安装后的 2D/3D 骨骼、动画技能及协作引用可达", () => withTempDirectory((root) => {
  const result = runInstaller([root]);
  assert.equal(result.status, 0, result.stderr);
  const targetRoot = resolve(root, ".agents/skills");
  const documents = [
    ...listFiles(resolve(targetRoot, "unity-development-workflow/references")).filter((path) => path.endsWith(".md")),
    ...["unity-game-3d-modeling", "unity-game-3d-texturing", "unity-game-3d-rigging", "unity-game-3d-animation"]
      .flatMap((name) => listFiles(resolve(targetRoot, name)).filter((path) => path.endsWith(".md"))),
    resolve(targetRoot, "unity-development-workflow/references/3d-character-handoff.md"),
    resolve(targetRoot, "unity-development-workflow/references/3d-character-unity-import.md"),
    resolve(targetRoot, "unity-development-workflow/references/animation-intent-contract.md"),
    ...listFiles(resolve(targetRoot, "unity-game-2d-rigging")).filter((path) => path.endsWith(".md")),
    ...listFiles(resolve(targetRoot, "unity-game-2d-animation-ta")).filter((path) => path.endsWith(".md")),
    resolve(targetRoot, "unity-development-workflow/references/2d-animation-collaboration.md"),
    ...["unity-development-workflow", "unity-game-production", "unity-game-visual-assets", "unity-gameplay-development", "unity-game-qa-performance"]
      .map((name) => resolve(targetRoot, name, "SKILL.md")),
  ];
  // 在真实安装副本中解析本地链接，发现遗漏参考文件或只能在仓库根目录工作的路径。
  for (const document of documents) {
    const text = readFileSync(document, "utf8");
    for (const [, destination] of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith("//")) continue;
      const { target, fragment } = resolveMarkdownReference(document, destination);
      const targetRelative = relative(targetRoot, target);
      assert.ok(!targetRelative.startsWith(".."), `引用超出安装集合：${destination}`);
      assert.ok(existsSync(target), `安装产物缺少引用：${destination}`);
      if (fragment) {
        assert.ok(readMarkdownAnchors(target).has(fragment), `安装产物缺少 Markdown 锚点：${document} -> ${destination}（#${fragment}）`);
      }
    }
  }
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
  const result = runInstaller([linked]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不能是符号链接或目录联接/);
  assert.equal(existsSync(resolve(actual, ".agents")), false);
}));
