"""Lớp trừu tượng gọi LLM để có thể đổi nhà cung cấp mà không sửa các kỹ năng."""
from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    name: str = "base"

    @property
    @abstractmethod
    def available(self) -> bool:
        """True nếu provider gọi được LLM thật."""

    @abstractmethod
    def generate(self, system: str, prompt: str, *, json_mode: bool = False,
                 temperature: float = 0.2) -> str | None:
        """Sinh văn bản. Trả None nếu không gọi được."""

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Tạo embedding. Trả None nếu provider không hỗ trợ."""
        return None

    @property
    def embedding_model(self) -> str | None:
        return None

    def generate_json(self, system: str, prompt: str, *, retries: int = 2) -> Any | None:
        """Sinh JSON; parse lỗi thì gọi lại tối đa `retries` lần (theo kế hoạch mục 3)."""
        last_err = None
        for attempt in range(retries + 1):
            raw = self.generate(system, prompt if attempt == 0 else
                                f"{prompt}\n\nLần trước trả JSON sai định dạng ({last_err}). "
                                "Chỉ trả về JSON hợp lệ, không thêm chữ nào khác.",
                                json_mode=True, temperature=0.0)
            if raw is None:
                return None
            try:
                return parse_json(raw)
            except ValueError as e:
                last_err = str(e)
                logger.warning("LLM JSON parse failed (attempt %s): %s", attempt + 1, e)
        return None


def parse_json(raw: str) -> Any:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(str(e)) from e
