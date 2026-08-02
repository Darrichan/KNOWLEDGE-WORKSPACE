from fastapi import APIRouter

from app.api.v1.endpoints import auth, documents, health, mind_maps, publications, workspaces

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(documents.router, tags=["documents"])
api_router.include_router(mind_maps.router, tags=["mind-maps"])
api_router.include_router(publications.router, prefix="/public", tags=["publications"])
