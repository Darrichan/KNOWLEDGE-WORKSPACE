from fastapi import APIRouter
from sqlalchemy import text

from app.api.dependencies import SessionDep
from app.exception.errors import APIError

router = APIRouter()


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "service": "zhiliu-api"}


@router.get("/health/ready")
async def ready(session: SessionDep) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise APIError("DATABASE_UNAVAILABLE", "数据库暂不可用", 503) from exc
    return {"status": "ready", "database": "ok"}
