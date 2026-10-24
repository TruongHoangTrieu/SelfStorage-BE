"""Provider Google Gemini (qua thư viện google-genai)."""
from __future__ import annotations

import logging

from .base import LLMProvider

logger = logging.getLogger(__name__)


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str, embedding_model: str, timeout_s: float = 20.0):
        from google import genai  # import lười để chế độ local không cần thư viện

        self._genai = genai
        self._client = genai.Client(api_key=api_key, http_options={"timeout": int(timeout_s * 1000)})
        self._model = model
        self._embedding_model = embedding_model

    @property
    def available(self) -> bool:
        return True

    @property
    def embedding_model(self) -> str | None:
        return self._embedding_model

    def generate(self, system: str, prompt: str, *, json_mode: bool = False,
                 temperature: float = 0.2) -> str | None:
        from google.genai import types

        try:
            config = types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json" if json_mode else "text/plain",
            )
            resp = self._client.models.generate_content(
                model=self._model, contents=prompt, config=config)
            return resp.text
        except Exception as e:  # noqa: BLE001 - lỗi mạng/hạn mức => fallback
            logger.error("Gemini generate failed: %s", e)
            return None

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        try:
            out: list[list[float]] = []
            for i in range(0, len(texts), 50):  # chia lô để tránh giới hạn kích thước request
                resp = self._client.models.embed_content(
                    model=self._embedding_model, contents=texts[i:i + 50])
                out.extend(list(e.values) for e in resp.embeddings)
            return out
        except Exception as e:  # noqa: BLE001
            logger.error("Gemini embed failed: %s", e)
            return None
