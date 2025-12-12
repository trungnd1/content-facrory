# Content Factory Monorepo

End-to-end **Content Factory OS** for multi-agent content workflows. This repo contains:

- `backend/`: FastAPI backend with workflow engine, agents, and LLM provider abstraction.
- `frontend/`: Next.js (App Router) admin UI with Projects, Agents, Workflows, and a visual Workflow Designer.
- `docs/`: Product and engineering specs.
- `Prompts/`: System & user prompts for the V3 agent pipeline.

The current backend implements a sequential orchestrator that executes a workflow of steps (GENERIC input, AGENT, MANUAL_REVIEW, END) and stores all inputs/outputs per step. The frontend lets you design and run workflows, inspect JSON I/O of each agent, and wire steps together via typed objects.

## Project Structure

- `backend/`
   - `main.py`: FastAPI app and API routes (projects, agents, workflows, executions).
   - `services/orchestrator.py`: Orchestrator that runs workflows and persists `WorkflowExecutionStep` logs.
   - `services/llm_provider.py`: LLM provider abstraction (OpenAI/OpenRouter/Gemini/mock).
   - `models/db_models.py`: SQLAlchemy models for agents, workflows, executions, etc.

- `frontend/`
   - `app/agents/`: Agent management UI with V3 templates (Topic Gap Finder, Topic Selector, Insight Extractor, Long‑Form, Repurpose, Audience, Monetization).
   - `app/workflows/`: Workflow list and Workflow Design page (drag/drop steps, select input objects, view JSON/logs).
   - `lib/api.ts`: Typed API client used by the frontend.

- `docs/`
   - High-level system specs, UI/UX guideline, and development guideline.

## Running Locally (without Docker)

Backend (from `backend/`):

```powershell
cd backend
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (from `frontend/`):

```powershell
cd frontend
npm install
npm run dev
```

By default the frontend expects the API at `http://127.0.0.1:8000`. You can change this via `NEXT_PUBLIC_API_BASE_URL` in your environment.

## Running with Docker

```powershell
docker compose up --build
```

- Backend: <http://localhost:8000>
- Frontend: <http://localhost:3000>

To use real LLMs you need to set the appropriate API keys as environment variables (e.g. for OpenRouter / OpenAI / Gemini) according to your deployment setup.

## V3 Content Workflow (Agents)

The main V3 pipeline is implemented as a workflow composed from these agents (see `app/agents/AgentsClient.tsx`):

1. **Topic Gap Finder Agent — V3** → outputs `topic_gaps`, `content_seeds`.
2. **Topic Selector Agent — V1** → selects a single `selected_topic` from `topic_gaps`.
3. **Insight Extractor Agent — V3** → produces structured `insights` for a `topic_id`.
4. **Long‑Form Content Generator — V3** → outputs `{ topic_id, long_form }`.
5. **Repurpose Machine Agent — V3** → turns `long_form` into short‑form `videos` scripts.
6. **Audience Analyst Agent — V3** → analyzes performance into `audience_insights`, `new_topics`.
7. **Monetization Architect Agent — V3** → generates `value_ladder` and `cta_recommendations`.

Each agent template defines an `outputSchema` that the frontend uses to infer available output objects and that the orchestrator passes as JSON between steps.

## Workflow Designer

- Add steps (`Input`, Agents) and drag to reorder.
- Configure Generic Input as JSON for the first step.
- For each AGENT step, select which input objects (e.g. `selected_topic`, `insights`, `long_form`) should be passed in.
- Run a workflow and inspect per‑step:
   - **Preview**: human‑readable view of output.
   - **Raw JSON**: exact JSON persisted by the backend.
   - **Logs**: status and any error messages.
For deeper implementation details, see `docs/DEVELOPEMENT_GUIDELINE.md` and the comments in `services/orchestrator.py`.
