"""LLM layer: chọn provider theo cấu hình, tự rơi về chế độ local khi thiếu API key."""
from __future__ import annotations

import logging
from functools import lru_cache

from ..config import get_settings
from .base import LLMProvider

logger = logging.getLogger(__name__)


class LocalProvider(LLMProvider):
    """Không gọi LLM bên ngoài. Các kỹ năng sẽ dùng rule-based + model tự huấn luyện."""

    name = "local"

    @property
    def available(self) -> bool:
        return False

    def generate(self, system: str, prompt: str, *, json_mode: bool = False,
                 temperature: float = 0.2) -> str | None:
        return None


@lru_cache
def get_llm() -> LLMProvider:
    s = get_settings()
    provider = s.llm_provider.lower().strip()

    # 1. Ưu tiên OpenRouter nếu cấu hình provider="openrouter" hoặc có OPENROUTER_API_KEY
    if provider == "openrouter" or (s.openrouter_api_key and not s.gemini_api_key):
        if s.openrouter_api_key:
            try:
                from .openrouter import OpenRouterProvider

                logger.info("LLM provider: OpenRouter (%s)", s.openrouter_model)
                return OpenRouterProvider(s.openrouter_api_key, s.openrouter_model, s.llm_timeout_s)
            except Exception as e:
                logger.error("Không khởi tạo được OpenRouter: %s", e)

    # 2. Gemini provider
    if provider == "gemini" or s.gemini_api_key:
        if s.gemini_api_key:
            try:
                from .gemini import GeminiProvider

                logger.info("LLM provider: Gemini (%s)", s.gemini_model)
                return GeminiProvider(
                    s.gemini_api_key,
                    s.gemini_model,
                    s.gemini_embedding_model,
                    s.llm_timeout_s,
                )
            except Exception as e:
                logger.error("Không khởi tạo được Gemini: %s", e)

    # 3. Fallback ngược lại nếu còn key OpenRouter dự phòng
    if s.openrouter_api_key:
        try:
            from .openrouter import OpenRouterProvider

            logger.info("Fallback sang OpenRouter (%s)", s.openrouter_model)
            return OpenRouterProvider(s.openrouter_api_key, s.openrouter_model, s.llm_timeout_s)
        except Exception as e:
            logger.error("Không khởi tạo được OpenRouter dự phòng: %s", e)

    logger.info("LLM provider: local (không dùng LLM bên ngoài, kích hoạt Rule-based + ML)")
    return LocalProvider()
