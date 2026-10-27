"""Provider OpenRouter API (hỗ trợ Google Gemma, Llama, v.v.)."""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from .base import LLMProvider

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider(LLMProvider):
    name = "openrouter"

    def __init__(
        self,
        api_key: str,
        model: str = "google/gemma-2-9b-it:free",
        timeout_s: float = 30.0,
    ):
        self._api_key = api_key
        self._model = model
        self._timeout_s = timeout_s

    @property
    def available(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def generate(
        self,
        system: str,
        prompt: str,
        *,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> str | None:
        if not self.available:
            return None

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        # Danh sách model ứng viên theo thứ tự ưu tiên
        candidate_models = [self._model]
        fallbacks = [
            "google/gemma-2-9b-it:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "mistralai/mistral-7b-instruct:free",
            "deepseek/deepseek-r1:free",
            "qwen/qwen-2.5-72b-instruct",
        ]
        for fb in fallbacks:
            if fb not in candidate_models:
                candidate_models.append(fb)

        headers = {
            "Authorization": f"Bearer {self._api_key.strip()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://selfstorage.vn",
            "X-Title": "SelfStorage AI Assistant",
        }

        with httpx.Client(timeout=self._timeout_s) as client:
            for candidate in candidate_models:
                payload: dict[str, Any] = {
                    "model": candidate,
                    "messages": messages,
                    "temperature": temperature,
                }
                if json_mode:
                    payload["response_format"] = {"type": "json_object"}

                try:
                    resp = client.post(OPENROUTER_API_URL, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        choices = data.get("choices") or []
                        if choices:
                            content = choices[0].get("message", {}).get("content") or ""
                            # Loại bỏ thẻ suy luận <thought>...</thought> hoặc <think>...</think> nếu có
                            clean_content = re.sub(r"<(?:think|thought)>.*?</(?:think|thought)>", "", content, flags=re.DOTALL).strip()
                            if clean_content:
                                return clean_content
                            if content:
                                return content
                    else:
                        logger.warning(
                            "OpenRouter model '%s' trả mã HTTP %s: %s",
                            candidate,
                            resp.status_code,
                            resp.text[:200],
                        )
                except Exception as e:
                    logger.warning("OpenRouter model '%s' lỗi kết nối: %s", candidate, e)
                    continue

        logger.info("⚠️ Tất cả các model OpenRouter đều bận/lỗi. Tự động chuyển sang AI Local (Rule-based / RAG / ML)...")
        return None
