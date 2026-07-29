"""组合需要证据回读的清单投影与交付完整性校验。"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from unity_workflow.delivery_integrity import delivery_runtime_issues
from unity_workflow.projection_integrity import manifest_projection_issues


class EvidenceReader(Protocol):
    """描述完整性校验所需的门禁证据读取能力。"""

    active_decomposition: Mapping[str, Any]

    def verify_reference(self, reference: object) -> None:
        """验证单条证据引用。"""

    def verify_active_decomposition(self) -> None:
        """验证当前拆分引用。"""

    def _load_referenced_contract(self, reference: Mapping[str, Any]) -> dict[str, Any]:
        """加载已经验证的契约证据。"""


def manifest_projection_failure(
    reader: EvidenceReader, kind: str, payload: Mapping[str, Any]
) -> str | None:
    """回读当前拆分并返回模块或场景投影失败原因。"""
    reference = payload.get("decompositionPlan")
    if not isinstance(reference, Mapping):
        return f"{kind} 缺少 decompositionPlan"
    reader.verify_reference(reference)
    issues = manifest_projection_issues(kind, payload, reader._load_referenced_contract(reference))
    return "；".join(f"{item.path}: {item.message}" for item in issues) or None


def delivery_runtime_failure(
    reader: EvidenceReader, payload: Mapping[str, Any]
) -> str | None:
    """回读 G3 逐场景实机证据并返回全集或构建绑定失败原因。"""
    reader.verify_active_decomposition()
    decomposition = reader._load_referenced_contract(reader.active_decomposition)
    contracts: list[Mapping[str, Any]] = []
    for reference in payload.get("runtimeVisualEvidence", []):
        if not isinstance(reference, Mapping) or reference.get("type") != "runtime-visual-evidence":
            return "G3 runtimeVisualEvidence 只能引用 runtime-visual-evidence 契约"
        reader.verify_reference(reference)
        contracts.append(reader._load_referenced_contract(reference))
    issues = delivery_runtime_issues(payload, decomposition, contracts)
    return "；".join(f"{item.path}: {item.message}" for item in issues) or None
