import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  canonicalizeJson,
  compileJsonJob,
  initializeDocs,
  main,
  sha256File,
} from "../../unity-development-workflow/scripts/workflow-files.mjs";

/** 创建并在用例结束后清理临时项目目录。 */
function withProject(callback) {
  const root = mkdtempSync(resolve(tmpdir(), "unity-workflow-node-"));
  mkdirSync(resolve(root, "Assets"));
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("初始化核心文档并拒绝隐式覆盖", () => withProject((root) => {
  const written = initializeDocs({ projectRoot: root, projectId: "demo-game" });
  assert.equal(written.length, 4);
  assert.match(readFileSync(resolve(root, "docs/project-profile.yaml"), "utf8"), /^projectId: demo-game$/m);
  assert.throws(() => initializeDocs({ projectRoot: root, projectId: "demo-game" }), /拒绝覆盖/);
}));

test("SHA-256 使用文件原始字节", () => withProject((root) => {
  const file = resolve(root, "value.txt");
  writeFileSync(file, "abc");
  assert.equal(sha256File(file), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}));

test("JSON Job 绑定源文件与规范化 payload", () => withProject((root) => {
  const source = resolve(root, "Artifacts/input.json");
  const output = resolve(root, "Artifacts/output.job.json");
  mkdirSync(resolve(root, "Artifacts"));
  writeFileSync(source, '{"z":2,"a":{"b":1}}\n');
  compileJsonJob({ projectRoot: root, kind: "image-task", source, output });
  const job = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(job.sourcePath, "Artifacts/input.json");
  assert.equal(canonicalizeJson(job.payload), '{"a":{"b":1},"z":2}');
  assert.match(job.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(job.payloadSha256, /^[a-f0-9]{64}$/);
}));

test("子命令拒绝未知参数", () => {
  assert.throws(() => main(["sha256", "--file", "missing.txt", "--typo", "value"]), /未知参数：--typo/);
});
