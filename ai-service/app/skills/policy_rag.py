"""Kỹ năng 2: Chatbot chính sách và hỗ trợ dựa trên RAG (Retrieval-Augmented Generation).
- Đọc tài liệu chính sách, chia đoạn (chunk), embedding và lưu vào RAM / MongoDB.
- Tìm kiếm cosine similarity, lọc theo ngưỡng tối thiểu rag_min_score.
- Trả lời kèm trích dẫn nguồn, từ chối khi câu hỏi ngoài tài liệu để chống bịa đặt (hallucination).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np
from pydantic import BaseModel

from ..config import DATA_DIR, get_settings
from ..db import COL_KNOWLEDGE_CHUNKS, get_db
from ..llm import get_llm
from ..nlp.text import mask_pii, normalize
from .embeddings import batch_cosine_similarity

logger = logging.getLogger(__name__)


class KnowledgeChunk(BaseModel):
    id: str | None = None
    document_name: str
    section: str
    content: str
    embedding: list[float] = []
    updated_at: datetime | None = None


class RAGResult(BaseModel):
    reply: str
    sources: list[str]
    retrieved_chunks: list[dict[str, Any]]
    confidence: float
    out_of_scope: bool = False


# In-memory storage for fast lookup
_LOADED_CHUNKS: list[KnowledgeChunk] = []
_EMBEDDING_MATRIX: np.ndarray = np.array([])


def parse_policy_file(filepath: Path) -> list[KnowledgeChunk]:
    """Phân tách file văn bản chính sách theo cú pháp [DOCUMENT: ...] và [SECTION: ...]"""
    chunks: list[KnowledgeChunk] = []
    if not filepath.exists():
        return chunks

    text = filepath.read_text(encoding="utf-8")
    raw_blocks = re.split(r"(?m)^---\s*$", text)

    for block in raw_blocks:
        block = block.strip()
        if not block:
            continue
        doc_match = re.search(r"\[DOCUMENT:\s*([^\]]+)\]", block)
        sec_match = re.search(r"\[SECTION:\s*([^\]]+)\]", block)

        doc_name = doc_match.group(1).strip() if doc_match else "Chinh_Sach_Chung"
        section = sec_match.group(1).strip() if sec_match else "Dieu_Khoan"

        # Loại bỏ các tag header để lấy nội dung thực
        content = re.sub(r"\[DOCUMENT:[^\]]+\]", "", block)
        content = re.sub(r"\[SECTION:[^\]]+\]", "", content).strip()

        if len(content) > 20:
            chunks.append(KnowledgeChunk(
                document_name=doc_name,
                section=section,
                content=content,
                updated_at=datetime.now(timezone.utc),
            ))
    return chunks


def reload_knowledge_base() -> int:
    """Nạp tài liệu từ MongoDB (nếu có) hoặc file data/policies.txt vào RAM."""
    global _LOADED_CHUNKS, _EMBEDDING_MATRIX
    db = get_db()
    loaded: list[KnowledgeChunk] = []

    if db is not None:
        try:
            docs = list(db[COL_KNOWLEDGE_CHUNKS].find({}))
            for d in docs:
                loaded.append(KnowledgeChunk(
                    id=str(d.get("_id", "")),
                    document_name=d.get("document_name", "Tài liệu"),
                    section=d.get("section", "Chung"),
                    content=d.get("content", ""),
                    embedding=d.get("embedding", []),
                    updated_at=d.get("updated_at"),
                ))
            if loaded:
                logger.info("Đã nạp %d chunks từ MongoDB collection '%s'", len(loaded), COL_KNOWLEDGE_CHUNKS)
        except Exception as e:
            logger.warning("Không đọc được knowledge chunks từ MongoDB: %s", e)

    if not loaded:
        loaded = parse_policy_file(DATA_DIR / "policies.txt")
        logger.info("Đã đọc %d chunks từ data/policies.txt", len(loaded))

    # Xây dựng ma trận embedding
    llm = get_llm()
    need_embed = [c for c in loaded if not c.embedding]
    if need_embed and llm.available:
        try:
            logger.info("Đang tạo embedding cho %d chunks...", len(need_embed))
            vecs = llm.embed([f"{c.document_name} {c.section}: {c.content}" for c in need_embed])
            if vecs and len(vecs) == len(need_embed):
                for c, v in zip(need_embed, vecs):
                    c.embedding = v
        except Exception as e:
            logger.error("Lỗi khi embed chunks: %s", e)

    _LOADED_CHUNKS = loaded

    matrix_rows = [c.embedding for c in _LOADED_CHUNKS if len(c.embedding) > 0]
    if len(matrix_rows) == len(_LOADED_CHUNKS) and len(matrix_rows) > 0:
        _EMBEDDING_MATRIX = np.array(matrix_rows, dtype=np.float32)
    else:
        _EMBEDDING_MATRIX = np.array([])

    return len(_LOADED_CHUNKS)


def ingest_documents(custom_text: str | None = None) -> dict[str, Any]:
    """Ingest tài liệu vào MongoDB và refresh bộ nhớ cache (dành cho API /admin/ingest)."""
    global _LOADED_CHUNKS, _EMBEDDING_MATRIX
    if custom_text:
        tmp_file = DATA_DIR / "policies_custom.txt"
        tmp_file.write_text(custom_text, encoding="utf-8")
        chunks = parse_policy_file(tmp_file)
    else:
        chunks = parse_policy_file(DATA_DIR / "policies.txt")

    llm = get_llm()
    if llm.available and chunks:
        texts = [f"{c.document_name} {c.section}: {c.content}" for c in chunks]
        vecs = llm.embed(texts)
        if vecs and len(vecs) == len(chunks):
            for c, v in zip(chunks, vecs):
                c.embedding = v

    db = get_db()
    saved_count = 0
    if db is not None:
        try:
            db[COL_KNOWLEDGE_CHUNKS].delete_many({})
            docs = [c.model_dump(exclude={"id"}) for c in chunks]
            if docs:
                res = db[COL_KNOWLEDGE_CHUNKS].insert_many(docs)
                saved_count = len(res.inserted_ids)
                logger.info("Đã lưu %d chunks vào MongoDB", saved_count)
        except Exception as e:
            logger.error("Lỗi khi lưu chunks vào MongoDB: %s", e)

    reload_knowledge_base()
    return {"chunks_ingested": len(chunks), "saved_to_mongodb": saved_count}


def _keyword_search_score(query: str, chunk: KnowledgeChunk) -> float:
    """Fallback tính điểm từ khóa khi không có embedding vector."""
    q_words = set(normalize(query).split())
    if not q_words:
        return 0.0
    doc_words = set(normalize(f"{chunk.document_name} {chunk.section} {chunk.content}").split())
    overlap = q_words.intersection(doc_words)
    return len(overlap) / float(len(q_words))


def search_policy(query: str) -> RAGResult:
    global _LOADED_CHUNKS, _EMBEDDING_MATRIX
    if not _LOADED_CHUNKS:
        reload_knowledge_base()

    if not _LOADED_CHUNKS:
        return RAGResult(
            reply="Hiện tại hệ thống chưa có dữ liệu tài liệu chính sách. Bạn vui lòng tạo phiếu hỗ trợ (Ticket) để được nhân viên giải đáp nhé!",
            sources=[],
            retrieved_chunks=[],
            confidence=0.0,
            out_of_scope=True,
        )

    s = get_settings()
    llm = get_llm()
    top_k = s.rag_top_k
    min_score = s.rag_min_score

    scores: list[tuple[float, KnowledgeChunk]] = []

    # Sử dụng Vector Search nếu ma trận embedding sẵn sàng
    if _EMBEDDING_MATRIX.shape[0] == len(_LOADED_CHUNKS) and llm.available:
        q_vec = llm.embed([query])
        if q_vec and len(q_vec) > 0:
            q_arr = np.array(q_vec[0], dtype=np.float32)
            cos_scores = batch_cosine_similarity(q_arr, _EMBEDDING_MATRIX)
            for idx, score in enumerate(cos_scores):
                scores.append((float(score), _LOADED_CHUNKS[idx]))

    # Fallback keyword overlap nếu không có vector
    if not scores:
        for c in _LOADED_CHUNKS:
            kw_score = _keyword_search_score(query, c)
            scores.append((kw_score, c))

    scores.sort(key=lambda x: x[0], reverse=True)
    best_score = scores[0][0] if scores else 0.0

    # Lọc các đoạn đạt ngưỡng tối thiểu
    matched_chunks = [c for score, c in scores[:top_k] if score >= min_score]

    # Guardrail chống bịa chính sách: Nếu không có đoạn nào vượt ngưỡng -> Từ chối thẳng thắn
    if not matched_chunks or best_score < min_score:
        return RAGResult(
            reply=(
                "Xin lỗi, thông tin bạn vừa hỏi không có trong tài liệu quy định và chính sách "
                "hiện hành của hệ thống kho Self-Storage. "
                "Bạn vui lòng gửi yêu cầu hỗ trợ (Ticket Hỗ trợ ở mục Support) để nhân viên chăm sóc khách hàng "
                "kiểm tra và giải đáp chính xác nhất nhé!"
            ),
            sources=[],
            retrieved_chunks=[],
            confidence=round(best_score, 3),
            out_of_scope=True,
        )

    sources = list(dict.fromkeys(f"[{c.document_name} / {c.section}]" for c in matched_chunks))
    context_str = "\n\n".join(f"--- Nguồn {idx+1}: {c.document_name} ({c.section}) ---\n{c.content}" for idx, c in enumerate(matched_chunks))

    # Nếu không có LLM, trả về trực tiếp đoạn trích xuất kèm nguồn
    if not llm.available:
        reply_lines = [
            "📋 **Thông tin quy định & chính sách liên quan đến câu hỏi của bạn:**\n",
        ]
        for c in matched_chunks[:2]:
            reply_lines.append(f"📌 **{c.document_name}** *(Mục: {c.section})*:\n{c.content}\n")
        reply_lines.append(f"🔗 *Nguồn tham khảo: {', '.join(sources)}*")
        return RAGResult(
            reply="\n".join(reply_lines),
            sources=sources,
            retrieved_chunks=[c.model_dump(exclude={"embedding"}) for c in matched_chunks],
            confidence=round(best_score, 3),
            out_of_scope=False,
        )

    # Có LLM: Sinh câu trả lời mượt mà, nghiêm cấm bịa đặt ngoài context
    system_prompt = (
        "Bạn là trợ lý giải đáp chính sách dịch vụ Kho Lưu Trữ Tự Phục Vụ (Self-Storage). "
        "NHIỆM VỤ: Đọc kỹ các đoạn tài liệu chính sách được cung cấp trong [CONTEXT] dưới đây và trả lời "
        "câu hỏi của khách hàng một cách chính xác, lịch sự và rõ ràng.\n"
        "QUY TẮC BẢO MẬT & GUARDRAILS BẮT BUỘC:\n"
        "1. CHỈ sử dụng thông tin CÓ MẶT trong [CONTEXT]. Tuyệt đối KHÔNG suy đoán, bịa đặt hoặc đưa ra thông tin không có trong tài liệu.\n"
        "2. ĐỊNH DẠNG: BẮT BUỘC in đậm (bằng markdown **...**) tất cả các con số, giá tiền, tỷ lệ chiết khấu, thời hạn, phí phạt và các điều khoản quan trọng để người đọc dễ dàng nắm bắt.\n"
        "3. Cuối câu trả lời, LUÔN nêu rõ nguồn tài liệu trích dẫn theo định dạng: '(Nguồn tham khảo: [Tên_Tài_Liệu / Tên_Mục])'.\n"
        "4. Nếu nội dung trong tài liệu không đủ để trả lời trọn vẹn, hãy nói rõ phần nào tài liệu chưa đề cập và gợi ý khách liên hệ nhân viên qua Ticket hỗ trợ."
    )
    user_prompt = f"[CONTEXT]\n{context_str}\n\n[CÂU HỎI CỦA KHÁCH]: {mask_pii(query)}"

    generated = llm.generate(system_prompt, user_prompt, temperature=0.1)
    reply = generated.strip() if generated else matched_chunks[0].content

    return RAGResult(
        reply=reply,
        sources=sources,
        retrieved_chunks=[c.model_dump(exclude={"embedding"}) for c in matched_chunks],
        confidence=round(best_score, 3),
        out_of_scope=False,
    )
