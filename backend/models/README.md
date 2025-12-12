# Backend Models Overview

This folder contains the database and Pydantic models used by the FastAPI backend.

Key file:

- `db_models.py`: SQLAlchemy models for:
  - `Agent`: LLM agent configuration (name, model, prompts, schemas).
  - `Workflow`: logical workflow belonging to a project.
  - `WorkflowStep`: ordered steps inside a workflow.
  - `WorkflowExecution`: a single run of a workflow.
  - `WorkflowExecutionStep`: per-step logs (input, output, status, error).

These models are used throughout the API routes and the `Orchestrator` in `services/orchestrator.py`.