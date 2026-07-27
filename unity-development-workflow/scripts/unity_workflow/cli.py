"""定义 Unity 开发工作流的命令行接口。"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any

import yaml

from unity_workflow.asset_registry import merge_registration_records
from unity_workflow.compiler import ContractValidationError, compile_job
from unity_workflow.contracts import load_yaml, validate_contract
from unity_workflow.dag import TaskGraph
from unity_workflow.file_mutex import FileMutex
from unity_workflow.gate_evaluator import GateEvidenceError, evaluate_gate
from unity_workflow.locks import LockRequest, LockTable
from unity_workflow.state import WorkflowState


def _print_error(error: object) -> None:
    """向标准错误输出稳定的单行错误信息。"""
    message = " ".join(str(error).splitlines())
    print(f"错误：{message}", file=sys.stderr)


def _print_json(payload: Any) -> None:
    """输出键序稳定且保留中文的单行 JSON。"""
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def handle_validate(args: argparse.Namespace) -> int:
    """校验单个 YAML 契约，并把输入错误转换为稳定退出码。"""
    try:
        payload = load_yaml(args.source)
        issues = validate_contract(args.kind, payload)
    except ValueError as error:
        _print_error(error)
        return 2
    if issues:
        # 合并为单行可读错误，避免 CLI 调用方处理 traceback 或多种异常格式。
        _print_error("；".join(f"{issue.path}: {issue.message}" for issue in issues))
        return 2
    print(f"校验通过：{args.kind}")
    return 0


def handle_compile(args: argparse.Namespace) -> int:
    """编译 YAML 契约，并把可读错误转换为稳定退出码。"""
    try:
        result = compile_job(args.kind, args.source, args.output, args.project_root)
    except (ContractValidationError, OSError, UnicodeError, ValueError) as error:
        _print_error(error)
        return 2
    print(result)
    return 0


def handle_ready(args: argparse.Namespace) -> int:
    """读取任务与状态快照，并逐行输出当前就绪任务。"""
    try:
        payload = yaml.safe_load(args.tasks.read_text(encoding="utf-8"))
        tasks = payload.get("tasks") if isinstance(payload, dict) else payload
        if not isinstance(tasks, list):
            raise ValueError("任务 YAML 必须包含任务契约列表")
        for index, task in enumerate(tasks):
            issues = validate_contract("task-contract", task)
            if issues:
                details = "；".join(f"{issue.path}: {issue.message}" for issue in issues)
                raise ValueError(f"第 {index + 1} 项任务契约非法：{details}")
        graph = TaskGraph.from_contracts(tasks)
        states = WorkflowState.load(args.state).statuses()
    except (OSError, UnicodeError, yaml.YAMLError, ValueError) as error:
        _print_error(error)
        return 2
    for task_id in graph.ready_tasks(states):
        print(task_id)
    return 0


def _parse_lock_request(raw: str) -> LockRequest:
    """解析 type:mode:resource 格式，同时允许资源自身包含冒号。"""
    parts = raw.split(":", 2)
    if len(parts) != 3 or not all(parts):
        raise ValueError(f"锁请求格式错误：{raw}")
    return LockRequest(type=parts[0], mode=parts[1], resource=parts[2])


def handle_lock(args: argparse.Namespace) -> int:
    """处理资源锁申请、释放与稳定列表输出。"""
    try:
        # load→mutate→save 必须处于同一 OS 锁内，否则两个代理会互相覆盖状态快照。
        with FileMutex(args.file):
            table = LockTable.load(args.file)
            if args.lock_command == "list":
                _print_json(table.entries())
                return 0
            if args.lock_command == "release":
                released = table.release(args.task)
                table.save()
                _print_json({"released": released})
                return 0

            requests = [_parse_lock_request(raw) for raw in args.request]
            result = table.acquire(args.task, requests)
            if result.acquired:
                table.save()
    except (OSError, ValueError) as error:
        _print_error(error)
        return 2

    _print_json({"acquired": result.acquired, "conflicts": list(result.conflicts)})
    return 0 if result.acquired else 3


def handle_transition(args: argparse.Namespace) -> int:
    """执行并持久化一次任务状态迁移。"""
    try:
        # 状态迁移同样使用跨进程互斥，保证证据和重试计数不会丢失更新。
        with FileMutex(args.file):
            try:
                workflow = WorkflowState.load(args.file)
            except ValueError as error:
                _print_error(error)
                return 2
            try:
                state = workflow.transition(
                    args.task,
                    args.to,
                    actor_role=args.actor,
                    evidence=args.evidence,
                )
            except ValueError as error:
                _print_error(error)
                return 3
            workflow.save()
    except OSError as error:
        _print_error(error)
        return 2
    _print_json({**asdict(state), "evidence": list(state.evidence)})
    return 0


def handle_gate_evaluate(args: argparse.Namespace) -> int:
    """深度校验指定生命周期门的证据并原子写出结果。"""
    try:
        result = evaluate_gate(
            args.config,
            args.gate,
            args.project_root,
            args.project_id,
            args.source_revision,
            args.build_version,
            args.output,
        )
    except (GateEvidenceError, OSError, UnicodeError, ValueError) as error:
        _print_error(error)
        return 2
    _print_json(result)
    return 0 if result["status"] == "PASS" else 3


def handle_asset_merge_records(args: argparse.Namespace) -> int:
    """由单写者合并 Toolkit 不可变登记记录，且不推导许可批准。"""
    try:
        result = merge_registration_records(args.project_root, args.records, args.register)
    except (OSError, UnicodeError, ValueError) as error:
        _print_error(error)
        return 2
    _print_json(result)
    return 0


def build_parser() -> argparse.ArgumentParser:
    """构建包含全部工作流子命令的参数解析器。"""
    parser = argparse.ArgumentParser(description="编排 Unity 6 URP 项目的场景开发与 Windows 交付工作流。")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="校验项目契约")
    validate_parser.set_defaults(handler=handle_validate)
    validate_parser.add_argument("--kind", required=True, help="契约类型")
    validate_parser.add_argument("--source", required=True, type=Path, help="YAML 源文件")

    compile_parser = subparsers.add_parser("compile", help="编译工作流 DAG")
    compile_parser.set_defaults(handler=handle_compile)
    compile_parser.add_argument("--kind", required=True, help="契约类型")
    compile_parser.add_argument("--project-root", required=True, type=Path, help="Unity 项目根目录")
    compile_parser.add_argument("--source", required=True, type=Path, help="YAML 源文件")
    compile_parser.add_argument("--output", required=True, type=Path, help="JSON 输出文件")

    ready_parser = subparsers.add_parser("ready", help="检查任务就绪条件")
    ready_parser.set_defaults(handler=handle_ready)
    ready_parser.add_argument("--tasks", required=True, type=Path, help="任务契约 YAML")
    ready_parser.add_argument("--state", required=True, type=Path, help="任务状态 JSON")

    lock_parser = subparsers.add_parser("lock", help="管理资源锁")
    lock_parser.set_defaults(handler=handle_lock)
    lock_parser.add_argument("--file", required=True, type=Path, help="资源锁 JSON")
    lock_subparsers = lock_parser.add_subparsers(dest="lock_command", required=True)
    acquire_parser = lock_subparsers.add_parser("acquire", help="批量申请资源锁")
    acquire_parser.add_argument("--task", required=True, help="任务 ID")
    acquire_parser.add_argument("--request", required=True, action="append", help="type:mode:resource")
    release_parser = lock_subparsers.add_parser("release", help="释放任务全部资源锁")
    release_parser.add_argument("--task", required=True, help="任务 ID")
    lock_subparsers.add_parser("list", help="列出资源锁")

    transition_parser = subparsers.add_parser("transition", help="推进工作流状态")
    transition_parser.set_defaults(handler=handle_transition)
    transition_parser.add_argument("--file", required=True, type=Path, help="任务状态 JSON")
    transition_parser.add_argument("--task", required=True, help="任务 ID")
    transition_parser.add_argument("--to", required=True, help="目标状态")
    transition_parser.add_argument("--actor", required=True, help="执行者角色")
    transition_parser.add_argument("--evidence", action="append", default=[], help="证据路径")
    gate_parser = subparsers.add_parser("gate", help="求值生命周期质量门")
    gate_subparsers = gate_parser.add_subparsers(dest="gate_command", required=True)
    gate_evaluate_parser = gate_subparsers.add_parser("evaluate", help="深度校验并原子输出门禁结果")
    gate_evaluate_parser.set_defaults(handler=handle_gate_evaluate)
    gate_evaluate_parser.add_argument("--config", required=True, type=Path, help="quality-gates YAML")
    gate_evaluate_parser.add_argument("--gate", required=True, choices=("G0", "G1", "G2", "G3"), help="待求值质量门")
    gate_evaluate_parser.add_argument("--project-root", required=True, type=Path, help="证据所属项目根目录")
    gate_evaluate_parser.add_argument("--project-id", required=True, help="项目 ID")
    gate_evaluate_parser.add_argument("--source-revision", required=True, help="源码修订")
    gate_evaluate_parser.add_argument("--build-version", required=True, help="构建版本")
    gate_evaluate_parser.add_argument("--output", required=True, type=Path, help="求值后门禁清单")

    asset_parser = subparsers.add_parser("asset", help="维护资源登记控制面")
    asset_subparsers = asset_parser.add_subparsers(dest="asset_command", required=True)
    merge_parser = asset_subparsers.add_parser("merge-records", help="合并不可变 Unity 资源登记记录")
    merge_parser.set_defaults(handler=handle_asset_merge_records)
    merge_parser.add_argument("--project-root", required=True, type=Path, help="Unity 项目根目录")
    merge_parser.add_argument("--records", required=True, type=Path, help="登记记录目录")
    merge_parser.add_argument("--register", required=True, type=Path, help="总 asset-register YAML")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """解析命令行并返回对应子命令的退出码。"""
    args = build_parser().parse_args(argv)
    return args.handler(args)
