"""Huấn luyện và đánh giá Model A (Dự đoán gia hạn) & Model B (Gợi ý gói thuê).
So sánh đầy đủ với baseline và xuất báo cáo đánh giá phục vụ thuyết minh đồ án.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
import joblib

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from xgboost import XGBClassifier

from .generate_dataset import FEATURE_COLUMNS, generate_synthetic_data


def train_and_evaluate(data_path: Path | None = None, models_dir: Path | None = None) -> dict:
    service_root = Path(__file__).resolve().parent.parent.parent
    if models_dir is None:
        models_dir = service_root / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    if data_path is None:
        default_csv = service_root / "data" / "synthetic_contracts.csv"
        if default_csv.exists():
            data_path = default_csv

    if data_path and data_path.exists():
        df = pd.read_csv(data_path)
    else:
        df = generate_synthetic_data(n_samples=4000, random_seed=42)

    X = df[FEATURE_COLUMNS].copy()
    y_renew = df["will_renew"].values
    y_pkg = df["recommended_package"].values

    # Chia Train / Validation / Test: 70% / 15% / 15%
    X_train_val, X_test, y_renew_train_val, y_renew_test, y_pkg_train_val, y_pkg_test = train_test_split(
        X, y_renew, y_pkg, test_size=0.15, random_state=42, stratify=y_renew
    )
    X_train, X_val, y_renew_train, y_renew_val, y_pkg_train, y_pkg_val = train_test_split(
        X_train_val, y_renew_train_val, y_pkg_train_val, test_size=0.1765, random_state=42, stratify=y_renew_train_val
    )

    print(f"Dataset split: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")

    # =========================================================================
    # 1. MODEL A: DỰ ĐOÁN GIA HẠN / RỜI ĐI (CHURN)
    # =========================================================================
    print("\n--- [MODEL A] HUẤN LUYỆN DỰ ĐOÁN GIA HẠN ---")

    # Baseline 1: Rule-based "Luôn đoán gia hạn" (Majority class)
    baseline_dummy = DummyClassifier(strategy="most_frequent")
    baseline_dummy.fit(X_train, y_renew_train)
    y_pred_dummy = baseline_dummy.predict(X_test)

    # Baseline 2: Logistic Regression
    baseline_lr = LogisticRegression(max_iter=1000, random_state=42)
    baseline_lr.fit(X_train, y_renew_train)
    y_pred_lr = baseline_lr.predict(X_test)
    y_prob_lr = baseline_lr.predict_proba(X_test)[:, 1]

    # Model chính: XGBoost Classifier
    model_a = XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        random_state=42,
        eval_metric="logloss",
    )
    model_a.fit(X_train, y_renew_train, eval_set=[(X_val, y_renew_val)], verbose=False)
    y_pred_a = model_a.predict(X_test)
    y_prob_a = model_a.predict_proba(X_test)[:, 1]

    # Đánh giá 5-fold cross validation bằng vòng lặp thủ công
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores_a = []
    for tr_idx, te_idx in cv.split(X_train_val, y_renew_train_val):
        X_tr_f, X_te_f = X_train_val.iloc[tr_idx], X_train_val.iloc[te_idx]
        y_tr_f, y_te_f = y_renew_train_val[tr_idx], y_renew_train_val[te_idx]
        fold_model = XGBClassifier(
            n_estimators=120, max_depth=4, learning_rate=0.08,
            subsample=0.85, colsample_bytree=0.85, random_state=42, eval_metric="logloss"
        )
        fold_model.fit(X_tr_f, y_tr_f, verbose=False)
        fold_probs = fold_model.predict_proba(X_te_f)[:, 1]
        cv_scores_a.append(roc_auc_score(y_te_f, fold_probs))

    report_a = {
        "baseline_majority": {
            "accuracy": float(accuracy_score(y_renew_test, y_pred_dummy)),
            "f1": float(f1_score(y_renew_test, y_pred_dummy, zero_division=0)),
        },
        "baseline_logistic_regression": {
            "accuracy": float(accuracy_score(y_renew_test, y_pred_lr)),
            "precision": float(precision_score(y_renew_test, y_pred_lr)),
            "recall": float(recall_score(y_renew_test, y_pred_lr)),
            "f1": float(f1_score(y_renew_test, y_pred_lr)),
            "roc_auc": float(roc_auc_score(y_renew_test, y_prob_lr)),
        },
        "main_xgboost": {
            "accuracy": float(accuracy_score(y_renew_test, y_pred_a)),
            "precision": float(precision_score(y_renew_test, y_pred_a)),
            "recall": float(recall_score(y_renew_test, y_pred_a)),
            "f1": float(f1_score(y_renew_test, y_pred_a)),
            "roc_auc": float(roc_auc_score(y_renew_test, y_prob_a)),
            "cv_roc_auc_mean": float(np.mean(cv_scores_a)),
            "cv_roc_auc_std": float(np.std(cv_scores_a)),
        },
    }

    # Feature Importance của Model A
    feat_imp_a = dict(zip(FEATURE_COLUMNS, [float(x) for x in model_a.feature_importances_]))
    feat_imp_a = dict(sorted(feat_imp_a.items(), key=lambda item: item[1], reverse=True))
    report_a["feature_importance"] = feat_imp_a

    print("Model A (XGBoost) Test Results:")
    print(f"  Accuracy:  {report_a['main_xgboost']['accuracy']:.4f} (vs LR: {report_a['baseline_logistic_regression']['accuracy']:.4f})")
    print(f"  ROC-AUC:   {report_a['main_xgboost']['roc_auc']:.4f} (vs LR: {report_a['baseline_logistic_regression']['roc_auc']:.4f})")
    print(f"  F1 Score:  {report_a['main_xgboost']['f1']:.4f}")

    # =========================================================================
    # 2. MODEL B: GỢI Ý GÓI THUÊ (1, 3, 6, 12 THÁNG)
    # =========================================================================
    print("\n--- [MODEL B] HUẤN LUYỆN GỢI Ý GÓI THUÊ ---")

    # Baseline: Gói phổ biến nhất theo cỡ kho
    class SizeHeuristicBaseline:
        def fit(self, X_t, y_t):
            self.mapping_ = {}
            df_t = X_t.copy()
            df_t["y"] = y_t
            for sz, grp in df_t.groupby("unit_size_m2"):
                self.mapping_[sz] = grp["y"].mode()[0]
            self.default_ = pd.Series(y_t).mode()[0]

        def predict(self, X_eval):
            return np.array([self.mapping_.get(sz, self.default_) for sz in X_eval["unit_size_m2"]])

    baseline_b = SizeHeuristicBaseline()
    baseline_b.fit(X_train, y_pkg_train)
    y_pred_b_base = baseline_b.predict(X_test)

    # Model B chính: Random Forest Classifier
    model_b = RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42)
    model_b.fit(X_train, y_pkg_train)
    y_pred_b = model_b.predict(X_test)

    cv_scores_b = cross_val_score(model_b, X_train_val, y_pkg_train_val, cv=cv, scoring="accuracy")

    report_b = {
        "baseline_size_heuristic": {
            "accuracy": float(accuracy_score(y_pkg_test, y_pred_b_base)),
            "macro_f1": float(f1_score(y_pkg_test, y_pred_b_base, average="macro", zero_division=0)),
        },
        "main_random_forest": {
            "accuracy": float(accuracy_score(y_pkg_test, y_pred_b)),
            "macro_f1": float(f1_score(y_pkg_test, y_pred_b, average="macro")),
            "cv_accuracy_mean": float(np.mean(cv_scores_b)),
            "cv_accuracy_std": float(np.std(cv_scores_b)),
        },
    }

    print("Model B (Random Forest) Test Results:")
    print(f"  Accuracy:  {report_b['main_random_forest']['accuracy']:.4f} (vs Heuristic: {report_b['baseline_size_heuristic']['accuracy']:.4f})")
    print(f"  Macro F1:  {report_b['main_random_forest']['macro_f1']:.4f}")

    # =========================================================================
    # 3. LƯU MODEL VÀ ARTIFACTS
    # =========================================================================
    joblib.dump(model_a, models_dir / "model_a_renewal_xgb.joblib")
    joblib.dump(model_b, models_dir / "model_b_package_rf.joblib")
    metadata = {
        "version": "v1.0",
        "feature_columns": FEATURE_COLUMNS,
        "classes_model_b": [int(c) for c in model_b.classes_],
        "created_at": pd.Timestamp.now().isoformat(),
    }
    with open(models_dir / "models_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    full_report = {
        "metadata": metadata,
        "model_a_renewal": report_a,
        "model_b_package": report_b,
    }
    with open(models_dir / "evaluation_report.json", "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2, ensure_ascii=False)

    # Xuất Markdown report đẹp mắt cho thuyết minh
    md_report = f"""# BÁO CÁO KẾT QUẢ ĐÁNH GIÁ 2 MÔ HÌNH MACHINE LEARNING
*Phiên bản: {metadata['version']} | Ngày tạo: {metadata['created_at']}*

## 1. Model A: Dự đoán khả năng gia hạn hợp đồng (Binary Classification)
- **Mục tiêu:** Dự đoán hợp đồng có được gia hạn (`1`) hay rời đi (`0`) khi sắp hết hạn.
- **Thuật toán chính:** XGBoost Classifier.
- **Các baseline so sánh:** Quy tắc số đông (Luôn đoán gia hạn) & Mô hình Hồi quy Logistic (Logistic Regression).

### Bảng so sánh chỉ số đánh giá trên tập kiểm thử (Test Set):
| Mô hình | Accuracy | Precision | Recall | F1-Score | ROC-AUC |
|---|---|---|---|---|---|
| **Majority Rule (Số đông)** | {report_a['baseline_majority']['accuracy']:.4f} | - | - | {report_a['baseline_majority']['f1']:.4f} | 0.5000 |
| **Logistic Regression (Baseline)** | {report_a['baseline_logistic_regression']['accuracy']:.4f} | {report_a['baseline_logistic_regression']['precision']:.4f} | {report_a['baseline_logistic_regression']['recall']:.4f} | {report_a['baseline_logistic_regression']['f1']:.4f} | {report_a['baseline_logistic_regression']['roc_auc']:.4f} |
| **XGBoost (Đề xuất)** | **{report_a['main_xgboost']['accuracy']:.4f}** | **{report_a['main_xgboost']['precision']:.4f}** | **{report_a['main_xgboost']['recall']:.4f}** | **{report_a['main_xgboost']['f1']:.4f}** | **{report_a['main_xgboost']['roc_auc']:.4f}** |

*5-Fold Cross-Validation ROC-AUC:* **{report_a['main_xgboost']['cv_roc_auc_mean']:.4f} ± {report_a['main_xgboost']['cv_roc_auc_std']:.4f}**

### Mức độ quan trọng của đặc trưng (Feature Importance):
{chr(10).join(f"- `{k}`: {v:.4f}" for k, v in list(feat_imp_a.items())[:6])}

---

## 2. Model B: Gợi ý gói kỳ hạn gia hạn (Multi-class Classification)
- **Mục tiêu:** Gợi ý gói kỳ hạn tối ưu (1, 3, 6, 12 tháng) cho từng khách hàng.
- **Thuật toán chính:** Random Forest Classifier.
- **Baseline so sánh:** Heuristic gói phổ biến nhất theo kích thước kho.

### Bảng so sánh chỉ số trên tập kiểm thử:
| Mô hình | Accuracy | Macro F1-Score |
|---|---|---|
| **Heuristic theo cỡ kho (Baseline)** | {report_b['baseline_size_heuristic']['accuracy']:.4f} | {report_b['baseline_size_heuristic']['macro_f1']:.4f} |
| **Random Forest (Đề xuất)** | **{report_b['main_random_forest']['accuracy']:.4f}** | **{report_b['main_random_forest']['macro_f1']:.4f}** |

*5-Fold Cross-Validation Accuracy:* **{report_b['main_random_forest']['cv_accuracy_mean']:.4f} ± {report_b['main_random_forest']['cv_accuracy_std']:.4f}**
"""
    (models_dir / "evaluation_report.md").write_text(md_report, encoding="utf-8")
    print(f"\nĐã lưu model và báo cáo đánh giá vào: {models_dir}")
    return full_report


if __name__ == "__main__":
    train_and_evaluate()
