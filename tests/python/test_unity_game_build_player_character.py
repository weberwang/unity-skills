import importlib.util
import hashlib
import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).parents[2]
SKILL_DIR = ROOT / "unity-game-build-player-character"
SKILL_PATH = SKILL_DIR / "SKILL.md"
AGENT_PATH = SKILL_DIR / "agents" / "openai.yaml"
CONTRACT_PATH = SKILL_DIR / "references" / "player-character-contract.md"
PROJECT_BASELINE_REFERENCE_PATH = (
    SKILL_DIR / "references" / "player-character-project-baseline.md"
)
PROJECT_BASELINE_SCHEMA_PATH = (
    SKILL_DIR / "schemas" / "player-character-project-baseline.schema.json"
)
PROJECT_BASELINE_TEMPLATE_PATH = (
    SKILL_DIR / "templates" / "player-character-project-baseline.yaml"
)
ANIMATION_REFERENCE_PATH = (
    SKILL_DIR / "references" / "player-character-skeletal-animation.md"
)
ANIMATION_SCHEMA_PATH = (
    SKILL_DIR / "schemas" / "player-character-skeletal-animation.schema.json"
)
ANIMATION_TEMPLATE_PATH = (
    SKILL_DIR / "templates" / "player-character-skeletal-animation.yaml"
)
SKELETAL_SYSTEM_REFERENCE_PATH = (
    SKILL_DIR / "references" / "player-character-2d-skeletal-system.md"
)
SKELETAL_SYSTEM_SCHEMA_PATH = (
    SKILL_DIR / "schemas" / "player-character-2d-skeletal-system.schema.json"
)
SKELETAL_SYSTEM_TEMPLATE_PATH = (
    SKILL_DIR / "templates" / "player-character-2d-skeletal-system.yaml"
)
AUDIT_PATH = SKILL_DIR / "scripts" / "audit_player_character.py"
ANIMATION_VALIDATOR_PATH = (
    SKILL_DIR / "scripts" / "validate_player_character_animation.py"
)
SKELETAL_SYSTEM_VALIDATOR_PATH = (
    SKILL_DIR / "scripts" / "validate_player_character_skeletal_system.py"
)


def read_text(path: Path) -> str:
    """以 UTF-8 读取人物 Skill 文件。"""
    return path.read_text(encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, object]:
    """解析并返回 SKILL.md 顶部 YAML。"""
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, flags=re.DOTALL)
    assert match is not None
    payload = yaml.safe_load(match.group(1))
    assert isinstance(payload, dict)
    return payload


def load_audit_module():
    """从真实 Skill 路径加载审计脚本。"""
    spec = importlib.util.spec_from_file_location("audit_player_character", AUDIT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_animation_validator_module():
    """从真实 Skill 路径加载骨骼动画规格验证脚本。"""
    spec = importlib.util.spec_from_file_location(
        "validate_player_character_animation",
        ANIMATION_VALIDATOR_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_skeletal_system_validator_module():
    """从真实 Skill 路径加载完整骨骼系统验证脚本。"""
    spec = importlib.util.spec_from_file_location(
        "validate_player_character_skeletal_system",
        SKELETAL_SYSTEM_VALIDATOR_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def materialize_project_baseline_bindings(
    root: Path,
    payload: dict[str, object],
) -> dict[str, bytes]:
    """为模板中的全部绑定创建可复算文件，并让重复路径共享同一内容。"""
    bindings: dict[str, list[dict[str, str]]] = {}

    def collect(value: object) -> None:
        """递归收集 path/sha256 绑定，避免测试漏掉新增证据字段。"""
        if isinstance(value, dict):
            if set(value) == {"path", "sha256"}:
                binding = value
                bindings.setdefault(str(binding["path"]), []).append(binding)
                return
            for nested in value.values():
                collect(nested)
        elif isinstance(value, list):
            for nested in value:
                collect(nested)

    collect(payload)
    contents = {path: f"fixture:{path}\n".encode() for path in bindings}
    unity_assets = [*payload["layerMappings"], *payload["runtimeAssets"].values()]
    for asset in unity_assets:
        contents[asset["meta"]["path"]] = (
            f"fileFormatVersion: 2\nguid: {asset['guid']}\n".encode()
        )

    for relative, content in contents.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        for binding in bindings[relative]:
            binding["sha256"] = digest
    return contents


def test_skill_metadata_and_direct_reference_are_valid() -> None:
    """人物 Skill 必须可触发、保持精简并直链人物合同。"""
    text = read_text(SKILL_PATH)
    frontmatter = parse_frontmatter(text)

    assert set(frontmatter) == {"name", "description"}
    assert frontmatter["name"] == "unity-game-build-player-character"
    assert "P3-002" in frontmatter["description"]
    assert "流畅、自然、有张力" in frontmatter["description"]
    assert "references/player-character-contract.md" in text
    assert "references/player-character-project-baseline.md" in text
    assert "references/player-character-2d-skeletal-system.md" in text
    assert "references/player-character-skeletal-animation.md" in text
    assert CONTRACT_PATH.is_file()
    assert PROJECT_BASELINE_REFERENCE_PATH.is_file()
    assert PROJECT_BASELINE_SCHEMA_PATH.is_file()
    assert PROJECT_BASELINE_TEMPLATE_PATH.is_file()
    assert SKELETAL_SYSTEM_REFERENCE_PATH.is_file()
    assert SKELETAL_SYSTEM_SCHEMA_PATH.is_file()
    assert SKELETAL_SYSTEM_TEMPLATE_PATH.is_file()
    assert SKELETAL_SYSTEM_VALIDATOR_PATH.is_file()
    assert ANIMATION_REFERENCE_PATH.is_file()
    assert ANIMATION_SCHEMA_PATH.is_file()
    assert ANIMATION_TEMPLATE_PATH.is_file()
    assert ANIMATION_VALIDATOR_PATH.is_file()
    assert len(text.splitlines()) < 500


def test_agent_interface_invokes_exact_skill_name() -> None:
    """界面默认提示必须显式调用当前人物 Skill。"""
    payload = yaml.safe_load(read_text(AGENT_PATH))

    assert payload["interface"]["display_name"] == "Unity 玩家角色与骨骼动画"
    assert 25 <= len(payload["interface"]["short_description"]) <= 64
    assert "$unity-game-build-player-character" in payload["interface"]["default_prompt"]


def test_audit_script_keeps_visual_judgment_outside_automation(tmp_path: Path) -> None:
    """审计脚本只能通过技术与证据门，不能自动宣布视觉通过。"""
    module = load_audit_module()
    png_path = tmp_path / "layer.png"
    # PNG 头足以验证 IHDR 解析；像素语义继续由视觉审阅承担。
    png_path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + (13).to_bytes(4, "big")
        + b"IHDR"
        + (2048).to_bytes(4, "big")
        + (2048).to_bytes(4, "big")
        + bytes((8, 6, 0, 0, 0))
        + b"\x00\x00\x00\x00"
    )

    assert module.inspect_png(png_path) == {
        "width": 2048,
        "height": 2048,
        "bitDepth": 8,
        "colorType": 6,
    }
    source = read_text(AUDIT_PATH)
    assert "PLAYER_CHARACTER_EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED" in source
    assert '"UNITY_VISUAL_PASS"' not in source
    assert 'parser.add_argument("--baseline", required=True' in source


def test_player_character_project_baseline_template_matches_strict_schema() -> None:
    """当前项目对照模板必须可直接校验，并固定完整项目、区域和状态矩阵。"""
    schema = json.loads(read_text(PROJECT_BASELINE_SCHEMA_PATH))
    payload = yaml.safe_load(read_text(PROJECT_BASELINE_TEMPLATE_PATH))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    assert list(validator.iter_errors(payload)) == []
    assert payload["recordType"] == "PLAYER_CHARACTER_PROJECT_BASELINE"
    assert payload["status"] == "PLAYER_CHARACTER_BASELINE_AUDITED"
    assert [item["checkId"] for item in payload["checks"]] == [
        "authority.target-binding",
        "authority.approval-binding",
        "project.unity-root",
        "layers.runtime-set",
        "import.sprite-settings",
        "sprite-library.mapping",
        "sprite-atlas.membership",
        "prefab.references",
    ]
    assert [item["id"] for item in payload["visualComparison"]["regions"]] == [
        "full-body",
        "face",
        "hair",
        "shoulders-chest",
        "hands",
        "waist-hips",
        "pants-shoes",
    ]
    assert [item["id"] for item in payload["visualComparison"]["states"]] == [
        "neutral",
        "smile",
        "speaking",
        "frown",
        "blink",
        "raised-brows",
        "accessories-on",
        "accessories-off",
    ]
    assert len(payload["layerMappings"]) == 17


def test_player_character_project_baseline_reference_has_standard_contract() -> None:
    """专项参考必须沿用当前项目的输入、权限、输出和恢复结构。"""
    text = read_text(PROJECT_BASELINE_REFERENCE_PATH)
    for heading in (
        "## 何时读取",
        "## 输入",
        "## 执行步骤",
        "## 子代理角色与并行边界",
        "## 所需锁与 Unity 权限",
        "## 机器可读输出",
        "## 通过条件",
        "## 失败与恢复出口",
    ):
        assert heading in text


def test_player_character_animation_reference_has_standard_contract() -> None:
    """骨骼动画参考必须提供完整执行、权限、输出和恢复契约。"""
    text = read_text(ANIMATION_REFERENCE_PATH)
    for heading in (
        "## 何时读取",
        "## 输入",
        "## 执行步骤",
        "## 子代理角色与并行边界",
        "## 所需锁与 Unity 权限",
        "## 机器可读输出",
        "## 通过条件",
        "## 失败与恢复出口",
    ):
        assert heading in text


def test_player_character_skeletal_system_reference_has_standard_contract() -> None:
    """完整骨骼系统参考必须覆盖执行、权限、输出和恢复契约。"""
    text = read_text(SKELETAL_SYSTEM_REFERENCE_PATH)
    for heading in (
        "## 何时读取",
        "## 输入",
        "## 执行步骤",
        "## 子代理角色与并行边界",
        "## 所需锁与 Unity 权限",
        "## 机器可读输出",
        "## 通过条件",
        "## 失败与恢复出口",
    ):
        assert heading in text


def test_skill_resource_names_are_scoped_and_consistent() -> None:
    """专项资源名必须显式包含玩家角色语义，并保持 kebab-case 或 snake_case。"""
    assert {path.name for path in (SKILL_DIR / "references").iterdir()} == {
        "player-character-contract.md",
        "player-character-2d-skeletal-system.md",
        "player-character-project-baseline.md",
        "player-character-skeletal-animation.md",
    }
    assert {path.name for path in (SKILL_DIR / "schemas").iterdir()} == {
        "player-character-2d-skeletal-system.schema.json",
        "player-character-project-baseline.schema.json",
        "player-character-skeletal-animation.schema.json",
    }
    assert {path.name for path in (SKILL_DIR / "templates").iterdir()} == {
        "player-character-2d-skeletal-system.yaml",
        "player-character-project-baseline.yaml",
        "player-character-skeletal-animation.yaml",
    }
    assert {path.name for path in (SKILL_DIR / "scripts").iterdir() if path.suffix == ".py"} == {
        "audit_player_character.py",
        "validate_player_character_animation.py",
        "validate_player_character_skeletal_system.py",
    }


def test_project_baseline_audit_rehashes_every_bound_file(tmp_path: Path) -> None:
    """基线审计必须接受完整当前项目快照，并在任一绑定漂移后失败。"""
    module = load_audit_module()
    payload = yaml.safe_load(read_text(PROJECT_BASELINE_TEMPLATE_PATH))
    materialize_project_baseline_bindings(tmp_path, payload)
    module.TARGET_SHA256 = payload["authorityBindings"]["target"]["sha256"]
    baseline_path = (
        tmp_path
        / "Artifacts/Visual/P4/g1-v0.6/p3-002/v5/project-baselines/player-character-baseline.yaml"
    )
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    baseline_path.write_text(yaml.safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")

    errors: list[str] = []
    result = module.validate_project_baseline(tmp_path, baseline_path, errors)
    assert result is not None
    assert errors == []

    target_path = tmp_path / module.TARGET_RELATIVE_PATH
    target_path.write_bytes(target_path.read_bytes() + b"drift")
    drift_errors: list[str] = []
    module.validate_project_baseline(tmp_path, baseline_path, drift_errors)
    assert any("哈希不一致" in error for error in drift_errors)


def test_player_character_skeletal_system_template_matches_contract() -> None:
    """系统模板必须覆盖第一轮全部骨骼生产与运行时问题。"""
    schema = json.loads(read_text(SKELETAL_SYSTEM_SCHEMA_PATH))
    payload = yaml.safe_load(read_text(SKELETAL_SYSTEM_TEMPLATE_PATH))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    module = load_skeletal_system_validator_module()

    assert list(validator.iter_errors(payload)) == []
    assert module.validate_skeletal_system(payload) == []
    assert payload["pipeline"]["deformationMode"] == "HYBRID_SPRITE_SKIN"
    assert payload["rig"]["boneCount"] == 30
    assert len(payload["rendering"]["sortingBands"]) >= 6
    assert payload["skinning"]["maxBoneInfluencesPerVertex"] <= 4
    assert payload["ik"]["solveOrder"] == [
        "BASE_CLIP",
        "RUNTIME_IK",
        "SECONDARY_MOTION",
    ]
    assert payload["animationControl"]["applyRootMotion"] is False
    assert payload["facing"]["physicsRootUnscaled"] is True
    assert payload["gameplaySync"]["animationEventRole"] == "PRESENTATION_ONLY"
    assert payload["physics"]["transformOwnership"] == "RIGIDBODY_ROOT_BONES_VISUAL_ONLY"
    assert payload["attachments"]["skeletonReuse"] == "REQUIRED"
    assert payload["performance"]["targetPlatform"] == "MOBILE"


def test_skeletal_system_validator_rejects_cross_module_drift() -> None:
    """滑步、物理翻转、关键事件缺失和挂点漂移必须被系统门禁阻断。"""
    module = load_skeletal_system_validator_module()
    payload = yaml.safe_load(read_text(SKELETAL_SYSTEM_TEMPLATE_PATH))
    payload["animationControl"]["locomotion"]["expectedSpeedUnitsPerSecond"] = 1.25
    payload["facing"]["facingNode"] = payload["physics"]["rigidbodyPath"]
    payload["gameplaySync"]["criticalEvents"].remove("COMBO_WINDOW")
    payload["attachments"]["slots"][0]["bone"] = "Head"

    errors = module.validate_skeletal_system(payload)

    assert any("步幅除以循环时长" in error for error in errors)
    assert any("必须绑定 Rig 声明的翻转根" in error for error in errors)
    assert any("完整声明六类关键玩法事件" in error for error in errors)
    assert any("复用 Rig 中同 ID 的稳定挂点骨" in error for error in errors)


def test_skeletal_system_validator_rejects_budget_and_transition_collapse() -> None:
    """约束或跟随对象超预算以及统一过渡时长必须阻断。"""
    module = load_skeletal_system_validator_module()
    payload = yaml.safe_load(read_text(SKELETAL_SYSTEM_TEMPLATE_PATH))
    payload["performance"]["maxActiveConstraintsPerCharacter"] = 2
    payload["performance"]["maxBoneFollowersPerCharacter"] = 2
    for profile in payload["animationControl"]["transitionProfiles"]:
        profile["durationSeconds"] = 0.10

    errors = module.validate_skeletal_system(payload)

    assert any("小于已启用 IK 约束数量" in error for error in errors)
    assert any("小于当前骨骼跟随对象数量" in error for error in errors)
    assert any("不得让所有动作类别共用同一过渡时长" in error for error in errors)


def test_player_character_animation_template_matches_schema_and_semantics() -> None:
    """胜利动作模板必须完整表达关键姿势、身体力学、节奏、轨迹和接触。"""
    schema = json.loads(read_text(ANIMATION_SCHEMA_PATH))
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    module = load_animation_validator_module()

    assert list(validator.iter_errors(payload)) == []
    assert module.validate_animation_spec(payload) == []
    assert len(payload["keyPoses"]) == 6
    assert len(payload["timeScript"]) == 5
    assert payload["schemaVersion"] == "2.0"
    assert payload["motionQuality"]["priorityOrder"] == [
        "KEY_POSE",
        "TIMING",
        "TRAJECTORY",
        "SECONDARY_MOTION",
    ]
    assert payload["motionQuality"]["playbackReviewRates"] == [1.0, 0.25]
    assert all("bodyMechanics" in pose for pose in payload["keyPoses"])
    assert all("trajectoryPlan" in segment for segment in payload["timeScript"])
    assert all("ikBlend" in segment for segment in payload["timeScript"])
    assert payload["rigBinding"]["skeletalSystemVersion"] == "player-skeletal-system-v1"
    assert "skeletalSystemEvidence" in payload["rigBinding"]
    assert payload["builder"]["curveSource"] == "APPROVED_RESOLVED_POSES"
    assert all(
        pose["worldTargets"]["space"] == "CHARACTER_ROOT_WORLD"
        for pose in payload["keyPoses"]
    )


def test_animation_validator_rejects_hardcoded_local_rotation() -> None:
    """动画设计规格不得退回猜测局部骨骼角度。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["keyPoses"][0]["localRotationDegrees"] = 62

    errors = module.validate_animation_spec(payload)

    assert any("禁止写入猜测的局部骨骼角度" in error for error in errors)


def test_animation_draft_can_precede_pose_evidence() -> None:
    """初稿可以先冻结意图和目标，验收截图必须在姿势卡批准前补齐。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["status"] = "PLAYER_CHARACTER_ANIMATION_DRAFT"
    payload.pop("poseCardsApproval")
    payload["regression"]["captures"] = []
    for pose in payload["keyPoses"]:
        pose["status"] = "DRAFT"
        pose.pop("acceptanceScreenshot")
        pose.pop("resolvedPoseEvidence")

    assert module.validate_animation_spec(payload) == []


def test_animation_validator_rejects_foot_slip_and_timeline_drift() -> None:
    """连续固定脚滑或时间段不再绑定姿势时必须阻断。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["keyPoses"][2]["contacts"]["leftFoot"]["anchor"]["x"] = -0.05
    payload["timeScript"][2]["startSeconds"] = 0.30

    errors = module.validate_animation_spec(payload)

    assert any("脚底锚点发生漂移" in error for error in errors)
    assert any("必须等于起始姿势时间" in error for error in errors)


def test_animation_validator_rejects_weightless_timing_and_ik_quality() -> None:
    """承重点、节奏反差、传力顺序和固定脚 IK 失真时必须阻断。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["keyPoses"][1]["bodyMechanics"]["support"] = "AIRBORNE"
    payload["motionQuality"]["timingContrast"]["maxBurstToPreparationRatio"] = 0.20
    payload["timeScript"][1]["leadChain"] = ["Hands", "Shoulders", "Spine", "Pelvis"]
    payload["timeScript"][1]["ikBlend"]["leftFoot"]["startWeight"] = 0.0

    errors = module.validate_animation_spec(payload)

    assert any("腾空姿势不得声明固定脚" in error for error in errors)
    assert any("缺少速度反差" in error for error in errors)
    assert any("必须由骨盆开始传力" in error for error in errors)
    assert any("固定脚起点 IK 权重不得低于 0.95" in error for error in errors)


def test_animation_regression_requires_dynamic_motion_review() -> None:
    """进入动态回归后必须绑定正常速度、慢放、轨迹和逐段审查。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["status"] = "PLAYER_CHARACTER_ANIMATION_REGRESSION_REVIEWING"
    payload["buildResult"] = {
        "clip": {
            "path": payload["builder"]["outputClipPath"],
            "sha256": "3" * 64,
        },
        "curveReport": {
            "path": "Artifacts/Animation/P3-002/Victory/curve-report.yaml",
            "sha256": "4" * 64,
        },
        "generatedAtUtc": "2026-08-06T08:00:00Z",
        "builderVersion": "player-character-animation-builder-v2",
    }

    errors = module.validate_animation_spec(payload)

    assert any("motionReview" in error and "required property" in error for error in errors)


def test_animation_validator_blocks_over_budget_pose_approval() -> None:
    """姿势超出网格能力时必须先返修网格或权重。"""
    module = load_animation_validator_module()
    payload = yaml.safe_load(read_text(ANIMATION_TEMPLATE_PATH))
    payload["keyPoses"][3]["deformationAssessment"]["status"] = "MESH_REVISION_REQUIRED"

    errors = module.validate_animation_spec(payload)

    assert any("超出变形预算时不得批准姿势卡" in error for error in errors)
