# 📚 SelfStorage - API Documentation & Progress Tracker

Tài liệu này ghi lại danh sách tất cả các API đã phát triển trong hệ thống Backend NestJS, định dạng request/response, cơ chế bảo vệ (Guards) và phân quyền (RBAC).

---

## 🌐 1. Thông Tin Cơ Bản (General Info)
- **Base URL**: `http://localhost:5000`
- **Content-Type**: `application/json`
- **Cơ chế xác thực**: `JWT Bearer Token`
- **Header xác thực**: `Authorization: Bearer <access_token>`

---

## 👥 2. Danh Sách Roles Trong Hệ Thống (IAM / RBAC)
1. `STORAGE_CUSTOMER`: Khách hàng thuê kho / sử dụng dịch vụ.
2. `FACILITY_STAFF`: Nhân viên vận hành tại cơ sở kho.
3. `FACILITY_MANAGER`: Quản lý cơ sở kho.
4. `BUSINESS_OPERATIONS_MANAGER`: Quản lý vận hành kinh doanh toàn hệ thống.
5. `SYSTEM_ADMINISTRATOR`: Quản trị viên hệ thống kỹ thuật cao nhất.

---

## 📋 3. Danh Sách API Đã Hoàn Thành 

### 3.1. Đăng ký khách hàng mới (Register)
- **Method**: `POST`
- **Endpoint**: `/auth/register`
- **Yêu cầu Auth**: Không (Public)
- **Quy tắc**: Tự động gán role `STORAGE_CUSTOMER`. Cấm client tự gửi role. Mật khẩu được hash an toàn qua bcrypt.

**Request Body:**
```json
{
  "fullName": "Nguyễn Văn A",
  "email": "customer@example.com",
  "phone": "0901234567",        // Không bắt buộc (Optional)
  "password": "Password123!"
}
```

**Response Success (`201 Created`):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": 1,
    "roleId": 1,
    "fullName": "Nguyễn Văn A",
    "email": "customer@example.com",
    "phone": "0901234567",
    "status": "ACTIVE",
    "lastLoginAt": null,
    "createdAt": "2026-09-16T06:00:00.000Z",
    "updatedAt": "2026-09-16T06:00:00.000Z",
    "role": "STORAGE_CUSTOMER"
  }
}
```

**Lỗi có thể trả về:**
- `400 Bad Request`: Thiếu trường bắt buộc hoặc email không đúng định dạng.
- `409 Conflict`: Email đã tồn tại trong hệ thống (`"Email is already registered"`).

---

### 3.2. Đăng nhập hệ thống (Login)
- **Method**: `POST`
- **Endpoint**: `/auth/login`
- **Yêu cầu Auth**: Không (Public)
- **Quy tắc**: So khớp mật khẩu đã hash, kiểm tra user có đang ở trạng thái `ACTIVE` hay không. Tự động cập nhật `lastLoginAt`.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "password": "Password123!"
}
```

**Response Success (`200 OK`):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "roleId": 1,
    "fullName": "Nguyễn Văn A",
    "email": "customer@example.com",
    "phone": "0901234567",
    "status": "ACTIVE",
    "lastLoginAt": "2026-09-16T06:35:00.000Z",
    "createdAt": "2026-09-16T06:00:00.000Z",
    "updatedAt": "2026-09-16T06:35:00.000Z",
    "role": "STORAGE_CUSTOMER"
  }
}
```

**Lỗi có thể trả về:**
- `400 Bad Request`: Dữ liệu đầu vào sai định dạng.
- `401 Unauthorized`: Sai email hoặc sai mật khẩu / Tài khoản đang bị `INACTIVE` hoặc `SUSPENDED`.

---

### 3.3. Lấy thông tin tài khoản hiện tại (Get Profile)
- **Method**: `GET`
- **Endpoint**: `/auth/me`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`)
- **Headers**: `Authorization: Bearer <access_token>`

**Response Success (`200 OK`):**
```json
{
  "id": 1,
  "roleId": 1,
  "fullName": "Nguyễn Văn A",
  "email": "customer@example.com",
  "phone": "0901234567",
  "status": "ACTIVE",
  "lastLoginAt": "2026-09-16T06:35:00.000Z",
  "createdAt": "2026-09-16T06:00:00.000Z",
  "updatedAt": "2026-09-16T06:35:00.000Z",
  "role": "STORAGE_CUSTOMER"
}
```

**Lỗi có thể trả về:**
- `401 Unauthorized`: Không gửi token, token giả mạo, token hết hạn, hoặc user đã bị đình chỉ.

---

### 3.4. Endpoint kiểm thử phân quyền Customer
- **Method**: `GET`
- **Endpoint**: `/auth/test/customer`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Role cho phép**: `@Roles('STORAGE_CUSTOMER')`
- **Headers**: `Authorization: Bearer <access_token>`

**Response Success (`200 OK`):**
```json
{
  "message": "Access granted to customer endpoint",
  "user": { ... }
}
```

**Lỗi có thể trả về:**
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Đăng nhập bằng role khác `STORAGE_CUSTOMER`.

---

### 3.5. Endpoint kiểm thử phân quyền Admin
- **Method**: `GET`
- **Endpoint**: `/auth/test/admin`
- **Yêu cầu Auth**: **Bắt buộc** (`JwtAuthGuard`, `RolesGuard`)
- **Role cho phép**: `@Roles('SYSTEM_ADMINISTRATOR')`
- **Headers**: `Authorization: Bearer <access_token>`

**Response Success (`200 OK`):**
```json
{
  "message": "Access granted to admin endpoint",
  "user": { ... }
}
```

**Lỗi có thể trả về:**
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Người dùng không có role `SYSTEM_ADMINISTRATOR` (ví dụ: Customer truy cập vào).

---

## 🛠️ 4. Hướng Dẫn Kế Thừa Kiến Trúc Cho Các Dev Tiếp Theo

Khi xây dựng các module nghiệp vụ tiếp theo (từ STEP 6 trở đi):

1. **Bảo vệ API yêu cầu đăng nhập**:
   ```typescript
   @UseGuards(JwtAuthGuard)
   ```
2. **Bảo vệ API theo Role (RBAC)**:
   ```typescript
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(UserRole.FACILITY_MANAGER, UserRole.SYSTEM_ADMINISTRATOR)
   ```
3. **Lấy User hiện tại trong Controller**:
   ```typescript
   @Get('something')
   async handleSomething(@CurrentUser() user: any) {
     const userId = user.id;
   }
   ```
4. **Truy cập Database**: Sử dụng `PrismaService` inject từ `DatabaseModule`.
