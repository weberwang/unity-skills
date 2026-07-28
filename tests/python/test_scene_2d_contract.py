from pathlib import Path

from unity_workflow.contracts import load_yaml, validate_contract


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
TEMPLATES = ROOT / "templates"


def test_scene_2d_adaptation_recalculates_bands_and_crop() -> None:
    """2D 适配契约必须拒绝与高度或宽度基准数学结果矛盾的声明。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["testResolutions"][1]["expectedOutcome"] = "CROP"
    payload["testResolutions"][1]["expectedBandEdges"] = []

    issues = validate_contract("scene-2d-adaptation", payload)

    assert any(issue.path == "$.testResolutions[1].expectedOutcome" for issue in issues)
    assert any(issue.path == "$.testResolutions[1].expectedBandEdges" for issue in issues)


def test_scene_2d_adaptation_rejects_interactive_safe_area_overflow() -> None:
    """交互安全区不得借适配之名扩展到装饰边带。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["interactiveSafeArea"]["width"] = 1200

    issues = validate_contract("scene-2d-adaptation", payload)

    assert any(issue.path == "$.interactiveSafeArea" for issue in issues)


def test_scene_2d_adaptation_landscape_requires_width_matching() -> None:
    """横屏必须使用宽度适配及 UI Toolkit match=0。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["orientation"] = "LANDSCAPE"

    issues = validate_contract("scene-2d-adaptation", payload)

    assert any(issue.path == "$.worldCamera.fitAxis" for issue in issues)
    assert any(issue.path == "$.uiToolkit.match" for issue in issues)


def test_scene_2d_adaptation_accepts_landscape_width_matching() -> None:
    """完整横屏配置必须按宽度、match=0 和上下边带通过校验。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["orientation"] = "LANDSCAPE"
    payload["referenceResolution"] = {"width": 1920, "height": 1080}
    payload["worldCamera"]["fitAxis"] = "WIDTH"
    payload["uiToolkit"]["match"] = 0
    payload["uiToolkit"]["referenceResolution"] = {"width": 1920, "height": 1080}
    payload["interactiveSafeArea"].update({"width": 1920, "height": 1080})
    payload["decorativeBands"]["assets"][0]["edge"] = "TOP"
    payload["decorativeBands"]["assets"][1]["edge"] = "BOTTOM"
    payload["testResolutions"] = [
        {"id": "landscape-reference", "width": 1920, "height": 1080, "expectedOutcome": "EXACT", "expectedBandEdges": [], "status": "NOT_RUN"},
        {"id": "landscape-narrower", "width": 1600, "height": 1200, "expectedOutcome": "DECORATIVE_BANDS", "expectedBandEdges": ["TOP", "BOTTOM"], "status": "NOT_RUN"},
        {"id": "landscape-wider", "width": 2560, "height": 1080, "expectedOutcome": "CROP", "expectedBandEdges": [], "status": "NOT_RUN"},
    ]

    assert validate_contract("scene-2d-adaptation", payload) == []


def test_scene_2d_adaptation_verified_requires_passed_matrix_and_evidence() -> None:
    """未执行目标分辨率矩阵或缺少证据时不得把 2D 适配标记为已验证。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["status"] = "VERIFIED"

    issues = validate_contract("scene-2d-adaptation", payload)

    assert any(issue.path.startswith("$.verification") for issue in issues)
    assert any(issue.path.startswith("$.testResolutions") for issue in issues)


def test_scene_manifest_requires_adaptation_only_for_2d() -> None:
    """2D 场景必须绑定适配契约，3D 场景不得携带无意义的 2D 引用。"""
    payload = load_yaml(TEMPLATES / "scene-manifest.yaml")
    payload.pop("adaptation2D")
    assert any(issue.path == "$.adaptation2D" for issue in validate_contract("scene-manifest", payload))

    payload["dimension"] = "3D"
    assert validate_contract("scene-manifest", payload) == []


def test_scene_manifest_binds_2d_adaptation_to_current_snapshot() -> None:
    """2D 适配引用不得复用其他场景、版本或源码快照。"""
    payload = load_yaml(TEMPLATES / "scene-manifest.yaml")
    payload["adaptation2D"]["subjectVersion"] = "old-scene-version"

    issues = validate_contract("scene-manifest", payload)

    assert any(issue.path == "$.adaptation2D.subjectVersion" for issue in issues)


def test_scene_2d_adaptation_verified_requires_typed_complete_evidence() -> None:
    """结构化 Unity、EditMode 与逐分辨率截图证据齐全时才允许 VERIFIED。"""
    payload = load_yaml(TEMPLATES / "scene-2d-adaptation.yaml")
    payload["status"] = "VERIFIED"
    for test in payload["testResolutions"]:
        test["status"] = "PASS"
    binding = {
        "sceneId": payload["sceneId"],
        "sceneVersion": payload["sceneVersion"],
        "sourceRevision": payload["sourceRevision"],
        "projectStateVersion": payload["projectStateVersion"],
    }
    payload["verification"]["unityConfiguration"] = {
        "status": "PASS",
        "evidence": [{
            "type": "unity-2d-adaptation-config",
            "path": "Artifacts/Scenes/adaptation-config.json",
            "sha256": "1" * 64,
            **binding,
            "unityVersion": "6000.0.30f1",
            "componentPath": "SceneRoot/Adaptive2DViewport",
        }],
    }
    payload["verification"]["editMode"] = {
        "status": "PASS",
        "evidence": [{
            "type": "unity-editmode-test-report",
            "path": "Artifacts/TestResults/scene-2d.xml",
            "sha256": "2" * 64,
            **binding,
            "testSuite": "Scene2DAdaptationTests",
            "totalTests": 7,
            "passedTests": 7,
            "failedTests": 0,
        }],
    }
    payload["verification"]["runtimeScreenshots"] = {
        "status": "PASS",
        "evidence": [
            {
                "type": "runtime-2d-adaptation-screenshot",
                "path": f"Artifacts/Visual/Runtime/{test['id']}.png",
                "sha256": str(index + 3) * 64,
                **binding,
                "resolutionId": test["id"],
                "width": test["width"],
                "height": test["height"],
                "buildVersion": "0.1.0-dev.1",
                "blackBarsStatus": "PASS",
                "bandVisibilityStatus": "PASS",
                "interactionSafetyStatus": "PASS",
            }
            for index, test in enumerate(payload["testResolutions"])
        ],
    }

    assert validate_contract("scene-2d-adaptation", payload) == []
