import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  packageComplete,
  approvalMatches,
  inspect,
  run,
  status,
  transition,
  transitionWorkItem,
  validateEvidence,
  validateImplementationPackage,
  validateWorkItem,
  pathMatches,
  commitWorkMutation,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';

const SCRIPT = resolve('unity-game-workflow-control/scripts/workflow-control.mjs');
const HASH = `sha256:${'a'.repeat(64)}`;

/** 写入测试 JSON 工件，保持目录和换行稳定。 */
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 创建一个只包含 Unity 资产配对和工程路径的实施包。 */
function makePackage(workItemId, complete = false, owner = 'worker') {
  return {
    schemaVersion: '1.0',
    packageId: 'PKG-1',
    workItemId,
    workItemType: 'FOUNDATION',
    baselineHash: HASH,
    packageStatus: complete ? 'COMPLETE' : 'FROZEN',
    fileOwnership: {
      'Assets/Scripts/Player.cs': owner,
      'Assets/Scripts/Player.cs.meta': owner,
    },
    unityOwnership: {
      metaPairs: [{ asset: 'Assets/Scripts/Player.cs', meta: 'Assets/Scripts/Player.cs.meta' }],
      guidImporter: ['Assets/Scripts/Player.cs'],
    },
    executionUnits: [{
      unitId: 'MODULE-1',
      unitType: 'MODULE',
      moduleId: 'core',
      owner,
      files: ['Assets/Scripts/Player.cs', 'Assets/Scripts/Player.cs.meta'],
      status: complete ? 'COMPLETE' : 'READY',
    }],
  };
}

/** 创建一个可用于状态门禁的 Work Item。 */
function makeWork(state = 'REVIEW', overrides = {}) {
  return {
    schemaVersion: '1.0',
    workItemId: 'WI-1',
    projectId: 'unity-test',
    workItemType: 'FOUNDATION',
    moduleIds: ['core'],
    stageId: 'foundation-engineering',
    globalState: state,
    baselineHash: HASH,
    revision: 0,
    objective: '实现玩家模块',
    allowedActions: ['unity-code-change'],
    actionLevel: 'A3',
    actionType: 'unity-code-change',
    allowedPaths: ['Assets/**'],
    forbiddenPaths: ['Library/**'],
    gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' },
    ...overrides,
  };
}

/** 创建验证闭环所需的完整 Unity 证据。 */
function makeEvidence(workItemId = 'WI-1') {
  const pass = { status: 'PASS', summary: 'verified' };
  return {
    schemaVersion: '1.0',
    evidenceId: 'EV-1',
    workItemId,
    packageId: 'PKG-1',
    workItemType: 'FOUNDATION',
    visualStage: 'V0',
    contractVersions: { responsiveContract: 'not-applicable' },
    baselineHash: HASH,
    recordedAt: '2026-09-10T00:00:00Z',
    verdict: 'PASS',
    gateResults: { F0: pass, F1: pass, F2: pass, F3: pass, F4: { status: 'NOT_RUN' } },
    unityEvidence: {
      editorStable: 'PASS', compile: 'PASS', domainReload: 'PASS', console: 'PASS',
      editMode: 'PASS', playMode: 'PASS', scenePrefabImporterGuid: 'PASS', build: 'PASS',
      device: 'NOT_RUN', release: 'NOT_RUN',
    },
  };
}

/** 在临时仓库中写入控制工件并返回 CLI 参数。 */
function fixture(state = 'REVIEW', overrides = {}, complete = false) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-control-'));
  const workPath = join(repo, 'work.json');
  const packagePath = join(repo, 'package.json');
  const evidencePath = join(repo, 'evidence.json');
  const work = makeWork(state, overrides);
  writeJson(workPath, work);
  writeJson(packagePath, makePackage(work.workItemId, complete));
  writeJson(evidencePath, makeEvidence(work.workItemId));
  return { repo, workPath, packagePath, evidencePath };
}

test('run 只推进安全前置状态并在 IMPLEMENTING 停止', () => {
  const item = fixture('REVIEW');
  const output = run({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath });
  assert.equal(output.status, 'READY');
  assert.deepEqual(output.changed, ['REVIEW → IMPLEMENTING']);
  const saved = JSON.parse(readFileSync(item.workPath, 'utf8'));
  assert.equal(saved.globalState, 'IMPLEMENTING');
  assert.equal(saved.revision, 1);
});

test('run/status 不允许跳过 Implementation Package', () => {
  const item = fixture('REVIEW');
  const output = status({ repo: item.repo, 'work-item': item.workPath });
  assert.equal(output.status, 'BLOCKED');
  assert.match(output.blocking.join('\n'), /Implementation Package/);
});

test('PASSED 没有证据时保持阻断', () => {
  const item = fixture('PASSED', { implementationPackage: itemPath('package.json') }, true);
  const output = status({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath });
  assert.equal(output.status, 'BLOCKED');
  assert.match(output.blocking.join('\n'), /Evidence Manifest/);
});

test('完整实施包和 F3 证据允许 run 闭合到 COMPLETE', () => {
  const item = fixture('VALIDATING', {}, true);
  const output = run({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath, evidence: item.evidencePath });
  assert.equal(output.status, 'COMPLETE');
  assert.deepEqual(output.changed, ['VALIDATING → PASSED', 'PASSED → COMPLETE']);
});

test('RETURN 只能显式恢复，run 不会自动 RETURN 或回退', () => {
  const item = fixture('RETURN', {
    returnRecord: {
      classification: 'scope-changed',
      reason: '需求变化',
      affectedScope: ['stage:foundation-engineering'],
      fromState: 'REVIEW',
      toState: 'RETURN',
      recordedAt: '2026-09-10T00:00:00Z',
      resolvedAt: null,
    },
  });
  const before = readFileSync(item.workPath, 'utf8');
  const output = run({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath });
  assert.equal(output.status, 'BLOCKED');
  assert.deepEqual(output.changed, []);
  assert.equal(readFileSync(item.workPath, 'utf8'), before);
});

test('A4 带副作用必须等待精确 F4 批准', () => {
  const item = fixture('PASSED', {
    allowedActions: ['unity-integration'],
    actionLevel: 'A4',
    actionType: 'unity-integration',
    sideEffects: ['修改正式入口'],
    pendingApproval: {
      approvalId: 'AP-1', workItemId: 'WI-1', baselineHash: HASH, stageId: 'foundation-engineering',
      actionLevel: 'A4', gate: 'F4', actionType: 'unity-integration',
      object: '正式入口', impact: ['修改正式入口'], target: ['unity-test'],
    },
  }, true);
  const output = status({ repo: item.repo, 'work-item': item.workPath, evidence: item.evidencePath });
  assert.equal(output.status, 'BLOCKED');
  assert.match(output.blocking.join('\n'), /精确/);
});

test('Unity 路径所有权和单写者约束会拒绝不安全实施包', () => {
  const item = fixture('REVIEW');
  const invalid = makePackage('WI-1');
  invalid.fileOwnership['ProjectSettings/ProjectSettings.asset'] = 'other';
  invalid.executionUnits[0].files.push('ProjectSettings/ProjectSettings.asset');
  assert.throws(() => validateImplementationPackage(invalid, makeWork(), item.repo), /工程级|缺少工程设置|所有者|ProjectSettings/);
  const twoWriters = makePackage('WI-1', false, 'worker');
  twoWriters.executionUnits.push({ unitId: 'SHARED-1', unitType: 'SHARED', moduleId: 'core', owner: 'other', files: ['Assets/Scripts/Shared.cs', 'Assets/Scripts/Shared.cs.meta'], status: 'READY' });
  Object.assign(twoWriters.fileOwnership, { 'Assets/Scripts/Shared.cs': 'other', 'Assets/Scripts/Shared.cs.meta': 'other' });
  twoWriters.unityOwnership.metaPairs.push({ asset: 'Assets/Scripts/Shared.cs', meta: 'Assets/Scripts/Shared.cs.meta' });
  twoWriters.unityOwnership.guidImporter.push('Assets/Scripts/Shared.cs');
  assert.throws(() => validateImplementationPackage(twoWriters, makeWork(), item.repo), /单写者/);
});

test('Implementation Package allowedPaths 只能收窄 Work Item，依赖必须有序且无环', () => {
  const item = fixture('REVIEW');
  const widened = makePackage('WI-1');
  widened.allowedPaths = ['**'];
  assert.throws(() => validateImplementationPackage(widened, makeWork(), item.repo), /扩大 Work Item/);
  const ordered = makePackage('WI-1');
  ordered.executionUnits[0].unitId = 'BASE';
  ordered.executionUnits[0].status = 'COMPLETE';
  ordered.executionUnits.push({ unitId: 'SCENE', unitType: 'MODULE', moduleId: 'core', owner: 'worker', files: ['Assets/Scripts/Scene.cs', 'Assets/Scripts/Scene.cs.meta'], status: 'COMPLETE', dependsOn: ['BASE'] });
  Object.assign(ordered.fileOwnership, { 'Assets/Scripts/Scene.cs': 'worker', 'Assets/Scripts/Scene.cs.meta': 'worker' });
  ordered.unityOwnership.metaPairs.push({ asset: 'Assets/Scripts/Scene.cs', meta: 'Assets/Scripts/Scene.cs.meta' });
  ordered.unityOwnership.guidImporter.push('Assets/Scripts/Scene.cs');
  assert.equal(packageComplete(validateImplementationPackage(ordered, makeWork(), item.repo)), true);
  const cycle = structuredClone(ordered);
  cycle.executionUnits[0].dependsOn = ['SCENE'];
  assert.throws(() => validateImplementationPackage(cycle, makeWork(), item.repo), /循环/);
  const blockedOrder = structuredClone(ordered);
  blockedOrder.executionUnits[0].status = 'READY';
  blockedOrder.executionUnits[1].status = 'IMPLEMENTING';
  assert.throws(() => validateImplementationPackage(blockedOrder, makeWork(), item.repo), /依赖尚未 COMPLETE/);
});

test('Unity 路径先做严格 POSIX canonicalize，拒绝穿越、盘符和空段', () => {
  assert.throws(() => pathMatches('Assets/../ProjectSettings/X.asset', '**'), /非法|空段/);
  assert.throws(() => pathMatches('Assets/X.asset', 'C:/ProjectSettings/**'), /POSIX 相对路径/);
  assert.throws(() => pathMatches('Assets//X.asset', 'Assets/**'), /非法|空段/);
  const invalid = makePackage('WI-1');
  invalid.executionUnits[0].files[0] = 'Assets/../ProjectSettings/X.asset';
  assert.throws(() => validateImplementationPackage(invalid, makeWork()), /非法|空段/);
  assert.throws(() => validateWorkItem(makeWork('REVIEW', { allowedPaths: ['Assets/../ProjectSettings/**'] })), /非法|空段/);
});

test('transition 不能绕过用户决定、失败门或 inspect 阻断', () => {
  const item = fixture('REVIEW', { userDecisionRequired: true });
  const output = run({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath });
  assert.equal(output.status, 'BLOCKED');
  const failed = fixture('REVIEW', { gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'FAIL', F3: 'PASS', F4: 'NOT_RUN' } });
  const failedOutput = run({ repo: failed.repo, 'work-item': failed.workPath, 'implementation-package': failed.packagePath });
  assert.equal(failedOutput.status, 'BLOCKED');
  assert.match(failedOutput.blocking.join('\n'), /F2/);
});

test('Unity 子证据 FAIL 不能被 Work Item 静态 PASS 覆盖', () => {
  const item = fixture('VALIDATING', {}, true);
  const evidence = makeEvidence('WI-1');
  evidence.unityEvidence.compile = 'FAIL';
  assert.throws(() => validateEvidence(evidence, makeWork('VALIDATING'), makePackage('WI-1', true)), /compile/);
  writeJson(item.evidencePath, evidence);
  const output = status({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath, evidence: item.evidencePath });
  assert.equal(output.status, 'BLOCKED');
});

test('审批必须完整绑定 Work Item、基线、阶段和动作', () => {
  const item = fixture('PASSED', {
    allowedActions: ['unity-integration'],
    actionLevel: 'A4',
    actionType: 'unity-integration',
    sideEffects: ['修改入口'],
    pendingApproval: {
      approvalId: 'AP-1', workItemId: 'WI-1', baselineHash: HASH, stageId: 'foundation-engineering',
      actionLevel: 'A4', actionType: 'unity-integration', gate: 'F4', object: '入口', impact: ['修改入口'], target: ['unity-test'],
    },
  });
  const approval = { ...itemApproval(item), baselineHash: `sha256:${'b'.repeat(64)}`, approvedAt: '2026-09-10T00:00:00Z', approvedBy: 'owner' };
  assert.throws(() => validateWorkItem({ ...makeWork('PASSED'), ...JSON.parse(readFileSync(item.workPath, 'utf8')), approval }), /未绑定当前 Work Item/);
});

test('A5/A6 必须经过发布审批状态，RELEASING 可在 F4 和 PASS 证据后闭合', () => {
  const approval = {
    approvalId: 'AP-RELEASE', workItemId: 'WI-1', baselineHash: HASH, stageId: 'release', actionType: 'unity-release', actionLevel: 'A6', gate: 'F4', object: '发行包', impact: ['提交发行包'], target: ['store'], approvedAt: '2026-09-10T00:00:00Z', approvedBy: 'owner',
  };
  const pending = { ...approval };
  delete pending.approvedAt;
  delete pending.approvedBy;
  const work = makeWork('RELEASE_APPROVAL_REQUIRED', { stageId: 'release', allowedActions: ['unity-release'], actionLevel: 'A6', actionType: 'unity-release', gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'PASS' }, pendingApproval: pending });
  const evidence = makeEvidence('WI-1');
  evidence.gateResults.F4 = { status: 'PASS' };
  evidence.approval = approval;
  const repo = mkdtempSync(join(tmpdir(), 'unity-release-'));
  const workPath = join(repo, 'work.json');
  const evidencePath = join(repo, 'evidence.json');
  writeJson(workPath, work);
  writeJson(evidencePath, evidence);
  const inspectArgs = { repo, 'work-item': workPath, evidence: evidencePath };
  writeJson(workPath, { ...work, globalState: 'INTEGRATING' });
  assert.throws(() => transitionWorkItem(importInspection(inspectArgs), 'COMPLETE', { approval }), /RELEASING/);
  writeJson(workPath, work);
  const first = transitionWorkItem(importInspection(inspectArgs), 'RELEASING', { approval });
  assert.equal(first.globalState, 'RELEASING');
  writeJson(workPath, first);
  const second = transitionWorkItem(importInspection(inspectArgs), 'COMPLETE', { approval });
  assert.equal(second.globalState, 'COMPLETE');
});

test('RELEASE_APPROVAL_REQUIRED 可用本次 approval 文件消除精确阻断，但不豁免其他阻断', () => {
  const repo = mkdtempSync(join(tmpdir(), 'unity-approval-cli-'));
  const workPath = join(repo, 'work.json');
  const evidencePath = join(repo, 'evidence.json');
  const approvalPath = join(repo, 'approval.json');
  const approval = { approvalId: 'AP-CLI', workItemId: 'WI-1', baselineHash: HASH, stageId: 'release', actionType: 'unity-release', actionLevel: 'A6', gate: 'F4', object: '发行包', impact: ['提交发行包'], target: ['store'], approvedAt: '2026-09-11T00:00:00Z', approvedBy: 'owner' };
  const pending = { ...approval };
  delete pending.approvedAt;
  delete pending.approvedBy;
  const work = makeWork('RELEASE_APPROVAL_REQUIRED', { stageId: 'release', allowedActions: ['unity-release'], actionLevel: 'A6', actionType: 'unity-release', pendingApproval: pending });
  const evidence = makeEvidence('WI-1');
  evidence.gateResults.F4 = { status: 'PASS' };
  writeJson(workPath, work);
  writeJson(evidencePath, evidence);
  writeJson(approvalPath, approval);

  const output = transition({ repo, 'work-item': workPath, evidence: evidencePath, approval: approvalPath, to: 'RELEASING' });
  assert.equal(output.status, 'READY');
  assert.deepEqual(output.changed, ['RELEASE_APPROVAL_REQUIRED → RELEASING']);
  assert.equal(JSON.parse(readFileSync(workPath, 'utf8')).approval.approvedAt, approval.approvedAt);

  const invalid = { ...approval, baselineHash: `sha256:${'b'.repeat(64)}` };
  writeJson(workPath, work);
  writeJson(approvalPath, invalid);
  assert.throws(() => transition({ repo, 'work-item': workPath, evidence: evidencePath, approval: approvalPath, to: 'RELEASING' }), /未绑定当前 Work Item/);

  writeJson(workPath, { ...work, userDecisionRequired: true });
  writeJson(approvalPath, approval);
  assert.throws(() => transition({ repo, 'work-item': workPath, evidence: evidencePath, approval: approvalPath, to: 'RELEASING' }), /用户选择/);
});

test('A4 进入集成或完成必须绑定 INTEGRATION 单元', () => {
  const item = fixture('PASSED', { allowedActions: ['unity-integration'], actionLevel: 'A4', actionType: 'unity-integration' }, true);
  const output = status({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath, evidence: item.evidencePath });
  assert.equal(output.status, 'BLOCKED');
  assert.match(output.blocking.join('\n'), /INTEGRATION/);
});

test('COMPLETE 不能进入 RETURN，RETURN 恢复清除旧包和证据引用', () => {
  const item = fixture('COMPLETE', { implementationPackagePath: 'package.json', evidenceManifestPath: 'evidence.json' }, true);
  assert.throws(() => transitionWorkItem(importInspection({ repo: item.repo, 'work-item': item.workPath, 'implementation-package': item.packagePath, evidence: item.evidencePath }), 'RETURN', { 'return-category': 'scope-changed', 'return-reason': '范围变化', 'affected-scope': 'stage:foundation-engineering' }), /RETURN/);
  const recover = fixture('RETURN', {
    returnRecord: { classification: 'scope-changed', reason: '范围变化', affectedScope: ['stage:foundation-engineering'], fromState: 'REVIEW', toState: 'RETURN', recordedAt: '2026-09-10T00:00:00Z', resolvedAt: null },
    implementationPackagePath: 'package.json', evidenceManifestPath: 'evidence.json',
  });
  const next = transitionWorkItem(importInspection({ repo: recover.repo, 'work-item': recover.workPath, 'implementation-package': recover.packagePath, evidence: recover.evidencePath }), 'REVIEW', { 'return-resolution': '重新审查' });
  assert.equal(next.globalState, 'REVIEW');
  assert.equal(next.implementationPackagePath, undefined);
  assert.equal(next.evidenceManifestPath, undefined);
  assert.deepEqual(next.gateStatus, { F0: 'NOT_RUN', F1: 'NOT_RUN', F2: 'NOT_RUN', F3: 'NOT_RUN', F4: 'NOT_RUN' });

  const hardBlocked = fixture('RETURN', {
    userDecisionRequired: true,
    returnRecord: { classification: 'scope-changed', reason: '范围变化', affectedScope: ['stage:foundation-engineering'], fromState: 'REVIEW', toState: 'RETURN', recordedAt: '2026-09-10T00:00:00Z', resolvedAt: null },
  });
  assert.throws(() => transitionWorkItem(importInspection({ repo: hardBlocked.repo, 'work-item': hardBlocked.workPath }), 'REVIEW', { 'return-resolution': '重新审查' }), /硬阻断|USER_DECISION/);
  assert.throws(() => transitionWorkItem(importInspection({ repo: recover.repo, 'work-item': recover.workPath, 'implementation-package': recover.packagePath, evidence: recover.evidencePath }), 'REVIEW', { 'return-resolution': '重新审查', 'implementation-package': recover.packagePath, evidence: recover.evidencePath }), /不能复用旧/);
});

test('Work Item 拒绝旧版未声明字段', () => {
  assert.throws(() => validateWorkItem({ ...makeWork(), g0State: 'REVIEW' }), /未声明字段/);
});

test('schema 与 runtime 对 unityOwnership、packageStatus、dependsOn 保持一致', () => {
  const ajv = new Ajv2020({ strict: false });
  const readSchema = (name) => JSON.parse(readFileSync(resolve(`unity-game-workflow-control/schemas/${name}`), 'utf8'));
  const work = makeWork();
  const pkg = makePackage('WI-1');
  const evidence = makeEvidence('WI-1');
  const workValid = ajv.compile(readSchema('work-item.schema.json'));
  const packageValid = ajv.compile(readSchema('implementation-package.schema.json'));
  const evidenceValid = ajv.compile(readSchema('evidence-manifest.schema.json'));
  assert.equal(workValid(work), true);
  assert.equal(packageValid(pkg), true);
  assert.equal(evidenceValid(evidence), true);
  validateWorkItem(work);
  validateImplementationPackage(pkg, work);
  validateEvidence(evidence, work, pkg);

  const pendingApproval = { approvalId: 'AP-PENDING', workItemId: 'WI-1', baselineHash: HASH, stageId: 'foundation-engineering', actionType: 'unity-integration', actionLevel: 'A4', gate: 'F4', object: '入口', impact: ['修改入口'], target: ['unity-test'] };
  const pendingWork = makeWork('REVIEW', { allowedActions: ['unity-integration'], actionLevel: 'A4', actionType: 'unity-integration', sideEffects: ['修改入口'], pendingApproval });
  assert.equal(workValid(pendingWork), true);
  validateWorkItem(pendingWork);
  const pendingWithTime = { ...pendingWork, pendingApproval: { ...pendingApproval, approvedAt: '2026-09-10T00:00:00Z', approvedBy: 'owner' } };
  assert.equal(workValid(pendingWithTime), false);
  assert.throws(() => validateWorkItem(pendingWithTime), /pendingApproval.*未声明字段/);
  const approvedWork = { ...pendingWork, approval: { ...pendingApproval, approvedAt: '2026-09-11T00:00:00Z', approvedBy: 'owner' } };
  assert.equal(workValid(approvedWork), true);
  validateWorkItem(approvedWork);
  assert.equal(approvalMatches(approvedWork, approvedWork.approval), true);

  const missingStatus = structuredClone(pkg);
  delete missingStatus.packageStatus;
  assert.equal(packageValid(missingStatus), false);
  assert.throws(() => validateImplementationPackage(missingStatus, work), /packageStatus/);

  const inconsistentStatus = structuredClone(pkg);
  inconsistentStatus.packageStatus = 'COMPLETE';
  assert.equal(packageValid(inconsistentStatus), false);
  assert.throws(() => validateImplementationPackage(inconsistentStatus, work), /所有实施单元必须为 COMPLETE/);

  const unknownOwnership = structuredClone(pkg);
  unknownOwnership.unityOwnership.unknown = [];
  assert.equal(packageValid(unknownOwnership), false);
  assert.throws(() => validateImplementationPackage(unknownOwnership, work), /未声明字段|unityOwnership/);

  const missingDependency = structuredClone(pkg);
  missingDependency.executionUnits[0].dependsOn = ['MISSING'];
  assert.equal(packageValid(missingDependency), true);
  assert.throws(() => validateImplementationPackage(missingDependency, work), /依赖不存在/);
});

test('Work Item mutation 使用同目录锁和 revision/CAS 防陈旧覆盖', () => {
  const locked = fixture('REVIEW');
  const lockPath = `${locked.workPath}.lock`;
  writeFileSync(lockPath, 'busy', 'utf8');
  try {
    const output = run({ repo: locked.repo, 'work-item': locked.workPath, 'implementation-package': locked.packagePath });
    assert.equal(output.status, 'BLOCKED');
    assert.match(output.blocking.join('\n'), /锁定/);
    assert.equal(JSON.parse(readFileSync(locked.workPath, 'utf8')).revision, 0);
  } finally {
    rmSync(lockPath, { force: true });
  }

  const stale = fixture('REVIEW');
  const inspection = importInspection({ repo: stale.repo, 'work-item': stale.workPath, 'implementation-package': stale.packagePath });
  const next = transitionWorkItem(inspection, 'IMPLEMENTING');
  const changed = JSON.parse(readFileSync(stale.workPath, 'utf8'));
  changed.revision = 1;
  writeJson(stale.workPath, changed);
  assert.throws(() => commitWorkMutation(inspection, next), /版本已变化/);
  assert.equal(existsSync(`${stale.workPath}.lock`), false);
});

test('lint 校验 Skill 入口和严格 schema', () => {
  const output = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'lint'], { encoding: 'utf8' }));
  assert.equal(output.ok, true);
  assert.equal(output.status, 'READY');
  assert.ok(output.metadata.checked.includes('schemas/work-item.schema.json'));
  assert.ok(output.metadata.checked.includes('scripts/runtime/visible-contract.mjs'));
});

/** 为测试覆盖准备一个相对路径字符串，避免在 fixture 创建前引用临时目录。 */
function itemPath(name) {
  return name;
}

/** 读取测试 Work Item 的精确待审批对象。 */
function itemApproval(item) {
  return JSON.parse(readFileSync(item.workPath, 'utf8')).pendingApproval;
}

/** 通过公开状态入口加载只读 inspection，供 transition 单元测试复用。 */
function importInspection(args) {
  return inspect(args, 'transition');
}

assert.equal(packageComplete(makePackage('WI-1', true)), true);
