from hashlib import sha256
import json
from pathlib import Path

from unity_workflow.compiler import compile_job
from unity_workflow.contracts import load_yaml, validate_contract
from unity_workflow.locks import LockRequest, LockTable


ROOT = Path(__file__).parents[2] / "unity-development-workflow"


def test_image_contract_compiles_to_hashed_unity_job(tmp_path: Path) -> None:
    """视觉任务必须从已校验 YAML 编译为带来源哈希的确定性 JSON Job。"""
    source = tmp_path / "contracts" / "image-task.yaml"
    source.parent.mkdir()
    source.write_text((ROOT / "templates" / "image-task.yaml").read_text(encoding="utf-8"), encoding="utf-8")
    output = tmp_path / "image-task.json"

    compile_job("image-task", source, output, tmp_path)
    payload = json.loads(output.read_text(encoding="utf-8"))

    assert payload["kind"] == "image-task"
    assert payload["sourceSha256"]
    canonical_payload = json.dumps(
        payload["payload"], ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    assert payload["payloadSha256"] == sha256(canonical_payload).hexdigest()
    assert payload["payload"]["status"] == "REVIEWING"


def test_two_scene_writers_cannot_acquire_the_same_unity_asset(tmp_path: Path) -> None:
    """两个场景任务竞争同一路径时只能有一个持有正式写锁。"""
    table = LockTable(tmp_path / "workflow-locks.json")
    request = LockRequest("scene", "Assets/Scenes/S01.unity", "write")

    first = table.acquire("scene.s01.gameplay", [request])
    second = table.acquire("scene.s01.ui", [request])

    assert first.acquired
    assert not second.acquired
    assert second.conflicts


def test_visual_task_cannot_be_approved_without_user_record() -> None:
    """视觉任务不能由代理直接标为批准，必须携带用户批准证据。"""
    payload = load_yaml(ROOT / "templates" / "image-task.yaml")
    payload["status"] = "APPROVED"

    issues = validate_contract("image-task", payload)

    assert any(issue.path == "$.approvals" for issue in issues)
