"""Kiểm thử tự động cho toàn bộ 3 kỹ năng của AI Assistant."""
import pytest
from app.router import route_with_rules
from app.skills.catalog import get_catalog
from app.skills.item_extractor import extract_items
from app.skills.policy_rag import parse_policy_file, search_policy
from app.skills.renewal_predictor import (
    determine_tier_and_action,
    predict_single_contract,
)
from app.skills.size_advisor import calculate_required_volume, handle_size_advice


def test_catalog_loaded():
    catalog = get_catalog()
    assert len(catalog.items) >= 100
    item = catalog.match_name("tủ lạnh")
    assert item is not None
    assert item.volume_m3 > 0


def test_skill_1_extraction_and_volume():
    message = "Tôi có 1 tủ lạnh, 20 thùng carton và 1 xe máy"
    items, method = extract_items(message)
    assert len(items) >= 3

    # Tìm thùng carton
    carton = next((it for it in items if "thùng" in it.item.lower() or (it.catalog_name and "thùng" in it.catalog_name.lower())), None)
    assert carton is not None
    assert carton.quantity == 20

    raw_vol, req_vol = calculate_required_volume(items, aisle_factor=0.18)
    assert raw_vol > 0
    assert req_vol > raw_vol
    assert round(raw_vol * 1.18, 3) == req_vol


def test_skill_1_size_advisor():
    res = handle_size_advice("Tôi cần cất 2 cái đệm và 10 thùng carton")
    assert res.required_volume_m3 > 0
    assert len(res.items) >= 2
    assert "m³" in res.reply


def test_skill_2_rag_policy_match():
    res = search_policy("Phí phạt quá hạn hợp đồng tính như thế nào?")
    assert not res.out_of_scope
    assert len(res.sources) > 0
    assert "1.5" in res.reply or "quá hạn" in res.reply


def test_skill_2_rag_out_of_scope_rejection():
    # Câu hỏi hoàn toàn ngoài lề không có trong chính sách
    res = search_policy("Làm sao để làm bánh pizza xúc xích ngon?")
    assert res.out_of_scope
    assert "Ticket" in res.reply or "nhân viên" in res.reply


def test_skill_3_prediction_logic():
    sample_features = {
        "contractId": "test_contract_123",
        "rented_months": 12,
        "unit_size_m2": 6.0,
        "price_per_m2_ratio": 0.95,
        "late_payments_count": 0,
        "overdue_fees_count": 0,
        "access_count_last_30d": 8,
        "days_since_last_access": 3,
        "support_tickets_count": 0,
        "has_discount": 1,
        "month_of_year": 7,
        "facility_occupancy_rate": 0.85,
    }
    result = predict_single_contract(sample_features)
    assert result.contract_id == "test_contract_123"
    assert 0.0 <= result.renewal_probability <= 1.0
    assert result.recommended_package in [1, 3, 6, 12]
    assert result.probability_tier in ["CAO", "TRUNG_BINH", "THAP"]


def test_router_7_branches():
    r1 = route_with_rules("Tôi có 1 máy giặt và 10 thùng đồ cần thuê kho cỡ nào?")
    assert r1.intent == "size_advice"

    r2 = route_with_rules("Hủy kho có được hoàn tiền cọc không?")
    assert r2.intent == "search_policy"

    r3 = route_with_rules("Hợp đồng của tôi sắp hết hạn nên gia hạn gói mấy tháng?")
    assert r3.intent == "recommend_package"

    r4 = route_with_rules("Hợp đồng của tôi khi nào hết hạn?")
    assert r4.intent == "get_live_data"

    r5 = route_with_rules("Xin chào bạn là ai")
    assert r5.intent == "out_of_scope"

    # Tình huống Xấu 1: Hàng cấm PCCC
    r6 = route_with_rules("Tôi có 2 can xăng và 5 thùng pháo hoa muốn thuê kho cất")
    assert r6.intent == "prohibited_items"

    # Tình huống Xấu 2: Sự cố khẩn cấp / Hỏng khóa / Ngập nước
    r7 = route_with_rules("Kho của tôi bị ngập nước ướt hết đồ rồi, gọi hotline khẩn cấp cho ai?")
    assert r7.intent == "emergency_support"


def test_prohibited_items_guardrail_in_size_advice():
    # Khi khách hỏi tư vấn kích thước nhưng lồng ghép hàng cấm
    res = handle_size_advice("Tôi cần kho chứa 5 can xăng và 2 xe máy")
    assert res.method == "prohibited_guardrail"
    assert "CẢNH BÁO AN TOÀN" in res.reply
    assert len(res.suggested_units) == 0  # Tuyệt đối không gợi ý phòng kho cho hàng cấm


def test_bad_customer_high_churn_risk():
    # Tình huống Xấu: Khách hàng nợ cước nhiều lần, khiếu nại nhiều, bỏ quên kho
    bad_features = {
        "contractId": "bad_contract_001",
        "rented_months": 2,
        "unit_size_m2": 2.0,
        "price_per_m2_ratio": 1.30,
        "late_payments_count": 4,
        "overdue_fees_count": 3,
        "access_count_last_30d": 0,
        "days_since_last_access": 55,
        "support_tickets_count": 3,
        "has_discount": 0,
        "month_of_year": 3,
        "facility_occupancy_rate": 0.70,
    }
    result = predict_single_contract(bad_features)
    assert result.probability_tier == "THAP"
    assert result.action == "FLAG_STAFF_CONTACT"
    assert result.renewal_probability < 0.40


def test_good_customer_vip_high_retention():
    # Tình huống Tốt: Khách VIP thuê kho lớn lâu năm, không trễ hạn, ra vào thường xuyên
    vip_features = {
        "contractId": "vip_contract_999",
        "rented_months": 24,
        "unit_size_m2": 18.0,
        "price_per_m2_ratio": 0.90,
        "late_payments_count": 0,
        "overdue_fees_count": 0,
        "access_count_last_30d": 15,
        "days_since_last_access": 1,
        "support_tickets_count": 0,
        "has_discount": 1,
        "month_of_year": 12,
        "facility_occupancy_rate": 0.95,
    }
    result = predict_single_contract(vip_features)
    assert result.probability_tier == "CAO"
    assert result.renewal_probability >= 0.70
    assert result.recommended_package in [6, 12]  # Khách VIP luôn được đề xuất gói dài hạn tiết kiệm
