from fastapi import FastAPI

from app.routes.videos import router as videos_router
from app.routes.projects import router as projects_router
from app.routes.auth import router as auth_router
from app.routes.billing import router as billing_router


app = FastAPI(title="Flow by Earthin API")

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(videos_router, tags=["videos"])
app.include_router(projects_router, prefix="/projects", tags=["projects"])
app.include_router(billing_router, prefix="/billing", tags=["billing"])

