"""任务依赖图的行为测试。"""

from pathlib import Path

import pytest
import yaml

from unity_workflow.cli import main
from unity_workflow.dag import TaskGraph


def complete_task(task_id: str, depends_on: list[str]) -> dict[str, object]:
    """生成 ready CLI 所需的完整 L1 任务契约。"""
    return {
        "schemaVersion": "1.0",
        "id": task_id,
        "module": "Tests",
        "dependsOn": depends_on,
        "scope": {"read": [], "write": [f"Artifacts/{task_id}.json"]},
        "locks": [{"type": "path", "resource": f"Artifacts/{task_id}.json", "mode": "write"}],
        "execution": {"agentRole": "test-agent", "executionLevel": "L1", "isolation": "path-ownership"},
        "acceptance": [{"type": "contract-validation", "required": True}],
        "outputs": [f"Artifacts/{task_id}.json"],
    }


def test_ready_tasks_requires_completed_dependencies_and_sorts_ids() -> None:
    """仅返回依赖完成且自身可调度的任务，并按 ID 排序。"""
    graph = TaskGraph.from_contracts(
        [
            {"id": "z-task", "dependsOn": ["root"]},
            {"id": "root", "dependsOn": []},
            {"id": "a-task", "dependsOn": ["root"]},
        ]
    )

    assert graph.ready_tasks({"root": "DONE", "z-task": "BLOCKED", "a-task": "READY"}) == [
        "a-task",
        "z-task",
    ]


def test_ready_tasks_blocks_failed_dependencies() -> None:
    """依赖进入失败终态时不得把后继任务标记为就绪。"""
    graph = TaskGraph.from_contracts([{"id": "root", "dependsOn": []}, {"id": "next", "dependsOn": ["root"]}])

    for status in ("REJECTED", "CONFLICTED", "CANCELLED"):
        assert graph.ready_tasks({"root": status, "next": "BLOCKED"}) == []


@pytest.mark.parametrize(
    ("tasks", "message"),
    [
        ([{"id": "a", "dependsOn": ["missing"]}], "missing"),
        ([{"id": "a", "dependsOn": ["a"]}], "a"),
        ([{"id": "a", "dependsOn": []}, {"id": "a", "dependsOn": []}], "a"),
    ],
)
def test_graph_rejects_invalid_dependencies(tasks: list[dict[str, object]], message: str) -> None:
    """未知依赖、自依赖与重复 ID 都必须被拒绝。"""
    with pytest.raises(ValueError, match=message):
        TaskGraph.from_contracts(tasks)


def test_graph_reports_cycle_ids_in_stable_order() -> None:
    """环错误必须包含按字典序稳定排列的环内任务。"""
    with pytest.raises(ValueError, match=r"a, b, c"):
        TaskGraph.from_contracts(
            [
                {"id": "c", "dependsOn": ["a"]},
                {"id": "a", "dependsOn": ["b"]},
                {"id": "b", "dependsOn": ["c"]},
            ]
        )


def test_ready_cli_outputs_one_sorted_id_per_line(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """ready 命令从 YAML 与状态文件读取数据并逐行输出就绪 ID。"""
    tasks_path = tmp_path / "tasks.yaml"
    state_path = tmp_path / "state.json"
    tasks_path.write_text(
        yaml.safe_dump([complete_task("b", []), complete_task("a", [])]),
        encoding="utf-8",
    )
    state_path.write_text(
        '{"states":[{"evidence":[],"retry_count":0,"status":"BLOCKED","task_id":"a","updated_at_utc":"2026-01-01T00:00:00Z"},{"evidence":[],"retry_count":0,"status":"READY","task_id":"b","updated_at_utc":"2026-01-01T00:00:00Z"}]}\n',
        encoding="utf-8",
    )

    assert main(["ready", "--tasks", str(tasks_path), "--state", str(state_path)]) == 0
    assert capsys.readouterr().out == "a\nb\n"


def test_ready_cli_returns_input_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """ready 命令遇到非法任务文件时返回输入错误码。"""
    tasks_path = tmp_path / "tasks.yaml"
    tasks_path.write_text("tasks: invalid\n", encoding="utf-8")

    assert main(["ready", "--tasks", str(tasks_path), "--state", str(tmp_path / "state.json")]) == 2
    assert capsys.readouterr().err


def test_graph_accepts_chain_of_five_thousand_tasks() -> None:
    """合法深链不得受 Python 递归深度限制。"""
    tasks = [
        {"id": f"task-{index:04d}", "dependsOn": [] if index == 4999 else [f"task-{index + 1:04d}"]}
        for index in range(5000)
    ]

    graph = TaskGraph.from_contracts(tasks)
    assert graph.ready_tasks({"task-4999": "BLOCKED"}) == ["task-4999"]


def test_ready_cli_reports_deep_cycle_without_traceback(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """深层成环任务应以输入错误退出，且不得泄漏 traceback。"""
    tasks_path = tmp_path / "tasks.yaml"
    tasks = [
        complete_task(f"task-{index:04d}", [f"task-{(index + 1) % 5000:04d}"])
        for index in range(5000)
    ]
    tasks_path.write_text(yaml.safe_dump(tasks), encoding="utf-8")

    assert main(["ready", "--tasks", str(tasks_path), "--state", str(tmp_path / "state.json")]) == 2
    captured = capsys.readouterr()
    assert "Traceback" not in captured.err
    assert "task-0000" in captured.err
