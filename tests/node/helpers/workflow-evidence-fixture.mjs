import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createExecutionState, writeExecutionState, loadExecutionState, completeExecutionUnit } from '../../../unity-game-workflow-control/scripts/runtime/execution-state.mjs';
import { makeArtFixture } from './art-experience-fixture.mjs';

/** 写入明确标记为夹具的证据；不执行游戏命令或伪称真实验收。 */
function save(repo, path, value) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), typeof value === 'string' ? value : JSON.stringify(value));
}

/** 为状态机测试构造三张不同身份的候选与人工记录，不产生视觉结论。 */
export function seedVisualBaseline(repo, work) {
  if (!existsSync(join(repo, 'art-brief.json'))) makeArtFixture(repo, work);
  const conditions = { viewport: '1920x1080', content: '相同内容测试夹具', state: 'default' };
  const qualityResults = Object.fromEntries(['themeFit', 'audienceFit', 'gameplayReadability', 'viewingComfort', 'artCompletion'].map((key) => [key, { status: 'PASS', reason: '仅用于人工记录形状测试' }]));
  const candidates = [1, 2, 3].map((number) => {
    const candidateId = `test-${number}`;
    const imagePath = `baseline/candidate-${number}.png`;
    const generationRecordPath = `baseline/generation-${number}.json`;
    save(repo, imagePath, '非视觉验收使用的图片文件夹具');
    save(repo, generationRecordPath, { workItemId: 'WI-BASELINE', candidateId, imagePath, conditions, prompt: '同条件候选生成记录测试夹具' });
    return { candidateId, source: 'generated', imagePath, generationRecordPath, qualityResults };
  });
  const selection = { candidateId: 'test-1', confirmedBy: 'test-user', confirmedAt: '2026-10-20T00:00:00Z', userMessageRef: 'fixture-message' };
  save(repo, 'baseline/frozen.json', { baselineId: 'BASELINE-1', selectedCandidateId: selection.candidateId });
  save(repo, 'baseline/selection.json', { schemaVersion: '1.0', baselineId: 'BASELINE-1', producerWorkItemId: 'WI-BASELINE', briefPath: 'art-brief.json', conditions, candidates, selection, frozenBaselinePath: 'baseline/frozen.json' });
  work.globalVisualBaselineSelectionRef = { path: 'baseline/selection.json' };
}

/** 为控制面集成测试构造真实可读的单元日志和 Result，按同一顺序门完成状态。 */
export function seedExecutionFixture(repo, work, pkg, complete = false) {
  work.evidenceRoot ??= `.workflow-control/evidence/${work.workItemId}`;
  for (const unit of pkg.executionUnits) unit.acceptanceCommands ??= ['fixture-only-check'];
  writeExecutionState(repo, work, pkg, createExecutionState(work, pkg));
  if (!complete) return;
  for (let index = 0; index < pkg.executionUnits.length; index += 1) {
    const state = loadExecutionState(repo, work, pkg);
    const unit = state.units.find((item) => item.status === 'IN_PROGRESS');
    if (!unit) throw new Error('测试夹具无法找到当前执行单元');
    const commands = unit.acceptanceCommands.map((command, commandIndex) => {
      const outputFile = `${work.evidenceRoot}/units/${index}-${commandIndex}.log`;
      save(repo, outputFile, 'fixture-only output');
      return { command, exitCode: 0, outputFile };
    });
    const resultPath = `${work.evidenceRoot}/units/result-${index}.json`;
    save(repo, resultPath, { schemaVersion: '1.0', resultId: `RESULT-${index}`, workItemId: work.workItemId, packageId: pkg.packageId, planVersion: state.planVersion, unitId: unit.unitId, verdict: 'PASS', commands, files: commands.map((item) => item.outputFile), recordedAt: '2026-10-20T00:00:00Z' });
    completeExecutionUnit(repo, work, pkg, resultPath);
  }
}
