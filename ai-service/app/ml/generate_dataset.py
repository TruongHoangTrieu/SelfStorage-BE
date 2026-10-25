"""Sinh dữ liệu mô phỏng để huấn luyện Model A (Dự đoán gia hạn) và Model B (Gợi ý gói thuê).
Các quy luật được gài có chủ đích kết hợp với nhiễu ngẫu nhiên theo kế hoạch thiết kế.
"""
import argparse
from pathlib import Path
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

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


def generate_synthetic_data(n_samples: int = 4000, random_seed: int = 42) -> pd.DataFrame:
    """Sinh 4,000 mẫu hợp đồng mô phỏng đầy đủ các tình huống:
    - Tình huống TỐT (Khách hàng VIP, doanh nghiệp gắn bó, không nợ cước, tần suất cao).
    - Tình huống XẤU (Khách có nhiều khiếu nại chưa giải quyết, trễ hạn nhiều lần, nợ phạt quá hạn, bỏ rơi kho).
    - Tình huống TIÊU CHUẨN & BIÊN (Khách mới chuyển nhà ngắn hạn, mùa vụ cao điểm/thấp điểm).
    """
    np.random.seed(random_seed)

    # Chia tỷ lệ các nhóm kịch bản
    n_vip = int(n_samples * 0.22)          # Tình huống TỐT: Khách VIP / Gắn bó cao (22%)
    n_bad_complaint = int(n_samples * 0.15)# Tình huống XẤU 1: Bất mãn / Nhiều ticket lỗi (15%)
    n_bad_debt = int(n_samples * 0.13)     # Tình huống XẤU 2: Nợ cước / Trễ hạn / Bị phạt PIN (13%)
    n_dormant = int(n_samples * 0.10)      # Tình huống XẤU 3: Bỏ mặc kho không ra vào (10%)
    n_standard = n_samples - (n_vip + n_bad_complaint + n_bad_debt + n_dormant) # Tiêu chuẩn (40%)

    # --- 1. Nhóm VIP (Tình huống TỐT) ---
    vip_rented = np.random.choice([6, 8, 12, 18, 24, 36], size=n_vip, p=[0.2, 0.15, 0.35, 0.15, 0.1, 0.05])
    vip_size = np.random.choice([4.0, 6.0, 8.0, 10.0, 18.0], size=n_vip, p=[0.2, 0.3, 0.25, 0.15, 0.1])
    vip_price_ratio = np.round(np.random.normal(loc=0.92, scale=0.06, size=n_vip).clip(0.78, 1.05), 2)
    vip_late = np.zeros(n_vip, dtype=int)
    vip_overdue = np.zeros(n_vip, dtype=int)
    vip_access = np.random.poisson(lam=9.0, size=n_vip).clip(4, 30)
    vip_days_since = np.random.randint(0, 8, size=n_vip)
    vip_tickets = np.random.choice([0, 1], size=n_vip, p=[0.85, 0.15])
    vip_discount = np.ones(n_vip, dtype=int)

    # --- 2. Nhóm Bất mãn / Khiếu nại (Tình huống XẤU 1) ---
    bad1_rented = np.random.choice([1, 2, 3, 6], size=n_bad_complaint, p=[0.4, 0.3, 0.2, 0.1])
    bad1_size = np.random.choice([2.0, 4.0, 6.0, 8.0], size=n_bad_complaint)
    bad1_price_ratio = np.round(np.random.normal(loc=1.15, scale=0.10, size=n_bad_complaint).clip(0.95, 1.4), 2)
    bad1_late = np.random.poisson(lam=1.5, size=n_bad_complaint).clip(0, 4)
    bad1_overdue = (bad1_late > 0).astype(int) * np.random.poisson(lam=0.8, size=n_bad_complaint).clip(0, 3)
    bad1_access = np.random.poisson(lam=3.0, size=n_bad_complaint).clip(0, 10)
    bad1_days_since = np.random.randint(5, 30, size=n_bad_complaint)
    bad1_tickets = np.random.choice([2, 3, 4, 5], size=n_bad_complaint, p=[0.35, 0.35, 0.2, 0.1]) # nhiều sự cố
    bad1_discount = np.random.choice([0, 1], size=n_bad_complaint, p=[0.7, 0.3])

    # --- 3. Nhóm Nợ cước / Phạt quá hạn (Tình huống XẤU 2) ---
    bad2_rented = np.random.choice([1, 2, 3, 4, 6], size=n_bad_debt, p=[0.3, 0.3, 0.2, 0.1, 0.1])
    bad2_size = np.random.choice([1.0, 2.0, 4.0, 6.0], size=n_bad_debt)
    bad2_price_ratio = np.round(np.random.normal(loc=1.18, scale=0.12, size=n_bad_debt).clip(0.90, 1.45), 2)
    bad2_late = np.random.choice([2, 3, 4, 5], size=n_bad_debt, p=[0.35, 0.35, 0.2, 0.1])
    bad2_overdue = np.random.choice([1, 2, 3], size=n_bad_debt, p=[0.5, 0.35, 0.15])
    bad2_access = np.random.poisson(lam=2.0, size=n_bad_debt).clip(0, 8)
    bad2_days_since = np.random.randint(10, 40, size=n_bad_debt)
    bad2_tickets = np.random.poisson(lam=0.8, size=n_bad_debt).clip(0, 3)
    bad2_discount = np.zeros(n_bad_debt, dtype=int)

    # --- 4. Nhóm Bỏ mặc kho / Ít ra vào (Tình huống XẤU 3) ---
    dorm_rented = np.random.choice([1, 2, 3, 6, 12], size=n_dormant, p=[0.25, 0.25, 0.25, 0.15, 0.1])
    dorm_size = np.random.choice([1.0, 2.0, 4.0], size=n_dormant)
    dorm_price_ratio = np.round(np.random.normal(loc=1.0, scale=0.10, size=n_dormant).clip(0.85, 1.25), 2)
    dorm_late = np.random.poisson(lam=0.5, size=n_dormant).clip(0, 2)
    dorm_overdue = (dorm_late > 0).astype(int)
    dorm_access = np.random.choice([0, 1], size=n_dormant, p=[0.75, 0.25])
    dorm_days_since = np.random.randint(35, 65, size=n_dormant) # đã rất lâu không ra vào
    dorm_tickets = np.zeros(n_dormant, dtype=int)
    dorm_discount = np.random.choice([0, 1], size=n_dormant, p=[0.6, 0.4])

    # --- 5. Nhóm Khách hàng Tiêu chuẩn ---
    std_rented = np.random.choice([1, 2, 3, 4, 6, 12], size=n_standard, p=[0.3, 0.2, 0.2, 0.1, 0.12, 0.08])
    std_size = np.random.choice([1.0, 2.0, 4.0, 6.0, 8.0, 10.0], size=n_standard, p=[0.15, 0.25, 0.25, 0.2, 0.1, 0.05])
    std_price_ratio = np.round(np.random.normal(loc=1.0, scale=0.10, size=n_standard).clip(0.80, 1.30), 2)
    std_late = np.random.poisson(lam=0.4, size=n_standard).clip(0, 3)
    std_overdue = (std_late > 0).astype(int) * np.random.poisson(lam=0.3, size=n_standard).clip(0, 2)
    std_access = np.random.poisson(lam=4.5, size=n_standard).clip(0, 18)
    std_days_since = np.array([
        np.random.randint(0, 7) if acc > 8 else
        np.random.randint(5, 20) if acc > 2 else
        np.random.randint(15, 45)
        for acc in std_access
    ])
    std_tickets = np.random.poisson(lam=0.4, size=n_standard).clip(0, 3)
    std_discount = np.random.choice([0, 1], size=n_standard, p=[0.5, 0.5])

    # Gộp tất cả các mảng
    rented_months = np.concatenate([vip_rented, bad1_rented, bad2_rented, dorm_rented, std_rented])
    unit_size_m2 = np.concatenate([vip_size, bad1_size, bad2_size, dorm_size, std_size])
    price_per_m2_ratio = np.concatenate([vip_price_ratio, bad1_price_ratio, bad2_price_ratio, dorm_price_ratio, std_price_ratio])
    late_payments_count = np.concatenate([vip_late, bad1_late, bad2_late, dorm_late, std_late])
    overdue_fees_count = np.concatenate([vip_overdue, bad1_overdue, bad2_overdue, dorm_overdue, std_overdue])
    access_count_last_30d = np.concatenate([vip_access, bad1_access, bad2_access, dorm_access, std_access])
    days_since_last_access = np.concatenate([vip_days_since, bad1_days_since, bad2_days_since, dorm_days_since, std_days_since])
    support_tickets_count = np.concatenate([vip_tickets, bad1_tickets, bad2_tickets, dorm_tickets, std_tickets])
    has_discount = np.concatenate([vip_discount, bad1_discount, bad2_discount, dorm_discount, std_discount])

    month_of_year = np.random.randint(1, 13, size=n_samples)
    facility_occupancy_rate = np.round(np.random.uniform(0.55, 0.96, size=n_samples), 2)

    # ================= QUY LUẬT SINH NHÃN MODEL A (will_renew) =================
    log_odds = (
        0.45
        + 0.055 * rented_months                           # Khách gắn bó lâu -> xác suất tái ký cao
        + 0.065 * unit_size_m2                            # Kho lớn khó dọn chuyển -> tỷ lệ gia hạn cao
        - 1.50 * (price_per_m2_ratio - 1.0)               # Giá đắt -> rủi ro rời đi
        - 0.90 * late_payments_count                      # Nợ cước -> nguy cơ rời đi cao
        - 0.75 * overdue_fees_count                       # Bị phạt quá hạn / khóa mã PIN
        + 0.14 * access_count_last_30d                   # Còn ra vào đều đặn
        - 0.045 * days_since_last_access                  # Lâu không ghé -> chuẩn bị trả kho
        - 0.65 * (support_tickets_count >= 2)             # Gặp nhiều sự cố kỹ thuật / khiếu nại
        + 0.45 * has_discount                             # Khuyến mãi kích thích gia hạn
        + 0.40 * np.isin(month_of_year, [6, 7, 8, 12, 1]) # Mùa cao điểm hè & Tết
        + np.random.normal(0, 0.45, size=n_samples)
    )

    prob = 1.0 / (1.0 + np.exp(-log_odds))
    will_renew = (prob > 0.5).astype(int)

    # ================= QUY LUẬT SINH NHÃN MODEL B (recommended_package: 1, 3, 6, 12) =================
    recommended_package = []
    for i in range(n_samples):
        r_m = rented_months[i]
        u_s = unit_size_m2[i]
        d_c = has_discount[i]
        l_p = late_payments_count[i]
        s_t = support_tickets_count[i]
        ren = will_renew[i]

        if ren == 0 or l_p >= 2 or s_t >= 2:
            # Tình huống xấu / rủi ro: Khách đang do dự hoặc tài chính eo hẹp -> gợi ý gói ngắn 1 hoặc 3 tháng
            scores = [
                2.2 - 0.02 * r_m,
                1.3 + 0.01 * r_m,
                0.2,
                -0.5,
            ]
        elif r_m >= 6 and u_s >= 4.0:
            # Tình huống tốt: Khách lâu năm kho lớn -> gợi ý gói 6 hoặc 12 tháng ưu đãi cao
            scores = [
                0.2,
                0.8,
                1.8 + 0.03 * r_m + 0.05 * u_s + 0.4 * d_c,
                2.4 + 0.05 * r_m + 0.08 * u_s + 0.8 * d_c,
            ]
        else:
            # Tiêu chuẩn
            scores = [
                1.4 - 0.04 * r_m,
                1.2 + 0.02 * r_m + 0.3 * d_c,
                0.7 + 0.03 * r_m + 0.05 * u_s + 0.5 * d_c,
                0.3 + 0.05 * r_m + 0.07 * u_s + 0.7 * d_c,
            ]

        scores = np.array(scores) + np.random.normal(0, 0.20, size=4)
        pkg_idx = int(np.argmax(scores))
        pkg_val = [1, 3, 6, 12][pkg_idx]
        recommended_package.append(pkg_val)

    # Xáo trộn ngẫu nhiên để không bị dính theo thứ tự block
    indices = np.random.permutation(n_samples)

    df = pd.DataFrame({
        "rented_months": rented_months[indices],
        "unit_size_m2": unit_size_m2[indices],
        "price_per_m2_ratio": price_per_m2_ratio[indices],
        "late_payments_count": late_payments_count[indices],
        "overdue_fees_count": overdue_fees_count[indices],
        "access_count_last_30d": access_count_last_30d[indices],
        "days_since_last_access": days_since_last_access[indices],
        "support_tickets_count": support_tickets_count[indices],
        "has_discount": has_discount[indices],
        "month_of_year": month_of_year[indices],
        "facility_occupancy_rate": facility_occupancy_rate[indices],
        "will_renew": will_renew[indices],
        "recommended_package": np.array(recommended_package)[indices],
    })

    return df


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "synthetic_contracts.csv"

    df = generate_synthetic_data(n_samples=4000, random_seed=42)
    df.to_csv(csv_path, index=False, encoding="utf-8")
    print(f"Đã sinh {len(df)} dòng dữ liệu mô phỏng tại: {csv_path}")
    print(f"Tỷ lệ gia hạn (will_renew = 1): {df['will_renew'].mean():.2%}")
    print(f"Phân bố gói thuê: {dict(df['recommended_package'].value_counts())}")

