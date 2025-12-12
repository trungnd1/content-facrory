import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List

import httpx


class LLMProvider(ABC):
    """Abstract LLM provider interface used by the orchestrator and agents."""

    @abstractmethod
    async def chat(self, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> Dict[str, Any]:
        """Send a chat completion request and return a unified OpenAI-style response."""


class OpenAIProvider(LLMProvider):
    """LLM provider for OpenAI chat completions."""

    BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions")

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAIProvider")
        self.api_key = api_key

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {"model": model, "messages": messages}
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(self.BASE_URL, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()


class OpenRouterProvider(LLMProvider):
    """LLM provider implementation for OpenRouter-compatible chat completions."""

    BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is required for OpenRouterProvider")
        self.api_key = api_key

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost"),
            "X-Title": os.getenv("OPENROUTER_APP_TITLE", "ContentFactory"),
        }

        payload: Dict[str, Any] = {"model": model, "messages": messages}
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(self.BASE_URL, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()


class GeminiProvider(LLMProvider):
    """LLM provider for Google Gemini.

    Adapts OpenAI-style messages into Gemini's generateContent format and
    returns an OpenAI-style response shape for the orchestrator.
    """

    # Use stable v1 endpoint by default; can override via GEMINI_BASE_URL.
    BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1")

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for GeminiProvider")
        self.api_key = api_key
        # Allow overriding timeout via env; default to 60s to avoid frequent ReadTimeout
        try:
            self.timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "60"))
        except ValueError:
            self.timeout = 60.0

    async def chat(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        # Map OpenAI-style messages to Gemini "contents".
        contents: List[Dict[str, Any]] = []
        for m in messages:
            role = m.get("role", "user")
            text = m.get("content", "")
            if role == "assistant":
                contents.append({"role": "model", "parts": [{"text": text}]})
            else:  # system/user -> user
                contents.append({"role": "user", "parts": [{"text": text}]})

        generation_config: Dict[str, Any] = {}
        if "temperature" in kwargs:
            generation_config["temperature"] = kwargs["temperature"]
        if "max_tokens" in kwargs:
            # Gemini uses maxOutputTokens
            generation_config["maxOutputTokens"] = kwargs["max_tokens"]

        body: Dict[str, Any] = {"contents": contents}
        if generation_config:
            body["generationConfig"] = generation_config

        # Use the model id exactly as configured (e.g. "gemini-2.5-flash").
        url = f"{self.BASE_URL}/models/{model}:generateContent?key={self.api_key}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(url, json=body)
            except httpx.ReadTimeout as exc:
                # Raise a clearer error message for orchestrator / UI
                raise Exception(f"Gemini request timed out after {self.timeout} seconds") from exc

            resp.raise_for_status()
            data = resp.json()

        # Adapt Gemini response into OpenAI-style {choices: [{message: {content}}]} shape
        text = ""
        try:
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts") or []
                if parts:
                    text = parts[0].get("text", "")
        except Exception:
            text = ""

        return {
            "model": model,
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": text,
                    }
                }
            ],
        }


class MockProvider(LLMProvider):
    """Simple mock provider for local testing without external calls."""

    async def chat(self, model: str, messages: List[Dict[str, Any]], **kwargs: Any) -> Dict[str, Any]:
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        return {
            "model": model,
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": f"[MOCK RESPONSE] for input: {last_user[:200]}",
                    }
                }
            ],
        }


def get_llm_provider() -> LLMProvider:
    """Factory that returns the configured LLM provider based on env vars.

    Controlled by LLM_PROVIDER env, one of: openai, openrouter, gemini, mock.
    """

    provider_name = os.getenv("LLM_PROVIDER", "openrouter").lower()

    if provider_name == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        return OpenAIProvider(api_key=api_key)

    if provider_name == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        return OpenRouterProvider(api_key=api_key)

    if provider_name == "gemini":
        api_key = os.getenv("GEMINI_API_KEY", "")
        return GeminiProvider(api_key=api_key)

    if provider_name == "mock":
        return MockProvider()

    raise ValueError(f"Unsupported LLM_PROVIDER: {provider_name}")