# BÁO CÁO KẾT QUẢ ĐÁNH GIÁ 2 MÔ HÌNH MACHINE LEARNING
*Phiên bản: v1.0 | Ngày tạo: 2026-10-22T08:53:28.630428*

## 1. Model A: Dự đoán khả năng gia hạn hợp đồng (Binary Classification)
- **Mục tiêu:** Dự đoán hợp đồng có được gia hạn (`1`) hay rời đi (`0`) khi sắp hết hạn.
- **Thuật toán chính:** XGBoost Classifier.
- **Các baseline so sánh:** Quy tắc số đông (Luôn đoán gia hạn) & Mô hình Hồi quy Logistic (Logistic Regression).

### Bảng so sánh chỉ số đánh giá trên tập kiểm thử (Test Set):
| Mô hình | Accuracy | Precision | Recall | F1-Score | ROC-AUC |
|---|---|---|---|---|---|
| **Majority Rule (Số đông)** | 0.6467 | - | - | 0.0000 | 0.5000 |
| **Logistic Regression (Baseline)** | 0.8489 | 0.8370 | 0.7107 | 0.7687 | 0.9217 |
| **XGBoost (Đề xuất)** | **0.8622** | **0.8593** | **0.7296** | **0.7891** | **0.9332** |

*5-Fold Cross-Validation ROC-AUC:* **0.8975 ± 0.0090**

### Mức độ quan trọng của đặc trưng (Feature Importance):
- `late_payments_count`: 0.2234
- `access_count_last_30d`: 0.1261
- `overdue_fees_count`: 0.1116
- `has_discount`: 0.1062
- `days_since_last_access`: 0.1015
- `rented_months`: 0.0878

---

## 2. Model B: Gợi ý gói kỳ hạn gia hạn (Multi-class Classification)
- **Mục tiêu:** Gợi ý gói kỳ hạn tối ưu (1, 3, 6, 12 tháng) cho từng khách hàng.
- **Thuật toán chính:** Random Forest Classifier.
- **Baseline so sánh:** Heuristic gói phổ biến nhất theo kích thước kho.

### Bảng so sánh chỉ số trên tập kiểm thử:
| Mô hình | Accuracy | Macro F1-Score |
|---|---|---|
| **Heuristic theo cỡ kho (Baseline)** | 0.4311 | 0.2567 |
| **Random Forest (Đề xuất)** | **0.6067** | **0.3664** |

*5-Fold Cross-Validation Accuracy:* **0.6282 ± 0.0133**
