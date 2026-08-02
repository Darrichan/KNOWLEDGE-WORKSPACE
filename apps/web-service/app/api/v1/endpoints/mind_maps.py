from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.dependencies import CurrentUser, SessionDep
from app.schema.mind_map import (
    MindMapCreate,
    MindMapResponse,
    MindMapUpdate,
    MindMapVersionResponse,
)
from app.service.mind_map_service import (
    create_mind_map,
    delete_mind_map_version,
    duplicate_mind_map,
    get_mind_map,
    get_mind_map_by_id,
    list_mind_map_versions,
    list_mind_maps,
    remove_mind_map,
    restore_mind_map_version,
    save_mind_map,
    update_mind_map,
)

router = APIRouter()


@router.get("/documents/{document_id}/mind-map", response_model=MindMapResponse)
async def get_document_mind_map(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> MindMapResponse:
    mind_map = await get_mind_map(session, user.id, document_id)
    return MindMapResponse.model_validate(mind_map)


@router.put("/documents/{document_id}/mind-map", response_model=MindMapResponse)
async def put_document_mind_map(
    document_id: UUID,
    payload: MindMapUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await save_mind_map(session, user.id, document_id, payload)
    return MindMapResponse.model_validate(mind_map)


@router.get("/documents/{document_id}/mind-maps", response_model=list[MindMapResponse])
async def get_document_mind_maps(
    document_id: UUID, user: CurrentUser, session: SessionDep
) -> list[MindMapResponse]:
    mind_maps = await list_mind_maps(session, user.id, document_id)
    return [MindMapResponse.model_validate(item) for item in mind_maps]


@router.post("/documents/{document_id}/mind-maps", response_model=MindMapResponse, status_code=201)
async def post_document_mind_map(
    document_id: UUID,
    payload: MindMapCreate,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await create_mind_map(session, user.id, document_id, payload)
    return MindMapResponse.model_validate(mind_map)


@router.get("/documents/{document_id}/mind-maps/{mind_map_id}", response_model=MindMapResponse)
async def get_document_mind_map_by_id(
    document_id: UUID,
    mind_map_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await get_mind_map_by_id(session, user.id, document_id, mind_map_id)
    return MindMapResponse.model_validate(mind_map)


@router.put("/documents/{document_id}/mind-maps/{mind_map_id}", response_model=MindMapResponse)
async def put_document_mind_map_by_id(
    document_id: UUID,
    mind_map_id: UUID,
    payload: MindMapUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await update_mind_map(
        session, user.id, document_id, mind_map_id, payload
    )
    return MindMapResponse.model_validate(mind_map)


@router.post(
    "/documents/{document_id}/mind-maps/{mind_map_id}/duplicate",
    response_model=MindMapResponse,
    status_code=201,
)
async def post_duplicate_document_mind_map(
    document_id: UUID,
    mind_map_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await duplicate_mind_map(session, user.id, document_id, mind_map_id)
    return MindMapResponse.model_validate(mind_map)


@router.delete("/documents/{document_id}/mind-maps/{mind_map_id}", status_code=204)
async def delete_document_mind_map(
    document_id: UUID,
    mind_map_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> None:
    await remove_mind_map(session, user.id, document_id, mind_map_id)


@router.get(
    "/documents/{document_id}/mind-maps/{mind_map_id}/versions",
    response_model=list[MindMapVersionResponse],
)
async def get_document_mind_map_versions(
    document_id: UUID,
    mind_map_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> list[MindMapVersionResponse]:
    versions = await list_mind_map_versions(
        session, user.id, document_id, mind_map_id
    )
    return [
        MindMapVersionResponse.model_validate(version).model_copy(
            update={"actor_name": actor_name}
        )
        for version, actor_name in versions
    ]


@router.post(
    "/documents/{document_id}/mind-maps/{mind_map_id}/versions/{version_id}/restore",
    response_model=MindMapResponse,
)
async def post_restore_document_mind_map_version(
    document_id: UUID,
    mind_map_id: UUID,
    version_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> MindMapResponse:
    mind_map = await restore_mind_map_version(
        session, user.id, document_id, mind_map_id, version_id
    )
    return MindMapResponse.model_validate(mind_map)


@router.delete(
    "/documents/{document_id}/mind-maps/{mind_map_id}/versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_document_mind_map_version(
    document_id: UUID,
    mind_map_id: UUID,
    version_id: UUID,
    user: CurrentUser,
    session: SessionDep,
) -> Response:
    await delete_mind_map_version(
        session, user.id, document_id, mind_map_id, version_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
