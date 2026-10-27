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
        self._fallback_base = "https://selfstorage-be-1.onrender.com/api"
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

        urls_to_try = [self._base]
        if self._fallback_base and self._fallback_base != self._base:
            urls_to_try.append(self._fallback_base)

        last_error = None
        for base_url in urls_to_try:
            try:
                with httpx.Client(timeout=self._timeout) as c:
                    r = c.request(method, f"{base_url}{path}", headers=headers, params=params, json=json)
                    r.raise_for_status()
                    if base_url != self._base:
                        logger.info("Chuyển sang dùng NestJS URL dự phòng: %s", base_url)
                        self._base = base_url
                    return r.json()
            except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                last_error = e
                logger.warning("Không thể kết nối tới NestJS tại %s (%s). Đang thử URL dự phòng...", base_url, e)
                continue
            except Exception as e:  # noqa: BLE001
                logger.error("Gọi NestJS %s %s%s thất bại: %s", method, base_url, path, e)
                return None

        logger.error("Gọi NestJS %s %s thất bại trên mọi endpoint: %s", method, path, last_error)
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
