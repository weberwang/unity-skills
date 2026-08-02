"""校验各目标平台交付包与逐场景实机视觉证据的一致性。"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from unity_workflow.platform_contract import delivery_primary_artifact


@dataclass(frozen=True, slots=True)
class DeliveryIntegrityIssue:
    """描述交付证据覆盖或构建绑定问题。"""

    path: str
    message: str


def delivery_runtime_issues(
    delivery: Mapping[str, Any],
    decomposition: Mapping[str, Any],
    runtime_contracts: Sequence[Mapping[str, Any]],
) -> list[DeliveryIntegrityIssue]:
    """要求每个批准场景恰有一份来自当前平台主制品的实机证据。"""
    issues: list[DeliveryIntegrityIssue] = []
    artifact = delivery_primary_artifact(delivery)
    if artifact is None:
        issues.append(DeliveryIntegrityIssue("$.artifacts", "交付必须且只能包含一个与目标平台匹配的主制品"))
        return issues
    artifact_hash = artifact.get("sha256")
    platform = delivery.get("platform")
    decision = decomposition.get("decision")
    approved = set(
        decision.get("approvedSceneIds", []) if isinstance(decision, Mapping) else []
    )
    scene_ids = [item.get("sceneId") for item in runtime_contracts]
    counts = Counter(scene_ids)
    missing = sorted(approved - set(scene_ids))
    extra = sorted(str(item) for item in set(scene_ids) - approved)
    duplicates = sorted(str(item) for item, count in counts.items() if count > 1)
    if missing or extra or duplicates:
        details = []
        if missing:
            details.append(f"缺少场景：{', '.join(missing)}")
        if extra:
            details.append(f"未批准场景：{', '.join(extra)}")
        if duplicates:
            details.append(f"重复场景：{', '.join(duplicates)}")
        issues.append(DeliveryIntegrityIssue("$.runtimeVisualEvidence", "实机视觉证据必须无重复覆盖 approvedSceneIds 全集；" + "；".join(details)))
    for index, runtime in enumerate(runtime_contracts):
        if runtime.get("platformId") != platform:
            issues.append(
                DeliveryIntegrityIssue(
                    f"$.runtimeVisualEvidence[{index}]",
                    "实机视觉证据的 platformId 与交付平台不一致",
                )
            )
        if runtime.get("buildArtifactSha256") != artifact_hash:
            issues.append(
                DeliveryIntegrityIssue(
                    f"$.runtimeVisualEvidence[{index}]",
                    "实机视觉证据的 buildArtifactSha256 与当前平台主制品不一致",
                )
            )
    return issues
