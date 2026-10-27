"""Provider DeepSeek API chính thức (hỗ trợ deepseek-chat V3, deepseek-reasoner R1)."""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from .base import LLMProvider

logger = logging.getLogger(__name__)

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"


class DeepSeekProvider(LLMProvider):
    name = "deepseek"

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek-chat",
        timeout_s: float = 35.0,
    ):
        self._api_key = api_key
        self._model = model or "deepseek-chat"
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
        temperature: float = 0.3,
    ) -> str | None:
        if not self.available:
            return None

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        headers = {
            "Authorization": f"Bearer {self._api_key.strip()}",
            "Content-Type": "application/json",
        }

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        try:
            with httpx.Client(timeout=self._timeout_s) as client:
                resp = client.post(DEEPSEEK_API_URL, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices") or []
                    if choices:
                        content = choices[0].get("message", {}).get("content") or ""
                        clean_content = re.sub(
                            r"<(?:think|thought)>.*?</(?:think|thought)>",
                            "",
                            content,
                            flags=re.DOTALL,
                        ).strip()
                        return clean_content or content
                else:
                    logger.warning(
                        "DeepSeek API trả mã HTTP %s: %s",
                        resp.status_code,
                        resp.text[:250],
                    )
        except Exception as e:
            logger.error("Lỗi kết nối DeepSeek API: %s", e)

        return None
