import { lstatSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { canonicalizePosixPath } from './io.mjs';

/** 读取项目内的真实普通JSON文件，拒绝逃逸与路径任意段上的符号链接。 */
export function readProjectJson(repo, reference, label, evidenceRoot) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)
    || Object.keys(reference).some((key) => key !== 'path')) throw new Error(`${label} 必须只声明 path`);
  const path = canonicalizePosixPath(reference.path, label);
  if (path.includes(':')) throw new Error(`${label} 不得包含驱动器或替代数据流分隔符`);
  if (evidenceRoot) {
    const rootPath = canonicalizePosixPath(evidenceRoot, 'evidenceRoot');
    if (!path.startsWith(`${rootPath}/`)) throw new Error(`${label} 必须位于当前 evidenceRoot 内`);
  }
  const root = resolve(repo);
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  if (!local || isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) throw new Error(`${label} 必须位于当前项目内`);
  let cursor = root;
  if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} 的项目根不能是符号链接`);
  for (const part of local.split(sep)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} 不能经过符号链接`);
  }
  if (!lstatSync(absolute).isFile()) throw new Error(`${label} 必须指向JSON文件`);
  const value = JSON.parse(readFileSync(absolute, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 根必须是对象`);
  return { value, path };
}

/** 直接迁移时重读磁盘实施包，避免调用方提交过期或伪造的inspect快照。 */
export function readCurrentImplementationPackage(inspection) {
  const packagePath = inspection.packagePath ?? inspection.work.implementationPackagePath ?? inspection.work.implementationPackage;
  if (!packagePath) return inspection.pkg;
  const local = relative(resolve(inspection.repo), resolve(inspection.repo, packagePath)).split(sep).join('/');
  return readProjectJson(inspection.repo, { path: local }, 'Implementation Package').value;
}

/** 直接迁移重新读取当前证据清单，避免沿用 inspect 时的旧候选和旧测量引用。 */
export function readCurrentEvidenceManifest(inspection) {
  const evidencePath = inspection.evidencePath ?? inspection.work.evidenceManifestPath ?? inspection.work.evidenceManifest;
  if (!evidencePath) return inspection.evidence;
  const local = relative(resolve(inspection.repo), resolve(inspection.repo, evidencePath)).split(sep).join('/');
  return readProjectJson(inspection.repo, { path: local }, 'Evidence Manifest').value;
}
