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
    "project-profile",
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
    "prefab-structure",
    "prefab-assembly",
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
    "visual-review": {"APPROVED", "REVIEW_APPROVED"},
    "visual-bible": {"APPROVED"},
    "s00-report": {"PASS"},
    "split-plan": {"APPROVED"},
    "image-generation": {"GENERATED", "USER_CONFIRMED"},
    "image-task": {"APPROVED"},
    "scene-2d-adaptation": {"VERIFIED"},
    "prefab-structure": {"APPROVED"},
    "prefab-assembly": {"VERIFIED"},
}

REQUIRED_CHECK_EVIDENCE_TYPES = {
    "scope.approved": "project-profile",
    "decomposition.approved": "decomposition-plan",
    "visual-bible.approved": "visual-bible",
    "windows-distribution.approved": "project-profile",
    "s00.verified": "s00-report",
    "vertical-slice.playable": "scene-manifest",
    "visual.runtime-approved": "runtime-visual-evidence",
    "build.windows-development": "quality-report",
    "scope.complete": "scene-manifest",
    "assets.production-ready": "asset-register",
    "regression.pass": "quality-report",
    "performance.pass": "quality-report",
    "defects.p0-p1-resolved": "quality-report",
    "scenes.2d-adaptation-verified": "scene-manifest",
    "candidate.verified": "delivery-manifest",
    "licenses.verified": "asset-register",
    "privacy.verified": "quality-report",
    "rollback.ready": "delivery-manifest",
    "user.release-approved": "delivery-manifest",
}

GATE_ORDER = ("G0", "G1", "G2", "G3")


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
    upstream_failures = _verify_upstream_gates(result["gates"], gate_id, verifier)
    for check_id in gate["requiredChecks"]:
        source = checks_by_id.get(check_id)
        failure = _evaluate_check(check_id, source, verifier)
        if failure is None:
            evaluated.append(dict(source))
        else:
            all_passed = False
            evaluated.append({"id": check_id, "status": "FAIL", "evidence": list(source.get("evidence", [])) if source else [], "failureReason": failure})

    gate_failures: list[str] = list(upstream_failures)
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


def _verify_upstream_gates(
    gates: Sequence[object],
    gate_id: str,
    verifier: "_EvidenceVerifier",
) -> list[str]:
    """深验所有前置门禁，阻止只修改状态字段后跳关。"""
    failures: list[str] = []
    target_index = GATE_ORDER.index(gate_id)
    gates_by_id = {
        gate.get("id"): gate
        for gate in gates
        if isinstance(gate, Mapping) and isinstance(gate.get("id"), str)
    }
    for upstream_id in GATE_ORDER[:target_index]:
        upstream = gates_by_id.get(upstream_id)
        if not isinstance(upstream, Mapping) or upstream.get("status") != "PASS":
            failures.append(f"前置质量门 {upstream_id} 未通过")
            continue
        results = {
            item.get("id"): item
            for item in upstream.get("checkResults", [])
            if isinstance(item, Mapping)
        }
        for check_id in upstream.get("requiredChecks", []):
            failure = _evaluate_check(check_id, results.get(check_id), verifier)
            if failure is not None:
                failures.append(f"前置质量门 {upstream_id}/{check_id} 失效：{failure}")
        evidence = upstream.get("evidence")
        if not isinstance(evidence, Sequence) or isinstance(evidence, (str, bytes)) or not evidence:
            failures.append(f"前置质量门 {upstream_id} 缺少汇总证据")
            continue
        for reference in evidence:
            try:
                verifier.verify_reference(reference)
            except GateEvidenceError as error:
                failures.append(f"前置质量门 {upstream_id} 证据失效：{error}")
    return failures


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
        expected_type = REQUIRED_CHECK_EVIDENCE_TYPES.get(check_id)
        if expected_type == "quality-report":
            reports = [
                self._load_referenced_contract(reference)
                for reference in evidence
                if isinstance(reference, Mapping) and reference.get("type") == "quality-report"
            ]
            if not any(
                isinstance(result, Mapping)
                and result.get("id") == check_id
                and result.get("status") == "PASS"
                for report in reports
                for result in report.get("checks", [])
            ):
                raise GateEvidenceError(f"{check_id} 缺少同名 PASS 质量检查")
        if check_id not in {"scope.complete", "scenes.2d-adaptation-verified"}:
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
            raise GateEvidenceError(f"{check_id} 包含重复 scene-manifest")
        if set(manifest_ids) != approved_scene_ids:
            missing = sorted(approved_scene_ids - set(manifest_ids))
            extra = sorted(set(manifest_ids) - approved_scene_ids)
            details = []
            if missing:
                details.append(f"缺少已批准场景：{', '.join(missing)}")
            if extra:
                details.append(f"包含未批准场景：{', '.join(extra)}")
            raise GateEvidenceError(f"{check_id} 必须覆盖当前拆分的场景全集；" + "；".join(details))

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
        if kind == "project-profile":
            workflow = payload.get("workflow")
            if not isinstance(workflow, Mapping):
                raise GateEvidenceError("project-profile 缺少 workflow")
            if workflow.get("sourceRevision") != self.source_revision:
                raise GateEvidenceError("project-profile sourceRevision 不匹配")
            if workflow.get("projectStateVersion") != self.project_state_version:
                raise GateEvidenceError("project-profile projectStateVersion 不匹配")

        if kind == "project-profile":
            document_id = payload.get("projectId")
        elif kind == "scene-manifest":
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
        # 契约证据必须显式声明主体与版本，缺省不能被解释为“接受任意当前版本”。
        if document_id is not None and reference.get("subjectId") is None:
            raise GateEvidenceError(f"{kind} 引用缺少 subjectId 绑定")
        if document_version is not None and reference.get("subjectVersion") is None:
            raise GateEvidenceError(f"{kind} 引用缺少 subjectVersion 绑定")
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
        if kind == "project-profile":
            workflow = payload.get("workflow")
            if not isinstance(workflow, Mapping) or workflow.get("qualityTargetsStatus") != "APPROVED":
                raise GateEvidenceError("project-profile 质量目标未批准")
            decomposition = workflow.get("decomposition")
            if not isinstance(decomposition, Mapping) or decomposition.get("status") != "APPROVED":
                raise GateEvidenceError("project-profile 当前拆分未批准")
            if (
                decomposition.get("id") != self.active_decomposition.get("subjectId")
                or decomposition.get("version") != self.active_decomposition.get("subjectVersion")
            ):
                raise GateEvidenceError("project-profile 未绑定当前拆分版本")
            return
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
            references.extend(
                (
                    payload.get("prefabStructure"),
                    payload.get("highFidelityVisualReview"),
                    payload.get("assetMap"),
                    payload.get("prefabAssembly"),
                )
            )
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
            references.append(payload.get("generationEvidence"))
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
            references.extend(
                (
                    payload.get("visualBibleEvidence"),
                    payload.get("prefabStructureEvidence"),
                    payload.get("highFidelityGenerationEvidence"),
                    payload.get("highFidelityReviewEvidence"),
                    payload.get("sourceImage"),
                    payload.get("annotatedPreview"),
                )
            )
            references.extend(_approval_references(payload.get("reviews", [])))
            references.extend(_approval_references([payload.get("userApproval")]))
        elif kind == "decomposition-plan":
            decision = payload.get("decision", {})
            references.extend(_approval_references([decision.get("userApproval")]))
            for item in payload.get("interrogation", []):
                references.extend(item.get("evidence", []))
        elif kind == "module-manifest":
            references.append(payload.get("decompositionPlan"))
        elif kind == "image-generation":
            references.append(payload.get("visualBibleEvidence"))
            references.extend((payload.get("prefabStructureEvidence"), payload.get("splitPlanEvidence")))
            references.extend(
                {"type": "visual-reference", "path": item.get("path"), "sha256": item.get("sha256")}
                for item in payload.get("references", [])
                if isinstance(item, Mapping)
            )
            references.extend({"type": "generated-image", "path": item.get("path"), "sha256": item.get("sha256")} for item in payload.get("candidates", []))
            references.extend(_approval_references([payload.get("userApproval")]))
        elif kind == "image-task":
            self._verify_image_task_split_binding(payload)
            references.extend((payload.get("visualBibleEvidence"), payload.get("itemGenerationEvidence"), payload.get("splitPlanEvidence"), payload.get("finalVisualReview")))
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
        elif kind == "prefab-structure":
            references.extend((payload.get("visualBibleEvidence"), payload.get("lowFidelityPreview")))
            references.extend(_approval_references([payload.get("userApproval")]))
        elif kind == "prefab-assembly":
            self._verify_prefab_assembly_bindings(payload)
            references.extend((payload.get("prefabStructureEvidence"), payload.get("splitPlanEvidence")))
            references.extend(
                item.get("productionEvidence")
                for item in payload.get("assetBindings", [])
                if isinstance(item, Mapping)
            )
            cleanup = payload.get("lowFidelityCleanup")
            if isinstance(cleanup, Mapping):
                references.extend(cleanup.get("evidence", []))
            references.extend(payload.get("evidence", []))

        for reference in references:
            if reference is not None:
                self.verify_reference(reference)

    def _verify_split_plan_source(self, payload: Mapping[str, Any]) -> None:
        """确认 P3 资产地图严格绑定 P1 已确认候选与 P2 独立审阅。"""
        structure_reference = payload.get("prefabStructureEvidence")
        generation_reference = payload.get("highFidelityGenerationEvidence")
        review_reference = payload.get("highFidelityReviewEvidence")
        if not all(
            isinstance(reference, Mapping)
            for reference in (structure_reference, generation_reference, review_reference)
        ):
            raise GateEvidenceError("split-plan 缺少 P0 结构、P1 高保真生成或 P2 审阅引用")
        self.verify_reference(structure_reference)
        structure = self._load_referenced_contract(structure_reference)
        if structure.get("status") != "APPROVED":
            raise GateEvidenceError("split-plan 只接受 APPROVED P0 Prefab 结构")
        if payload.get("projectId") != structure.get("projectId") or payload.get("sceneId") != structure.get("sceneId"):
            raise GateEvidenceError("split-plan 项目或场景身份与 P0 结构不一致")
        known_node_ids = {
            node.get("id")
            for prefab in structure.get("prefabs", [])
            if isinstance(prefab, Mapping)
            for node in prefab.get("nodes", [])
            if isinstance(node, Mapping)
        }
        for item in payload.get("items", []):
            if not isinstance(item, Mapping):
                continue
            unknown = set(item.get("targetPrefabNodeIds", [])) - known_node_ids
            if unknown:
                raise GateEvidenceError(
                    f"P3 条目 {item.get('id')} 引用了 P0 中不存在的 Prefab 节点：{', '.join(sorted(unknown))}"
                )
        self.verify_reference(generation_reference)
        generation = self._load_referenced_contract(generation_reference)
        if generation.get("status") != "USER_CONFIRMED":
            raise GateEvidenceError("split-plan 只接受 P1 USER_CONFIRMED 高保真生成")
        candidate = next(
            (
                item
                for item in generation.get("candidates", [])
                if isinstance(item, Mapping) and item.get("id") == generation_reference.get("candidateId")
            ),
            None,
        )
        if candidate is None:
            raise GateEvidenceError("split-plan 引用的 P1 已确认候选不存在")
        expected = {
            "path": generation_reference.get("candidatePath"),
            "sha256": generation_reference.get("candidateSha256"),
            "visualVersion": generation_reference.get("candidateVisualVersion"),
        }
        if any(candidate.get(field) != value for field, value in expected.items()):
            raise GateEvidenceError("split-plan 的 P1 候选路径、哈希或视觉版本不匹配")
        self.verify_reference(review_reference)
        review = self._load_referenced_contract(review_reference)
        if review.get("status") != "REVIEW_APPROVED":
            raise GateEvidenceError("split-plan 只接受 P2 REVIEW_APPROVED 审阅")
        if review.get("subjectId") != generation.get("id") or review.get("subjectVersion") != candidate.get("visualVersion"):
            raise GateEvidenceError("P2 审阅未绑定 P1 已确认候选")

    def _verify_image_task_split_binding(self, payload: Mapping[str, Any]) -> None:
        """确认单图任务绑定真实 P3 条目，且最终候选来自对应单图生成。"""
        split_reference = payload.get("splitPlanEvidence")
        item_generation = payload.get("itemGenerationEvidence")
        if not isinstance(split_reference, Mapping) or not isinstance(item_generation, Mapping):
            raise GateEvidenceError("image-task 缺少资产地图或单项生成契约引用")
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
        if item is None or item.get("action") not in {"GENERATE", "REDRAW", "EXPORT_LAYER"}:
            raise GateEvidenceError("image-task 引用的拆分条目不存在或仍被阻塞")
        expected_item = {
            "itemVersion": split_reference.get("itemVersion"),
            "itemSpecSha256": split_reference.get("itemSpecSha256"),
            "resourceId": split_reference.get("resourceId"),
        }
        if any(item.get(field) != value for field, value in expected_item.items()):
            raise GateEvidenceError("image-task 与资产地图条目规格不一致")
        self.verify_reference(item_generation)
        generation = self._load_referenced_contract(item_generation)
        if generation.get("generationMode") != "RUNTIME_ASSET_ITEM" or generation.get("status") != "GENERATED":
            raise GateEvidenceError("image-task 只接受已完成的单图生成契约")
        generation_split = generation.get("splitPlanEvidence")
        if not isinstance(generation_split, Mapping):
            raise GateEvidenceError("单图生成缺少资产地图条目绑定")
        for field in ("itemId", "itemVersion", "itemSpecSha256", "resourceId"):
            if generation_split.get(field) != split_reference.get(field):
                raise GateEvidenceError("单图生成与 image-task 的资产地图条目不一致")
        selected = payload.get("selectedCandidate")
        if not isinstance(selected, Mapping):
            raise GateEvidenceError("image-task 缺少最终候选")
        if not any(
            isinstance(candidate, Mapping)
            and all(candidate.get(field) == selected.get(field) for field in ("path", "sha256", "visualVersion"))
            for candidate in generation.get("candidates", [])
        ):
            raise GateEvidenceError("image-task 最终候选不属于对应单图生成结果")

    def _verify_prefab_assembly_bindings(self, payload: Mapping[str, Any]) -> None:
        """确认最终拼装保持 P0 结构，并完整覆盖 P3 资产生产绑定。"""
        structure_reference = payload.get("prefabStructureEvidence")
        split_reference = payload.get("splitPlanEvidence")
        if not isinstance(structure_reference, Mapping) or not isinstance(split_reference, Mapping):
            raise GateEvidenceError("prefab-assembly 缺少 P0 Prefab 结构或 P3 资产地图引用")
        self.verify_reference(structure_reference)
        structure = self._load_referenced_contract(structure_reference)
        if structure.get("status") != "APPROVED":
            raise GateEvidenceError("prefab-assembly 只接受 APPROVED P0 Prefab 结构")
        if payload.get("projectId") != structure.get("projectId") or payload.get("sceneId") != structure.get("sceneId"):
            raise GateEvidenceError("prefab-assembly 项目或场景身份与 P0 结构不一致")

        expected_prefabs, expected_nodes = _prefab_structure_snapshot(structure.get("prefabs"))
        actual_prefabs, actual_nodes = _prefab_assembly_snapshot(payload.get("prefabs"))
        if actual_prefabs != expected_prefabs:
            raise GateEvidenceError("prefab-assembly 的 Prefab ID 或路径与 P0 结构不一致")
        if actual_nodes != expected_nodes:
            raise GateEvidenceError("prefab-assembly 的节点 ID、父子关系或 Transform 与 P0 结构不一致")

        scene = payload.get("scene")
        if not isinstance(scene, Mapping):
            raise GateEvidenceError("prefab-assembly 缺少场景拼装结果")
        expected_instances = _prefab_instance_snapshot(structure.get("sceneInstances"))
        actual_instances = _prefab_instance_snapshot(scene.get("prefabInstances"))
        expected_scene_paths = {
            item.get("scenePath")
            for item in structure.get("sceneInstances", [])
            if isinstance(item, Mapping)
        }
        if expected_scene_paths != {scene.get("path")} or actual_instances != expected_instances:
            raise GateEvidenceError("prefab-assembly 的场景路径或 Prefab 实例与 P0 结构不一致")

        self._verify_low_fidelity_cleanup(payload, structure, structure_reference, split_reference)

        self.verify_reference(split_reference)
        split_plan = self._load_referenced_contract(split_reference)
        expected_type = {
            "REUSE": "REUSED_ASSET",
            "GENERATE": "IMAGE_TASK",
            "REDRAW": "IMAGE_TASK",
            "EXPORT_LAYER": "EXPORTED_LAYER",
            "PROGRAMMATIC": "PROGRAMMATIC",
            "MODEL_3D": "MODEL_3D",
            "MATERIAL": "MATERIAL",
            "VFX": "VFX",
            "CODE": "CODE",
        }
        expected = {
            (item.get("id"), item.get("resourceId")): expected_type.get(item.get("action"))
            for item in split_plan.get("items", [])
            if isinstance(item, Mapping) and item.get("action") != "BLOCKED"
        }
        actual = {
            (item.get("itemId"), item.get("resourceId")): item.get("productionType")
            for item in payload.get("assetBindings", [])
            if isinstance(item, Mapping)
        }
        if actual != expected:
            raise GateEvidenceError("prefab-assembly 生产绑定未完整覆盖 P3 资产地图或类型不匹配")

    def _verify_low_fidelity_cleanup(
        self,
        payload: Mapping[str, Any],
        structure: Mapping[str, Any],
        structure_reference: Mapping[str, Any],
        split_reference: Mapping[str, Any],
    ) -> None:
        """确认灰盒与占位内容已清零，同时保留 P0 结构和全部审计证据。"""
        cleanup = payload.get("lowFidelityCleanup")
        if not isinstance(cleanup, Mapping):
            raise GateEvidenceError("prefab-assembly 缺少低保真清理记录")
        if (
            cleanup.get("status") != "PASS"
            or cleanup.get("remainingPlaceholderCount") != 0
            or cleanup.get("structurePreserved") is not True
            or cleanup.get("referencesClean") is not True
            or not cleanup.get("evidence")
        ):
            raise GateEvidenceError("低保真清理未达到 PASS、占位清零、结构保留、引用清洁且证据齐全")

        prefab_ids: set[object] = set()
        prefab_paths: set[object] = set()
        node_ids: set[object] = set()
        for prefab in structure.get("prefabs", []):
            if not isinstance(prefab, Mapping):
                continue
            prefab_ids.add(prefab.get("id"))
            prefab_paths.add(prefab.get("path"))
            node_ids.update(
                node.get("id")
                for node in prefab.get("nodes", [])
                if isinstance(node, Mapping)
            )
        instance_ids = {
            item.get("id")
            for item in structure.get("sceneInstances", [])
            if isinstance(item, Mapping)
        }
        protected_paths = prefab_paths | {
            structure_reference.get("path"),
            split_reference.get("path"),
        }
        for evidence in (
            structure.get("visualBibleEvidence"),
            structure.get("lowFidelityPreview"),
            *cleanup.get("evidence", []),
            *payload.get("evidence", []),
        ):
            if isinstance(evidence, Mapping):
                protected_paths.add(evidence.get("path"))

        for item in cleanup.get("removedItems", []):
            if not isinstance(item, Mapping):
                continue
            item_type = item.get("itemType")
            target_id = item.get("targetId")
            if item_type == "PREFAB" and target_id in prefab_ids:
                raise GateEvidenceError("低保真清理不得删除 P0 Prefab")
            if item_type == "SCENE_OBJECT" and target_id in node_ids | instance_ids:
                raise GateEvidenceError("低保真清理不得删除 P0 结构节点或场景实例")
            if item.get("targetPath") in protected_paths:
                raise GateEvidenceError("低保真清理不得删除 P0 Prefab 或审计证据")

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """在项目根目录内读取已完成哈希校验的契约引用。"""
        raw_path = reference.get("path")
        if not isinstance(raw_path, str):
            raise GateEvidenceError("契约引用缺少路径")
        return _load_document(_resolve_within(self.root, Path(raw_path)))


def _prefab_structure_snapshot(prefabs_value: object) -> tuple[dict[object, object], dict[tuple[object, object], object]]:
    """提取 P0 中必须被最终拼装原样保留的 Prefab 与节点结构。"""
    prefabs: dict[object, object] = {}
    nodes: dict[tuple[object, object], object] = {}
    for prefab in prefabs_value if isinstance(prefabs_value, list) else []:
        if not isinstance(prefab, Mapping):
            continue
        prefab_id = prefab.get("id")
        prefabs[prefab_id] = prefab.get("path")
        for node in prefab.get("nodes", []):
            if not isinstance(node, Mapping):
                continue
            nodes[(prefab_id, node.get("id"))] = _node_structure_snapshot(node)
    return prefabs, nodes


def _prefab_assembly_snapshot(prefabs_value: object) -> tuple[dict[object, object], dict[tuple[object, object], object]]:
    """提取最终拼装的 Prefab 与节点结构用于和 P0 做精确比较。"""
    return _prefab_structure_snapshot(prefabs_value)


def _node_structure_snapshot(node: Mapping[str, Any]) -> dict[str, object]:
    """保留节点所属层级与 Transform，忽略资源和运行时组件等后续填充字段。"""
    return {
        "parentId": node.get("parentId"),
        "position": node.get("position"),
        "rotation": node.get("rotation"),
        "scale": node.get("scale"),
    }


def _prefab_instance_snapshot(instances_value: object) -> dict[object, object]:
    """提取场景实例身份、父子关系和 Transform，确保装配未偏离 P0。"""
    instances: dict[object, object] = {}
    for instance in instances_value if isinstance(instances_value, list) else []:
        if not isinstance(instance, Mapping):
            continue
        instances[instance.get("id")] = {
            "prefabId": instance.get("prefabId"),
            "parentId": instance.get("parentId"),
            "position": instance.get("position"),
            "rotation": instance.get("rotation"),
            "scale": instance.get("scale"),
        }
    return instances


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
