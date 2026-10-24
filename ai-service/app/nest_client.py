"""Client gọi ngược các endpoint nội bộ của NestJS (/api/internal/*)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)


class NestClient:
    def __init__(self) -> None:
        s = get_settings()
        self._base = s.nest_base_url.rstrip("/")
        self._headers = {
            "x-internal-key": s.ai_internal_key,
            # Vượt qua middleware anti-CSRF của NestJS cho request server-to-server
            "x-requested-with": "XMLHttpRequest",
        }
        self._timeout = s.nest_timeout_s

    def _request(self, method: str, path: str, *, user_id: str | None = None,
                 params: dict | None = None, json: dict | None = None) -> Any | None:
        headers = dict(self._headers)
        if user_id:
            headers["x-user-id"] = user_id  # user_id lấy từ JWT do NestJS truyền xuống, LLM không chọn
        try:
            with httpx.Client(timeout=self._timeout) as c:
                r = c.request(method, f"{self._base}{path}", headers=headers, params=params, json=json)
                r.raise_for_status()
                return r.json()
        except Exception as e:  # noqa: BLE001
            logger.error("Gọi NestJS %s %s thất bại: %s", method, path, e)
            return None

    def available_units(self, min_volume_m3: float | None = None, facility_id: str | None = None) -> list[dict] | None:
        params: dict[str, Any] = {}
        if min_volume_m3 is not None:
            params["minVolume"] = round(min_volume_m3, 3)
        if facility_id:
            params["facilityId"] = facility_id
        return self._request("GET", "/internal/units/available", params=params)

    def quote(self, unit_type_id: str, months: int) -> dict | None:
        return self._request("POST", "/internal/pricing/quote",
                             json={"unitTypeId": unit_type_id, "months": months})

    def my_contracts(self, user_id: str) -> list[dict] | None:
        return self._request("GET", "/internal/contracts/me", user_id=user_id)

    def contract_features(self, user_id: str) -> list[dict] | None:
        return self._request("GET", "/internal/contracts/me/features", user_id=user_id)


def get_nest() -> NestClient:
    return NestClient()
