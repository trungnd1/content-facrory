from typing import List

import os
from fastapi import APIRouter
from pydantic import BaseModel

from services.llm_provider import get_llm_provider


router = APIRouter()


class LLMModelOut(BaseModel):
    id: str
    label: str


class LLMProviderOut(BaseModel):
    id: str
    name: str
    enabled: bool
    models: List[LLMModelOut]


def _provider_enabled(provider_id: str) -> bool:
    env_map = {
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }
    env_var = env_map.get(provider_id)
    if not env_var:
        return False
    return bool(os.getenv(env_var))


@router.get("/providers", response_model=List[LLMProviderOut])
async def list_llm_providers() -> List[LLMProviderOut]:
    """Expose configured LLM providers and a curated list of models for each.

    This is used by the frontend Agent UI to show provider + model options.
    """

    providers: List[LLMProviderOut] = []

    providers.append(
        LLMProviderOut(
            id="openai",
            name="OpenAI",
            enabled=_provider_enabled("openai"),
            models=[
                LLMModelOut(id="gpt-4.1-mini", label="GPT-4.1 Mini"),
                LLMModelOut(id="gpt-4.1", label="GPT-4.1"),
                LLMModelOut(id="gpt-4o-mini", label="GPT-4o Mini"),
                LLMModelOut(id="gpt-4o", label="GPT-4o"),
            ],
        )
    )

    providers.append(
        LLMProviderOut(
            id="openrouter",
            name="OpenRouter",
            enabled=_provider_enabled("openrouter"),
            models=[
                LLMModelOut(id="openai/gpt-4.1-mini", label="OpenAI GPT-4.1 Mini (via OpenRouter)"),
                LLMModelOut(id="openai/gpt-4o-mini", label="OpenAI GPT-4o Mini (via OpenRouter)"),
                LLMModelOut(id="anthropic/claude-3.5-sonnet", label="Claude 3.5 Sonnet"),
                LLMModelOut(id="meta-llama/llama-3.1-70b-instruct", label="Llama 3.1 70B Instruct"),
            ],
        )
    )

    providers.append(
        LLMProviderOut(
            id="gemini",
            name="Gemini",
            enabled=_provider_enabled("gemini"),
            models=[
                LLMModelOut(id="gemini-2.5-flash", label="Gemini 2.5 Flash"),
                LLMModelOut(id="gemini-2.5-pro", label="Gemini 2.5 Pro"),
            ],
        )
    )

    return providers


@router.get("/current")
async def get_current_llm_config() -> dict:
    """Debug endpoint: show which LLM provider/model the backend sees.

    Helpful when env vars have changed but the running process still
    appears to use an old provider (e.g. OpenRouter vs Gemini).
    """

    provider_env = os.getenv("LLM_PROVIDER", "<unset>")
    default_model = os.getenv("DEFAULT_MODEL", "<unset>")

    provider_instance = get_llm_provider()
    provider_class = provider_instance.__class__.__name__

    return {
        "LLM_PROVIDER_env": provider_env,
        "DEFAULT_MODEL_env": default_model,
        "provider_class": provider_class,
    }
