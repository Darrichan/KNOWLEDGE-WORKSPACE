from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, SessionDep
from app.schema.workspace import WorkspaceCreate, WorkspaceResponse
from app.service.workspace_service import create_workspace, list_workspaces

router = APIRouter()


@router.get("", response_model=list[WorkspaceResponse])
async def get_workspaces(user: CurrentUser, session: SessionDep) -> list[WorkspaceResponse]:
    workspaces = await list_workspaces(session, user.id)
    return [WorkspaceResponse.model_validate(workspace) for workspace in workspaces]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def post_workspace(
    payload: WorkspaceCreate, user: CurrentUser, session: SessionDep
) -> WorkspaceResponse:
    workspace = await create_workspace(session, user.id, payload.name)
    return WorkspaceResponse.model_validate(workspace)
