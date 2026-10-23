import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  check,
  inspect,
  run,
  transitionWorkItem,
} from '../../unity-game-workflow-control/scripts/workflow-control.mjs';
import { validateResourceHandoffPackage } from '../../unity-game-workflow-control/scripts/runtime/resource-handoff-evidence.mjs';
import { makeResourceHandoffWorkspace, writeJson } from './helpers/resource-handoff-gate-fixture.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const INSTALLER_PATH = resolve(ROOT, 'scripts/install-project-skills.mjs');

/** 以真实控制面入口读取临时 Work Item、实施包和当前 Evidence Manifest。 */
function inspectWorkspace(fixture) {
  return inspect({ repo: fixture.repo, 'work-item': 'work-item.json' });
}

/** 证明未声明交接的工作项仍可按既有 F3 流程完成，不会被资源门禁扩大范围。 */
test('未声明资源交接时保留原工作流范围', () => {
  const fixture = makeResourceHandoffWorkspace({ declared: false });
  try {
    const inspection = inspectWorkspace(fixture);
    assert.deepEqual(inspection.blockers.filter((item) => item.code === 'RESOURCE_HANDOFF_INVALID'), []);
    assert.equal(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).status, 'READY');
    const result = run({ repo: fixture.repo, 'work-item': 'work-item.json' });
    assert.equal(result.status, 'COMPLETE');
    assert.deepEqual(result.changed, ['VALIDATING → PASSED', 'PASSED → COMPLETE']);
  } finally {
    fixture.cleanup();
  }
});

/** 验证显式空交接、缺失材料及材料路径中的目录符号链接都会在实施包校验期阻断。 */
test('实施包拒绝空交接、缺失材料和符号链接材料', (t) => {
  const fixture = makeResourceHandoffWorkspace({ resource: true, frame: false });
  let outside;
  try {
    const empty = structuredClone(fixture.pkg);
    empty.resourceHandoff = {};
    assert.match(validateResourceHandoffPackage(empty, fixture.repo).join('\n'), /必须至少绑定/);

    const missing = structuredClone(fixture.pkg);
    missing.resourceHandoff.assetRegisterRef.path = 'Contracts/missing-register.json';
    assert.match(validateResourceHandoffPackage(missing, fixture.repo).join('\n'), /不存在|ENOENT/);

    outside = mkdtempSync(join(tmpdir(), 'unity-resource-handoff-outside-'));
    writeFileSync(join(outside, 'asset-register.json'), '{}', 'utf8');
    const alias = join(fixture.repo, 'Contracts', 'linked-register');
    try {
      symlinkSync(outside, alias, 'junction');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) return t.skip(`当前文件系统不允许创建 junction：${error.code}`);
      throw error;
    }
    const linked = structuredClone(fixture.pkg);
    linked.resourceHandoff.assetRegisterRef.path = 'Contracts/linked-register/asset-register.json';
    assert.match(validateResourceHandoffPackage(linked, fixture.repo).join('\n'), /符号链接/);
  } finally {
    fixture.cleanup();
    if (outside) rmSync(outside, { recursive: true, force: true });
  }
});

/** 验证交付状态必须读取当前报告，并检查 task、输出路径和 evidenceRoot 身份绑定。 */
test('交付报告缺失或 task、output、evidenceRoot 漂移时阻断', () => {
  const fixture = makeResourceHandoffWorkspace({ writeReport: false });
  try {
    const missing = inspectWorkspace(fixture);
    assert.match(missing.blockers.map((item) => item.message).join('\n'), /ENOENT/);

    const validReport = structuredClone(fixture.report);
    fixture.writeReport({ ...validReport, taskId: 'WI-OTHER' });
    assert.match(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).blocking.join('\n'), /taskId/);

    fixture.writeReport({ ...validReport, outputPath: 'Artifacts/TestResults/other-report.json' });
    assert.match(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).blocking.join('\n'), /outputPath/);

    const outsidePath = 'Artifacts/TestResults/OTHER/resource-handoff.json';
    writeJson(fixture.repo, outsidePath, { ...validReport, outputPath: outsidePath });
    fixture.writeEvidence({
      ...fixture.evidence,
      resourceHandoffInspectionRef: { path: outsidePath },
    });
    assert.match(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).blocking.join('\n'), /evidenceRoot/);
  } finally {
    fixture.cleanup();
  }
});

/** 删除后重读报告并阻止伪造空 blockers 的直接迁移，修复文件后重新允许同一迁移。 */
test('报告删除会在 check 与直接 transition 重读，修复后解除阻断', () => {
  const fixture = makeResourceHandoffWorkspace();
  try {
    assert.equal(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).status, 'READY');

    rmSync(join(fixture.repo, ...fixture.reportPath.split('/')));
    const staleInspection = inspectWorkspace(fixture);
    assert.match(staleInspection.blockers.map((item) => item.message).join('\n'), /ENOENT/);
    assert.throws(
      () => transitionWorkItem({ ...staleInspection, blockers: [] }, 'PASSED'),
      /资源交付门禁失败|resourceHandoffInspectionRef/,
    );

    fixture.writeReport();
    assert.equal(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).status, 'READY');
    const repairedInspection = inspectWorkspace(fixture);
    const next = transitionWorkItem(repairedInspection, 'PASSED');
    assert.equal(next.globalState, 'PASSED');
  } finally {
    fixture.cleanup();
  }
});

/** 让真实 Resource 与 Frame 报告同时通过控制面 check 和自动安全 run。 */
test('有效资源与序列帧读回可经 check 和 run 完成交付', () => {
  const fixture = makeResourceHandoffWorkspace({ resource: true, frame: true });
  try {
    const inspection = inspectWorkspace(fixture);
    assert.deepEqual(inspection.blockers, []);
    assert.equal(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).status, 'READY');

    const result = run({ repo: fixture.repo, 'work-item': 'work-item.json' });
    assert.equal(result.status, 'COMPLETE');
    assert.deepEqual(result.changed, ['VALIDATING → PASSED', 'PASSED → COMPLETE']);
  } finally {
    fixture.cleanup();
  }
});

/** 确保资源或帧计划引用本身不能指向项目根目录之外的证据文件。 */
test('包材料和证据报告引用均受项目根与当前 evidenceRoot 限制', () => {
  const fixture = makeResourceHandoffWorkspace({ resource: true, frame: false });
  try {
    const outsideReference = structuredClone(fixture.pkg);
    outsideReference.resourceHandoff.assetRegisterRef.path = '../asset-register.json';
    assert.match(validateResourceHandoffPackage(outsideReference, fixture.repo).join('\n'), /非法/);

    fixture.writeEvidence({
      ...fixture.evidence,
      resourceHandoffInspectionRef: { path: 'Artifacts/TestResults/OTHER/report.json' },
    });
    assert.match(check({ repo: fixture.repo, 'work-item': 'work-item.json' }).blocking.join('\n'), /evidenceRoot/);
  } finally {
    fixture.cleanup();
  }
});

/** 安装到仓库外无 node_modules 的临时工程，通过真实文件 CLI 核验资源和动画报告。 */
test('安装后的独立CLI通过资源与帧报告并拒绝输出漂移和项目外source', () => {
  const fixture = makeResourceHandoffWorkspace({ resource: true, frame: true });
  try {
    mkdirSync(join(fixture.repo, 'Assets'), { recursive: true });
    const installation = spawnSync(process.execPath, [INSTALLER_PATH, fixture.repo], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(installation.status, 0, installation.stderr || installation.stdout);
    assert.equal(existsSync(join(fixture.repo, 'node_modules')), false);

    const workflowFiles = resolve(fixture.repo, '.agents/skills/unity-development-workflow/scripts/workflow-files.mjs');
    const commands = [
      ['resource-loading-check', '--register', fixture.registerPath],
      ['frame-animation-check', '--plan', fixture.framePlanPath],
    ];
    const execute = (command, materialOption, materialPath, source = fixture.reportPath) => spawnSync(process.execPath, [
      workflowFiles,
      command,
      '--project-root', fixture.repo,
      materialOption, materialPath,
      '--source', source,
    ], { cwd: fixture.repo, encoding: 'utf8' });

    for (const [command, materialOption, materialPath] of commands) {
      const result = execute(command, materialOption, materialPath);
      assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    fixture.writeReport({ ...fixture.report, outputPath: 'Artifacts/TestResults/stale-report.json' });
    for (const [command, materialOption, materialPath] of commands) {
      const drift = execute(command, materialOption, materialPath);
      assert.equal(drift.status, 1, drift.stderr || drift.stdout);
      assert.match(drift.stderr, /outputPath/);
    }

    fixture.writeReport();
    for (const [command, materialOption, materialPath] of commands) {
      const outside = execute(command, materialOption, materialPath, '../outside-resource-report.json');
      assert.equal(outside.status, 1, outside.stderr || outside.stdout);
      assert.match(outside.stderr, /项目根目录内/);
    }
  } finally {
    fixture.cleanup();
  }
});
