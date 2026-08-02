from typing import Any


class APIError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class NotFoundError(APIError):
    def __init__(self, resource: str = "资源") -> None:
        super().__init__("RESOURCE_NOT_FOUND", f"{resource}不存在", 404)


class PermissionDeniedError(APIError):
    def __init__(self) -> None:
        super().__init__("PERMISSION_DENIED", "没有执行此操作的权限", 403)


class VersionConflictError(APIError):
    def __init__(self, current_version: int | None = None) -> None:
        super().__init__(
            "DOCUMENT_VERSION_CONFLICT",
            "文档已经被更新，请刷新后重试",
            409,
            {"currentVersion": current_version} if current_version is not None else {},
        )


class MindMapVersionConflictError(APIError):
    def __init__(self, current_version: int | None = None) -> None:
        super().__init__(
            "MIND_MAP_VERSION_CONFLICT",
            "思维导图已经被更新，请刷新后重试",
            409,
            {"currentVersion": current_version} if current_version is not None else {},
        )
