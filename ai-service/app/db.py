"""Kết nối MongoDB (dùng chung database với NestJS). Lỗi kết nối không làm sập service."""
from __future__ import annotations

import logging
from functools import lru_cache

from .config import get_settings

logger = logging.getLogger(__name__)

# Tên collection khớp với @@map trong prisma/schema.prisma
COL_ITEM_CATALOG = "item_catalog"
COL_KNOWLEDGE_CHUNKS = "knowledge_chunks"


@lru_cache
def get_db():
    """Trả về pymongo Database hoặc None nếu không cấu hình/không kết nối được."""
    s = get_settings()
    url = s.database_url.strip().strip('"')
    if not url.startswith("mongodb"):
        logger.warning("DATABASE_URL không phải MongoDB, AI Service chạy với dữ liệu file cục bộ.")
        return None
    try:
        from pymongo import MongoClient

        client = MongoClient(url, serverSelectionTimeoutMS=5000, appname="selfstorage-ai")
        client.admin.command("ping")
        db = client[s.mongo_db_name] if s.mongo_db_name else client.get_default_database()
        logger.info("Đã kết nối MongoDB database '%s'", db.name)
        return db
    except Exception as e:  # noqa: BLE001
        logger.error("Không kết nối được MongoDB: %s", e)
        return None
