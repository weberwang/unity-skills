/** 工作项锁内的衍生执行状态变更；提供写入失败时可撤销的动作。 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { archiveExecutionState, completeExecutionUnit, createExecutionState, executionStatePath, restoreExecutionMutation, writeExecutionState } from './execution-state.mjs';

/** 在正式写回工作项之前准备执行状态，同时返回精确的恢复操作。 */
export function prepareExecutionMutation(inspection, next, options = {}) {
  const { repo, work, pkg } = inspection;
  const path = resolve(repo, executionStatePath(work));
  // 快照必须由执行状态锁内的实际变更捕获，避免抹掉取锁前其他单元的新结果。
  let previous = null;
  const mutationOptions = { capturePrevious: (state) => { previous = state; } };
  if (next.globalState === 'RETURN' || options.sceneStage) {
    if (!existsSync(path)) return undefined;
    const archivedPath = archiveExecutionState(repo, work, mutationOptions);
    return () => restoreExecutionMutation(repo, work, { previous, archivedPath });
  }
  let after;
  if (options.resultPath) after = completeExecutionUnit(repo, work, pkg, options.resultPath, mutationOptions);
  else if (next.globalState === 'IMPLEMENTING' && work.globalState !== 'IMPLEMENTING') after = writeExecutionState(repo, next, pkg, createExecutionState(next, pkg), mutationOptions);
  else return undefined;
  return () => restoreExecutionMutation(repo, work, { expected: after, previous });
}
