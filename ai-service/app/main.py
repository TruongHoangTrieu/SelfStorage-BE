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
from .nlp.text import detect_facility_from_text

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
        # Chỉ tra cứu hợp đồng cá nhân nếu đã đăng nhập và hỏi liên quan hợp đồng
        is_asking_contract = any(k in req.message.lower() for k in ["hop dong", "cua toi", "het han", "ma hd"])
        contracts = nest.my_contracts(req.user_id) if (req.user_id and req.user_id != "guest" and is_asking_contract) else []
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
            detected_fac_id, detected_fac_name = detect_facility_from_text(req.message)
            effective_facility_id = req.facility_id or detected_fac_id
            units = nest.available_units(facility_id=effective_facility_id)
            cnt = len(units) if units else 0

            suggested_list: list[dict[str, Any]] = []
            if units:
                for u in units[:3]:
                    suggested_list.append({
                        "unit_id": u.get("unitId") or u.get("id"),
                        "unit_number": u.get("unitNumber", ""),
                        "unit_type_id": u.get("unitTypeId", ""),
                        "unit_type_name": u.get("unitTypeName", "Kho tiêu chuẩn"),
                        "facility_name": u.get("facilityName", detected_fac_name or "Chi nhánh SelfStorage"),
                        "facility_id": u.get("facilityId", effective_facility_id or ""),
                        "size_m2": float(u.get("sizeM2", 0.0)),
                        "volume_m3": float(u.get("volumeM3", 0.0)),
                        "price_per_month": float(u.get("pricePerMonth", 0.0)),
                        "deposit_amount": float(u.get("depositAmount", 0.0)),
                    })

            data = {
                "available_units_count": cnt,
                "suggested_units": suggested_list,
                "facility_id": effective_facility_id,
                "facility_name": detected_fac_name,
            }

            llm = get_llm()
            if llm.available:
                sample_units_text = ""
                if units:
                    sample_units_text = "Một số ngăn kho trống phù hợp:\n" + "\n".join(
                        f"- Ngăn {u.get('unitNumber')} ({u.get('unitTypeName', 'Kho')}, DT: {u.get('sizeM2')} m², {u.get('volumeM3')} m³ tại {u.get('facilityName')})"
                        for u in units[:4]
                    )
                sys_prompt = (
                    "Bạn là Trợ lý AI của Hệ thống Kho Lưu Trữ Tự Phục Vụ SelfStorage.\n"
                    "Hệ thống hiện có 6 chi nhánh tại TP.HCM:\n"
                    "1. Chi nhánh Quận 7 (Q7, FAC_Q7): 69 Trần Trọng Cung, Phường Tân Thuận Đông, Quận 7\n"
                    "2. Chi nhánh Quận 1 (Q1, FAC_Q1): 79 Trần Khắc Chân, Phường Tân Định, Quận 1\n"
                    "3. Chi nhánh Landmark 81 - Bình Thạnh (FAC_BTH): Tòa Landmark 81, Phường 22, Bình Thạnh\n"
                    "4. Chi nhánh An Phú - TP. Thủ Đức (FAC_AP): 90 Song Hành, Phường An Phú, TP. Thủ Đức\n"
                    "5. Trụ Sở Chính Võ Nguyên Giáp (FAC_TD): 375 Võ Nguyên Giáp, Phường An Khánh, TP. Thủ Đức\n"
                    "6. Chi nhánh Centre Mall - Quận 6 (Q6, FAC_Q6): 1466 Võ Văn Kiệt, Phường Bình Tiên, Quận 6\n\n"
                    "Khách hàng đang muốn tìm kho, hỏi phòng trống hoặc yêu cầu đặt kho giúp.\n"
                    "Nhiệm vụ của bạn:\n"
                    "1. Trả lời nhiệt tình, nêu rõ tình trạng ngăn kho còn trống của cơ sở khách quan tâm (đặc biệt nếu khách nhắc đến Q7, Quận 1, Bình Thạnh...).\n"
                    "2. HƯỚNG DẪN ĐẶT KHO TỰ ĐỘNG: Thông báo cho khách biết hệ thống đã chuẩn bị sẵn các thẻ ngăn kho ngay bên dưới tin nhắn! Khách chỉ việc nhấn nút 'Đặt ngăn này ngay' -> Đăng nhập tài khoản -> Hệ thống tự động chuyển đến màn hình thanh toán cọc giữ chỗ bằng mã VietQR siêu tốc!\n"
                    "3. Nếu khách chưa biết cần diện tích bao nhiêu: Mời khách gửi nhanh danh sách đồ đạc để bạn tính toán thể tích m³ chuẩn xác nhất."
                )
                fac_hint = f" (Cơ sở nhận diện: {detected_fac_name})" if detected_fac_name else ""
                user_p = f"Dữ liệu kho thực tế: Có {cnt} ngăn kho còn phòng trống{fac_hint}.\n{sample_units_text}\n\nKhách nhắn: \"{req.message}\""
                llm_reply = llm.generate(sys_prompt, user_p, temperature=0.5)
                if llm_reply and len(llm_reply.strip()) > 10:
                    reply = llm_reply.strip()
                else:
                    target_name = f" tại **{detected_fac_name}**" if detected_fac_name else ""
                    reply = (
                        f"🏢 Hệ thống hiện đang có **{cnt} ngăn kho còn phòng trống**{target_name} sẵn sàng phục vụ bạn!\n\n"
                        f"👉 **Đặt kho giữ chỗ cực nhanh:**\n"
                        f"Tôi đã hiển thị các ngăn kho phù hợp nhất ngay bên dưới. Bạn chỉ cần nhấn nút **[Đặt ngăn này ngay]** trên thẻ kho, hệ thống sẽ tự động hướng dẫn bạn đăng nhập và tạo mã VietQR thanh toán cọc giữ chỗ tức thì!\n\n"
                        f"💡 *Bạn cũng có thể kể tên đồ đạc cần gửi (ví dụ: 1 tủ lạnh, 10 thùng đồ...) để tôi tính toán dung tích m³ chuẩn nhất nhé!*"
                    )
            else:
                target_name = f" tại **{detected_fac_name}**" if detected_fac_name else ""
                reply = (
                    f"🏢 Hệ thống hiện đang có **{cnt} ngăn kho còn phòng trống**{target_name} sẵn sàng phục vụ bạn!\n\n"
                    f"Tôi đã liệt kê các ngăn kho trống ngay bên dưới. Bạn có thể nhấn nút **[Đặt ngăn này ngay]** để tiến hành đặt chỗ và quét mã VietQR tự động nhé!"
                )

    # ================= 5. Nhánh: out_of_scope & Trò chuyện tổng quát =================
    else:
        llm = get_llm()
        s = get_settings()
        hist_context = ""
        if req.history:
            recent = req.history[-s.history_turns:]
            hist_context = "Lịch sử cuộc trò chuyện:\n" + "\n".join(
                f"- {turn.get('role', 'user')}: {turn.get('content', '')}" for turn in recent
            ) + "\n\n"

        system_prompt = (
            "Bạn là Trợ lý AI thông minh, linh hoạt, thân thiện của Hệ thống Kho Lưu Trữ Tự Phục Vụ SelfStorage.\n"
            "Tính cách: Lịch thiệp, tự nhiên, thông minh, trả lời sắc bén và có chút dí dỏm nếu khách hỏi xoáy hoặc đùa vui.\n"
            "Hệ thống có 6 chi nhánh tại TP.HCM:\n"
            "- Q7 / Quận 7: 69 Trần Trọng Cung, P. Tân Thuận Đông, Quận 7\n"
            "- Q1 / Quận 1: 79 Trần Khắc Chân, P. Tân Định, Quận 1\n"
            "- Landmark 81 - Bình Thạnh: Tòa Landmark 81, P. 22, Bình Thạnh\n"
            "- An Phú - TP. Thủ Đức: 90 Song Hành, P. An Phú, TP. Thủ Đức\n"
            "- Trụ Sở Chính Võ Nguyên Giáp: 375 Võ Nguyên Giáp, P. An Khánh, TP. Thủ Đức\n"
            "- Q6 / Centre Mall: 1466 Võ Văn Kiệt, P. Bình Tiên, Quận 6\n\n"
            "Nhiệm vụ:\n"
            "- Trả lời trực tiếp, thông minh, đúng trọng tâm câu hỏi của khách hàng (không lặp lại câu chào mẫu cứng nhắc).\n"
            "- Nếu khách muốn đặt kho: Hướng dẫn khách quy trình đặt online cực kỳ tiện lợi trên Web/App (chọn chi nhánh -> chọn ngăn kho -> quét VietQR cọc giữ chỗ) và mời khách liệt kê đồ đạc hoặc khu vực (Q7, Q1...) để bạn lọc kho trống.\n"
            "- Nếu khách hỏi các câu hỏi xã giao hoặc thắc mắc đời sống: Trả lời tự nhiên, khéo léo và liên hệ duyên dáng tới dịch vụ lưu kho an toàn của SelfStorage khi thích hợp.\n"
            "- Trả lời bằng tiếng Việt chuẩn mực, định dạng Markdown đẹp mắt."
        )

        user_prompt = f"{hist_context}Khách hàng nhắn: \"{req.message}\"\nHãy trả lời một cách thông minh, tự nhiên và hữu ích:"

        llm_reply = None
        if llm.available:
            try:
                llm_reply = llm.generate(system_prompt, user_prompt, temperature=0.6)
            except Exception as e:
                logger.warning("Lỗi sinh câu trả lời LLM cho out_of_scope: %s", e)

        if llm_reply and len(llm_reply.strip()) > 10:
            reply = llm_reply.strip()
        else:
            reply = (
                "👋 **Xin chào!** Tôi là **Trợ lý AI** của Hệ thống Kho Lưu Trữ Tự Phục Vụ SelfStorage.\n\n"
                "Tôi có thể hỗ trợ bạn:\n"
                "• 📦 **Tư vấn kích thước kho** theo danh sách đồ đạc cần gửi\n"
                "• 🏢 **Hướng dẫn đặt giữ chỗ kho** nhanh chóng qua VietQR tại 6 chi nhánh (Q7, Q1, Bình Thạnh, Thủ Đức, Q6)\n"
                "• 📄 **Giải đáp chính sách, bảng giá & điều khoản dịch vụ**\n\n"
                "💬 *Bạn đang cần hỗ trợ thông tin gì về dịch vụ kho lưu trữ?*"
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
