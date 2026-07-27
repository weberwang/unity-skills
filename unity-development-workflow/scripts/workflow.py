# /// script
# requires-python = ">=3.10"
# dependencies = ["jsonschema>=4.25,<5", "PyYAML>=6.0,<7"]
# ///
"""Unity 开发工作流 CLI 的直接执行入口。"""

from unity_workflow.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
