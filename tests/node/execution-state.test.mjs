import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  archiveExecutionState,
  assertExecutionComplete,
  completeExecutionUnit,
  createExecutionState,
  executionStatePath,
  loadExecutionState,
  writeExecutionState,
} from '../../unity-game-workflow-control/scripts/runtime/execution-state.mjs';

const STATE_SCHEMA = resolve('unity-game-workflow-control/schemas/execution-state.schema.json');
const RESULT_SCHEMA = resolve('unity-game-workflow-control/schemas/execution-unit-result.schema.json');
const EVIDENCE_ROOT = 'Artifacts/Execution';

/** 创建隔离的临时项目，并在测试结束时清理本测试创建的目录。 */
function makeWorkspace(t, units = [makeUnit('UNIT-1')]) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-execution-state-'));
  mkdirSync(join(repo, EVIDENCE_ROOT), { recursive: true });
  const work = {
    workItemId: 'WI-EXEC-1',
    baselineHash: 'git:baseline-one',
    stageId: 'foundation-engineering',
    evidenceRoot: EVIDENCE_ROOT,
  };
  const pkg = {
    packageId: 'PKG-EXEC-1',
    workItemId: work.workItemId,
    stageId: work.stageId,
    executionUnits: units,
  };
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return { repo, work, pkg };
}

/** 创建带有冻结验收命令的实施单元。 */
function makeUnit(unitId, overrides = {}) {
  return {
    unitId,
    unitType: 'MODULE',
    owner: 'worker',
    editorWrite: false,
    files: [`Assets/Scripts/${unitId}.cs`],
    dependsOn: [],
    parallelGroup: null,
    acceptanceCommands: [`rtk node --check ${unitId}.mjs`],
    status: 'PLANNED',
    ...overrides,
  };
}

/** 在临时仓库中写入证据附件并返回其项目相对路径。 */
function writeEvidence(repo, path, contents = 'PASS\n') {
  const absolute = join(repo, ...path.split('/'));
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, contents, 'utf8');
  return path;
}

/** 创建绑定当前计划的 Result JSON，不会执行其中记录的验收命令。 */
function writeResult(repo, work, pkg, unitId, overrides = {}) {
  const state = createExecutionState(work, pkg);
  const unit = state.units.find((entry) => entry.unitId === unitId);
  assert.ok(unit, `测试 Result 指向的单元必须存在：${unitId}`);
  const outputFile = overrides.outputFile ?? `${EVIDENCE_ROOT}/results/${unitId}-check.txt`;
  writeEvidence(repo, outputFile, overrides.outputContents ?? '命令输出\n');
  const extraFiles = (overrides.extraFiles ?? []).map((path) => writeEvidence(repo, path, '附加证据\n'));
  const resultPath = overrides.resultPath ?? `${EVIDENCE_ROOT}/results/${unitId}-result.json`;
  const result = {
    schemaVersion: '1.0',
    resultId: `RESULT-${unitId}`,
    workItemId: work.workItemId,
    packageId: pkg.packageId,
    planVersion: state.planVersion,
    unitId,
    verdict: 'PASS',
    commands: [{ command: unit.acceptanceCommands[0], exitCode: 0, outputFile }, ...(overrides.commands ?? [])],
    files: [outputFile, ...extraFiles, ...(overrides.files ?? [])],
    recordedAt: '2026-10-20T08:00:00.000Z',
    ...overrides.result,
  };
  writeEvidence(repo, resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return { resultPath, result, outputFile };
}

/** 将状态初始化并持久化，供需要操作现有状态的测试复用。 */
function initialize(repo, work, pkg) {
  return writeExecutionState(repo, work, pkg, createExecutionState(work, pkg));
}

test('创建计划快照并按场景或弹窗阶段绑定状态', () => {
  const work = {
    workItemId: 'WI-SCENE', baselineHash: 'git:one', stageId: 'scene-production',
    evidenceRoot: EVIDENCE_ROOT, scene: { sceneId: 'S1', stage: 'V2' },
  };
  const pkg = {
    packageId: 'PKG-SCENE', workItemId: 'WI-SCENE', stageId: 'scene-production',
    executionUnits: [makeUnit('SCENE-UNIT', { status: 'COMPLETE' })],
  };
  const state = createExecutionState(work, pkg);

  assert.equal(state.sceneStage, 'V2');
  assert.equal(state.displayLayerStage, null);
  assert.equal(state.units[0].status, 'IN_PROGRESS');
  assert.equal(state.units[0].planStatus, undefined);
  assert.equal(state.units[0].unitId, 'SCENE-UNIT');
  assert.equal(executionStatePath(work), `${EVIDENCE_ROOT}/execution-state.json`);
});

test('初始化幂等，baselineHash 改变不改变计划验收身份', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  const initial = initialize(repo, work, pkg);
  const changedGitIdentity = { ...work, baselineHash: 'git:baseline-two' };

  assert.equal(createExecutionState(work, pkg).planVersion, createExecutionState(changedGitIdentity, pkg).planVersion);
  const repeated = writeExecutionState(repo, changedGitIdentity, pkg, createExecutionState(changedGitIdentity, pkg));
  assert.equal(repeated.revision, initial.revision);
  assert.equal(loadExecutionState(repo, changedGitIdentity, pkg).baselineHash, work.baselineHash);
});

test('单元 Result PASS 后完成当前单元并激活下一个顺序单元', (t) => {
  const { repo, work, pkg } = makeWorkspace(t, [makeUnit('UNIT-1'), makeUnit('UNIT-2')]);
  initialize(repo, work, pkg);
  const result = writeResult(repo, work, pkg, 'UNIT-1');
  const next = completeExecutionUnit(repo, work, pkg, result.resultPath);

  assert.equal(next.revision, 1);
  assert.deepEqual(next.units.map((unit) => unit.status), ['COMPLETE', 'IN_PROGRESS']);
  assert.throws(() => assertExecutionComplete(repo, work, pkg), /尚未全部完成/);
  const secondResult = writeResult(repo, work, pkg, 'UNIT-2');
  completeExecutionUnit(repo, work, pkg, secondResult.resultPath);
  assert.deepEqual(assertExecutionComplete(repo, work, pkg).units.map((unit) => unit.status), ['COMPLETE', 'COMPLETE']);
});

test('连续安全并行组作为一个批次推进，直到所有组员完成才激活下一批', (t) => {
  const { repo, work, pkg } = makeWorkspace(t, [
    makeUnit('UNIT-A', { parallelGroup: 'group-a' }),
    makeUnit('UNIT-B', { parallelGroup: 'group-a' }),
    makeUnit('UNIT-C'),
  ]);
  const state = initialize(repo, work, pkg);
  assert.deepEqual(state.units.map((unit) => unit.status), ['IN_PROGRESS', 'IN_PROGRESS', 'PENDING']);

  const resultA = writeResult(repo, work, pkg, 'UNIT-A');
  const afterA = completeExecutionUnit(repo, work, pkg, resultA.resultPath);
  assert.deepEqual(afterA.units.map((unit) => unit.status), ['COMPLETE', 'IN_PROGRESS', 'PENDING']);
  const resultB = writeResult(repo, work, pkg, 'UNIT-B');
  const afterB = completeExecutionUnit(repo, work, pkg, resultB.resultPath);
  assert.deepEqual(afterB.units.map((unit) => unit.status), ['COMPLETE', 'COMPLETE', 'IN_PROGRESS']);
});

test('拒绝 Editor 写入和特殊串行类型进入并行组', () => {
  assert.throws(() => createExecutionState(
    { workItemId: 'WI', baselineHash: 'git:one', stageId: 'foundation-engineering', evidenceRoot: EVIDENCE_ROOT },
    { packageId: 'PKG', workItemId: 'WI', executionUnits: [
      makeUnit('EDITOR-A', { editorWrite: true, parallelGroup: 'g' }),
      makeUnit('EDITOR-B', { editorWrite: false, parallelGroup: 'g' }),
    ] },
  ), /含 Editor 写入/);
  assert.throws(() => createExecutionState(
    { workItemId: 'WI', baselineHash: 'git:one', stageId: 'foundation-engineering', evidenceRoot: EVIDENCE_ROOT },
    { packageId: 'PKG', workItemId: 'WI', executionUnits: [
      makeUnit('SHARED', { unitType: 'SHARED', parallelGroup: 'g' }),
    ] },
  ), /必须串行/);
  assert.throws(() => createExecutionState(
    { workItemId: 'WI', baselineHash: 'git:one', stageId: 'foundation-engineering', evidenceRoot: EVIDENCE_ROOT },
    { packageId: 'PKG', workItemId: 'WI', executionUnits: [
      makeUnit('DEPENDENCY', { parallelGroup: 'g', dependsOn: [] }),
      makeUnit('DEPENDER', { parallelGroup: 'g', dependsOn: ['DEPENDENCY'] }),
    ] },
  ), /依赖必须属于更早的执行批次/);
});

test('计划结构变化使旧状态和旧 Result 失效', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  initialize(repo, work, pkg);
  const changedPackage = structuredClone(pkg);
  changedPackage.executionUnits[0].acceptanceCommands[0] = 'rtk node --check changed.mjs';

  assert.throws(() => loadExecutionState(repo, work, changedPackage), /计划身份已变化/);
});

test('模块、范围、场景和弹窗业务身份变化会使旧计划失效', (t) => {
  for (const field of ['moduleId', 'scopeId', 'sceneId', 'displayLayerId', 'hostSceneId']) {
    const { repo, work, pkg } = makeWorkspace(t);
    const state = initialize(repo, work, pkg);
    assert.equal(state.units[0][field], null);
    const changedPackage = structuredClone(pkg);
    changedPackage.executionUnits[0][field] = `changed-${field}`;

    assert.throws(() => loadExecutionState(repo, work, changedPackage), /计划身份已变化/, field);
  }
});

test('拒绝串行或并行前序批次未完成时出现后续 COMPLETE', (t) => {
  const scenarios = [
    {
      units: [makeUnit('SERIAL-A'), makeUnit('SERIAL-B')],
      activeUnits: [],
      completedUnits: ['SERIAL-B'],
    },
    {
      units: [makeUnit('PARALLEL-A', { parallelGroup: 'g' }), makeUnit('PARALLEL-B', { parallelGroup: 'g' }), makeUnit('PARALLEL-C')],
      activeUnits: [],
      completedUnits: ['PARALLEL-C'],
    },
    {
      units: [makeUnit('PARTIAL-A', { parallelGroup: 'g' }), makeUnit('PARTIAL-B', { parallelGroup: 'g' }), makeUnit('PARTIAL-C')],
      activeUnits: ['PARTIAL-B'],
      completedUnits: ['PARTIAL-A', 'PARTIAL-C'],
    },
  ];
  for (const scenario of scenarios) {
    const { repo, work, pkg } = makeWorkspace(t, scenario.units);
    const state = initialize(repo, work, pkg);
    const resultPaths = new Map();
    for (const unitId of scenario.completedUnits) resultPaths.set(unitId, writeResult(repo, work, pkg, unitId).resultPath);
    for (const unit of state.units) {
      if (scenario.completedUnits.includes(unit.unitId)) {
        unit.status = 'COMPLETE';
        unit.resultPath = resultPaths.get(unit.unitId);
      } else if (!scenario.activeUnits.includes(unit.unitId) && unit.status === 'PENDING') {
        unit.status = 'PENDING';
      }
    }
    writeEvidence(repo, executionStatePath(work), `${JSON.stringify(state, null, 2)}\n`);

    assert.throws(() => loadExecutionState(repo, work, pkg), /前序执行批次未完成/);
  }
});

test('读取时拒绝被手工回退的初始状态', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  const state = initialize(repo, work, pkg);
  state.units[0].status = 'PENDING';
  writeEvidence(repo, executionStatePath(work), `${JSON.stringify(state, null, 2)}\n`);

  assert.throws(() => loadExecutionState(repo, work, pkg), /未激活/);
});

test('拒绝执行命令不匹配、非零退出码和缺少输出附件绑定', (t) => {
  const cases = [
    { name: 'command mismatch', result: { commands: [{ command: 'different', exitCode: 0, outputFile: `${EVIDENCE_ROOT}/results/x.txt` }] } },
    { name: 'failed command', result: { commands: [{ command: 'rtk node --check UNIT-1.mjs', exitCode: 1, outputFile: `${EVIDENCE_ROOT}/results/x.txt` }] } },
    { name: 'unlisted output', result: { files: [`${EVIDENCE_ROOT}/results/other.txt`] } },
  ];
  for (const entry of cases) {
    const workspace = makeWorkspace(t);
    initialize(workspace.repo, workspace.work, workspace.pkg);
    const result = writeResult(workspace.repo, workspace.work, workspace.pkg, 'UNIT-1', { result: entry.result });
    assert.throws(() => completeExecutionUnit(workspace.repo, workspace.work, workspace.pkg, result.resultPath), undefined, entry.name);
  }
});

test('拒绝 Result 越出 evidenceRoot、附件缺失或使用符号链接', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  initialize(repo, work, pkg);
  const outside = writeEvidence(repo, 'Artifacts/outside.json', '{}');
  assert.throws(() => completeExecutionUnit(repo, work, pkg, outside), /evidenceRoot/);

  const missingWorkspace = makeWorkspace(t);
  initialize(missingWorkspace.repo, missingWorkspace.work, missingWorkspace.pkg);
  const missing = writeResult(missingWorkspace.repo, missingWorkspace.work, missingWorkspace.pkg, 'UNIT-1');
  rmSync(join(missingWorkspace.repo, ...missing.outputFile.split('/')));
  assert.throws(() => completeExecutionUnit(missingWorkspace.repo, missingWorkspace.work, missingWorkspace.pkg, missing.resultPath), /不存在/);

  const linkedWorkspace = makeWorkspace(t);
  initialize(linkedWorkspace.repo, linkedWorkspace.work, linkedWorkspace.pkg);
  const linked = writeResult(linkedWorkspace.repo, linkedWorkspace.work, linkedWorkspace.pkg, 'UNIT-1');
  const real = join(linkedWorkspace.repo, ...linked.outputFile.split('/'));
  const alias = `${real}.link`;
  try {
    symlinkSync(real, alias, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) return t.skip('当前 Windows 环境不允许创建符号链接');
    throw error;
  }
  linked.result.commands[0].outputFile = `${linked.outputFile}.link`;
  linked.result.files.push(`${linked.outputFile}.link`);
  writeEvidence(linkedWorkspace.repo, linked.resultPath, `${JSON.stringify(linked.result, null, 2)}\n`);
  assert.throws(() => completeExecutionUnit(linkedWorkspace.repo, linkedWorkspace.work, linkedWorkspace.pkg, linked.resultPath), /符号链接/);
});

test('读取状态时重新验证已完成单元的 Result 和附件仍存在', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  initialize(repo, work, pkg);
  const result = writeResult(repo, work, pkg, 'UNIT-1');
  completeExecutionUnit(repo, work, pkg, result.resultPath);
  rmSync(join(repo, ...result.resultPath.split('/')));

  assert.throws(() => loadExecutionState(repo, work, pkg), /不存在/);
});

test('只接受当前活动单元和当前 planVersion 的 Result', (t) => {
  const { repo, work, pkg } = makeWorkspace(t, [makeUnit('UNIT-1'), makeUnit('UNIT-2')]);
  initialize(repo, work, pkg);
  const inactiveResult = writeResult(repo, work, pkg, 'UNIT-2');
  assert.throws(() => completeExecutionUnit(repo, work, pkg, inactiveResult.resultPath), /当前 IN_PROGRESS/);

  const activeResult = writeResult(repo, work, pkg, 'UNIT-1', { result: { planVersion: 'stale-plan' } });
  assert.throws(() => completeExecutionUnit(repo, work, pkg, activeResult.resultPath), /未绑定当前/);
});

test('CAS 拒绝陈旧状态写入，归档状态时保留 Result 附件', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  const stale = initialize(repo, work, pkg);
  const result = writeResult(repo, work, pkg, 'UNIT-1');
  const current = completeExecutionUnit(repo, work, pkg, result.resultPath);
  const outdated = structuredClone(stale);
  outdated.revision = current.revision;
  assert.throws(() => writeExecutionState(repo, work, pkg, outdated), /CAS 冲突/);

  const archivePath = archiveExecutionState(repo, work);
  assert.ok(existsSync(join(repo, ...archivePath.split('/'))));
  assert.ok(existsSync(join(repo, ...result.resultPath.split('/'))));
  assert.throws(() => loadExecutionState(repo, work, pkg), /不存在/);
});

test('共享 evidenceRoot 时归档前核对 Work Item 身份并保留原状态', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  initialize(repo, work, pkg);
  const statePath = join(repo, ...executionStatePath(work).split('/'));

  assert.throws(() => archiveExecutionState(repo, { ...work, workItemId: 'WI-OTHER' }), /workItemId 与当前 Work Item 不一致/);
  assert.equal(existsSync(statePath), true);
  assert.equal(existsSync(join(repo, EVIDENCE_ROOT, 'history')), false);
  assert.equal(loadExecutionState(repo, work, pkg).workItemId, work.workItemId);
});

test('手写状态和 Result 结构与 JSON Schema 一致', (t) => {
  const { repo, work, pkg } = makeWorkspace(t);
  const state = initialize(repo, work, pkg);
  const result = writeResult(repo, work, pkg, 'UNIT-1');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const stateValidator = ajv.compile(JSON.parse(readFileSync(STATE_SCHEMA, 'utf8')));
  const resultValidator = ajv.compile(JSON.parse(readFileSync(RESULT_SCHEMA, 'utf8')));

  assert.equal(stateValidator(state), true, JSON.stringify(stateValidator.errors));
  assert.equal(resultValidator(result.result), true, JSON.stringify(resultValidator.errors));
});
