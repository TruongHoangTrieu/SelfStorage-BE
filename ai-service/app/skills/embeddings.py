"""Quản lý Embedding và tính toán độ tương đồng Cosine bằng Numpy trong RAM.
Hỗ trợ cả Catalog Semantic Matching và Policy RAG.
"""
from __future__ import annotations

import logging
from typing import Any
import numpy as np

from ..config import get_settings
from ..llm import get_llm
from .catalog import CatalogItem, get_catalog

logger = logging.getLogger(__name__)

_CATALOG_EMBEDDINGS: list[tuple[CatalogItem, np.ndarray]] = []


def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (norm1 * norm2))


def batch_cosine_similarity(query_vec: np.ndarray, doc_matrix: np.ndarray) -> np.ndarray:
    """doc_matrix: (N, D), query_vec: (D,) -> returns (N,) scores"""
    if doc_matrix.shape[0] == 0:
        return np.array([])
    q_norm = np.linalg.norm(query_vec)
    if q_norm == 0:
        return np.zeros(doc_matrix.shape[0])
    doc_norms = np.linalg.norm(doc_matrix, axis=1)
    doc_norms[doc_norms == 0] = 1e-9
    scores = np.dot(doc_matrix, query_vec) / (doc_norms * q_norm)
    return scores


def init_catalog_embeddings() -> None:
    """Tạo embedding cho catalog nếu LLM có hỗ trợ embedding."""
    global _CATALOG_EMBEDDINGS
    llm = get_llm()
    if not llm.available or _CATALOG_EMBEDDINGS:
        return

    catalog = get_catalog()
    texts = [f"{it.name} - {', '.join(it.aliases)}" for it in catalog.items]
    vecs = llm.embed(texts)
    if vecs and len(vecs) == len(catalog.items):
        _CATALOG_EMBEDDINGS = [
            (it, np.array(v, dtype=np.float32)) for it, v in zip(catalog.items, vecs)
        ]
        logger.info("Đã tạo embedding cho %d món trong catalog", len(_CATALOG_EMBEDDINGS))


def catalog_semantic_match(name: str, threshold: float = 0.75) -> CatalogItem | None:
    """Khớp ngữ nghĩa với catalog bằng embedding."""
    global _CATALOG_EMBEDDINGS
    if not _CATALOG_EMBEDDINGS:
        init_catalog_embeddings()
    if not _CATALOG_EMBEDDINGS:
        return None

    llm = get_llm()
    query_vecs = llm.embed([name])
    if not query_vecs:
        return None

    q_arr = np.array(query_vecs[0], dtype=np.float32)
    best_item = None
    best_score = -1.0

    for item, v in _CATALOG_EMBEDDINGS:
        score = cosine_similarity(q_arr, v)
        if score > best_score:
            best_score = score
            best_item = item

    if best_score >= threshold:
        logger.info("Semantic match '%s' -> '%s' (score=%.3f)", name, best_item.name, best_score)
        return best_item
    return None
