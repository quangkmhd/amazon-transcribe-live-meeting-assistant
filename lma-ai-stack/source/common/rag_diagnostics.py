#!/usr/bin/env python3
"""
Diagnostics and summaries for RAG logging.

Reads JSONL logs under @log/YYYY-MM-DD/rag.jsonl and computes health metrics.
Also provides light self-tests that synthesize expected stage events.
"""

import os
import time
import json
from typing import Dict, Any, List, Tuple

from .rag_logging import log_info


def _today_log_path(log_dir: str = "@log") -> str:
    dated_dir = os.path.join(log_dir, time.strftime("%Y-%m-%d"))
    os.makedirs(dated_dir, exist_ok=True)
    return os.path.join(dated_dir, "rag.jsonl")


def summarize_logs(window_minutes: int = 60, log_dir: str = "@log") -> Dict[str, Any]:
    path = _today_log_path(log_dir)
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - window_minutes * 60 * 1000

    counts = {
        "queries": 0,
        "errors": 0,
        "retrieval_zero": 0,
        "context_empty": 0,
    }
    p95_latency = {}
    top_scores: List[float] = []

    if not os.path.exists(path):
        return {"message": "No logs yet", "path": path}

    latencies_by_stage: Dict[str, List[int]] = {}

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            ts = rec.get("timestamp")
            if ts is None or ts < since_ms:
                continue

            stage = rec.get("stage", "")
            event = rec.get("event", "")

            if stage == "query_intake" and event in {"received", "start"}:
                counts["queries"] += 1

            if rec.get("error_type") or event == "error":
                counts["errors"] += 1

            if stage == "context_assembler" and event == "stats":
                if rec.get("retrieved_docs_count", 0) == 0:
                    counts["retrieval_zero"] += 1
                if rec.get("context_tokens", 0) == 0:
                    counts["context_empty"] += 1

            if "latency_ms" in rec and event in {"end", "error"}:
                latencies_by_stage.setdefault(stage, []).append(int(rec["latency_ms"]))

    def _p95(values: List[int]) -> int:
        if not values:
            return 0
        vs = sorted(values)
        idx = int(0.95 * (len(vs) - 1))
        return vs[idx]

    p95_latency = {stage: _p95(vs) for stage, vs in latencies_by_stage.items()}

    # Quick NL summary
    summary_lines = []
    summary_lines.append(f"Window: {window_minutes}m, queries={counts['queries']}, errors={counts['errors']}")
    if counts["retrieval_zero"]:
        summary_lines.append(f"retrieval_zero={counts['retrieval_zero']} (consider reindexing or relaxing filters)")
    if counts["context_empty"]:
        summary_lines.append(f"context_empty={counts['context_empty']} (increase top_k or lower threshold)")
    if p95_latency:
        worst = max(p95_latency.items(), key=lambda x: x[1])
        summary_lines.append(f"slowest_p95: {worst[0]}={worst[1]}ms")

    return {
        "counts": counts,
        "p95_latency_ms": p95_latency,
        "summary": "; ".join(summary_lines),
        "path": path,
    }


def run_self_tests(log_dir: str = "@log") -> Dict[str, Any]:
    """Synthesize a 'no results' scenario and ensure logs capture it."""
    # Emit synthetic events representing a failed retrieval and abstained generation
    now = int(time.time() * 1000)
    log_info({"stage": "query_intake", "event": "received", "timestamp": now})
    log_info({
        "stage": "context_assembler", "event": "stats",
        "retrieved_docs_count": 0, "context_tokens": 0,
    })
    log_info({
        "stage": "generator", "event": "result",
        "generation_status": "abstained", "reason": "empty_context",
    })

    # Summarize to confirm visibility
    return summarize_logs(window_minutes=10, log_dir=log_dir)


def get_self_debug_meta_prompt() -> str:
    return (
        "You are a RAG self-debugger. Using the provided query, retrieved snippets (if any), and system "
        "metrics, perform: 1) Retrieval coverage check; 2) Relevance check; 3) Context risk; 4) Generation risk. "
        "Output JSON with: {stage_failures:[], recommendations:[], need_reindex:boolean, need_query_rewrite:boolean}."
    )


