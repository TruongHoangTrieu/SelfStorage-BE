# HƯỚNG DẪN KHỞI CHẠY AI ASSISTANT SERVICE

Dịch vụ AI được phát triển bằng **Python FastAPI**, độc lập nhưng liên kết chặt chẽ với NestJS Backend qua kiến trúc API Gateway.

## 1. Cấu trúc thư mục
- `app/`
  - `main.py`: Các API endpoint (`/chat`, `/predict/renewal`, `/admin/ingest`, `/health`)
  - `config.py`: Đọc cấu hình từ biến môi trường hoặc file `.env` chung
  - `db.py`: Kết nối trực tiếp MongoDB Atlas
  - `router.py`: Router phân loại ý định người dùng thành 5 nhánh
  - `skills/`
    - `catalog.py`: Quản lý danh mục 120+ đồ vật (ItemCatalog)
    - `item_extractor.py`: Trích xuất đồ vật & số lượng (hỗ trợ LLM & rule-based)
    - `size_advisor.py`: **Kỹ năng 1** - Tính thể tích $V = \sum (q \cdot v) \cdot (1 + k)$ và khớp kho trống
    - `policy_rag.py`: **Kỹ năng 2** - Chatbot RAG giải đáp chính sách, trích dẫn nguồn và từ chối khi ngoài tài liệu
    - `renewal_predictor.py`: **Kỹ năng 3** - Dự đoán khả năng gia hạn & gợi ý gói thuê
  - `ml/`: Huấn luyện và đánh giá 2 mô hình Machine Learning:
    - `generate_dataset.py`: Sinh dữ liệu mô phỏng 3.000 hợp đồng có chủ đích
    - `train.py`: Huấn luyện Model A (XGBoost) và Model B (RandomForest), so sánh với baseline
  - `models/`: Chứa file model `.joblib` đã huấn luyện và báo cáo đánh giá `evaluation_report.md`
- `tests/`: Bộ kiểm thử tự động toàn diện (`test_skills.py`)

## 2. Cách khởi chạy

### Chạy trực tiếp trên máy:
```powershell
# Di chuyển vào thư mục ai-service
cd ai-service

# Khởi chạy uvicorn server (port 8000)
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Chạy kiểm thử tự động:
```powershell
cd ai-service
$env:PYTHONPATH="."
.\.venv\Scripts\pytest.exe tests\test_skills.py -v
```

### Huấn luyện lại model ML:
```powershell
cd ai-service
.\.venv\Scripts\python.exe -m app.ml.train
```

## 3. Tích hợp với NestJS Backend
- API chat chính: `POST http://localhost:5000/api/ai/chat` (Swagger UI: `http://localhost:5000/api/docs`)
- Cron Job của Flow 6 tự động quét hợp đồng sắp hết hạn và gọi sang AI Service để chấm điểm gia hạn cá nhân hóa.
