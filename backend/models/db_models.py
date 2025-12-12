import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), nullable=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=True, unique=True)
    description = Column(Text, nullable=True)
    type = Column(String, nullable=False, default="llm")
    model = Column(String, nullable=False)
    prompt_system = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=True)
    input_schema = Column(JSON, nullable=True)
    output_schema = Column(JSON, nullable=True)
    temperature = Column(Float, nullable=False, default=0.3)
    max_tokens = Column(Integer, nullable=False, default=1024)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workflows = relationship("Workflow", back_populates="project", cascade="all, delete-orphan")


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project = relationship("Project", back_populates="workflows")
    steps = relationship("WorkflowStep", back_populates="workflow", cascade="all, delete-orphan")


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(
        UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    step_number = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # AGENT / MANUAL_REVIEW / END
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    requires_approval = Column(Boolean, nullable=False, default=False)
    config = Column(JSON, nullable=True)
    next_step_id = Column(UUID(as_uuid=True), ForeignKey("workflow_steps.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workflow = relationship("Workflow", back_populates="steps", foreign_keys=[workflow_id])
    agent = relationship("Agent")
    next_step = relationship("WorkflowStep", remote_side=[id])


class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    input = Column(JSON, nullable=False)
    result = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    steps = relationship(
        "WorkflowExecutionStep", back_populates="execution", cascade="all, delete-orphan"
    )


class WorkflowExecutionStep(Base):
    __tablename__ = "workflow_execution_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(
        UUID(as_uuid=True), ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False
    )
    step_id = Column(UUID(as_uuid=True), ForeignKey("workflow_steps.id"), nullable=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    status = Column(String, nullable=False, default="pending")
    input = Column(JSON, nullable=True)
    output = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    execution = relationship("WorkflowExecution", back_populates="steps")
    step = relationship("WorkflowStep")
    agent = relationship("Agent")
