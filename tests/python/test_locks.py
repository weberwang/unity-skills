"""资源锁表的行为测试。"""

import json
from pathlib import Path
import subprocess
import sys

import pytest

from unity_workflow.cli import main
from unity_workflow.locks import LockRequest, LockTable


def request(lock_type: str, resource: str, mode: str = "write") -> LockRequest:
    """创建简洁的锁请求测试数据。"""
    return LockRequest(lock_type, resource, mode)


def test_read_locks_share_and_write_lock_conflicts() -> None:
    """同资源读锁可共享，写锁必须排他。"""
    table = LockTable.load(Path("missing-locks.json"))
    assert table.acquire("a", [request("path", "Assets/X.asset", "read")]).acquired
    assert table.acquire("b", [request("path", "Assets/X.asset", "read")]).acquired

    result = table.acquire("c", [request("path", "Assets/X.asset")])
    assert not result.acquired
    assert result.conflicts == ("a", "b")


def test_parent_path_write_lock_respects_directory_boundary(tmp_path: Path) -> None:
    """父目录写锁覆盖真正子路径，但不误伤相同前缀目录。"""
    table = LockTable.load(tmp_path / "locks.json")
    assert table.acquire("owner", [request("path", "Assets/A")]).acquired
    assert not table.acquire("child", [request("path", "Assets/A/file.prefab", "read")]).acquired
    assert table.acquire("sibling", [request("path", "Assets/AB/file.prefab", "read")]).acquired


@pytest.mark.parametrize("lock_type", ["scene", "prefab"])
def test_unity_asset_lock_conflicts_with_asset_and_meta_paths(tmp_path: Path, lock_type: str) -> None:
    """场景与预制体锁必须同时保护目标资源及其 meta 文件。"""
    table = LockTable.load(tmp_path / "locks.json")
    assert table.acquire("asset", [request(lock_type, "Assets/World/Item.prefab")]).acquired
    assert not table.acquire("file", [request("path", "Assets/World/Item.prefab", "read")]).acquired
    result = table.acquire("meta", [request("path", "Assets/World/Item.prefab.meta", "read")])
    assert result.conflicts == ("asset",)


def test_unity_instance_locks_are_isolated_by_instance(tmp_path: Path) -> None:
    """Unity 实例锁只与同一实例发生冲突。"""
    table = LockTable.load(tmp_path / "locks.json")
    assert table.acquire("a", [request("unity_instance", "editor-1")]).acquired
    assert table.acquire("b", [request("unity_instance", "editor-2")]).acquired
    assert not table.acquire("c", [request("unity_instance", "editor-1")]).acquired


def test_acquire_is_idempotent_and_batch_is_all_or_nothing(tmp_path: Path) -> None:
    """重复申请不增加条目，批量冲突时不保留任何部分结果。"""
    path = tmp_path / "locks.json"
    table = LockTable.load(path)
    lock = request("path", "Assets/A.asset")
    assert table.acquire("a", [lock, lock]).acquired
    assert table.acquire("a", [lock]).acquired
    assert table.acquire("owner", [request("path", "Assets/B.asset")]).acquired

    result = table.acquire(
        "candidate",
        [request("path", "Assets/C.asset"), request("path", "Assets/B.asset")],
    )
    assert not result.acquired
    assert table.release("candidate") == 0
    assert table.release("a") == 1


def test_save_is_stable_atomic_and_load_handles_missing_or_corrupt_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """锁表稳定原子保存，缺失文件为空表，损坏文件携带路径报错。"""
    path = tmp_path / "locks.json"
    table = LockTable.load(path)
    table.acquire("z", [request("path", "Assets/Z.asset")])
    table.acquire("a", [request("path", "Assets/A.asset", "read")])
    replaced: list[Path] = []
    original_replace = Path.replace

    def track_replace(source: Path, target: Path) -> Path:
        """记录原子替换调用并执行真实替换。"""
        replaced.append(target)
        return original_replace(source, target)

    monkeypatch.setattr(Path, "replace", track_replace)
    table.save()
    assert replaced == [path]
    assert path.read_bytes().endswith(b"\n")
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert [item["task_id"] for item in payload["locks"]] == ["a", "z"]
    assert LockTable.load(tmp_path / "absent.json").release("nobody") == 0

    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match=str(corrupt).replace("\\", r"\\")):
        LockTable.load(corrupt)


def test_lock_cli_acquire_conflict_list_and_release(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """lock 命令支持申请、冲突、列出和释放完整流程。"""
    path = tmp_path / "locks.json"
    base = ["lock", "--file", str(path)]
    assert main([*base, "acquire", "--task", "a", "--request", "path:write:Assets/A.asset"]) == 0
    assert json.loads(capsys.readouterr().out)["acquired"] is True
    assert main([*base, "acquire", "--task", "b", "--request", "path:read:Assets/A.asset"]) == 3
    assert json.loads(capsys.readouterr().out)["conflicts"] == ["a"]
    assert main([*base, "list"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["task_id"] == "a"
    assert main([*base, "release", "--task", "a"]) == 0
    assert json.loads(capsys.readouterr().out) == {"released": 1}


def test_lock_cli_returns_input_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """lock 命令遇到非法请求时返回输入错误码。"""
    assert main(
        ["lock", "--file", str(tmp_path / "locks.json"), "acquire", "--task", "a", "--request", "bad"]
    ) == 2
    assert capsys.readouterr().err


def test_lock_save_cleans_temporary_file_when_replace_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """锁表原子替换失败时必须清理临时文件且保留旧快照。"""
    path = tmp_path / "locks.json"
    table = LockTable.load(path)
    table.save()
    old_snapshot = path.read_text(encoding="utf-8")
    table.acquire("a", [request("path", "Assets/A.asset")])

    def fail_replace(_source: Path, _target: Path) -> Path:
        """模拟原子替换失败。"""
        raise OSError("replace failed")

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError, match="replace failed"):
        table.save()
    assert path.read_text(encoding="utf-8") == old_snapshot
    assert list(tmp_path.glob(".locks.json.*.tmp")) == []


def test_two_cli_processes_cannot_both_acquire_same_path(tmp_path: Path) -> None:
    """跨进程 load→acquire→save 必须串行，竞争同一路径时只能一个成功。"""
    root = Path(__file__).parents[2]
    script = root / "unity-development-workflow" / "scripts" / "workflow.py"
    lock_file = tmp_path / "locks.json"

    def command(task_id: str) -> list[str]:
        """构造两个仅任务 ID 不同的真实 CLI 进程命令。"""
        return [
            sys.executable,
            str(script),
            "lock",
            "--file",
            str(lock_file),
            "acquire",
            "--task",
            task_id,
            "--request",
            "scene:write:Assets/Scenes/S01.unity",
        ]

    first = subprocess.Popen(command("scene.writer-a"), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    second = subprocess.Popen(command("scene.writer-b"), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    _, first_error = first.communicate(timeout=10)
    _, second_error = second.communicate(timeout=10)

    assert sorted((first.returncode, second.returncode)) == [0, 3], (
        first_error.decode(errors="replace"),
        second_error.decode(errors="replace"),
    )
    entries = LockTable.load(lock_file).entries()
    assert len(entries) == 1
