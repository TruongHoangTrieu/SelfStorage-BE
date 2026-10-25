"""Kỹ năng 1: Tư vấn kích thước kho (Size Advice).
Công thức: V_cần = sum(q_i * v_i) * (1 + k)
"""
from __future__ import annotations

import logging
from typing import Any
from pydantic import BaseModel

from ..config import get_settings
from ..llm import get_llm
from ..nest_client import get_nest
from ..nlp.text import find_prohibited_mentions
from .item_extractor import ResolvedItem, extract_items

logger = logging.getLogger(__name__)


class SuggestedUnit(BaseModel):
    unit_id: str | None = None
    unit_number: str | None = None
    unit_type_id: str
    unit_type_name: str
    facility_name: str
    size_m2: float
    volume_m3: float
    price_per_month: float
    deposit_amount: float


class SizeAdviceResult(BaseModel):
    items: list[dict[str, Any]]
    total_raw_volume_m3: float
    aisle_factor: float
    required_volume_m3: float
    suggested_units: list[SuggestedUnit]
    reply: str
    method: str


def calculate_required_volume(items: list[ResolvedItem], aisle_factor: float) -> tuple[float, float]:
    raw_vol = sum(it.total_volume_m3 for it in items)
    req_vol = round(raw_vol * (1.0 + aisle_factor), 3)
    return round(raw_vol, 3), req_vol


def _format_currency(val: float) -> str:
    return f"{int(val):,} VNĐ".replace(",", ".")


def generate_explanation(
    items: list[ResolvedItem],
    required_volume_m3: float,
    suggested_units: list[SuggestedUnit],
    aisle_factor: float,
) -> str:
    llm = get_llm()
    items_desc = ", ".join(f"**{it.quantity} {it.item}**" for it in items)

    if not suggested_units:
        fallback = (
            f"Dựa trên các đồ dùng bạn đã liệt kê ({items_desc}), ước tính tổng thể tích cần lưu trữ "
            f"là khoảng **{required_volume_m3:.2f} m³** (đã bao gồm hệ số lối đi xếp đồ **{int(aisle_factor*100)}%**).\n\n"
            f"Hiện tại hệ thống chưa tìm thấy kho trống phù hợp trên các cơ sở. "
            f"Bạn vui lòng liên hệ nhân viên quản lý hoặc gửi yêu cầu hỗ trợ để được tư vấn kho ghép hoặc đặt trước nhé!"
        )
    else:
        units_text = "\n".join(
            f"• **{u.unit_type_name}** ({u.facility_name}):\n"
            f"  - Diện tích & Dung tích: **{u.size_m2} m²** (~**{u.volume_m3:.1f} m³**)\n"
            f"  - Giá thuê: **{_format_currency(u.price_per_month)}/tháng** (Tiền cọc: **{_format_currency(u.deposit_amount)}**)"
            for u in suggested_units
        )
        fallback = (
            f"Dựa trên danh sách đồ đạc của bạn ({items_desc}), tổng thể tích ước tính cần khoảng "
            f"**{required_volume_m3:.2f} m³** (đã bao gồm **{int(aisle_factor*100)}%** diện tích lối đi lại thuận tiện).\n\n"
            f"📍 **Các lựa chọn kho phù hợp và đang còn trống:**\n\n{units_text}\n\n"
            f"💡 *Bạn có thể chọn đặt chỗ hoặc liên hệ trực tiếp để giữ phòng kho ngay hôm nay!*"
        )

    if not llm.available:
        return fallback

    system_prompt = (
        "Bạn là trợ lý tư vấn kho lưu trữ Self-Storage chuyên nghiệp. "
        "Nhiệm vụ: Dựa vào số liệu chính xác đã được tính toán ở dưới, hãy viết câu phản hồi tự nhiên, "
        "thân thiện, hữu ích cho khách hàng.\n"
        "QUY TẮC BẮT BUỘC:\n"
        "1. KHÔNG ĐƯỢC tự ý bịa hoặc thay đổi bất kỳ số liệu nào (thể tích, kích thước, tên đồ vật, giá tiền).\n"
        "2. ĐỊNH DẠNG: BẮT BUỘC in đậm (bằng markdown **...**) tất cả tên loại kho, diện tích, thể tích, giá thuê, tiền cọc và danh sách đồ đạc để khách hàng dễ đọc.\n"
        "3. Nếu có món đồ được đánh dấu 'ước tính', nhắc nhẹ khách có thể điều chỉnh lại kích thước thực tế."
    )
    user_prompt = (
        f"Danh sách đồ: {items_desc}\n"
        f"Tổng thể tích yêu cầu: {required_volume_m3:.2f} m³\n"
        f"Gợi ý kho phù hợp:\n" +
        "\n".join(f"- {u.unit_type_name} tại {u.facility_name}, DT: {u.size_m2}m2, Dung tích: {u.volume_m3}m3, Giá: {_format_currency(u.price_per_month)}/tháng, Cọc: {_format_currency(u.deposit_amount)}" for u in suggested_units)
    )

    generated = llm.generate(system_prompt, user_prompt, temperature=0.3)
    return generated.strip() if generated else fallback


def handle_size_advice(message: str, facility_id: str | None = None) -> SizeAdviceResult:
    s = get_settings()

    # 1. Guardrail kiểm tra hàng cấm lưu trữ
    prohibited = find_prohibited_mentions(message)
    if prohibited:
        prohibited_str = ", ".join(f"**{p}**" for p in prohibited)
        reply = (
            f"⚠️ **CẢNH BÁO AN TOÀN - HÀNG CẤM LƯU TRỮ:**\n\n"
            f"Trong mô tả của bạn có chứa mặt hàng: {prohibited_str}.\n\n"
            f"Theo **Quy định PCCC & Điều khoản dịch vụ Kho Tự Quản**, các mặt hàng dễ cháy nổ, nhiên liệu, vũ khí, động vật sống và thực phẩm tươi sống **TUYỆT ĐỐI BỊ CẤM** lưu trữ tại hệ thống nhằm bảo vệ an toàn cho toàn bộ kho bãi.\n\n"
            f"🚫 Hệ thống **từ chối tư vấn** lưu trữ cho các mặt hàng trên. Nếu bạn có các vật dụng dân dụng an toàn khác (bàn ghế, tủ lạnh, quần áo, thùng tài liệu...), vui lòng mô tả lại để tôi hỗ trợ nhé!"
        )
        return SizeAdviceResult(
            items=[],
            total_raw_volume_m3=0.0,
            aisle_factor=s.aisle_factor,
            required_volume_m3=0.0,
            suggested_units=[],
            reply=reply,
            method="prohibited_guardrail",
        )

    resolved_items, method = extract_items(message)

    if not resolved_items:
        return SizeAdviceResult(
            items=[],
            total_raw_volume_m3=0.0,
            aisle_factor=s.aisle_factor,
            required_volume_m3=0.0,
            suggested_units=[],
            reply="Tôi chưa nhận diện được đồ đạc cụ thể trong mô tả của bạn. Bạn vui lòng liệt kê danh sách đồ (ví dụ: '1 tủ lạnh, 20 thùng carton, 1 xe máy') để tôi tính toán kích thước kho chính xác nhất nhé!",
            method=method,
        )

    raw_vol, req_vol = calculate_required_volume(resolved_items, s.aisle_factor)

    # Lấy kho trống từ NestJS internal API
    nest = get_nest()
    units_data = nest.available_units(min_volume_m3=req_vol, facility_id=facility_id)

    suggested: list[SuggestedUnit] = []
    if units_data and isinstance(units_data, list):
        for u in units_data[:3]:
            try:
                suggested.append(SuggestedUnit(
                    unit_id=u.get("unitId"),
                    unit_number=u.get("unitNumber"),
                    unit_type_id=u.get("unitTypeId", ""),
                    unit_type_name=u.get("unitTypeName", "Kho tiêu chuẩn"),
                    facility_name=u.get("facilityName", "Cơ sở kho"),
                    size_m2=float(u.get("sizeM2", 0.0)),
                    volume_m3=float(u.get("volumeM3", 0.0)),
                    price_per_month=float(u.get("pricePerMonth", 0.0)),
                    deposit_amount=float(u.get("depositAmount", 0.0)),
                ))
            except Exception as e:
                logger.warning("Error parsing unit suggestion: %s", e)

    reply = generate_explanation(resolved_items, req_vol, suggested, s.aisle_factor)

    return SizeAdviceResult(
        items=[it.model_dump() for it in resolved_items],
        total_raw_volume_m3=raw_vol,
        aisle_factor=s.aisle_factor,
        required_volume_m3=req_vol,
        suggested_units=suggested,
        reply=reply,
        method=method,
    )
