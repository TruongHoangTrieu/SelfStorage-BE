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


PROHIBITED_CATEGORIES = {
    "Chất dễ cháy nổ & nhiên liệu": [
        "xang", "dau hoa", "binh gas", "binh ga", "gas mini", "phao hoa", "phao no",
        "thuoc sung", "con 90", "con y te", "axit", "chat de chay", "xang dau", "dau diesel"
    ],
    "Vũ khí & Hàng cấm pháp luật": [
        "vu khi", "sung ban", "khau sung", "sung dan", "dan duoc", "dao gam", "ma tuy", "chat cam", "thuoc phien", "can sa", "hang lau"
    ],
    "Động vật sống & Thú cưng": [
        "con cho", "con meo", "thu cung", "chim canh", "dong vat", "dong vat song", "thu nuoi", "nuoi thu", "cho meo"
    ],
    "Hàng tươi sống & Thực phẩm ôi thiu": [
        "thit song", "ca song", "hai san tuoi", "thuc pham tuoi", "do tuoi song", "rau cu song", "rac thai"
    ]
}


def find_prohibited_mentions(text: str) -> list[str]:
    """Phát hiện các mặt hàng nằm trong danh mục cấm lưu trữ an toàn PCCC."""
    norm = normalize(text)
    detected = []
    for cat, kws in PROHIBITED_CATEGORIES.items():
        for kw in kws:
            pattern = rf"(?:\b|^){re.escape(kw)}(?:\b|$)"
            if re.search(pattern, norm):
                detected.append(f"{kw} ({cat})")
    return list(dict.fromkeys(detected))


FACILITY_KEYWORDS_MAP = [
    {
        "id": "6ac4ea742f3017f8106ae7a9",
        "name": "Kho Tự Quản Chi Nhánh Quận 7",
        "keywords": ["q7", "q 7", "quan 7", "quận 7", "q.7", "tan thuan dong", "tân thuận đông", "tran trong cung", "trần trọng cung"],
    },
    {
        "id": "6ac4ea742f3017f8106ae7a8",
        "name": "Kho Tự Quản Chi Nhánh Quận 1",
        "keywords": ["q1", "q 1", "quan 1", "quận 1", "q.1", "tan dinh", "tân định", "tran khac chan", "trần khắc chân"],
    },
    {
        "id": "6ac4ea742f3017f8106ae7ab",
        "name": "Kho Tự Quản Chi Nhánh Centre Mall - Quận 6",
        "keywords": ["q6", "q 6", "quan 6", "quận 6", "q.6", "centre mall", "binh tien", "bình tiên", "vo van kiet", "võ văn kiệt"],
    },
    {
        "id": "6ac4ea742f3017f8106ae7aa",
        "name": "Kho Tự Quản Chi Nhánh Landmark 81 - Bình Thạnh",
        "keywords": ["binh thanh", "bình thạnh", "landmark 81", "landmark", "phuong 22", "phường 22"],
    },
    {
        "id": "6ac4ea732f3017f8106ae7a7",
        "name": "Kho Tự Quản Chi Nhánh An Phú - TP. Thủ Đức",
        "keywords": ["an phu", "an phú", "song hanh", "song hành", "thu duc an phu"],
    },
    {
        "id": "6ac4ea732f3017f8106ae7a6",
        "name": "Kho Tự Quản Trụ Sở Chính Võ Nguyên Giáp",
        "keywords": ["vo nguyen giap", "võ nguyên giáp", "an khanh", "an khánh", "thu duc", "thủ đức", "tru so chinh"],
    },
]


def detect_facility_from_text(text: str) -> tuple[str | None, str | None]:
    """Nhận diện cơ sở/chi nhánh từ tin nhắn người dùng (ví dụ: Q7, Quận 1, Bình Thạnh, Thủ Đức)."""
    norm = normalize(text)
    for fac in FACILITY_KEYWORDS_MAP:
        for kw in fac["keywords"]:
            norm_kw = normalize(kw)
            if re.search(rf"\b{re.escape(norm_kw)}\b", norm):
                return fac["id"], fac["name"]
    return None, None

