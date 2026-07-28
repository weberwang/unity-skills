"""校验 2D 场景适配中需要数学复算的跨字段约束。"""

from collections.abc import Mapping, Sequence
from typing import Any


def validate_scene_manifest_2d_reference(payload: Mapping[str, Any]) -> list[tuple[str, str]]:
    """将 2D 场景的适配引用绑定到当前场景和项目快照。"""
    adaptation = payload.get("adaptation2D")
    if payload.get("dimension") != "2D" or not isinstance(adaptation, Mapping):
        return []
    expected = {
        "type": "scene-2d-adaptation",
        "subjectId": payload.get("id"),
        "subjectVersion": payload.get("version"),
        "sourceRevision": payload.get("sourceRevision"),
        "projectStateVersion": payload.get("projectStateVersion"),
    }
    messages = {
        "type": "2D 场景必须引用 scene-2d-adaptation 契约",
        "subjectId": "2D 适配契约必须绑定当前场景",
        "subjectVersion": "2D 适配契约必须绑定当前场景版本",
        "sourceRevision": "2D 适配契约必须绑定当前源码修订",
        "projectStateVersion": "2D 适配契约必须绑定当前项目状态版本",
    }
    return [
        (f"$.adaptation2D.{field}", messages[field])
        for field, expected_value in expected.items()
        if adaptation.get(field) != expected_value
    ]


def validate_scene_2d_adaptation(payload: Mapping[str, Any]) -> list[tuple[str, str]]:
    """复算 2D 适配结果，返回稳定 JSONPath 与中文问题说明。"""
    orientation = payload.get("orientation")
    reference = payload.get("referenceResolution")
    ui_toolkit = payload.get("uiToolkit")
    safe_area = payload.get("interactiveSafeArea")
    decorative = payload.get("decorativeBands")
    tests = payload.get("testResolutions")
    if not isinstance(reference, Mapping):
        return []

    reference_width = reference.get("width")
    reference_height = reference.get("height")
    if not isinstance(reference_width, int) or not isinstance(reference_height, int):
        return []
    if reference_width <= 0 or reference_height <= 0:
        return []

    issues: list[tuple[str, str]] = []
    if orientation == "PORTRAIT" and reference_width >= reference_height:
        issues.append(("$.referenceResolution", "竖屏参考分辨率必须高于宽"))
    if orientation == "LANDSCAPE" and reference_width <= reference_height:
        issues.append(("$.referenceResolution", "横屏参考分辨率必须宽于高"))

    if isinstance(ui_toolkit, Mapping) and ui_toolkit.get("referenceResolution") != reference:
        issues.append(("$.uiToolkit.referenceResolution", "UI Toolkit 参考分辨率必须与场景参考分辨率一致"))

    if isinstance(safe_area, Mapping):
        safe_right = safe_area.get("x", 0) + safe_area.get("width", 0)
        safe_top = safe_area.get("y", 0) + safe_area.get("height", 0)
        if safe_right > reference_width or safe_top > reference_height:
            issues.append(("$.interactiveSafeArea", "交互安全区不得超出参考画面"))

    expected_edges = ["LEFT", "RIGHT"] if orientation == "PORTRAIT" else ["TOP", "BOTTOM"]
    if isinstance(decorative, Mapping):
        assets = decorative.get("assets")
        if isinstance(assets, Sequence) and not isinstance(assets, (str, bytes)):
            actual_edges = sorted(
                item.get("edge")
                for item in assets
                if isinstance(item, Mapping) and isinstance(item.get("edge"), str)
            )
            if actual_edges != sorted(expected_edges):
                issues.append(("$.decorativeBands.assets", "边带资源必须且只能覆盖当前方向对应的两个边缘"))

    if not isinstance(tests, Sequence) or isinstance(tests, (str, bytes)):
        return issues

    reference_aspect = reference_width / reference_height
    outcomes: set[str] = set()
    for index, test in enumerate(tests):
        if not isinstance(test, Mapping):
            continue
        width = test.get("width")
        height = test.get("height")
        if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
            continue
        target_aspect = width / height
        delta = target_aspect - reference_aspect
        if abs(delta) <= 1e-9:
            expected_outcome = "EXACT"
            band_edges: list[str] = []
        elif (orientation == "PORTRAIT" and delta > 0) or (orientation == "LANDSCAPE" and delta < 0):
            expected_outcome = "DECORATIVE_BANDS"
            band_edges = expected_edges
        else:
            expected_outcome = "CROP"
            band_edges = []

        outcomes.add(expected_outcome)
        if test.get("expectedOutcome") != expected_outcome:
            issues.append((f"$.testResolutions[{index}].expectedOutcome", "声明结果与基准轴适配计算不一致"))
        actual_band_edges = test.get("expectedBandEdges")
        if isinstance(actual_band_edges, Sequence) and not isinstance(actual_band_edges, (str, bytes)):
            if sorted(actual_band_edges) != sorted(band_edges):
                issues.append((f"$.testResolutions[{index}].expectedBandEdges", "声明边带方向与适配计算不一致"))

    missing_outcomes = {"EXACT", "DECORATIVE_BANDS", "CROP"} - outcomes
    if missing_outcomes:
        issues.append(("$.testResolutions", "必须覆盖同宽高比、装饰边带和外围裁切三类分辨率"))
    issues.extend(_verification_binding_issues(payload, tests))
    return issues


def _verification_binding_issues(
    payload: Mapping[str, Any],
    tests: Sequence[object],
) -> list[tuple[str, str]]:
    """将三类验证证据绑定到当前场景、源码、项目状态和目标分辨率。"""
    verification = payload.get("verification")
    if not isinstance(verification, Mapping):
        return []

    issues: list[tuple[str, str]] = []
    expected_fields = {
        "sceneId": payload.get("sceneId"),
        "sceneVersion": payload.get("sceneVersion"),
        "sourceRevision": payload.get("sourceRevision"),
        "projectStateVersion": payload.get("projectStateVersion"),
    }
    for check_name in ("unityConfiguration", "editMode", "runtimeScreenshots"):
        check = verification.get(check_name)
        evidence_items = check.get("evidence") if isinstance(check, Mapping) else None
        if not isinstance(evidence_items, Sequence) or isinstance(evidence_items, (str, bytes)):
            continue
        for index, evidence in enumerate(evidence_items):
            if not isinstance(evidence, Mapping):
                continue
            for field, expected_value in expected_fields.items():
                if evidence.get(field) != expected_value:
                    issues.append((f"$.verification.{check_name}.evidence[{index}].{field}", "验证证据必须绑定当前场景与项目快照"))

    edit_mode = verification.get("editMode")
    edit_evidence = edit_mode.get("evidence") if isinstance(edit_mode, Mapping) else None
    if isinstance(edit_evidence, Sequence) and not isinstance(edit_evidence, (str, bytes)):
        for index, evidence in enumerate(edit_evidence):
            if isinstance(evidence, Mapping) and evidence.get("totalTests") != evidence.get("passedTests"):
                issues.append((f"$.verification.editMode.evidence[{index}]", "EditMode 通过数量必须等于测试总数"))

    if payload.get("status") != "VERIFIED":
        return issues

    runtime_check = verification.get("runtimeScreenshots")
    runtime_evidence = runtime_check.get("evidence") if isinstance(runtime_check, Mapping) else None
    if not isinstance(runtime_evidence, Sequence) or isinstance(runtime_evidence, (str, bytes)):
        return issues
    expected_resolutions = {
        item.get("id"): (item.get("width"), item.get("height"))
        for item in tests
        if isinstance(item, Mapping) and isinstance(item.get("id"), str)
    }
    actual_ids: list[str] = []
    for index, evidence in enumerate(runtime_evidence):
        if not isinstance(evidence, Mapping) or not isinstance(evidence.get("resolutionId"), str):
            continue
        resolution_id = evidence["resolutionId"]
        actual_ids.append(resolution_id)
        expected_size = expected_resolutions.get(resolution_id)
        if expected_size is None:
            issues.append((f"$.verification.runtimeScreenshots.evidence[{index}].resolutionId", "运行截图必须对应已声明的目标分辨率"))
        elif (evidence.get("width"), evidence.get("height")) != expected_size:
            issues.append((f"$.verification.runtimeScreenshots.evidence[{index}]", "运行截图尺寸必须匹配目标分辨率"))
    if len(actual_ids) != len(set(actual_ids)):
        issues.append(("$.verification.runtimeScreenshots.evidence", "每个目标分辨率只能有一份最终运行截图"))
    if set(actual_ids) != set(expected_resolutions):
        issues.append(("$.verification.runtimeScreenshots.evidence", "VERIFIED 必须逐一覆盖全部目标分辨率"))
    return issues
