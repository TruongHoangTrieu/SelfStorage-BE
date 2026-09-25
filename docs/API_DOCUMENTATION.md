# SelfStorage - API Documentation

Tài liệu này ghi lại danh sách tất cả các API đã phát triển trong hệ thống Backend NestJS, định dạng request/response, cơ chế bảo vệ (Guards) và phân quyền (RBAC).

---

## 1. Thông Tin Cơ Bản (General Info)
- **Base URL**: `http://localhost:5000`
- **Swagger UI (Interactive API Docs)**: `http://localhost:5000/api/docs`
- **Content-Type**: `application/json`
- **Cơ chế xác thực**: `JWT Bearer Token`
- **Header xác thực**: `Authorization: Bearer <access_token>`

---

## 2. Danh Sách Roles & Tài Khoản Mẫu (IAM / RBAC / Test Accounts)

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

## 3. Danh Sách API Đã Hoàn Thành

### NHÓM 1: AUTHENTICATION & IAM

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
 "phone": "0909999888", // Không bắt buộc (Optional)
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

### NHÓM 2: FACILITY / CƠ SỞ KHO

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

### NHÓM 3: STORAGE UNIT TYPES / LOẠI KHO

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

### NHÓM 4: STORAGE UNITS / NGĂN KHO CHI TIẾT

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

### NHÓM 5: RESERVATIONS / ĐẶT CHỖ THUÊ KHO

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
 - `search` (optional - tìm kiếm nhanh theo SĐT, họ tên, email hoặc mã đơn `reservationCode`)
 - `phone` (optional - tìm kiếm đích danh theo số điện thoại khách hàng)
- **Ví dụ gọi**:
 - `/reservations?page=1&limit=10&status=PENDING`
 - `/reservations?search=0901234567` (Tìm theo số điện thoại hoặc mã đơn)

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

### NHÓM 5: HANDOVER & CHECK-IN / BÀN GIAO KHO (FLOW 2)

#### 3.23. Tra cứu thông tin đơn để chuẩn bị Check-in (Get Reservation For Check-in)
- **Method**: `GET`
- **Endpoint**: `/handovers/reservations/:reservationId`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_STAFF`, `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Phân quyền trạm (Staff Facility Scope)**: Nếu là `FACILITY_STAFF`, nhân viên bắt buộc phải có phân công (`StaffFacilityAssignment`) tại cơ sở của đơn đặt chỗ đó. Nếu trái cơ sở sẽ nhận `403 Forbidden`.
- **Mục đích**: Nhân viên quét mã QR hoặc nhập ID/mã đơn để kiểm tra thông tin khách hàng, cơ sở, loại kho và vị trí kho vật lý đã giữ trước khi dẫn khách đi kiểm tra thực tế.

**Response Success (`200 OK`):**
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
 "facility": {
 "id": 1,
 "name": "Self Storage Facility Alpha",
 "code": "FAC_ALPHA",
 "address": "123 Nguyen Hue, District 1, HCMC",
 "phone": "0901112222",
 "email": "alpha@selfstorage.com"
 },
 "customer": {
 "id": 5,
 "fullName": "Nguyễn Văn Khách Hàng",
 "email": "customer@selfstorage.com",
 "phone": "0900000005",
 "status": "ACTIVE"
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
 "status": "RESERVED",
 "condition": "GOOD"
 }
 }
 ],
 "rentalContract": null
}
```

#### 3.24. Thực hiện Check-in & Bàn giao kho (Perform Check-in & Handover)
- **Method**: `POST`
- **Endpoint**: `/handovers/check-in`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Roles cho phép**: `FACILITY_STAFF`, `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Quy tắc nghiệp vụ & Tính toàn vẹn (ACID Transaction)**:
 1. Sử dụng đúng `unitId` đã giữ chỗ từ `ReservationItem.unitId` (không nhận `unitId` từ client).
 2. Khóa chuyển đổi trạng thái kho vật lý: `StorageUnit.status` chuyển từ `RESERVED` ──> `OCCUPIED` (chống double check-in bằng conditional row-level update).
 3. Tính toán `startDate` và `endDate` theo chu kỳ thuê (`DAYS`, `WEEKS`, `MONTHS`, `YEARS`).
 4. Tự động sinh mã hợp đồng duy nhất `contractCode` (`CON-YYYYMMDD-XXXXXX`) và tạo `RentalContract` với trạng thái `ACTIVE`.
 5. Tạo `ContractItem` tương ứng, tự động sinh mã PIN truy cập số 6 chữ số (`accessCode`) và kích hoạt `accessCodeStatus = ACTIVE`.
 6. Lập biên bản bàn giao `HandoverRecord` (`type: CHECK_IN`, `staffId` lấy tự động từ JWT, lưu hiện trạng `condition`, ghi chú `notes`, và hình ảnh `photos`).
 7. Chuyển trạng thái đơn đặt chỗ: `Reservation.status` chuyển sang `COMPLETED`.

**Request Body:**
```json
{
 "reservationId": 1,
 "condition": "Kho sạch sẽ, không hư hỏng, khóa cửa hoạt động tốt",
 "notes": "Đã bàn giao mã PIN truy cập và hướng dẫn sử dụng cửa điện tử",
 "photos": [
 "https://storage.example.com/photos/unit-A101-checkin-1.jpg",
 "https://storage.example.com/photos/unit-A101-checkin-2.jpg"
 ]
}
```

**Response Success (`200 OK`):**
```json
{
 "message": "Check-in and handover completed successfully",
 "reservation": {
 "id": 1,
 "reservationCode": "RSV-20260918-A1B2C3",
 "status": "COMPLETED",
 "facility": {
 "id": 1,
 "name": "Self Storage Facility Alpha",
 "code": "FAC_ALPHA",
 "address": "123 Nguyen Hue, District 1, HCMC"
 },
 "customer": {
 "id": 5,
 "fullName": "Nguyễn Văn Khách Hàng",
 "email": "customer@selfstorage.com",
 "phone": "0900000005"
 }
 },
 "contract": {
 "id": 1,
 "contractCode": "CON-20260919-XYZ789",
 "status": "ACTIVE",
 "startDate": "2026-09-19T00:00:00.000Z",
 "endDate": "2026-12-19T00:00:00.000Z",
 "signedAt": "2026-09-19T12:00:00.000Z"
 },
 "contractItems": [
 {
 "id": 1,
 "unitId": 1,
 "unitNumber": "A-101",
 "rentalPrice": "1000000.00",
 "depositAmount": "500000.00",
 "accessCode": "849201",
 "accessCodeStatus": "ACTIVE",
 "status": "ACTIVE"
 }
 ],
 "handoverRecords": [
 {
 "id": 1,
 "contractItemId": 1,
 "staffId": 4,
 "type": "CHECK_IN",
 "condition": "Kho sạch sẽ, không hư hỏng, khóa cửa hoạt động tốt",
 "notes": "Đã bàn giao mã PIN truy cập và hướng dẫn sử dụng cửa điện tử",
 "inspectionDate": "2026-09-19T12:00:00.000Z"
 }
 ]
}
```

---

## 4. Flow 4: Quy Tắc Nghiệp Vụ, Biểu Phí & Thanh Toán (Business Rules & Revenue)

### 4.1. Xem danh sách chính sách hệ thống (Get Policies)
- **Method**: `GET`
- **Endpoint**: `/operations/policies?policyType=CANCELLATION&facilityId=1`
- **Auth**: Public

### 4.2. Thiết lập chính sách mới (Create Policy)
- **Method**: `POST`
- **Endpoint**: `/operations/policies`
- **Auth**: `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Body**:
```json
{
 "policyType": "CANCELLATION",
 "name": "Chính sách hoàn cọc tiêu chuẩn",
 "description": "Hoàn 100% nếu báo trước 3 ngày",
 "value": { "refund_100_days": 3, "refund_50_days": 1 },
 "valueType": "JSON",
 "effectiveFrom": "2026-01-01"
}
```

### 4.3. Quản lý danh mục phụ phí (Fee Types & Extra Charges)
- **`GET /operations/fee-types`**: Xem danh mục các loại phụ phí (Public).
- **`POST /operations/fee-types`**: Tạo loại phụ phí mới (`OPERATIONS_MANAGER`, `ADMIN`).
- **`POST /operations/extra-charges`**: Ghi nhận phụ thu cho đơn (`STAFF`, `MANAGER`, `ADMIN`).
 ```json
 {
 "contractId": 1,
 "feeTypeId": 1,
 "amount": 200000,
 "reason": "Phụ thu phí dọn dẹp vệ sinh kho bãi khi trả kho"
 }
 ```

### 4.4. Quản lý khuyến mãi & Voucher (Discounts)
- **`GET /operations/discounts`**: Danh sách voucher (`OPERATIONS_MANAGER`, `ADMIN`).
- **`POST /operations/discounts`**: Tạo voucher giảm giá (`OPERATIONS_MANAGER`, `ADMIN`).
- **`GET /operations/discounts/validate/:code`**: Kiểm tra tính hợp lệ và giá trị giảm giá của mã voucher.

### 4.5. Tích Hợp Thanh Toán & Cổng SePay (Payments & SePay Integration - Flow 1 & Flow 2)
- **`POST /payments/deposit`**: Tạo thanh toán tiền cọc cho đơn đặt chỗ (Flow 1: DEPOSIT). Trả về thông tin đơn thanh toán và VietQR URL.
  ```json
  {
    "reservationId": 1,
    "paymentMethod": "BANK_TRANSFER"
  }
  ```
- **`GET /payments/reservations/:reservationId/summary`**: Tra cứu tổng hợp thanh toán của đơn đặt chỗ (Flow 2). Kiểm tra tiền cọc đã đóng và tính toán tiền thuê còn lại cần thanh toán.
- **`POST /payments/rental`**: Tạo thanh toán tiền thuê cho giai đoạn Check-in (Flow 2: RENTAL), tránh thu trùng tiền cọc đã đóng.
- **`POST /payments/sepay/webhook`**: Webhook tiếp nhận thông báo biến động số dư từ SePay (Public, bảo mật Apikey). Tự động xác thực số tiền, đối soát mã thanh toán, và cập nhật `Payment: PAID` + `Reservation: CONFIRMED` an toàn và chống trùng lặp (Idempotent).
- **`GET /payments`**: Danh sách các giao dịch thanh toán (Khách xem của mình, Staff/Admin xem toàn bộ).
- **`GET /payments/:id`**: Chi tiết một giao dịch thanh toán.

*(Xem tài liệu chi tiết tại: [docs/payment-sepay.md](file:///d:/SelfStorage-BE/docs/payment-sepay.md))*

---


## 5. Flow 3: Quản Lý Kho Đang Thuê (Rented Storage Unit Management)

### 5.1. Xem danh sách kho đang thuê của tôi (My Active Rented Units)
- **Method**: `GET`
- **Endpoint**: `/contracts/my-contracts`
- **Auth**: `STORAGE_CUSTOMER`
- **Dữ liệu trả về**: Danh sách hợp đồng đang hiệu lực, thông tin ngăn kho (`unitNumber`, `floor`, `facility`), tình trạng mã khóa, danh mục đồ đạc cất trong kho.

### 5.2. Quản lý ổ khóa thông minh căn hộ (Smart Digital Lock)
- **`GET /contracts/:contractId/units/:unitId/smart-lock`**: Lấy thông tin ổ khóa điện tử, mã PIN mở kho của khách hàng và hướng dẫn thao tác bàn phím (`CUSTOMER`, `STAFF`, `MANAGER`, `ADMIN`).
- **`POST /contracts/:contractId/units/:unitId/smart-lock/change-pin`**: Khách hàng tự đổi mã PIN của ổ khóa thông minh (chuỗi 4 đến 8 chữ số) (`CUSTOMER`).
  ```json
  {
    "newPin": "654321"
  }
  ```
- **`POST /contracts/:contractId/units/:unitId/smart-lock/reset-pin`**: Đặt lại mã PIN ngẫu nhiên hoặc chỉ định - Master Reset PIN (`STAFF`, `MANAGER`, `ADMIN`).
  ```json
  {
    "newPin": "123456"
  }
  ```
- **`PATCH /contracts/:contractId/units/:unitId/smart-lock/status`**: Khóa / kích hoạt lại mã PIN của ổ khóa (`STAFF`, `MANAGER`, `ADMIN`).
  ```json
  {
    "status": "REVOKED"
  }
  ```
*(Lưu ý: Không sử dụng các API kết nối thiết bị IoT, hệ thống quản lý trực tiếp bằng mô hình khóa mã số thông minh căn hộ cao cấp)*

### 5.3. Quản lý danh mục đồ đạc lưu trữ trong kho (Stored Items Inventory)
- **`GET /contracts/:contractId/units/:unitId/items`**: Danh sách đồ đạc đang cất trong ngăn kho.
- **`POST /contracts/:contractId/units/:unitId/items`**: Thêm đồ đạc vào kho (`name`, `category`, `quantity`, `photoUrl`, `description`).
- **`PATCH /contracts/items/:itemId`**: Cập nhật số lượng hoặc thông tin món đồ.
- **`DELETE /contracts/items/:itemId`**: Xóa món đồ khi khách đã mang ra khỏi kho.

### 5.4. Ký và Thanh lý hợp đồng (Sign & Terminate Contract)
- **`PATCH /contracts/:id/sign`**: Khách hàng ký điện tử xác nhận hợp đồng.
- **`PATCH /contracts/:id/terminate`**: Thanh lý hợp đồng, thu hồi mã mở cửa và tự động giải phóng các ngăn kho về `AVAILABLE` (`MANAGER`, `ADMIN`).

---

## 6. Flow 5: Quản Lý Cơ Sở Kho & Nhân Viên (Facility & Staff Management)

### 6.1. Quản lý thông tin cơ sở (Facilities CRUD)
- **`GET /facilities`** (Public): Danh sách cơ sở kho kèm `totalUnits`, `availableUnits`.
- **`GET /facilities/:id`** (Public): Chi tiết cơ sở, danh sách loại kho.
- **`POST /facilities`** (`MANAGER`, `OPERATIONS_MANAGER`, `ADMIN`): Tạo cơ sở mới.
- **`PATCH /facilities/:id`** (`MANAGER`, `OPERATIONS_MANAGER`, `ADMIN`): Cập nhật cơ sở.

### 6.2. Phân công nhân viên vào cơ sở (Staff Assignment)
- **`POST /facilities/:id/staff`** (`MANAGER`, `OPERATIONS_MANAGER`, `ADMIN`): Phân công nhân viên vào cơ sở.
 ```json
 {
 "userId": 2,
 "position": "RECEPTIONIST"
 }
 ```
 *Các vị trí (`position`): `RECEPTIONIST`, `SECURITY`, `CLEANER`, `TECHNICIAN`, `SUPERVISOR`.*
- **`GET /facilities/:id/staff`** (`STAFF`, `MANAGER`, `ADMIN`): Xem danh sách nhân viên đang hoạt động tại cơ sở.
- **`GET /facilities/:id/staff?includeEnded=true`**: Bao gồm cả nhân viên đã kết thúc phân công.
- **`PATCH /facilities/staff-assignments/:assignmentId/end`** (`MANAGER`, `ADMIN`): Kết thúc phân công, ghi nhận ngày rời cơ sở.

### 6.3. Sơ đồ ngăn kho (Storage Layout)
- **`GET /facilities/:id/storage-layout`** (`STAFF`, `MANAGER`, `ADMIN`): Trả về sơ đồ ngăn kho nhóm theo tầng, tình trạng từng ngăn (AVAILABLE/OCCUPIED/RESERVED/MAINTENANCE), tỷ lệ lấp đầy (Occupancy Rate %).

### 6.4. Yêu cầu hỗ trợ tại cơ sở (Support Requests)
- **`GET /facilities/:id/support-requests`** (`STAFF`, `MANAGER`, `ADMIN`): Danh sách ticket hỗ trợ tại cơ sở.
- **`GET /facilities/:id/support-requests?status=OPEN&priority=HIGH`**: Lọc theo trạng thái và mức ưu tiên.
- **`PATCH /facilities/support-requests/:requestId/assign`** (`MANAGER`, `ADMIN`): Phân công nhân viên xử lý ticket.
 ```json
 { "staffId": 2 }
 ```

---

## 7. Flow 7: Tiếp Nhận & Xử Lý Yêu Cầu Sự Cố (Support Request & Issue Handling Flow)

### 7.1. Tạo ticket yêu cầu hỗ trợ sự cố mới (Create Support Request)
- **Method**: `POST`
- **Endpoint**: `/support/requests`
- **Auth**: `STORAGE_CUSTOMER` (hoặc các Role khác)
- **Body**:
  ```json
  {
    "facilityId": 1,
    "contractItemId": 1,
    "category": "LOST_KEY",
    "subject": "Quên mã PIN ổ khóa thông minh ngăn kho A-101",
    "description": "Tôi đã thử nhập mã PIN nhưng khóa báo sai, cần hỗ trợ cấp lại mã.",
    "priority": "HIGH",
    "photos": [
      "https://example.com/photos/lock-error.jpg"
    ]
  }
  ```
  *Phân loại sự cố (`category`):*
  - `LOST_KEY`: Mất chìa khóa / Quên mã PIN mở cửa.
  - `ACCESS_CODE`: Lỗi bàn phím / Không nhận mã vào cửa.
  - `DAMAGE`: Hư hỏng thiết bị, bản lề, trầy xước, dột nước tại ngăn kho.
  - `PAYMENT`: Khiếu nại hóa đơn, tiền cọc, sai lệch thanh toán.
  - `LOCK`: Ổ khóa thông minh kẹt cơ học / hết pin.
  - `UNIT`: Sự cố chung về ngăn kho.
  - `OTHER`: Yêu cầu hỗ trợ khác.

  *Mức độ ưu tiên (`priority`):* `LOW`, `MEDIUM`, `HIGH`, `URGENT` (mặc định `MEDIUM`).

### 7.2. Lấy danh sách yêu cầu hỗ trợ (List Support Requests)
- **Method**: `GET`
- **Endpoint**: `/support/requests`
- **Auth**: `JwtAuthGuard`
- **Phân quyền**:
  - `STORAGE_CUSTOMER`: Tự động chỉ xem được danh sách ticket của chính mình.
  - `FACILITY_STAFF`, `FACILITY_MANAGER`, `ADMIN`: Xem toàn bộ ticket của cơ sở / hệ thống.
- **Query Params**: `page`, `limit`, `facilityId`, `status`, `category`, `priority`, `search` (tìm theo mã đơn, tiêu đề, họ tên/SĐT khách hàng).
- **Ví dụ**: `/support/requests?facilityId=1&status=OPEN&category=LOST_KEY`

### 7.3. Chi tiết yêu cầu hỗ trợ & Lịch sử tiến độ (Get Ticket Details & Logs)
- **Method**: `GET`
- **Endpoint**: `/support/requests/:id`
- **Auth**: `JwtAuthGuard`
- **Dữ liệu trả về**: Thông tin ticket, danh sách ảnh đính kèm, thông tin ngăn kho, nhân viên đang phụ trách, và toàn bộ nhật ký tiến độ (`logs`) gồm thời gian, người cập nhật, trạng thái cũ -> trạng thái mới, ghi chú giải pháp.

### 7.4. Phân công nhân viên tiếp nhận ticket (Assign Staff)
- **Method**: `PATCH`
- **Endpoint**: `/support/requests/:id/assign`
- **Auth**: `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Body**:
  ```json
  {
    "staffId": 3
  }
  ```
- **Tác vụ tự động**: Chuyển trạng thái ticket sang `IN_PROGRESS` (nếu đang `OPEN`), tự động ghi bản ghi nhật ký `SupportRequestLog`.

### 7.5. Cập nhật tiến độ & trạng thái xử lý (Update Progress & Status)
- **Method**: `PATCH`
- **Endpoint**: `/support/requests/:id/progress`
- **Auth**: `FACILITY_STAFF`, `FACILITY_MANAGER`, `BUSINESS_OPERATIONS_MANAGER`, `SYSTEM_ADMINISTRATOR`
- **Body**:
  ```json
  {
    "status": "RESOLVED",
    "note": "Đã kiểm tra ổ khóa tại chỗ và thực hiện Master Reset PIN mới cho khách hàng.",
    "photos": [
      "https://example.com/photos/resolved-lock.jpg"
    ]
  }
  ```
  *Trạng thái (`status`):* `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `CANCELLED`.
- **Tác vụ tự động**: Khi trạng thái là `RESOLVED` hoặc `CLOSED`, tự động ghi nhận `resolvedAt`. Tự động lưu vết `SupportRequestLog`.

### 7.6. Trao đổi, thêm phản hồi/ghi chú vào ticket (Add Ticket Note)
- **Method**: `POST`
- **Endpoint**: `/support/requests/:id/notes`
- **Auth**: `STORAGE_CUSTOMER`, `FACILITY_STAFF`, `FACILITY_MANAGER`, `ADMIN`
- **Body**:
  ```json
  {
    "note": "Tôi đã nhận được mã PIN mới qua SMS và đã mở được kho. Cảm ơn ban quản lý."
  }
  ```

---

## 8. Hướng Dẫn Kế Thừa Kiến Trúc Cho Các Dev Tiếp Theo

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


