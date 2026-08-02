from fastapi import Request
from fastapi.responses import JSONResponse

from app.exception.errors import APIError


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "requestId": getattr(request.state, "request_id", None),
                "details": exc.details,
            }
        },
    )
