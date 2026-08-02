"""验证用户选择平台、分平台制品和最终设备绑定的严格契约。"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from unity_workflow.contracts import validate_contract
from unity_workflow.platform_contract import (
    artifact_reference_failure,
    g3_candidate_device_failure,
    platform_check_coverage_failure,
    profile_platform_failure,
    s00_platform_failure,
)


TEMPLATES = Path(__file__).parents[2] / "unity-development-workflow" / "templates"


class _Reader:
    """提供平台完整性单元测试所需的契约回读能力。"""

    active_project_profile = {
        "type": "project-profile",
        "path": "profile.yaml",
        "sha256": "e" * 64,
    }

    def __init__(self, contracts: dict[str, dict[str, object]]) -> None:
        """保存按项目相对路径索引的平台契约。"""
        self.contracts = contracts

    def verify_active_project_profile(self) -> None:
        """夹具中的活动项目配置始终通过引用校验。"""

    def verify_reference(self, reference: object) -> None:
        """夹具引用只测试平台语义，不重复文件层校验。"""

    def _load_referenced_contract(self, reference: dict[str, object]) -> dict[str, object]:
        """返回指定路径对应的测试契约。"""
        return self.contracts[str(reference["path"])]


def _approved_profile() -> dict[str, object]:
    """创建同时批准 Windows 与 Android、以 Windows 为主平台的配置。"""
    profile = yaml.safe_load((TEMPLATES / "project-profile.yaml").read_text(encoding="utf-8"))
    profile["delivery"]["platformSelectionStatus"] = "APPROVED"
    return profile


def _platform_report(
    platform: str,
    check_id: str = "platforms.adaptation-complete",
) -> dict[str, object]:
    """创建指定平台和检查 ID 的最小 PASS 报告。"""
    return {
        "platformId": platform,
        "checks": [
            {
                "id": check_id,
                "status": "PASS",
                "evidence": [
                    {
                        "type": "platform-adaptation-test-report",
                        "platform": platform,
                    }
                ] if check_id == "platforms.adaptation-complete" else [],
            }
        ],
    }


def _delivery(platform: str, artifact_type: str, path: str, digest: str) -> dict[str, object]:
    """创建包含唯一平台主制品的最小交付清单。"""
    return {
        "platform": platform,
        "artifacts": [
            {
                "artifactType": artifact_type,
                "path": path,
                "sha256": digest,
            }
        ],
    }


@pytest.mark.parametrize(
    ("filename", "contract_type"),
    [
        ("project-profile.yaml", "project-profile"),
        ("quality-report-mobile-development.yaml", "quality-report"),
        ("quality-report-platform-adaptation.yaml", "quality-report"),
        ("delivery-manifest-mobile.yaml", "delivery-manifest"),
        ("runtime-visual-evidence-mobile.yaml", "runtime-visual-evidence"),
    ],
)
def test_platform_templates_validate(filename: str, contract_type: str) -> None:
    """平台选择、移动开发、适配、视觉和交付模板必须满足各自契约。"""
    payload = yaml.safe_load((TEMPLATES / filename).read_text(encoding="utf-8"))
    assert validate_contract(contract_type, payload) == []


def test_profile_platform_selection_requires_user_approval_and_valid_primary() -> None:
    """平台集合必须获得批准，且主开发平台必须属于该集合。"""
    profile = _approved_profile()
    assert profile_platform_failure(profile) is None

    awaiting = deepcopy(profile)
    awaiting["delivery"]["platformSelectionStatus"] = "AWAITING_USER"
    assert "未获得用户批准" in (profile_platform_failure(awaiting) or "")

    invalid_primary = deepcopy(profile)
    invalid_primary["delivery"]["primaryDevelopmentPlatform"] = "IOS"
    assert "不在用户批准的平台集合" in (profile_platform_failure(invalid_primary) or "")

    duplicated = deepcopy(profile)
    duplicated["delivery"]["targets"].append(deepcopy(duplicated["delivery"]["targets"][0]))
    assert "重复目标平台" in (profile_platform_failure(duplicated) or "")


def test_profile_schema_rejects_cross_platform_target_configuration() -> None:
    """Android 目标不得携带 Windows BuildTarget 或关闭移动安全区。"""
    profile = _approved_profile()
    android = profile["delivery"]["targets"][1]
    android["buildTarget"] = "WINDOWS_STANDALONE"
    android["safeAreaRequired"] = False
    issues = validate_contract("project-profile", profile)
    assert any("buildTarget" in issue.path for issue in issues)
    assert any("safeAreaRequired" in issue.path for issue in issues)


@pytest.mark.parametrize(
    ("platform", "device_class"),
    [("IOS", "PHONE"), ("IPADOS", "TABLET")],
)
def test_ios_and_ipados_have_separate_valid_device_shapes(
    platform: str, device_class: str
) -> None:
    """iPhone 与 iPad 可共用 iOS BuildTarget，但设备形态必须分别建模。"""
    profile = _approved_profile()
    target = profile["delivery"]["targets"][1]
    target.update(
        {
            "platformId": platform,
            "buildTarget": "IOS",
            "deviceClasses": [device_class],
            "distributionChannel": "App Store",
        }
    )
    profile["delivery"]["primaryDevelopmentPlatform"] = platform
    assert validate_contract("project-profile", profile) == []

    target["deviceClasses"] = ["TABLET" if device_class == "PHONE" else "PHONE"]
    assert validate_contract("project-profile", profile)


def test_platform_reports_and_candidates_require_exact_selected_set() -> None:
    """G2 平台报告与 G3 候选清单必须精确覆盖用户批准的平台集合。"""
    contracts = {
        "profile.yaml": _approved_profile(),
        "windows-report.yaml": _platform_report("WINDOWS"),
        "android-report.yaml": _platform_report("ANDROID"),
        "windows-performance.yaml": _platform_report("WINDOWS", "performance.pass"),
        "android-performance.yaml": _platform_report("ANDROID", "performance.pass"),
        "windows-delivery.yaml": _delivery("WINDOWS", "WINDOWS_EXECUTABLE", "Build/Game.exe", "a" * 64),
        "android-delivery.yaml": _delivery("ANDROID", "ANDROID_APP_BUNDLE", "Build/Game.aab", "b" * 64),
    }
    reader = _Reader(contracts)
    report_evidence = [
        {"type": "quality-report", "path": "windows-report.yaml"},
        {"type": "quality-report", "path": "android-report.yaml"},
    ]
    assert platform_check_coverage_failure(
        reader, "platforms.adaptation-complete", report_evidence
    ) is None
    assert "ANDROID" in (
        platform_check_coverage_failure(
            reader, "platforms.adaptation-complete", report_evidence[:1]
        )
        or ""
    )
    performance_evidence = [
        {"type": "quality-report", "path": "windows-performance.yaml"},
        {"type": "quality-report", "path": "android-performance.yaml"},
    ]
    assert platform_check_coverage_failure(reader, "performance.pass", performance_evidence) is None
    assert "ANDROID" in (
        platform_check_coverage_failure(reader, "performance.pass", performance_evidence[:1])
        or ""
    )

    candidate_evidence = [
        {"type": "delivery-manifest", "path": "windows-delivery.yaml"},
        {"type": "delivery-manifest", "path": "android-delivery.yaml"},
    ]
    assert platform_check_coverage_failure(reader, "candidate.verified", candidate_evidence) is None
    assert "重复平台" in (
        platform_check_coverage_failure(
            reader, "candidate.verified", [candidate_evidence[0], candidate_evidence[0]]
        )
        or ""
    )


@pytest.mark.parametrize(
    ("platform", "artifact_type", "path"),
    [
        ("WINDOWS", "ANDROID_APK", "Build/Game.apk"),
        ("ANDROID", "ANDROID_APK", "Build/Game.exe"),
        ("IPADOS", "WINDOWS_EXECUTABLE", "Build/Game.exe"),
    ],
)
def test_platform_artifact_rejects_type_or_extension_mismatch(
    platform: str, artifact_type: str, path: str
) -> None:
    """平台制品类型和扩展名不得跨平台混用。"""
    reference = {
        "type": "platform-build-artifact",
        "platform": platform,
        "artifactType": artifact_type,
        "path": path,
        "sha256": "a" * 64,
    }
    assert artifact_reference_failure(reference) is not None


def test_s00_build_must_use_approved_primary_platform() -> None:
    """S00 空壳构建不得使用非主开发平台制品。"""
    profile = _approved_profile()
    reader = _Reader({"profile.yaml": profile})
    report = yaml.safe_load((TEMPLATES / "s00-report.yaml").read_text(encoding="utf-8"))
    assert s00_platform_failure(reader, report) is None

    profile["delivery"]["primaryDevelopmentPlatform"] = "ANDROID"
    assert "主开发平台 ANDROID" in (s00_platform_failure(reader, report) or "")


def test_delivery_manifest_rejects_other_platform_primary_artifact() -> None:
    """移动交付清单不得夹带 Windows 或其他平台的主制品。"""
    payload = yaml.safe_load((TEMPLATES / "delivery-manifest-mobile.yaml").read_text(encoding="utf-8"))
    payload["artifacts"] = [
        {
            "artifactType": "WINDOWS_EXECUTABLE",
            "path": "Artifacts/Builds/Windows/Game.exe",
            "sha256": "a" * 64,
            "sizeBytes": 1,
        }
    ]
    assert validate_contract("delivery-manifest", payload)


def test_runtime_visual_source_must_match_platform() -> None:
    """移动端视觉证据不得使用 Windows 或其他平台的捕获来源。"""
    payload = yaml.safe_load(
        (TEMPLATES / "runtime-visual-evidence-mobile.yaml").read_text(encoding="utf-8")
    )
    payload["captureSource"] = "WINDOWS_STANDALONE"
    assert validate_contract("runtime-visual-evidence", payload)


def test_g3_device_report_must_bind_each_platform_candidate() -> None:
    """最终设备报告必须使用 Windows 与 Android 候选清单中的同一主制品。"""
    contracts = {
        "profile.yaml": _approved_profile(),
        "windows-delivery.yaml": _delivery("WINDOWS", "WINDOWS_EXECUTABLE", "Build/Game.exe", "a" * 64),
        "android-delivery.yaml": _delivery("ANDROID", "ANDROID_APP_BUNDLE", "Build/Game.aab", "b" * 64),
        "devices.yaml": {
            "checks": [{"id": "devices.acceptance-verified", "status": "PASS"}],
            "deviceAcceptance": {
                "buildArtifacts": [
                    {
                        "platform": "WINDOWS",
                        "artifactType": "WINDOWS_EXECUTABLE",
                        "path": "Build/Game.exe",
                        "sha256": "a" * 64,
                    },
                    {
                        "platform": "ANDROID",
                        "artifactType": "ANDROID_APP_BUNDLE",
                        "path": "Build/Game.aab",
                        "sha256": "b" * 64,
                    },
                ]
            },
        },
    }
    reader = _Reader(contracts)
    checks = {
        "candidate.verified": {
            "evidence": [
                {"type": "delivery-manifest", "path": "windows-delivery.yaml"},
                {"type": "delivery-manifest", "path": "android-delivery.yaml"},
            ]
        },
        "devices.acceptance-verified": {
            "evidence": [{"type": "quality-report", "path": "devices.yaml"}]
        },
    }
    assert g3_candidate_device_failure(reader, checks) is None

    contracts["devices.yaml"]["deviceAcceptance"]["buildArtifacts"][1]["sha256"] = "c" * 64
    assert "不一致" in (g3_candidate_device_failure(reader, checks) or "")
