"""Router phân loại ý định người dùng thành 1 trong 7 nhánh:
1. prohibited_items: Cảnh báo hàng cấm, chất cháy nổ, vũ khí, động vật sống (Tình huống Xấu 1 - An toàn PCCC).
2. emergency_support: Xử lý sự cố khẩn cấp, cháy nổ, ngập nước, kẹt khóa cửa, khiếu nại đền bù (Tình huống Xấu 2).
3. size_advice: Tư vấn chọn cỡ kho từ danh sách đồ đạc (Tình huống Tốt / Nhu cầu cơ bản).
4. search_policy: Hỏi đáp chính sách, cọc, hoàn tiền, phạt quá hạn, bảo hiểm, ưu đãi doanh nghiệp.
5. recommend_package: Hỏi nên gia hạn gói nào, gợi ý kỳ hạn hợp đồng (1, 3, 6, 12 tháng qua Model B).
6. get_live_data: Tra cứu hợp đồng hiện tại của khách, kiểm tra danh sách kho trống thực tế.
7. out_of_scope: Chào hỏi, câu hỏi mập mờ hoặc ngoài phạm vi kho lưu trữ.
"""
from __future__ import annotations

import logging
import re
from typing import Any
from pydantic import BaseModel

from .config import get_settings
from .llm import get_llm
from .nlp.text import find_prohibited_mentions, mask_pii, normalize

logger = logging.getLogger(__name__)

INTENTS = [
    "prohibited_items",
    "emergency_support",
    "size_advice",
    "search_policy",
    "recommend_package",
    "get_live_data",
    "out_of_scope",
]

_EMERGENCY_KEYWORDS = [
    "chay kho", "hoa hoan", "ngap nuoc", "uot het do", "dot nhap", "trom cap", "mat trom",
    "mat do", "bi mat cap", "mat tai san", "khoa khong mo duoc", "ket khoa", "ma pin loi",
    "khong the vao lay do", "khan cap", "can lay do ngay", "khong mo duoc cua",
    "toi muon kien", "tai sao tru tien", "lua dao", "gap quan ly", "gap giam doc",
    "den bu", "boi thuong", "kieu nai", "hotline", "su co", "hu hong kho", "goi cuu ho",
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
    "thue bao nhieu", "gia", "bao hiem", "boi thuong", "doanh nghiep", "cong ty", "hoa don vat",
    "thue si", "thue nhieu kho", "xe nang", "pallet",
]

_RENEWAL_KEYWORDS = [
    "gia han", "nen gia han", "goi nao", "goi thue nao", "bao nhieu thang", "tiep tuc thue",
    "uu dai gia han", "sap het han", "goi 1 thang", "goi 3 thang", "goi 6 thang", "goi 12 thang",
]

_LIVE_DATA_KEYWORDS = [
    "hop dong cua toi", "ma hop dong", "khi nao het han", "toi dang thue kho nao",
    "kho con trong khong", "bao gia", "gia kho", "gia thue hien tai",
    "dat kho", "muon dat kho", "dat giu cho", "huong dan dat kho",
    "cach dat kho", "tim kho", "thue ngan kho", "dat phong", "thue kho giup",
]


class RouteDecision(BaseModel):
    intent: str
    confidence: float
    reason: str


_ROUTER_SYSTEM = (
    "Bạn là bộ phân loại ý định (Intent Router) cho hệ thống Kho Tự Quản (SelfStorage). "
    "Nhiệm vụ: Đọc tin nhắn mới nhất và phân loại chính xác vào 1 trong 7 intent:\n"
    "1. 'prohibited_items': Khách muốn lưu trữ hoặc hỏi gửi hàng cấm, chất cháy nổ (xăng, dầu, gas, pháo), vũ khí, động vật sống, thực phẩm tươi sống.\n"
    "2. 'emergency_support': Sự cố khẩn cấp (cháy, ngập nước, mất cắp, kẹt khóa cửa khẩn cấp, bức xúc muốn khiếu nại, đòi đền bù).\n"
    "3. 'size_advice': Khách nêu danh sách đồ đạc cần gửi hoặc hỏi tư vấn kích thước/thể tích kho phù hợp.\n"
    "4. 'search_policy': Khách hỏi về chính sách, quy định, hủy cọc, hoàn tiền, phí phạt quá hạn, bảo hiểm, thanh toán VietQR.\n"
    "5. 'recommend_package': Khách hàng đang có hợp đồng muốn hỏi nên chọn gói gia hạn nào (1, 3, 6, 12 tháng) hoặc ưu đãi gia hạn.\n"
    "6. 'get_live_data': Khách muốn đặt kho, tìm kiếm kho trống thực tế, hỏi các loại phòng kho hiện có, tra cứu hợp đồng của chính mình.\n"
    "7. 'out_of_scope': Chào hỏi xã giao, đùa vui, hỏi xoáy, hoặc các câu hỏi giao tiếp thông thường khác ngoài các nghiệp vụ trên.\n\n"
    "Trả về DUY NHẤT một chuỗi JSON: {\"intent\": \"...\", \"confidence\": 0.0 - 1.0, \"reason\": \"...\"}"
)


def route_with_rules(message: str) -> RouteDecision:
    text = normalize(message)

    # 1. ƯU TIÊN CAO NHẤT: Kiểm tra hàng cấm (Tình huống Xấu 1)
    prohibited = find_prohibited_mentions(message)
    if prohibited:
        return RouteDecision(
            intent="prohibited_items",
            confidence=0.98,
            reason=f"Phát hiện hàng cấm PCCC: {', '.join(prohibited)}",
        )

    # 2. ƯU TIÊN THỨ HAI: Sự cố khẩn cấp & khiếu nại (Tình huống Xấu 2)
    emergency_hits = sum(1 for kw in _EMERGENCY_KEYWORDS if kw in text)
    if emergency_hits > 0:
        return RouteDecision(
            intent="emergency_support",
            confidence=min(0.75 + 0.1 * emergency_hits, 0.98),
            reason=f"Phát hiện sự cố khẩn cấp hoặc khiếu nại nghiêm trọng (hits={emergency_hits})",
        )

    # 3. Phân loại các nhóm nghiệp vụ thông thường
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
    # 1. Luôn chạy bộ lọc hàng cấm & khẩn cấp bằng rule-based trước để đảm bảo an toàn tuyệt đối
    quick_rule = route_with_rules(message)
    if quick_rule.intent in ["prohibited_items", "emergency_support"]:
        return quick_rule

    llm = get_llm()
    if not llm.available:
        return quick_rule

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

    return quick_rule
