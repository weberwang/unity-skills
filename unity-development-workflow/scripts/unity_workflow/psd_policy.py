"""检测开发资产目录中被禁止的 Photoshop 文档。"""

from __future__ import annotations

from pathlib import Path


PROHIBITED_EXTENSIONS = {".psd", ".psb", ".psdt"}
DEVELOPMENT_ASSET_ROOTS = ("Assets", "ArtSource", "Artifacts")


def find_prohibited_photoshop_documents(project_root: Path) -> list[Path]:
    """返回开发资产根目录内的 PSD、PSB 或 PSDT 文件，结果稳定排序。"""
    root = project_root.resolve()
    matches: list[Path] = []
    for relative_root in DEVELOPMENT_ASSET_ROOTS:
        candidate_root = root / relative_root
        if not candidate_root.exists():
            continue
        matches.extend(
            path.relative_to(root)
            for path in candidate_root.rglob("*")
            if path.is_file() and path.suffix.lower() in PROHIBITED_EXTENSIONS
        )
    return sorted(matches, key=lambda path: path.as_posix().lower())
