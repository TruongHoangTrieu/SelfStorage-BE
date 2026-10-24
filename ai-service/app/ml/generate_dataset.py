"""Sinh dữ liệu mô phỏng để huấn luyện Model A (Dự đoán gia hạn) và Model B (Gợi ý gói thuê).
Các quy luật được gài có chủ đích kết hợp với nhiễu ngẫu nhiên theo kế hoạch thiết kế.
"""
import argparse
from pathlib import Path
import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "rented_months",
    "unit_size_m2",
    "price_per_m2_ratio",
    "late_payments_count",
    "overdue_fees_count",
    "access_count_last_30d",
    "days_since_last_access",
    "support_tickets_count",
    "has_discount",
    "month_of_year",
    "facility_occupancy_rate",
]


def generate_synthetic_data(n_samples: int = 2500, random_seed: int = 42) -> pd.DataFrame:
    np.random.seed(random_seed)

    # 1. Thời gian đã thuê (tháng): từ 1 đến 36 tháng
    rented_months = np.random.choice([1, 2, 3, 4, 6, 8, 12, 18, 24, 36], size=n_samples, p=[0.25, 0.15, 0.2, 0.1, 0.12, 0.05, 0.07, 0.03, 0.02, 0.01])

    # 2. Cỡ kho (m2): 1, 2, 4, 6, 8, 10, 18
    unit_size_m2 = np.random.choice([1.0, 2.0, 4.0, 5.0, 6.0, 8.0, 10.0, 18.0], size=n_samples, p=[0.1, 0.25, 0.2, 0.1, 0.15, 0.1, 0.05, 0.05])

    # 3. Tỷ lệ giá / m2 so với trung bình (0.8 - 1.3)
    price_per_m2_ratio = np.round(np.random.normal(loc=1.0, scale=0.12, size=n_samples).clip(0.75, 1.4), 2)

    # 4. Số lần thanh toán trễ (0 - 5)
    late_payments_count = np.random.poisson(lam=0.4, size=n_samples).clip(0, 5)

    # 5. Số lần bị phạt quá hạn (0 - 3)
    overdue_fees_count = (late_payments_count > 0).astype(int) * np.random.poisson(lam=0.3, size=n_samples).clip(0, 3)

    # 6. Tần suất ra vào kho 30 ngày qua (0 - 25 lần)
    access_count_last_30d = np.random.poisson(lam=4.5, size=n_samples).clip(0, 25)

    # 7. Số ngày kể từ lần truy cập cuối (0 - 60 ngày)
    days_since_last_access = np.array([
        np.random.randint(0, 7) if acc > 8 else
        np.random.randint(5, 25) if acc > 2 else
        np.random.randint(15, 60)
        for acc in access_count_last_30d
    ])

    # 8. Số ticket hỗ trợ (0 - 4)
    support_tickets_count = np.random.poisson(lam=0.3, size=n_samples).clip(0, 4)

    # 9. Có dùng khuyến mãi/chiết khấu (0 hoặc 1)
    has_discount = np.random.choice([0, 1], size=n_samples, p=[0.45, 0.55])

    # 10. Tháng trong năm khi hết hạn (1 - 12)
    month_of_year = np.random.randint(1, 13, size=n_samples)

    # 11. Tỷ lệ lấp đầy cơ sở (0.50 - 0.98)
    facility_occupancy_rate = np.round(np.random.uniform(0.55, 0.96, size=n_samples), 2)

    # ================= QUY LUẬT SINH NHÃN MODEL A (will_renew) =================
    # Log-odds score với các hệ số có ý nghĩa thực tế
    log_odds = (
        0.5                                              # base bias
        + 0.05 * rented_months                           # thuê càng lâu càng gắn bó
        + 0.06 * unit_size_m2                            # kho lớn khó chuyển đi nên hay gia hạn
        - 1.4 * price_per_m2_ratio                       # giá đắt so với mặt bằng làm giảm gia hạn
        - 0.8 * late_payments_count                      # trễ hạn nhiều -> có vấn đề tài chính
        - 0.6 * overdue_fees_count                       # từng bị phạt -> ức chế, dễ rời đi
        + 0.12 * access_count_last_30d                   # còn dùng nhiều -> nhu cầu lưu trữ thật
        - 0.04 * days_since_last_access                  # bỏ mặc kho lâu ngày -> chuẩn bị trả kho
        - 0.3 * (support_tickets_count >= 2)             # gặp nhiều sự cố phàn nàn
        + 0.4 * has_discount                             # thích ưu đãi chiết khấu
        + 0.5 * np.isin(month_of_year, [6, 7, 8, 12, 1]) # mùa cao điểm hè và Tết
        + np.random.normal(0, 0.55, size=n_samples)      # nhiễu ngẫu nhiên thực tế
    )

    prob = 1.0 / (1.0 + np.exp(-log_odds))
    will_renew = (prob > 0.5).astype(int)

    # ================= QUY LUẬT SINH NHÃN MODEL B (package: 1, 3, 6, 12) =================
    # Khách hàng có xu hướng chọn gói dựa trên cỡ kho và thời gian thuê
    recommended_package = []
    for i in range(n_samples):
        r_m = rented_months[i]
        u_s = unit_size_m2[i]
        d_c = has_discount[i]

        scores = [
            1.5 - 0.05 * r_m,                  # Gói 1 tháng (linh hoạt, hợp khách mới)
            1.0 + 0.02 * r_m + 0.3 * d_c,      # Gói 3 tháng (tiêu chuẩn)
            0.6 + 0.04 * r_m + 0.05 * u_s + 0.5 * d_c, # Gói 6 tháng (giảm 10%)
            0.3 + 0.06 * r_m + 0.08 * u_s + 0.8 * d_c, # Gói 12 tháng (giảm 15%)
        ]
        # Thêm nhiễu
        scores = np.array(scores) + np.random.normal(0, 0.25, size=4)
        pkg_idx = int(np.argmax(scores))
        pkg_val = [1, 3, 6, 12][pkg_idx]
        recommended_package.append(pkg_val)

    df = pd.DataFrame({
        "rented_months": rented_months,
        "unit_size_m2": unit_size_m2,
        "price_per_m2_ratio": price_per_m2_ratio,
        "late_payments_count": late_payments_count,
        "overdue_fees_count": overdue_fees_count,
        "access_count_last_30d": access_count_last_30d,
        "days_since_last_access": days_since_last_access,
        "support_tickets_count": support_tickets_count,
        "has_discount": has_discount,
        "month_of_year": month_of_year,
        "facility_occupancy_rate": facility_occupancy_rate,
        "will_renew": will_renew,
        "recommended_package": recommended_package,
    })

    return df


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "synthetic_contracts.csv"

    df = generate_synthetic_data(n_samples=3000, random_seed=42)
    df.to_csv(csv_path, index=False, encoding="utf-8")
    print(f"Đã sinh {len(df)} dòng dữ liệu mô phỏng tại: {csv_path}")
    print(f"Tỷ lệ gia hạn (will_renew = 1): {df['will_renew'].mean():.2%}")
    print(f"Phân bố gói thuê: {dict(df['recommended_package'].value_counts())}")
