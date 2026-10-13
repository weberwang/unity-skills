import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { validateNineSliceDecision, validateNineSliceProduction } from '../../unity-development-workflow/scripts/nine-slice-contract.mjs';
import { main } from '../../unity-development-workflow/scripts/workflow-files.mjs';

/** 创建跨 V2/V3/组合的同一资源测试合同。 */
function fixture() {
  const nineSlice = { mode: 'stretch', reason: '固定角边、可伸展中心', sourceSize: { width: 96, height: 64 }, border: [12, 10, 12, 10] };
  const importer = { textureType: 'Sprite', spriteMode: 'Single', border: [...nineSlice.border] };
  return {
    item: { id: 'panel', resourceId: 'panel-skin', nineSlice },
    task: { id: 'image-panel', resourceId: 'panel-skin', sourceVersion: '1', unityImport: structuredClone(importer), nineSlice: structuredClone(nineSlice) },
    registration: { taskId: 'image-panel', resourceId: 'panel-skin', sourceVersion: '1', assetGuid: 'test-guid', assetPath: 'Assets/UI/panel.png', unityValidation: 'PASS', importer: structuredClone(importer) },
    binding: { itemId: 'panel', resourceId: 'panel-skin', assetGuid: 'test-guid', assetPath: 'Assets/UI/panel.png', consumerNodeIds: ['panel-node'], nineSlice: structuredClone(nineSlice) },
    placements: [{ nodeId: 'panel-node', measured: true, presentation: 'UGUI_SLICED', border: [...nineSlice.border], coordinateSpace: 'UNITY_LOGICAL_UNITS', borderPixelsToUnits: 1, size: { width: 300, height: 180 } }],
  };
}

test('源尺寸、边框和显示框分离，同一资源可用于更大矩形', () => {
  assert.deepEqual(validateNineSliceProduction(fixture()), []);
  assert.match(validateNineSliceDecision(fixture().item.nineSlice, { width: 24, height: 80 }).join(), /显示框没有正尺寸中心/);
});

test('实际 Importer、资源身份和组合不能各自修改九宫格', () => {
  const data = fixture(); data.registration.importer.border[0] = 0;
  assert.match(validateNineSliceProduction(data).join(), /导入登记 Sprite Border/);
  data.registration.importer.border[0] = 12; data.binding.nineSlice.sourceSize.width = 100;
  assert.match(validateNineSliceProduction(data).join(), /组合切片事实/);
  data.binding.nineSlice.sourceSize.width = 96; data.registration.resourceId = 'other';
  assert.match(validateNineSliceProduction(data).join(), /身份不一致/);
  data.registration.resourceId = 'panel-skin'; data.item.resourceId = 'other-v2-resource';
  assert.match(validateNineSliceProduction(data).join(), /身份不一致/);
});

test('普通整图拉伸、覆盖缺失和未实测消费者不能代替切片呈现', () => {
  const data = fixture(); data.placements[0].presentation = 'UGUI_SIMPLE';
  assert.match(validateNineSliceProduction(data).join(), /实际切片呈现/);
  data.placements[0].presentation = 'UGUI_SLICED'; data.binding.consumerNodeIds.push('other');
  assert.match(validateNineSliceProduction(data).join(), /覆盖不完整/);
});

test('非法边宽和无理由的适用性声明被拒绝', () => {
  const decision = fixture().item.nineSlice;
  decision.border = [48, 10, 48, 10];
  assert.match(validateNineSliceDecision(decision).join(), /源图没有正尺寸中心/);
  assert.deepEqual(validateNineSliceDecision({ mode: 'not-applicable', reason: '完整插画' }), []);
  assert.notDeepEqual(validateNineSliceDecision({ mode: 'not-applicable', reason: '完整插画', border: [0, 0, 0, 0] }), []);
});

test('消费者显示尺寸和 PPU 转换必须实测，不能缺省或混用源像素', () => {
  const data = fixture(); delete data.placements[0].size;
  assert.match(validateNineSliceProduction(data).join(), /正尺寸显示框/);
  data.placements[0].size = { width: 12, height: 12 };
  data.placements[0].borderPixelsToUnits = 0.1;
  assert.deepEqual(validateNineSliceProduction(data), []);
  delete data.placements[0].borderPixelsToUnits;
  assert.match(validateNineSliceProduction(data).join(), /转换比例/);
  assert.notDeepEqual(validateNineSliceProduction(null), []);
});

test('不适用九宫格不限制合法 Texture 或 Multiple Sprite 路线，空身份仍拒绝', () => {
  for (const textureType of ['Default', 'Sprite']) {
    const data = fixture();
    data.item.nineSlice = data.task.nineSlice = data.binding.nineSlice = { mode: 'not-applicable', reason: '完整图案' };
    data.task.unityImport = data.registration.importer = { textureType, spriteMode: textureType === 'Sprite' ? 'Multiple' : 'None', border: [0, 0, 0, 0] };
    assert.deepEqual(validateNineSliceProduction(data), []);
    data.task.unityImport.border = [1, 0, 0, 0];
    assert.match(validateNineSliceProduction(data).join(), /非零边框/);
    data.task.id = data.registration.taskId = undefined;
    assert.match(validateNineSliceProduction(data).join(), /非空资源身份/);
  }
});

test('跨合同检查消费符合正式 image-task schema 的任务，不使用不存在字段', () => {
  const data = fixture();
  const task = YAML.parse(readFileSync('unity-development-workflow/templates/image-task.yaml', 'utf8'));
  task.id = data.task.id; task.resourceId = data.task.resourceId; task.sourceVersion = data.task.sourceVersion;
  task.nineSlice = data.task.nineSlice; task.unityImport.border = data.task.unityImport.border;
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  const dir = resolve('unity-development-workflow/schemas');
  for (const name of readdirSync(dir).filter((name) => name.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(readFileSync(join(dir, name))));
  const validate = ajv.getSchema('https://codex.local/unity-workflow/schemas/image-task.schema.json');
  assert.equal(validate(task), true, JSON.stringify(validate.errors));
  data.task = task;
  assert.deepEqual(validateNineSliceProduction(data), []);
});

test('文件工具入口读取目标项目相对材料，拒绝不一致结果和路径穿越', () => {
  const project = mkdtempSync(join(tmpdir(), 'unity-nine-slice-cli-'));
  try {
    const data = fixture();
    writeFileSync(join(project, 'bundle.json'), JSON.stringify(data));
    assert.equal(typeof main(['nine-slice-check', '--project-root', project, '--source', 'bundle.json']), 'string');
    data.registration.importer.border[0] = 0;
    writeFileSync(join(project, 'bundle.json'), JSON.stringify(data));
    assert.throws(() => main(['nine-slice-check', '--project-root', project, '--source', 'bundle.json']), /Border/);
    assert.throws(() => main(['nine-slice-check', '--project-root', project, '--source', '../outside.json']), /项目根目录内/);
  } finally { rmSync(project, { recursive: true, force: true }); }
});
