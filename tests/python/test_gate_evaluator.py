from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
import yaml

from unity_workflow.gate_evaluator import GateEvidenceError, _EvidenceVerifier, evaluate_gate


ROOT = Path(__file__).parents[2] / "unity-development-workflow"


def _sha256(path: Path) -> str:
    """计算测试证据文件哈希。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_yaml(path: Path, payload: dict[str, object]) -> None:
    """以稳定 UTF-8 YAML 写入测试契约。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _visual_bible_evidence(project: Path) -> dict[str, object]:
    """创建经过三类独立审查和用户批准的最小全局视觉证据链。"""
    approval_log = project / "Artifacts" / "Approvals" / "visual.txt"
    approval_log.parent.mkdir(parents=True, exist_ok=True)
    approval_log.write_text("用户与独立审查者确认 visual-v1\n", encoding="utf-8")
    approval_hash = _sha256(approval_log)

    candidates: list[dict[str, object]] = []
    for index in (1, 2):
        path = project / "Artifacts" / "Visual" / f"direction-{index}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(f"direction-{index}".encode())
        candidates.append(
            {
                "type": "generated-image",
                "path": f"Artifacts/Visual/direction-{index}.png",
                "sha256": _sha256(path),
                "subjectId": "starfall-arena",
                "subjectVersion": "visual-v1",
            }
        )

    reviews: list[dict[str, object]] = []
    for index, discipline in enumerate(
        ("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"),
        start=1,
    ):
        reviews.append(
            {
                "approvalType": "VISUAL_BASELINE",
                "authority": "INDEPENDENT_REVIEWER",
                "subjectId": "starfall-arena",
                "subjectVersion": "visual-v1",
                "approvedBy": f"reviewer-{index}",
                "approvedAtUtc": "2026-07-27T12:00:00Z",
                "evidencePath": "Artifacts/Approvals/visual.txt",
                "evidenceSha256": approval_hash,
                "reviewTaskId": f"review.global.{index}",
                "reviewDiscipline": discipline,
            }
        )
    user_approval = {
        "approvalType": "VISUAL_BASELINE",
        "authority": "USER",
        "subjectId": "starfall-arena",
        "subjectVersion": "visual-v1",
        "approvedBy": "visual-owner",
        "approvedAtUtc": "2026-07-27T12:00:00Z",
        "evidencePath": "Artifacts/Approvals/visual.txt",
        "evidenceSha256": approval_hash,
    }

    visual_review = {
        "schemaVersion": "1.0",
        "id": "review.global.visual-v1",
        "projectId": "starfall-arena",
        "subjectType": "VISUAL_BASELINE",
        "subjectId": "starfall-arena",
        "subjectVersion": "visual-v1",
        "round": 1,
        "candidateEvidence": [candidates[0]],
        "reviews": reviews,
        "consolidatedChanges": [],
        "userDecision": "APPROVED",
        "userApproval": user_approval,
        "status": "APPROVED",
    }
    review_path = project / "Artifacts" / "Visual" / "review.yaml"
    _write_yaml(review_path, visual_review)
    review_evidence = {
        "type": "visual-review",
        "path": "Artifacts/Visual/review.yaml",
        "sha256": _sha256(review_path),
        "subjectId": "starfall-arena",
        "subjectVersion": "visual-v1",
    }

    bible = yaml.safe_load((ROOT / "templates" / "visual-bible.yaml").read_text(encoding="utf-8"))
    bible.update(
        {
            "status": "APPROVED",
            "directionCandidates": candidates,
            "selectedDirection": candidates[0],
            "finalVisualReview": review_evidence,
            "reviews": reviews,
            "approval": user_approval,
        }
    )
    bible_path = project / "Artifacts" / "Visual" / "visual-bible.yaml"
    _write_yaml(bible_path, bible)
    return {
        "type": "visual-bible",
        "path": "Artifacts/Visual/visual-bible.yaml",
        "sha256": _sha256(bible_path),
        "subjectId": "starfall-arena",
        "subjectVersion": "visual-v1",
    }


def _gate_fixture(project: Path) -> tuple[Path, Path, Path]:
    """创建包含一份真实质量报告的 G0 求值夹具。"""
    log = project / "Artifacts" / "Logs" / "compile.txt"
    log.parent.mkdir(parents=True)
    log.write_text("compile clean\n", encoding="utf-8")
    raw_evidence = {"type": "compile-log", "path": "Artifacts/Logs/compile.txt", "sha256": _sha256(log)}
    report = {
        "schemaVersion": "1.0",
        "taskId": "qa.g0",
        "projectId": "starfall-arena",
        "sourceRevision": "revision-001",
        "buildVersion": "0.1.0-dev.1",
        "generatedAtUtc": "2026-07-27T12:00:00Z",
        "checks": [{"id": "compile.clean", "category": "compile", "status": "PASS", "message": "编译通过", "evidence": [raw_evidence]}],
        "status": "PASS",
        "evidence": [raw_evidence],
    }
    report_path = project / "Artifacts" / "Quality" / "g0.yaml"
    _write_yaml(report_path, report)
    report_evidence = {
        "type": "quality-report",
        "path": "Artifacts/Quality/g0.yaml",
        "sha256": _sha256(report_path),
        "subjectId": "qa.g0",
        "sourceRevision": "revision-001",
        "buildVersion": "0.1.0-dev.1",
    }
    approval_log = project / "Artifacts" / "Approvals" / "decomposition.txt"
    approval_log.parent.mkdir(parents=True)
    approval_log.write_text("用户确认模块与场景拆分 decomposition-v1\n", encoding="utf-8")
    decomposition = yaml.safe_load(
        (ROOT / "templates" / "decomposition-plan.yaml").read_text(encoding="utf-8")
    )
    decomposition["sourceRevision"] = "revision-001"
    decomposition["status"] = "APPROVED"
    decomposition["decision"].update(
        {
            "outcome": "APPROVE_SPLIT",
            "approvedModuleIds": ["Foundation.Core", "Gameplay.Player"],
            "approvedSceneIds": ["scene.arena-intro", "scene.arena-battle"],
            "userApproval": {
                "approvalType": "DECOMPOSITION",
                "authority": "USER",
                "subjectId": decomposition["id"],
                "subjectVersion": decomposition["version"],
                "approvedBy": "scope-owner",
                "approvedAtUtc": "2026-07-27T12:00:00Z",
                "evidencePath": "Artifacts/Approvals/decomposition.txt",
                "evidenceSha256": _sha256(approval_log),
            },
        }
    )
    decomposition["recoveryExit"]["resumeAt"] = "CONTINUE_TO_S00"
    decomposition_path = project / "Artifacts" / "Planning" / "decomposition.yaml"
    _write_yaml(decomposition_path, decomposition)
    decomposition_evidence = {
        "type": "decomposition-plan",
        "path": "Artifacts/Planning/decomposition.yaml",
        "sha256": _sha256(decomposition_path),
        "subjectId": decomposition["id"],
        "subjectVersion": decomposition["version"],
    }
    gates = yaml.safe_load((ROOT / "templates" / "quality-gates.yaml").read_text(encoding="utf-8"))
    gates["sourceRevision"] = "revision-001"
    gates["activeDecomposition"] = dict(decomposition_evidence)
    gates["activeDecomposition"]["sourceRevision"] = "revision-001"
    gates["activeDecomposition"]["projectStateVersion"] = decomposition["projectStateVersion"]
    visual_bible_evidence = _visual_bible_evidence(project)
    gate = gates["gates"][0]
    gate["status"] = "WAITING_APPROVAL"
    gate["evidence"] = [report_evidence]
    gate["checkResults"] = [
        {
            "id": check_id,
            "status": "PASS",
            "evidence": [
                decomposition_evidence
                if check_id == "decomposition.approved"
                else visual_bible_evidence
                if check_id == "visual-bible.approved"
                else report_evidence
            ],
        }
        for check_id in gate["requiredChecks"]
    ]
    config = project / "Artifacts" / "Gates" / "quality-gates.yaml"
    output = project / "Artifacts" / "Gates" / "evaluated.yaml"
    _write_yaml(config, gates)
    return config, output, log


def test_gate_evaluate_deeply_validates_and_passes(tmp_path: Path) -> None:
    """门禁仅在嵌套文件、Schema、身份、版本和哈希全部有效时通过。"""
    config, output, _ = _gate_fixture(tmp_path)

    result = evaluate_gate(config, "G0", tmp_path, "starfall-arena", "revision-001", "0.1.0-dev.1", output)

    assert result["status"] == "PASS"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    assert evaluated["gates"][0]["status"] == "PASS"


def test_gate_evaluate_rejects_tampered_nested_evidence(tmp_path: Path) -> None:
    """顶层报告未变化但内部日志被篡改时，门禁必须失败并保留原因。"""
    config, output, log = _gate_fixture(tmp_path)
    log.write_text("tampered\n", encoding="utf-8")

    result = evaluate_gate(config, "G0", tmp_path, "starfall-arena", "revision-001", "0.1.0-dev.1", output)

    assert result["status"] == "FAIL"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    assert any("哈希不匹配" in item.get("failureReason", "") for item in evaluated["gates"][0]["checkResults"])


def test_g0_rejects_non_decomposition_evidence_for_split_approval(tmp_path: Path) -> None:
    """G0 的拆分批准检查不能用普通质量报告冒充用户确认。"""
    config, output, _ = _gate_fixture(tmp_path)
    payload = yaml.safe_load(config.read_text(encoding="utf-8"))
    gate = payload["gates"][0]
    report_evidence = gate["checkResults"][0]["evidence"][0]
    for check in gate["checkResults"]:
        if check["id"] == "decomposition.approved":
            check["evidence"] = [report_evidence]
    _write_yaml(config, payload)

    result = evaluate_gate(
        config,
        "G0",
        tmp_path,
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        output,
    )

    assert result["status"] == "FAIL"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    check = next(item for item in evaluated["gates"][0]["checkResults"] if item["id"] == "decomposition.approved")
    assert "必须包含 decomposition-plan" in check["failureReason"]


def test_g0_rejects_non_visual_bible_evidence_for_global_visual_approval(tmp_path: Path) -> None:
    """G0 的全局视觉检查不能用普通质量报告代替已批准 Visual Bible。"""
    config, output, _ = _gate_fixture(tmp_path)
    payload = yaml.safe_load(config.read_text(encoding="utf-8"))
    gate = payload["gates"][0]
    report_evidence = next(
        check["evidence"][0]
        for check in gate["checkResults"]
        if check["id"] == "scope.approved"
    )
    next(
        check for check in gate["checkResults"] if check["id"] == "visual-bible.approved"
    )["evidence"] = [report_evidence]
    _write_yaml(config, payload)

    result = evaluate_gate(
        config,
        "G0",
        tmp_path,
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        output,
    )

    assert result["status"] == "FAIL"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    check = next(
        item
        for item in evaluated["gates"][0]["checkResults"]
        if item["id"] == "visual-bible.approved"
    )
    assert "必须包含 visual-bible" in check["failureReason"]


def test_gate_rejects_active_decomposition_that_is_waiting_for_user(tmp_path: Path) -> None:
    """当前拆分切到待用户确认后，旧 G0 证据必须立即失效。"""
    config, output, _ = _gate_fixture(tmp_path)
    payload = yaml.safe_load(config.read_text(encoding="utf-8"))
    active = payload["activeDecomposition"]
    decomposition_path = tmp_path / active["path"]
    decomposition = yaml.safe_load(decomposition_path.read_text(encoding="utf-8"))
    decomposition["status"] = "AWAITING_USER"
    decomposition["decision"]["outcome"] = "CHANGES_REQUIRED"
    decomposition["decision"]["approvedModuleIds"] = []
    decomposition["decision"]["approvedSceneIds"] = []
    decomposition["recoveryExit"]["resumeAt"] = "WAIT_FOR_USER"
    _write_yaml(decomposition_path, decomposition)
    active["sha256"] = _sha256(decomposition_path)
    _write_yaml(config, payload)

    result = evaluate_gate(
        config,
        "G0",
        tmp_path,
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        output,
    )

    assert result["status"] == "FAIL"
    evaluated = yaml.safe_load(output.read_text(encoding="utf-8"))
    assert "状态未通过" in evaluated["gates"][0]["checkResults"][0]["failureReason"]


def test_scene_2d_adaptation_deeply_verifies_all_runtime_evidence(tmp_path: Path) -> None:
    """VERIFIED 2D 契约必须复核 Unity、EditMode 和逐分辨率运行截图文件。"""
    config, _, _ = _gate_fixture(tmp_path)
    gate_config = yaml.safe_load(config.read_text(encoding="utf-8"))
    verifier = _EvidenceVerifier(
        tmp_path.resolve(),
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        "G2",
        gate_config["projectStateVersion"],
        gate_config["activeDecomposition"],
    )

    payload = yaml.safe_load(
        (ROOT / "templates" / "scene-2d-adaptation.yaml").read_text(encoding="utf-8")
    )
    payload["sourceRevision"] = "revision-001"
    payload["status"] = "VERIFIED"
    for resolution in payload["testResolutions"]:
        resolution["status"] = "PASS"

    config_file = tmp_path / "Artifacts" / "2D" / "unity-config.json"
    edit_file = tmp_path / "Artifacts" / "2D" / "editmode.xml"
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.write_text("{\"valid\":true}\n", encoding="utf-8")
    edit_file.write_text("<tests passed=\"5\"/>\n", encoding="utf-8")
    common_binding = {
        "sceneId": payload["sceneId"],
        "sceneVersion": payload["sceneVersion"],
        "sourceRevision": payload["sourceRevision"],
        "projectStateVersion": payload["projectStateVersion"],
    }
    payload["verification"]["unityConfiguration"] = {
        "status": "PASS",
        "evidence": [
            {
                "type": "unity-2d-adaptation-config",
                "path": "Artifacts/2D/unity-config.json",
                "sha256": _sha256(config_file),
                **common_binding,
                "unityVersion": "6000.0.0f1",
                "componentPath": "SceneRoot/Adaptive2DViewport",
            }
        ],
    }
    payload["verification"]["editMode"] = {
        "status": "PASS",
        "evidence": [
            {
                "type": "unity-editmode-test-report",
                "path": "Artifacts/2D/editmode.xml",
                "sha256": _sha256(edit_file),
                **common_binding,
                "testSuite": "Scene2DAdaptationTests",
                "totalTests": 5,
                "passedTests": 5,
                "failedTests": 0,
            }
        ],
    }
    runtime_evidence: list[dict[str, object]] = []
    for resolution in payload["testResolutions"]:
        screenshot = tmp_path / "Artifacts" / "2D" / f"{resolution['id']}.png"
        screenshot.write_bytes(str(resolution["id"]).encode())
        runtime_evidence.append(
            {
                "type": "runtime-2d-adaptation-screenshot",
                "path": f"Artifacts/2D/{resolution['id']}.png",
                "sha256": _sha256(screenshot),
                **common_binding,
                "resolutionId": resolution["id"],
                "width": resolution["width"],
                "height": resolution["height"],
                "buildVersion": "0.1.0-dev.1",
                "blackBarsStatus": "PASS",
                "bandVisibilityStatus": "PASS",
                "interactionSafetyStatus": "PASS",
            }
        )
    payload["verification"]["runtimeScreenshots"] = {
        "status": "PASS",
        "evidence": runtime_evidence,
    }

    adaptation_path = tmp_path / "Artifacts" / "2D" / "adaptation.yaml"
    _write_yaml(adaptation_path, payload)
    reference = {
        "type": "scene-2d-adaptation",
        "path": "Artifacts/2D/adaptation.yaml",
        "sha256": _sha256(adaptation_path),
        "subjectId": payload["sceneId"],
        "subjectVersion": payload["sceneVersion"],
        "sourceRevision": payload["sourceRevision"],
        "projectStateVersion": payload["projectStateVersion"],
    }

    verifier.verify_reference(reference)
    first_screenshot = tmp_path / runtime_evidence[0]["path"]
    first_screenshot.write_bytes(b"tampered")
    verifier._verified.clear()
    with pytest.raises(GateEvidenceError, match="哈希不匹配"):
        verifier.verify_reference(reference)


def test_split_plan_source_must_exist_in_referenced_generation_candidates(tmp_path: Path) -> None:
    """拆分源必须与所引 image-generation 中的真实候选路径、哈希和版本一致。"""
    config, _, _ = _gate_fixture(tmp_path)
    gate_config = yaml.safe_load(config.read_text(encoding="utf-8"))
    verifier = _EvidenceVerifier(
        tmp_path.resolve(),
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        "G2",
        gate_config["projectStateVersion"],
        gate_config["activeDecomposition"],
    )
    bible_evidence = _visual_bible_evidence(tmp_path)
    candidate_file = tmp_path / "Artifacts" / "Visual" / "asset-source.png"
    candidate_file.write_bytes(b"regenerated asset source")
    candidate = {
        "id": "candidate.asset-source.v1",
        "path": "Artifacts/Visual/asset-source.png",
        "sha256": _sha256(candidate_file),
        "visualVersion": "visual-v1",
        "width": 1024,
        "height": 1024,
    }
    generation = yaml.safe_load(
        (ROOT / "templates" / "image-generation.yaml").read_text(encoding="utf-8")
    )
    generation.update(
        {
            "id": "imagegen.asset-source.v1",
            "projectId": "starfall-arena",
            "sceneId": "scene.arena-intro",
            "visualType": "ASSET_SOURCE",
            "generationMode": "RUNTIME_ASSET_SOURCE",
            "subjectVersion": "visual-v1",
            "visualBibleVersion": "visual-v1",
            "visualBibleEvidence": bible_evidence,
            "styleAuthority": "APPROVED_VISUAL_BIBLE",
            "references": [],
            "output": {
                "directory": "Artifacts/Visual",
                "format": "PNG",
                "width": 1024,
                "height": 1024,
                "candidateCount": 1,
            },
            "candidates": [candidate],
            "status": "GENERATED",
            "provider": "test-provider",
            "model": "test-model",
            "generatedAtUtc": "2026-07-27T12:00:00Z",
        }
    )
    generation_path = tmp_path / "Artifacts" / "Visual" / "generation.yaml"
    _write_yaml(generation_path, generation)
    regeneration = {
        "type": "image-generation",
        "path": "Artifacts/Visual/generation.yaml",
        "sha256": _sha256(generation_path),
        "subjectId": generation["id"],
        "subjectVersion": generation["subjectVersion"],
        "candidateId": candidate["id"],
        "candidatePath": candidate["path"],
        "candidateSha256": candidate["sha256"],
        "candidateVisualVersion": candidate["visualVersion"],
    }

    verifier._verify_split_plan_source({"regenerationEvidence": regeneration})
    regeneration["candidateSha256"] = "f" * 64
    with pytest.raises(GateEvidenceError, match="路径、哈希或视觉版本不匹配"):
        verifier._verify_split_plan_source({"regenerationEvidence": regeneration})


def test_cached_contract_still_rechecks_each_reference_identity(tmp_path: Path) -> None:
    """同一文件命中缓存后仍必须拒绝错误主体或版本引用。"""
    config, _, _ = _gate_fixture(tmp_path)
    gate_config = yaml.safe_load(config.read_text(encoding="utf-8"))
    verifier = _EvidenceVerifier(
        tmp_path.resolve(),
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        "G0",
        gate_config["projectStateVersion"],
        gate_config["activeDecomposition"],
    )
    verifier.verify_active_decomposition()
    wrong_reference = dict(gate_config["activeDecomposition"])
    wrong_reference["subjectVersion"] = "stale-decomposition"

    with pytest.raises(GateEvidenceError, match="subjectVersion 不匹配"):
        verifier.verify_reference(wrong_reference)


def test_scene_manifest_identity_uses_manifest_id() -> None:
    """scene-manifest 引用主体必须绑定 Schema 中的 id，而不是不存在的 sceneId。"""
    verifier = _EvidenceVerifier(
        Path.cwd(),
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        "G2",
        "project-state-v1",
        {},
    )
    verifier._verify_identity(
        "scene-manifest",
        {"projectId": "starfall-arena", "id": "scene.main", "version": "scene-v1"},
        {"subjectId": "scene.main", "subjectVersion": "scene-v1"},
    )


def test_2d_gate_check_requires_every_approved_scene_manifest(tmp_path: Path) -> None:
    """G2 的 2D 检查不能用单个 3D 场景掩盖未提供的批准场景。"""
    config, _, _ = _gate_fixture(tmp_path)
    gate_config = yaml.safe_load(config.read_text(encoding="utf-8"))
    verifier = _EvidenceVerifier(
        tmp_path.resolve(),
        "starfall-arena",
        "revision-001",
        "0.1.0-dev.1",
        "G2",
        gate_config["projectStateVersion"],
        gate_config["activeDecomposition"],
    )
    intro_path = tmp_path / "Artifacts" / "Scenes" / "intro.yaml"
    battle_path = tmp_path / "Artifacts" / "Scenes" / "battle.yaml"
    _write_yaml(intro_path, {"id": "scene.arena-intro", "dimension": "3D"})
    _write_yaml(battle_path, {"id": "scene.arena-battle", "dimension": "2D"})
    intro_reference = {
        "type": "scene-manifest",
        "path": "Artifacts/Scenes/intro.yaml",
        "sha256": _sha256(intro_path),
    }
    battle_reference = {
        "type": "scene-manifest",
        "path": "Artifacts/Scenes/battle.yaml",
        "sha256": _sha256(battle_path),
    }

    with pytest.raises(GateEvidenceError, match="缺少已批准场景"):
        verifier.verify_check_coverage(
            "scenes.2d-adaptation-verified",
            [intro_reference],
        )
    verifier.verify_check_coverage(
        "scenes.2d-adaptation-verified",
        [intro_reference, battle_reference],
    )
