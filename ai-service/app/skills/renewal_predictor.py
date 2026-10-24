"""Kỹ năng 3: Gợi ý gói thuê và dự đoán khả năng gia hạn (Model A & Model B).
- Chạy tương tác khi khách hỏi về gia hạn.
- Chạy theo lô (Batch API) cho Cron Job Flow 6 chấm điểm và gắn cờ chăm sóc khách hàng.
"""
from __future__ import annotations

import logging
from typing import Any
import joblib
import numpy as np
import pandas as pd
from pydantic import BaseModel

from ..config import MODELS_DIR
from ..llm import get_llm
from ..ml.generate_dataset import FEATURE_COLUMNS

logger = logging.getLogger(__name__)

_MODEL_A = None
_MODEL_B = None


def _load_models():
    global _MODEL_A, _MODEL_B
    if _MODEL_A is None or _MODEL_B is None:
        path_a = MODELS_DIR / "model_a_renewal_xgb.joblib"
        path_b = MODELS_DIR / "model_b_package_rf.joblib"
        if not path_a.exists():
            # Thử tìm trong app/models nếu chưa sync
            alt_a = MODELS_DIR.parent / "app" / "models" / "model_a_renewal_xgb.joblib"
            alt_b = MODELS_DIR.parent / "app" / "models" / "model_b_package_rf.joblib"
            if alt_a.exists():
                path_a, path_b = alt_a, alt_b

        if path_a.exists() and path_b.exists():
            _MODEL_A = joblib.load(path_a)
            _MODEL_B = joblib.load(path_b)
            logger.info("Đã nạp Model A (XGBoost) và Model B (RandomForest)")
        else:
            logger.warning("Chưa tìm thấy file model đã train tại %s", path_a)


class PredictionResult(BaseModel):
    contract_id: str
    renewal_probability: float
    probability_tier: str       # "CAO", "TRUNG_BINH", "THAP"
    recommended_package: int    # 1, 3, 6, 12 tháng
    action: str                 # "REMIND_NORMAL", "REMIND_EARLY_DISCOUNT", "FLAG_STAFF_CONTACT"
    personalized_message: str
    features_used: dict[str, Any]
    model_version: str = "v1.0"


def determine_tier_and_action(prob: float, recommended_pkg: int) -> tuple[str, str]:
    """Quy tắc nghiệp vụ phân tầng xác suất gia hạn theo kế hoạch thiết kế."""
    if prob >= 0.70:
        return "CAO", "REMIND_NORMAL"
    elif prob >= 0.40:
        return "TRUNG_BINH", "REMIND_EARLY_DISCOUNT"
    else:
        return "THAP", "FLAG_STAFF_CONTACT"


def generate_personalized_reminder(
    prob_tier: str,
    action: str,
    recommended_pkg: int,
    contract_info: dict[str, Any] | None = None,
) -> str:
    """LLM viết lời nhắn phù hợp theo hành động, không tự đổi số liệu hay gói đề xuất."""
    c_code = contract_info.get("contractCode", "hợp đồng") if contract_info else "hợp đồng"
    end_date = contract_info.get("endDate", "ngày hết hạn") if contract_info else "ngày hết hạn"

    if action == "REMIND_NORMAL":
        fallback = (
            f"Chào bạn, hợp đồng thuê kho **#{c_code}** của bạn sẽ kết thúc vào ngày **{end_date}**.\n\n"
            f"💡 Hệ thống đề xuất bạn tiếp tục gia hạn **Gói {recommended_pkg} tháng** để giữ phòng kho đang dùng "
            f"với mức giá ổn định và dịch vụ thuận tiện nhất nhé!"
        )
    elif action == "REMIND_EARLY_DISCOUNT":
        discount_text = "5%" if recommended_pkg == 3 else ("10%" if recommended_pkg == 6 else "15%")
        fallback = (
            f"Chào bạn, hợp đồng **#{c_code}** của bạn sắp đến hạn vào ngày **{end_date}**.\n\n"
            f"🎁 **Ưu đãi gia hạn sớm:** Khi bạn gia hạn **Gói {recommended_pkg} tháng** ngay hôm nay, "
            f"hệ thống áp dụng chiết khấu tiết kiệm ngay **{discount_text}** trên tổng cước thuê.\n"
            f"Bạn có thể bấm gia hạn trực tiếp trên hệ thống nhé!"
        )
    else:  # FLAG_STAFF_CONTACT
        fallback = (
            f"Chào bạn, hợp đồng kho **#{c_code}** của bạn sắp hết hạn vào ngày **{end_date}**.\n\n"
            f"Chúng tôi có nhiều lựa chọn **Gói linh hoạt (từ {recommended_pkg} tháng)** hoặc hỗ trợ chuyển đổi sang "
            f"ngăn kho kích thước tối ưu hơn để tiết kiệm chi phí. Nhân viên chăm sóc khách hàng sẽ chủ động liên hệ để hỗ trợ bạn tốt nhất!"
        )

    llm = get_llm()
    if not llm.available:
        return fallback

    system_prompt = (
        "Bạn là chuyên viên chăm sóc khách hàng của dịch vụ cho thuê kho Self-Storage. "
        "Nhiệm vụ: Viết một thông báo nhắc gia hạn ngắn gọn (dưới 4 câu), chân thành, tôn trọng khách hàng.\n"
        "QUY TẮC BẮT BUỘC:\n"
        f"1. Hành động quy định: {action} (Mức gắn bó: {prob_tier}).\n"
        f"2. Gói kỳ hạn được đề xuất: Gói {recommended_pkg} tháng. Tuyệt đối KHÔNG tự đổi sang số tháng khác.\n"
        "3. ĐỊNH DẠNG: BẮT BUỘC in đậm (bằng markdown **...**) mã hợp đồng, ngày hết hạn, tên gói và phần trăm giảm giá để nổi bật thông tin.\n"
        "4. Lời văn tự nhiên, thân thiện bằng tiếng Việt."
    )
    user_prompt = f"Thông tin: Hợp đồng #{c_code}, ngày hết hạn: {end_date}, gói đề xuất: {recommended_pkg} tháng."

    generated = llm.generate(system_prompt, user_prompt, temperature=0.3)
    return generated.strip() if generated else fallback


def predict_single_contract(contract_features: dict[str, Any]) -> PredictionResult:
    _load_models()
    row = {}
    for col in FEATURE_COLUMNS:
        row[col] = float(contract_features.get(col, 0.0))

    df_row = pd.DataFrame([row])

    if _MODEL_A is not None:
        prob = float(_MODEL_A.predict_proba(df_row)[0, 1])
    else:
        prob = 0.65  # fallback nếu model chưa sẵn sàng

    if _MODEL_B is not None:
        rec_pkg = int(_MODEL_B.predict(df_row)[0])
    else:
        rec_pkg = 3

    tier, action = determine_tier_and_action(prob, rec_pkg)
    msg = generate_personalized_reminder(tier, action, rec_pkg, contract_features)

    return PredictionResult(
        contract_id=str(contract_features.get("contractId", "")),
        renewal_probability=round(prob, 4),
        probability_tier=tier,
        recommended_package=rec_pkg,
        action=action,
        personalized_message=msg,
        features_used=row,
    )


def predict_batch_contracts(contracts: list[dict[str, Any]]) -> list[PredictionResult]:
    """Chạy dự đoán theo lô phục vụ Cron Job hàng ngày của Flow 6."""
    return [predict_single_contract(c) for c in contracts]
