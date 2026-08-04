"""验证全局视觉权威、截图参考边界与逐项资源生成门禁。"""

from pathlib import Path
import sys


ROOT = Path(__file__).parents[2] / "unity-development-workflow"
sys.path.insert(0, str(ROOT / "scripts"))

from unity_workflow.contracts import load_yaml, validate_contract  # noqa: E402
from unity_workflow.gate_evaluator import _EvidenceVerifier  # noqa: E402


TEMPLATES = ROOT / "templates"


def test_visual_policy_templates_are_valid() -> None:
    """四类视觉模板应可直接作为未批准工作单使用。"""
    for kind, filename in (
        ("visual-bible", "visual-bible.yaml"),
        ("image-generation", "image-generation.yaml"),
        ("image-task", "image-task.yaml"),
        ("split-plan", "split-plan.yaml"),
    ):
        assert validate_contract(kind, load_yaml(TEMPLATES / filename)) == []


def test_screenshot_reference_cannot_authorize_style_transfer() -> None:
    """截图参考即使有哈希也不能被声明为风格来源。"""
    payload = load_yaml(TEMPLATES / "image-generation.yaml")
    payload["references"] = [
        {
            "referenceType": "SCREENSHOT",
            "path": "ArtSource/References/screenshot.png",
            "sha256": "a" * 64,
            "allowedUses": ["CONTENT", "COMPOSITION"],
            "styleTransfer": "ALLOWED",
        }
    ]

    issues = validate_contract("image-generation", payload)

    assert any(issue.path.endswith("styleTransfer") for issue in issues)


def test_generated_candidate_cannot_reuse_screenshot_pixels() -> None:
    """进入漏斗前的生成候选必须拒绝直接复用截图像素。"""
    payload = load_yaml(TEMPLATES / "image-generation.yaml")
    payload.update(
        {
            "status": "GENERATED",
            "provider": "test-provider",
            "model": "test-model",
            "generatedAtUtc": "2026-07-28T08:00:00Z",
            "references": [
                {
                    "referenceType": "SCREENSHOT",
                    "path": "ArtSource/References/screenshot.png",
                    "sha256": "a" * 64,
                    "allowedUses": ["CONTENT"],
                    "styleTransfer": "FORBIDDEN",
                }
            ],
        }
    )
    payload["candidates"] = [
        {
            "id": f"candidate.{index}",
            "path": f"ArtSource/Generated/candidate-{index}.png",
            "sha256": character * 64,
            "visualVersion": f"candidate-v{index}",
            "width": payload["output"]["width"],
            "height": payload["output"]["height"],
        }
        for index, character in enumerate(("a", "b", "c"), start=1)
    ]

    issues = validate_contract("image-generation", payload)
    assert any(issue.path == "$.candidates[0].sha256" for issue in issues)


def test_scene_generation_binds_approved_visual_bible_version() -> None:
    """场景出图不能引用其他版本的全局视觉证据。"""
    payload = load_yaml(TEMPLATES / "image-generation.yaml")
    payload["visualBibleEvidence"]["subjectVersion"] = "visual-old"

    issues = validate_contract("image-generation", payload)

    assert any(issue.path == "$.visualBibleEvidence.subjectVersion" for issue in issues)


def test_prefab_structure_binds_current_visual_bible() -> None:
    """P0 结构必须引用当前项目和版本的全局视觉基线。"""
    payload = load_yaml(TEMPLATES / "prefab-structure.yaml")
    payload["visualBibleEvidence"]["subjectId"] = "other-project"
    payload["visualBibleEvidence"]["subjectVersion"] = "visual-old"

    paths = {issue.path for issue in validate_contract("prefab-structure", payload)}

    assert "$.visualBibleEvidence.subjectId" in paths
    assert "$.visualBibleEvidence.subjectVersion" in paths


def test_image_task_requires_one_declaration_per_reference() -> None:
    """逐项资源的每个参考路径都必须声明允许用途和禁止事项。"""
    payload = load_yaml(TEMPLATES / "image-task.yaml")
    payload["referenceDeclarations"] = []

    issues = validate_contract("image-task", payload)

    assert any(issue.path == "$.referenceDeclarations" for issue in issues)


def test_asset_map_rejects_unconfirmed_visual_source() -> None:
    """资产地图只能框选 P1 已确认并经 P2 审阅的高保真效果图。"""
    payload = load_yaml(TEMPLATES / "split-plan.yaml")
    payload["sourceImage"]["type"] = "approved-game-visual"

    issues = validate_contract("split-plan", payload)

    assert any(issue.path == "$.sourceImage.type" for issue in issues)


def test_split_source_must_match_confirmed_high_fidelity_candidate() -> None:
    """资产地图源图必须与 P1 已确认的高保真候选路径、哈希和版本一致。"""
    payload = load_yaml(TEMPLATES / "split-plan.yaml")
    payload["highFidelityGenerationEvidence"]["candidatePath"] = "ArtSource/Approved/other.png"
    payload["highFidelityGenerationEvidence"]["candidateSha256"] = "f" * 64
    payload["highFidelityGenerationEvidence"]["candidateVisualVersion"] = "game-v2"

    issues = validate_contract("split-plan", payload)

    paths = {issue.path for issue in issues}
    assert "$.highFidelityGenerationEvidence.candidatePath" in paths
    assert "$.highFidelityGenerationEvidence.candidateSha256" in paths
    assert "$.highFidelityGenerationEvidence.candidateVisualVersion" in paths


def test_annotated_preview_must_bind_exact_source_image_and_dimensions() -> None:
    """资产地图标注图必须明确证明框选发生在同一张高保真效果图上。"""
    payload = load_yaml(TEMPLATES / "split-plan.yaml")
    payload["annotatedPreview"].update(
        {
            "sourcePath": "ArtSource/Approved/other.png",
            "sourceSha256": "f" * 64,
            "sourceVersion": "game-old",
            "width": 1,
            "height": 1,
        }
    )

    paths = {issue.path for issue in validate_contract("split-plan", payload)}

    assert {
        "$.annotatedPreview.sourcePath",
        "$.annotatedPreview.sourceSha256",
        "$.annotatedPreview.sourceVersion",
        "$.annotatedPreview.width",
        "$.annotatedPreview.height",
    }.issubset(paths)


def test_high_fidelity_and_asset_map_evidence_types_are_contract_identifiers() -> None:
    """P1 高保真生成和 P3 资产地图证据不能退化为普通图片。"""
    split = load_yaml(TEMPLATES / "split-plan.yaml")
    split["highFidelityGenerationEvidence"]["type"] = "generated-image"
    assert any(
        issue.path == "$.highFidelityGenerationEvidence.type"
        for issue in validate_contract("split-plan", split)
    )

    image_task = load_yaml(TEMPLATES / "image-task.yaml")
    image_task["itemGenerationEvidence"] = {
        "type": "generated-image",
        "path": "Artifacts/Visual/generation.yaml",
        "sha256": "a" * 64,
        "subjectId": "imagegen.player-source-v1",
        "subjectVersion": image_task["sourceVersion"],
    }
    image_task["splitPlanEvidence"] = {
        "type": "visual-review",
        "path": "Artifacts/Visual/split.yaml",
        "sha256": "b" * 64,
        "subjectId": "split.player-v1",
        "subjectVersion": image_task["sourceVersion"],
        "itemId": image_task["resourceId"],
        "itemElementIndex": 1,
        "itemVersion": image_task["sourceVersion"],
        "itemSpecSha256": "c" * 64,
        "resourceId": image_task["resourceId"],
    }

    paths = {issue.path for issue in validate_contract("image-task", image_task)}
    assert "$.itemGenerationEvidence.type" in paths
    assert "$.splitPlanEvidence.type" in paths


def test_image_task_must_match_bound_asset_map_item() -> None:
    """逐项图片任务必须绑定资产地图中的资源 ID 和条目版本。"""
    payload = load_yaml(TEMPLATES / "image-task.yaml")
    payload["selectedCandidate"] = {
        "path": "ArtSource/Generated/player.png",
        "sha256": "a" * 64,
        "visualVersion": "player-v1",
    }
    payload["splitPlanEvidence"] = {
        "type": "split-plan",
        "path": "Artifacts/Visual/split.yaml",
        "sha256": "b" * 64,
        "subjectId": "split.player-v1",
        "subjectVersion": payload["sourceVersion"],
        "itemId": "asset.other",
        "itemElementIndex": 1,
        "itemVersion": "other-v1",
        "itemSpecSha256": "c" * 64,
        "resourceId": "asset.other",
    }

    issues = validate_contract("image-task", payload)

    paths = {issue.path for issue in issues}
    assert "$.splitPlanEvidence.resourceId" in paths
    assert "$.splitPlanEvidence.itemVersion" in paths


def test_approved_visual_bible_requires_selected_direction_and_final_review() -> None:
    """只有方向候选、选定方向和最终审查齐全时才可批准全局视觉。"""
    payload = load_yaml(TEMPLATES / "visual-bible.yaml")
    payload["status"] = "APPROVED"

    issues = validate_contract("visual-bible", payload)

    issue_paths = {issue.path for issue in issues}
    assert "$.selectedDirection" in issue_paths
    assert "$.finalVisualReview" in issue_paths


def test_gate_recurses_through_structured_visual_asset_chain(monkeypatch) -> None:
    """门禁必须递归读取全局视觉、高保真候选、资产地图和逐项审查证据。"""
    verifier = _EvidenceVerifier(
        Path.cwd(),
        "starfall-arena",
        "revision-1",
        "build-1",
        "G2",
        "project-state-v1",
        {
            "type": "decomposition-plan",
            "path": "Artifacts/Planning/decomposition.yaml",
            "sha256": "0" * 64,
            "subjectId": "decomposition.starfall-arena.v1",
            "subjectVersion": "decomposition-v1",
            "sourceRevision": "revision-1",
            "projectStateVersion": "project-state-v1",
        },
    )
    captured: list[dict[str, object]] = []
    monkeypatch.setattr(verifier, "verify_reference", captured.append)
    # 本用例只验证递归路由；跨文件候选/条目绑定由 gate_evaluator 专项测试覆盖。
    monkeypatch.setattr(verifier, "_verify_split_plan_source", lambda payload: None)
    monkeypatch.setattr(verifier, "_verify_image_task_split_binding", lambda payload: None)

    bible = load_yaml(TEMPLATES / "visual-bible.yaml")
    bible["directionCandidates"] = [
        {"type": "global-direction", "path": "Artifacts/Visual/direction.png", "sha256": "a" * 64}
    ]
    bible["selectedDirection"] = bible["directionCandidates"][0]
    bible["finalVisualReview"] = {
        "type": "visual-review", "path": "Artifacts/Visual/global-review.yaml", "sha256": "b" * 64
    }
    verifier._verify_nested("visual-bible", bible)

    generation = load_yaml(TEMPLATES / "image-generation.yaml")
    generation["references"] = [
        {
            "referenceType": "SCREENSHOT",
            "path": "ArtSource/References/screenshot.png",
            "sha256": "c" * 64,
            "allowedUses": ["CONTENT"],
            "styleTransfer": "FORBIDDEN",
        }
    ]
    verifier._verify_nested("image-generation", generation)

    split = load_yaml(TEMPLATES / "split-plan.yaml")
    verifier._verify_nested("split-plan", split)

    image_task = load_yaml(TEMPLATES / "image-task.yaml")
    image_task.update(
        {
            "visualBibleEvidence": split["visualBibleEvidence"],
            "itemGenerationEvidence": {
                "type": "image-generation",
                "path": "Artifacts/Visual/source.yaml",
                "sha256": "d" * 64,
                "subjectId": "imagegen.player-source-v1",
                "subjectVersion": image_task["sourceVersion"],
            },
            "splitPlanEvidence": {
                "type": "split-plan",
                "path": "Artifacts/Visual/split.yaml",
                "sha256": "e" * 64,
                "subjectId": "split.player-v1",
                "subjectVersion": image_task["sourceVersion"],
                "itemId": image_task["resourceId"],
                "itemElementIndex": 1,
                "itemVersion": image_task["sourceVersion"],
                "itemSpecSha256": "1" * 64,
                "resourceId": image_task["resourceId"],
            },
            "finalVisualReview": {
                "type": "visual-review",
                "path": "Artifacts/Visual/item-review.yaml",
                "sha256": "f" * 64,
            },
            "selectedCandidate": {
                "path": "ArtSource/Generated/item.png",
                "sha256": "1" * 64,
                "visualVersion": "item-v1",
            },
        }
    )
    verifier._verify_nested("image-task", image_task)

    evidence_types = {item.get("type") for item in captured}
    assert {
        "visual-bible",
        "visual-review",
        "visual-reference",
        "image-generation",
        "confirmed-high-fidelity-visual",
        "split-plan",
    }.issubset(evidence_types)
