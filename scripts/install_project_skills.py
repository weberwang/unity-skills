#!/usr/bin/env python3
"""把仓库中的 Unity 协作 Skills 复制到目标项目。"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def discover_skill_directories() -> tuple[Path, ...]:
    """按名称发现仓库根目录中的可安装 Skill，避免维护重复清单。"""
    return tuple(
        path
        for path in sorted(REPOSITORY_ROOT.iterdir(), key=lambda item: item.name)
        if path.is_dir() and (path / "SKILL.md").is_file()
    )


def validate_project_root(project_root: Path) -> Path:
    """要求目标是已有项目目录，并拒绝文件系统根目录。"""
    resolved = project_root.resolve()
    if not resolved.is_dir():
        raise ValueError(f"目标项目目录不存在或不是目录：{resolved}")
    if resolved == resolved.parent:
        raise ValueError("目标项目不能是文件系统根目录。")
    return resolved


def reject_symlink(path: Path, label: str) -> None:
    """拒绝符号链接目标，避免覆盖授权沿链接逃逸到项目目录之外。"""
    if path.is_symlink():
        raise ValueError(f"{label}不能是符号链接：{path}")


def install_skills(project_root: Path, force: bool) -> list[Path]:
    """复制全部 Skill；只有显式 force 才替换目标中的同名目录。"""
    target_root = project_root / ".agents" / "skills"
    reject_symlink(project_root / ".agents", ".agents 目录")
    reject_symlink(target_root, "Skills 目录")
    sources = discover_skill_directories()
    targets = [target_root / source.name for source in sources]
    for target in targets:
        reject_symlink(target, "Skill 目标")
    existing = [target for target in targets if target.exists()]
    if existing and not force:
        names = "、".join(target.name for target in existing)
        raise FileExistsError(f"拒绝覆盖已有 Skills：{names}。如确需替换，请传入 --force。")

    target_root.mkdir(parents=True, exist_ok=True)
    for source, target in zip(sources, targets, strict=True):
        if target.exists():
            # --force 是用户显式授权；删除范围被限制在 .agents/skills 下的已发现同名目录。
            shutil.rmtree(target)
        shutil.copytree(source, target)
    return targets


def parse_args() -> argparse.Namespace:
    """解析目标项目和显式覆盖授权。"""
    parser = argparse.ArgumentParser(description="安装 Unity 游戏协作 Skills")
    parser.add_argument("--project-root", required=True, type=Path, help="目标项目根目录")
    parser.add_argument("--force", action="store_true", help="替换目标中的同名 Skills")
    return parser.parse_args()


def main() -> int:
    """执行安装并输出每个可审计目标路径。"""
    args = parse_args()
    try:
        project_root = validate_project_root(args.project_root)
        installed = install_skills(project_root, args.force)
    except (OSError, ValueError) as error:
        print(f"安装失败：{error}", file=sys.stderr)
        return 1

    print("已安装 Unity 游戏协作 Skills：")
    for path in installed:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
