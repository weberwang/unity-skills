/** 三候选全局视觉基线的文件门；机器核对来源与人工决定，不判断画面好坏。 */
import { readArtEvidenceFile, validateArtBrief, validateArtQualityResults, ART_QUALITY_ITEMS } from './art-experience-contract.mjs';
import { isValidIsoTimestamp } from './timestamp-contract.mjs';
import { isDeepStrictEqual } from 'node:util';

/** 校验当前工作项引用的全局选择证据，允许跨工作项复用同一生产者。 */
export function validateVisualBaseline(work, pkg, repo) {
  const errors = [];
  const visible = ['SCENE', 'DISPLAY_LAYER'].includes(work.workItemType);
  const stage = work.scene?.stage ?? work.displayLayer?.stage;
  const required = visible && stage !== 'V0' || pkg?.visualBaselineRequired === true
    || work.stageId === 'global-baseline' && work.domain === 'visual' && ['VALIDATING', 'PASSED', 'COMPLETE'].includes(work.globalState);
  const ref = work.globalVisualBaselineSelectionRef;
  if (!ref) return required ? ['缺少 globalVisualBaselineSelectionRef 三候选人工选择证据'] : errors;
  try {
    if (typeof ref !== 'object' || Object.keys(ref).some((key) => key !== 'path') || typeof ref.path !== 'string') throw new Error('选择引用只接受 path');
    const root = readArtEvidenceFile(repo, ref.path, true);
    const keys = ['schemaVersion', 'baselineId', 'producerWorkItemId', 'briefPath', 'conditions', 'candidates', 'selection', 'frozenBaselinePath'];
    if (Object.keys(root).some((key) => !keys.includes(key)) || keys.some((key) => root[key] === undefined) || root.schemaVersion !== '1.0' || !root.baselineId?.trim() || !root.producerWorkItemId?.trim()) throw new Error('全局选择证据形状不合法');
    const brief = readArtEvidenceFile(repo, root.briefPath, true);
    errors.push(...validateArtBrief(brief));
    if (brief.projectId !== work.projectId) throw new Error('全局视觉基线必须属于当前项目');
    if (!root.conditions || typeof root.conditions !== 'object' || Array.isArray(root.conditions) || !Object.keys(root.conditions).length) throw new Error('缺少三候选共同生产条件');
    if (!Array.isArray(root.candidates) || root.candidates.length !== 3) throw new Error('全局视觉基线必须恰好三张候选');
    const ids = new Set();
    const images = new Set();
    for (const candidate of root.candidates) {
      const allowed = ['candidateId', 'source', 'imagePath', 'generationRecordPath', 'qualityResults'];
      if (!candidate || Object.keys(candidate).some((key) => !allowed.includes(key)) || allowed.some((key) => candidate[key] === undefined) || !candidate.candidateId?.trim() || candidate.source !== 'generated') throw new Error('候选必须绑定独立生成记录');
      if (ids.has(candidate.candidateId) || images.has(candidate.imagePath)) throw new Error('三候选必须具有不同身份和实际图片路径');
      ids.add(candidate.candidateId); images.add(candidate.imagePath);
      readArtEvidenceFile(repo, candidate.imagePath);
      if (!/\.(png|jpe?g|webp)$/i.test(candidate.imagePath)) throw new Error('候选必须引用真实图片文件');
      const generation = readArtEvidenceFile(repo, candidate.generationRecordPath, true);
      if (generation.workItemId !== root.producerWorkItemId || generation.candidateId !== candidate.candidateId || generation.imagePath !== candidate.imagePath || !generation.prompt?.trim() || !isDeepStrictEqual(generation.conditions, root.conditions)) throw new Error('生成记录必须绑定生产者、实际候选、提示词与共同条件');
      const results = candidate.qualityResults;
      if (validateArtQualityResults(results).length) throw new Error('每个候选必须逐项记录五项人工质量结果');
    }
    const selection = root.selection;
    const fields = ['candidateId', 'confirmedBy', 'confirmedAt', 'userMessageRef'];
    if (!selection || Object.keys(selection).some((key) => !fields.includes(key)) || fields.some((key) => typeof selection[key] !== 'string' || !selection[key].trim()) || !isValidIsoTimestamp(selection.confirmedAt)) throw new Error('必须有唯一真实人工选择及有效确认时间');
    const selected = root.candidates.find((candidate) => candidate.candidateId === selection.candidateId);
    if (!selected || ART_QUALITY_ITEMS.some((key) => selected.qualityResults[key].status !== 'PASS')) throw new Error('所选候选五项人工质量必须全部 PASS');
    const frozen = readArtEvidenceFile(repo, root.frozenBaselinePath, true);
    if (frozen.baselineId !== root.baselineId || frozen.selectedCandidateId !== selection.candidateId) throw new Error('冻结正文必须绑定当前基线和所选候选');
  } catch (error) { errors.push(error.message); }
  return errors;
}
