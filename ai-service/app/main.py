"""FastAPI AI Service cho hệ thống Kho Lưu trữ Tự phục vụ.
Cung cấp các endpoints:
- POST /chat: Tiếp nhận tin nhắn người dùng từ NestJS
- POST /predict/renewal: Chấm điểm gia hạn và gợi ý gói theo lô cho Cron Job Flow 6
- POST /admin/ingest: Nạp lại tài liệu chính sách vào pgvector/MongoDB
- GET /health: Kiểm tra tình trạng dịch vụ, phiên bản model
"""
from __future__ import annotations

import logging
import sys
import time
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, Header, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .db import get_db
from .llm import get_llm
from .nest_client import get_nest
from .router import route_message
from .skills.catalog import get_catalog
from .skills.policy_rag import ingest_documents, reload_knowledge_base, search_policy
from .skills.renewal_predictor import (
    PredictionResult,
    _load_models,
    predict_batch_contracts,
    predict_single_contract,
)
from .skills.size_advisor import handle_size_advice

# Đảm bảo UTF-8 logging trên Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service đang khởi động...")
    # Nạp catalog, tài liệu chính sách và ML models
    get_catalog()
    reload_knowledge_base()
    _load_models()
    logger.info("Khởi động AI Service hoàn tất!")
    yield
    logger.info("AI Service đang tắt...")


app = FastAPI(
    title="SelfStorage AI Assistant Service",
    description="Dịch vụ AI thông minh: Tư vấn kích thước kho, Chatbot chính sách (RAG) và Dự đoán gia hạn ML",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# XÁC THỰC BẢO MẬT NỘI BỘ (Security Guardrail)
# =============================================================================
def verify_internal_key(x_internal_key: str = Header(None, alias="x-internal-key")):
    s = get_settings()
    if not x_internal_key or x_internal_key != s.ai_internal_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Truy cập bị từ chối: Khóa nội bộ x-internal-key không hợp lệ",
        )
    return True


# =============================================================================
# SCHEMAS
# =============================================================================
class ChatRequest(BaseModel):
    conversation_id: str = Field(default="conv_default")
    user_id: str = Field(default="guest")
    message: str = Field(min_length=1, max_length=1000)
    history: list[dict[str, str]] = Field(default_factory=list)
    facility_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    intent: str
    reply: str
    data: dict[str, Any] = Field(default_factory=dict)
    sources: list[str] = Field(default_factory=list)
    model_version: str = "v1.0"


class BatchPredictRequest(BaseModel):
    contracts: list[dict[str, Any]]


# =============================================================================
# ENDPOINTS
# =============================================================================
@app.get("/health")
def health_check():
    s = get_settings()
    llm = get_llm()
    db = get_db()
    catalog = get_catalog()

    return {
        "status": "ok",
        "service": "SelfStorage-AI-Service",
        "llm_provider": llm.name,
        "llm_available": llm.available,
        "database_connected": db is not None,
        "catalog_items_count": len(catalog.items),
        "models_version": "v1.0",
    }


@app.post("/admin/ingest")
def ingest_policies(payload: dict[str, str] | None = None, _: bool = Security(verify_internal_key)):
    custom_text = payload.get("text") if payload else None
    result = ingest_documents(custom_text)
    return {"message": "Đã nạp tài liệu chính sách thành công", **result}


@app.post("/predict/renewal", response_model=list[PredictionResult])
def batch_renewal_prediction(
    body: BatchPredictRequest,
    _: bool = Security(verify_internal_key),
):
    """Cron Job Flow 6 gọi endpoint này để chấm điểm hợp đồng sắp hết hạn."""
    results = predict_batch_contracts(body.contracts)
    return results


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(
    req: ChatRequest,
    _: bool = Security(verify_internal_key),
):
    start_time = time.perf_counter()
    decision = route_message(req.message, req.history)
    intent = decision.intent

    logger.info("User '%s' -> Message: '%s' | Intent: '%s' (conf=%.2f)", req.user_id, req.message, intent, decision.confidence)

    reply = ""
    data: dict[str, Any] = {}
    sources: list[str] = []

    # ================= 0. Nhánh: prohibited_items (Tình huống Xấu 1 - PCCC) =================
    if intent == "prohibited_items":
        from .nlp.text import find_prohibited_mentions
        prohibited = find_prohibited_mentions(req.message)
        prohibited_str = ", ".join(f"**{p}**" for p in prohibited) if prohibited else "**Hàng cấm / Chất nguy hiểm**"
        reply = (
            f"🚫 **CẢNH BÁO AN TOÀN - TỪ CHỐI LƯU TRỮ:**\n\n"
            f"Hệ thống phát hiện yêu cầu của bạn có liên quan đến: {prohibited_str}.\n\n"
            f"Theo **Nghị định PCCC & Điều khoản Dịch vụ Kho Tự Quản**:\n"
            f"• **TUYỆT ĐỐI CẤM** lưu trữ các chất dễ cháy nổ (xăng, dầu, gas, pháo hoa, hóa chất), vũ khí, động vật sống và thực phẩm tươi sống dễ ôi thiu.\n"
            f"• **Chế tài xử lý:** Vi phạm sẽ bị **chấm dứt hợp đồng ngay lập tức**, **khấu trừ 100% tiền đặt cọc**, đồng thời chuyển hồ sơ sang cơ quan chức năng có thẩm quyền xử lý theo pháp luật.\n\n"
            f"💡 *Vui lòng chỉ lưu trữ các đồ dùng gia đình, thiết bị điện tử, nội thất và hàng hóa khô ráo an toàn!*"
        )
        sources = ["Quy_Dinh_Do_Cam_Luu_Tru: Danh_Muc_Hang_Hoa_Cam"]
        data = {"prohibited_items": prohibited, "status": "REJECTED"}

    # ================= 0. Nhánh: emergency_support (Tình huống Xấu 2 - Khẩn cấp / Khiếu nại) =================
    elif intent == "emergency_support":
        reply = (
            "🚨 **TRUNG TÂM TIẾP NHẬN SỰ CỐ KHẨN CẤP 24/7**\n\n"
            "Chúng tôi rất tiếc vì sự cố bạn đang gặp phải! Để xử lý nhanh nhất và bảo vệ tài sản của bạn, vui lòng thực hiện ngay:\n\n"
            "1. 📞 **GỌI HOTLINE KHẨN CẤP:** **1900 6868** (Nhánh số **1** - Kỹ thuật trực 24/7 giải quyết trong **15 phút**).\n"
            "2. 📱 **TẠO TICKET HỖ TRỢ ƯU TIÊN:** Vào mục **'Hỗ trợ'** trên ứng dụng -> Tạo yêu cầu loại **LOCK** (sự cố khóa) hoặc **DAMAGE** (sự cố ẩm mốc/hư hại) -> Chọn mức ưu tiên **URGENT**.\n"
            "3. 🛡️ **CHÍNH SÁCH BẢO HIỂM & ĐỀN BÙ:** Mỗi ngăn kho được bảo hiểm tự động lên tới **50.000.000 VNĐ**. Quý khách vui lòng chụp ảnh/quay video hiện trường để được giám định bồi thường trong vòng **48 giờ**.\n\n"
            "👉 *Đội ngũ kỹ thuật và bảo vệ tại cơ sở đã được thông báo để hỗ trợ bạn ngay lập tức!*"
        )
        sources = [
            "Huong_Dan_Su_Co_Va_Ho_Tro_Ky_Thuat: Xu_Ly_Su_Co_Khoa_Va_The_Tu",
            "Bao_Hiem_Va_Boi_Thuong_Thiet_Hai: Xu_Ly_Su_Co_Khan_Cap_Va_Bao_Hiem",
        ]
        data = {"hotline": "1900 6868", "priority": "URGENT"}

    # ================= 1. Nhánh: size_advice =================
    elif intent == "size_advice":
        res = handle_size_advice(req.message, facility_id=req.facility_id)
        reply = res.reply
        data = {
            "items": res.items,
            "total_raw_volume_m3": res.total_raw_volume_m3,
            "required_volume_m3": res.required_volume_m3,
            "suggested_units": [u.model_dump() for u in res.suggested_units],
            "method": res.method,
        }

    # ================= 2. Nhánh: search_policy =================
    elif intent == "search_policy":
        rag_res = search_policy(req.message)
        reply = rag_res.reply
        sources = rag_res.sources
        data = {
            "confidence": rag_res.confidence,
            "out_of_scope": rag_res.out_of_scope,
        }

    # ================= 3. Nhánh: recommend_package =================
    elif intent == "recommend_package":
        nest = get_nest()
        features_list = nest.contract_features(req.user_id)
        if features_list and len(features_list) > 0:
            pred = predict_single_contract(features_list[0])
            reply = pred.personalized_message
            data = {
                "contract_id": pred.contract_id,
                "renewal_probability": pred.renewal_probability,
                "probability_tier": pred.probability_tier,
                "recommended_package": pred.recommended_package,
                "action": pred.action,
            }
        else:
            # Fallback gợi ý theo chính sách chiết khấu chuẩn
            reply = (
                "🎉 **Hệ thống hiện tại có các gói gia hạn ưu đãi hấp dẫn:**\n\n"
                "• **Gói 3 tháng**: Giảm ngay **5%** cước thuê\n"
                "• **Gói 6 tháng**: Giảm ngay **10%** cước thuê\n"
                "• **Gói 12 tháng**: Giảm tối đa **15%** cước thuê\n\n"
                "💡 *Nếu bạn đang có hợp đồng thuê, vui lòng vào mục Hợp đồng của tôi để chọn kỳ hạn gia hạn nhé!*"
            )
            data = {"standard_packages": [1, 3, 6, 12]}

    # ================= 4. Nhánh: get_live_data =================
    elif intent == "get_live_data":
        nest = get_nest()
        contracts = nest.my_contracts(req.user_id)
        if contracts and len(contracts) > 0:
            c = contracts[0]
            reply = (
                f"📄 **Thông tin hợp đồng hiện tại của bạn:**\n\n"
                f"• Mã hợp đồng: **#{c.get('contractCode')}**\n"
                f"• Vị trí ngăn kho: **{c.get('unitNumber', '')}** ({c.get('facilityName', '')})\n"
                f"• Trạng thái: **{c.get('status')}**\n"
                f"• Ngày hết hạn: **{c.get('endDate')}**\n\n"
                f"👉 *Bạn có thể yêu cầu gia hạn trực tiếp trên ứng dụng bất cứ lúc nào!*"
            )
            data = {"contract": c}
        else:
            units = nest.available_units()
            cnt = len(units) if units else 0
            reply = (
                f"🏢 Hệ thống hiện đang có **{cnt} loại kho còn phòng trống** trên các cơ sở.\n\n"
                f"Bạn đang tìm kho tại khu vực hay diện tích bao nhiêu để mình kiểm tra chi tiết nhé?"
            )
            data = {"available_units_count": cnt}

    # ================= 5. Nhánh: out_of_scope =================
    else:
        reply = (
            "👋 **Xin chào!** Tôi là **Trợ lý AI** của Hệ thống Kho Lưu Trữ Tự Phục Vụ (Self-Storage).\n\n"
            "Tôi có thể hỗ trợ bạn nhanh chóng:\n"
            "1. 📦 **Tư vấn kích thước kho phù hợp** (bạn chỉ cần liệt kê đồ đạc cần gửi như: *1 tủ lạnh, 20 thùng carton, 1 xe máy...*)\n"
            "2. 📄 **Giải đáp chính sách & Bảng giá** (giá thuê, đặt cọc, phí phạt quá hạn, đồ cấm, thanh toán VietQR)\n"
            "3. 🔄 **Gợi ý gói gia hạn hợp đồng** có chiết khấu cao nhất (tiết kiệm từ **5% đến 15%**)\n\n"
            "💬 *Bạn đang cần hỗ trợ thông tin nào?*"
        )

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Ghi log lượt chat vào MongoDB ai_logs (nếu có db)
    db = get_db()
    if db is not None:
        try:
            db["ai_logs"].insert_one({
                "conversation_id": req.conversation_id,
                "user_id": req.user_id,
                "message": req.message,
                "intent": intent,
                "sources": sources,
                "latency_ms": latency_ms,
                "timestamp": time.time(),
            })
        except Exception:
            pass

    return ChatResponse(
        conversation_id=req.conversation_id,
        intent=intent,
        reply=reply,
        data=data,
        sources=sources,
        model_version="v1.0",
    )
