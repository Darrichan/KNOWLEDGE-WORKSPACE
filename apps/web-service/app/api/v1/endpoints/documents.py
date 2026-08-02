from io import BytesIO
from pathlib import Path
from shutil import rmtree
from urllib.parse import unquote
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import CurrentUser, SessionDep
from app.core.config import get_settings
from app.exception.errors import APIError
from app.schema.document import (
    DocumentBatchDeleteRequest,
    DocumentBatchDeleteResponse,
    DocumentCreate,
    DocumentMoveRequest,
    DocumentResponse,
    DocumentShareCreate,
    DocumentShareResponse,
    DocumentShareUpdate,
    DocumentUpdate,
    DocumentVersionResponse,
)
from app.service.document_service import (
    batch_delete_documents,
    batch_permanently_delete_documents,
    create_document,
    delete_document,
    delete_document_share,
    delete_document_version,
    duplicate_document,
    get_document,
    list_document_shares,
    list_documents,
    list_recent_documents,
    list_shared_documents,
    list_trashed_documents,
    list_versions,
    move_document,
    permanently_delete_document,
    record_document_view,
    require_document_edit_access,
    restore_document,
    restore_document_version,
    search_documents,
    share_document,
    update_document,
    update_document_share,
)
from app.service.publication_service import publish_document, unpublish_document

router = APIRouter()
settings = get_settings()
allowed_image_types = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/x-png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
}


def create_document_thumbnail(payload: bytes, target: Path) -> None:
    with Image.open(BytesIO(payload)) as source:
        source.seek(0)
        image = ImageOps.exif_transpose(source)
        image.thumbnail((1280, 960), Image.Resampling.LANCZOS)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(target, format="WEBP", quality=68, method=4, optimize=True)


def document_response(document: object, **updates: object) -> DocumentResponse:
    return DocumentResponse.model_validate(document).model_copy(update=updates)


def share_response(share: object, target: object) -> DocumentShareResponse:
    return DocumentShareResponse(
        id=share.id,
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        permission=share.permission,
        created_at=share.created_at,
    )


@router.get("/workspaces/{workspace_id}/documents", response_model=list[DocumentResponse])
async def get_documents(
    workspace_id: UUID, user: CurrentUser, session: SessionDep
) -> list[DocumentResponse]:
    documents = await list_documents(session, user.id, workspace_id)
    return [document_response(document, owner_name=user.display_name) for document in documents]


@router.get("/documents/shared", response_model=list[DocumentResponse])
async def get_shared_documents(
    user: CurrentUser, session: SessionDep
) -> list[DocumentResponse]:
    rows = await list_shared_documents(session, user.id)
    return [
        document_response(document, access_role=permission, owner_name=owner_name)
        for document, permission, owner_name in rows
    ]


@router.get("/documents/recent", response_model=list[DocumentResponse])
async def get_recent_documents(
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=30, ge=1, le=100),
) -> list[DocumentResponse]:
    rows = await list_recent_documents(session, user.id, limit)
    return [
        document_response(
            document,
            last_viewed_at=last_viewed_at,
            access_role=workspace_role or share_permission or "viewer",
            owner_name=owner_name,
        )
        for document, last_viewed_at, workspace_role, share_permission, owner_name in rows
    ]


@router.get("/documents/search", response_model=list[DocumentResponse])
async def get_search_documents(
    user: CurrentUser,
    session: SessionDep,
    query: str = Query(min_length=1, max_length=120),
) -> list[DocumentResponse]:
    rows = await search_documents(session, user.id, query)
    return [
        document_response(document, access_role=permission, owner_name=owner_name)
        for document, permission, owner_name in rows
    ]


@router.post("/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def post_document(
    payload: DocumentCreate, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await create_document(session, user.id, payload)
    return document_response(document, owner_name=user.display_name)


@router.get("/documents/trash", response_model=list[DocumentResponse])
async def get_trashed_documents(
    user: CurrentUser, session: SessionDep
) -> list[DocumentResponse]:
    rows = await list_trashed_documents(session, user.id)
    return [
        document_response(document, access_role=role, owner_name=owner_name)
        for document, role, owner_name in rows
    ]


@router.post(
    "/documents/batch-delete", response_model=DocumentBatchDeleteResponse
)
async def post_batch_delete_documents(
    payload: DocumentBatchDeleteRequest, user: CurrentUser, session: SessionDep
) -> DocumentBatchDeleteResponse:
    count = await batch_delete_documents(session, user.id, payload.document_ids)
    return DocumentBatchDeleteResponse(deleted_count=count)


@router.post(
    "/documents/trash/batch-delete", response_model=DocumentBatchDeleteResponse
)
async def post_batch_permanent_delete_documents(
    payload: DocumentBatchDeleteRequest, user: CurrentUser, session: SessionDep
) -> DocumentBatchDeleteResponse:
    removed_ids = await batch_permanently_delete_documents(
        session, user.id, payload.document_ids
    )
    for removed_id in removed_ids:
        await run_in_threadpool(
            rmtree, Path(settings.upload_dir) / str(removed_id), True
        )
    return DocumentBatchDeleteResponse(deleted_count=len(removed_ids))


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document_by_id(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await get_document(session, user.id, document_id)
    await record_document_view(session, user.id, document_id)
    return document_response(document)


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def patch_document(
    document_id: UUID,
    payload: DocumentUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> DocumentResponse:
    document = await update_document(session, user.id, document_id, payload)
    return document_response(document)


@router.post("/documents/{document_id}/publish", response_model=DocumentResponse)
async def post_publish_document(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await publish_document(session, user.id, document_id)
    return document_response(document, owner_name=user.display_name)


@router.delete("/documents/{document_id}/publish", response_model=DocumentResponse)
async def remove_published_document(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await unpublish_document(session, user.id, document_id)
    return document_response(document, owner_name=user.display_name)


@router.post("/documents/{document_id}/assets", status_code=status.HTTP_201_CREATED)
async def upload_document_asset(
    document_id: UUID,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
) -> dict[str, object]:
    await require_document_edit_access(session, user.id, document_id)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    extension = allowed_image_types.get(content_type)
    if extension is None:
        raise APIError("UNSUPPORTED_IMAGE_TYPE", "仅支持 JPG、PNG、GIF、WebP 和 AVIF 图片", 415)

    payload = await request.body()
    if not payload:
        raise APIError("EMPTY_UPLOAD", "请选择需要上传的图片", 400)
    if len(payload) > settings.upload_max_bytes:
        max_megabytes = settings.upload_max_bytes // (1024 * 1024)
        raise APIError("UPLOAD_TOO_LARGE", f"图片大小不能超过 {max_megabytes} MB", 413)

    original_name = unquote(request.headers.get("x-file-name", "image"))[:240]
    relative_directory = Path(str(document_id))
    asset_id = uuid4().hex
    filename = f"{asset_id}{extension}"
    thumbnail_filename = f"{asset_id}.thumb.webp"
    target_directory = Path(settings.upload_dir) / relative_directory
    await run_in_threadpool(target_directory.mkdir, parents=True, exist_ok=True)
    await run_in_threadpool((target_directory / filename).write_bytes, payload)
    thumbnail_url = f"/api/v1/documents/{document_id}/assets/{filename}"
    try:
        await run_in_threadpool(
            create_document_thumbnail,
            payload,
            target_directory / thumbnail_filename,
        )
        thumbnail_url = f"/api/v1/documents/{document_id}/assets/{thumbnail_filename}"
    except (UnidentifiedImageError, OSError, ValueError):
        pass
    return {
        "url": f"/api/v1/documents/{document_id}/assets/{filename}",
        "thumbnail_url": thumbnail_url,
        "name": original_name,
        "size": len(payload),
        "mime_type": content_type,
    }


@router.get("/documents/{document_id}/assets/{filename}", response_class=FileResponse)
async def get_document_asset(
    document_id: UUID,
    filename: str,
    user: CurrentUser,
    session: SessionDep,
) -> FileResponse:
    await get_document(session, user.id, document_id)
    safe_name = Path(filename).name
    extension = Path(safe_name).suffix.lower()
    image_type = next(
        (
            mime_type
            for mime_type, suffix in allowed_image_types.items()
            if suffix == extension
        ),
        None,
    )
    if safe_name != filename or image_type is None:
        raise APIError("INVALID_ASSET_NAME", "图片地址无效", 400)
    target = Path(settings.upload_dir) / str(document_id) / safe_name
    if not target.is_file():
        raise APIError("ASSET_NOT_FOUND", "图片不存在", 404)
    return FileResponse(target, media_type=image_type, filename=safe_name)


@router.post("/documents/{document_id}/duplicate", response_model=DocumentResponse)
async def post_duplicate_document(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await duplicate_document(session, user.id, document_id)
    return document_response(document, owner_name=user.display_name)


@router.patch("/documents/{document_id}/move", response_model=DocumentResponse)
async def patch_document_parent(
    document_id: UUID,
    payload: DocumentMoveRequest,
    user: CurrentUser,
    session: SessionDep,
) -> DocumentResponse:
    document = await move_document(session, user.id, document_id, payload.parent_id)
    return document_response(document)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_document(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> Response:
    await delete_document(session, user.id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/restore", response_model=DocumentResponse)
async def post_restore_document(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> DocumentResponse:
    document = await restore_document(session, user.id, document_id)
    return document_response(document, owner_name=user.display_name)


@router.delete(
    "/documents/{document_id}/permanent", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_document_permanently(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> Response:
    removed_ids = await permanently_delete_document(session, user.id, document_id)
    for removed_id in removed_ids:
        await run_in_threadpool(
            rmtree, Path(settings.upload_dir) / str(removed_id), True
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/documents/{document_id}/shares", response_model=list[DocumentShareResponse]
)
async def get_document_shares(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> list[DocumentShareResponse]:
    rows = await list_document_shares(session, user.id, document_id)
    return [share_response(share, target) for share, target in rows]


@router.post(
    "/documents/{document_id}/shares",
    response_model=DocumentShareResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_document_share(
    document_id: UUID,
    payload: DocumentShareCreate,
    user: CurrentUser,
    session: SessionDep,
) -> DocumentShareResponse:
    share, target = await share_document(session, user.id, document_id, payload)
    return share_response(share, target)


@router.patch(
    "/documents/{document_id}/shares/{share_id}", response_model=DocumentShareResponse
)
async def patch_document_share(
    document_id: UUID,
    share_id: UUID,
    payload: DocumentShareUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> DocumentShareResponse:
    share, target = await update_document_share(
        session, user.id, document_id, share_id, payload.permission
    )
    return share_response(share, target)


@router.delete(
    "/documents/{document_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_document_share(
    document_id: UUID,
    share_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> Response:
    await delete_document_share(session, user.id, document_id, share_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/documents/{document_id}/versions", response_model=list[DocumentVersionResponse]
)
async def get_document_versions(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> list[DocumentVersionResponse]:
    versions = await list_versions(session, user.id, document_id)
    return [
        DocumentVersionResponse.model_validate(version).model_copy(
            update={"actor_name": actor_name}
        )
        for version, actor_name in versions
    ]


@router.post(
    "/documents/{document_id}/versions/{version_id}/restore",
    response_model=DocumentResponse,
)
async def post_restore_document_version(
    document_id: UUID,
    version_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> DocumentResponse:
    document = await restore_document_version(
        session, user.id, document_id, version_id
    )
    return document_response(document)


@router.delete(
    "/documents/{document_id}/versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_document_version(
    document_id: UUID,
    version_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> Response:
    await delete_document_version(session, user.id, document_id, version_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
