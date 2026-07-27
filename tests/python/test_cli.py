from pathlib import Path

from unity_workflow.cli import build_parser, main


def test_cli_exposes_required_commands():
    """CLI 帮助必须暴露后续工作流需要的所有命令。"""
    parser = build_parser()
    help_text = parser.format_help()
    for command in ("validate", "compile", "ready", "lock", "transition", "gate", "asset"):
        assert command in help_text


def test_validate_accepts_a_valid_contract(tmp_path: Path, capsys):
    """validate 必须真实校验有效 YAML 契约并返回简短成功信息。"""
    source = tmp_path / "project-profile.yaml"
    source.write_text(
        (Path("unity-development-workflow/templates/project-profile.yaml")).read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    assert main(["validate", "--kind", "project-profile", "--source", str(source)]) == 0
    captured = capsys.readouterr()
    assert captured.out.strip() == "校验通过：project-profile"
    assert captured.err == ""


def test_validate_returns_two_without_traceback_for_input_errors(tmp_path: Path, capsys):
    """文件、契约和 kind 参数错误必须稳定返回 2 且不泄露 traceback。"""
    invalid = tmp_path / "invalid.yaml"
    invalid.write_text("{}\n", encoding="utf-8")
    cases = (
        ["validate", "--kind", "project-profile", "--source", str(tmp_path / "missing.yaml")],
        ["validate", "--kind", "project-profile", "--source", str(invalid)],
        ["validate", "--kind", "unknown", "--source", str(invalid)],
    )

    for argv in cases:
        assert main(argv) == 2
        captured = capsys.readouterr()
        assert captured.out == ""
        assert "错误：" in captured.err
        assert "Traceback" not in captured.err
