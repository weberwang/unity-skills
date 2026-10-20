import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { seedExecutionFixture } from './workflow-evidence-fixture.mjs';

const FIXTURE_TIME = new Date('2026-10-19T00:00:00.000Z');
const UPDATED_AT = '2026-10-19T01:00:00.000Z';
const GENERATED_AT = '2026-10-19T02:00:00.000Z';
const COMPLETED_AT = '2026-10-19T03:00:00.000Z';
const REVIEWED_AT = '2026-10-19T04:00:00.000Z';
const ASSET_ENVIRONMENT = 'Unity Editor 6000.5.6f1; com.unity.2d.animation 15.1.0';

/** 写入非空项目文件，并把修改时间固定在证据生成时间之前。 */
export function writeFixtureFile(repo, relativePath, contents, modifiedAt = FIXTURE_TIME) {
  const absolutePath = join(repo, ...relativePath.split('/'));
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, 'utf8');
  utimesSync(absolutePath, modifiedAt, modifiedAt);
  return absolutePath;
}

/** 写入真实 JSON 工件，测试门禁读取磁盘内容而非内存替身。 */
export function writeFixtureJson(repo, relativePath, value, modifiedAt = FIXTURE_TIME) {
  return writeFixtureFile(repo, relativePath, `${JSON.stringify(value, null, 2)}\n`, modifiedAt);
}

/** 构造一个绑定正式角色资产、工程检查报告和 Editor 回归信封的完整夹具。 */
export function makeRiggingDeliveryFixture(repo, { characterCount = 1, workState = 'VALIDATING' } = {}) {
  const owners = {
    technicalArt: 'ta-owner',
    rigging: 'rigging-owner',
    visualAssets: 'visual-owner',
    gameplay: 'gameplay-owner',
    qa: 'independent-qa',
  };
  const characters = [];
  const evidenceCharacters = [];

  for (let index = 0; index < characterCount; index += 1) {
    const ordinal = String(index + 1).padStart(2, '0');
    const characterId = `hero-${ordinal}`;
    const prefabPath = `Assets/Characters/${characterId}/Hero.prefab`;
    const prefabGuid = (index + 1).toString(16).padStart(32, '0');
    const spritePath = `Assets/Characters/${characterId}/Textures/body.png`;
    const clipPath = `Assets/Characters/${characterId}/Animations/idle.anim`;
    const spriteGuid = (index + 100).toString(16).padStart(32, '0');
    const clipGuid = (index + 200).toString(16).padStart(32, '0');
    const updatedAt = UPDATED_AT;
    const sourceRevision = `candidate-${ordinal}`;
    const assetReportPath = `Artifacts/Rigging/${characterId}-engineering.json`;
    const rawReportPath = `Artifacts/TestResults/${characterId}-test-status.json`;
    const requiredRuntimeCases = ['runtime-instantiation', 'animation-playback'];

    characters.push({ characterId, prefabPath, prefabGuid, sourceRevision, updatedAt, requiredRuntimeCases });
    writeFixtureFile(repo, prefabPath, `%YAML 1.1\n--- !u!1 &${index + 1}\nGameObject:\n  m_Name: ${characterId}\n`);
    writeFixtureFile(repo, `${prefabPath}.meta`, `fileFormatVersion: 2\nguid: ${prefabGuid}\nPrefabImporter:\n  externalObjects: {}\n`);
    writeFixtureFile(repo, spritePath, `PNG fixture data for ${characterId}`);
    writeFixtureFile(repo, `${spritePath}.meta`, `fileFormatVersion: 2\nguid: ${spriteGuid}\nTextureImporter:\n  externalObjects: {}\n`);
    writeFixtureFile(repo, clipPath, `AnimationClip fixture data for ${characterId}`);
    writeFixtureFile(repo, `${clipPath}.meta`, `fileFormatVersion: 2\nguid: ${clipGuid}\nNativeFormatImporter:\n  externalObjects: {}\n`);

    const assetReport = {
      schemaVersion: '1.0',
      taskId: 'WI-RIGGING',
      projectId: 'unity-game',
      sourceRevision,
      buildVersion: '1.0.0',
      generatedAtUtc: GENERATED_AT,
      status: 'PASS',
      checks: [
        'prefab-load',
        'sprite-skin-presence',
        'animator-presence',
        'animator-controller',
        'asset-source-evidence',
        'engineering-only-scope',
      ].map((id) => ({ id, status: 'PASS', environment: ASSET_ENVIRONMENT })),
      evidence: [
        { type: 'rigging-prefab', path: prefabPath, subjectId: prefabGuid, subjectVersion: sourceRevision, sourceRevision },
        { type: 'rigging-dependency', path: spritePath, subjectId: spriteGuid, subjectVersion: sourceRevision, sourceRevision },
        { type: 'rigging-dependency', path: clipPath, subjectId: clipGuid, subjectVersion: sourceRevision, sourceRevision },
      ],
    };
    writeFixtureJson(repo, assetReportPath, assetReport);

    const testName = `Game.Tests.${characterId}.CharacterRuntimeTests.CharacterAnimatorRuntime_TransitionsEventsPauseVariantsIsolationAndPoolReuse`;
    const innerResult = {
      status: 'completed',
      duration: 1.25,
      summary: { total: 1, passed: 1, failed: 0, skipped: 0, inconclusive: 0 },
      results: [{ FullName: testName, Status: 'Passed', Duration: 1.25, Message: null, StackTrace: null }],
    };
    const pipelineEnvelope = {
      success: true,
      command: 'command test_status',
      data: { command: 'test_status', parameters: {}, result: JSON.stringify(innerResult) },
      errors: [],
      warnings: [],
    };
    writeFixtureJson(repo, rawReportPath, pipelineEnvelope);

    evidenceCharacters.push({
      characterId,
      prefabPath,
      prefabGuid,
      sourceRevision,
      assetReportPath,
      reviewedBy: owners.qa,
      reviewedAt: REVIEWED_AT,
      regression: {
        scope: 'project-character',
        executedIn: 'EditorPlayMode',
        status: 'PASS',
        editorVersion: '6000.5.6f1',
        animationPackageVersion: '15.1.0',
        completedAt: COMPLETED_AT,
        rawReportPath,
        cases: requiredRuntimeCases.map((id) => ({ id, testName, status: 'PASS' })),
      },
    });
  }

  const work = {
    schemaVersion: '1.0',
    workItemId: 'WI-RIGGING',
    projectId: 'unity-game',
    workItemType: 'FOUNDATION',
    moduleIds: ['rigging'],
    domain: '2d-rigging',
    stageId: 'foundation-engineering',
    globalState: workState,
    baselineHash: `sha256:${'a'.repeat(64)}`,
    revision: 0,
    objective: '完成角色骨骼资产并通过交付门禁',
    allowedActions: ['unity-asset-change'],
    actionLevel: 'A3',
    actionType: 'unity-asset-change',
    allowedPaths: ['Assets/**', 'Artifacts/**'],
    forbiddenPaths: ['Library/**'],
    gateStatus: { F0: 'PASS', F1: 'PASS', F2: 'PASS', F3: 'PASS', F4: 'NOT_RUN' },
    implementationPackagePath: 'implementation-package.json',
    riggingDelivery: { owners, characters },
  };
  const packagePrefab = characters[0].prefabPath;
  const packagePrefabMeta = `${packagePrefab}.meta`;
  const packageRecord = {
    schemaVersion: '1.0',
    packageId: 'PKG-RIGGING',
    workItemId: work.workItemId,
    workItemType: work.workItemType,
    baselineHash: work.baselineHash,
    packageStatus: 'COMPLETE',
    fileOwnership: {
      [packagePrefab]: owners.rigging,
      [packagePrefabMeta]: owners.rigging,
    },
    unityOwnership: {
      metaPairs: [{ asset: packagePrefab, meta: packagePrefabMeta }],
      guidImporter: [packagePrefab],
      serializedAssets: [packagePrefab],
    },
    executionUnits: [{
      unitId: 'RIGGING-ASSET',
      unitType: 'MODULE',
      moduleId: 'rigging',
      owner: owners.rigging,
      files: [packagePrefab, packagePrefabMeta],
      acceptanceCommands: ['fixture-only-check'],
      status: 'COMPLETE',
    }],
  };
  // 追加通用执行状态与 Result 闭环，保留原有骨骼交付报告和断言数据。
  seedExecutionFixture(repo, work, packageRecord, true);
  writeFixtureJson(repo, 'implementation-package.json', packageRecord);
  const evidence = {
    schemaVersion: '1.0',
    evidenceId: 'EV-RIGGING',
    workItemId: work.workItemId,
    packageId: 'PKG-RIGGING',
    workItemType: work.workItemType,
    visualStage: 'V0',
    contractVersions: { responsiveContract: 'not-applicable' },
    baselineHash: work.baselineHash,
    recordedAt: REVIEWED_AT,
    verdict: 'PASS',
    gateResults: {
      F0: { status: 'PASS' }, F1: { status: 'PASS' }, F2: { status: 'PASS' },
      F3: { status: 'PASS' }, F4: { status: 'NOT_RUN' },
    },
    unityEvidence: {
      editorStable: 'PASS', compile: 'PASS', domainReload: 'PASS', console: 'PASS',
      editMode: 'PASS', playMode: 'PASS', scenePrefabImporterGuid: 'PASS', build: 'NOT_RUN',
      device: 'NOT_RUN', release: 'NOT_RUN',
    },
    riggingDelivery: { characters: evidenceCharacters },
  };

  const workPath = 'work-item.json';
  const evidencePath = 'evidence.json';
  writeFixtureJson(repo, workPath, work);
  writeFixtureJson(repo, evidencePath, evidence);
  return { repo, work, evidence, workPath, evidencePath, packagePath: 'implementation-package.json', owners, characters, evidenceCharacters };
}
