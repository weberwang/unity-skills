import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 创建明确标为测试数据的美术验收材料，不执行或宣称 Unity 视觉检查。 */
export function makeArtFixture(repo, work) {
  const brief = {
    schemaVersion: '1.0', projectId: work.projectId, theme: '测试主题',
    audience: { facts: ['测试使用情境'], assumptions: [] }, coreLoop: '测试操作与结果确认',
    experienceGoals: ['清晰'], viewingContext: '测试参考视口', visualHierarchy: ['交互对象优先'],
    intensityBudget: { normal: '稳定层级', operation: '短促、去重', peak: '有限并发并收尾' },
  };
  const acceptance = {
    schemaVersion: '1.0', workItemId: work.workItemId, candidateId: 'candidate-test', candidateVersion: '1',
    sceneId: work.scene?.sceneId ?? work.displayLayer?.hostSceneId,
    ...(work.displayLayer ? { displayLayerId: work.displayLayer.displayLayerId } : {}),
    artBriefRef: 'art-brief.json',
    qualityResults: Object.fromEntries(['themeFit', 'audienceFit', 'gameplayReadability', 'viewingComfort', 'artCompletion'].map((key) => [key, { status: 'PASS', reason: '人工记录测试 fixture' }])),
    scenarios: [
      { id: 'normal-play', required: true, reason: '实际常态情境', status: 'PASS', recordingPath: 'test-recording.mp4', durationSeconds: 5, startSeconds: 0, endSeconds: 5, eventCount: 0, peakConcurrency: 0, viewport: { width: 1920, height: 1080 }, observations: '人工观察测试 fixture' },
      ...['repeated-feedback', 'event-peak', 'overlap-peak'].map((id) => ({ id, required: false, reason: '测试静态场景无该事件', status: 'NOT_APPLICABLE' })),
    ],
    confirmedBy: 'test-user', confirmedAt: '2026-10-13T10:00:00+08:00', userMessageRef: 'test-message', userText: '测试确认记录',
  };
  if (repo) {
    writeFileSync(join(repo, 'art-brief.json'), JSON.stringify(brief));
    writeFileSync(join(repo, 'art-acceptance.json'), JSON.stringify(acceptance));
    // 只验证路径和非空文件；该字节不是实际视频，也不用于视觉验收。
    writeFileSync(join(repo, 'test-recording.mp4'), 'fixture-recording');
  }
  return { brief, acceptance, evidenceFields: { candidateId: acceptance.candidateId, candidateVersion: acceptance.candidateVersion, artExperienceAcceptanceRef: 'art-acceptance.json' } };
}
