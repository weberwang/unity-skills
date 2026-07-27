#!/usr/bin/env python3
"""按阶段初始化 Unity 游戏项目的中文协作文档。"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
PROJECT_DOC_TEMPLATES = SKILL_ROOT / "templates" / "project-docs"
CORE_FILES = ("project-profile.yaml", "GDD.md", "TDD.md", "control-plane.md")
OPTIONAL_FILES = {
    "balance": ("balance.md",),
    "assets": ("asset-register.yaml",),
    "audio": ("audio-plan.md",),
    "qa": ("qa-plan.md",),
    "distribution": ("distribution-matrix.md",),
    "release": ("release-checklist.md", "privacy-review.md", "third-party-notices.md"),
}
PROJECT_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{0,95}$")


def parse_include_list(value: str) -> list[str]:
    """解析可选交付物名称，并拒绝可能造成错误文件的拼写。"""
    names = [name.strip() for name in value.split(",") if name.strip()]
    unknown = sorted(set(names) - OPTIONAL_FILES.keys())
    if unknown:
        valid = "、".join(OPTIONAL_FILES)
        raise argparse.ArgumentTypeError(
            f"不支持的交付物：{'、'.join(unknown)}。可选值：{valid}。"
        )
    return list(dict.fromkeys(names))


def parse_project_id(value: str) -> str:
    """校验项目 ID，使初始化结果可直接通过现有项目契约。"""
    if PROJECT_ID_PATTERN.fullmatch(value) is None:
        raise argparse.ArgumentTypeError(
            "项目 ID 必须以小写字母或数字开头，只包含小写字母、数字、点和短横线。"
        )
    return value


def parse_args() -> argparse.Namespace:
    """解析目标项目、项目标识、阶段性交付物和覆盖授权。"""
    parser = argparse.ArgumentParser(description="按阶段初始化 Unity 游戏协作文档")
    parser.add_argument("--project-root", required=True, type=Path, help="Unity 项目根目录")
    parser.add_argument("--project-id", required=True, type=parse_project_id, help="机器可读项目 ID")
    parser.add_argument(
        "--include",
        type=parse_include_list,
        help="逗号分隔：balance、assets、audio、qa、distribution、release",
    )
    parser.add_argument("--force", action="store_true", help="明确覆盖本次选择的同名文档")
    return parser.parse_args()


def validate_project_root(project_root: Path) -> Path:
    """拒绝文件系统根目录，避免把初始化范围扩大到整个磁盘。"""
    resolved = project_root.resolve()
    if resolved == resolved.parent:
        raise ValueError("项目目录不能是文件系统根目录。")
    return resolved


def selected_files(include: list[str] | None) -> tuple[str, ...]:
    """默认返回核心文件；显式 include 时只返回对应阶段文件。"""
    if include is None:
        return CORE_FILES
    return tuple(filename for name in include for filename in OPTIONAL_FILES[name])


def render_template(filename: str, project_id: str) -> str:
    """渲染模板；项目配置复用受 Schema 验证的主模板。"""
    if filename == "project-profile.yaml":
        source = (SKILL_ROOT / "templates" / filename).read_text(encoding="utf-8")
        return re.sub(
            r"(?m)^projectId: .+$", f"projectId: {project_id}", source, count=1
        )
    return (PROJECT_DOC_TEMPLATES / filename).read_text(encoding="utf-8")


def initialize_documents(
    project_root: Path, project_id: str, filenames: tuple[str, ...], force: bool
) -> list[Path]:
    """仅创建或显式覆盖本次选择的文件，避免影响其他阶段文档。"""
    docs_dir = project_root / "docs"
    targets = [docs_dir / filename for filename in filenames]
    existing = [path for path in targets if path.exists()]
    if existing and not force:
        names = "、".join(path.name for path in existing)
        raise FileExistsError(f"拒绝覆盖已有文档：{names}。如确需覆盖，请显式传入 --force。")

    docs_dir.mkdir(parents=True, exist_ok=True)
    for path in targets:
        path.write_text(render_template(path.name, project_id), encoding="utf-8")
    return targets


def main() -> int:
    """执行初始化并输出可审计的写入路径。"""
    args = parse_args()
    try:
        project_root = validate_project_root(args.project_root)
        filenames = selected_files(args.include)
        written = initialize_documents(
            project_root, args.project_id, filenames, args.force
        )
    except (OSError, ValueError) as error:
        print(f"初始化失败：{error}", file=sys.stderr)
        return 1

    print("已初始化项目交付物：")
    for path in written:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
