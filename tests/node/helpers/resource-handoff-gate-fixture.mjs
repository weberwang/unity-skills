import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { seedExecutionFixture } from './workflow-evidence-fixture.mjs';
import { makeFrameFixture, makeResourceFixture } from './resource-frame-fixture.mjs';

/** 创建可供控制面端到端检查的临时 Work Item、实施包和 AssetDatabase 读回报告。 */
export function makeResourceHandoffWorkspace({ resource = true, frame = true, declared = true, writeReport = true } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-resource-handoff-gate-'));
  const workItemId = 'WI-RESOURCE-GATE';
  const evidenceRoot = `Artifacts/TestResults/${workItemId}`;
  const work = {
    schemaVersion: '1.0',
    workItemId,
    projectId: 'resource-handoff-test',
    workItemType: 'FOUNDATION',
    moduleIds: ['foundation'],
    stageId: 'foundation-engineering',
    globalState: 'VALIDATING',
    baselineHash: `sha256:${'a'.repeat(64)}`,
    revision: 0,
    objective: '验证资源与序列帧交接门禁',
    allowedPaths: ['Docs/**'],
    allowedActions: ['unity-prototype'],
    actionLevel: 'A2',
    actionType: 'unity-prototype',
    gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' },
    evidenceRoot,
    implementationPackagePath: 'implementation-package.json',
    evidenceManifestPath: 'evidence.json',
  };

  const pkg = {
    schemaVersion: '1.0',
    packageId: 'PKG-RESOURCE-GATE',
    workItemId,
    workItemType: 'FOUNDATION',
    baselineHash: work.baselineHash,
    stageId: work.stageId,
    packageStatus: 'FROZEN',
    fileOwnership: { 'Docs/contract.md': 'foundation-agent' },
    unityOwnership: {},
    executionUnits: [{
      unitId: 'FOUNDATION-1',
      unitType: 'MODULE',
      moduleId: 'foundation',
      owner: 'foundation-agent',
      files: ['Docs/contract.md'],
      acceptanceCommands: ['fixture-only-check'],
      status: 'READY',
    }],
  };

  const resourceFixture = makeResourceFixture();
  const frameFixture = makeFrameFixture();
  const registerPath = 'Contracts/asset-register.json';
  const framePlanPath = 'Contracts/frame-animation-plan.json';
  if (declared) {
    pkg.resourceHandoff = {
      ...(resource ? { assetRegisterRef: { path: registerPath } } : {}),
      ...(frame ? { frameAnimationPlanRef: { path: framePlanPath } } : {}),
    };
  }

  const reportPath = `${evidenceRoot}/resource-handoff.json`;
  const evidence = {
    schemaVersion: '1.0',
    evidenceId: 'EV-RESOURCE-GATE',
    workItemId,
    packageId: pkg.packageId,
    workItemType: 'FOUNDATION',
    visualStage: 'V1',
    contractVersions: { responsiveContract: 'unity-responsive/1.0' },
    baselineHash: work.baselineHash,
    recordedAt: '2026-10-23T12:00:00Z',
    verdict: 'PASS',
    gateResults: Object.fromEntries(['F0', 'F1', 'F2', 'F3', 'F4'].map((gate) => [gate, { status: gate === 'F4' ? 'NOT_RUN' : 'PASS' }])),
    unityEvidence: {
      editorStable: 'PASS',
      compile: 'PASS',
      domainReload: 'PASS',
      console: 'PASS',
      scenePrefabImporterGuid: 'PASS',
    },
    ...(declared ? { resourceHandoffInspectionRef: { path: reportPath } } : {}),
  };

  const report = {
    ...resourceFixture.report,
    taskId: workItemId,
    outputPath: reportPath,
    assets: resource ? resourceFixture.report.assets : [],
    animations: frame ? frameFixture.report.animations : [],
  };

  mkdirSync(join(repo, 'Docs'), { recursive: true });
  writeFileSync(join(repo, 'Docs/contract.md'), 'fixture only', 'utf8');
  writeJson(repo, 'work-item.json', work);
  writeJson(repo, 'implementation-package.json', pkg);
  writeJson(repo, 'evidence.json', evidence);
  if (resource) writeJson(repo, registerPath, resourceFixture.register);
  if (frame) writeJson(repo, framePlanPath, frameFixture.plan);
  if (writeReport) writeJson(repo, reportPath, report);

  seedExecutionFixture(repo, work, pkg, true);

  return {
    repo,
    work,
    pkg,
    evidence,
    report,
    reportPath,
    registerPath,
    framePlanPath,
    writeReport(nextReport = report) { writeJson(repo, reportPath, nextReport); },
    writeEvidence(nextEvidence = evidence) { writeJson(repo, 'evidence.json', nextEvidence); },
    writePackage(nextPackage = pkg) { writeJson(repo, 'implementation-package.json', nextPackage); },
    cleanup() { rmSync(repo, { recursive: true, force: true }); },
  };
}

/** 将对象以 UTF-8 JSON 写入夹具仓库，保留控制面读取时使用的普通文件形状。 */
export function writeJson(repo, path, value) {
  const absolute = join(repo, ...path.split('/'));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
