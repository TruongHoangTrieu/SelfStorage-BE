"""Danh mục đồ vật (ItemCatalog) và so khớp tên đồ vật."""
from __future__ import annotations

import csv
import difflib
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache

from ..config import DATA_DIR
from ..db import COL_ITEM_CATALOG, get_db
from ..nlp.text import normalize

logger = logging.getLogger(__name__)


@dataclass
class CatalogItem:
    name: str
    category: str
    length_cm: float
    width_cm: float
    height_cm: float
    stackable: bool
    aliases: list[str] = field(default_factory=list)

    @property
    def volume_m3(self) -> float:
        return round(self.length_cm * self.width_cm * self.height_cm / 1_000_000, 4)

    def to_dict(self) -> dict:
        return {
            "name": self.name, "aliases": self.aliases, "category": self.category,
            "length_cm": self.length_cm, "width_cm": self.width_cm, "height_cm": self.height_cm,
            "volume_m3": self.volume_m3, "stackable": self.stackable,
        }


def load_catalog_csv() -> list[CatalogItem]:
    items: list[CatalogItem] = []
    with open(DATA_DIR / "item_catalog.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            items.append(CatalogItem(
                name=row["name"].strip(),
                aliases=[a.strip() for a in row["aliases"].split(";") if a.strip()],
                category=row["category"].strip(),
                length_cm=float(row["length_cm"]), width_cm=float(row["width_cm"]),
                height_cm=float(row["height_cm"]),
                stackable=row["stackable"].strip().lower() == "true",
            ))
    return items


class Catalog:
    def __init__(self, items: list[CatalogItem]):
        self.items = items
        # (alias đã chuẩn hóa, item) - sắp xếp alias dài trước để ưu tiên khớp cụm dài
        pairs: list[tuple[str, CatalogItem]] = []
        for it in items:
            for alias in [it.name, *it.aliases]:
                key = normalize(alias)
                if key:
                    pairs.append((key, it))
        pairs.sort(key=lambda p: len(p[0]), reverse=True)
        self.alias_pairs = pairs
        self._by_alias = {}
        for key, it in pairs:
            self._by_alias.setdefault(key, it)

    def find_mentions(self, normalized_text: str) -> list[tuple[int, int, CatalogItem]]:
        """Tìm các đồ vật xuất hiện trong câu (không chồng lấn, ưu tiên cụm dài)."""
        taken = [False] * len(normalized_text)
        found: list[tuple[int, int, CatalogItem]] = []
        for key, it in self.alias_pairs:
            for m in re.finditer(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", normalized_text):
                s, e = m.span()
                if any(taken[s:e]):
                    continue
                for i in range(s, e):
                    taken[i] = True
                found.append((s, e, it))
        found.sort(key=lambda x: x[0])
        return found

    def match_name(self, name: str, cutoff: float = 0.78) -> CatalogItem | None:
        """Khớp chuỗi: chính xác -> chứa alias -> gần đúng (difflib)."""
        key = normalize(name)
        if not key:
            return None
        if key in self._by_alias:
            return self._by_alias[key]
        mentions = self.find_mentions(key)
        if len(mentions) == 1:
            return mentions[0][2]
        close = difflib.get_close_matches(key, list(self._by_alias.keys()), n=1, cutoff=cutoff)
        return self._by_alias[close[0]] if close else None


@lru_cache
def get_catalog() -> Catalog:
    """Ưu tiên đọc collection item_catalog trong MongoDB; trống thì dùng file CSV."""
    db = get_db()
    if db is not None:
        try:
            docs = list(db[COL_ITEM_CATALOG].find({}))
            if docs:
                items = [CatalogItem(
                    name=d["name"], aliases=d.get("aliases", []), category=d.get("category", ""),
                    length_cm=d["length_cm"], width_cm=d["width_cm"], height_cm=d["height_cm"],
                    stackable=bool(d.get("stackable", False))) for d in docs]
                logger.info("Đọc %d món từ MongoDB item_catalog", len(items))
                return Catalog(items)
        except Exception as e:  # noqa: BLE001
            logger.error("Không đọc được item_catalog từ MongoDB: %s", e)
    items = load_catalog_csv()
    logger.info("Đọc %d món từ data/item_catalog.csv", len(items))
    return Catalog(items)
