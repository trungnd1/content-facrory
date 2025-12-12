from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models.db_models import Project as ProjectModel


router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "active"


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[ProjectOut])
async def list_projects(session: AsyncSession = Depends(get_session)):
    stmt = select(ProjectModel).order_by(ProjectModel.created_at.desc())
    result = await session.execute(stmt)
    projects = result.scalars().all()
    return projects


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(payload: ProjectCreate, session: AsyncSession = Depends(get_session)):
    project = ProjectModel(
        name=payload.name,
        description=payload.description,
        status=payload.status,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, session: AsyncSession = Depends(get_session)):
    project = await session.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str, payload: ProjectCreate, session: AsyncSession = Depends(get_session)
):
    project = await session.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in payload.model_dump().items():
        setattr(project, field, value)

    await session.commit()
    await session.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, session: AsyncSession = Depends(get_session)):
    project = await session.get(ProjectModel, project_id)
    if not project:
        return

    await session.delete(project)
    await session.commit()
    return
