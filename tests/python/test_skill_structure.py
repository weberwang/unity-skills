import re
from pathlib import Path

import yaml

from unity_workflow.cli import main
from unity_workflow.locks import LOCK_MODES
from unity_workflow.state import KNOWN_STATES


ROOT = Path(__file__).resolve().parents[2]
SKILL_DIR = ROOT / "unity-development-workflow"
SKILL_PATH = SKILL_DIR / "SKILL.md"
REFERENCE_NAMES = (
    "workflow-overview.md",
    "project-discovery.md",
    "decision-change-control.md",
    "module-planning.md",
    "multi-agent-execution.md",
    "worktree-integration.md",
    "foundation-workflow.md",
    "game-implementation.md",
    "scene-loop.md",
    "visual-workflow.md",
    "asset-pipeline.md",
    "quality-gates.md",
    "delivery.md",
    "project-artifacts.md",
)
ROLE_SKILLS = (
    "unity-game-production",
    "unity-game-architecture",
    "unity-gameplay-development",
    "unity-game-balance",
    "unity-game-visual-assets",
    "unity-game-audio",
    "unity-game-qa-performance",
    "unity-game-release",
)
COMMON_HEADINGS = (
    "## 何时读取",
    "## 输入",
    "## 执行步骤",
    "## 子代理角色与并行边界",
    "## 所需锁与 Unity 权限",
    "## 机器可读输出",
    "## 通过条件",
    "## 失败与恢复出口",
)


def read_text(path: Path) -> str:
    """以 UTF-8 读取文档，确保测试不会依赖 Windows 默认编码。"""
    return path.read_text(encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, object]:
    """解析 Skill 顶部 YAML，拒绝缺失或未闭合的 frontmatter。"""
    match = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, flags=re.DOTALL)
    assert match, "SKILL.md 必须以完整 YAML frontmatter 开头"
    return yaml.safe_load(match.group(1))


def markdown_targets(text: str) -> list[str]:
    """提取普通 Markdown 链接目标，忽略外部 URL 与页内锚点。"""
    targets = re.findall(r"\[[^\]]+\]\(([^)]+)\)", text)
    return [
        target.split("#", 1)[0]
        for target in targets
        if target and not target.startswith(("#", "http://", "https://"))
    ]


def test_skill_frontmatter_name_and_size_are_constrained():
    """Skill 元数据只能包含触发所需字段，入口必须保持精简。"""
    text = read_text(SKILL_PATH)
    frontmatter = parse_frontmatter(text)

    assert set(frontmatter) == {"name", "description"}
    assert frontmatter["name"] == "unity-development-workflow"
    assert len(text.splitlines()) < 500


def test_skill_links_all_direct_references():
    """全部按需参考必须由 SKILL.md 一层直链且真实存在。"""
    text = read_text(SKILL_PATH)
    targets = set(markdown_targets(text))

    for name in REFERENCE_NAMES:
        relative = f"references/{name}"
        assert relative in targets, f"SKILL.md 缺少直链：{relative}"
        assert (SKILL_DIR / relative).is_file(), f"参考文件不存在：{relative}"


def test_role_skills_are_installable_and_routed_from_orchestrator():
    """角色模块必须是可独立安装的 Skill，并由总控按名称路由。"""
    orchestrator = read_text(SKILL_PATH)
    for skill_name in ROLE_SKILLS:
        skill_path = ROOT / skill_name / "SKILL.md"
        agent_path = ROOT / skill_name / "agents" / "openai.yaml"
        assert skill_path.is_file(), f"角色 Skill 不存在：{skill_name}"
        assert agent_path.is_file(), f"角色界面配置不存在：{skill_name}"
        frontmatter = parse_frontmatter(read_text(skill_path))
        assert set(frontmatter) == {"name", "description"}
        assert frontmatter["name"] == skill_name
        assert f"${skill_name}" in orchestrator


def test_each_reference_has_the_common_contract():
    """每份参考都必须给执行代理相同的输入、权限、输出和恢复契约。"""
    for name in REFERENCE_NAMES:
        text = read_text(SKILL_DIR / "references" / name)
        for heading in COMMON_HEADINGS:
            assert heading in text, f"{name} 缺少标题：{heading}"


def test_required_workflow_concepts_are_documented():
    """跨文档必须覆盖核心阶段、技术栈、审批与编排约束。"""
    documents = [SKILL_PATH, *(SKILL_DIR / "references" / name for name in REFERENCE_NAMES)]
    corpus = "\n".join(read_text(path) for path in documents)
    required_terms = (
        "S00",
        "G0",
        "G1",
        "G2",
        "G3",
        "Visual Bible",
        "场景小循环",
        "垂直切片",
        "资源流水线",
        "Worktree",
        "快速通道",
        "标准通道",
        "发布通道",
        "子代理优先",
        "显式绑定",
        "unity-mcp",
        "用户视觉批准",
        "UI Toolkit",
        "Windows",
    )

    for term in required_terms:
        assert term in corpus, f"文档缺少核心概念：{term}"


def test_skill_has_no_readme_or_placeholders():
    """Skill 本体不混入 README；仅允许作为 UPM 包规范文件的 Toolkit README。"""
    readmes = {
        path.relative_to(SKILL_DIR).as_posix()
        for path in SKILL_DIR.rglob("*")
        if path.name.lower() == "readme.md"
    }
    assert readmes <= {
        "assets/unity-workflow-toolkit/Packages/com.project.unity-workflow-toolkit/README.md"
    }

    documents = [
        SKILL_PATH,
        *(SKILL_DIR / "references" / name for name in REFERENCE_NAMES),
        *(ROOT / name / "SKILL.md" for name in ROLE_SKILLS),
    ]
    for path in documents:
        text = read_text(path)
        assert not re.search(r"\b(?:TBD|TODO)\b", text, flags=re.IGNORECASE), path


def test_local_links_stay_inside_skill_and_do_not_form_reference_chains():
    """本地链接不能越出 Skill；参考文档不得继续链接第二层说明。"""
    for path in SKILL_DIR.rglob("*.md"):
        for target in markdown_targets(read_text(path)):
            resolved = (path.parent / target).resolve()
            assert resolved.is_relative_to(SKILL_DIR.resolve()), f"链接越界：{path} -> {target}"
            assert resolved.exists(), f"链接目标缺失：{path} -> {target}"
            if path.parent.name == "references":
                assert resolved.suffix.lower() != ".md", f"禁止参考链：{path} -> {target}"


def test_multi_agent_reference_matches_the_real_state_machine():
    """多代理说明必须给出完整主路径，并准确描述重试耗尽后的出口。"""
    text = read_text(SKILL_DIR / "references" / "multi-agent-execution.md")
    main_path = "BLOCKED → READY → ASSIGNED → RUNNING → SELF_VERIFIED → REVIEWING → APPROVED → INTEGRATED → VERIFIED → DONE"

    assert main_path in text
    assert "两次重派后再次失败" in text
    assert "保持 `RETRYABLE_FAILED`" in text
    assert "释放" in text and "主代理" in text
    for state in KNOWN_STATES:
        assert state in text, f"多代理说明缺少真实状态：{state}"


def test_skill_cli_examples_use_real_lock_modes_states_and_validate_contract(tmp_path: Path, capsys):
    """Skill 示例只能使用实现支持的锁模式与状态，validate 示例必须可执行成功。"""
    text = read_text(SKILL_PATH)
    command_lines = [line.strip() for line in text.splitlines() if line.startswith("uv run scripts/workflow.py")]
    validate_line = next(line for line in command_lines if " validate " in f" {line} ")
    source = tmp_path / "project-profile.yaml"
    source.write_text(
        read_text(SKILL_DIR / "templates" / "project-profile.yaml"),
        encoding="utf-8",
    )
    argv = validate_line.split()[3:]
    argv[argv.index("--source") + 1] = str(source)

    assert main(argv) == 0
    assert "校验通过" in capsys.readouterr().out

    lock_line = next(line for line in command_lines if " lock " in f" {line} ")
    request = lock_line.split("--request ", 1)[1].split()[0]
    _, mode, _ = request.split(":", 2)
    assert mode in LOCK_MODES

    transition_line = next(line for line in command_lines if " transition " in f" {line} ")
    target_state = transition_line.split("--to ", 1)[1].split()[0]
    assert target_state in KNOWN_STATES
    assert target_state == "READY", "首个独立 transition 示例必须可从默认 BLOCKED 合法进入 READY"
