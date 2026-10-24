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
        import time
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            response_mime_type="application/json" if json_mode else "text/plain",
        )

        # Danh sách các model hiện đại thử nghiệm theo thứ tự ưu tiên
        # Ưu tiên model người dùng chọn -> Flash-Lite nhẹ/nhanh -> Flash Preview/Latest
        candidate_models = [self._model]
        modern_fallbacks = [
            "gemini-3.8-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.1-flash-lite",
            "gemini-3-flash-preview",
            "gemini-flash-latest",
            "gemini-flash-lite-latest",
        ]
        for fallback in modern_fallbacks:
            if fallback not in candidate_models:
                candidate_models.append(fallback)

        for candidate in candidate_models:
            try:
                resp = self._client.models.generate_content(
                    model=candidate, contents=prompt, config=config)
                if resp and resp.text:
                    return resp.text
            except Exception as e:
                err_msg = str(e)
                logger.warning("Gemini model '%s' thất bại (%s), chuyển sang model tiếp theo...", candidate, err_msg)
                continue

        logger.info("⚠️ Tất cả các model Gemini trực tuyến đều quá tải/lỗi. Tự động kích hoạt cơ chế AI Local (Rule-based / Knowledge RAG)...")
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
