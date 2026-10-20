import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import YAML from "yaml";

const root = resolve(import.meta.dirname, "../..");
const schema = JSON.parse(readFileSync(resolve(root, "unity-development-workflow/schemas/rigging-validation.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);

/** 每次返回独立的角色请求，避免缺陷用例修改其他检查的输入。 */
function request() {
  return YAML.parse(readFileSync(resolve(root, "unity-development-workflow/templates/rigging-validation.yaml"), "utf8"));
}

test("骨骼检查输入覆盖实际Prefab、动作循环与部件变体，不包含视觉通过声明", () => {
  const value = request();
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  value.visualStatus = "PASS";
  assert.equal(validate(value), false);
  delete value.visualStatus;
  value.variants = [];
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});

test("骨骼检查拒绝越界资产与可覆盖正式资源的报告目录", () => {
  for (const path of ["../Hero.prefab", "C:/Hero.prefab", "Packages/Hero.prefab", "Assets/../Hero.prefab", "Assets/Characters/../../Hero.prefab", "Assets//Hero.prefab", "Assets\\Hero.prefab"]) {
    const value = request(); value.prefabPath = path;
    assert.equal(validate(value), false, path);
  }
  for (const path of ["Assets/report.json", "Artifacts/../Assets/report.json", "Artifacts/sub/../../report.json", "Artifacts//report.json", "../report.json"]) {
    const value = request(); value.outputPath = path;
    assert.equal(validate(value), false, path);
  }
});

test("动作与变体需求不能丢失循环、事件、Sprite子资源身份", () => {
  const empty = request(); empty.clips = [];
  assert.equal(validate(empty), false);
  const missingLoop = request(); delete missingLoop.clips[0].loop;
  assert.equal(validate(missingLoop), false);
  const events = request(); events.clips[0].requiredEvents = ["OnContact", "OnContact"];
  assert.equal(validate(events), false);
  const sprite = request(); delete sprite.variants[0].spriteName;
  assert.equal(validate(sprite), false);
  const rootRenderer = request(); rootRenderer.variants[0].rendererPath = "";
  assert.equal(validate(rootRenderer), true, JSON.stringify(validate.errors));
});
