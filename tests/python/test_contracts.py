from pathlib import Path
import re

import pytest
import yaml

from unity_workflow.contracts import (
    _is_rfc3339_date_time,
    load_yaml,
    validate_decomposition_freshness,
    validate_contract,
)


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"

TEMPLATE_CONTRACTS = (
    ("project-profile", "project-profile.yaml"),
    ("module-manifest", "module-manifest.yaml"),
    ("decomposition-plan", "decomposition-plan.yaml"),
    ("grilling-record", "grilling-record.yaml"),
    ("task-contract", "task-contract.yaml"),
    ("scene-manifest", "scene-manifest.yaml"),
    ("prefab-structure", "prefab-structure.yaml"),
    ("prefab-assembly", "prefab-assembly.yaml"),
    ("image-task", "image-task.yaml"),
    ("visual-bible", "visual-bible.yaml"),
    ("quality-gates", "quality-gates.yaml"),
    ("asset-register", "project-docs/asset-register.yaml"),
    ("delivery-manifest", "delivery-manifest.yaml"),
    ("visual-capture", "visual-capture.yaml"),
    ("delivery-preflight", "delivery-preflight.yaml"),
    ("runtime-visual-evidence", "runtime-visual-evidence.yaml"),
    ("s00-report", "s00-report.yaml"),
    ("scene-report", "scene-report.yaml"),
    ("visual-review", "visual-review.yaml"),
    ("split-plan", "split-plan.yaml"),
    ("image-generation", "image-generation.yaml"),
    ("image-generation", "image-generation-item.yaml"),
    ("quality-report", "quality-report.yaml"),
    ("quality-report", "quality-report-windows-development.yaml"),
    ("registration-record", "registration-record.json"),
    ("scene-2d-adaptation", "scene-2d-adaptation.yaml"),
)


@pytest.mark.parametrize(("kind", "filename"), TEMPLATE_CONTRACTS)
def test_template_matches_schema(kind: str, filename: str) -> None:
    """每份模板都必须是可直接校验的完整契约。"""
    payload = load_yaml(TEMPLATES / filename)
    assert validate_contract(kind, payload) == []


def test_task_rejects_missing_write_scope() -> None:
    """任务缺少 scope 时，错误必须稳定定位到该字段。"""
    payload = {"id": "gameplay.player", "module": "Gameplay.Player"}
    issues = validate_contract("task-contract", payload)
    assert any(issue.path == "$.scope" for issue in issues)


def test_task_requires_unity_instance_only_for_l2() -> None:
    """仅 Unity/共享状态写入任务必须绑定实例，离线任务不得携带实例。"""
    payload = load_yaml(TEMPLATES / "task-contract.yaml")
    payload["execution"].pop("unityInstance")
    assert any(
        issue.path == "$.execution.unityInstance"
        for issue in validate_contract("task-contract", payload)
    )

    payload["execution"]["executionLevel"] = "L1"
    assert validate_contract("task-contract", payload) == []

    payload["execution"]["unityInstance"] = "StarfallArena@editor-01"
    assert validate_contract("task-contract", payload)


def test_unknown_contract_kind_is_rejected() -> None:
    """未知契约类型不能静默跳过校验。"""
    with pytest.raises(ValueError, match="未知契约类型"):
        validate_contract("unknown", {})


def test_load_yaml_rejects_top_level_list(tmp_path: Path) -> None:
    """YAML 顶层必须是映射，避免后续接口类型不稳定。"""
    source = tmp_path / "list.yaml"
    source.write_text("- first\n- second\n", encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape(str(source))):
        load_yaml(source)


def test_load_yaml_preserves_parse_error_cause_and_path(tmp_path: Path) -> None:
    """解析失败必须带来源路径，并保留 PyYAML 原始异常。"""
    source = tmp_path / "broken.yaml"
    source.write_text("field: [\n", encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape(str(source))) as raised:
        load_yaml(source)
    assert isinstance(raised.value.__cause__, yaml.YAMLError)


def test_load_yaml_parses_supplied_byte_snapshot_instead_of_rereading(tmp_path: Path) -> None:
    """提供源字节时必须解析该快照，避免再次读取已变化的文件。"""
    source = tmp_path / "contract.yaml"
    source.write_text("value: changed\n", encoding="utf-8")

    payload = load_yaml(source, source_bytes="value: 原始快照\n".encode())

    assert payload == {"value": "原始快照"}


@pytest.mark.parametrize(
    "invalid_path",
    ("", "/Assets/file.txt", "C:/Assets/file.txt", "Assets\\file.txt", "Assets/../file.txt"),
)
def test_delivery_rejects_invalid_project_relative_path(invalid_path: str) -> None:
    """交付物路径必须是安全、正斜杠形式的项目相对路径。"""
    payload = {
        "schemaVersion": "1.0",
        "version": "1.0.0",
        "sourceRevision": "abc123",
        "buildProfile": "Assets/Settings/Windows.asset",
        "platform": "WINDOWS",
        "distributionChannel": "本地交付",
        "generatedAtUtc": "2026-07-12T12:00:00Z",
        "buildResult": {
            "status": "PASS",
            "evidencePath": "Artifacts/build.json",
        },
        "artifacts": [
            {
                "path": invalid_path,
                "sha256": "a" * 64,
                "sizeBytes": 1,
            }
        ],
        "launchCheck": {
            "status": "PASS",
            "evidencePath": "Artifacts/launch.json",
        },
        "qualityReportPaths": ["Artifacts/quality-report.json"],
        "licensesPath": "docs/asset-register.yaml",
        "privacyReviewPath": "docs/privacy-review.md",
        "releaseNotesPath": "Artifacts/release-notes.md",
        "knownIssues": [],
        "rollback": "恢复上一稳定候选包",
        "authorization": {
            "approvedBy": "release-owner",
            "approvedAtUtc": "2026-07-12T12:00:00Z",
            "allowedActions": ["LOCAL_DELIVERY"],
        },
    }
    issues = validate_contract("delivery-manifest", payload)
    assert any(issue.path == "$.artifacts[0].path" for issue in issues)


def test_validation_issues_are_sorted_by_path_and_message() -> None:
    """错误按路径和消息排序，保证 CLI 与测试输出确定。"""
    issues = validate_contract("task-contract", {})
    assert issues == sorted(issues, key=lambda issue: (issue.path, issue.message))


def test_module_manifest_rejects_duplicate_module_ids() -> None:
    """JSON Schema 无法表达的模块 ID 唯一性由语义校验保障。"""
    module = {
        "id": "Gameplay.Player",
        "category": "Gameplay",
        "owns": ["Assets/Scripts/Gameplay/Player"],
        "dependsOn": [],
        "publicInterfaces": ["IPlayerController"],
    }
    payload = {"schemaVersion": "1.0", "modules": [module, dict(module)]}
    issues = validate_contract("module-manifest", payload)
    assert any(issue.path == "$.modules[1].id" and "重复" in issue.message for issue in issues)


def test_module_manifest_rejects_unknown_cycle_and_overlapping_ownership() -> None:
    """模块依赖和所有权必须支持确定性并行调度。"""
    payload = {
        "schemaVersion": "1.0",
        "modules": [
            {
                "id": "Gameplay.A",
                "category": "Gameplay",
                "owns": ["Assets/Scripts/Gameplay"],
                "dependsOn": ["Gameplay.B", "Missing.Module"],
                "publicInterfaces": [],
            },
            {
                "id": "Gameplay.B",
                "category": "Gameplay",
                "owns": ["Assets/Scripts/Gameplay/Player"],
                "dependsOn": ["Gameplay.A"],
                "publicInterfaces": [],
            },
        ],
    }

    issues = validate_contract("module-manifest", payload)

    assert any("未知依赖" in issue.message for issue in issues)
    assert any("依赖存在环" in issue.message for issue in issues)
    assert any("路径所有权" in issue.message for issue in issues)


def test_decomposition_plan_requires_all_interrogation_questions() -> None:
    """拆分前必须逐项回答完整拷问清单，不能通过删题绕过确认。"""
    payload = load_yaml(TEMPLATES / "decomposition-plan.yaml")
    payload["interrogation"].pop()

    issues = validate_contract("decomposition-plan", payload)

    assert any("缺少拆分拷问" in issue.message for issue in issues)


def test_decomposition_plan_rejects_invalid_boundaries_and_shared_promotion() -> None:
    """未知依赖、重叠所有权与单场景共享上移必须在用户确认前暴露。"""
    payload = load_yaml(TEMPLATES / "decomposition-plan.yaml")
    payload["proposedModules"][1]["owns"] = ["Assets/Scripts/Foundation/Player"]
    payload["proposedScenes"][1]["moduleDependencies"] = ["Missing.Module"]
    payload["sharedCapabilities"][0]["consumerScenes"] = ["scene.arena-intro"]

    issues = validate_contract("decomposition-plan", payload)

    assert any("路径所有权" in issue.message for issue in issues)
    assert any("未知模块" in issue.message for issue in issues)
    assert any("至少两个场景消费者" in issue.message for issue in issues)


def test_decomposition_plan_rejects_scene_ownership_overlap() -> None:
    """候选场景不得与其他场景或模块拥有相同及父子路径。"""
    payload = load_yaml(TEMPLATES / "decomposition-plan.yaml")
    payload["proposedScenes"][0]["owns"] = ["Assets/Scripts/Foundation/SceneGlue"]
    payload["proposedScenes"][1]["owns"] = ["Assets/Scripts/Foundation/SceneGlue/Child"]

    issues = validate_contract("decomposition-plan", payload)

    messages = [issue.message for issue in issues if issue.path.endswith(".owns")]
    assert any("与模块 Foundation.Core 重叠" in message for message in messages)
    assert any("与 scene.arena-intro 重叠" in message for message in messages)


def test_approved_decomposition_requires_bound_user_confirmation_and_exact_sets() -> None:
    """只有用户确认且批准集合与 SPLIT 候选完全一致时才能进入 S00。"""
    payload = load_yaml(TEMPLATES / "decomposition-plan.yaml")
    payload["status"] = "APPROVED"
    payload["decision"].update(
        {
            "outcome": "APPROVE_SPLIT",
            "approvedModuleIds": ["Foundation.Core"],
            "approvedSceneIds": ["scene.arena-intro", "scene.arena-battle"],
            "userApproval": _approval(
                "DECOMPOSITION",
                "USER",
                payload["id"],
                payload["version"],
                reviewer="scope-owner",
            ),
        }
    )
    payload["recoveryExit"]["resumeAt"] = "CONTINUE_TO_S00"

    issues = validate_contract("decomposition-plan", payload)

    assert any(issue.path == "$.decision.approvedModuleIds" for issue in issues)
    payload["decision"]["approvedModuleIds"] = ["Foundation.Core", "Gameplay.Player"]
    assert validate_contract("decomposition-plan", payload) == []


def test_unapproved_decomposition_cannot_continue_to_s00() -> None:
    """等待确认、阻断或拒绝状态都不能声明继续进入 S00。"""
    payload = load_yaml(TEMPLATES / "decomposition-plan.yaml")
    payload["recoveryExit"]["resumeAt"] = "CONTINUE_TO_S00"

    issues = validate_contract("decomposition-plan", payload)

    assert any(issue.path == "$.recoveryExit.resumeAt" for issue in issues)


def test_new_awaiting_decomposition_invalidates_old_downstream_binding() -> None:
    """项目切换到新待确认拆分版本后，旧模块、场景和 S00 引用必须失效。"""
    profile = load_yaml(TEMPLATES / "project-profile.yaml")
    profile["workflow"]["decomposition"]["status"] = "APPROVED"
    artifacts = [
        load_yaml(TEMPLATES / "module-manifest.yaml"),
        load_yaml(TEMPLATES / "scene-manifest.yaml"),
        load_yaml(TEMPLATES / "s00-report.yaml"),
    ]
    for artifact in artifacts:
        assert validate_decomposition_freshness(profile, artifact) == []

    profile["workflow"].update(
        {
            "sourceRevision": "working-tree-snapshot-20260728",
            "projectStateVersion": "project-state-v2",
            "decomposition": {
                "id": "decomposition.starfall-arena.v2",
                "version": "decomposition-v2",
                "status": "AWAITING_USER",
            },
        }
    )

    for artifact in artifacts:
        issues = validate_decomposition_freshness(profile, artifact)
        paths = {issue.path for issue in issues}
        assert "$.decompositionPlan" in paths
        assert "$.decompositionPlan.subjectId" in paths
        assert "$.decompositionPlan.subjectVersion" in paths
        assert "$.decompositionPlan.sourceRevision" in paths
        assert "$.decompositionPlan.projectStateVersion" in paths


@pytest.mark.parametrize("filename", ("module-manifest.yaml", "scene-manifest.yaml", "s00-report.yaml"))
def test_downstream_decomposition_reference_must_match_own_revision(filename: str) -> None:
    """模块、场景和 S00 不得引用其他源码修订或项目状态版本的拆分批准。"""
    payload = load_yaml(TEMPLATES / filename)
    payload["decompositionPlan"]["sourceRevision"] = "stale-revision"
    payload["decompositionPlan"]["projectStateVersion"] = "stale-project-state"
    kind = {
        "module-manifest.yaml": "module-manifest",
        "scene-manifest.yaml": "scene-manifest",
        "s00-report.yaml": "s00-report",
    }[filename]

    issues = validate_contract(kind, payload)

    paths = {issue.path for issue in issues}
    assert "$.decompositionPlan.sourceRevision" in paths
    assert "$.decompositionPlan.projectStateVersion" in paths


def test_quality_gates_require_each_lifecycle_gate_once() -> None:
    """质量门配置必须恰好覆盖 G0 至 G3，不能用重复项凑满四行。"""
    payload = load_yaml(TEMPLATES / "quality-gates.yaml")
    payload["gates"][3]["id"] = "G2"

    issues = validate_contract("quality-gates", payload)

    assert any("质量门 ID 重复" in issue.message for issue in issues)
    assert any("缺少质量门: G3" in issue.message for issue in issues)


def test_asset_register_rejects_duplicate_runtime_identity() -> None:
    """不同资源 ID 不得复用同一路径、地址或 Unity GUID。"""
    base = {
        "type": "sprite",
        "purpose": "玩家图标",
        "source": "generated",
        "sourceVersion": "v1",
        "path": "Assets/Art/Runtime/icon.png",
        "address": "ui/icon",
        "status": "PLANNED",
        "licenseStatus": "PENDING",
        "unityValidation": "NOT_RUN",
        "approvals": [],
        "evidence": [],
    }
    payload = {
        "schemaVersion": "1.0",
        "assets": [{"id": "asset.icon-a", **base}, {"id": "asset.icon-b", **base}],
        "placeholders": [],
    }

    issues = validate_contract("asset-register", payload)

    assert any(issue.path == "$.assets[1].path" for issue in issues)
    assert any(issue.path == "$.assets[1].address" for issue in issues)


def test_quality_report_rejects_invalid_utc_timestamp() -> None:
    """时间字段必须符合 JSON Schema 的 date-time 格式。"""
    payload = {
        "schemaVersion": "1.0",
        "taskId": "qa.smoke-test",
        "generatedAtUtc": "not-a-time",
        "checks": [
            {
                "id": "compile.clean",
                "category": "compile",
                "status": "PASS",
                "message": "编译完成且无错误",
                "evidence": [],
            }
        ],
        "status": "PASS",
        "evidence": [],
    }
    issues = validate_contract("quality-report", payload)
    assert any(issue.path == "$.generatedAtUtc" for issue in issues)


@pytest.mark.parametrize(
    "timestamp",
    ("2026-07-12 12:00:00+00:00", "20260712T120000+0000"),
)
def test_quality_report_rejects_non_rfc3339_timestamp(timestamp: str) -> None:
    """date-time 必须拒绝 ISO 8601 中超出 RFC 3339 的宽松写法。"""
    payload = {
        "schemaVersion": "1.0",
        "taskId": "qa.smoke-test",
        "generatedAtUtc": timestamp,
        "checks": [
            {
                "id": "compile.clean",
                "category": "compile",
                "status": "PASS",
                "message": "编译完成且无错误",
                "evidence": [],
            }
        ],
        "status": "PASS",
        "evidence": [],
    }
    issues = validate_contract("quality-report", payload)
    assert any(issue.path == "$.generatedAtUtc" for issue in issues)


def test_quality_report_accepts_lowercase_rfc3339_utc_suffix() -> None:
    """RFC 3339 允许使用小写 z 表示 UTC。"""
    payload = {
        "schemaVersion": "1.0",
        "taskId": "qa.smoke-test",
        "projectId": "starfall-arena",
        "sourceRevision": "working-tree-snapshot-20260727",
        "projectStateVersion": "project-state-v1",
        "buildVersion": "0.1.0-dev.1",
        "generatedAtUtc": "2026-07-12T12:00:00z",
        "checks": [
            {
                "id": "compile.clean",
                "category": "compile",
                "status": "PASS",
                "message": "编译完成且无错误",
                "evidence": [_evidence("Artifacts/Quality/compile.json")],
            }
        ],
        "status": "PASS",
        "evidence": [_evidence("Artifacts/Quality/report.json")],
    }
    assert validate_contract("quality-report", payload) == []


def test_delivery_evidence_timestamps_require_actual_utc() -> None:
    """名称为 AtUtc 的交付证据不得使用非零时区偏移，避免 Schema 与 C# 预检分叉。"""
    quality = load_yaml(TEMPLATES / "quality-report.yaml")
    quality["generatedAtUtc"] = "2026-07-27T20:00:00+08:00"
    runtime = load_yaml(TEMPLATES / "runtime-visual-evidence.yaml")
    runtime["screenshot"]["capturedAtUtc"] = "2026-07-27T20:00:00+08:00"

    assert any(
        issue.path == "$.generatedAtUtc"
        for issue in validate_contract("quality-report", quality)
    )
    assert any(
        issue.path == "$.screenshot.capturedAtUtc"
        for issue in validate_contract("runtime-visual-evidence", runtime)
    )


def test_quality_report_cannot_pass_with_blocked_check() -> None:
    """存在阻塞检查时汇总结果不能标记为通过。"""
    payload = {
        "schemaVersion": "1.0",
        "taskId": "qa.windows-build",
        "generatedAtUtc": "2026-07-12T12:00:00Z",
        "checks": [
            {
                "id": "build.windows",
                "category": "build",
                "status": "BLOCKED",
                "message": "未安装 Unity",
                "evidence": [],
            }
        ],
        "status": "PASS",
        "evidence": [],
    }

    issues = validate_contract("quality-report", payload)

    assert any(issue.path == "$.checks[0].status" for issue in issues)


@pytest.mark.parametrize(
    "timestamp",
    (
        "2026-07-12 12:00:00+00:00",
        "20260712T120000+0000",
        "2026-07-12T12:34:60Z",
    ),
)
def test_rfc3339_fallback_rejects_unsupported_timestamp(timestamp: str) -> None:
    """回退检查器必须拒绝宽松 ISO 格式和首版不支持的闰秒。"""
    assert not _is_rfc3339_date_time(timestamp)


def test_rfc3339_fallback_accepts_lowercase_utc_suffix() -> None:
    """回退检查器必须保留 RFC 3339 对小写 z 的支持。"""
    assert _is_rfc3339_date_time("2026-07-12T12:00:00z")


def test_approved_image_requires_approval_record() -> None:
    """图片任务没有批准记录时不得进入 APPROVED。"""
    payload = load_yaml(TEMPLATES / "image-task.yaml")
    payload.pop("selectedCandidate")
    payload["status"] = "APPROVED"
    issues = validate_contract("image-task", payload)
    assert any(issue.path == "$.approvals" for issue in issues)
    assert any(issue.path == "$.selectedCandidate" for issue in issues)


def _approval(
    approval_type: str,
    authority: str,
    subject_id: str,
    subject_version: str,
    *,
    reviewer: str = "reviewer",
    discipline: str | None = None,
) -> dict[str, object]:
    """创建带主体、版本和证据哈希的批准记录测试夹具。"""
    approval: dict[str, object] = {
        "approvalType": approval_type,
        "authority": authority,
        "subjectId": subject_id,
        "subjectVersion": subject_version,
        "approvedBy": reviewer,
        "approvedAtUtc": "2026-07-27T12:00:00Z",
        "evidencePath": f"Artifacts/Approvals/{reviewer}.json",
        "evidenceSha256": "a" * 64,
    }
    if authority == "INDEPENDENT_REVIEWER":
        approval["reviewTaskId"] = f"review.{reviewer}"
        approval["reviewDiscipline"] = discipline or "QA"
    return approval


def _evidence(path: str = "Artifacts/Evidence/result.json") -> dict[str, str]:
    """创建具有真实哈希形状的机器证据测试夹具。"""
    return {"type": "test", "path": path, "sha256": "b" * 64}


def test_pass_quality_gate_requires_exact_passing_results_and_evidence() -> None:
    """质量门不能只把顶层状态改为 PASS 而省略检查结果。"""
    payload = load_yaml(TEMPLATES / "quality-gates.yaml")
    payload["gates"][0]["status"] = "PASS"
    payload["gates"][0]["evidence"] = [_evidence()]
    payload["gates"][0]["checkResults"] = [
        {
            "id": "scope.approved",
            "status": "PASS",
            "evidence": [_evidence("Artifacts/Evidence/scope.json")],
        }
    ]

    issues = validate_contract("quality-gates", payload)

    assert any(
        issue.path == "$.gates[0].checkResults" and "一一对应" in issue.message
        for issue in issues
    )


def test_pass_quality_gate_rejects_non_passing_required_check() -> None:
    """任一必需检查不是 PASS 时不得把质量门标记为 PASS。"""
    payload = load_yaml(TEMPLATES / "quality-gates.yaml")
    gate = payload["gates"][0]
    gate["status"] = "PASS"
    gate["evidence"] = [_evidence()]
    gate["checkResults"] = [
        {
            "id": check_id,
            "status": "FAIL" if index == 0 else "PASS",
            "failureReason": "范围尚未获批",
            "evidence": [] if index == 0 else [_evidence(f"Artifacts/Evidence/{index}.json")],
        }
        for index, check_id in enumerate(gate["requiredChecks"])
    ]

    issues = validate_contract("quality-gates", payload)

    assert any(issue.path.endswith("checkResults[0].status") for issue in issues)


def test_done_scene_requires_all_visual_approvals_and_runtime_evidence() -> None:
    """场景不能在缺少游戏、UI、实机审查和用户批准时冻结。"""
    payload = load_yaml(TEMPLATES / "scene-manifest.yaml")
    payload["status"] = "DONE"

    issues = validate_contract("scene-manifest", payload)

    paths = {issue.path for issue in issues}
    assert "$.approvals" in paths
    assert "$.qualityReportPaths" in paths
    assert "$.editorCapturePaths" in paths
    assert "$.evidence" in paths
    assert "$.frozenAtUtc" in paths


def test_done_scene_rejects_approval_from_old_scene_version() -> None:
    """旧场景版本的批准记录不得复用到新的冻结版本。"""
    payload = load_yaml(TEMPLATES / "scene-manifest.yaml")
    payload.update(
        {
            "status": "DONE",
            "frozenAtUtc": "2026-07-27T12:00:00Z",
            "qualityReportPaths": ["Artifacts/Quality/scene.json"],
            "editorCapturePaths": ["Artifacts/Visual/scene/editor.png"],
            "evidence": [_evidence()],
        }
    )
    payload["approvals"] = [
        _approval(approval_type, authority, payload["id"], "old-version", reviewer=f"r{index}")
        for index, (approval_type, authority) in enumerate(
            (
                ("GAME_VISUAL", "INDEPENDENT_REVIEWER"),
                ("GAME_VISUAL", "USER"),
                ("UI_VISUAL", "INDEPENDENT_REVIEWER"),
                ("UI_VISUAL", "USER"),
                ("IMPLEMENTATION_VISUAL", "INDEPENDENT_REVIEWER"),
                ("IMPLEMENTATION_VISUAL", "USER"),
            )
        )
    ]

    issues = validate_contract("scene-manifest", payload)

    assert any(issue.path.endswith(".subjectVersion") for issue in issues)


def test_approved_visual_bible_requires_three_independent_reviews_and_user_approval() -> None:
    """全局视觉基线不能跳过三类独立审查或用户批准。"""
    payload = load_yaml(TEMPLATES / "visual-bible.yaml")
    payload["status"] = "APPROVED"

    issues = validate_contract("visual-bible", payload)

    assert any(issue.path == "$.approval" for issue in issues)
    assert any(issue.path == "$.reviews" for issue in issues)


def test_approved_visual_bible_rejects_reused_reviewer_identity() -> None:
    """三类全局视觉审查必须来自不同任务和不同审查者。"""
    payload = load_yaml(TEMPLATES / "visual-bible.yaml")
    payload["status"] = "APPROVED"
    payload["approval"] = _approval(
        "VISUAL_BASELINE", "USER", payload["projectId"], payload["version"], reviewer="user"
    )
    payload["reviews"] = [
        _approval(
            "VISUAL_BASELINE",
            "INDEPENDENT_REVIEWER",
            payload["projectId"],
            payload["version"],
            reviewer="same-reviewer",
            discipline=discipline,
        )
        for discipline in ("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY")
    ]

    issues = validate_contract("visual-bible", payload)

    assert any("不同的审查任务" in issue.message for issue in issues)
    assert any("不同的审查者" in issue.message for issue in issues)


def test_delivery_candidate_requires_successful_build_launch_and_evidence() -> None:
    """未执行构建和启动检查的交付清单不能成为候选。"""
    payload = load_yaml(TEMPLATES / "delivery-manifest.yaml")
    payload["status"] = "CANDIDATE"

    issues = validate_contract("delivery-manifest", payload)

    paths = {issue.path for issue in issues}
    assert "$.buildResult.status" in paths
    assert "$.launchCheck.status" in paths
    assert "$.artifacts" in paths
    assert "$.qualityReportPaths" in paths
    assert "$.evidence" in paths


def test_release_approved_delivery_requires_user_authorization() -> None:
    """候选技术证据齐备仍不能替代用户的最终发布授权。"""
    payload = load_yaml(TEMPLATES / "delivery-manifest.yaml")
    payload.update(
        {
            "status": "RELEASE_APPROVED",
            "buildResult": {"status": "PASS", "evidence": _evidence("Artifacts/Delivery/build.json")},
            "launchCheck": {"status": "PASS", "evidence": _evidence("Artifacts/Delivery/launch.json")},
            "artifacts": [
                {"artifactType": "WINDOWS_EXECUTABLE", "path": "Artifacts/Delivery/game.exe", "sha256": "c" * 64, "sizeBytes": 1}
            ],
            "qualityReportPaths": ["Artifacts/Quality/global.json"],
            "evidence": [_evidence("Artifacts/Delivery/summary.json")],
        }
    )

    issues = validate_contract("delivery-manifest", payload)

    assert any(issue.path == "$.authorization" for issue in issues)


def test_independent_approval_requires_review_task_and_discipline() -> None:
    """仅填写 reviewer 字符串不能冒充独立审查记录。"""
    payload = load_yaml(TEMPLATES / "image-task.yaml")
    payload["status"] = "APPROVED"
    payload["selectedCandidate"] = {
        "path": "ArtSource/Generated/visual.player-portrait/processed/player.png",
        "sha256": "d" * 64,
        "visualVersion": "visual-v1",
    }
    approval = _approval(
        "GAME_VISUAL", "INDEPENDENT_REVIEWER", payload["id"], payload["sourceVersion"]
    )
    approval.pop("reviewTaskId")
    approval.pop("reviewDiscipline")
    payload["approvals"] = [approval]

    issues = validate_contract("image-task", payload)

    assert any(issue.path.endswith("reviewTaskId") for issue in issues)
    assert any(issue.path.endswith("reviewDiscipline") for issue in issues)


def test_approved_image_binds_approvals_and_review_to_selected_visual_version() -> None:
    """图片批准必须绑定任务 ID、已选候选版本及三代理最终审查。"""
    payload = load_yaml(TEMPLATES / "image-task.yaml")
    payload["status"] = "APPROVED"
    payload["selectedCandidate"] = {
        "path": "ArtSource/Generated/visual.player-portrait/processed/player.png",
        "sha256": "d" * 64,
        "visualVersion": "visual-v2",
    }
    payload["visualBibleEvidence"] = {
        "type": "visual-bible",
        "path": "Artifacts/Visual/Global/visual-v1.yaml",
        "sha256": "a" * 64,
        "subjectId": "starfall-arena",
        "subjectVersion": payload["visualBibleVersion"],
    }
    payload["itemGenerationEvidence"] = {
        "type": "image-generation",
        "path": "Artifacts/Visual/Generation/player-source-v1.yaml",
        "sha256": "b" * 64,
        "subjectId": "imagegen.player-source-v1",
        "subjectVersion": payload["sourceVersion"],
    }
    payload["splitPlanEvidence"] = {
        "type": "split-plan",
        "path": "Artifacts/Visual/Split/player-v1.yaml",
        "sha256": "c" * 64,
        "subjectId": "split.player-v1",
        "subjectVersion": payload["sourceVersion"],
        "itemId": payload["resourceId"],
        "itemElementIndex": 1,
        "itemVersion": payload["sourceVersion"],
        "itemSpecSha256": "c" * 64,
        "resourceId": payload["resourceId"],
    }
    payload["finalVisualReview"] = {
        "type": "visual-review",
        "path": "Artifacts/Visual/Reviews/player-final.yaml",
        "sha256": "e" * 64,
        "subjectId": payload["id"],
        "subjectVersion": "visual-v2",
    }
    payload["approvals"] = [
        _approval("GAME_VISUAL", "INDEPENDENT_REVIEWER", payload["id"], "visual-v2", reviewer=f"image-{index}", discipline=discipline)
        for index, discipline in enumerate(("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"))
    ]
    assert validate_contract("image-task", payload) == []

    payload["approvals"][0]["subjectVersion"] = payload["sourceVersion"]
    issues = validate_contract("image-task", payload)
    assert any(issue.path == "$.approvals[0].subjectVersion" for issue in issues)


def test_verified_prefab_assembly_requires_complete_low_fidelity_cleanup() -> None:
    """最终拼装 VERIFIED 前必须完成占位清零、结构保留、引用清洁和证据留存。"""
    payload = load_yaml(TEMPLATES / "prefab-assembly.yaml")
    payload["status"] = "VERIFIED"
    payload["unityValidation"] = "PASS"
    payload["evidence"] = [
        {
            "type": "unity-prefab-validation",
            "path": "Artifacts/Validation/prefab-assembly.yaml",
            "sha256": "a" * 64,
        }
    ]

    paths = {issue.path for issue in validate_contract("prefab-assembly", payload)}

    assert {
        "$.lowFidelityCleanup.status",
        "$.lowFidelityCleanup.remainingPlaceholderCount",
        "$.lowFidelityCleanup.structurePreserved",
        "$.lowFidelityCleanup.referencesClean",
        "$.lowFidelityCleanup.evidence",
    }.issubset(paths)


def test_low_fidelity_cleanup_evidence_binds_current_assembly() -> None:
    """清理证据不得从其他 Prefab Assembly 版本复用。"""
    payload = load_yaml(TEMPLATES / "prefab-assembly.yaml")
    payload["lowFidelityCleanup"]["evidence"] = [
        {
            "type": "low-fidelity-cleanup-report",
            "path": "Artifacts/Validation/cleanup.yaml",
            "sha256": "b" * 64,
            "subjectId": "prefab-assembly.other",
            "subjectVersion": "assembly-old",
        }
    ]

    paths = {issue.path for issue in validate_contract("prefab-assembly", payload)}

    assert "$.lowFidelityCleanup.evidence[0].subjectId" in paths
    assert "$.lowFidelityCleanup.evidence[0].subjectVersion" in paths

def test_delivery_preflight_rejects_bare_artifacts_directory() -> None:
    """交付输出必须位于 Artifacts 的子目录，不能直接覆盖根目录。"""
    payload = load_yaml(TEMPLATES / "delivery-preflight.yaml")
    payload["outputDirectory"] = "Artifacts"
    assert any(issue.path == "$.outputDirectory" for issue in validate_contract("delivery-preflight", payload))


def test_approved_runtime_visual_requires_review_and_user_approval() -> None:
    """平台实机证据没有独立审查和用户确认时不得进入 APPROVED。"""
    payload = load_yaml(TEMPLATES / "runtime-visual-evidence.yaml")
    payload["status"] = "APPROVED"

    issues = validate_contract("runtime-visual-evidence", payload)

    assert any(issue.path == "$.reviews" for issue in issues)
    assert any(issue.path == "$.userApprovals" for issue in issues)


def test_runtime_visual_rejects_approval_for_different_build_version() -> None:
    """实机截图批准不能跨构建版本复用。"""
    payload = load_yaml(TEMPLATES / "runtime-visual-evidence.yaml")
    payload["status"] = "APPROVED"
    payload["reviews"] = [
        _approval(
            "RUNTIME_VISUAL",
            "INDEPENDENT_REVIEWER",
            payload["sceneId"],
            "old-build",
            reviewer="runtime-reviewer",
        )
    ]
    payload["userApprovals"] = [
        _approval(
            "RUNTIME_VISUAL",
            "USER",
            payload["sceneId"],
            "old-build",
            reviewer="user",
        )
    ]

    issues = validate_contract("runtime-visual-evidence", payload)

    assert any(issue.path.endswith(".subjectVersion") for issue in issues)
    assert any("三类独立视觉审查" in issue.message for issue in issues)


def test_complete_approved_lifecycle_contracts_remain_valid() -> None:
    """强化负例后，证据齐全的质量门、视觉、场景、实机和交付仍应可通过。"""
    gates = load_yaml(TEMPLATES / "quality-gates.yaml")
    gate = gates["gates"][0]
    gate["status"] = "PASS"
    gate["evidence"] = [_evidence("Artifacts/Gates/G0.json")]
    gate["checkResults"] = [
        {
            "id": check_id,
            "status": "PASS",
            "evidence": [_evidence(f"Artifacts/Gates/{index}.json")],
        }
        for index, check_id in enumerate(gate["requiredChecks"])
    ]
    assert validate_contract("quality-gates", gates) == []

    bible = load_yaml(TEMPLATES / "visual-bible.yaml")
    bible["status"] = "APPROVED"
    bible["directionCandidates"] = [
        {
            "type": "global-direction",
            "path": f"Artifacts/Visual/Global/direction-{index}.png",
            "sha256": character * 64,
            "subjectId": bible["projectId"],
            "subjectVersion": bible["version"],
        }
        for index, character in enumerate(("a", "b"), start=1)
    ]
    bible["selectedDirection"] = dict(bible["directionCandidates"][0])
    bible["finalVisualReview"] = {
        "type": "visual-review",
        "path": "Artifacts/Visual/Global/visual-v1-review.yaml",
        "sha256": "c" * 64,
        "subjectId": bible["projectId"],
        "subjectVersion": bible["version"],
    }
    bible["reviews"] = [
        _approval(
            "VISUAL_BASELINE",
            "INDEPENDENT_REVIEWER",
            bible["projectId"],
            bible["version"],
            reviewer=f"visual-reviewer-{index}",
            discipline=discipline,
        )
        for index, discipline in enumerate(
            ("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY")
        )
    ]
    bible["approval"] = _approval(
        "VISUAL_BASELINE", "USER", bible["projectId"], bible["version"], reviewer="user"
    )
    assert validate_contract("visual-bible", bible) == []

    scene = load_yaml(TEMPLATES / "scene-manifest.yaml")
    scene.update(
        {
            "status": "DONE",
            "frozenAtUtc": "2026-07-27T12:00:00Z",
            "qualityReportPaths": ["Artifacts/Quality/scene.json"],
            "editorCapturePaths": ["Artifacts/Visual/Editor/scene.png"],
            "qualityReports": [_evidence("Artifacts/Quality/scene.json")],
            "editorCaptures": [_evidence("Artifacts/Visual/Editor/scene.json")],
            "evidence": [_evidence("Artifacts/Scenes/scene.json")],
        }
    )
    scene["approvals"] = []
    for approval_type in ("GAME_VISUAL", "UI_VISUAL", "IMPLEMENTATION_VISUAL"):
        for discipline in ("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"):
            scene["approvals"].append(
                _approval(
                    approval_type,
                    "INDEPENDENT_REVIEWER",
                    scene["id"],
                    scene["version"],
                    reviewer=f"{approval_type.lower().replace('_', '-')}-{discipline.lower().replace('_', '-')}",
                    discipline=discipline,
                )
            )
        scene["approvals"].append(
            _approval(approval_type, "USER", scene["id"], scene["version"], reviewer=f"user-{approval_type.lower()}")
        )
    assert validate_contract("scene-manifest", scene) == []

    runtime = load_yaml(TEMPLATES / "runtime-visual-evidence.yaml")
    runtime["status"] = "APPROVED"
    runtime["reviews"] = [
        _approval(
            "RUNTIME_VISUAL", "INDEPENDENT_REVIEWER", runtime["sceneId"], runtime["buildVersion"],
            reviewer=f"runtime-reviewer-{index}", discipline=discipline,
        )
        for index, discipline in enumerate(("VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"))
    ]
    runtime["userApprovals"] = [
        _approval(
            "RUNTIME_VISUAL", "USER", runtime["sceneId"], runtime["buildVersion"], reviewer="user"
        )
    ]
    assert validate_contract("runtime-visual-evidence", runtime) == []

    delivery = load_yaml(TEMPLATES / "delivery-manifest.yaml")
    delivery.update(
        {
            "projectId": "starfall-arena",
            "status": "RELEASE_APPROVED",
            "buildResult": {"status": "PASS", "evidence": _evidence("Artifacts/Delivery/build.json")},
            "launchCheck": {"status": "PASS", "evidence": _evidence("Artifacts/Delivery/launch.json")},
            "artifacts": [
                {"artifactType": "WINDOWS_EXECUTABLE", "path": "Artifacts/Delivery/game.exe", "sha256": "c" * 64, "sizeBytes": 1}
            ],
            "qualityReportPaths": ["Artifacts/Quality/global.json"],
            "qualityReports": [_evidence("Artifacts/Quality/global.json")],
            "runtimeVisualEvidence": [_evidence("Artifacts/Visual/Runtime/global.json")],
            "evidence": [_evidence("Artifacts/Delivery/summary.json")],
            "authorization": {
                "approval": _approval(
                    "RELEASE", "USER", delivery["id"], delivery["version"], reviewer="release-owner"
                ),
                "allowedActions": ["LOCAL_DELIVERY"],
            },
        }
    )
    assert validate_contract("delivery-manifest", delivery) == []


@pytest.mark.parametrize(("_kind", "filename"), TEMPLATE_CONTRACTS)
def test_templates_are_utf8_without_placeholders(_kind: str, filename: str) -> None:
    """模板必须以 UTF-8 保存，且不能遗留未定义占位符。"""
    text = (TEMPLATES / filename).read_text(encoding="utf-8")
    upper_text = text.upper()
    assert "TBD" not in upper_text
    assert "TODO" not in upper_text
    assert "NULL" not in upper_text
    assert "\\" not in text
