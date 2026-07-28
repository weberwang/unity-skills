import re
from pathlib import Path

import yaml


ROOT = Path(__file__).parents[2]
MODELING_DIR = ROOT / "unity-game-3d-modeling"
TEXTURING_DIR = ROOT / "unity-game-3d-texturing"


def read_text(path: Path) -> str:
    """以 UTF-8 读取 3D Skill 文档，避免依赖系统默认编码。"""
    return path.read_text(encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, object]:
    """解析 Skill 顶部的 YAML frontmatter 并拒绝不完整入口。"""
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, flags=re.DOTALL)
    assert match, "3D SKILL.md 必须以完整 YAML frontmatter 开头"
    return yaml.safe_load(match.group(1))


def test_3d_skills_have_valid_entry_and_agent_interface() -> None:
    """两个 3D Skill 必须具备名称匹配的入口、参考和代理界面配置。"""
    expectations = {
        "unity-game-3d-modeling": "references/mcp-modeling-workflow.md",
        "unity-game-3d-texturing": "references/pbr-texture-workflow.md",
    }

    for skill_name, reference in expectations.items():
        skill_dir = ROOT / skill_name
        skill_text = read_text(skill_dir / "SKILL.md")
        frontmatter = parse_frontmatter(skill_text)
        agent = yaml.safe_load(read_text(skill_dir / "agents" / "openai.yaml"))

        assert set(frontmatter) == {"name", "description"}
        assert frontmatter["name"] == skill_name
        assert reference in skill_text
        assert (skill_dir / reference).is_file()
        assert agent["interface"]["display_name"]
        assert f"${skill_name}" in agent["interface"]["default_prompt"]


def test_modeling_skill_defines_geometry_handoff_and_validation() -> None:
    """建模 Skill 必须覆盖 MCP 制作、几何交付和 Unity 导入验收边界。"""
    text = read_text(MODELING_DIR / "SKILL.md")
    required_terms = (
        "Visual Bible",
        "DCC MCP",
        "拓扑",
        "UV",
        "LOD",
        "Collider",
        "ModelImporter",
        "SHA-256",
        "BLOCKED",
        "$unity-game-3d-texturing",
        "$unity-game-qa-performance",
    )

    for term in required_terms:
        assert term in text, f"建模 Skill 缺少职责或证据约束：{term}"
    assert "不负责 PBR 纹理" in text
    assert "不自批" in text


def test_texturing_skill_defines_pbr_handoff_and_validation() -> None:
    """贴图 Skill 必须绑定冻结模型版本并覆盖 PBR 与 URP 接入验收。"""
    text = read_text(TEXTURING_DIR / "SKILL.md")
    required_terms = (
        "Visual Bible",
        "DCC MCP",
        "模型/UV 哈希",
        "PBR",
        "BaseColor",
        "Normal",
        "Metallic",
        "AO",
        "Smoothness",
        "sRGB",
        "URP",
        "TextureImporter",
        "Material",
        "BLOCKED",
        "$unity-game-3d-modeling",
    )

    for term in required_terms:
        assert term in text, f"贴图 Skill 缺少职责或证据约束：{term}"
    assert "不静默修改" in text
    assert "独立" in text and "QA" in text


def test_3d_skills_restrict_high_risk_mcp_writes() -> None:
    """两个 3D Skill 必须限制任意代码能力并保护来源与并发写入。"""
    for skill_dir in (MODELING_DIR, TEXTURING_DIR):
        text = read_text(skill_dir / "SKILL.md")
        required_terms = (
            "用户确认",
            "任意代码执行",
            "操作系统命令",
            "网络",
            "环境变量",
            "版本化派生文件",
        )
        for term in required_terms:
            assert term in text, f"{skill_dir.name} 缺少 MCP 安全约束：{term}"
        assert "同时只允许一个写代理" in text
