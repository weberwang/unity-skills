import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_DIR = resolve(ROOT, "unity-development-workflow/schemas");

/** 读取工作流 JSON Schema，测试使用与仓库登记入口相同的文件。 */
function readSchema(name) {
  return JSON.parse(readFileSync(resolve(SCHEMA_DIR, name), "utf8"));
}

/** 注册登记 Schema 及其传递依赖，验证各入口引用能被真实解析。 */
function createValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const commonSchema = readSchema("common.schema.json");
  const registrationSchema = readSchema("registration-record.schema.json");
  const assetRegisterSchema = readSchema("asset-register.schema.json");
  ajv.addSchema(readSchema("reuse-resource-plan.schema.json"));
  ajv.addSchema(commonSchema);
  ajv.addSchema(registrationSchema);
  ajv.addSchema(assetRegisterSchema);
  return {
    registrationRecord: ajv.getSchema(registrationSchema.$id),
    assetRegister: ajv.getSchema(assetRegisterSchema.$id),
  };
}

/** 构造完整的 3D 登记记录，让测试覆盖正式记录而非只验证内部定义。 */
function createRegistrationRecord(type, importer) {
  return {
    schemaVersion: "1.0",
    recordId: `registration.hero-${type}.v1`,
    taskId: "asset.hero",
    resourceId: `hero.${type}`,
    module: "Characters.Hero",
    type,
    purpose: "角色生产链路登记契约测试",
    sourceVersion: "source-v1",
    visualVersion: "visual-v1",
    sourcePath: "ArtSource/Characters/Hero/hero.blend",
    assetPath: `Assets/Art/Runtime/Characters/Hero/hero.${type === "model" ? "fbx" : "mat"}`,
    address: `characters/hero/${type}`,
    assetGuid: "a".repeat(32),
    importer,
    approvals: [{
      approvalType: "GAME_VISUAL",
      authority: "USER",
      subjectId: "asset.hero",
      subjectVersion: "visual-v1",
      approvedBy: "test-owner",
      approvedAtUtc: "2026-10-22T00:00:00Z",
      evidencePath: "Artifacts/Approvals/hero.json",
    }],
    approvalEvidencePaths: ["Artifacts/Approvals/hero.json"],
    importReportPath: "Artifacts/Imports/hero.json",
    status: "VALIDATED",
    licenseStatus: "PENDING",
    unityValidation: "PASS",
    generatedAtUtc: "2026-10-22T00:00:00Z",
  };
}

/** 从完整登记记录派生资产注册表条目，保证两处写入使用同一摘要。 */
function createAssetRegister(record) {
  return {
    schemaVersion: "1.0",
    projectId: "sample-project",
    registerVersion: "register-v1",
    sourceRevision: "revision-test",
    assets: [{
      id: record.resourceId,
      type: record.type,
      purpose: record.purpose,
      source: "Blender MCP production asset",
      sourceVersion: record.sourceVersion,
      visualVersion: record.visualVersion,
      path: record.assetPath,
      address: record.address,
      guid: record.assetGuid,
      importerReportPath: record.importReportPath,
      registrationRecordPath: "Artifacts/Registration/hero.json",
      importer: structuredClone(record.importer),
      status: "VALIDATED",
      licenseStatus: "PENDING",
      unityValidation: "PASS",
      approvals: structuredClone(record.approvals),
      evidence: [{ type: "unity-import-report", path: record.importReportPath }],
    }],
    placeholders: [],
  };
}

/** 同时断言完整记录与资产注册表接纳相同的导入摘要。 */
function assertAcceptedByBoth(validators, record, label) {
  assert.equal(validators.registrationRecord(record), true, `${label} 登记记录：${JSON.stringify(validators.registrationRecord.errors)}`);
  assert.equal(validators.assetRegister(createAssetRegister(record)), true, `${label} 资产注册表：${JSON.stringify(validators.assetRegister.errors)}`);
}

/** 对无效完整记录和从该记录生成的注册表条目同时执行拒绝断言。 */
function assertRejectedByBoth(validators, record, label) {
  assert.equal(validators.registrationRecord(record), false, `${label} 应被登记记录拒绝`);
  assert.equal(validators.assetRegister(createAssetRegister(record)), false, `${label} 应被资产注册表拒绝`);
}

/** 构造标准 URP PBR 材质摘要；贴图绑定和 Shader 属性按实际需要添加。 */
function createPbrImporter(overrides = {}) {
  return {
    shader: "Universal Render Pipeline/Lit",
    renderPipeline: "URP",
    materialMode: "PBR",
    workflowMode: "Metallic",
    enableInstancing: true,
    doubleSidedGI: false,
    renderQueue: -1,
    ...overrides,
  };
}

/** 创建记录真实资源身份与语义的贴图绑定。 */
function textureBinding(resourceId, address, semantic) {
  return { resourceId, address, semantic };
}

/** 返回 Unity ModelImporter 的完整 11 项真实设置摘要。 */
function createUnityModelImporter() {
  return {
    globalScale: 1,
    meshCompression: "Off",
    readWriteEnabled: false,
    optimizeMeshPolygons: true,
    optimizeMeshVertices: true,
    importBlendShapes: true,
    importCameras: false,
    importLights: false,
    generateColliders: false,
    importMaterials: false,
    importAnimation: true,
  };
}

/** 构造合成外部导入器快照；此测试值不代表任何实际 glTF 导入器实现。 */
function createSyntheticExternalModelImporter() {
  return {
    importerType: "Synthetic.ExternalImporter",
    sourceFormat: "glTF",
    settings: { scale: 1, importMaterials: true },
  };
}

const validators = createValidators();

test("生产级 PBR 贴图与常量摘要可写入登记记录和资产注册表", () => {
  const cases = [
    ["部分金属工作流贴图与标量默认值", createPbrImporter({
      textureBindings: {
        baseColor: textureBinding("hero.base-color", "Assets/Art/Runtime/Characters/hero-base.png", "BASE_COLOR"),
      },
      shaderProperties: {
        _Metallic: { type: "Float", value: 0.35 },
        _Smoothness: { type: "Float", value: 0.72 },
      },
    })],
    ["无贴图的全常量金属工作流", createPbrImporter({
      shaderProperties: {
        _BaseColor: { type: "Color", value: [0.8, 0.65, 0.4, 1] },
        _Metallic: { type: "Float", value: 0.1 },
        _NormalScale: { type: "Vector", value: [1, 1, 0, 0] },
      },
    })],
    ["完整金属工作流贴图", createPbrImporter({
      textureBindings: {
        baseColor: textureBinding("hero.base-color", "Assets/Art/Runtime/Characters/hero-base.png", "BASE_COLOR"),
        normal: textureBinding("hero.normal", "Assets/Art/Runtime/Characters/hero-normal.png", "NORMAL"),
        metallicSmoothness: textureBinding("hero.metal", "Assets/Art/Runtime/Characters/hero-metal.png", "METALLIC_SMOOTHNESS"),
        ambientOcclusion: textureBinding("hero.ao", "Assets/Art/Runtime/Characters/hero-ao.png", "AMBIENT_OCCLUSION"),
      },
    })],
    ["Specular 工作流贴图", createPbrImporter({
      workflowMode: "Specular",
      textureBindings: {
        baseColor: textureBinding("hero.base-color", "Assets/Art/Runtime/Characters/hero-base.png", "BASE_COLOR"),
        specularSmoothness: textureBinding("hero.specular", "Assets/Art/Runtime/Characters/hero-specular.png", "SPECULAR_SMOOTHNESS"),
      },
    })],
    ["自定义 Shader Graph 的类型化贴图属性", createPbrImporter({
      shader: "Characters/HeroCustomGraph",
      workflowMode: "Custom",
      shaderProperties: {
        _DetailMask: {
          type: "Texture",
          value: { resourceId: "hero.detail-mask", address: "Assets/Art/Runtime/Characters/hero-detail-mask.png" },
        },
        _Coat: { type: "Float", value: 0.4 },
        _LayerCount: { type: "Int", value: 3 },
        _BlendRange: { type: "Range", value: 1.75 },
        _Tint: { type: "Color", value: [1, 0.9, 0.8, 1] },
        _Direction: { type: "Vector", value: [0, 1, 0, 0] },
      },
    })],
  ];

  for (const [label, importer] of cases) {
    assertAcceptedByBoth(validators, createRegistrationRecord("material", importer), label);
  }
});

test("UNLIT 与 PROCEDURAL 仍可按各自用途登记", () => {
  const unlit = createPbrImporter({
    materialMode: "UNLIT",
    workflowMode: undefined,
    textureBindings: {
      baseColor: textureBinding("hero.ui-color", "Assets/Art/Runtime/Characters/hero-ui.png", "BASE_COLOR"),
    },
  });
  delete unlit.workflowMode;
  const procedural = createPbrImporter({ materialMode: "PROCEDURAL", workflowMode: undefined });
  delete procedural.workflowMode;
  delete procedural.textureBindings;

  assertAcceptedByBoth(validators, createRegistrationRecord("material", unlit), "UNLIT");
  assertAcceptedByBoth(validators, createRegistrationRecord("material", procedural), "PROCEDURAL");
});

test("PBR 摘要拒绝缺少流程、空摘要、错误工作流语义和未知 Shader 属性结构", () => {
  const invalidImporters = [
    ["旧 PBR_TEXTURED 名称", createPbrImporter({ materialMode: "PBR_TEXTURED", textureBindings: { baseColor: textureBinding("hero.base", "Assets/Art/Runtime/Characters/base.png", "BASE_COLOR") } })],
    ["缺少 workflowMode", createPbrImporter({ workflowMode: undefined, shaderProperties: { _Metallic: { type: "Float", value: 0.4 } } })],
    ["没有贴图或 Shader 属性摘要", createPbrImporter({ textureBindings: {}, shaderProperties: undefined })],
    ["Metallic 工作流绑定 Specular 槽", createPbrImporter({ textureBindings: { specularSmoothness: textureBinding("hero.specular", "Assets/Art/Runtime/Characters/spec.png", "SPECULAR_SMOOTHNESS") } })],
    ["Specular 工作流绑定 Metallic 槽", createPbrImporter({ workflowMode: "Specular", textureBindings: { metallicSmoothness: textureBinding("hero.metal", "Assets/Art/Runtime/Characters/metal.png", "METALLIC_SMOOTHNESS") } })],
    ["贴图语义和槽位冲突", createPbrImporter({ textureBindings: { metallicSmoothness: textureBinding("hero.metal", "Assets/Art/Runtime/Characters/metal.png", "SPECULAR_SMOOTHNESS") } })],
    ["未知 Shader 属性类型", createPbrImporter({ shaderProperties: { _Custom: { type: "Integer", value: 2 } } })],
    ["Int 属性拒绝非整数值", createPbrImporter({ shaderProperties: { _LayerCount: { type: "Int", value: 2.5 } } })],
    ["Range 属性拒绝非数值", createPbrImporter({ shaderProperties: { _BlendRange: { type: "Range", value: "0.5" } } })],
    ["Float 属性携带未声明字段", createPbrImporter({ shaderProperties: { _Metallic: { type: "Float", value: 0.4, units: "percent" } } })],
    ["Color 属性分量数量错误", createPbrImporter({ shaderProperties: { _Tint: { type: "Color", value: [1, 0, 0] } } })],
    ["Texture 属性没有实际地址", createPbrImporter({ shaderProperties: { _Mask: { type: "Texture", value: { resourceId: "hero.mask" } } } })],
    ["材质摘要存在未声明顶层字段", createPbrImporter({ shaderProperties: { _Metallic: { type: "Float", value: 0.4 } }, debugOnly: true })],
  ];

  for (const [label, importer] of invalidImporters) {
    const candidate = structuredClone(importer);
    if (Object.hasOwn(candidate, "workflowMode") && candidate.workflowMode === undefined) delete candidate.workflowMode;
    if (Object.hasOwn(candidate, "shaderProperties") && candidate.shaderProperties === undefined) delete candidate.shaderProperties;
    assertRejectedByBoth(validators, createRegistrationRecord("material", candidate), label);
  }
});

test("ModelImporter 与外部导入器各自记录真实可用的导入设置", () => {
  const standard = createRegistrationRecord("model", createUnityModelImporter());
  const external = createRegistrationRecord("model", createSyntheticExternalModelImporter());
  assertAcceptedByBoth(validators, standard, "Unity ModelImporter");
  assertAcceptedByBoth(validators, external, "合成外部 glTF 导入器示例");
});

test("模型导入器摘要拒绝伪填另一分支的设置和无效外部类型", () => {
  const standardWithExternalFields = createUnityModelImporter();
  standardWithExternalFields.importerType = "ModelImporter";
  const externalWithUnitySettings = createSyntheticExternalModelImporter();
  externalWithUnitySettings.importBlendShapes = true;
  const externalCallingItselfUnity = createSyntheticExternalModelImporter();
  externalCallingItselfUnity.importerType = "ModelImporter";
  const externalWithoutSettings = createSyntheticExternalModelImporter();
  externalWithoutSettings.settings = {};
  const incompleteStandard = createUnityModelImporter();
  delete incompleteStandard.importAnimation;

  for (const [label, importer] of [
    ["标准 ModelImporter 混入外部导入器标识", standardWithExternalFields],
    ["外部导入器伪填 ModelImporter 字段", externalWithUnitySettings],
    ["外部类型错误声明为 ModelImporter", externalCallingItselfUnity],
    ["外部导入器设置快照为空", externalWithoutSettings],
    ["标准 ModelImporter 缺失必要设置", incompleteStandard],
  ]) {
    assertRejectedByBoth(validators, createRegistrationRecord("model", importer), label);
  }
});
