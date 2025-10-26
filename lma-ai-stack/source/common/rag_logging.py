#!/usr/bin/env python3
"""
RAG structured logging utilities.

Writes JSONL logs to @log/YYYY-MM-DD/rag.jsonl with correlation IDs and stage events.
No external services required; safe to use inside WSL.
"""

import json
import os
import time
import uuid
import hashlib
import logging
import logging.handlers
from contextvars import ContextVar
from typing import Any, Dict, Optional


cid_context: ContextVar[str] = ContextVar("cid", default="")
service_name_context: ContextVar[str] = ContextVar("service", default="rag_service")


def sha256_16(text: str) -> str:
    if text is None:
        return ""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _mask_sensitive(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    masked = {}
    for k, v in value.items():
        lk = str(k).lower()
        if lk in {"authorization", "api_key", "access_token", "password", "secret"}:
            masked[k] = "***REDACTED***"
        else:
            masked[k] = v
    return masked


def _truncate_text_fields(payload: Dict[str, Any], max_len: int = 512) -> Dict[str, Any]:
    truncated = dict(payload)
    for key in ("query", "snippet", "prompt", "response_preview", "context"): 
        val = truncated.get(key)
        if isinstance(val, str) and len(val) > max_len:
            truncated[key] = val[:max_len]
            truncated[key + "_truncated"] = True
    return truncated


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base: Dict[str, Any] = {}
        if isinstance(record.msg, dict):
            base.update(record.msg)
        else:
            base["message"] = str(record.msg)

        base.setdefault("timestamp", int(time.time() * 1000))
        base.setdefault("level", record.levelname)
        base.setdefault("service", service_name_context.get())
        base.setdefault("cid", cid_context.get())

        if record.exc_info:
            import traceback
            base["error_trace"] = "".join(traceback.format_exception(*record.exc_info))

        base = _mask_sensitive(base)
        base = _truncate_text_fields(base)
        return json.dumps(base, ensure_ascii=False)


_inited: bool = False


def init_rag_logging(log_dir: str = "@log", level: str = "INFO", service_name: str = "rag_service") -> None:
    global _inited
    if _inited:
        return

    # Ensure dated directory exists
    os.makedirs(log_dir, exist_ok=True)
    dated_dir = os.path.join(log_dir, time.strftime("%Y-%m-%d"))
    os.makedirs(dated_dir, exist_ok=True)
    log_path = os.path.join(dated_dir, "rag.jsonl")

    # Configure logger
    handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=100 * 1024 * 1024, backupCount=5
    )
    handler.setFormatter(JsonLineFormatter())

    rag_logger = logging.getLogger("rag")
    rag_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    rag_logger.addHandler(handler)
    rag_logger.propagate = False

    # Save service name in context var
    try:
        service_name_context.set(service_name)
    except Exception:
        pass

    _inited = True


def new_cid() -> str:
    c = uuid.uuid4().hex
    cid_context.set(c)
    return c


def get_cid() -> str:
    return cid_context.get()


def with_stage(stage: str):
    def deco(fn):
        def wrapper(*args, **kwargs):
            log = logging.getLogger("rag")
            start = time.time()
            log.info({"stage": stage, "event": "start"})
            try:
                result = fn(*args, **kwargs)
                duration = int((time.time() - start) * 1000)
                log.info({"stage": stage, "event": "end", "latency_ms": duration})
                return result
            except Exception as e:
                duration = int((time.time() - start) * 1000)
                log.error({
                    "stage": stage,
                    "event": "error",
                    "latency_ms": duration,
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                }, exc_info=True)
                raise
        return wrapper
    return deco


def log_info(payload: Dict[str, Any]) -> None:
    logging.getLogger("rag").info(payload)


def log_debug(payload: Dict[str, Any]) -> None:
    logging.getLogger("rag").debug(payload)


def log_error(payload: Dict[str, Any]) -> None:
    logging.getLogger("rag").error(payload)


