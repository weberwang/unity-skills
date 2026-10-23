import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateFrameAnimationHandoff } from "../../unity-development-workflow/scripts/frame-animation-contract.mjs";
import { validateResourceLoading } from "../../unity-development-workflow/scripts/resource-loading-contract.mjs";
import { makeFrameFixture, makeResourceFixture } from "./helpers/resource-frame-fixture.mjs";

const SCHEMA_DIRECTORY = resolve(import.meta.dirname, "../../unity-development-workflow/schemas");

/** 编译第三批公开的帧计划与实际读回报告格式，确保纯函数接口和 Schema 同步。 */
function handoffSchemaValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const common = JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, "common.schema.json"), "utf8"));
  const report = JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, "resource-handoff-inspection.schema.json"), "utf8"));
  const plan = JSON.parse(readFileSync(join(SCHEMA_DIRECTORY, "frame-animation-handoff.schema.json"), "utf8"));
  ajv.addSchema(common);
  ajv.addSchema(report);
  ajv.addSchema(plan);
  return {
    plan: ajv.getSchema(plan.$id),
    report: ajv.getSchema(`${report.$id}#/$defs/report`),
  };
}

/** 验证所有加载方式及画外归一化枢轴的合法完整读回可以通过。 */
test("三种资源加载声明和真实帧交接均通过", () => {
  const resources = makeResourceFixture();
  assert.deepEqual(validateResourceLoading(resources.register, resources.report), []);

  const frames = makeFrameFixture();
  assert.deepEqual(validateFrameAnimationHandoff(frames.plan, frames.report), []);

  const schemas = handoffSchemaValidators();
  const combinedReport = { ...resources.report, animations: frames.report.animations };
  assert.equal(schemas.plan(frames.plan), true, JSON.stringify(schemas.plan.errors));
  assert.equal(schemas.report(combinedReport), true, JSON.stringify(schemas.report.errors));
  assert.equal(schemas.report({ ...combinedReport, outputPath: "report.json" }), true, "根目录 JSON 报告路径应符合 Schema");
});

/** 检查正式登记缺少声明、Resources key 漂移和静态资源路径冲突。 */
test("资源合同拒绝缺失声明、动态键漂移及静态资源误入 Resources", () => {
  const missing = makeResourceFixture();
  delete missing.register.assets[0].loading;
  assert.match(validateResourceLoading(missing.register, missing.report).join("；"), /portrait-static.*loading/);

  const drift = makeResourceFixture();
  drift.register.assets[1].loading.key = "Buttons/launch";
  assert.match(validateResourceLoading(drift.register, drift.report).join("；"), /key 与实际路径不一致/);

  const misplaced = makeResourceFixture();
  misplaced.register.assets[0].path = "Assets/Resources/Characters/Hero.png";
  misplaced.report.assets[0].assetPath = misplaced.register.assets[0].path;
  misplaced.report.assets[0].resourcesKey = "Characters/Hero";
  assert.match(validateResourceLoading(misplaced.register, misplaced.report).join("；"), /SERIALIZED.*Resources/);

  const dynamicWithoutKey = makeResourceFixture();
  delete dynamicWithoutKey.register.assets[1].loading.key;
  assert.match(validateResourceLoading(dynamicWithoutKey.register, dynamicWithoutKey.report).join("；"), /必须显式声明 loading.key/);

  const serializedKey = makeResourceFixture();
  serializedKey.register.assets[0].loading.key = "portrait-static";
  assert.match(validateResourceLoading(serializedKey.register, serializedKey.report).join("；"), /SERIALIZED.*不应声明动态 key/);

  const unknownLoadingField = makeResourceFixture();
  unknownLoadingField.register.assets[1].loading.runtimeFallback = true;
  assert.match(validateResourceLoading(unknownLoadingField.register, unknownLoadingField.report).join("；"), /loading 含未知字段/);

  const invalidRegisterVersion = makeResourceFixture();
  invalidRegisterVersion.register.schemaVersion = "2.0";
  assert.match(validateResourceLoading(invalidRegisterVersion.register, invalidRegisterVersion.report).join("；"), /schemaVersion 必须为 1\.0/);
});

/** 验证同键跨目录冲突、Resources 嵌套和完整匹配清单的必要性。 */
test("Resources 合同拒绝跨目录重名、嵌套目录和损坏匹配清单", () => {
  const duplicate = makeResourceFixture();
  duplicate.report.assets[1].resourcesMatches.push({
    assetPath: "Assets/Shared/Resources/Buttons/start.png",
    assetGuid: "88888888888888888888888888888888",
  });
  assert.match(validateResourceLoading(duplicate.register, duplicate.report).join("；"), /必须唯一/);

  const nested = makeResourceFixture();
  nested.register.assets[1].path = "Assets/UI/Resources/Archive/Resources/start.png";
  nested.report.assets[1].assetPath = nested.register.assets[1].path;
  nested.report.assets[1].resourcesKey = "";
  nested.report.assets[1].resourcesMatches = [];
  assert.match(validateResourceLoading(nested.register, nested.report).join("；"), /嵌套 Resources/);

  const malformed = makeResourceFixture();
  malformed.report.assets[1].resourcesMatches = [{ assetPath: "../start.png", assetGuid: "bad" }];
  assert.match(validateResourceLoading(malformed.register, malformed.report).join("；"), /resourcesMatches 含损坏/);
});

/** 验证 Addressables 必须有真实 entry，通用登记 address 不能充当配置证据。 */
test("Addressables 静态地址不能代替真实配置与 Group 读回", () => {
  const missing = makeResourceFixture();
  missing.register.assets[2].address = "content/theme";
  missing.report.assets[2].addressables = { configured: false, address: "", group: "" };
  assert.match(validateResourceLoading(missing.register, missing.report).join("；"), /没有实际配置的 Addressables entry/);

  const noGroup = makeResourceFixture();
  noGroup.report.assets[2].addressables.group = "";
  assert.match(validateResourceLoading(noGroup.register, noGroup.report).join("；"), /必须包含实际 address 与 group/);
});

/** 允许控制面隐藏目录中的项目相对报告路径，并拒绝绝对或越界路径。 */
test("报告输出路径允许 workflow-control evidenceRoot 并阻断不安全路径", () => {
  const valid = makeResourceFixture();
  valid.report.outputPath = ".workflow-control/evidence/WI-ASSET/resource-handoff.json";
  assert.deepEqual(validateResourceLoading(valid.register, valid.report), []);

  const rootReport = makeResourceFixture();
  rootReport.report.outputPath = "report.json";
  assert.deepEqual(validateResourceLoading(rootReport.register, rootReport.report), []);

  for (const outputPath of [
    "/tmp/resource-handoff.json",
    "D:/evidence/resource-handoff.json",
    "Artifacts/../Assets/resource-handoff.json",
    ".workflow-control\\evidence\\resource-handoff.json",
    "reports/bad:name.json",
  ]) {
    const invalid = makeResourceFixture();
    invalid.report.outputPath = outputPath;
    assert.match(validateResourceLoading(invalid.register, invalid.report).join("；"), /outputPath 必须是安全的/);
  }

  const assetColon = makeResourceFixture();
  assetColon.report.assets[0].assetPath = "Assets/Characters/Hero:variant.png";
  assert.match(validateResourceLoading(assetColon.register, assetColon.report).join("；"), /实际 assetPath 不是规范 Assets 路径/);
});

/** 所有真实读回报告都必须保留两个数组，空闲类别使用空数组表达。 */
test("共同报告信封要求 assets 与 animations 数组同时存在", () => {
  const resourceOnly = makeResourceFixture();
  delete resourceOnly.report.animations;
  assert.match(validateResourceLoading(resourceOnly.register, resourceOnly.report).join("；"), /animations 必须是数组/);

  const animationOnly = makeFrameFixture();
  delete animationOnly.report.assets;
  assert.match(validateFrameAnimationHandoff(animationOnly.plan, animationOnly.report).join("；"), /assets 必须是数组/);
});

/** 检查登记与报告中的重复、缺失和未知资源身份都会阻断完整覆盖。 */
test("资源检查拒绝登记ID重复、报告重复、缺失及未知资源", () => {
  const repeatedRegister = makeResourceFixture();
  repeatedRegister.register.assets.push(structuredClone(repeatedRegister.register.assets[0]));
  assert.match(validateResourceLoading(repeatedRegister.register, repeatedRegister.report).join("；"), /重复 id portrait-static/);

  const duplicateReport = makeResourceFixture();
  duplicateReport.report.assets.push(structuredClone(duplicateReport.report.assets[0]));
  assert.match(validateResourceLoading(duplicateReport.register, duplicateReport.report).join("；"), /重复 resourceId portrait-static/);

  const missing = makeResourceFixture();
  missing.report.assets.pop();
  assert.match(validateResourceLoading(missing.register, missing.report).join("；"), /缺少正式资源 theme-addressable/);

  const unknown = makeResourceFixture();
  unknown.report.assets.push({ ...structuredClone(unknown.report.assets[0]), resourceId: "unlisted" });
  assert.match(validateResourceLoading(unknown.register, unknown.report).join("；"), /未知 resourceId unlisted/);

  const paddedStatus = makeResourceFixture();
  paddedStatus.register.assets[1].status = "VALIDATED ";
  paddedStatus.report.assets = paddedStatus.report.assets.filter((row) => row.resourceId !== "button-resource");
  assert.match(validateResourceLoading(paddedStatus.register, paddedStatus.report).join("；"), /status 必须是已知登记状态/);
});

/** 核对序列帧报告保持实际顺序，并比较同 GUID 下不同 Sprite localId。 */
test("序列帧逐项对比顺序、时间和 Sprite 子资源 localId", () => {
  const localIdDrift = makeFrameFixture();
  localIdDrift.report.animations[0].frames[1].localId = localIdDrift.report.animations[0].frames[0].localId;
  assert.match(validateFrameAnimationHandoff(localIdDrift.plan, localIdDrift.report).join("；"), /第 1 帧 localId 与计划不一致/);

  const reordered = makeFrameFixture();
  reverseFrames(reordered.report.animations[0].frames);
  const orderErrors = validateFrameAnimationHandoff(reordered.plan, reordered.report).join("；");
  assert.match(orderErrors, /time 必须严格递增/);
  assert.match(orderErrors, /帧数与计划不一致|time 与计划不一致/);

  const invalidGrid = makeFrameFixture();
  invalidGrid.plan.animations[0].frames[1].time = 0.05;
  assert.match(validateFrameAnimationHandoff(invalidGrid.plan, invalidGrid.report).join("；"), /不在 frameRate 网格/);

  const rootBinding = makeFrameFixture();
  rootBinding.plan.animations[0].bindingPath = "";
  rootBinding.report.animations[0].bindingPath = "";
  assert.deepEqual(validateFrameAnimationHandoff(rootBinding.plan, rootBinding.report), []);
});

/** 明确拒绝FBX或自定义容器中的子Clip，序列帧合同仅支持独立.anim主资产。 */
test("序列帧计划与实测Clip路径都必须是独立.anim", () => {
  const unsupported = makeFrameFixture();
  unsupported.plan.animations[0].clipPath = "Assets/Characters/Run.fbx";
  unsupported.report.animations[0].clipPath = "Assets/Characters/Run.fbx";
  const errors = validateFrameAnimationHandoff(unsupported.plan, unsupported.report).join("；");
  assert.match(errors, /计划动作 hero-run 的 clipPath 必须指向独立 \.anim 文件/);
  assert.match(errors, /实测动作 hero-run 的 clipPath 必须指向独立 \.anim 文件/);
});

/** 确保动作时间轴、枢轴、PPU、Prefab 绑定与图集漂移都可被发现。 */
test("序列帧合同覆盖 FPS、时长、循环、pivot、PPU、消费者与图集", () => {
  const timebase = makeFrameFixture();
  timebase.report.animations[0].frameRate = 12;
  timebase.report.animations[0].duration = 0.3;
  timebase.report.animations[0].loop = false;
  const timebaseErrors = validateFrameAnimationHandoff(timebase.plan, timebase.report).join("；");
  for (const field of ["frameRate", "duration", "loop"]) assert.match(timebaseErrors, new RegExp(field));

  const sprite = makeFrameFixture();
  sprite.report.animations[0].frames[1].pivot.x += 0.01;
  sprite.report.animations[0].frames[1].pixelsPerUnit = 200;
  const spriteErrors = validateFrameAnimationHandoff(sprite.plan, sprite.report).join("；");
  assert.match(spriteErrors, /pivot.x/);
  assert.match(spriteErrors, /pixelsPerUnit/);

  const consumer = makeFrameFixture();
  consumer.report.animations[0].bindingPath = "Visual/Other";
  consumer.report.animations[0].consumer.referencesClip = false;
  consumer.report.animations[0].consumer.bindingResolved = false;
  const consumerErrors = validateFrameAnimationHandoff(consumer.plan, consumer.report).join("；");
  assert.match(consumerErrors, /bindingPath/);
  assert.match(consumerErrors, /没有实际引用计划 Clip/);
  assert.match(consumerErrors, /绑定没有实际解析/);

  const atlas = makeFrameFixture();
  atlas.report.animations[0].atlas.assetGuid = "99999999999999999999999999999999";
  atlas.report.animations[0].atlas.allFramesBindable = false;
  const atlasErrors = validateFrameAnimationHandoff(atlas.plan, atlas.report).join("；");
  assert.match(atlasErrors, /atlas.assetGuid/);
  assert.match(atlasErrors, /不能绑定全部实际帧/);
});

/** 处理缺失Clip曲线、无效字段、重复与未知动作，以及失败或非真实报告。 */
test("序列帧读回缺字段或身份覆盖不完整时拒绝通过", () => {
  const missing = makeFrameFixture();
  missing.report.animations[0].frames = [];
  delete missing.report.animations[0].propertyName;
  assert.match(validateFrameAnimationHandoff(missing.plan, missing.report).join("；"), /frames 必须是非空数组/);
  assert.match(validateFrameAnimationHandoff(missing.plan, missing.report).join("；"), /唯一 m_Sprite/);

  const damaged = makeFrameFixture();
  damaged.report.animations[0].frames[0].rect = null;
  damaged.report.animations[0].frames[0].spriteName = "  ";
  damaged.plan.animations[0].frames[0].localId = 21300000;
  const damagedErrors = validateFrameAnimationHandoff(damaged.plan, damaged.report).join("；");
  assert.match(damagedErrors, /rect 必须保留/);
  assert.match(damagedErrors, /spriteName 必须/);
  assert.match(damagedErrors, /localId 必须是字符串/);

  const invalidSubresourceIds = makeFrameFixture();
  invalidSubresourceIds.plan.animations[0].clipLocalId = "clip-local-id";
  invalidSubresourceIds.plan.animations[0].frames[0].localId = "sprite-local-id";
  assert.match(validateFrameAnimationHandoff(invalidSubresourceIds.plan, invalidSubresourceIds.report).join("；"), /clipLocalId 必须是字符串整数/);
  assert.match(validateFrameAnimationHandoff(invalidSubresourceIds.plan, invalidSubresourceIds.report).join("；"), /localId 必须是字符串整数/);

  const duplicated = makeFrameFixture();
  duplicated.report.animations.push(structuredClone(duplicated.report.animations[0]));
  assert.match(validateFrameAnimationHandoff(duplicated.plan, duplicated.report).join("；"), /重复 animationId/);

  const unknown = makeFrameFixture();
  unknown.report.animations[0].animationId = "other";
  const coverageErrors = validateFrameAnimationHandoff(unknown.plan, unknown.report).join("；");
  assert.match(coverageErrors, /计划之外的未知 animationId/);
  assert.match(coverageErrors, /缺少计划动作 hero-run/);

  const failed = makeFrameFixture();
  failed.report.status = "FAIL";
  assert.match(validateFrameAnimationHandoff(failed.plan, failed.report).join("；"), /status 为 FAIL/);
});

/** 证明损坏输入返回中文诊断，并验证安装后的模块脱离仓库依赖可独立导入运行。 */
test("损坏输入不抛异常，独立安装目录无需 node_modules", () => {
  assert.doesNotThrow(() => validateResourceLoading(null, null));
  assert.doesNotThrow(() => validateFrameAnimationHandoff({ schemaVersion: "1.0", animations: [{ animationId: "x" }] }, { animations: [null] }));
  assert.match(validateResourceLoading(null, null).join(""), /资源登记/);
  assert.match(validateFrameAnimationHandoff(null, null).join(""), /序列帧计划/);

  const isolatedRoot = mkdtempSync(join(tmpdir(), "unity-resource-contract-"));
  try {
    const sourceRoot = resolve(import.meta.dirname, "../../unity-development-workflow/scripts");
    const filenames = ["resource-loading-contract.mjs", "frame-animation-contract.mjs", "resource-handoff-shape.mjs"];
    for (const filename of filenames) copyFileSync(join(sourceRoot, filename), join(isolatedRoot, filename));
    const helperPath = resolve(import.meta.dirname, "helpers/resource-frame-fixture.mjs");
    copyFileSync(helperPath, join(isolatedRoot, "resource-frame-fixture.mjs"));
    assert.equal(existsSync(join(isolatedRoot, "node_modules")), false);

    const moduleUrl = (filename) => JSON.stringify(pathToFileURL(join(isolatedRoot, filename)).href);
    const script = `
      import { validateResourceLoading } from ${moduleUrl("resource-loading-contract.mjs")};
      import { validateFrameAnimationHandoff } from ${moduleUrl("frame-animation-contract.mjs")};
      import { makeResourceFixture, makeFrameFixture } from ${moduleUrl("resource-frame-fixture.mjs")};
      const resource = makeResourceFixture();
      const frame = makeFrameFixture();
      if (validateResourceLoading(resource.register, resource.report).length !== 0) process.exitCode = 1;
      if (validateFrameAnimationHandoff(frame.plan, frame.report).length !== 0) process.exitCode = 1;
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: isolatedRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.error, undefined);
  } finally {
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

/** 反转实测帧数组，不调整时间值以模拟读回顺序错误。 */
function reverseFrames(frames) {
  frames.reverse();
}
