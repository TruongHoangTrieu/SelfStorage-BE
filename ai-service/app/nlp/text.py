"""Tiện ích xử lý văn bản tiếng Việt: bỏ dấu, chuẩn hóa, đọc số bằng chữ, che dữ liệu cá nhân."""
import re
import unicodedata

# Lưu ý: bỏ các từ dễ nhầm sau khi bỏ dấu ("tư"→"tu" trùng "tủ", "mấy"→"may" trùng "máy", "cặp").
_NUM_WORDS = {
    "mot": 1, "hai": 2, "ba": 3, "bon": 4, "nam": 5, "lam": 5,
    "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10, "chuc": 10,
    "doi": 2, "vai": 3,
}


def strip_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfkd if unicodedata.category(c) != "Mn")


def normalize(text: str) -> str:
    """Chữ thường, bỏ dấu, gộp khoảng trắng; giữ chữ số và chữ cái."""
    text = strip_accents(text.lower())
    text = re.sub(r"[^a-z0-9\s\.,]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def word_to_number(token: str) -> int | None:
    token = token.strip()
    if token.isdigit():
        return int(token)
    return _NUM_WORDS.get(token)


_PHONE = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s\.-]?\d){8,10}(?!\d)")
_EMAIL = re.compile(r"[\w\.\-+]+@[\w\-]+\.[\w\.\-]+")
_ID_NUMBER = re.compile(r"(?<!\d)\d{9}(?:\d{3})?(?!\d)")


def mask_pii(text: str) -> str:
    """Che số điện thoại, email, số CMND/CCCD trước khi gửi ra LLM bên ngoài."""
    text = _EMAIL.sub("[EMAIL]", text)
    text = _PHONE.sub("[SĐT]", text)
    text = _ID_NUMBER.sub("[SỐ GIẤY TỜ]", text)
    return text
