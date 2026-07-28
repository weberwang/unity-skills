"""深度校验质量门证据并原子输出门禁结果。"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Mapping, Sequence
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

from unity_workflow.contracts import load_yaml, validate_contract, validate_decomposition_freshness
from unity_workflow.file_mutex import FileMutex


CONTRACT_TYPES = {
    "decomposition-plan",
    "module-manifest",
    "quality-report",
    "runtime-visual-evidence",
    "scene-manifest",
    "scene-report",
    "asset-register",
    "registration-record",
    "delivery-manifest",
    "visual-review",
    "visual-bible",
    "s00-report",
    "split-plan",
    "image-generation",
    "image-task",
    "scene-2d-adaptation",
}

REQUIRED_STATUSES = {
    "decomposition-plan": {"APPROVED"},
    "module-manifest": {"APPROVED"},
    "quality-report": {"PASS"},
    "runtime-visual-evidence": {"APPROVED"},
    "scene-manifest": {"DONE"},
    "scene-report": {"PASS"},
    "registration-record": {"VALIDATED"},
    "delivery-manifest": {"CANDIDATE", "RELEASE_APPROVED"},
    "visual-review": {"APPROVED"},
    "visual-bible": {"APPROVED"},
    "s00-report": {"PASS"},
    "split-plan": {"APPROVED"},
    "image-generation": {"GENERATED"},
    "image-task": {"APPROVED"},
    "scene-2d-adaptation": {"VERIFIED"},
}

REQUIRED_CHECK_EVIDENCE_TYPES = {
    "decomposition.approved": "decomposition-plan",
    "visual-bible.approved": "visual-bible",
    "s00.verified": "s00-report",
    "vertical-slice.playable": "scene-manifest",
    "scope.complete": "scene-manifest",
    "scenes.2d-adaptation-verified": "scene-manifest",
}


class GateEvidenceError(ValueError):
    """表示门禁证据缺失、失配或未达到放行状态。"""


def evaluate_gate(
    config_path: Path,
    gate_id: str,
    project_root: Path,
    project_id: str,
    source_revision: str,
    build_version: str,
    output_path: Path,
) -> dict[str, Any]:
    """深度验证指定质量门的全部证据，并原子写出更新后的门禁清单。"""
    root = project_root.resolve()
    config = load_yaml(config_path)
    issues = validate_contract("quality-gates", config)
    if issues:
        details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
        raise GateEvidenceError(f"质量门配置无效：{details}")
    if config.get("projectId") != project_id:
        raise GateEvidenceError("质量门 projectId 与求值参数不一致")
    if config.get("sourceRevision") != source_revision:
        raise GateEvidenceError("质量门 sourceRevision 与求值参数不一致")

    result = deepcopy(config)
    gate = next((item for item in result["gates"] if item["id"] == gate_id), None)
    if gate is None:
        raise GateEvidenceError(f"未知质量门：{gate_id}")

    checks_by_id = {
        item.get("id"): item
        for item in gate.get("checkResults", [])
        if isinstance(item, Mapping)
    }
    evaluated: list[dict[str, Any]] = []
    all_passed = True
    verifier = _EvidenceVerifier(
        root,
        project_id,
        source_revision,
        build_version,
        gate_id,
        config["projectStateVersion"],
        config["activeDecomposition"],
    )
    for check_id in gate["requiredChecks"]:
        source = checks_by_id.get(check_id)
        failure = _evaluate_check(check_id, source, verifier)
        if failure is None:
            evaluated.append(dict(source))
        else:
            all_passed = False
            evaluated.append({"id": check_id, "status": "FAIL", "evidence": list(source.get("evidence", [])) if source else [], "failureReason": failure})

    gate_failures: list[str] = []
    try:
        verifier.verify_active_decomposition()
    except GateEvidenceError as error:
        gate_failures.append(str(error))
    if not gate.get("evidence"):
        gate_failures.append("质量门缺少汇总证据")
    else:
        for evidence in gate["evidence"]:
            try:
                verifier.verify_reference(evidence)
            except GateEvidenceError as error:
                gate_failures.append(str(error))
    if gate_failures:
        all_passed = False

    gate["checkResults"] = evaluated
    gate["status"] = "PASS" if all_passed else "FAIL"
    if gate_failures:
        # 保持 checkResults 与 requiredChecks 一一对应，把门级证据失败归入首项必需检查。
        first = gate["checkResults"][0]
        previous = first.get("failureReason")
        first["status"] = "FAIL"
        first["failureReason"] = "；".join(filter(None, (previous, *gate_failures)))

    output_issues = validate_contract("quality-gates", result)
    if output_issues:
        details = "；".join(f"{issue.path}: {issue.message}" for issue in output_issues)
        raise GateEvidenceError(f"求值结果不满足质量门契约：{details}")
    _atomic_dump(output_path, result)
    return {"gate": gate_id, "status": gate["status"], "output": str(output_path)}


def _evaluate_check(
    check_id: str,
    source: Mapping[str, Any] | None,
    verifier: "_EvidenceVerifier",
) -> str | None:
    """验证单项必需检查的声明状态与全部证据引用。"""
    if source is None:
        return "缺少检查结果"
    if source.get("status") != "PASS":
        return f"声明状态不是 PASS：{source.get('status', 'MISSING')}"
    evidence = source.get("evidence")
    if not isinstance(evidence, Sequence) or isinstance(evidence, (str, bytes)) or not evidence:
        return "PASS 检查缺少证据"
    expected_type = REQUIRED_CHECK_EVIDENCE_TYPES.get(check_id)
    if expected_type is not None and not any(
        isinstance(item, Mapping) and item.get("type") == expected_type
        for item in evidence
    ):
        return f"{check_id} 必须包含 {expected_type} 契约证据"
    try:
        for reference in evidence:
            verifier.verify_reference(reference)
        verifier.verify_check_coverage(check_id, evidence)
    except GateEvidenceError as error:
        return str(error)
    return None


class _EvidenceVerifier:
    """递归校验证据文件、契约、状态、身份、版本和嵌套哈希。"""

    def __init__(
        self,
        root: Path,
        project_id: str,
        source_revision: str,
        build_version: str,
        gate_id: str,
        project_state_version: str,
        active_decomposition: Mapping[str, Any],
    ) -> None:
        """保存当前门禁必须绑定的项目身份与版本。"""
        self.root = root
        self.project_id = project_id
        self.source_revision = source_revision
        self.build_version = build_version
        self.gate_id = gate_id
        self.project_state_version = project_state_version
        self.active_decomposition = dict(active_decomposition)
        self._verified: set[tuple[str, str]] = set()

    def verify_active_decomposition(self) -> None:
        """深验项目当前拆分指针，待确认或旧版本会阻断所有下游质量门。"""
        if self.active_decomposition.get("sourceRevision") != self.source_revision:
            raise GateEvidenceError("当前拆分指针 sourceRevision 不匹配")
        if self.active_decomposition.get("projectStateVersion") != self.project_state_version:
            raise GateEvidenceError("当前拆分指针 projectStateVersion 不匹配")
        self.verify_reference(self.active_decomposition)

    def verify_reference(self, reference: object) -> None:
        """验证一条 evidence 引用，并按 type 对已知契约执行深度校验。"""
        if not isinstance(reference, Mapping):
            raise GateEvidenceError("证据引用必须是对象")
        evidence_type = reference.get("type")
        raw_path = reference.get("path")
        expected_hash = reference.get("sha256")
        if not all(isinstance(value, str) and value for value in (evidence_type, raw_path, expected_hash)):
            raise GateEvidenceError("证据缺少 type、path 或 sha256")
        path = _resolve_within(self.root, Path(raw_path))
        if not path.is_file():
            raise GateEvidenceError(f"证据文件不存在：{raw_path}")
        if _sha256(path).lower() != expected_hash.lower():
            raise GateEvidenceError(f"证据哈希不匹配：{raw_path}")
        key = (evidence_type, raw_path)
        if key in self._verified:
            if evidence_type in CONTRACT_TYPES:
                # 缓存只复用文件内容验证；每条引用的主体与版本绑定仍必须单独校验。
                self._verify_identity(evidence_type, _load_document(path), reference)
            return
        if evidence_type not in CONTRACT_TYPES:
            self._verified.add(key)
            return

        payload = _load_document(path)
        issues = validate_contract(evidence_type, payload)
        if issues:
            details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
            raise GateEvidenceError(f"契约证据无效 {raw_path}：{details}")
        self._verify_identity(evidence_type, payload, reference)
        self._verify_status(evidence_type, payload)
        self._verify_nested(evidence_type, payload)
        # 仅在 Schema、身份、状态和嵌套证据全部通过后缓存，避免半验证结果污染后续引用。
        self._verified.add(key)

    def verify_check_coverage(
        self,
        check_id: str,
        evidence: Sequence[object],
    ) -> None:
        """验证需要全集语义的检查没有用单个场景证据冒充项目范围。"""
        if check_id != "scenes.2d-adaptation-verified":
            return
        self.verify_active_decomposition()
        decomposition = self._load_referenced_contract(self.active_decomposition)
        decision = decomposition.get("decision")
        approved_scene_ids = set(
            decision.get("approvedSceneIds", []) if isinstance(decision, Mapping) else []
        )
        manifest_ids: list[str] = []
        for reference in evidence:
            if not isinstance(reference, Mapping) or reference.get("type") != "scene-manifest":
                continue
            manifest = self._load_referenced_contract(reference)
            scene_id = manifest.get("id")
            if isinstance(scene_id, str):
                manifest_ids.append(scene_id)
        if len(manifest_ids) != len(set(manifest_ids)):
            raise GateEvidenceError("2D 适配检查包含重复 scene-manifest")
        if set(manifest_ids) != approved_scene_ids:
            missing = sorted(approved_scene_ids - set(manifest_ids))
            extra = sorted(set(manifest_ids) - approved_scene_ids)
            details = []
            if missing:
                details.append(f"缺少已批准场景：{', '.join(missing)}")
            if extra:
                details.append(f"包含未批准场景：{', '.join(extra)}")
            raise GateEvidenceError("2D 适配检查必须覆盖当前拆分的场景全集；" + "；".join(details))

    def _verify_identity(self, kind: str, payload: Mapping[str, Any], reference: Mapping[str, Any]) -> None:
        """拒绝其他项目、源码、构建或主体版本的旧证据。"""
        if "projectId" in payload and payload["projectId"] != self.project_id:
            raise GateEvidenceError(f"{kind} projectId 不匹配")
        if "sourceRevision" in payload and payload["sourceRevision"] != self.source_revision:
            raise GateEvidenceError(f"{kind} sourceRevision 不匹配")
        if "buildVersion" in payload and payload["buildVersion"] != self.build_version:
            raise GateEvidenceError(f"{kind} buildVersion 不匹配")
        if "projectStateVersion" in payload and payload["projectStateVersion"] != self.project_state_version:
            raise GateEvidenceError(f"{kind} projectStateVersion 不匹配")
        if kind == "delivery-manifest" and payload.get("version") != self.build_version:
            raise GateEvidenceError("delivery-manifest version 不匹配")

        if kind == "scene-manifest":
            document_id = payload.get("id")
        elif kind in {"scene-report", "scene-2d-adaptation", "runtime-visual-evidence"}:
            document_id = payload.get("sceneId")
        elif kind == "visual-bible":
            document_id = payload.get("projectId")
        else:
            document_id = payload.get(
                "subjectId",
                payload.get(
                    "id",
                    payload.get("taskId", payload.get("resourceId", payload.get("sceneId"))),
                ),
            )
        document_version = payload.get("subjectVersion", payload.get("sceneVersion", payload.get("version", payload.get("sourceVersion"))))
        if reference.get("subjectId") is not None and reference["subjectId"] != document_id:
            raise GateEvidenceError(f"{kind} subjectId 不匹配")
        if reference.get("subjectVersion") is not None and reference["subjectVersion"] != document_version:
            raise GateEvidenceError(f"{kind} subjectVersion 不匹配")
        if reference.get("sourceRevision") is not None and reference["sourceRevision"] != self.source_revision:
            raise GateEvidenceError(f"{kind} 引用的 sourceRevision 不匹配")
        if reference.get("buildVersion") is not None and reference["buildVersion"] != self.build_version:
            raise GateEvidenceError(f"{kind} 引用的 buildVersion 不匹配")
        if reference.get("projectStateVersion") is not None and reference["projectStateVersion"] != self.project_state_version:
            raise GateEvidenceError(f"{kind} 引用的 projectStateVersion 不匹配")

    def _verify_status(self, kind: str, payload: Mapping[str, Any]) -> None:
        """确保已知契约达到门禁允许消费的最终状态。"""
        if kind == "asset-register":
            if self.gate_id in {"G2", "G3"} and payload.get("placeholders"):
                raise GateEvidenceError("G2/G3 资源登记仍包含占位资源")
            for asset in payload.get("assets", []):
                if asset.get("status") != "VALIDATED" or asset.get("unityValidation") != "PASS":
                    raise GateEvidenceError(f"资源未完成 Unity 验证：{asset.get('id')}")
                if self.gate_id == "G3" and asset.get("licenseStatus") != "APPROVED":
                    raise GateEvidenceError(f"G3 资源许可未批准：{asset.get('id')}")
            return
        allowed = REQUIRED_STATUSES.get(kind)
        if allowed is not None and payload.get("status") not in allowed:
            raise GateEvidenceError(f"{kind} 状态未通过：{payload.get('status')}")
        if kind == "delivery-manifest" and self.gate_id == "G3" and payload.get("status") != "RELEASE_APPROVED":
            raise GateEvidenceError("G3 只接受 RELEASE_APPROVED 交付清单")

    def _verify_nested(self, kind: str, payload: Mapping[str, Any]) -> None:
        """沿正式契约中的证据引用继续校验，避免顶层文件掩盖伪造路径。"""
        references: list[object] = []
        if kind in {"module-manifest", "scene-manifest", "s00-report"}:
            freshness_issues = validate_decomposition_freshness(
                {
                    "projectId": self.project_id,
                    "activeDecomposition": self.active_decomposition,
                },
                payload,
            )
            if freshness_issues:
                details = "；".join(f"{item.path}: {item.message}" for item in freshness_issues)
                raise GateEvidenceError(f"{kind} 拆分版本已失效：{details}")
        if kind == "quality-report":
            references.extend(payload.get("evidence", []))
            for check in payload.get("checks", []):
                references.extend(check.get("evidence", []))
        elif kind == "runtime-visual-evidence":
            screenshot = payload.get("screenshot", {})
            references.append({"type": "runtime-screenshot", "path": screenshot.get("path"), "sha256": screenshot.get("sha256")})
            references.extend(_approval_references(payload.get("reviews", [])))
            references.extend(_approval_references(payload.get("userApprovals", [])))
        elif kind == "scene-manifest":
            references.append(payload.get("decompositionPlan"))
            references.append(payload.get("adaptation2D"))
            references.extend(payload.get("qualityReports", []))
            references.extend(payload.get("runtimeCaptures", []))
            references.extend(payload.get("visualReviews", {}).values())
            references.extend(payload.get("evidence", []))
        elif kind == "scene-report":
            references.append(payload.get("sceneManifest"))
            for field in ("greybox", "gameVisual", "implementation", "uiVisual", "runtimeComparison", "tests", "performance"):
                references.extend(payload.get(field, {}).get("evidence", []))
        elif kind == "s00-report":
            references.extend((payload.get("decompositionPlan"), payload.get("moduleManifest")))
            references.extend(payload.get("qualityReports", []))
            references.extend(payload.get("console", {}).get("evidence", []))
            references.append(payload.get("emptyWindowsBuild", {}).get("artifact"))
            references.extend(_approval_references(payload.get("reviews", [])))
        elif kind == "visual-review":
            references.extend(payload.get("candidateEvidence", []))
            references.extend(_approval_references(payload.get("reviews", [])))
            references.extend(_approval_references([payload.get("userApproval")]))
        elif kind == "visual-bible":
            references.extend(payload.get("directionCandidates", []))
            references.extend((payload.get("selectedDirection"), payload.get("finalVisualReview")))
            references.extend(_approval_references(payload.get("reviews", [])))
            references.extend(_approval_references([payload.get("approval")]))
        elif kind == "split-plan":
            self._verify_split_plan_source(payload)
            references.extend((payload.get("visualBibleEvidence"), payload.get("regenerationEvidence"), payload.get("sourceImage"), payload.get("annotatedPreview")))
            references.extend(_approval_references(payload.get("reviews", [])))
        elif kind == "decomposition-plan":
            decision = payload.get("decision", {})
            references.extend(_approval_references([decision.get("userApproval")]))
            for item in payload.get("interrogation", []):
                references.extend(item.get("evidence", []))
        elif kind == "module-manifest":
            references.append(payload.get("decompositionPlan"))
        elif kind == "image-generation":
            references.append(payload.get("visualBibleEvidence"))
            references.extend(
                {"type": "visual-reference", "path": item.get("path"), "sha256": item.get("sha256")}
                for item in payload.get("references", [])
                if isinstance(item, Mapping)
            )
            references.extend({"type": "generated-image", "path": item.get("path"), "sha256": item.get("sha256")} for item in payload.get("candidates", []))
        elif kind == "image-task":
            self._verify_image_task_split_binding(payload)
            references.extend((payload.get("visualBibleEvidence"), payload.get("regenerationEvidence"), payload.get("splitPlanEvidence"), payload.get("finalVisualReview")))
            references.extend(_approval_references(payload.get("approvals", [])))
            candidate = payload.get("selectedCandidate", {})
            references.append({"type": "selected-image", "path": candidate.get("path"), "sha256": candidate.get("sha256")})
        elif kind == "asset-register":
            for asset in payload.get("assets", []):
                references.extend(asset.get("evidence", []))
                if asset.get("licenseEvidence"):
                    references.append(asset["licenseEvidence"])
                if asset.get("sourceSha256"):
                    references.append({"type": "unity-asset", "path": asset.get("path"), "sha256": asset.get("sourceSha256")})
        elif kind == "delivery-manifest":
            references.extend(payload.get("evidence", []))
            references.extend(payload.get("qualityReports", []))
            references.extend(payload.get("runtimeVisualEvidence", []))
            references.extend((payload.get("manageBuildResult", {}).get("evidence"), payload.get("launchCheck", {}).get("evidence")))
            references.extend({"type": "build-artifact", "path": item.get("path"), "sha256": item.get("sha256")} for item in payload.get("artifacts", []))
            references.extend(_approval_references([payload.get("authorization", {}).get("approval")]))
        elif kind == "registration-record":
            references.append({"type": "source-image", "path": payload.get("sourcePath"), "sha256": payload.get("sourceSha256")})
            references.append({"type": "unity-asset", "path": payload.get("assetPath"), "sha256": payload.get("sourceSha256")})
            references.extend(_approval_references(payload.get("approvals", [])))
        elif kind == "scene-2d-adaptation":
            verification = payload.get("verification", {})
            for check_name in ("unityConfiguration", "editMode", "runtimeScreenshots"):
                check = verification.get(check_name, {}) if isinstance(verification, Mapping) else {}
                for evidence in check.get("evidence", []) if isinstance(check, Mapping) else []:
                    if isinstance(evidence, Mapping) and evidence.get("type") == "runtime-2d-adaptation-screenshot":
                        if evidence.get("buildVersion") != self.build_version:
                            raise GateEvidenceError("2D 运行截图 buildVersion 不匹配")
                    references.append(evidence)

        for reference in references:
            if reference is not None:
                self.verify_reference(reference)

    def _verify_split_plan_source(self, payload: Mapping[str, Any]) -> None:
        """确认拆分源图确实是所引 image-generation 契约中的同一生成候选。"""
        regeneration = payload.get("regenerationEvidence")
        if not isinstance(regeneration, Mapping):
            raise GateEvidenceError("split-plan 缺少重新生成契约引用")
        self.verify_reference(regeneration)
        generation = self._load_referenced_contract(regeneration)
        candidate = next(
            (
                item
                for item in generation.get("candidates", [])
                if isinstance(item, Mapping) and item.get("id") == regeneration.get("candidateId")
            ),
            None,
        )
        if candidate is None:
            raise GateEvidenceError("split-plan 引用的重新生成候选不存在")
        expected = {
            "path": regeneration.get("candidatePath"),
            "sha256": regeneration.get("candidateSha256"),
            "visualVersion": regeneration.get("candidateVisualVersion"),
        }
        if any(candidate.get(field) != value for field, value in expected.items()):
            raise GateEvidenceError("split-plan 重新生成候选的路径、哈希或视觉版本不匹配")

    def _verify_image_task_split_binding(self, payload: Mapping[str, Any]) -> None:
        """确认最终资源绑定真实拆分条目，并沿用该拆分方案的重新生成源。"""
        split_reference = payload.get("splitPlanEvidence")
        regeneration = payload.get("regenerationEvidence")
        if not isinstance(split_reference, Mapping) or not isinstance(regeneration, Mapping):
            raise GateEvidenceError("image-task 缺少拆分或重新生成契约引用")
        self.verify_reference(split_reference)
        split_plan = self._load_referenced_contract(split_reference)
        item = next(
            (
                entry
                for entry in split_plan.get("items", [])
                if isinstance(entry, Mapping)
                and entry.get("id") == split_reference.get("itemId")
                and entry.get("elementIndex") == split_reference.get("itemElementIndex")
            ),
            None,
        )
        if item is None or item.get("action") == "BLOCKED":
            raise GateEvidenceError("image-task 引用的拆分条目不存在或仍被阻塞")
        plan_regeneration = split_plan.get("regenerationEvidence")
        if not isinstance(plan_regeneration, Mapping):
            raise GateEvidenceError("被引用 split-plan 缺少重新生成来源")
        for field in ("path", "sha256", "subjectId", "subjectVersion"):
            if regeneration.get(field) != plan_regeneration.get(field):
                raise GateEvidenceError("image-task 与 split-plan 的重新生成来源不一致")

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """在项目根目录内读取已完成哈希校验的契约引用。"""
        raw_path = reference.get("path")
        if not isinstance(raw_path, str):
            raise GateEvidenceError("契约引用缺少路径")
        return _load_document(_resolve_within(self.root, Path(raw_path)))


def _approval_references(approvals: object) -> list[dict[str, Any]]:
    """把批准记录转换为统一 evidence 引用以复用哈希校验。"""
    if not isinstance(approvals, Sequence) or isinstance(approvals, (str, bytes)):
        return []
    return [
        {"type": "approval", "path": item.get("evidencePath"), "sha256": item.get("evidenceSha256")}
        for item in approvals
        if isinstance(item, Mapping)
    ]


def _load_document(path: Path) -> dict[str, Any]:
    """按扩展名读取 JSON 或 YAML 契约文档。"""
    try:
        text = path.read_text(encoding="utf-8")
        payload = json.loads(text) if path.suffix.lower() == ".json" else yaml.safe_load(text)
    except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError) as error:
        raise GateEvidenceError(f"无法读取契约证据 {path}: {error}") from error
    if not isinstance(payload, dict):
        raise GateEvidenceError(f"契约证据顶层必须是对象：{path}")
    return payload


def _resolve_within(root: Path, path: Path) -> Path:
    """把证据路径约束在项目根目录内。"""
    resolved = path.resolve() if path.is_absolute() else (root / path).resolve()
    if not resolved.is_relative_to(root):
        raise GateEvidenceError(f"证据路径超出项目根目录：{path}")
    return resolved


def _sha256(path: Path) -> str:
    """流式计算证据文件 SHA-256。"""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_dump(path: Path, payload: Mapping[str, Any]) -> None:
    """在文件互斥锁内通过同目录临时文件原子写出求值结果。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with FileMutex(path):
        descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                if path.suffix.lower() == ".json":
                    json.dump(payload, handle, ensure_ascii=False, sort_keys=True, indent=2)
                    handle.write("\n")
                else:
                    yaml.safe_dump(dict(payload), handle, allow_unicode=True, sort_keys=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary_name, path)
        except Exception:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise
