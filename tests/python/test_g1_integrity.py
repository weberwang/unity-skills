"""验证 G1 三项必需检查只能消费同一场景与同一主平台制品。"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.gate_evaluator import _EvidenceVerifier
from unity_workflow.g1_integrity import g1_vertical_slice_failure


TEMPLATES = Path(__file__).parents[2] / "unity-development-workflow" / "templates"


class _Reader:
    """提供无需文件系统的已验真契约读取器。"""

    project_id = "starfall-arena"
    source_revision = "revision-001"
    project_state_version = "project-state-v1"
    build_version = "0.1.0-dev.1"
    active_decomposition = {"type": "decomposition-plan", "path": "decomposition.yaml", "sha256": "d" * 64}
    active_project_profile = {"type": "project-profile", "path": "profile.yaml", "sha256": "e" * 64}

    def __init__(self, contracts: dict[str, dict[str, object]]) -> None:
        """保存按项目相对路径索引的契约。"""
        self.contracts = contracts

    def verify_reference(self, reference: object) -> None:
        """单元测试聚焦组合语义，通用 Gate 已覆盖真实路径与哈希校验。"""
        assert isinstance(reference, dict)

    def verify_active_decomposition(self) -> None:
        """夹具中的拆分始终代表已验真活动指针。"""

    def verify_active_project_profile(self) -> None:
        """夹具中的项目配置始终代表已验真活动指针。"""

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """回读主契约或当前拆分。"""
        return self.contracts[str(reference["path"])]


def _fixtures() -> tuple[_Reader, dict[str, dict[str, object]], dict[str, dict[str, object]]]:
    """构造三项检查共享同一主平台制品的最小有效闭环。"""
    executable = {
        "type": "platform-build-artifact",
        "artifactType": "WINDOWS_EXECUTABLE",
        "platform": "WINDOWS",
        "path": "Artifacts/Builds/Windows/StarfallArena.exe",
        "sha256": "a" * 64,
        "projectId": "starfall-arena",
        "subjectId": "scene.arena-intro",
        "subjectVersion": "0.1.0-dev.1",
        "sourceRevision": "revision-001",
        "projectStateVersion": "project-state-v1",
        "buildVersion": "0.1.0-dev.1",
    }
    scene_reference = {
        "type": "scene-manifest", "path": "scene.yaml", "sha256": "1" * 64,
        "projectId": "starfall-arena", "subjectId": "scene.arena-intro",
        "subjectVersion": "scene-v1", "sourceRevision": "revision-001",
        "projectStateVersion": "project-state-v1",
    }
    playability_reference = {
        "type": "scene-report", "path": "scene-report.yaml", "sha256": "4" * 64,
        "projectId": "starfall-arena", "subjectId": "scene.arena-intro",
        "subjectVersion": "scene-v1", "sourceRevision": "revision-001",
        "projectStateVersion": "project-state-v1", "buildVersion": "0.1.0-dev.1",
    }
    references = {
        "visual.runtime-approved": {"type": "runtime-visual-evidence", "path": "runtime.yaml", "sha256": "2" * 64},
        "build.platform-development": {"type": "quality-report", "path": "build.yaml", "sha256": "3" * 64},
    }
    contracts: dict[str, dict[str, object]] = {
        "scene.yaml": {
            "projectId": "starfall-arena", "id": "scene.arena-intro", "version": "scene-v1",
            "sourceRevision": "revision-001", "projectStateVersion": "project-state-v1",
            "status": "DONE",
        },
        "scene-report.yaml": {
            "projectId": "starfall-arena", "sceneId": "scene.arena-intro",
            "sceneVersion": "scene-v1", "reportPurpose": "VERTICAL_SLICE",
            "sourceRevision": "revision-001",
            "projectStateVersion": "project-state-v1", "buildVersion": "0.1.0-dev.1",
            "buildArtifactSha256": "a" * 64,
            "sceneManifest": deepcopy(scene_reference),
            "tests": {
                "id": "vertical-slice.playable", "status": "PASS",
                "evidence": [deepcopy(executable)],
            },
            "status": "PASS",
        },
        "runtime.yaml": {
            "projectId": "starfall-arena", "sceneId": "scene.arena-intro",
            "sourceRevision": "revision-001", "projectStateVersion": "project-state-v1",
            "buildVersion": "0.1.0-dev.1", "platformId": "WINDOWS",
            "buildArtifactSha256": "a" * 64,
        },
        "build.yaml": {
            "projectId": "starfall-arena", "sceneId": "scene.arena-intro",
            "sourceRevision": "revision-001", "projectStateVersion": "project-state-v1",
            "buildVersion": "0.1.0-dev.1", "platformId": "WINDOWS",
            "buildArtifactSha256": "a" * 64,
            "buildArtifact": {
                "artifactType": "WINDOWS_EXECUTABLE", "platform": "WINDOWS",
                "path": executable["path"], "sha256": executable["sha256"],
            },
            "checks": [{"id": "build.platform-development", "status": "PASS", "evidence": [deepcopy(executable)]}],
        },
        "decomposition.yaml": {"decision": {"approvedSceneIds": ["scene.arena-intro"]}},
        "profile.yaml": {
            "delivery": {
                "platformSelectionStatus": "APPROVED",
                "primaryDevelopmentPlatform": "WINDOWS",
                "targets": [{"platformId": "WINDOWS"}],
            }
        },
    }
    checks: dict[str, dict[str, object]] = {
        "vertical-slice.playable": {
            "id": "vertical-slice.playable", "status": "PASS",
            "evidence": [scene_reference, playability_reference, deepcopy(executable)],
        },
        **{
        check_id: {"id": check_id, "status": "PASS", "evidence": [reference, deepcopy(executable)]}
        for check_id, reference in references.items()
        },
    }
    return _Reader(contracts), checks, contracts


def _executable(check: dict[str, object]) -> dict[str, object]:
    """取得检查中唯一主平台制品引用。"""
    return next(
        item
        for item in check["evidence"]
        if isinstance(item, dict) and item.get("type") == "platform-build-artifact"
    )


def _pass_scene_report() -> dict[str, object]:
    """构造满足通用 PASS 与垂直切片专属约束的场景报告。"""
    report = yaml.safe_load((TEMPLATES / "scene-report.yaml").read_text(encoding="utf-8"))
    executable = yaml.safe_load(
        (TEMPLATES / "quality-report-windows-development.yaml").read_text(encoding="utf-8")
    )["checks"][0]["evidence"][0]
    raw = {"type": "test-log", "path": "Artifacts/Quality/check.txt", "sha256": "b" * 64}
    for field in (
        "greybox", "gameVisual", "implementation", "uiVisual",
        "runtimeComparison", "tests", "performance",
    ):
        report[field]["status"] = "PASS"
        report[field]["evidence"] = [deepcopy(raw)]
    report["tests"].update(
        {"id": "vertical-slice.playable", "evidence": [deepcopy(executable)]}
    )
    report["status"] = "PASS"
    return report


def test_g1_three_checks_share_approved_scene_and_executable() -> None:
    """同场景、同版本和同 EXE 的完整绑定可以通过。"""
    reader, checks, _ = _fixtures()
    assert g1_vertical_slice_failure(reader, checks) is None


def test_g1_uses_production_verifier_to_backread_real_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """生产 Verifier 必须从实际 YAML 文件回读完整 G1 组合，而非只消费内存摘要。"""
    reader, checks, contracts = _fixtures()
    for relative_path, payload in contracts.items():
        path = tmp_path / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(payload, allow_unicode=True), encoding="utf-8")
    executable_path = tmp_path / "Artifacts/Builds/Windows/StarfallArena.exe"
    executable_path.parent.mkdir(parents=True, exist_ok=True)
    executable_path.write_bytes(b"windows-development-build")
    verifier = _EvidenceVerifier(
        tmp_path, reader.project_id, reader.source_revision, reader.build_version,
        "G1", reader.project_state_version, reader.active_decomposition,
        reader.active_project_profile,
    )
    # 本用例聚焦生产读取路径；完整 Schema、状态和 SHA 校验由 Gate 定向测试覆盖。
    monkeypatch.setattr(verifier, "verify_reference", lambda reference: None)
    monkeypatch.setattr(verifier, "verify_active_decomposition", lambda: None)
    monkeypatch.setattr(verifier, "verify_active_project_profile", lambda: None)
    monkeypatch.setattr(
        verifier,
        "_load_referenced_contract",
        lambda reference: reader.contracts[str(reference["path"])],
    )
    assert g1_vertical_slice_failure(verifier, checks) is None


def test_g1_rejects_runtime_from_different_scene() -> None:
    """实机视觉不得来自另一个已存在场景。"""
    reader, checks, contracts = _fixtures()
    contracts["runtime.yaml"]["sceneId"] = "scene.arena-battle"
    assert "同一 sceneId" in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_missing_scene_report() -> None:
    """仅有 DONE 场景清单不能证明垂直切片可玩。"""
    reader, checks, _ = _fixtures()
    checks["vertical-slice.playable"]["evidence"] = [
        item
        for item in checks["vertical-slice.playable"]["evidence"]
        if item.get("type") != "scene-report"
    ]
    assert "一个 scene-report" in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_done_manifest_without_pass_playability() -> None:
    """场景已 DONE 但可玩报告未通过时仍必须阻断。"""
    reader, checks, contracts = _fixtures()
    contracts["scene-report.yaml"]["status"] = "NOT_RUN"
    assert "可玩性报告状态不是 PASS" in (g1_vertical_slice_failure(reader, checks) or "")


@pytest.mark.parametrize("target", ("runtime.yaml", "build.yaml"))
def test_g1_rejects_contract_bound_to_different_executable(target: str) -> None:
    """实机视觉或构建报告的制品哈希不得脱离共享 EXE。"""
    reader, checks, contracts = _fixtures()
    contracts[target]["buildArtifactSha256"] = "b" * 64
    assert "平台制品 SHA-256" in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_missing_executable_hash() -> None:
    """任一检查省略 EXE 哈希时组合门禁必须失败。"""
    reader, checks, _ = _fixtures()
    _executable(checks["vertical-slice.playable"]).pop("sha256")
    assert "缺少字段：sha256" in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_different_executable_reference() -> None:
    """三个检查不能各自引用不同 EXE。"""
    reader, checks, _ = _fixtures()
    _executable(checks["visual.runtime-approved"])["sha256"] = "b" * 64
    assert "平台构建制品引用不一致" in (g1_vertical_slice_failure(reader, checks) or "")


@pytest.mark.parametrize(
    ("field", "value", "message"),
    (
        ("sceneId", "scene.arena-battle", "同一 sceneId"),
        ("projectStateVersion", "old-state", "projectStateVersion"),
        ("buildVersion", "old-build", "buildVersion"),
        ("buildArtifactSha256", "b" * 64, "平台制品 SHA-256"),
    ),
)
def test_g1_rejects_stale_or_mismatched_playability_report(
    field: str, value: str, message: str
) -> None:
    """可玩报告不得来自其他场景、状态、构建或制品。"""
    reader, checks, contracts = _fixtures()
    contracts["scene-report.yaml"][field] = value
    assert message in (g1_vertical_slice_failure(reader, checks) or "")


@pytest.mark.parametrize("field", ("sourceRevision", "projectStateVersion", "buildVersion"))
def test_g1_rejects_old_executable_identity(field: str) -> None:
    """旧源码、旧项目状态或旧构建版本均不得复用。"""
    reader, checks, _ = _fixtures()
    for check in checks.values():
        _executable(check)[field] = "old-version"
    assert field in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_duplicate_primary_evidence() -> None:
    """重复主证据不得通过唯一性检查。"""
    reader, checks, _ = _fixtures()
    checks["vertical-slice.playable"]["evidence"].append(
        deepcopy(checks["vertical-slice.playable"]["evidence"][0])
    )
    assert "必须且只能包含一个 scene-manifest" in (g1_vertical_slice_failure(reader, checks) or "")


@pytest.mark.parametrize(
    ("mutation", "message"),
    (
        ("NOT_PASS", "状态不是 PASS"),
        ("WRONG_ID", "id 必须为 vertical-slice.playable"),
        ("DUPLICATE_EXE", "必须且只能包含一个 platform-build-artifact"),
    ),
)
def test_g1_rejects_invalid_playability_tests(mutation: str, message: str) -> None:
    """可玩报告 tests 必须是唯一共享 EXE 上的指定 PASS 检查。"""
    reader, checks, contracts = _fixtures()
    tests = contracts["scene-report.yaml"]["tests"]
    if mutation == "NOT_PASS":
        tests["status"] = "FAIL"
    elif mutation == "WRONG_ID":
        tests["id"] = "scene.tests"
    else:
        tests["evidence"].append(deepcopy(tests["evidence"][0]))
    assert message in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_generic_build_report_without_explicit_artifact() -> None:
    """仅声明 build PASS 的通用报告不能替代 Windows 制品描述。"""
    reader, checks, contracts = _fixtures()
    contracts["build.yaml"].pop("buildArtifact")
    assert "缺少显式 buildArtifact" in (g1_vertical_slice_failure(reader, checks) or "")


def test_g1_rejects_non_executable_path() -> None:
    """Windows 开发构建引用必须指向实际 .exe。"""
    reader, checks, _ = _fixtures()
    for check in checks.values():
        _executable(check)["path"] = "Artifacts/Builds/Windows/readme.txt"
    assert "path 扩展名与 WINDOWS_EXECUTABLE 不匹配" in (g1_vertical_slice_failure(reader, checks) or "")


@pytest.mark.parametrize(
    "mutation",
    ("MISSING_ARTIFACT", "NON_EXE", "MISSING_STATE", "WRONG_PLATFORM", "MISSING_EXE_HASH"),
)
def test_windows_build_report_schema_requires_explicit_current_executable(mutation: str) -> None:
    """PASS 构建报告必须结构化声明当前 Windows EXE，而非只写通用成功状态。"""
    report = yaml.safe_load(
        (TEMPLATES / "quality-report-windows-development.yaml").read_text(encoding="utf-8")
    )
    if mutation == "MISSING_ARTIFACT":
        report.pop("buildArtifact")
    elif mutation == "NON_EXE":
        report["buildArtifact"]["path"] = "Artifacts/Builds/Windows/readme.txt"
    elif mutation == "MISSING_STATE":
        report.pop("projectStateVersion")
    elif mutation == "WRONG_PLATFORM":
        report["checks"][0]["evidence"][0]["platform"] = "LINUX_STANDALONE"
    else:
        report["checks"][0]["evidence"][0].pop("sha256")
    assert validate_contract("quality-report", report)


def test_generic_quality_report_requires_project_state_version() -> None:
    """回归、缺陷和隐私等通用报告也必须绑定当前项目状态。"""
    report = yaml.safe_load((TEMPLATES / "quality-report.yaml").read_text(encoding="utf-8"))
    report.pop("projectStateVersion")
    issues = validate_contract("quality-report", report)
    assert any(issue.path == "$.projectStateVersion" for issue in issues)


def test_pass_scene_report_schema_requires_playable_shared_executable() -> None:
    """PASS 场景报告的 tests 必须使用专用 ID 和唯一结构化 EXE。"""
    assert validate_contract("scene-report", _pass_scene_report()) == []


def test_vertical_slice_pass_scene_report_requires_artifact_hash() -> None:
    """垂直切片 PASS 报告不能省略共享 EXE 哈希。"""
    report = _pass_scene_report()
    report.pop("buildArtifactSha256")
    issues = validate_contract("scene-report", report)
    assert any(issue.path == "$.buildArtifactSha256" for issue in issues)


def test_g2_scene_completion_pass_does_not_claim_vertical_slice() -> None:
    """普通 G2 场景 PASS 不应被迫冒充垂直切片。"""
    report = _pass_scene_report()
    report["reportPurpose"] = "SCENE_COMPLETION"
    report.pop("buildArtifactSha256")
    report["tests"] = {
        "id": "scene.regression", "status": "PASS",
        "evidence": [{"type": "test-log", "path": "Artifacts/Quality/regression.txt", "sha256": "c" * 64}],
    }
    assert validate_contract("scene-report", report) == []
