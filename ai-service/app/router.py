"""Router phân loại ý định người dùng thành 1 trong 5 nhánh:
1. size_advice: Tư vấn chọn cỡ kho từ danh sách đồ đạc.
2. search_policy: Hỏi đáp chính sách, hủy, hoàn tiền, phí phạt, đồ cấm, quy định.
3. recommend_package: Hỏi nên gia hạn gói nào, gợi ý kỳ hạn hợp đồng.
4. get_live_data: Tra cứu hợp đồng hiện tại của chính khách hàng, kiểm tra kho trống.
5. out_of_scope: Ngoài phạm vi hoặc câu hỏi không rõ ràng.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from pydantic import BaseModel

from .config import get_settings
from .llm import get_llm
from .nlp.text import mask_pii, normalize

logger = logging.getLogger(__name__)

INTENTS = [
    "size_advice",
    "search_policy",
    "recommend_package",
    "get_live_data",
    "out_of_scope",
]

_SIZE_KEYWORDS = [
    "thue kho co nao", "kho co nao", "chua duoc khong", "dung tich", "the tich",
    "co kho nao vua", "tu lanh", "thung carton", "xe may", "giuong", "sofa", "ban ghe",
    "do dac", "chua do", "do dac gom", "chua khoang", "m3", "cbm", "kho bao nhieu m2",
    "can thue kho", "can kho chua", "chua het khong", "kich thuoc kho",
]

_POLICY_KEYWORDS = [
    "chinh sach", "quy dinh", "huy", "hoan tien", "tien coc", "dat coc", "phi qua han",
    "qua han", "tre han", "khoa kho", "khoa ma pin", "ma pin", "smart lock", "do cam",
    "hang cam", "chay no", "thanh toan", "vnpay", "sepay", "momo", "vietqr", "mat chia",
    "hu hong", "gio mo cua", "ra vao kho", "camera", "bao ve", "giam gia", "chiet khau",
    "gia thue", "bang gia", "gia ca", "bao nhieu tien", "chi phi", "gia kho", "tien thue",
    "cuoc thue", "don gia", "gia bao nhieu", "bang bao gia", "bieu phi", "muc gia", "gia thue kho",
    "thue bao nhieu", "gia",
]

_RENEWAL_KEYWORDS = [
    "gia han", "nen gia han", "goi nao", "goi thue nao", "bao nhieu thang", "tiep tuc thue",
    "uu dai gia han", "sap het han", "goi 1 thang", "goi 3 thang", "goi 6 thang", "goi 12 thang",
]

_LIVE_DATA_KEYWORDS = [
    "hop dong cua toi", "ma hop dong", "khi nao het han", "toi dang thue kho nao",
    "kho con trong khong", "bao gia", "gia kho", "gia thue hien tai",
]


class RouteDecision(BaseModel):
    intent: str
    confidence: float
    reason: str


_ROUTER_SYSTEM = (
    "Bạn là bộ phân loại ý định (Intent Router) cho hệ thống Kho Tự Quản (SelfStorage). "
    "Nhiệm vụ: Đọc tin nhắn mới nhất và lịch sử hội thoại, phân loại chính xác vào 1 trong 5 intent:\n"
    "1. 'size_advice': Khách nêu hoặc hỏi về đồ đạc cần lưu trữ và muốn tư vấn cỡ kho/thể tích phù hợp.\n"
    "2. 'search_policy': Khách hỏi về chính sách, điều khoản, hủy cọc, hoàn tiền, phạt quá hạn, đồ cấm, hướng dẫn thanh toán, an toàn.\n"
    "3. 'recommend_package': Khách hàng đang có hợp đồng muốn hỏi nên chọn gói gia hạn nào (1, 3, 6, 12 tháng) hoặc ưu đãi gia hạn.\n"
    "4. 'get_live_data': Khách hỏi tình trạng kho trống thực tế, tra cứu hợp đồng của chính mình, thời hạn còn lại.\n"
    "5. 'out_of_scope': Chào hỏi xã giao, câu hỏi không liên quan (thời tiết, nấu ăn, toán học...) hoặc chưa rõ ý.\n\n"
    "Trả về DUY NHẤT một chuỗi JSON: {\"intent\": \"...\", \"confidence\": 0.0 - 1.0, \"reason\": \"...\"}"
)


def route_with_rules(message: str) -> RouteDecision:
    text = normalize(message)

    # Ưu tiên kiểm tra size advice nếu có từ khóa đồ vật cụ thể
    size_hits = sum(1 for kw in _SIZE_KEYWORDS if kw in text)
    policy_hits = sum(1 for kw in _POLICY_KEYWORDS if kw in text)
    renewal_hits = sum(1 for kw in _RENEWAL_KEYWORDS if kw in text)
    live_hits = sum(1 for kw in _LIVE_DATA_KEYWORDS if kw in text)

    scores = [
        (size_hits, "size_advice"),
        (policy_hits, "search_policy"),
        (renewal_hits, "recommend_package"),
        (live_hits, "get_live_data"),
    ]
    scores.sort(key=lambda x: x[0], reverse=True)
    best_hits, best_intent = scores[0]

    if best_hits > 0:
        return RouteDecision(
            intent=best_intent,
            confidence=min(0.6 + 0.15 * best_hits, 0.95),
            reason=f"Khớp từ khóa {best_intent} (hits={best_hits})",
        )

    # Kiểm tra chào hỏi xã giao
    if any(text.startswith(g) or text == g for g in ["chao", "xin chao", "hi", "hello", "alo", "ban la ai"]):
        return RouteDecision(
            intent="out_of_scope",
            confidence=0.9,
            reason="Lời chào xã giao mở đầu",
        )

    return RouteDecision(
        intent="out_of_scope",
        confidence=0.5,
        reason="Không tìm thấy từ khóa chuyên ngành trong câu hỏi",
    )


def route_message(message: str, history: list[dict[str, str]] | None = None) -> RouteDecision:
    llm = get_llm()
    if not llm.available:
        return route_with_rules(message)

    # Tạo prompt với ngữ cảnh các lượt gần nhất
    s = get_settings()
    hist_snippet = ""
    if history:
        recent = history[-s.history_turns:]
        hist_snippet = "Lịch sử hội thoại trước:\n" + "\n".join(
            f"- {turn.get('role', 'user')}: {turn.get('content', '')}" for turn in recent
        ) + "\n\n"

    user_prompt = f"{hist_snippet}Tin nhắn mới nhất của khách: \"{mask_pii(message)}\""

    data = llm.generate_json(_ROUTER_SYSTEM, user_prompt, retries=1)
    if data and isinstance(data, dict):
        raw_intent = str(data.get("intent", "")).strip().lower()
        if raw_intent in INTENTS:
            return RouteDecision(
                intent=raw_intent,
                confidence=float(data.get("confidence", 0.85)),
                reason=str(data.get("reason", "Phân loại bởi LLM Router")),
            )

    return route_with_rules(message)
