/** Unity 控制面运行时底层 IO；只提供路径合同、原子写入和 Work Item 并发保护。 */

import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

/** 将 Unity 文件或 glob 模式规范化为严格 POSIX 相对路径。 */
export function canonicalizePosixPath(input, label = '路径', fail = (message) => { throw new Error(message); }) {
  if (typeof input !== 'string' || !input.length) fail(`${label} 必须是非空 POSIX 相对路径`);
  if (input.includes('\\') || input.startsWith('/') || /^[A-Za-z]:/.test(input)) fail(`${label} 必须是 POSIX 相对路径：${input}`);
  const segments = input.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) fail(`${label} 含空段或非法 . / .. 段：${input}`);
  return segments.join('/');
}

/** 将对象原子写回 JSON；临时文件与目标同目录，避免中断留下半份状态。 */
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** 在锁内执行 revision/CAS 检查并原子写回，拒绝陈旧快照覆盖当前状态。 */
export function commitWithLock({ workPath, expected, next, readCurrent, validate, fail }) {
  const lockPath = `${workPath}.lock`;
  let acquired = false;
  try {
    writeFileSync(lockPath, `${JSON.stringify({ pid: process.pid, lockedAt: new Date().toISOString() })}\n`, { encoding: 'utf8', flag: 'wx' });
    acquired = true;
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`Work Item 已被其他进程锁定：${lockPath}`, 2, { errorCode: 'WORK_ITEM_LOCKED' });
    throw error;
  }
  try {
    const current = validate(readCurrent(workPath));
    if (current.workItemId !== expected.workItemId || current.baselineHash !== expected.baselineHash || current.revision !== expected.revision) fail('Work Item 版本已变化，拒绝陈旧快照覆盖当前状态', 2, { errorCode: 'STALE_WORK_ITEM' });
    if (next.revision !== current.revision + 1) fail('Work Item mutation revision 必须严格递增 1', 2, { errorCode: 'INVALID_WORK_ITEM_REVISION' });
    writeJsonAtomic(workPath, next);
    return next;
  } finally {
    if (acquired) rmSync(lockPath, { force: true });
  }
}
