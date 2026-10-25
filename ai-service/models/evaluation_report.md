# BÁO CÁO KẾT QUẢ ĐÁNH GIÁ 2 MÔ HÌNH MACHINE LEARNING
*Phiên bản: v1.0 | Ngày tạo: 2026-10-25T16:09:22.665733*

## 1. Model A: Dự đoán khả năng gia hạn hợp đồng (Binary Classification)
- **Mục tiêu:** Dự đoán hợp đồng có được gia hạn (`1`) hay rời đi (`0`) khi sắp hết hạn.
- **Thuật toán chính:** XGBoost Classifier.
- **Các baseline so sánh:** Quy tắc số đông (Luôn đoán gia hạn) & Mô hình Hồi quy Logistic (Logistic Regression).

### Bảng so sánh chỉ số đánh giá trên tập kiểm thử (Test Set):
| Mô hình | Accuracy | Precision | Recall | F1-Score | ROC-AUC |
|---|---|---|---|---|---|
| **Majority Rule (Số đông)** | 0.5500 | - | - | 0.7097 | 0.5000 |
| **Logistic Regression (Baseline)** | 0.9450 | 0.9569 | 0.9424 | 0.9496 | 0.9929 |
| **XGBoost (Đề xuất)** | **0.9483** | **0.9600** | **0.9455** | **0.9527** | **0.9926** |

*5-Fold Cross-Validation ROC-AUC:* **0.9904 ± 0.0010**

### Mức độ quan trọng của đặc trưng (Feature Importance):
- `late_payments_count`: 0.3249
- `overdue_fees_count`: 0.3205
- `days_since_last_access`: 0.0918
- `access_count_last_30d`: 0.0866
- `support_tickets_count`: 0.0690
- `has_discount`: 0.0312

---

## 2. Model B: Gợi ý gói kỳ hạn gia hạn (Multi-class Classification)
- **Mục tiêu:** Gợi ý gói kỳ hạn tối ưu (1, 3, 6, 12 tháng) cho từng khách hàng.
- **Thuật toán chính:** Random Forest Classifier.
- **Baseline so sánh:** Heuristic gói phổ biến nhất theo kích thước kho.

### Bảng so sánh chỉ số trên tập kiểm thử:
| Mô hình | Accuracy | Macro F1-Score |
|---|---|---|
| **Heuristic theo cỡ kho (Baseline)** | 0.6417 | 0.3262 |
| **Random Forest (Đề xuất)** | **0.8533** | **0.5639** |

*5-Fold Cross-Validation Accuracy:* **0.8518 ± 0.0082**
