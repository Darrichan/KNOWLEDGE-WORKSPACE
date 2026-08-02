import asyncio
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from shutil import rmtree
from time import monotonic
from uuid import uuid4

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionFactory, close_database
from app.core.logging import configure_logging
from app.exception.errors import APIError
from app.exception.handlers import api_error_handler
from app.service.document_service import purge_expired_documents

configure_logging()
logger = structlog.get_logger()
settings = get_settings()
upload_directory = Path(settings.upload_dir)
upload_directory.mkdir(parents=True, exist_ok=True)
write_request_history: dict[str, deque[float]] = defaultdict(deque)
rate_limit_lock = asyncio.Lock()


async def trash_cleanup_loop() -> None:
    while True:
        try:
            async with AsyncSessionFactory() as session:
                removed_ids = await purge_expired_documents(
                    session, settings.trash_retention_days
                )
            for document_id in removed_ids:
                await asyncio.to_thread(
                    rmtree,
                    Path(settings.upload_dir) / str(document_id),
                    True,
                )
            if removed_ids:
                logger.info("expired_trash_removed", count=len(removed_ids))
        except Exception:
            logger.exception("trash_cleanup_failed")
        await asyncio.sleep(settings.trash_cleanup_interval_seconds)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("application_started", environment=settings.app_env)
    cleanup_task = asyncio.create_task(trash_cleanup_loop())
    yield
    cleanup_task.cancel()
    with suppress(asyncio.CancelledError):
        await cleanup_task
    await close_database()
    logger.info("application_stopped")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(APIError, api_error_handler)


@app.middleware("http")
async def write_rate_limit(request: Request, call_next):  # type: ignore[no-untyped-def]
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        client_host = request.client.host if request.client else "unknown"
        key = client_host
        now = monotonic()
        async with rate_limit_lock:
            recent = write_request_history[key]
            while recent and recent[0] <= now - 60:
                recent.popleft()
            if len(recent) >= settings.write_rate_limit_per_minute:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "RATE_LIMITED",
                            "message": "操作过于频繁，请稍后再试",
                            "details": {},
                        }
                    },
                    headers={"Retry-After": "60"},
                )
            recent.append(now)
    return await call_next(request)


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


app.include_router(api_router, prefix=settings.api_v1_prefix)
