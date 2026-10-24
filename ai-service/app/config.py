"""Cấu hình AI Service, đọc từ biến môi trường / file .env.

Thứ tự ưu tiên: biến môi trường > ai-service/.env > ../.env (file .env của NestJS).
Nhờ vậy AI Service dùng chung DATABASE_URL với NestJS mà không cần khai báo lại.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = SERVICE_DIR / "data"
MODELS_DIR = SERVICE_DIR / "models"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(SERVICE_DIR.parent / ".env"), str(SERVICE_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ai_port: int = 8000
    ai_internal_key: str = "change_me_internal_key"

    database_url: str = ""
    mongo_db_name: str = ""  # để trống = lấy từ DATABASE_URL

    nest_base_url: str = "http://localhost:5000/api"
    nest_timeout_s: float = 8.0

    llm_provider: str = "gemini"  # gemini | local
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    llm_timeout_s: float = 20.0

    aisle_factor: float = 0.18
    default_unit_height_m: float = 2.0
    rag_min_score: float = 0.35
    rag_top_k: int = 4

    max_message_chars: int = 1000
    history_turns: int = 6


@lru_cache
def get_settings() -> Settings:
    return Settings()
