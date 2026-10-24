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
    if s.llm_provider.lower() == "gemini" and s.gemini_api_key:
        try:
            from .gemini import GeminiProvider

            logger.info("LLM provider: Gemini (%s)", s.gemini_model)
            return GeminiProvider(s.gemini_api_key, s.gemini_model,
                                  s.gemini_embedding_model, s.llm_timeout_s)
        except Exception as e:  # noqa: BLE001
            logger.error("Không khởi tạo được Gemini, chuyển sang local: %s", e)
    logger.info("LLM provider: local (không dùng LLM bên ngoài)")
    return LocalProvider()
