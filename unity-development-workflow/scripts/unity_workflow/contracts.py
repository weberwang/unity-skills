"""加载并校验 Unity 工作流契约。"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from functools import cache
from json import loads
from pathlib import Path
import re
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from unity_workflow.decomposition_contract import (
    EXPECTED_GATE_CHECKS,
    decomposition_freshness_issues,
    decomposition_plan_issues,
    decomposition_reference_issues,
)
from unity_workflow.prefab_contracts import prefab_assembly_issues, prefab_structure_issues

from .scene_2d_contract import validate_scene_2d_adaptation, validate_scene_manifest_2d_reference

from unity_workflow.visual_contracts import (
    image_generation_policy_issues,
    image_task_policy_issues,
    split_plan_policy_issues,
    visual_bible_policy_issues,
)


SCHEMA_DIRECTORY = Path(__file__).parents[2] / "schemas"
SCHEMA_FILENAMES = {
    "project-profile": "project-profile.schema.json",
    "module-manifest": "module-manifest.schema.json",
    "decomposition-plan": "decomposition-plan.schema.json",
    "task-contract": "task-contract.schema.json",
    "scene-manifest": "scene-manifest.schema.json",
    "image-task": "image-task.schema.json",
    "visual-bible": "visual-bible.schema.json",
    "quality-report": "quality-report.schema.json",
    "quality-gates": "quality-gates.schema.json",
    "asset-register": "asset-register.schema.json",
    "delivery-manifest": "delivery-manifest.schema.json",
    "visual-capture": "visual-capture.schema.json",
    "delivery-preflight": "delivery-preflight.schema.json",
    "runtime-visual-evidence": "runtime-visual-evidence.schema.json",
    "s00-report": "s00-report.schema.json",
    "scene-report": "scene-report.schema.json",
    "visual-review": "visual-review.schema.json",
    "split-plan": "split-plan.schema.json",
    "image-generation": "image-generation.schema.json",
    "registration-record": "registration-record.schema.json",
    "scene-2d-adaptation": "scene-2d-adaptation.schema.json",
    "prefab-structure": "prefab-structure.schema.json",
    "prefab-assembly": "prefab-assembly.schema.json",
}


RFC3339_DATE_TIME = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})[Tt]"
    r"(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?"
    r"(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$",
    re.ASCII,
)


def _is_rfc3339_date_time(value: object) -> bool:
    """在官方可选格式依赖缺失时严格校验 RFC 3339 date-time。"""
    if not isinstance(value, str):
        return True
    match = RFC3339_DATE_TIME.fullmatch(value)
    if match is None:
        return False
    try:
        date.fromisoformat(match.group("date"))
    except ValueError:
        return False
    return True


FORMAT_CHECKER = FormatChecker()
# 优先复用 jsonschema 随可选依赖注册的官方检查器，仅在缺失时注册严格回退。
if "date-time" not in FORMAT_CHECKER.checkers:
    FORMAT_CHECKER.checks("date-time")(_is_rfc3339_date_time)


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    """描述契约中一个稳定定位的校验问题。"""

    path: str
    message: str


def load_yaml(path: Path, *, source_bytes: bytes | None = None) -> dict[str, Any]:
    """以 UTF-8 加载 YAML；可直接解析调用方提供的单次字节快照。"""
    try:
        raw = path.read_bytes() if source_bytes is None else source_bytes
        payload = yaml.safe_load(raw.decode("utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        raise ValueError(f"无法加载 YAML {path}: {error}") from error

    if not isinstance(payload, dict):
        raise ValueError(f"YAML 顶层必须是映射: {path}")
    return payload


def validate_contract(
    kind: str,
    payload: Mapping[str, Any],
) -> list[ValidationIssue]:
    """使用对应的 2020-12 Schema 校验契约并稳定排序错误。"""
    schema_filename = SCHEMA_FILENAMES.get(kind)
    if schema_filename is None:
        raise ValueError(f"未知契约类型: {kind}")

    validator = _validator(schema_filename)
    issues = [
        ValidationIssue(_error_path(error), error.message)
        for error in validator.iter_errors(payload)
    ]
    if kind == "module-manifest":
        issues.extend(_module_graph_issues(payload))
        issues.extend(_convert_decomposition_issues(decomposition_reference_issues(payload)))
    if kind == "decomposition-plan":
        issues.extend(_convert_decomposition_issues(decomposition_plan_issues(payload)))
    if kind == "quality-gates":
        issues.extend(_identifier_set_issues(payload, "gates", {"G0", "G1", "G2", "G3"}, "质量门"))
        issues.extend(_quality_gate_pass_issues(payload))
    if kind == "scene-manifest":
        issues.extend(ValidationIssue(path, message) for path, message in validate_scene_manifest_2d_reference(payload))
        issues.extend(_scene_approval_issues(payload))
        issues.extend(_convert_decomposition_issues(decomposition_reference_issues(payload)))
    if kind == "s00-report":
        issues.extend(_convert_decomposition_issues(decomposition_reference_issues(payload)))
    if kind == "image-task":
        issues.extend(_image_task_approval_issues(payload))
        issues.extend(image_task_policy_issues(payload, ValidationIssue))
    if kind == "visual-bible":
        issues.extend(_visual_bible_approval_issues(payload))
        issues.extend(visual_bible_policy_issues(payload, ValidationIssue))
    if kind == "visual-review":
        issues.extend(_visual_review_issues(payload))
    if kind == "split-plan":
        issues.extend(_split_plan_issues(payload))
        issues.extend(split_plan_policy_issues(payload, ValidationIssue))
    if kind == "image-generation":
        issues.extend(_image_generation_issues(payload))
        issues.extend(image_generation_policy_issues(payload, ValidationIssue))
    if kind == "registration-record":
        issues.extend(_registration_record_issues(payload))
    if kind == "delivery-manifest":
        issues.extend(_delivery_approval_issues(payload))
    if kind == "runtime-visual-evidence":
        issues.extend(_runtime_visual_approval_issues(payload))
    if kind == "asset-register":
        issues.extend(_asset_register_issues(payload))
    if kind == "quality-report":
        issues.extend(_quality_status_issues(payload))
    if kind == "scene-2d-adaptation":
        issues.extend(
            ValidationIssue(path, message)
            for path, message in validate_scene_2d_adaptation(payload)
        )
    if kind == "prefab-structure":
        issues.extend(prefab_structure_issues(payload, ValidationIssue))
    if kind == "prefab-assembly":
        issues.extend(prefab_assembly_issues(payload, ValidationIssue))
    return sorted(set(issues), key=lambda issue: (issue.path, issue.message))


@cache
def _validator(schema_filename: str) -> Draft202012Validator:
    """缓存完整 Schema 注册表，避免批量任务就绪检查反复读取磁盘。"""
    schemas = _load_schemas()
    registry = Registry()
    for schema in schemas.values():
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return Draft202012Validator(
        schemas[schema_filename],
        registry=registry,
        format_checker=FORMAT_CHECKER,
    )


def _load_schemas() -> dict[str, dict[str, Any]]:
    """读取全部 Schema，使跨文件引用可在本地注册表解析。"""
    filenames = ("common.schema.json", *SCHEMA_FILENAMES.values())
    return {
        filename: loads((SCHEMA_DIRECTORY / filename).read_text(encoding="utf-8"))
        for filename in filenames
    }


def _error_path(error: Any) -> str:
    """把 jsonschema 路径转换为稳定的 JSONPath 风格。"""
    parts: list[str] = ["$"]
    for segment in error.absolute_path:
        if isinstance(segment, int):
            parts.append(f"[{segment}]")
        else:
            parts.append(f".{segment}")

    # required 错误默认只定位父对象；补齐缺失字段才能直接定位修复点。
    if error.validator == "required":
        match = re.match(r"^'(.+)' is a required property$", error.message)
        if match is not None:
            parts.append(f".{match.group(1)}")
    return "".join(parts)


def _module_graph_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """校验模块 ID、依赖 DAG 与路径所有权，阻止并行任务产生隐式冲突。"""
    modules = payload.get("modules")
    if not isinstance(modules, Sequence) or isinstance(modules, (str, bytes)):
        return []

    seen: set[str] = set()
    issues: list[ValidationIssue] = []
    for index, module in enumerate(modules):
        if not isinstance(module, Mapping) or not isinstance(module.get("id"), str):
            continue
        module_id = module["id"]
        if module_id in seen:
            issues.append(
                ValidationIssue(f"$.modules[{index}].id", f"模块 ID 重复: {module_id}")
            )
        seen.add(module_id)
    module_ids = {
        item["id"]
        for item in modules
        if isinstance(item, Mapping) and isinstance(item.get("id"), str)
    }
    dependencies: dict[str, tuple[str, ...]] = {}
    owned_paths: list[tuple[int, str, str]] = []
    for index, module in enumerate(modules):
        if not isinstance(module, Mapping) or not isinstance(module.get("id"), str):
            continue
        module_id = module["id"]
        raw_dependencies = module.get("dependsOn", [])
        if isinstance(raw_dependencies, Sequence) and not isinstance(raw_dependencies, (str, bytes)):
            dependencies[module_id] = tuple(item for item in raw_dependencies if isinstance(item, str))
            for dependency in dependencies[module_id]:
                if dependency not in module_ids:
                    issues.append(
                        ValidationIssue(
                            f"$.modules[{index}].dependsOn",
                            f"模块 {module_id} 包含未知依赖: {dependency}",
                        )
                    )
        raw_paths = module.get("owns", [])
        if isinstance(raw_paths, Sequence) and not isinstance(raw_paths, (str, bytes)):
            owned_paths.extend(
                (index, module_id, path.rstrip("/"))
                for path in raw_paths
                if isinstance(path, str)
            )

    issues.extend(_dependency_cycle_issues(dependencies))
    for left_index, left_id, left_path in owned_paths:
        for right_index, right_id, right_path in owned_paths:
            if left_index >= right_index or left_id == right_id:
                continue
            if _paths_overlap(left_path, right_path):
                issues.append(
                    ValidationIssue(
                        f"$.modules[{right_index}].owns",
                        f"路径所有权与模块 {left_id} 重叠: {left_path} / {right_path}",
                    )
                )
    return issues


def _dependency_cycle_issues(
    dependencies: Mapping[str, tuple[str, ...]],
    *,
    label: str = "模块",
    path: str = "$.modules",
) -> list[ValidationIssue]:
    """以迭代拓扑排序识别依赖环，避免递归深度影响大型清单。"""
    known = set(dependencies)
    indegrees = {module_id: 0 for module_id in known}
    dependants: dict[str, list[str]] = {module_id: [] for module_id in known}
    for module_id, items in dependencies.items():
        for dependency in items:
            if dependency not in known:
                continue
            indegrees[module_id] += 1
            dependants[dependency].append(module_id)
    ready = sorted(module_id for module_id, degree in indegrees.items() if degree == 0)
    visited = 0
    while ready:
        current = ready.pop(0)
        visited += 1
        for dependant in sorted(dependants[current]):
            indegrees[dependant] -= 1
            if indegrees[dependant] == 0:
                ready.append(dependant)
                ready.sort()
    if visited == len(known):
        return []
    cycle_ids = sorted(module_id for module_id, degree in indegrees.items() if degree > 0)
    return [ValidationIssue(path, f"{label}依赖存在环: {', '.join(cycle_ids)}")]


def _paths_overlap(left: str, right: str) -> bool:
    """按路径段判断两个所有权范围是否相同或互为父子目录。"""
    left_parts = tuple(part for part in left.split("/") if part)
    right_parts = tuple(part for part in right.split("/") if part)
    minimum = min(len(left_parts), len(right_parts))
    return left_parts[:minimum] == right_parts[:minimum]


def _convert_decomposition_issues(issues: Sequence[Any]) -> list[ValidationIssue]:
    """把独立拆分验证器的问题转换为公共稳定问题类型。"""
    return [ValidationIssue(issue.path, issue.message) for issue in issues]


def validate_decomposition_freshness(
    control: Mapping[str, Any], payload: Mapping[str, Any]
) -> list[ValidationIssue]:
    """对外暴露当前拆分指针的新鲜度校验。"""
    return _convert_decomposition_issues(decomposition_freshness_issues(control, payload))


def _duplicate_item_id_issues(
    payload: Mapping[str, Any], collection_name: str, label: str
) -> list[ValidationIssue]:
    """检查清单对象的 ID 唯一性，补足 JSON Schema 无法表达的跨项约束。"""
    items = payload.get(collection_name)
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
        return []

    seen: set[str] = set()
    issues: list[ValidationIssue] = []
    for index, item in enumerate(items):
        if not isinstance(item, Mapping) or not isinstance(item.get("id"), str):
            continue
        item_id = item["id"]
        if item_id in seen:
            issues.append(
                ValidationIssue(
                    f"$.{collection_name}[{index}].id", f"{label} ID 重复: {item_id}"
                )
            )
        seen.add(item_id)
    return issues


def _asset_register_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """校验资源 ID、运行时路径、地址和 Unity GUID 的唯一性。"""
    issues = _duplicate_item_id_issues(payload, "assets", "资源")
    assets = payload.get("assets")
    if not isinstance(assets, Sequence) or isinstance(assets, (str, bytes)):
        return issues
    for field, label in (("path", "资源路径"), ("address", "资源地址"), ("guid", "Unity GUID")):
        seen: dict[str, int] = {}
        for index, asset in enumerate(assets):
            if not isinstance(asset, Mapping) or not isinstance(asset.get(field), str):
                continue
            value = asset[field]
            if value in seen:
                issues.append(
                    ValidationIssue(
                        f"$.assets[{index}].{field}",
                        f"{label}重复，首次出现在 assets[{seen[value]}]: {value}",
                    )
                )
            else:
                seen[value] = index
    return issues


def _identifier_set_issues(
    payload: Mapping[str, Any], collection_name: str, expected: set[str], label: str
) -> list[ValidationIssue]:
    """确保固定生命周期清单既不重复也不遗漏，避免门禁顺序被静默破坏。"""
    issues = _duplicate_item_id_issues(payload, collection_name, label)
    items = payload.get(collection_name)
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
        return issues
    actual = {
        item["id"]
        for item in items
        if isinstance(item, Mapping) and isinstance(item.get("id"), str)
    }
    missing = sorted(expected - actual)
    if missing:
        issues.append(
            ValidationIssue(f"$.{collection_name}", f"缺少{label}: {'、'.join(missing)}")
        )
    return issues


def _quality_status_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """阻止汇总结论与逐项结果矛盾，避免失败或未运行检查被误报为通过。"""
    if payload.get("status") != "PASS":
        return []
    checks = payload.get("checks")
    if not isinstance(checks, Sequence) or isinstance(checks, (str, bytes)):
        return []
    issues: list[ValidationIssue] = []
    for index, check in enumerate(checks):
        if isinstance(check, Mapping) and check.get("status") != "PASS":
            issues.append(
                ValidationIssue(
                    f"$.checks[{index}].status",
                    "汇总状态为 PASS 时，每个检查都必须为 PASS",
                )
            )
    return issues


def _quality_gate_pass_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """确保 PASS 质量门的结果与必需检查一一对应且全部通过。"""
    gates = payload.get("gates")
    if not isinstance(gates, Sequence) or isinstance(gates, (str, bytes)):
        return []

    issues: list[ValidationIssue] = []
    for gate_index, gate in enumerate(gates):
        if not isinstance(gate, Mapping):
            continue
        required_checks = gate.get("requiredChecks")
        check_results = gate.get("checkResults")
        if not isinstance(required_checks, Sequence) or isinstance(required_checks, (str, bytes)):
            continue
        expected_checks = EXPECTED_GATE_CHECKS.get(gate.get("id"))
        if expected_checks is not None and set(required_checks) != expected_checks:
            issues.append(
                ValidationIssue(
                    f"$.gates[{gate_index}].requiredChecks",
                    f"{gate.get('id')} 必需检查集合不完整或包含未定义项",
                )
            )
        if gate.get("status") != "PASS":
            continue
        if not isinstance(check_results, Sequence) or isinstance(check_results, (str, bytes)):
            continue

        result_ids: list[str] = []
        for result_index, result in enumerate(check_results):
            if not isinstance(result, Mapping) or not isinstance(result.get("id"), str):
                continue
            result_ids.append(result["id"])
            if result.get("status") != "PASS":
                issues.append(
                    ValidationIssue(
                        f"$.gates[{gate_index}].checkResults[{result_index}].status",
                        "质量门为 PASS 时每项检查结果都必须为 PASS",
                    )
                )

        duplicate_ids = sorted({item for item in result_ids if result_ids.count(item) > 1})
        if duplicate_ids:
            issues.append(
                ValidationIssue(
                    f"$.gates[{gate_index}].checkResults",
                    f"检查结果 ID 重复: {'、'.join(duplicate_ids)}",
                )
            )
        if set(result_ids) != set(required_checks):
            issues.append(
                ValidationIssue(
                    f"$.gates[{gate_index}].checkResults",
                    "PASS 质量门的检查结果必须与 requiredChecks 一一对应",
                )
            )
    return issues


def _scene_approval_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """把冻结场景的视觉批准绑定到当前场景和版本，阻止复用旧批准。"""
    if payload.get("status") != "DONE":
        return []
    issues = _subject_binding_issues(
        payload.get("approvals"),
        expected_id=payload.get("id"),
        expected_version=payload.get("version"),
        path="$.approvals",
    )
    for approval_type in ("GAME_VISUAL", "UI_VISUAL", "RUNTIME_VISUAL"):
        reviews = [
            item
            for item in payload.get("approvals", [])
            if isinstance(item, Mapping)
            and item.get("approvalType") == approval_type
            and item.get("authority") == "INDEPENDENT_REVIEWER"
        ]
        issues.extend(_unique_three_reviewer_issues(reviews, "$.approvals", approval_type))
    visual_reviews = payload.get("visualReviews")
    if isinstance(visual_reviews, Mapping):
        for key, reference in visual_reviews.items():
            if not isinstance(reference, Mapping):
                continue
            if reference.get("type") != "visual-review":
                issues.append(ValidationIssue(f"$.visualReviews.{key}.type", "最终视觉引用必须是 visual-review"))
            if reference.get("subjectId") != payload.get("id"):
                issues.append(ValidationIssue(f"$.visualReviews.{key}.subjectId", "最终视觉审查必须绑定当前场景"))
            if reference.get("subjectVersion") != payload.get("version"):
                issues.append(ValidationIssue(f"$.visualReviews.{key}.subjectVersion", "最终视觉审查必须绑定当前场景版本"))
    return issues


def _image_task_approval_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """将图片批准与具体候选视觉版本及最终视觉审查绑定。"""
    if payload.get("status") != "APPROVED":
        return []
    candidate = payload.get("selectedCandidate")
    visual_version = candidate.get("visualVersion") if isinstance(candidate, Mapping) else None
    issues = _subject_binding_issues(
        payload.get("approvals"),
        expected_id=payload.get("id"),
        expected_version=visual_version,
        path="$.approvals",
    )
    reviews = [
        item
        for item in payload.get("approvals", [])
        if isinstance(item, Mapping) and item.get("authority") == "INDEPENDENT_REVIEWER"
    ]
    issues.extend(_unique_three_reviewer_issues(reviews, "$.approvals", "图片"))
    if any(item.get("authority") == "USER" for item in payload.get("approvals", []) if isinstance(item, Mapping)):
        issues.append(ValidationIssue("$.approvals", "逐图审查不得新增 P0/P1/P3 之外的用户批准门"))
    reference = payload.get("finalVisualReview")
    if isinstance(reference, Mapping):
        if reference.get("type") != "visual-review":
            issues.append(ValidationIssue("$.finalVisualReview.type", "最终引用必须是 visual-review"))
        if reference.get("subjectId") != payload.get("id"):
            issues.append(ValidationIssue("$.finalVisualReview.subjectId", "最终视觉审查必须绑定当前图片任务"))
        if reference.get("subjectVersion") != visual_version:
            issues.append(ValidationIssue("$.finalVisualReview.subjectVersion", "最终视觉审查必须绑定已选候选版本"))
    return issues


def _visual_review_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """校验最终视觉审查的三代理独立性、批准类型和主体版本。"""
    if payload.get("status") not in {"APPROVED", "REVIEW_APPROVED"}:
        return []
    approval_type = payload.get("subjectType")
    reviews = payload.get("reviews")
    issues = _subject_binding_issues(
        reviews,
        expected_id=payload.get("subjectId"),
        expected_version=payload.get("subjectVersion"),
        path="$.reviews",
    )
    reviewer_items = [item for item in reviews or [] if isinstance(item, Mapping)]
    issues.extend(_unique_three_reviewer_issues(reviewer_items, "$.reviews", "视觉"))
    for index, review in enumerate(reviewer_items):
        if review.get("approvalType") != approval_type:
            issues.append(ValidationIssue(f"$.reviews[{index}].approvalType", "审查类型必须匹配 subjectType"))
    user = payload.get("userApproval")
    if payload.get("status") == "APPROVED" and isinstance(user, Mapping):
        issues.extend(_subject_binding_issues([user], expected_id=payload.get("subjectId"), expected_version=payload.get("subjectVersion"), path="$.userApproval"))
        if user.get("approvalType") != approval_type:
            issues.append(ValidationIssue("$.userApproval.approvalType", "用户批准类型必须匹配 subjectType"))
    return issues


def _split_plan_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """确保拆分项编号与 ID 唯一，并约束批准审查的独立性。"""
    issues = _duplicate_item_id_issues(payload, "items", "拆分项")
    items = payload.get("items")
    if isinstance(items, Sequence) and not isinstance(items, (str, bytes)):
        indices = [item.get("elementIndex") for item in items if isinstance(item, Mapping)]
        if len(indices) != len(set(indices)):
            issues.append(ValidationIssue("$.items", "拆分项 elementIndex 必须唯一"))
    if payload.get("status") == "APPROVED":
        approval = payload.get("userApproval")
        if isinstance(approval, Mapping):
            issues.extend(
                _subject_binding_issues(
                    [approval],
                    expected_id=payload.get("id"),
                    expected_version=payload.get("sourceVersion"),
                    path="$.userApproval",
                )
            )
    return issues


def _image_generation_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """确保生成完成时候选数量、尺寸、ID 和路径与输出规格一致。"""
    if payload.get("status") not in {"GENERATED", "USER_CONFIRMED"}:
        return []
    candidates = payload.get("candidates")
    output = payload.get("output")
    if not isinstance(candidates, Sequence) or isinstance(candidates, (str, bytes)) or not isinstance(output, Mapping):
        return []
    issues = _duplicate_item_id_issues(payload, "candidates", "图片候选")
    if len(candidates) != output.get("candidateCount"):
        issues.append(ValidationIssue("$.candidates", "生成候选数量必须等于 output.candidateCount"))
    paths = [item.get("path") for item in candidates if isinstance(item, Mapping)]
    if len(paths) != len(set(paths)):
        issues.append(ValidationIssue("$.candidates", "图片候选路径必须唯一"))
    for index, item in enumerate(candidates):
        if not isinstance(item, Mapping):
            continue
        if item.get("width") != output.get("width") or item.get("height") != output.get("height"):
            issues.append(ValidationIssue(f"$.candidates[{index}]", "候选尺寸必须匹配输出规格"))
    if payload.get("status") == "USER_CONFIRMED":
        selected = payload.get("selectedCandidate")
        if isinstance(selected, Mapping):
            identities = {
                (item.get("id"), item.get("path"), item.get("sha256"), item.get("visualVersion"))
                for item in candidates
                if isinstance(item, Mapping)
            }
            identity = (
                selected.get("id"),
                selected.get("path"),
                selected.get("sha256"),
                selected.get("visualVersion"),
            )
            if identity not in identities:
                issues.append(ValidationIssue("$.selectedCandidate", "P1 用户确认候选必须来自当前生成结果"))
        approval = payload.get("userApproval")
        if isinstance(approval, Mapping) and isinstance(selected, Mapping):
            if approval.get("approvalType") != payload.get("visualType"):
                issues.append(ValidationIssue("$.userApproval.approvalType", "P1 用户批准类型必须匹配效果图类型"))
            issues.extend(
                _subject_binding_issues(
                    [approval],
                    expected_id=payload.get("id"),
                    expected_version=selected.get("visualVersion"),
                    path="$.userApproval",
                )
            )
    return issues


def _registration_record_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """将 Toolkit 登记记录中的批准绑定到来源图片任务与候选视觉版本。"""
    return _subject_binding_issues(
        payload.get("approvals"),
        expected_id=payload.get("taskId"),
        expected_version=payload.get("visualVersion"),
        path="$.approvals",
    )


def _unique_three_reviewer_issues(reviews: Sequence[Mapping[str, Any]], path: str, label: str) -> list[ValidationIssue]:
    """要求三种审查学科来自不同任务和不同审查者。"""
    required = {"VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"}
    selected = [item for item in reviews if item.get("reviewDiscipline") in required]
    if {item.get("reviewDiscipline") for item in selected} != required:
        return [ValidationIssue(path, f"{label}必须包含三类独立视觉审查")]
    if len({item.get("reviewTaskId") for item in selected}) != 3:
        return [ValidationIssue(path, f"{label}三类审查必须来自三个不同任务")]
    if len({item.get("approvedBy") for item in selected}) != 3:
        return [ValidationIssue(path, f"{label}三类审查必须来自三个不同审查者")]
    return []


def _visual_bible_approval_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """确保全局视觉批准和三类独立审查都属于当前基线版本。"""
    if payload.get("status") != "APPROVED":
        return []
    issues = _subject_binding_issues(
        payload.get("reviews"),
        expected_id=payload.get("projectId"),
        expected_version=payload.get("version"),
        path="$.reviews",
    )
    approval = payload.get("approval")
    issues.extend(
        _subject_binding_issues(
            [approval] if isinstance(approval, Mapping) else [],
            expected_id=payload.get("projectId"),
            expected_version=payload.get("version"),
            path="$.approval",
        )
    )

    required_reviews = [
        review
        for review in payload.get("reviews", [])
        if isinstance(review, Mapping)
        and review.get("authority") == "INDEPENDENT_REVIEWER"
        and review.get("reviewDiscipline")
        in {"VISUAL_CONSISTENCY", "UNITY_FEASIBILITY", "UX_READABILITY"}
    ] if isinstance(payload.get("reviews"), Sequence) else []
    reviewer_tasks = [review.get("reviewTaskId") for review in required_reviews]
    reviewers = [review.get("approvedBy") for review in required_reviews]
    if len(set(reviewer_tasks)) != 3:
        issues.append(ValidationIssue("$.reviews", "三类视觉审查必须来自三个不同的审查任务"))
    if len(set(reviewers)) != 3:
        issues.append(ValidationIssue("$.reviews", "三类视觉审查必须由三个不同的审查者完成"))
    return issues


def _delivery_approval_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """将最终发布授权绑定到当前交付 ID 与候选版本。"""
    if payload.get("status") != "RELEASE_APPROVED":
        return []
    authorization = payload.get("authorization")
    approval = authorization.get("approval") if isinstance(authorization, Mapping) else None
    return _subject_binding_issues(
        [approval] if isinstance(approval, Mapping) else [],
        expected_id=payload.get("id"),
        expected_version=payload.get("version"),
        path="$.authorization.approval",
    )


def _runtime_visual_approval_issues(payload: Mapping[str, Any]) -> list[ValidationIssue]:
    """将实机审查和用户确认绑定到当前场景与构建版本。"""
    if payload.get("status") != "APPROVED":
        return []
    issues = _subject_binding_issues(
        payload.get("reviews"),
        expected_id=payload.get("sceneId"),
        expected_version=payload.get("buildVersion"),
        path="$.reviews",
    )
    issues.extend(
        _subject_binding_issues(
            payload.get("userApprovals"),
            expected_id=payload.get("sceneId"),
            expected_version=payload.get("buildVersion"),
            path="$.userApprovals",
        )
    )
    return issues


def _subject_binding_issues(
    approvals: object,
    *,
    expected_id: object,
    expected_version: object,
    path: str,
) -> list[ValidationIssue]:
    """检查批准记录的主体和版本，避免旧证据跨任务复用。"""
    if not isinstance(approvals, Sequence) or isinstance(approvals, (str, bytes)):
        return []
    issues: list[ValidationIssue] = []
    for index, approval in enumerate(approvals):
        if not isinstance(approval, Mapping):
            continue
        item_path = path if len(approvals) == 1 and path.endswith("approval") else f"{path}[{index}]"
        if approval.get("subjectId") != expected_id:
            issues.append(ValidationIssue(f"{item_path}.subjectId", "批准主体必须匹配当前制品"))
        if approval.get("subjectVersion") != expected_version:
            issues.append(ValidationIssue(f"{item_path}.subjectVersion", "批准版本必须匹配当前制品版本"))
    return issues
