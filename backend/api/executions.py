from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models.db_models import (
    Workflow as WorkflowModel,
    WorkflowExecution as WorkflowExecutionModel,
    WorkflowExecutionStep as WorkflowExecutionStepModel,
)
from services.llm_provider import get_llm_provider
from services.orchestrator import Orchestrator, approve_step, reject_step


router = APIRouter()


class RunInput(BaseModel):
    input: Dict[str, Any]


class ExecutionOut(BaseModel):
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


class ExecutionStepOut(BaseModel):
    id: UUID
    execution_id: UUID
    step_id: Optional[UUID]
    agent_id: Optional[UUID]
    status: str
    input: Optional[Dict[str, Any]]
    output: Optional[Dict[str, Any]]
    error: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApprovePayload(BaseModel):
    output: Optional[Dict[str, Any]] = None


class RejectPayload(BaseModel):
    reason: Optional[str] = None


def _attach_llm_to_session(session: AsyncSession) -> None:
    # Attach an LLM provider instance to the session for orchestrator helpers
    if "llm_provider" not in session.info:
        session.info["llm_provider"] = get_llm_provider()


@router.post("/workflows/{workflow_id}/run", response_model=ExecutionOut, status_code=201)
async def run_workflow(
    workflow_id: str,
    payload: RunInput,
    session: AsyncSession = Depends(get_session),
):
    workflow = await session.get(WorkflowModel, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    _attach_llm_to_session(session)
    orchestrator = Orchestrator(session=session, llm=session.info["llm_provider"])
    execution = await orchestrator.start_execution(
        workflow=workflow,
        project_id=str(workflow.project_id) if workflow.project_id else None,
        user_id=None,
        input_payload=payload.input,
    )
    return execution


@router.get("/{execution_id}", response_model=ExecutionOut)
async def get_execution(
    execution_id: str,
    session: AsyncSession = Depends(get_session),
):
    execution = await session.get(WorkflowExecutionModel, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.get("/{execution_id}/steps", response_model=List[ExecutionStepOut])
async def get_execution_steps(
    execution_id: str,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(WorkflowExecutionStepModel).where(
        WorkflowExecutionStepModel.execution_id == execution_id
    )
    result = await session.execute(stmt)
    steps = result.scalars().all()
    return steps


@router.post("/{execution_id}/steps/{step_exec_id}/approve", response_model=ExecutionOut)
async def approve_execution_step(
    execution_id: str,
    step_exec_id: str,
    payload: ApprovePayload,
    session: AsyncSession = Depends(get_session),
):
    execution = await session.get(WorkflowExecutionModel, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    step_exec = await session.get(WorkflowExecutionStepModel, step_exec_id)
    if not step_exec or step_exec.execution_id != execution.id:
        raise HTTPException(status_code=404, detail="Execution step not found")

    _attach_llm_to_session(session)
    updated = await approve_step(
        session=session,
        execution=execution,
        step_exec=step_exec,
        edited_output=payload.output,
    )
    return updated


@router.post("/{execution_id}/steps/{step_exec_id}/reject", response_model=ExecutionOut)
async def reject_execution_step(
    execution_id: str,
    step_exec_id: str,
    payload: RejectPayload,
    session: AsyncSession = Depends(get_session),
):
    execution = await session.get(WorkflowExecutionModel, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    step_exec = await session.get(WorkflowExecutionStepModel, step_exec_id)
    if not step_exec or step_exec.execution_id != execution.id:
        raise HTTPException(status_code=404, detail="Execution step not found")

    updated = await reject_step(
        session=session,
        execution=execution,
        step_exec=step_exec,
        reason=payload.reason,
    )
    return updated


@router.post("/{execution_id}/cancel", response_model=ExecutionOut)
async def cancel_execution(
    execution_id: str,
    session: AsyncSession = Depends(get_session),
):
    execution = await session.get(WorkflowExecutionModel, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    if execution.status in {"completed", "failed", "cancelled"}:
        return execution

    execution.status = "cancelled"
    await session.commit()
    await session.refresh(execution)
    return execution