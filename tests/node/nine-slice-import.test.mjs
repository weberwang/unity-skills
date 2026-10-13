import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = resolve(import.meta.dirname, "../..");

/** 编译图片任务与登记记录契约，供九宫格边框行为复用。 */
function compileValidators() {
  const readSchema = (name) => JSON.parse(readFileSync(resolve(ROOT, "unity-development-workflow/schemas", name), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(readSchema("reuse-resource-plan.schema.json"));
  ajv.addSchema(readSchema("common.schema.json"));
  return {
    imageTask: ajv.compile(readSchema("image-task.schema.json")),
    registrationRecord: ajv.compile(readSchema("registration-record.schema.json")),
  };
}

/** 创建满足 image-task 基础字段的最小草稿任务。 */
function createImageTask(textureType = "Sprite") {
  const unityImport = {
    textureType,
    spriteMode: textureType === "Sprite" ? "Single" : "None",
    pixelsPerUnit: 100,
    filterMode: "Bilinear",
    wrapMode: "Clamp",
    maxSize: 2048,
    compression: "HighQuality",
    sRgb: true,
    alphaIsTransparency: true,
    mipmaps: false,
    readWriteEnabled: false,
  };
  if (textureType === "Sprite") unityImport.border = [0, 0, 0, 0];
  return {
    schemaVersion: "1.0",
    id: "image.test-panel",
    resourceId: "ui.test-panel",
    sourceVersion: "source-v1",
    visualBibleVersion: "visual-v1",
    generationMode: "REGENERATE_FROM_APPROVED_VISUAL",
    styleAuthority: "APPROVED_VISUAL_BIBLE",
    module: "Presentation.UI",
    assetType: "panel",
    useCase: "测试面板",
    brief: "用于契约测试的面板",
    references: [],
    referenceDeclarations: [],
    output: {
      candidateCount: 1,
      aspectRatio: "1:1",
      alphaRequired: true,
      targetPath: "Assets/Art/Runtime/UI",
      filename: "panel.png",
    },
    unityImport,
    acceptance: [{ type: "panel-readable", required: true }],
    status: "DRAFT",
    approvals: [],
  };
}

/** 创建带 Sprite Importer 实际设置的最小有效登记记录。 */
function createRegistrationRecord(type = "sprite") {
  const sprite = type === "sprite";
  return {
    schemaVersion: "1.0",
    recordId: "registration.test-panel.v1",
    taskId: "image.test-panel",
    resourceId: "ui.test-panel",
    module: "Presentation.UI",
    type,
    purpose: "测试面板",
    sourceVersion: "source-v1",
    visualVersion: "visual-v1",
    sourcePath: "ArtSource/Generated/image.test-panel/processed/panel.png",
    assetPath: "Assets/Art/Runtime/UI/panel.png",
    address: "Assets/Art/Runtime/UI/panel.png",
    assetGuid: "a".repeat(32),
    importer: {
      textureType: sprite ? "Sprite" : "Default",
      ...(sprite ? { spriteMode: "Single", pixelsPerUnit: 100, border: [0, 0, 0, 0] } : {}),
      filterMode: "Bilinear",
      wrapMode: "Clamp",
      maxSize: 2048,
      compression: "Uncompressed",
      sRgb: true,
      alphaIsTransparency: true,
      mipmaps: false,
      readWriteEnabled: false,
    },
    approvals: [{
      approvalType: "GAME_VISUAL",
      authority: "USER",
      subjectId: "image.test-panel",
      subjectVersion: "visual-v1",
      approvedBy: "test-owner",
      approvedAtUtc: "2026-10-13T00:00:00Z",
      evidencePath: "Artifacts/Approvals/image.test-panel.json",
    }],
    approvalEvidencePaths: ["Artifacts/Approvals/image.test-panel.json"],
    importReportPath: "Artifacts/Imports/image.test-panel.json",
    status: "VALIDATED",
    licenseStatus: "PENDING",
    unityValidation: "PASS",
    generatedAtUtc: "2026-10-13T00:00:00Z",
  };
}

test("image-task 要求 Sprite 明确声明合法的四边框 tuple", () => {
  const { imageTask } = compileValidators();
  const job = createImageTask();
  job.unityImport.border = [1, 2, 3, 4];
  job.nineSlice = {
    mode: "stretch",
    reason: "面板边角需保持固定形状",
    sourceSize: { width: 64, height: 64 },
    border: [1, 2, 3, 4],
  };

  assert.equal(imageTask(job), true);
  for (const border of [undefined, [1, 2, 3], [-1, 0, 0, 0], [1.5, 0, 0, 0], [1, 2, 3, 4, 5]]) {
    const invalid = structuredClone(job);
    if (border === undefined) delete invalid.unityImport.border;
    else invalid.unityImport.border = border;
    assert.equal(imageTask(invalid), false, `应拒绝边框 ${JSON.stringify(border)}`);
  }

  const undeclaredNineSlice = structuredClone(job);
  delete undeclaredNineSlice.nineSlice;
  assert.equal(imageTask(undeclaredNineSlice), false);
});

test("普通 Sprite 要显式使用零边框，非 Sprite 只允许省略或零边框", () => {
  const { imageTask } = compileValidators();
  const regularSprite = createImageTask("Sprite");
  assert.equal(imageTask(regularSprite), true);
  regularSprite.nineSlice = { mode: "not-applicable", reason: "资源不需要拉伸边角" };
  assert.equal(imageTask(regularSprite), true);

  const textureWithoutBorder = createImageTask("Default");
  assert.equal(imageTask(textureWithoutBorder), true);
  textureWithoutBorder.unityImport.border = [0, 0, 0, 0];
  assert.equal(imageTask(textureWithoutBorder), true);
  textureWithoutBorder.unityImport.border = [1, 0, 0, 0];
  assert.equal(imageTask(textureWithoutBorder), false);
});

test("Sprite 登记回读必须保存边框，纹理登记只能回读零边框", () => {
  const { registrationRecord } = compileValidators();
  const spriteRecord = createRegistrationRecord("sprite");
  assert.equal(registrationRecord(spriteRecord), true);
  delete spriteRecord.importer.border;
  assert.equal(registrationRecord(spriteRecord), false);

  const textureRecord = createRegistrationRecord("texture");
  textureRecord.importer.border = [0, 0, 0, 0];
  assert.equal(registrationRecord(textureRecord), true);
  textureRecord.importer.border = [0, 1, 0, 0];
  assert.equal(registrationRecord(textureRecord), false);
});
