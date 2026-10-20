import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  check,
  inspect,
  run,
  status,
  transitionWorkItem,
  validateEvidence,
  validateWorkItem,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import {
  makeRiggingDeliveryFixture,
  writeFixtureFile,
  writeFixtureJson,
} from './helpers/rigging-delivery-fixture.mjs';

const WORK_SCHEMA_PATH = resolve('unity-game-workflow-control/schemas/work-item.schema.json');
const EVIDENCE_SCHEMA_PATH = resolve('unity-game-workflow-control/schemas/evidence-manifest.schema.json');
const REPORT_REQUIRED_CHECKS = [
  'prefab-load', 'sprite-skin-presence', 'animator-presence', 'animator-controller', 'engineering-only-scope',
  'asset-source-evidence',
];

/** 创建并在断言后移除独立临时仓库。 */
function withFixture(callback, options = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-rigging-delivery-'));
  try {
    callback(makeRiggingDeliveryFixture(repo, options));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

/** 读取角色报告，允许单个测试精确改变原始证据。 */
function readAssetReport(fixture, characterIndex = 0) {
  const relativePath = fixture.evidenceCharacters[characterIndex].assetReportPath;
  return JSON.parse(readFileSync(join(fixture.repo, ...relativePath.split('/')), 'utf8'));
}

/** 保存角色报告，并保留测试设定的磁盘修改时间。 */
function saveAssetReport(fixture, report, characterIndex = 0, modifiedAt) {
  const relativePath = fixture.evidenceCharacters[characterIndex].assetReportPath;
  writeFixtureJson(fixture.repo, relativePath, report, modifiedAt);
}

/** 读取 Pipeline 原始 test_status 信封中的内层 NUnit 结果。 */
function readPipelineResult(fixture, characterIndex = 0) {
  const relativePath = fixture.evidenceCharacters[characterIndex].regression.rawReportPath;
  const envelope = JSON.parse(readFileSync(join(fixture.repo, ...relativePath.split('/')), 'utf8'));
  return { envelope, result: JSON.parse(envelope.data.result) };
}

/** 写回真实 Pipeline test_status 信封，供正负回归用例共用。 */
function savePipelineResult(fixture, envelope, result, characterIndex = 0) {
  const relativePath = fixture.evidenceCharacters[characterIndex].regression.rawReportPath;
  envelope.data.result = JSON.stringify(result);
  writeFixtureJson(fixture.repo, relativePath, envelope);
}

/** 返回工作项和证据路径，供所有控制面入口读取相同候选快照。 */
function controlArgs(fixture) {
  return {
    repo: fixture.repo,
    'work-item': fixture.workPath,
    evidence: fixture.evidencePath,
    'implementation-package': fixture.packagePath,
  };
}

/** 写入 Work Item 与 Evidence Manifest 的当前内存值。 */
function saveControlRecords(fixture) {
  writeFixtureJson(fixture.repo, fixture.workPath, fixture.work);
  writeFixtureJson(fixture.repo, fixture.evidencePath, fixture.evidence);
}

/** 编译当前两份核心 Schema，覆盖格式关键字和严格字段约束。 */
function compileRiggingSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const workSchema = JSON.parse(readFileSync(WORK_SCHEMA_PATH, 'utf8'));
  const evidenceSchema = JSON.parse(readFileSync(EVIDENCE_SCHEMA_PATH, 'utf8'));
  return { work: ajv.compile(workSchema), evidence: ajv.compile(evidenceSchema) };
}

/** 断言完整骨骼交付证据被检查并允许继续交接。 */
function assertHandoffAllowed(fixture) {
  const result = inspect(controlArgs(fixture), 'check');
  assert.equal(result.riggingDelivery?.handoffAllowed, true, JSON.stringify(result.riggingDelivery));
  assert.deepEqual(result.riggingDelivery?.repairs, []);
  return result;
}

/** 断言失败证据阻断门禁，并由门禁输出岗位和责任人。 */
function assertHandoffBlocked(fixture, { role, assignee, disposition } = {}) {
  const result = inspect(controlArgs(fixture), 'check');
  assert.equal(result.riggingDelivery?.handoffAllowed, false, JSON.stringify(result.riggingDelivery));
  assert.ok(result.riggingDelivery?.repairs?.length, JSON.stringify(result.riggingDelivery));
  if (role) assert.ok(result.riggingDelivery.repairs.some((repair) => repair.role === role), JSON.stringify(result.riggingDelivery.repairs));
  if (assignee) assert.ok(result.riggingDelivery.repairs.some((repair) => repair.assignee === assignee), JSON.stringify(result.riggingDelivery.repairs));
  if (disposition) assert.ok(result.riggingDelivery.repairs.some((repair) => repair.disposition === disposition), JSON.stringify(result.riggingDelivery.repairs));
  const diagnostic = JSON.stringify({
    blocking: result.blockers?.map((item) => item.message),
    next: result.next,
    repairs: result.riggingDelivery.repairs,
  });
  assert.equal(diagnostic.includes(fixture.repo), false, '门禁诊断不得泄漏主机绝对路径');
  return result;
}

/** 检查单个宿主机路径在检查、运行和直接迁移输出中均已脱敏。 */
function assertDiagnosticPathRedacted(fixture, { absolutePath, reason, label }) {
  const report = readAssetReport(fixture);
  report.status = 'FAIL';
  report.checks[0].status = 'FAIL';
  saveAssetReport(fixture, report);
  fixture.evidence.riggingDelivery.characters[0].findings = [{
    role: 'rigging',
    reason,
    affectedPaths: [fixture.work.riggingDelivery.characters[0].prefabPath],
  }];
  saveControlRecords(fixture);

  const inspected = inspect(controlArgs(fixture), 'transition');
  const checked = check(controlArgs(fixture));
  const runResult = run(controlArgs(fixture));
  let transitionError;
  try {
    transitionWorkItem(inspected, 'PASSED');
  } catch (error) {
    transitionError = error;
  }
  assert.ok(transitionError, `${label}: 失败的骨骼资产报告必须阻断直接迁移`);
  const publicOutputs = JSON.stringify({
    inspection: {
      blockers: inspected.blockers,
      next: inspected.next,
      riggingDelivery: inspected.riggingDelivery,
    },
    check: { blocking: checked.blocking, next: checked.next, metadata: checked.metadata },
    run: { blocking: runResult.blocking, next: runResult.next, metadata: runResult.metadata },
    transition: { message: transitionError.message, details: transitionError.details },
  });
  assert.equal(publicOutputs.includes(absolutePath), false, `${label}: 宿主机路径不得泄漏到任何门禁输出`);
}

test('Work Item 与 Evidence Manifest Schema 和运行时合同同步且只扩展骨骼角色任务', () => withFixture(({ repo, work, evidence }) => {
  const schemas = compileRiggingSchemas();
  assert.equal(schemas.work(work), true, JSON.stringify(schemas.work.errors));
  assert.equal(schemas.evidence(evidence), true, JSON.stringify(schemas.evidence.errors));
  assert.doesNotThrow(() => validateWorkItem(work));
  assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));

  const missingRiggingDelivery = { ...work };
  delete missingRiggingDelivery.riggingDelivery;
  assert.equal(schemas.work(missingRiggingDelivery), false, '2d-rigging unity-asset-change 必须声明角色门禁');
  assert.throws(() => validateWorkItem(missingRiggingDelivery), /riggingDelivery/);

  const ordinaryWork = { ...work, domain: 'common-tooling', actionType: 'unity-asset-change' };
  delete ordinaryWork.riggingDelivery;
  assert.equal(schemas.work(ordinaryWork), true, JSON.stringify(schemas.work.errors));
  assert.doesNotThrow(() => validateWorkItem(ordinaryWork));

  const unknownOwner = structuredClone(work);
  unknownOwner.riggingDelivery.owners.animator = 'unexpected-owner';
  assert.equal(schemas.work(unknownOwner), false, '岗位列表必须严格受限');
  assert.throws(() => validateWorkItem(unknownOwner), /riggingDelivery/);

  const qaIsProductionOwner = structuredClone(work);
  qaIsProductionOwner.riggingDelivery.owners.qa = qaIsProductionOwner.riggingDelivery.owners.visualAssets;
  assert.equal(schemas.work(qaIsProductionOwner), true, 'Schema 校验字段形状，岗位之间的独立性由运行时校验');
  assert.throws(() => validateWorkItem(qaIsProductionOwner), /riggingDelivery/);

  const duplicateCharacterIdentity = structuredClone(work);
  duplicateCharacterIdentity.riggingDelivery.characters.push({
    ...duplicateCharacterIdentity.riggingDelivery.characters[0],
    characterId: 'another-character',
  });
  assert.equal(schemas.work(duplicateCharacterIdentity), true, 'Schema 校验数组形状，跨项身份唯一性由运行时校验');
  assert.throws(() => validateWorkItem(duplicateCharacterIdentity), /重复/);

  const unexpectedEvidenceField = structuredClone(evidence);
  unexpectedEvidenceField.riggingDelivery.characters[0].regression.machineVerdict = 'PASS';
  assert.equal(schemas.evidence(unexpectedEvidenceField), false, '证据不得增加可绕过门禁的影子字段');
  assert.throws(() => validateEvidence(unexpectedEvidenceField, work, null, repo), /riggingDelivery/);
}));

test('有效真实角色报告和 Editor 回归可以放行并直接迁移到 VALIDATING', () => withFixture((fixture) => {
  const { repo, work, evidence } = fixture;
  assert.doesNotThrow(() => validateEvidence(evidence, work, null, repo));
  assertHandoffAllowed(fixture);

  fixture.work.globalState = 'REVIEW';
  saveControlRecords(fixture);
  const before = readFileSync(join(repo, fixture.workPath), 'utf8');
  const next = transitionWorkItem(inspect(controlArgs(fixture), 'transition'), 'VALIDATING');
  assert.equal(next.globalState, 'VALIDATING');
  assert.equal(next.revision, work.revision + 1);
  assert.equal(readFileSync(join(repo, fixture.workPath), 'utf8'), before, '直接迁移检查只返回内存快照');

  fixture.work.globalState = 'VALIDATING';
  saveControlRecords(fixture);
  assert.equal(run(controlArgs(fixture)).status, 'COMPLETE');
  assert.equal(JSON.parse(readFileSync(join(repo, fixture.workPath), 'utf8')).globalState, 'COMPLETE');

  const pipeline = readPipelineResult(fixture);
  const objectEnvelope = structuredClone(pipeline.envelope);
  objectEnvelope.data.result = pipeline.result;
  writeFixtureJson(repo, fixture.evidenceCharacters[0].regression.rawReportPath, objectEnvelope, new Date('2026-10-19T00:00:00.000Z'));
  assertHandoffAllowed(fixture);
}));

test('工程报告真实失败退骨骼，缺失、无效或未运行报告退独立 QA', () => withFixture((fixture) => {
  const realFailure = readAssetReport(fixture);
  realFailure.status = 'FAIL';
  realFailure.checks[1].status = 'FAIL';
  saveAssetReport(fixture, realFailure);
  assertHandoffBlocked(fixture, { role: 'rigging', assignee: fixture.owners.rigging, disposition: 'repair' });

  const inconsistentPass = readAssetReport(fixture);
  inconsistentPass.status = 'PASS';
  inconsistentPass.checks[1].status = 'FAIL';
  saveAssetReport(fixture, inconsistentPass);
  assertHandoffBlocked(fixture, { role: 'qa', assignee: fixture.owners.qa, disposition: 'revalidate' });

  for (const invalidReportStatus of ['BLOCKED', 'NOT_RUN', 'UNKNOWN']) {
    const report = readAssetReport(fixture);
    report.status = invalidReportStatus;
    saveAssetReport(fixture, report);
    assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  }

  const empty = readAssetReport(fixture);
  empty.status = 'FAIL';
  empty.checks = [];
  saveAssetReport(fixture, empty);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });

  const missingRequired = readAssetReport(fixture);
  missingRequired.status = 'PASS';
  missingRequired.checks = missingRequired.checks.filter((check) => check.id !== REPORT_REQUIRED_CHECKS[2]);
  saveAssetReport(fixture, missingRequired);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });

  fixture.evidence.riggingDelivery.characters[0].assetReportPath = 'Artifacts/Rigging/missing-report.json';
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', assignee: fixture.owners.qa, disposition: 'revalidate' });
}));

test('回归未执行、失败、跳过、计数矛盾或结果状态未知均阻断', () => withFixture((fixture) => {
  const regression = fixture.evidence.riggingDelivery.characters[0].regression;
  for (const statusValue of ['BLOCKED', 'NOT_RUN', 'UNKNOWN']) {
    regression.status = statusValue;
    saveControlRecords(fixture);
    assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  }
  regression.status = 'PASS';
  saveControlRecords(fixture);

  const { envelope, result } = readPipelineResult(fixture);
  const invalidResults = [
    { ...result, status: 'running' },
    { ...result, summary: { ...result.summary, failed: 1 } },
    { ...result, summary: { ...result.summary, passed: 0 } },
    { ...result, summary: { ...result.summary, skipped: 1 } },
    { ...result, summary: { ...result.summary, total: 2 } },
    { ...result, results: [{ ...result.results[0], Status: 'Skipped' }] },
    { ...result, results: [{ ...result.results[0], Status: 'Inconclusive' }] },
  ];
  for (const invalidResult of invalidResults) {
    savePipelineResult(fixture, structuredClone(envelope), invalidResult);
    assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  }
  const unsuccessfulEnvelope = structuredClone(envelope);
  unsuccessfulEnvelope.success = false;
  savePipelineResult(fixture, unsuccessfulEnvelope, result);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  savePipelineResult(fixture, envelope, result);
  regression.cases[0].status = 'NOT_RUN';
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}));

test('角色身份、版本、测试环境或独立 QA 身份不匹配时不能放行', () => withFixture((fixture) => {
  const originalEvidenceCharacter = structuredClone(fixture.evidence.riggingDelivery.characters[0]);
  const mutations = [
    (item) => { item.prefabGuid = 'f'.repeat(32); },
    (item) => { item.prefabPath = 'Assets/Characters/other/Hero.prefab'; },
    (item) => { item.sourceRevision = 'old-candidate'; },
    (item) => { item.regression.editorVersion = '6000.0.30f1'; },
    (item) => { item.regression.animationPackageVersion = '10.2.2'; },
    (item) => { item.reviewedBy = fixture.owners.rigging; },
  ];
  for (const mutate of mutations) {
    const character = structuredClone(fixture.evidence.riggingDelivery.characters[0]);
    mutate(character);
    fixture.evidence.riggingDelivery.characters[0] = character;
    saveControlRecords(fixture);
    assertHandoffBlocked(fixture, { role: 'qa', assignee: fixture.owners.qa, disposition: 'revalidate' });
    fixture.evidence.riggingDelivery.characters[0] = structuredClone(originalEvidenceCharacter);
  }

  const prefabMetaPath = `${fixture.work.riggingDelivery.characters[0].prefabPath}.meta`;
  writeFixtureFile(fixture.repo, prefabMetaPath, 'fileFormatVersion: 2\nguid: ffffffffffffffffffffffffffffffff\nPrefabImporter:\n  externalObjects: {}\n');
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  writeFixtureFile(
    fixture.repo,
    prefabMetaPath,
    `fileFormatVersion: 2\nguid: ${fixture.work.riggingDelivery.characters[0].prefabGuid}\nPrefabImporter:\n  externalObjects: {}\n`,
  );

  const report = readAssetReport(fixture);
  report.projectId = 'another-project';
  saveAssetReport(fixture, report);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}));

test('过期依赖、元数据或不可能的先后时间会阻断当前候选', () => withFixture((fixture) => {
  const assetReportPath = fixture.evidenceCharacters[0].assetReportPath;
  const report = readAssetReport(fixture);
  const dependency = report.evidence.find((item) => item.type === 'rigging-dependency');
  const dependencyMeta = join(fixture.repo, ...`${dependency.path}.meta`.split('/'));
  const afterGeneration = new Date('2026-10-19T02:30:00.000Z');
  utimesSync(dependencyMeta, afterGeneration, afterGeneration);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });

  const unchangedMetaTime = new Date('2026-10-19T00:00:00.000Z');
  utimesSync(dependencyMeta, unchangedMetaTime, unchangedMetaTime);
  fixture.work.riggingDelivery.characters[0].updatedAt = '2026-10-19T02:30:00.000Z';
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  fixture.work.riggingDelivery.characters[0].updatedAt = '2026-10-19T01:00:00.000Z';
  saveControlRecords(fixture);

  const afterRuntime = new Date('2026-10-19T03:30:00.000Z');
  utimesSync(dependencyMeta, afterRuntime, afterRuntime);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  utimesSync(dependencyMeta, unchangedMetaTime, unchangedMetaTime);

  fixture.evidence.riggingDelivery.characters[0].regression.completedAt = '2026-10-19T00:30:00.000Z';
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });

  fixture.evidence.riggingDelivery.characters[0].regression.completedAt = '2026-10-19T03:00:00.000Z';
  fixture.evidence.riggingDelivery.characters[0].reviewedAt = '2026-10-19T01:30:00.000Z';
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  assert.ok(existsSync(join(fixture.repo, ...assetReportPath.split('/'))));
}));

test('越界、反斜线、重复路径段和项目链接不能用于正式角色证据', (t) => withFixture((fixture) => {
  const character = fixture.evidence.riggingDelivery.characters[0];
  const originalWorkCharacter = structuredClone(fixture.work.riggingDelivery.characters[0]);
  const validAssetReport = structuredClone(readAssetReport(fixture));
  const invalidPaths = ['../outside/Hero.prefab', '/tmp/Hero.prefab', 'Assets\\Hero.prefab', 'Assets//Hero.prefab'];
  for (const prefabPath of invalidPaths) {
    const workCharacter = structuredClone(fixture.work.riggingDelivery.characters[0]);
    workCharacter.prefabPath = prefabPath;
    fixture.work.riggingDelivery.characters[0] = workCharacter;
    assert.throws(() => validateWorkItem(fixture.work), /riggingDelivery|路径|prefabPath/);
    fixture.work.riggingDelivery.characters[0] = structuredClone(originalWorkCharacter);
  }

  const evidenceCharacter = fixture.evidence.riggingDelivery.characters[0];
  const originalAssetReportPath = evidenceCharacter.assetReportPath;
  for (const path of ['../outside/report.json', 'Artifacts//report.json', 'Artifacts\\report.json']) {
    evidenceCharacter.assetReportPath = path;
    saveControlRecords(fixture);
    assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  }
  evidenceCharacter.assetReportPath = originalAssetReportPath;
  saveControlRecords(fixture);

  const unsafeReport = readAssetReport(fixture);
  unsafeReport.evidence[1].path = '../outside/body.png';
  saveAssetReport(fixture, unsafeReport);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
  saveAssetReport(fixture, validAssetReport);

  const linkRoot = join(fixture.repo, 'Assets', 'Characters', 'linked');
  const outsideRoot = join(fixture.repo, 'LinkedAssets');
  const linkPrefab = 'Assets/Characters/linked/Hero.prefab';
  const linkedGuid = 'c'.repeat(32);
  writeFixtureFile(fixture.repo, 'LinkedAssets/Hero.prefab', 'linked prefab content');
  writeFixtureFile(fixture.repo, 'LinkedAssets/Hero.prefab.meta', `fileFormatVersion: 2\nguid: ${linkedGuid}\nPrefabImporter:\n  externalObjects: {}\n`);
  try {
    symlinkSync(outsideRoot, linkRoot, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) {
      t.skip(`当前文件系统不允许创建 junction：${error.code}`);
      return;
    }
    throw error;
  }
  assert.equal(lstatSync(linkRoot).isSymbolicLink(), true);
  fixture.work.riggingDelivery.characters[0].prefabPath = linkPrefab;
  fixture.work.riggingDelivery.characters[0].prefabGuid = linkedGuid;
  fixture.evidence.riggingDelivery.characters[0].prefabPath = linkPrefab;
  fixture.evidence.riggingDelivery.characters[0].prefabGuid = linkedGuid;
  const linkedReport = structuredClone(validAssetReport);
  const linkedPrefabEvidence = linkedReport.evidence.find((item) => item.type === 'rigging-prefab');
  linkedPrefabEvidence.path = linkPrefab;
  linkedPrefabEvidence.subjectId = linkedGuid;
  linkedPrefabEvidence.subjectVersion = fixture.work.riggingDelivery.characters[0].sourceRevision;
  linkedPrefabEvidence.sourceRevision = fixture.work.riggingDelivery.characters[0].sourceRevision;
  saveAssetReport(fixture, linkedReport);
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}));

test('角色集合要求 runtime case 与角色 ID 唯一，所有正式角色都必须有证据', () => withFixture((fixture) => {
  const duplicateCase = structuredClone(fixture.work);
  duplicateCase.riggingDelivery.characters[0].requiredRuntimeCases.push('animation-playback');
  assert.throws(() => validateWorkItem(duplicateCase), /riggingDelivery/);

  const duplicateEvidence = structuredClone(fixture.evidence);
  duplicateEvidence.riggingDelivery.characters.push(structuredClone(duplicateEvidence.riggingDelivery.characters[0]));
  assert.throws(() => validateEvidence(duplicateEvidence, fixture.work, null, fixture.repo), /riggingDelivery/);

  fixture.evidence.riggingDelivery.characters[0].regression.cases.pop();
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}));

test('多角色证据集合必须精确匹配，不能漏交或重复角色', () => withFixture((fixture) => {
  fixture.evidence.riggingDelivery.characters.pop();
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}, { characterCount: 2 }));

test('多角色缺失资源 finding 只退回所属角色，不因路径不在依赖清单而广播', () => withFixture((fixture) => {
  fixture.evidence.riggingDelivery.characters[0].findings = [{
    role: 'visualAssets',
    reason: 'hero-01 的使用场景变体缺图，需要视觉资产负责人补图。',
    affectedPaths: ['Assets/Characters/hero-01/Textures/missing-variant.png'],
  }];
  saveControlRecords(fixture);

  const repairs = inspect(controlArgs(fixture), 'check').riggingDelivery.repairs;
  assert.equal(repairs.length, 1, JSON.stringify(repairs));
  assert.equal(repairs[0].characterId, 'hero-01');
  assert.equal(repairs[0].role, 'visualAssets');
  assert.equal(repairs.some((repair) => repair.characterId === 'hero-02'), false, '第二角色不能收到第一角色行内 finding 的派单');
}, { characterCount: 2 }));

test('Packages 下的技术美术 finding 覆盖所属角色默认骨骼返修且不误派其他角色', () => withFixture((fixture) => {
  const report = readAssetReport(fixture, 0);
  report.status = 'FAIL';
  report.checks[0].status = 'FAIL';
  saveAssetReport(fixture, report, 0);
  fixture.evidence.riggingDelivery.characters[0].findings = [{
    role: 'technicalArt',
    reason: '共享 RiggingValidation 检查器存在工程问题，需要技术美术修复。',
    affectedPaths: ['Packages/com.example.rigging-validation/Editor/RiggingValidator.cs'],
  }];
  saveControlRecords(fixture);

  const repairs = inspect(controlArgs(fixture), 'check').riggingDelivery.repairs;
  assert.equal(repairs.some((repair) => repair.characterId === 'hero-01' && repair.role === 'technicalArt' && repair.disposition === 'repair'), true, JSON.stringify(repairs));
  assert.equal(repairs.some((repair) => repair.characterId === 'hero-01' && repair.role === 'rigging'), false, '明确 TA finding 应覆盖默认骨骼返修');
  assert.equal(repairs.some((repair) => repair.characterId === 'hero-02'), false, 'Packages 工具 finding 仍只作用于所属角色');
}, { characterCount: 2 }));

test('明确记录的问题按岗位退修，失败证据不会因 findings 豁免', () => withFixture((fixture) => {
  const report = readAssetReport(fixture);
  report.status = 'FAIL';
  report.checks[1].status = 'FAIL';
  saveAssetReport(fixture, report);
  fixture.evidence.riggingDelivery.characters[0].findings = [{
    role: 'visualAssets',
    reason: '变体贴图与角色边界不一致，需要视觉资产负责人修图。',
    affectedPaths: ['Assets/Characters/hero-01/Textures/body.png'],
  }];
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'visualAssets', assignee: fixture.owners.visualAssets, disposition: 'repair' });
  assert.doesNotThrow(() => validateEvidence(fixture.evidence, fixture.work, null, fixture.repo));
}));

test('资产失败默认交骨骼返修，运行失败可按记录退给 TA、玩法或视觉岗位', () => withFixture((fixture) => {
  const report = readAssetReport(fixture);
  report.status = 'FAIL';
  report.checks[0].status = 'FAIL';
  saveAssetReport(fixture, report);
  assertHandoffBlocked(fixture, { role: 'rigging', assignee: fixture.owners.rigging, disposition: 'repair' });

  report.status = 'FAIL';
  report.checks.find((item) => item.id === 'asset-source-evidence').status = 'FAIL';
  saveAssetReport(fixture, report);
  fixture.evidence.riggingDelivery.characters[0].findings = [{
    role: 'technicalArt',
    reason: '共享检查器的来源证据检查没有写入实际依赖。',
    affectedPaths: ['Assets/Characters/hero-01/Animations/idle.anim'],
  }];
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'technicalArt', assignee: fixture.owners.technicalArt, disposition: 'repair' });

  report.status = 'PASS';
  report.checks[0].status = 'PASS';
  fixture.evidence.riggingDelivery.characters[0].regression.status = 'FAIL';
  saveAssetReport(fixture, report);
  const pipeline = readPipelineResult(fixture);
  pipeline.result.results[0].Status = 'Failed';
  pipeline.result.summary.passed = 0;
  pipeline.result.summary.failed = 1;
  fixture.evidence.riggingDelivery.characters[0].regression.cases[0].status = 'FAIL';
  savePipelineResult(fixture, pipeline.envelope, pipeline.result);

  for (const [role, path] of [
    ['technicalArt', 'Assets/Characters/hero-01/Animations/idle.anim'],
    ['visualAssets', 'Assets/Characters/hero-01/Textures/body.png'],
    ['gameplay', 'Assets/Scripts/HeroController.cs'],
  ]) {
    if (role === 'gameplay') writeFixtureFile(fixture.repo, path, 'public sealed class HeroController {}');
    fixture.evidence.riggingDelivery.characters[0].findings = [{
      role,
      reason: `运行复验发现 ${role} 范围的问题，需要对应岗位修复。`,
      affectedPaths: [path],
    }];
    saveControlRecords(fixture);
    assertHandoffBlocked(fixture, { role, assignee: fixture.owners[role], disposition: 'repair' });
  }
}));

test('临时 Unity 骨骼测试夹具中的 Prefab 不能作为正式角色资产', () => withFixture((fixture) => {
  const schemas = compileRiggingSchemas();
  const prefabPath = 'Assets/__UwtRiggingTests_ab12/Hero.prefab';
  const prefabGuid = 'e'.repeat(32);
  writeFixtureFile(fixture.repo, prefabPath, 'temporary test prefab content');
  writeFixtureFile(fixture.repo, `${prefabPath}.meta`, `fileFormatVersion: 2\nguid: ${prefabGuid}\nPrefabImporter:\n  externalObjects: {}\n`);

  fixture.work.riggingDelivery.characters[0].prefabPath = prefabPath;
  fixture.work.riggingDelivery.characters[0].prefabGuid = prefabGuid;
  fixture.evidence.riggingDelivery.characters[0].prefabPath = prefabPath;
  fixture.evidence.riggingDelivery.characters[0].prefabGuid = prefabGuid;
  const report = readAssetReport(fixture);
  const prefabEvidence = report.evidence.find((item) => item.type === 'rigging-prefab');
  prefabEvidence.path = prefabPath;
  prefabEvidence.subjectId = prefabGuid;
  saveAssetReport(fixture, report);
  saveControlRecords(fixture);
  assert.equal(schemas.work(fixture.work), false, '正式 Prefab 不得取自临时 Unity 骨骼夹具目录');
  assert.throws(() => validateWorkItem(fixture.work), /riggingDelivery|夹具|Prefab|prefab/);
}));

test('仓库级骨骼测试结果不能冒充角色级 Unity 回归', () => withFixture((fixture) => {
  const pipeline = readPipelineResult(fixture);
  const fixtureTestName = 'Project.UnityWorkflow.Tests.Rigging.RiggingCharacterRuntimeTests.FakePass';
  pipeline.result.results[0].FullName = fixtureTestName;
  savePipelineResult(fixture, pipeline.envelope, pipeline.result);
  fixture.evidence.riggingDelivery.characters[0].regression.cases[0].testName = fixtureTestName;
  saveControlRecords(fixture);
  assertHandoffBlocked(fixture, { role: 'qa', disposition: 'revalidate' });
}));

test('角色门禁独立要求 Unity PlayMode PASS，validationPlan 为空也不能绕过', () => {
  const schemas = compileRiggingSchemas();
  const invalidPlayModeValues = [
    ['缺失', (evidence) => { delete evidence.unityEvidence.playMode; }],
    ['null', (evidence) => { evidence.unityEvidence.playMode = null; }],
    ['NOT_RUN', (evidence) => { evidence.unityEvidence.playMode = 'NOT_RUN'; }],
    ['FAIL', (evidence) => { evidence.unityEvidence.playMode = 'FAIL'; }],
    ['对象 NOT_RUN', (evidence) => { evidence.unityEvidence.playMode = { status: 'NOT_RUN' }; }],
    ['对象 FAIL', (evidence) => { evidence.unityEvidence.playMode = { status: 'FAIL' }; }],
  ];

  for (const [label, mutate] of invalidPlayModeValues) {
    withFixture((fixture) => {
      fixture.work.validationPlan = [];
      mutate(fixture.evidence);
      const invalidPassCandidate = structuredClone(fixture.evidence);
      assert.equal(schemas.evidence(invalidPassCandidate), false, `${label}: PASS Manifest 的 Schema 必须要求 PlayMode PASS`);
      assert.throws(
        () => validateEvidence(invalidPassCandidate, fixture.work, null, fixture.repo),
        /playMode|PlayMode|FAIL|PASS/,
        `${label}: PASS Manifest 的运行时校验必须要求 PlayMode PASS`,
      );

      // 失败事实仍需可写入 Evidence；交付门禁随后阻断并要求 QA 复验。
      fixture.evidence.verdict = 'NOT_RUN';
      fixture.evidence.gateResults.F3.status = 'NOT_RUN';
      assert.doesNotThrow(() => validateEvidence(fixture.evidence, fixture.work, null, fixture.repo), `${label}: NOT_RUN Manifest 应可记录`);
      assert.equal(schemas.evidence(fixture.evidence), label === 'null' ? false : true, `${label}: NOT_RUN Manifest 的 Schema 应允许记录`);
      saveControlRecords(fixture);

      const checked = check(controlArgs(fixture));
      assert.equal(checked.status, 'BLOCKED', `${label}: check 必须阻断`);
      assert.equal(checked.metadata?.riggingDelivery?.handoffAllowed, false, `${label}: check 必须带门禁结果`);

      const runResult = run(controlArgs(fixture));
      assert.equal(runResult.status, 'BLOCKED', `${label}: run 必须阻断`);
      assert.equal(runResult.metadata?.riggingDelivery?.handoffAllowed, false, `${label}: run 必须带门禁结果`);

      const inspection = inspect(controlArgs(fixture), 'transition');
      assert.throws(() => transitionWorkItem(inspection, 'PASSED'), /骨骼|交付|阻断|inspect/, `${label}: 直接迁移必须阻断`);
    });
  }

  withFixture((fixture) => {
    fixture.work.validationPlan = [];
    fixture.evidence.unityEvidence.playMode = { status: 'PASS' };
    saveControlRecords(fixture);
    assert.equal(schemas.evidence(fixture.evidence), true, '对象 status=PASS 应符合 Schema');
    assert.doesNotThrow(() => validateEvidence(fixture.evidence, fixture.work, null, fixture.repo));
    assertHandoffAllowed(fixture);
  });

  withFixture((fixture) => {
    fixture.work.validationPlan = [];
    fixture.evidence.verdict = 'FAIL';
    fixture.evidence.gateResults.F3.status = 'FAIL';
    fixture.evidence.unityEvidence.playMode = 'FAIL';
    assert.equal(schemas.evidence(fixture.evidence), true, '真实 FAIL Manifest 必须可通过 Schema 保存');
    assert.doesNotThrow(() => validateEvidence(fixture.evidence, fixture.work, null, fixture.repo));
    saveControlRecords(fixture);

    const checked = check(controlArgs(fixture));
    const runResult = run(controlArgs(fixture));
    assert.equal(checked.status, 'BLOCKED');
    assert.equal(checked.metadata?.riggingDelivery?.handoffAllowed, false);
    assert.equal(runResult.status, 'BLOCKED');
    assert.equal(runResult.metadata?.riggingDelivery?.handoffAllowed, false);
    const inspection = inspect(controlArgs(fixture), 'transition');
    assert.throws(() => transitionWorkItem(inspection, 'PASSED'), /骨骼|交付|阻断|inspect/);
  });
});

test('岗位诊断中的 Windows、UNC 与 POSIX 绝对路径在所有门禁输出中脱敏', () => {
  const pathCases = [
    {
      label: 'Windows',
      absolutePath: 'C:\\Private\\unity-project\\Assets\\Characters\\Hero.prefab',
      reason: '失败原因中的 Windows 路径 C:\\Private\\unity-project\\Assets\\Characters\\Hero.prefab',
    },
    {
      label: 'UNC',
      absolutePath: '\\\\build-share\\unity\\Assets\\Characters\\Hero.prefab',
      reason: '失败原因中的 UNC 路径 \\\\build-share\\unity\\Assets\\Characters\\Hero.prefab',
    },
    {
      label: '空白前缀 POSIX',
      absolutePath: '/srv/private/Hero.prefab',
      reason: '失败资源路径 /srv/private/Hero.prefab',
    },
    {
      label: '中文冒号前缀 POSIX',
      absolutePath: '/srv/private/Hero.prefab',
      reason: '资源路径：/srv/private/Hero.prefab',
    },
    {
      label: '括号包裹 POSIX',
      absolutePath: '/srv/private/Hero.prefab',
      reason: '资源路径 (/srv/private/Hero.prefab)',
    },
  ];

  for (const pathCase of pathCases) {
    withFixture((fixture) => assertDiagnosticPathRedacted(fixture, pathCase));
  }
});

test('VALIDATING、PASSED 等状态的 inspect/check/status/run 与直接 transition 都执行交付门禁', () => withFixture((fixture) => {
  const failedReport = readAssetReport(fixture);
  failedReport.status = 'PASS';
  failedReport.checks[0].status = 'FAIL';
  saveAssetReport(fixture, failedReport);
  fixture.work.globalState = 'VALIDATING';
  saveControlRecords(fixture);

  for (const [fromState, targetState] of [
    ['REVIEW', 'VALIDATING'],
    ['VALIDATING', 'PASSED'],
    ['PASSED', 'INTEGRATING'],
    ['INTEGRATING', 'COMPLETE'],
  ]) {
    fixture.work.globalState = fromState;
    saveControlRecords(fixture);
    const inspection = inspect(controlArgs(fixture), 'transition');
    assert.throws(() => transitionWorkItem(inspection, targetState), /交付|骨骼|阻断|inspect/);
  }

  fixture.work.globalState = 'VALIDATING';
  saveControlRecords(fixture);
  const checked = check(controlArgs(fixture));
  const stat = status(controlArgs(fixture));
  const runResult = run(controlArgs(fixture));
  for (const output of [checked, stat, runResult]) {
    assert.equal(output.status, 'BLOCKED');
    assert.equal(output.metadata?.riggingDelivery?.handoffAllowed, false);
  }
  const persistedWork = JSON.parse(readFileSync(join(fixture.repo, fixture.workPath), 'utf8'));
  assert.equal(persistedWork.globalState, 'VALIDATING');
  assert.equal(persistedWork.revision, fixture.work.revision);
}));

test('门禁读取只读，修复后以新鲜真实报告和复验结果恢复放行', () => withFixture((fixture) => {
  const report = readAssetReport(fixture);
  report.status = 'FAIL';
  saveAssetReport(fixture, report);
  fixture.work.globalState = 'VALIDATING';
  saveControlRecords(fixture);
  const originalWork = readFileSync(join(fixture.repo, fixture.workPath), 'utf8');
  const originalEvidence = readFileSync(join(fixture.repo, fixture.evidencePath), 'utf8');
  assert.equal(run(controlArgs(fixture)).status, 'BLOCKED');
  assert.equal(readFileSync(join(fixture.repo, fixture.workPath), 'utf8'), originalWork);
  assert.equal(readFileSync(join(fixture.repo, fixture.evidencePath), 'utf8'), originalEvidence);

  const base = Date.now();
  const assetTime = new Date(base - 7000);
  const generatedAt = new Date(base - 5000);
  const rawTestTime = new Date(base - 4000);
  const completedAt = new Date(base - 3000);
  const reviewedAt = new Date(base - 1000);
  const currentCharacter = fixture.work.riggingDelivery.characters[0];
  currentCharacter.updatedAt = new Date(base - 8000).toISOString();
  const currentReport = readAssetReport(fixture);
  currentReport.status = 'PASS';
  currentReport.generatedAtUtc = generatedAt.toISOString();
  for (const checkItem of currentReport.checks) checkItem.status = 'PASS';
  saveAssetReport(fixture, currentReport, 0, generatedAt);
  for (const item of currentReport.evidence) {
    if (item.type !== 'rigging-prefab' && item.type !== 'rigging-dependency') continue;
    for (const path of [item.path, `${item.path}.meta`]) {
      const absolute = join(fixture.repo, ...path.split('/'));
      utimesSync(absolute, assetTime, assetTime);
    }
  }
  const pipeline = readPipelineResult(fixture);
  savePipelineResult(fixture, pipeline.envelope, pipeline.result);
  const rawPath = fixture.evidenceCharacters[0].regression.rawReportPath;
  utimesSync(join(fixture.repo, ...rawPath.split('/')), rawTestTime, rawTestTime);
  const evidenceCharacter = fixture.evidence.riggingDelivery.characters[0];
  evidenceCharacter.reviewedAt = reviewedAt.toISOString();
  evidenceCharacter.regression.completedAt = completedAt.toISOString();
  saveControlRecords(fixture);

  assertHandoffAllowed(fixture);
  const originalValidWork = readFileSync(join(fixture.repo, fixture.workPath), 'utf8');
  const originalValidEvidence = readFileSync(join(fixture.repo, fixture.evidencePath), 'utf8');
  assert.doesNotThrow(() => validateEvidence(fixture.evidence, fixture.work, null, fixture.repo));
  assert.equal(readFileSync(join(fixture.repo, fixture.workPath), 'utf8'), originalValidWork);
  assert.equal(readFileSync(join(fixture.repo, fixture.evidencePath), 'utf8'), originalValidEvidence);
}));

test('普通资产和公共工具工作项维持既有流程，不要求角色报告或角色级回归', () => withFixture((fixture) => {
  const work = { ...fixture.work, domain: 'shared-tooling', globalState: 'VALIDATING' };
  delete work.riggingDelivery;
  const evidence = { ...fixture.evidence };
  delete evidence.riggingDelivery;
  assert.doesNotThrow(() => validateWorkItem(work));
  assert.doesNotThrow(() => validateEvidence(evidence, work, null, fixture.repo));
}, { workState: 'VALIDATING' }));
