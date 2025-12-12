from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models.db_models import Agent as AgentModel, WorkflowStep as WorkflowStepModel


router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "llm"
    model: str = "anthropic/claude-3-haiku"
    prompt_system: Optional[str] = None
    prompt_template: Optional[str] = None
    input_schema: Optional[dict] = None
    output_schema: Optional[dict] = None
    temperature: float = 0.7
    max_tokens: int = 10240*5
    is_active: bool = True


class AgentOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    type: str
    model: str
    prompt_system: Optional[str]
    prompt_template: Optional[str]
    input_schema: Optional[dict]
    output_schema: Optional[dict]
    temperature: float
    max_tokens: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=List[AgentOut])
async def list_agents(session: AsyncSession = Depends(get_session)):
    stmt = select(AgentModel).order_by(AgentModel.created_at.desc())
    result = await session.execute(stmt)
    agents = result.scalars().all()
    return agents


@router.post("/", response_model=AgentOut, status_code=201)
async def create_agent(payload: AgentCreate, session: AsyncSession = Depends(get_session)):
    agent = AgentModel(
        name=payload.name,
        description=payload.description,
        type=payload.type,
        model=payload.model,
        prompt_system=payload.prompt_system,
        prompt_template=payload.prompt_template,
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        is_active=payload.is_active,
    )
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: str, session: AsyncSession = Depends(get_session)):
    agent = await session.get(AgentModel, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: str, payload: AgentCreate, session: AsyncSession = Depends(get_session)
):
    agent = await session.get(AgentModel, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    for field, value in payload.model_dump().items():
        setattr(agent, field, value)

    await session.commit()
    await session.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, session: AsyncSession = Depends(get_session)):
    agent = await session.get(AgentModel, agent_id)
    if not agent:
        # idempotent delete
        return

    # Prevent deletion if this agent is still used in any workflow steps
    stmt = select(WorkflowStepModel).where(WorkflowStepModel.agent_id == agent.id)
    result = await session.execute(stmt)
    in_use = result.scalars().first()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=(
                "Agent đang được sử dụng trong một hoặc nhiều Workflow Steps. "
                "Hãy gỡ agent này khỏi tất cả workflow trước khi xoá."
            ),
        )

    await session.delete(agent)
    await session.commit()
    return