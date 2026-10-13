import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { validateArtExperienceAcceptance, validateArtBrief } from '../../unity-game-workflow-control/scripts/runtime/art-experience-contract.mjs';
import { makeArtFixture } from './helpers/art-experience-fixture.mjs';

/** 为行为验证创建隔离的证据目录，自动清理测试产物。 */
function fixture(callback) {
  const repo = mkdtempSync(join(tmpdir(), 'unity-art-'));
  const work = { projectId: 'test-project', workItemId: 'WI-ART', workItemType: 'SCENE', scene: { sceneId: 'scene-test', stage: 'V4' } };
  const art = makeArtFixture(repo, work);
  const evidence = { visualStage: 'V4', verdict: 'PASS', ...art.evidenceFields };
  try { callback({ repo, work, evidence, ...art }); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** 保存当前测试人工记录。 */
function save(repo, acceptance) { writeFileSync(join(repo, 'art-acceptance.json'), JSON.stringify(acceptance)); }

test('V4 人工质量与录屏记录有效时通过结构验证，非可见工作项不扩围', () => fixture(({ repo, work, evidence }) => {
  assert.deepEqual(validateArtExperienceAcceptance(evidence, work, repo), []);
  assert.deepEqual(validateArtExperienceAcceptance({}, { workItemType: 'FOUNDATION' }, repo), []);
}));

test('缺失、失败与未验证的人工结果不能由机器 PASS 覆盖', () => fixture(({ repo, work, evidence, acceptance }) => {
  delete evidence.artExperienceAcceptanceRef;
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /缺少可读取/);
  evidence.artExperienceAcceptanceRef = 'art-acceptance.json';
  for (const status of ['FAIL', 'NOT_RUN', undefined]) {
    acceptance.qualityResults.viewingComfort.status = status;
    save(repo, acceptance);
    assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /未通过/);
  }
}));

test('当前候选、场景与独立显示层身份必须一致', () => fixture(({ repo, work, evidence, acceptance }) => {
  evidence.candidateVersion = '2';
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /candidateVersion/);
  evidence.candidateVersion = '1';
  acceptance.sceneId = 'other'; save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /当前场景/);
  acceptance.sceneId = work.scene.sceneId;
  work.workItemType = 'DISPLAY_LAYER'; work.displayLayer = { hostSceneId: acceptance.sceneId, displayLayerId: 'popup-test' }; delete work.scene;
  acceptance.displayLayerId = 'popup-test'; save(repo, acceptance);
  assert.deepEqual(validateArtExperienceAcceptance(evidence, work, repo), []);
}));

test('动态情境必须完整、不重复，静态截图和无效时间范围不能充当录屏', () => fixture(({ repo, work, evidence, acceptance }) => {
  acceptance.scenarios[0].recordingPath = 'test.png'; save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /真实项目内录屏/);
  acceptance.scenarios[0].recordingPath = 'test-recording.mp4';
  acceptance.scenarios[0].endSeconds = 6; save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /时长无效/);
  acceptance.scenarios[0].endSeconds = 5;
  acceptance.scenarios.pop(); save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /逐一登记/);
}));

test('不适用情境有理由且不伪造实测；路径越界和空文件均被拒绝', () => fixture(({ repo, work, evidence, acceptance }) => {
  acceptance.scenarios[1].eventCount = 0; save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /不得伪造/);
  delete acceptance.scenarios[1].eventCount;
  acceptance.scenarios[0].recordingPath = '../test.mp4'; save(repo, acceptance);
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /真实项目内录屏/);
  acceptance.scenarios[0].recordingPath = 'test-recording.mp4'; save(repo, acceptance);
  writeFileSync(join(repo, 'test-recording.mp4'), '');
  assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /真实项目内录屏/);
}));

test('brief 区分受众事实和假设，并要求三层强度预算', () => fixture(({ brief }) => {
  assert.deepEqual(validateArtBrief(brief), []);
  delete brief.intensityBudget.operation;
  assert.match(validateArtBrief(brief).join(), /operation/);
}));

test('人工确认不能使用不存在的日历日期或无时区时间', () => fixture(({ repo, work, evidence, acceptance }) => {
  for (const confirmedAt of ['2026-02-30T10:00:00Z', '2026-10-13T10:00:00']) {
    acceptance.confirmedAt = confirmedAt; save(repo, acceptance);
    assert.match(validateArtExperienceAcceptance(evidence, work, repo).join(), /有效带时区时间/);
  }
}));

test('独立美术 schema 与单候选 Visual Bible 具有实际结构校验', () => fixture(({ brief, acceptance }) => {
  const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv);
  const dir = resolve('unity-development-workflow/schemas');
  for (const name of readdirSync(dir).filter((name) => name.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(readFileSync(join(dir, name))));
  assert.equal(ajv.getSchema('https://codex.local/unity-workflow/schemas/game-art-brief.schema.json')(brief), true);
  const validate = ajv.getSchema('https://codex.local/unity-workflow/schemas/art-experience-acceptance.schema.json');
  assert.equal(validate(acceptance), true, JSON.stringify(validate.errors));
  acceptance.scenarios[0].required = false;
  assert.equal(validate(acceptance), false);
  const bible = YAML.parse(readFileSync('unity-development-workflow/templates/visual-bible.yaml', 'utf8'));
  bible.directionCandidates = bible.directionCandidates.slice(0, 1);
  const validateBible = ajv.getSchema('https://codex.local/unity-workflow/schemas/visual-bible.schema.json');
  assert.equal(validateBible(bible), true, JSON.stringify(validateBible.errors));
  delete bible.directionCandidates[0].qualityResults.viewingComfort;
  assert.equal(validateBible(bible), false);
}));
