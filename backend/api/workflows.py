from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models.db_models import (
    Agent as AgentModel,
    Project as ProjectModel,
    Workflow as WorkflowModel,
    WorkflowExecution as WorkflowExecutionModel,
    WorkflowStep as WorkflowStepModel,
)


router = APIRouter()


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class WorkflowOut(BaseModel):
    id: UUID
    project_id: Optional[UUID]
    name: str
    description: Optional[str]
    is_active: bool
    wcs: Optional[Dict[str, Any]] = None
    output_config: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowStepBase(BaseModel):
    step_number: int
    name: str
    type: str  # AGENT / MANUAL_REVIEW / END
    agent_id: Optional[UUID] = None
    requires_approval: bool = False
    config: Optional[Dict[str, Any]] = None
    next_step_id: Optional[UUID] = None


class WorkflowStepCreate(WorkflowStepBase):
    pass


class WorkflowStepUpdate(BaseModel):
    step_number: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    agent_id: Optional[UUID] = None
    requires_approval: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None
    next_step_id: Optional[UUID] = None


class WorkflowStepOut(BaseModel):
    id: UUID
    workflow_id: UUID
    step_number: int
    name: str
    type: str
    agent_id: Optional[UUID]
    requires_approval: bool
    config: Optional[Dict[str, Any]]
    next_step_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowWcsPayload(BaseModel):
    wcs: Dict[str, Any]


class WorkflowWcsOut(BaseModel):
    wcs: Dict[str, Any]


class WorkflowOutputConfigPayload(BaseModel):
    output_config: List[str]


class WorkflowOutputConfigOut(BaseModel):
    output_config: List[str]


class WorkflowLatestExecutionOut(BaseModel):
    id: UUID
    workflow_id: Optional[UUID]
    project_id: Optional[UUID]
    user_id: Optional[str]
    status: str
    input: Dict[str, Any]
    result: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowWithLatestExecutionOut(BaseModel):
    workflow: WorkflowOut
    latest_execution: Optional[WorkflowLatestExecutionOut] = None


@router.get("/with-latest-execution", response_model=List[WorkflowWithLatestExecutionOut])
async def list_workflows_with_latest_execution(
    session: AsyncSession = Depends(get_session),
):
    # NOTE: This route must appear before the dynamic "/{workflow_id}" route.
    # Otherwise requests to "/workflows/with-latest-execution" can be incorrectly
    # matched as workflow_id="with-latest-execution" and cause UUID encoding errors.
    stmt = select(WorkflowModel).order_by(WorkflowModel.created_at.desc())
    result = await session.execute(stmt)
    workflows = result.scalars().all()

    items: List[WorkflowWithLatestExecutionOut] = []
    for wf in workflows:
        exec_stmt = (
            select(WorkflowExecutionModel)
            .where(WorkflowExecutionModel.workflow_id == wf.id)
            .order_by(WorkflowExecutionModel.created_at.desc())
            .limit(1)
        )
        exec_res = await session.execute(exec_stmt)
        latest = exec_res.scalars().first()
        items.append({"workflow": wf, "latest_execution": latest})

    return items


@router.get("/", response_model=List[WorkflowOut])
async def list_workflows(session: AsyncSession = Depends(get_session)):
    stmt = select(WorkflowModel).order_by(WorkflowModel.created_at.desc())
    result = await session.execute(stmt)
    workflows = result.scalars().all()
    return workflows


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.get("/{workflow_id}/wcs", response_model=WorkflowWcsOut)
async def get_workflow_wcs(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wcs = workflow.wcs if isinstance(getattr(workflow, "wcs", None), dict) else {}
    return {"wcs": wcs}


@router.get("/{workflow_id}/output-config", response_model=WorkflowOutputConfigOut)
async def get_workflow_output_config(
    workflow_id: str,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    oc = getattr(workflow, "output_config", None)
    output_config = oc if isinstance(oc, list) else []
    # Ensure it's a list of strings
    output_config = [str(x) for x in output_config if isinstance(x, (str, int, float))]
    return {"output_config": output_config}


@router.put("/{workflow_id}/output-config", response_model=WorkflowOutputConfigOut)
async def update_workflow_output_config(
    workflow_id: str,
    payload: WorkflowOutputConfigPayload,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Normalize to unique strings in input order
    seen: set[str] = set()
    normalized: List[str] = []
    for item in payload.output_config or []:
        if not isinstance(item, str):
            continue
        key = item.strip()
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)

    workflow.output_config = normalized
    await session.commit()
    await session.refresh(workflow)
    oc = getattr(workflow, "output_config", None)
    return {"output_config": oc if isinstance(oc, list) else []}


@router.get("/{workflow_id}/executions/latest", response_model=Optional[WorkflowLatestExecutionOut])
async def get_latest_execution_for_workflow(
    workflow_id: str,
    session: AsyncSession = Depends(get_session),
):
    # Return the latest execution (by created_at) for this workflow.
    stmt = (
        select(WorkflowExecutionModel)
        .where(WorkflowExecutionModel.workflow_id == workflow_id)
        .order_by(WorkflowExecutionModel.created_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    latest = result.scalars().first()
    return latest


@router.put("/{workflow_id}/wcs", response_model=WorkflowWcsOut)
async def update_workflow_wcs(
    workflow_id: str,
    payload: WorkflowWcsPayload,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    workflow.wcs = payload.wcs
    await session.commit()
    await session.refresh(workflow)
    wcs = workflow.wcs if isinstance(getattr(workflow, "wcs", None), dict) else {}
    return {"wcs": wcs}


@router.get("/by-project/{project_id}", response_model=List[WorkflowOut])
async def list_workflows_by_project(
    project_id: str, session: AsyncSession = Depends(get_session)
):
    stmt = (
        select(WorkflowModel)
        .where(WorkflowModel.project_id == project_id)
        .order_by(WorkflowModel.created_at.desc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/projects/{project_id}", response_model=WorkflowOut, status_code=201)
async def create_workflow_for_project(
    project_id: str,
    payload: WorkflowCreate,
    session: AsyncSession = Depends(get_session),
):
    project = await session.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    workflow = WorkflowModel(
        project_id=project.id,
        name=payload.name,
        description=payload.description,
        is_active=payload.is_active,
    )
    session.add(workflow)
    await session.commit()
    await session.refresh(workflow)
    return workflow


@router.put("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: str,
    payload: WorkflowCreate,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    for field, value in payload.model_dump().items():
        setattr(workflow, field, value)

    await session.commit()
    await session.refresh(workflow)
    return workflow


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        return

    await session.delete(workflow)
    await session.commit()
    return


@router.get("/{workflow_id}/steps", response_model=List[WorkflowStepOut])
async def list_workflow_steps(
    workflow_id: str, session: AsyncSession = Depends(get_session)
):
    stmt = (
        select(WorkflowStepModel)
        .where(WorkflowStepModel.workflow_id == workflow_id)
        .order_by(WorkflowStepModel.step_number.asc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


@router.post("/{workflow_id}/steps", response_model=WorkflowStepOut, status_code=201)
async def create_workflow_step(
    workflow_id: str,
    payload: WorkflowStepCreate,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.type == "AGENT" and payload.agent_id is not None:
        agent = await session.get(AgentModel, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=400, detail="Agent not found")

    step = WorkflowStepModel(
        workflow_id=workflow.id,
        step_number=payload.step_number,
        name=payload.name,
        type=payload.type,
        agent_id=payload.agent_id,
        requires_approval=payload.requires_approval,
        config=payload.config,
        next_step_id=payload.next_step_id,
    )
    session.add(step)
    await session.commit()
    await session.refresh(step)
    return step


@router.put("/{workflow_id}/steps/{step_id}", response_model=WorkflowStepOut)
async def update_workflow_step(
    workflow_id: str,
    step_id: str,
    payload: WorkflowStepUpdate,
    session: AsyncSession = Depends(get_session),
):
    step = await session.get(WorkflowStepModel, step_id)
    if not step or str(step.workflow_id) != workflow_id:
        raise HTTPException(status_code=404, detail="Workflow step not found")

    data = payload.model_dump(exclude_unset=True)

    if "agent_id" in data and data["agent_id"] is not None:
        agent = await session.get(AgentModel, data["agent_id"])
        if not agent:
            raise HTTPException(status_code=400, detail="Agent not found")

    for field, value in data.items():
        setattr(step, field, value)

    await session.commit()
    await session.refresh(step)
    return step


@router.delete("/{workflow_id}/steps/{step_id}", status_code=204)
async def delete_workflow_step(
    workflow_id: str,
    step_id: str,
    session: AsyncSession = Depends(get_session),
):
    step = await session.get(WorkflowStepModel, step_id)
    if not step or str(step.workflow_id) != workflow_id:
        return

    await session.delete(step)
    await session.commit()
    return