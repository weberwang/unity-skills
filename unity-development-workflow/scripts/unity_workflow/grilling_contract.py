"""校验通用拷问记录的批准完整性与身份绑定。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Protocol


class IssueFactory(Protocol):
    """定义公共校验问题构造器所需的最小接口。"""

    def __call__(self, path: str, message: str) -> Any:
        """创建一个带稳定路径和消息的问题。"""


def grilling_record_issues(
    payload: Mapping[str, Any], issue_factory: IssueFactory
) -> list[Any]:
    """阻止未完成拷问、未决问题或旧批准被标记为 APPROVED。"""
    questions = _mapping_items(payload.get("questions"))
    issues = _duplicate_id_issues(questions, "questions", "问题", issue_factory)
    for field, label in (
        ("decisions", "决策"),
        ("dependencies", "依赖"),
        ("rejectedItems", "拒绝项"),
        ("unresolvedItems", "未决项"),
    ):
        issues.extend(
            _duplicate_id_issues(
                _mapping_items(payload.get(field)), field, label, issue_factory
            )
        )
    for index, question in enumerate(questions):
        options = _mapping_items(question.get("options"))
        issues.extend(
            _duplicate_id_issues(
                options,
                f"questions[{index}].options",
                "问题选项",
                issue_factory,
            )
        )
        option_ids = {
            option.get("id")
            for option in options
            if isinstance(option.get("id"), str)
        }
        if question.get("recommendation") not in option_ids:
            issues.append(
                issue_factory(
                    f"$.questions[{index}].recommendation",
                    "推荐项必须引用当前问题的一个 option ID",
                )
            )

    if payload.get("status") != "APPROVED":
        return issues

    for index, question in enumerate(questions):
        if question.get("status") != "ANSWERED" or not _nonempty(question.get("answer")):
            issues.append(
                issue_factory(
                    f"$.questions[{index}]",
                    "APPROVED 拷问记录的每个问题都必须已回答",
                )
            )
    unresolved = payload.get("unresolvedItems")
    if isinstance(unresolved, Sequence) and not isinstance(unresolved, (str, bytes)) and unresolved:
        issues.append(issue_factory("$.unresolvedItems", "APPROVED 拷问记录不得包含未决项"))
    for index, dependency in enumerate(_mapping_items(payload.get("dependencies"))):
        if dependency.get("status") != "CONFIRMED":
            issues.append(
                issue_factory(
                    f"$.dependencies[{index}].status",
                    "APPROVED 拷问记录的依赖必须全部 CONFIRMED",
                )
            )

    approval = payload.get("userApproval")
    if not isinstance(approval, Mapping):
        issues.append(issue_factory("$.userApproval", "APPROVED 拷问记录必须包含用户批准"))
        return issues
    expected = {
        "approvalType": "GRILLING_DECISION",
        "authority": "USER",
        "subjectId": payload.get("id"),
        "subjectVersion": payload.get("version"),
    }
    for field, value in expected.items():
        if approval.get(field) != value:
            issues.append(
                issue_factory(
                    f"$.userApproval.{field}",
                    "用户批准必须以 GRILLING_DECISION 绑定当前拷问记录",
                )
            )
    return issues


def _mapping_items(value: object) -> list[Mapping[str, Any]]:
    """提取映射数组，基础类型错误交由 JSON Schema 处理。"""
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _duplicate_id_issues(
    items: Sequence[Mapping[str, Any]],
    field: str,
    label: str,
    issue_factory: IssueFactory,
) -> list[Any]:
    """拒绝记录内重复 ID，避免批准对象出现歧义。"""
    seen: set[str] = set()
    issues: list[Any] = []
    for index, item in enumerate(items):
        item_id = item.get("id")
        if isinstance(item_id, str) and item_id in seen:
            issues.append(issue_factory(f"$.{field}[{index}].id", f"{label} ID 重复: {item_id}"))
        if isinstance(item_id, str):
            seen.add(item_id)
    return issues


def _nonempty(value: object) -> bool:
    """仅接受去除空白后仍有内容的用户回答。"""
    return isinstance(value, str) and bool(value.strip())
