import importlib.util
import hashlib
import json
import re
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).parents[2]
SKILL_DIR = ROOT / "star-blogger-player-character"
SKILL_PATH = SKILL_DIR / "SKILL.md"
AGENT_PATH = SKILL_DIR / "agents" / "openai.yaml"
CONTRACT_PATH = SKILL_DIR / "references" / "character-contract.md"
COMPARISON_REFERENCE_PATH = SKILL_DIR / "references" / "project-comparison.md"
COMPARISON_SCHEMA_PATH = SKILL_DIR / "schemas" / "project-comparison.schema.json"
COMPARISON_TEMPLATE_PATH = SKILL_DIR / "templates" / "project-comparison.yaml"
AUDIT_PATH = SKILL_DIR / "scripts" / "audit_character_gate.py"


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
    spec = importlib.util.spec_from_file_location("audit_character_gate", AUDIT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def materialize_comparison_bindings(root: Path, payload: dict[str, object]) -> dict[str, bytes]:
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
    assert frontmatter["name"] == "star-blogger-player-character"
    assert "P3-002" in frontmatter["description"]
    assert "references/character-contract.md" in text
    assert "references/project-comparison.md" in text
    assert CONTRACT_PATH.is_file()
    assert COMPARISON_REFERENCE_PATH.is_file()
    assert COMPARISON_SCHEMA_PATH.is_file()
    assert COMPARISON_TEMPLATE_PATH.is_file()
    assert len(text.splitlines()) < 500


def test_agent_interface_invokes_exact_skill_name() -> None:
    """界面默认提示必须显式调用当前人物 Skill。"""
    payload = yaml.safe_load(read_text(AGENT_PATH))

    assert payload["interface"]["display_name"] == "Star Blogger 玩家角色"
    assert 25 <= len(payload["interface"]["short_description"]) <= 64
    assert "$star-blogger-player-character" in payload["interface"]["default_prompt"]


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
    assert "EVIDENCE_TECHNICAL_PASS_VISUAL_REVIEW_STILL_REQUIRED" in source
    assert '"UNITY_VISUAL_PASS"' not in source
    assert 'parser.add_argument("--baseline", required=True' in source


def test_project_comparison_template_matches_strict_schema() -> None:
    """当前项目对照模板必须可直接校验，并固定完整项目、区域和状态矩阵。"""
    schema = json.loads(read_text(COMPARISON_SCHEMA_PATH))
    payload = yaml.safe_load(read_text(COMPARISON_TEMPLATE_PATH))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    assert list(validator.iter_errors(payload)) == []
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


def test_project_comparison_reference_has_standard_execution_contract() -> None:
    """专项参考必须沿用当前项目的输入、权限、输出和恢复结构。"""
    text = read_text(COMPARISON_REFERENCE_PATH)
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


def test_project_baseline_audit_rehashes_every_bound_file(tmp_path: Path) -> None:
    """基线审计必须接受完整当前项目快照，并在任一绑定漂移后失败。"""
    module = load_audit_module()
    payload = yaml.safe_load(read_text(COMPARISON_TEMPLATE_PATH))
    materialize_comparison_bindings(tmp_path, payload)
    module.TARGET_SHA256 = payload["authorityBindings"]["target"]["sha256"]
    baseline_path = tmp_path / "Artifacts/Visual/P4/g1-v0.6/p3-002/v5/comparisons/baseline.yaml"
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
