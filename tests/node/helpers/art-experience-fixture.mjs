import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 创建明确标为测试数据的美术验收材料，不执行或宣称 Unity 视觉检查。 */
export function makeArtFixture(repo, work) {
  const brief = {
    schemaVersion: '1.0', projectId: work.projectId, theme: '测试主题',
    audience: { facts: ['测试使用情境'], assumptions: [] }, coreLoop: '测试操作与结果确认',
    experienceGoals: ['清晰'], viewingContext: '测试参考视口', visualHierarchy: ['交互对象优先'],
    intensityBudget: {
      normal: {
        brightnessContrast: '保持稳定层级，不主动闪烁', screenCoverage: '限制在相关玩法区域',
        duration: '随常态状态持续并在状态结束时收束', triggerFrequency: '状态变化触发，不因重复帧重放',
        maxConcurrent: 1, recovery: '状态结束后恢复常态显示', blendPolicy: '同类反馈合并为一个持续状态',
      },
      operation: {
        brightnessContrast: '短促变化并保留主体辨识', screenCoverage: '限于操作对象及必要反馈区域',
        duration: '短促并有明确结束点', triggerFrequency: '按有效操作触发并去重',
        maxConcurrent: 2, recovery: '操作结束后平滑回到常态', blendPolicy: '重复操作合并，优先显示最新结果',
      },
      peak: {
        brightnessContrast: '峰值反馈受限且不遮蔽关键玩法信息', screenCoverage: '限制峰值反馈的总占屏区域',
        duration: '峰值结束后及时衰减', triggerFrequency: '按真实事件触发并受并发策略约束',
        maxConcurrent: 3, recovery: '峰值结束后回到已确认的常态基线', blendPolicy: '按优先级合并或抑制低优先级反馈',
      },
      measurementMethod: '在目标视口记录触发次数、持续时间、同时活动数和覆盖范围，并由人工复核亮度变化。',
    },
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
