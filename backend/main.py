from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

base_dir = Path(__file__).resolve().parent

# Load environment variables: base .env, then .env.local overriding it
load_dotenv(override=False)
load_dotenv(base_dir / ".env.local", override=True)

from api import health, agents, workflows, executions, projects, llm_config  # noqa: E402


app = FastAPI(title="Content Factory API (demo)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(agents.router, prefix="/agents", tags=["agents"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
app.include_router(executions.router, prefix="/executions", tags=["executions"])
app.include_router(llm_config.router, prefix="/llm", tags=["llm"])

@app.get("/")
def root():
    return {"message": "Content Factory Backend (demo) alive"}