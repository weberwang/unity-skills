import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { inspect, run, transition, transitionWorkItem, unitCheck, validateWorkItem } from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import { nextSceneStage } from '../../unity-game-workflow-control/scripts/runtime/stage-transition.mjs';
import { validateVisualBaseline } from '../../unity-game-workflow-control/scripts/runtime/visual-baseline-contract.mjs';
import { deriveReturnState, deriveReturnVisualStage, invalidateStageReviews, createReturnRecord, validateReturnRecord } from '../../unity-game-workflow-control/scripts/runtime/return-disposition.mjs';
import { commitWithLock } from '../../unity-game-workflow-control/scripts/runtime/io.mjs';
import { prepareExecutionMutation } from '../../unity-game-workflow-control/scripts/runtime/execution-transaction.mjs';
import { completeExecutionUnit, createExecutionState, executionStatePath, loadExecutionState, writeExecutionState } from '../../unity-game-workflow-control/scripts/runtime/execution-state.mjs';
import { seedVisualBaseline, seedExecutionFixture } from './helpers/workflow-evidence-fixture.mjs';

/** 保存测试记录；所有执行和用户确认内容均是隔离夹具，不代表真实验收。 */
function save(repo, path, value) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value));
}

/** 构造一个小型非 Editor 写入工作项，用真实 CLI 验证控制面组合行为。 */
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-workflow-update-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const work = { schemaVersion: '1.0', workItemId: 'WI-1', projectId: 'project-1', workItemType: 'FOUNDATION', stageId: 'foundation-engineering', globalState: 'REVIEW', revision: 0, baselineHash: 'git:baseline', objective: '测试纯规则单元', actionType: 'unity-code-change', actionLevel: 'A3', allowedPaths: ['src/**'], forbiddenPaths: [], gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' }, evidenceRoot: '.workflow-control/evidence/WI-1', implementationPackagePath: 'package.json' };
  const pkg = { schemaVersion: '1.0', packageId: 'PKG-1', workItemId: work.workItemId, workItemType: work.workItemType, baselineHash: work.baselineHash, packageStatus: 'FROZEN', fileOwnership: { 'src/rules.mjs': 'worker' }, unityOwnership: {}, executionUnits: [{ unitId: 'U1', unitType: 'MODULE', moduleId: 'core', owner: 'worker', files: ['src/rules.mjs'], editorWrite: false, status: 'READY', acceptanceCommands: ['fixture-only-command'] }] };
  save(repo, 'work.json', work); save(repo, 'package.json', pkg); save(repo, 'src/rules.mjs', '// 测试源码夹具\n');
  return { repo, work, pkg, args: { repo, 'work-item': 'work.json' } };
}

test('unit-check 闭环真实 Result 后可以验证完成，冻结包不需要手填 COMPLETE', (t) => {
  const { repo, work, pkg, args } = fixture(t);
  assert.equal(run(args).status, 'READY');
  const state = loadExecutionState(repo, work, pkg);
  const outputFile = `${work.evidenceRoot}/units/check.log`;
  save(repo, outputFile, '明确标为测试夹具的命令输出');
  const result = { schemaVersion: '1.0', resultId: 'RESULT-1', workItemId: work.workItemId, packageId: pkg.packageId, planVersion: state.planVersion, unitId: 'U1', verdict: 'PASS', commands: [{ command: 'fixture-only-command', exitCode: 0, outputFile }], files: [outputFile], recordedAt: '2026-10-20T00:00:00Z' };
  save(repo, `${work.evidenceRoot}/units/result.json`, result);
  assert.equal(unitCheck({ ...args, result: `${work.evidenceRoot}/units/result.json` }).status, 'READY');
  const pass = { status: 'PASS' };
  const evidencePath = `${work.evidenceRoot}/manifest.json`;
  save(repo, evidencePath, { schemaVersion: '1.0', evidenceId: 'E1', workItemId: work.workItemId, packageId: pkg.packageId, workItemType: work.workItemType, baselineHash: work.baselineHash, recordedAt: '2026-10-20T00:00:00Z', verdict: 'PASS', visualStage: 'V0', contractVersions: { responsiveContract: 'not-applicable' }, gateResults: { F0: pass, F1: pass, F2: pass, F3: pass, F4: { status: 'NOT_RUN' } }, unityEvidence: { editorStable: 'PASS', compile: 'PASS', domainReload: 'PASS', console: 'PASS', scenePrefabImporterGuid: 'PASS' } });
  assert.equal(transition({ ...args, evidence: evidencePath, to: 'VALIDATING' }).status, 'READY');
  assert.equal(run({ ...args, evidence: evidencePath }).status, 'COMPLETE');
  assert.equal(JSON.parse(readFileSync(join(repo, 'package.json'))).executionUnits[0].status, 'READY');
});

test('全局三候选验证支持跨工作项复用，拒绝少图、条件漂移和未通过的所选候选', (t) => {
  const { repo, work } = fixture(t);
  seedVisualBaseline(repo, work);
  assert.deepEqual(validateVisualBaseline(work, null, repo), []);
  const path = 'baseline/selection.json';
  const root = JSON.parse(readFileSync(join(repo, path)));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync('unity-game-workflow-control/schemas/global-visual-baseline.schema.json')));
  assert.equal(validate(root), true);
  save(repo, path, { ...root, candidates: root.candidates.slice(0, 2) });
  assert.match(validateVisualBaseline(work, null, repo).join(), /三张/);
  save(repo, path, root);
  root.candidates[0].qualityResults.viewingComfort.status = 'NOT_RUN'; save(repo, path, root);
  assert.match(validateVisualBaseline(work, null, repo).join(), /全部 PASS/);
  root.candidates[0].qualityResults.viewingComfort.status = 'PASS'; save(repo, path, root);
  const generation = JSON.parse(readFileSync(join(repo, root.candidates[0].generationRecordPath)));
  save(repo, root.candidates[0].generationRecordPath, { ...generation, conditions: { ...generation.conditions, state: 'different' } });
  assert.match(validateVisualBaseline(work, null, repo).join(), /共同条件/);
});

test('RETURN 按最早受影响阶段恢复，不能手写更晚恢复点', (t) => {
  const { work } = fixture(t);
  assert.equal(deriveReturnState(['stage:V4', 'stage:V2']), 'REVIEW');
  const record = createReturnRecord(work, { 'return-category': 'scope-changed', 'return-reason': '测试范围改变', 'affected-scope': ['stage:V2'] });
  assert.equal(record.returnState, 'REVIEW');
  assert.throws(() => validateReturnRecord({ ...record, returnState: 'IMPLEMENTING' }), /推导/);
  assert.throws(() => deriveReturnState(['stage:unknown']), /未知阶段/);
  assert.throws(() => deriveReturnState(['artifact:../outside']), /明确/);
  const returned = { ...work, globalState: 'RETURN', returnRecord: record };
  assert.throws(() => transitionWorkItem({ work: returned, repo: '.', blockers: [], evidence: null }, 'BLOCKED', { reason: '试图绕过恢复点' }), /非法状态迁移/);
  assert.throws(() => validateWorkItem({ ...returned, globalState: 'BLOCKED' }), /未解决/);
});

test('仅 V4 实现返修保留 V3 资源确认，明确上游失效才退回且不前跳阶段', () => {
  const work = { workItemType: 'SCENE', scene: { stage: 'V4' }, stageReviews: ['V1', 'V2', 'V3', 'V4'].map((stage) => ({ stage })) };
  const record = { returnState: 'IMPLEMENTING', affectedScope: ['stage:V4'] };
  assert.equal(deriveReturnVisualStage(work, record), 'V4');
  assert.deepEqual(invalidateStageReviews(work, record).map((review) => review.stage), ['V1', 'V2', 'V3']);
  const resources = { ...record, affectedScope: ['stage:V4', 'stage:V3'] };
  assert.equal(deriveReturnVisualStage(work, resources), 'V3');
  assert.deepEqual(invalidateStageReviews(work, resources).map((review) => review.stage), ['V1', 'V2']);
  assert.equal(deriveReturnVisualStage({ ...work, scene: { stage: 'V1' } }, resources), 'V1');
  assert.equal(deriveReturnVisualStage({ ...work, scene: { stage: 'V2' } }, record), 'V2');
});

test('工作项写回失败时恢复新建、完成及归档的执行状态', (t) => {
  for (const operation of ['initialize', 'complete', 'archive']) {
    const { repo, work, pkg, args } = fixture(t);
    let next;
    let options = {};
    if (operation !== 'initialize') {
      seedExecutionFixture(repo, work, pkg, false);
      work.globalState = 'IMPLEMENTING'; save(repo, 'work.json', work);
    }
    const inspection = inspect(args);
    if (operation === 'archive') next = { ...inspection.work, revision: 1, globalState: 'RETURN', returnRecord: createReturnRecord(inspection.work, { 'return-category': 'scope-changed', 'return-reason': '测试归档', 'affected-scope': 'stage:V2' }) };
    else next = { ...inspection.work, revision: 1, globalState: 'IMPLEMENTING' };
    const statePath = join(repo, executionStatePath(work));
    const before = existsSync(statePath) ? readFileSync(statePath, 'utf8') : null;
    if (operation === 'complete') {
      const state = loadExecutionState(repo, work, pkg);
      const outputFile = `${work.evidenceRoot}/units/check.log`;
      save(repo, outputFile, 'fixture');
      options.resultPath = `${work.evidenceRoot}/units/result.json`;
      save(repo, options.resultPath, { schemaVersion: '1.0', resultId: 'R1', workItemId: work.workItemId, packageId: pkg.packageId, planVersion: state.planVersion, unitId: 'U1', verdict: 'PASS', commands: [{ command: 'fixture-only-command', exitCode: 0, outputFile }], files: [outputFile], recordedAt: '2026-10-20T00:00:00Z' });
    }
    assert.throws(() => commitWithLock({ workPath: inspection.workPath, expected: inspection.work, next, readCurrent: (path) => JSON.parse(readFileSync(path)), validate: validateWorkItem, fail: (message) => { throw new Error(message); }, beforeWrite: () => prepareExecutionMutation(inspection, next, options), writeNext: () => { throw new Error('测试模拟工作项写入失败'); } }), /模拟工作项写入失败/);
    assert.equal(existsSync(statePath), before !== null);
    if (before !== null) assert.deepEqual(JSON.parse(readFileSync(statePath)), JSON.parse(before));
    assert.equal(JSON.parse(readFileSync(join(repo, 'work.json'))).revision, 0);
    assert.equal(existsSync(`${inspection.workPath}.lock`), false);
  }
});

test('普通工程包不等待选图，声明视觉依赖后必须有选择证据', (t) => {
  const { repo, work, pkg } = fixture(t);
  assert.deepEqual(validateVisualBaseline(work, pkg, repo), []);
  assert.match(validateVisualBaseline(work, { ...pkg, visualBaselineRequired: true }, repo).join(), /缺少/);
});

test('执行状态回滚遵守同一锁和 CAS，不覆盖后来提交的单元结果或新状态', (t) => {
  const { repo, work, pkg, args } = fixture(t);
  const inspection = inspect(args);
  const next = { ...inspection.work, revision: 1, globalState: 'IMPLEMENTING' };
  const rollback = prepareExecutionMutation(inspection, next);
  const statePath = join(repo, executionStatePath(work));
  save(repo, `${executionStatePath(work)}.lock`, '另一个写入者');
  assert.throws(rollback, /锁定/);
  assert.equal(existsSync(statePath), true);
  rmSync(`${statePath}.lock`);
  rollback();
  assert.equal(existsSync(statePath), false);

  const staleRollback = prepareExecutionMutation(inspection, next);
  const state = loadExecutionState(repo, work, pkg);
  const outputFile = `${work.evidenceRoot}/units/concurrent.log`;
  const resultPath = `${work.evidenceRoot}/units/concurrent.json`;
  save(repo, outputFile, '测试并发提交结果');
  save(repo, resultPath, { schemaVersion: '1.0', resultId: 'R-concurrent', workItemId: work.workItemId, packageId: pkg.packageId, planVersion: state.planVersion, unitId: 'U1', verdict: 'PASS', commands: [{ command: 'fixture-only-command', exitCode: 0, outputFile }], files: [outputFile], recordedAt: '2026-10-20T00:00:00Z' });
  completeExecutionUnit(repo, work, pkg, resultPath);
  assert.throws(staleRollback, /状态已变化/);
  assert.equal(loadExecutionState(repo, work, pkg).units[0].status, 'COMPLETE');

  const archiveRollback = prepareExecutionMutation({ ...inspection, work: next }, { ...next, globalState: 'RETURN' });
  writeExecutionState(repo, work, pkg, createExecutionState(work, pkg));
  assert.throws(archiveRollback, /其他写入者创建/);
  assert.equal(loadExecutionState(repo, work, pkg).units[0].status, 'IN_PROGRESS');
});

test('变更前快照在取执行状态锁后捕获，回滚保留取锁前已完成的并行单元', (t) => {
  const { repo, work, pkg, args } = fixture(t);
  pkg.executionUnits[0].parallelGroup = 'parallel-rules';
  pkg.executionUnits.push({ ...pkg.executionUnits[0], unitId: 'U2', moduleId: 'other', owner: 'other-worker', files: ['src/other.mjs'] });
  pkg.fileOwnership['src/other.mjs'] = 'other-worker';
  save(repo, 'package.json', pkg);
  seedExecutionFixture(repo, work, pkg, false);
  work.globalState = 'IMPLEMENTING'; save(repo, 'work.json', work);
  const inspection = inspect(args);
  const state = loadExecutionState(repo, work, pkg);
  /** 为两个并行规则单元生成独立的模拟命令结果。 */
  const resultFor = (unitId) => {
    const outputFile = `${work.evidenceRoot}/units/${unitId}.log`;
    const resultPath = `${work.evidenceRoot}/units/${unitId}.json`;
    save(repo, outputFile, '测试并行命令输出');
    save(repo, resultPath, { schemaVersion: '1.0', resultId: `R-${unitId}`, workItemId: work.workItemId, packageId: pkg.packageId, planVersion: state.planVersion, unitId, verdict: 'PASS', commands: [{ command: 'fixture-only-command', exitCode: 0, outputFile }], files: [outputFile], recordedAt: '2026-10-20T00:00:00Z' });
    return resultPath;
  };
  const first = resultFor('U1'); const second = resultFor('U2');
  let interleaved = false;
  // 在包装层选定操作、真正取执行状态锁之前，确定性插入另一个单元的提交。
  const options = { get resultPath() {
    if (!interleaved) { interleaved = true; completeExecutionUnit(repo, work, pkg, first); }
    return second;
  } };
  const rollback = prepareExecutionMutation(inspection, { ...work, revision: 1 }, options);
  rollback();
  const after = loadExecutionState(repo, work, pkg);
  assert.deepEqual(after.units.map((unit) => unit.status), ['COMPLETE', 'IN_PROGRESS']);
  assert.equal(after.units[0].resultPath, first);
});

test('相邻视觉阶段入口要求两项 V2 确认，并清除旧消费引用和新阶段工程门', (t) => {
  const { repo, work } = fixture(t);
  work.workItemType = 'SCENE'; work.scene = { sceneId: 'S1', stage: 'V2', status: 'PASS' };
  work.stageId = 'scene-production'; work.globalState = 'PROPOSAL';
  seedVisualBaseline(repo, work);
  /** 构造绑定测试交付的用户消息记录，不代表真实人工验收。 */
  const confirmation = (stage) => ({ workItemId: work.workItemId, stage, confirmedBy: 'test-user', confirmedAt: '2026-10-20T00:00:00Z', userMessageRef: `fixture-${stage}` });
  work.stageReviews = [{ stage: 'V1', confirmation: confirmation('V1') }, { stage: 'V2', decompositionConfirmation: confirmation('V2') }];
  const inspection = { work, repo, pkg: null, evidence: null, blockers: [] };
  assert.throws(() => nextSceneStage(inspection, 'V3'), /布局/);
  work.stageReviews[1].layoutConfirmation = confirmation('V2');
  const next = nextSceneStage(inspection, 'V3');
  assert.equal(next.scene.stage, 'V3'); assert.equal(next.scene.status, 'IN_PROGRESS');
  assert.equal(next.globalState, 'PROPOSAL'); assert.equal(next.gateStatus.F2, 'NOT_RUN');
  assert.equal(next.implementationPackagePath, undefined);
  assert.throws(() => nextSceneStage(inspection, 'V4'), /相邻/);
  work.scene.stage = 'V3'; work.stageReviews.push({ stage: 'V3', confirmation: confirmation('V3') });
  assert.throws(() => nextSceneStage(inspection, 'V4'), /PASS 证据/);
});
