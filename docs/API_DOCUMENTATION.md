# 📚 SelfStorage - API Documentation

Tài liệu này ghi lại danh sách tất cả các API đã phát triển trong hệ thống Backend NestJS, định dạng request/response, cơ chế bảo vệ (Guards) và phân quyền (RBAC).

---

## 🌐 1. Thông Tin Cơ Bản (General Info)
- **Base URL**: `http://localhost:5000`
- **Content-Type**: `application/json`
- **Cơ chế xác thực**: `JWT Bearer Token`
- **Header xác thực**: `Authorization: Bearer <access_token>`

---

## 👥 2. Danh Sách Roles & Tài Khoản Mẫu (IAM / RBAC / Test Accounts)

### 2.1. Phân quyền (Roles)
1. `STORAGE_CUSTOMER`: Khách hàng thuê kho / sử dụng dịch vụ.
2. `FACILITY_STAFF`: Nhân viên vận hành tại cơ sở kho.
3. `FACILITY_MANAGER`: Quản lý cơ sở kho.
4. `BUSINESS_OPERATIONS_MANAGER`: Quản lý vận hành kinh doanh toàn hệ thống.
5. `SYSTEM_ADMINISTRATOR`: Quản trị viên hệ thống kỹ thuật cao nhất.

### 2.2. Danh sách tài khoản mẫu để test (Seeded Test Accounts)

| ID | Role | Email | Mật khẩu mặc định | Họ tên | Số điện thoại |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `1` | `SYSTEM_ADMINISTRATOR` | `admin@selfstorage.com` | `Admin@123456` | System Administrator | `0900000001` |
| `2` | `BUSINESS_OPERATIONS_MANAGER` | `business@selfstorage.com` | `Business@123456` | Business Operations Manager | `0900000002` |
| `3` | `FACILITY_MANAGER` | `manager@selfstorage.com` | `Manager@123456` | Facility Manager Q1 | `0900000003` |
| `4` | `FACILITY_STAFF` | `staff@selfstorage.com` | `Staff@123456` | Facility Staff Q1 | `0900000004` |
| `5` | `STORAGE_CUSTOMER` | `customer@selfstorage.com` | `Customer@123456` | Nguyễn Văn Khách Hàng | `0900000005` |

---

## 📋 3. Danh Sách API Đã Hoàn Thành

### 🔐 NHÓM 1: AUTHENTICATION & IAM

#### 3.1. Đăng ký khách hàng mới (Register)
- **Method**: `POST`
- **Endpoint**: `/auth/register`
- **Yêu cầu Auth**: **Không (Public)**
- **Quy tắc**: Tự động gán role `STORAGE_CUSTOMER`. Cấm client tự gửi role. Mật khẩu được hash an toàn qua bcrypt.

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn Khách Hàng Mới",
  "email": "newcustomer@selfstorage.com",
  "phone": "0909999888",        // Không bắt buộc (Optional)
  "password": "Password123!"
}
```

**Response Success (`201 Created`):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": 6,
    "roleId": 1,
    "fullName": "Nguyễn Văn Khách Hàng Mới",
    "email": "newcustomer@selfstorage.com",
    "phone": "0909999888",
    "status": "ACTIVE",
    "lastLoginAt": null,
    "createdAt": "2026-09-16T14:30:00.000Z",
    "updatedAt": "2026-09-16T14:30:00.000Z",
    "role": "STORAGE_CUSTOMER"
  }
}
```

#### 3.2. Đăng nhập hệ thống (Login)
- **Method**: `POST`
- **Endpoint**: `/auth/login`
- **Yêu cầu Auth**: **Không (Public)**
- **Quy tắc**: So khớp mật khẩu đã hash, kiểm tra user `ACTIVE`, cập nhật `lastLoginAt`.

**Request Body:**
```json
{
  "email": "customer@selfstorage.com",
  "password": "Customer@123456"
}
```

*(Hoặc đăng nhập với tài khoản Admin: `admin@selfstorage.com` / `Admin@123456`)*

**Response Success (`200 OK`):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 5,
    "roleId": 1,
    "fullName": "Nguyễn Văn Khách Hàng",
    "email": "customer@selfstorage.com",
    "phone": "0900000005",
    "status": "ACTIVE",
    "lastLoginAt": "2026-09-16T14:30:00.000Z",
    "createdAt": "2026-09-16T14:24:00.000Z",
    "updatedAt": "2026-09-16T14:30:00.000Z",
    "role": "STORAGE_CUSTOMER"
  }
}
```

#### 3.3. Lấy thông tin tài khoản hiện tại (Get Profile)
- **Method**: `GET`
- **Endpoint**: `/auth/me`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Header**: `Authorization: Bearer <access_token>`

#### 3.4. Đăng xuất hệ thống (Logout)
- **Method**: `POST`
- **Endpoint**: `/auth/logout`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Header**: `Authorization: Bearer <access_token>`

**Response Success (`200 OK`):**
```json
{
  "message": "Logged out successfully"
}
```

---

### 🏢 NHÓM 2: FACILITY / CƠ SỞ KHO

#### 3.5. Lấy danh sách cơ sở kho (Get Facilities)
- **Method**: `GET`
- **Endpoint**: `/facilities`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**
- **Dữ liệu trả về**: Danh sách cơ sở kèm `totalUnits`, `availableUnits`, `totalUnitTypes`.

**Response Success (`200 OK`):**
```json
[
  {
    "id": 1,
    "name": "Self Storage Facility Alpha",
    "code": "FAC_ALPHA",
    "description": "Alpha facility located in District 1",
    "phone": "0901112222",
    "email": "alpha@selfstorage.com",
    "address": "123 Nguyen Hue, District 1, HCMC",
    "status": "ACTIVE",
    "totalUnits": 20,
    "availableUnits": 15,
    "totalUnitTypes": 3
  }
]
```

#### 3.6. Lấy chi tiết một cơ sở kho
- **Method**: `GET`
- **Endpoint**: `/facilities/:id`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**

#### 3.7. Tạo mới cơ sở kho
- **Method**: `POST`
- **Endpoint**: `/facilities`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`

**Request Body:**
```json
{
  "name": "Self Storage Facility Alpha",
  "code": "FAC_ALPHA",
  "description": "Optional description",
  "phone": "0901112222",
  "email": "alpha@selfstorage.com",
  "address": "123 Nguyen Hue, District 1, HCMC",
  "status": "ACTIVE"
}
```

#### 3.8. Cập nhật cơ sở kho
- **Method**: `PATCH`
- **Endpoint**: `/facilities/:id`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`

---

### 📦 NHÓM 3: STORAGE UNIT TYPES / LOẠI KHO

#### 3.9. Lấy danh sách loại kho
- **Method**: `GET`
- **Endpoint**: `/storage-unit-types` hoặc `/storage-unit-types?facilityId=1`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**
- **Query Params**: `facilityId` (optional - lọc theo cơ sở)

**Response Success (`200 OK`):**
```json
[
  {
    "id": 1,
    "facilityId": 1,
    "name": "Small Unit (2.5m2)",
    "code": "TYPE_S",
    "description": "Perfect for boxes and luggage",
    "size": "2.50",
    "sizeUnit": "m2",
    "depositAmount": "500000.00",
    "status": "ACTIVE",
    "facility": {
      "id": 1,
      "name": "Self Storage Facility Alpha",
      "code": "FAC_ALPHA"
    },
    "totalUnits": 10,
    "availableUnits": 8
  }
]
```

#### 3.10. Lấy chi tiết loại kho
- **Method**: `GET`
- **Endpoint**: `/storage-unit-types/:id`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**

#### 3.11. Tạo mới loại kho
- **Method**: `POST`
- **Endpoint**: `/storage-unit-types`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`

**Request Body:**
```json
{
  "facilityId": 1,
  "name": "Small Unit (2.5m2)",
  "code": "TYPE_S",
  "description": "Small unit",
  "size": 2.5,
  "sizeUnit": "m2",
  "depositAmount": 500000,
  "status": "ACTIVE"
}
```

#### 3.12. Cập nhật loại kho
- **Method**: `PATCH`
- **Endpoint**: `/storage-unit-types/:id`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`

---

### 🚪 NHÓM 4: STORAGE UNITS / NGĂN KHO CHI TIẾT

#### 3.13. Lấy danh sách ngăn kho (Có bộ lọc)
- **Method**: `GET`
- **Endpoint**: `/storage-units`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**
- **Query Params**:
  - `facilityId` (optional - số nguyên)
  - `unitTypeId` (optional - số nguyên)
  - `status` (optional: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `UNDER_MAINTENANCE`, `OUT_OF_SERVICE`)

**Ví dụ gọi:**
- `/storage-units?facilityId=1`
- `/storage-units?unitTypeId=2`
- `/storage-units?status=AVAILABLE`
- `/storage-units?facilityId=1&unitTypeId=2&status=AVAILABLE`

**Response Success (`200 OK`):**
```json
[
  {
    "id": 1,
    "facilityId": 1,
    "unitTypeId": 1,
    "unitNumber": "A-101",
    "floor": "1st Floor",
    "status": "AVAILABLE",
    "condition": "EXCELLENT",
    "facility": {
      "id": 1,
      "name": "Self Storage Facility Alpha",
      "code": "FAC_ALPHA"
    },
    "unitType": {
      "id": 1,
      "name": "Small Unit (2.5m2)",
      "code": "TYPE_S",
      "size": "2.50",
      "sizeUnit": "m2",
      "depositAmount": "500000.00"
    }
  }
]
```

#### 3.14. Lấy chi tiết một ngăn kho
- **Method**: `GET`
- **Endpoint**: `/storage-units/:id`
- **Yêu cầu Auth**: **Không (Public - Guest & User đều xem được)**

#### 3.15. Tạo mới ngăn kho
- **Method**: `POST`
- **Endpoint**: `/storage-units`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Quy tắc kiểm tra**:
  - `facilityId` phải tồn tại.
  - `unitTypeId` phải tồn tại.
  - **Bắt buộc `unitType.facilityId === StorageUnit.facilityId`** (loại kho phải thuộc đúng cơ sở chỉ định, nếu không trả lỗi `400 Bad Request`).
  - `unitNumber` không được trùng trong cùng 1 cơ sở (`409 Conflict`).

**Request Body:**
```json
{
  "facilityId": 1,
  "unitTypeId": 1,
  "unitNumber": "A-101",
  "floor": "1st Floor",
  "status": "AVAILABLE",
  "condition": "GOOD"
}
```

#### 3.16. Cập nhật ngăn kho
- **Method**: `PATCH`
- **Endpoint**: `/storage-units/:id`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`

---

### 📅 NHÓM 5: RESERVATIONS / ĐẶT CHỖ THUÊ KHO

#### 3.17. Kiểm tra tính khả dụng và dự toán giá kho (Check Availability)
- **Method**: `GET`
- **Endpoint**: `/reservations/availability`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Query Params**:
  - `facilityId` (bắt buộc - số nguyên)
  - `unitTypeId` (bắt buộc - số nguyên)
  - `appointmentDate` (optional - ISO Date string)
  - `rentalPeriod` (optional - số nguyên >= 1)
  - `rentalPeriodUnit` (optional: `DAYS`, `WEEKS`, `MONTHS`, `YEARS` - mặc định: `MONTHS`)
- **Ví dụ gọi**: `/reservations/availability?facilityId=1&unitTypeId=1&rentalPeriod=3`

**Response Success (`200 OK`):**
```json
{
  "facility": {
    "id": 1,
    "name": "Self Storage Facility Alpha",
    "code": "FAC_ALPHA",
    "address": "123 Nguyen Hue, District 1, HCMC",
    "phone": "0901112222",
    "email": "alpha@selfstorage.com"
  },
  "unitType": {
    "id": 1,
    "name": "Small Unit (2.5m2)",
    "code": "TYPE_S",
    "size": "2.50",
    "sizeUnit": "m2",
    "depositAmount": "500000.00"
  },
  "availableCount": 5,
  "availableUnits": [
    {
      "id": 1,
      "unitNumber": "A-101",
      "floor": "1st Floor",
      "status": "AVAILABLE",
      "condition": "GOOD"
    }
  ],
  "pricing": {
    "rentalPricePerPeriod": "1000000.00",
    "depositAmount": "500000.00",
    "estimatedTotal": "3500000.00"
  }
}
```

#### 3.18. Tạo đơn đặt chỗ mới (Create Reservation)
- **Method**: `POST`
- **Endpoint**: `/reservations`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `STORAGE_CUSTOMER`
- **Quy tắc & Cơ chế bảo vệ**:
  - `facilityId` và `unitTypeId` phải tồn tại, đang `ACTIVE` và liên kết hợp lệ với nhau.
  - `appointmentDate` phải là ngày hợp lệ và không được nằm trong quá khứ.
  - `rentalPeriod` phải là số nguyên >= 1.
  - **Chống Double Booking / Race condition**: Sử dụng `prisma.$transaction` kết hợp kiểm tra khóa nguyên tử `status: AVAILABLE -> RESERVED`.
  - Tự động sinh mã `reservationCode` duy nhất định dạng `RSV-YYYYMMDD-XXXXXX`.
  - Lấy `customerId` tự động từ `@CurrentUser()`, cấm truyền `customerId` qua body.

**Request Body:**
```json
{
  "facilityId": 1,
  "unitTypeId": 1,
  "appointmentDate": "2026-10-01T09:00:00.000Z",
  "rentalPeriod": 3,
  "rentalPeriodUnit": "MONTHS",
  "notes": "Cần kiểm tra kho trước khi nhận"
}
```

**Response Success (`201 Created`):**
```json
{
  "id": 1,
  "reservationCode": "RSV-20260918-A1B2C3",
  "customerId": 5,
  "facilityId": 1,
  "rentalPeriod": 3,
  "rentalPeriodUnit": "MONTHS",
  "appointmentDate": "2026-10-01T09:00:00.000Z",
  "status": "PENDING",
  "totalAmount": "3500000.00",
  "createdAt": "2026-09-18T18:40:00.000Z",
  "updatedAt": "2026-09-18T18:40:00.000Z",
  "facility": {
    "id": 1,
    "name": "Self Storage Facility Alpha",
    "code": "FAC_ALPHA",
    "address": "123 Nguyen Hue, District 1, HCMC"
  },
  "items": [
    {
      "id": 1,
      "reservationId": 1,
      "unitTypeId": 1,
      "unitId": 1,
      "price": "1000000.00",
      "depositAmount": "500000.00",
      "unitType": {
        "id": 1,
        "name": "Small Unit (2.5m2)",
        "code": "TYPE_S",
        "size": "2.50",
        "sizeUnit": "m2",
        "depositAmount": "500000.00"
      },
      "unit": {
        "id": 1,
        "unitNumber": "A-101",
        "floor": "1st Floor",
        "status": "RESERVED"
      }
    }
  ],
  "customer": {
    "id": 5,
    "fullName": "Nguyễn Văn Khách Hàng",
    "email": "customer@selfstorage.com",
    "phone": "0900000005"
  }
}
```

#### 3.19. Lấy danh sách đơn đặt chỗ (Get Reservations List)
- **Method**: `GET`
- **Endpoint**: `/reservations`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Phân quyền (Ownership & RBAC)**:
  - Khách hàng (`STORAGE_CUSTOMER`): **Chỉ xem được danh sách đơn của chính mình**.
  - Nhân viên / Quản lý / Admin: Được xem toàn bộ đơn, có thể lọc theo `customerId`, `facilityId`, `status`.
- **Query Params**:
  - `page` (optional - mặc định: 1)
  - `limit` (optional - mặc định: 10)
  - `status` (optional: `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `EXPIRED`)
  - `facilityId` (optional - dành cho Staff/Manager/Admin)
  - `customerId` (optional - dành cho Staff/Manager/Admin)
- **Ví dụ gọi**: `/reservations?page=1&limit=10&status=PENDING`

**Response Success (`200 OK`):**
```json
{
  "data": [
    {
      "id": 1,
      "reservationCode": "RSV-20260918-A1B2C3",
      "customerId": 5,
      "facilityId": 1,
      "rentalPeriod": 3,
      "rentalPeriodUnit": "MONTHS",
      "appointmentDate": "2026-10-01T09:00:00.000Z",
      "status": "PENDING",
      "totalAmount": "3500000.00",
      "createdAt": "2026-09-18T18:40:00.000Z",
      "facility": {
        "id": 1,
        "name": "Self Storage Facility Alpha",
        "code": "FAC_ALPHA",
        "address": "123 Nguyen Hue, District 1, HCMC"
      },
      "items": [
        {
          "unitType": {
            "id": 1,
            "name": "Small Unit (2.5m2)",
            "code": "TYPE_S"
          },
          "unit": {
            "id": 1,
            "unitNumber": "A-101",
            "floor": "1st Floor",
            "status": "RESERVED"
          }
        }
      ]
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

#### 3.20. Lấy chi tiết đơn đặt chỗ (Get Reservation Detail)
- **Method**: `GET`
- **Endpoint**: `/reservations/:id`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Phân quyền**: Customer chỉ xem được đơn của chính mình (nếu xem đơn của khách khác sẽ nhận lỗi `403 Forbidden`). Staff/Manager/Admin có quyền xem chi tiết.

#### 3.21. Cập nhật đơn đặt chỗ (Update Reservation)
- **Method**: `PATCH`
- **Endpoint**: `/reservations/:id`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Quy tắc**:
  - Không được sửa đơn đã ở trạng thái `CANCELLED`, `COMPLETED`, hoặc `EXPIRED`.
  - Nếu thay đổi `rentalPeriod`, hệ thống tự động tính toán lại `totalAmount`.
  - Cấm thay đổi các trường cố định: `customerId`, `facilityId`, `reservationCode`, `unitTypeId`.

**Request Body (chỉ truyền các trường cần đổi):**
```json
{
  "appointmentDate": "2026-10-05T14:00:00.000Z",
  "rentalPeriod": 6,
  "rentalPeriodUnit": "MONTHS"
}
```

#### 3.22. Hủy đơn đặt chỗ (Cancel Reservation)
- **Method**: `POST`
- **Endpoint**: `/reservations/:id/cancel`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Quy tắc & Cơ chế hoàn trả kho**:
  - Customer chỉ hủy được đơn của chính mình.
  - Không cho phép hủy đơn đã `CANCELLED`, `COMPLETED`, hoặc `EXPIRED`.
  - **Giải phóng kho trong Transaction**: Chuyển trạng thái kho tương ứng từ `RESERVED` trở về `AVAILABLE` ngay lập tức.
  - Cập nhật trạng thái `Reservation.status = CANCELLED`.

**Request Body (Optional):**
```json
{
  "reason": "Thay đổi kế hoạch kinh doanh"
}
```

**Response Success (`200 OK`):**
```json
{
  "id": 1,
  "reservationCode": "RSV-20260918-A1B2C3",
  "status": "CANCELLED",
  "items": [
    {
      "unit": {
        "id": 1,
        "unitNumber": "A-101",
        "status": "AVAILABLE"
      }
    }
  ]
}
```

---

## 🛠️ 4. Hướng Dẫn Kế Thừa Kiến Trúc Cho Các Dev Tiếp Theo

Khi xây dựng các module nghiệp vụ tiếp theo (Contract, Payment, Support, v.v.):

1. **Bảo vệ API yêu cầu đăng nhập**:
   ```typescript
   @UseGuards(JwtAuthGuard)
   ```
2. **Cho phép API công khai (Public)**:
   ```typescript
   @Public()
   @Get('something-public')
   ```
3. **Bảo vệ API theo Role (RBAC)**:
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
   ```
4. **Lấy User hiện tại trong Controller**:
   ```typescript
   @Get('something')
   async handleSomething(@CurrentUser() user: any) {
     const userId = user.id;
   }
   ```
5. **Truy cập Database**: Sử dụng `PrismaService` inject từ `DatabaseModule`.

