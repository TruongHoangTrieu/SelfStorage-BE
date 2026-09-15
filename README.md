# Self-Storage Backend API Server
**Hệ thống Quản lý và Cho thuê Kho Lưu trữ Tự phục vụ (Backend API Service)**

Repository này chứa mã nguồn **Backend API Server** cho **Hệ thống Quản lý và Cho thuê Kho Lưu trữ Tự phục vụ (Self-Storage Facility Rental and Management System)**, được xây dựng trên nền tảng **NestJS**, **TypeScript**, **PostgreSQL** và **Prisma ORM**.

---

## 1. Tổng quan dự án

Hệ thống Backend chịu trách nhiệm xử lý toàn bộ logic nghiệp vụ, quản lý dữ liệu tập trung, phân quyền truy cập đa vai trò, tích hợp cổng thanh toán trực tuyến, xử lý tác vụ nền và cung cấp RESTful API / WebSocket cho cả nền tảng **Web Client** và **Mobile Application**.

### Các luồng nghiệp vụ cốt lõi (Core Business Flows):

* **Flow 1: Quy trình đặt chỗ kho (Storage Unit Reservation Flow):**
  * Tra cứu danh sách cơ sở, loại kho, kích thước, bảng giá và tình trạng phòng trống thời gian thực.
  * Xử lý giữ chỗ (*Hold/Reserve*), ngăn chặn xung đột đặt trùng cùng một ngăn kho (*Concurrency Control*).
* **Flow 2: Quy trình Check-in và bàn giao kho (Check-in & Handover Flow):**
  * Xác thực mã QR / mã đặt chỗ khi khách hàng đến cơ sở.
  * Cấp phát mã truy cập số thông minh (*Smart Lock / Access Code*), bàn giao thẻ từ/khóa vật lý và cập nhật trạng thái kho.
* **Flow 3: Quản lý kho đang thuê (Rented Storage Unit Management Flow):**
  * Quản lý hợp đồng thuê, lịch sử ra vào, danh mục lưu trữ và thông tin ngăn kho đang hoạt động.
* **Flow 4: Quy tắc nghiệp vụ, quản lý biểu phí & theo dõi doanh thu (Business Rules & Revenue Monitoring Flow):**
  * Cấu hình chính sách giá thuê, biểu phí phụ thu, tiền cọc, chính sách hủy và hoàn tiền.
  * Tích hợp cổng thanh toán (VNPAY, MoMo, PayOS), xử lý Webhook và thống kê doanh thu toàn hệ thống.
* **Flow 5: Quản lý cơ sở kho & nhân viên (Facility & Staff Management Flow):**
  * Quản lý thông tin chi tiết từng cơ sở kho, sơ đồ ngăn kho (*Storage Layout*).
  * Phân công công việc cho nhân viên, quản lý danh sách tiếp nhận và hỗ trợ khách hàng.
* **Flow 6: Gia hạn hợp đồng & xử lý quá hạn (Storage Renewal & Overdue Handling Flow):**
  * Tự động quét hạn hợp đồng hàng ngày bằng Cron Job, gửi thông báo nhắc hạn.
  * Tự động tính phí phạt trễ hạn (*Overdue Fee*) và khóa quyền truy cập khi vi phạm thời hạn hợp đồng.
* **Flow 7: Tiếp nhận & xử lý yêu cầu sự cố (Support Request & Issue Handling Flow):**
  * Quản lý ticket hỗ trợ (mất chìa, lỗi mã vào cửa, hư hỏng thiết bị, khiếu nại thanh toán), hỗ trợ đính kèm hình ảnh và cập nhật tiến độ xử lý.

### Ma trận phân quyền 5 vai trò (Role-Based Access Control - RBAC):
1. **Storage Customer:** Tìm kiếm kho, đặt chỗ, thanh toán, quản lý kho đang thuê, gửi ticket hỗ trợ.
2. **Facility Staff:** Tra cứu check-in, bàn giao kho, kiểm tra hiện trạng lúc trả kho, xử lý sự cố on-site.
3. **Facility Manager:** Quản lý kho tại cơ sở phụ trách, phân bổ kho, giám sát hợp đồng & nhân viên, xem báo cáo cơ sở.
4. **Business Operations Manager:** Quản lý toàn bộ cơ sở, thiết lập chính sách & biểu phí toàn hệ thống, báo cáo tổng thể.
5. **System Administrator:** Quản trị tài khoản người dùng, phân quyền vai trò và giám sát Audit Logs hệ thống.

---

## 2. Công nghệ và thư viện sử dụng

### Công nghệ cốt lõi
* **Framework:** [NestJS](https://nestjs.com/) (Node.js framework theo kiến trúc Enterprise-grade Modular Architecture).
* **Ngôn ngữ:** TypeScript.
* **Cơ sở dữ liệu (Database):** PostgreSQL (Đảm bảo tính toàn vẹn dữ liệu ACID cho thanh toán và đặt chỗ).
* **ORM:** Prisma ORM (Quản lý schema, type-safe queries và migration tự động).

### Bộ nhớ đệm & Hàng đợi nền (Caching & Queue)
* **Redis:** Caching dữ liệu danh mục kho, lưu trữ blacklist token và kiểm soát rate-limiting.
* **BullMQ:** Quản lý hàng đợi nền xử lý tác vụ bất đồng bộ (gửi email, xử lý webhook, tính phí trễ hạn).

### Xác thực & Bảo mật (Auth & Security)
* **Passport.js & JWT:** Quản lý phiên làm việc với cơ chế Access Token & Refresh Token.
* **Bcrypt:** Mã hóa mật khẩu an toàn.
* **Guards & Interceptors:** Phân quyền theo vai trò (RBAC) và kiểm soát phạm vi dữ liệu theo cơ sở.
* **Helmet & CORS:** Bảo vệ API khỏi các lỗ hổng bảo mật phổ biến.

### Tài liệu API & Tác vụ định kỳ
* **Swagger / OpenAPI (`@nestjs/swagger`):** Tự động tạo giao diện tài liệu API tương tác trực quan tại `/api/docs`.
* **NestJS Schedule (`@nestjs/schedule`):** Quản lý Cron Jobs quét hợp đồng hết hạn và xử lý quá hạn định kỳ.

### Tích hợp dịch vụ bên thứ ba (Third-party Services)
* **Cổng thanh toán:** Tích hợp SDK / Webhook cho VNPAY, MoMo, PayOS.
* **Thông báo:** Firebase Cloud Messaging (FCM Push Notifications) & Nodemailer / Resend (Email).
* **Lưu trữ tệp đa phương tiện:** Cloudinary / AWS S3 (Lưu hình ảnh kho, biên bản bàn giao, ảnh sự cố).

---

## 3. Cấu trúc thư mục dự án

```text
SelfStorage-BE/
├── prisma/
│   ├── schema.prisma       # Định nghĩa Schema Cơ sở dữ liệu Prisma
│   ├── migrations/         # Lịch sử các bản migration cơ sở dữ liệu
│   └── seed.ts             # Dữ liệu khởi tạo mẫu (Roles, Admin, Facilities, Unit Types)
├── src/
│   ├── common/             # Thành phần dùng chung toàn hệ thống
│   │   ├── constants/      # Hằng số, Enum trạng thái (UnitStatus, BookingStatus, Roles)
│   │   ├── decorators/     # Custom Decorators (@CurrentUser, @Roles, @Public)
│   │   ├── filters/        # Exception Filters (HttpException, PrismaException)
│   │   ├── guards/         # Auth Guard, Roles Guard, FacilityAccess Guard
│   │   ├── interceptors/   # Logging, Transform Response Interceptors
│   │   └── pipes/          # Validation Pipes, ParseUUID Pipes
│   ├── config/             # Cấu hình hệ thống và kiểm tra biến môi trường
│   ├── database/           # Prisma Service và kết nối Database
│   ├── modules/            # Các module nghiệp vụ chính (NestJS Feature Modules)
│   │   ├── auth/           # Đăng nhập, Đăng ký, Quên mật khẩu, Refresh Token, OTP
│   │   ├── users/          # Quản lý tài khoản, phân quyền và hồ sơ cá nhân
│   │   ├── facilities/     # Quản lý danh sách cơ sở, địa điểm, cấu hình cơ sở
│   │   ├── units/          # Quản lý ngăn kho, loại kho, kích thước, trạng thái
│   │   ├── reservations/   # Đặt chỗ kho, giữ chỗ thời gian thực
│   │   ├── contracts/      # Hợp đồng thuê, check-in, bàn giao, gia hạn, trả kho
│   │   ├── payments/       # Xử lý thanh toán cọc/thuê, Webhook cổng thanh toán
│   │   ├── issues/         # Quản lý yêu cầu hỗ trợ và báo cáo sự cố tại chỗ
│   │   ├── operations/     # Cấu hình chính sách thuê, biểu phí phụ thu toàn hệ thống
│   │   ├── reports/        # Báo cáo doanh thu, tỷ lệ lấp đầy kho, xuất dữ liệu
│   │   └── notifications/  # Gửi Email và Push Notification (FCM)
│   ├── providers/          # Tích hợp dịch vụ bên ngoài (Mail, Payment, Storage, Socket)
│   │   ├── mail/           # Dịch vụ gửi Email mẫu thông báo
│   │   ├── payment/        # Bộ xử lý tích hợp cổng thanh toán
│   │   ├── socket/         # Gateway WebSocket cập nhật sự kiện thời gian thực
│   │   └── storage/        # Bộ xử lý tải ảnh lên Cloudinary / S3
│   ├── app.module.ts       # Module gốc của ứng dụng
│   └── main.ts             # Điểm khởi chạy server, cấu hình Swagger, CORS, Validation
├── .eslintrc.js            # Cấu hình ESLint
├── .gitignore              # Danh sách tệp bỏ qua khi commit Git
├── nest-cli.json           # Cấu hình NestJS CLI
├── package.json            # Danh sách dependencies và npm scripts
├── tsconfig.json           # Cấu hình TypeScript compiler
└── tsconfig.build.json     # Cấu hình build TypeScript cho production
```

---

## 4. Cài đặt môi trường

### Yêu cầu hệ thống:
* **Node.js:** Phiên bản khuyến nghị LTS `>= 20.x`.
* **PostgreSQL:** Phiên bản `>= 15.x`.
* **Redis:** Phiên bản `>= 7.x`.
* **Package Manager:** `npm` hoặc `yarn` / `pnpm`.

### Các bước cài đặt:

1. **Clone mã nguồn dự án:**
   ```bash
   git clone <URL_DỰ_ÁN>
   cd SelfStorage-BE
   ```

2. **Cài đặt các gói phụ thuộc (Dependencies):**
   ```bash
   npm install
   ```

3. **Cấu hình biến môi trường:**
   * Tạo tệp `.env` tại thư mục gốc nếu chưa có.
   * Định nghĩa các khóa cần thiết (ví dụ: `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, cổng thanh toán, dịch vụ email/FCM...).

4. **Khởi chạy Migration và khởi tạo dữ liệu mẫu:**
   ```bash
   # Đồng bộ schema vào Database
   npx prisma migrate dev --name init

   # Tạo dữ liệu ban đầu (Tài khoản mẫu, vai trò, cơ sở mẫu)
   npx prisma db seed
   ```

5. **Chạy máy chủ ở môi trường phát triển:**
   ```bash
   npm run start:dev
   ```

6. **Truy cập tài liệu API (Swagger UI):**
   ```text
   http://localhost:5000/api/docs
   ```

---

## 5. Scripts hữu ích

| Lệnh | Mô tả |
| :--- | :--- |
| `npm run start:dev` | Khởi chạy máy chủ phát triển với chế độ tự động reload (Hot-reload) |
| `npm run build` | Biên dịch toàn bộ mã nguồn sang JavaScript phục vụ Production |
| `npm run start:prod` | Khởi chạy ứng dụng ở môi trường Production |
| `npx prisma migrate dev` | Tạo và áp dụng bản migration mới vào cơ sở dữ liệu |
| `npx prisma generate` | Tạo lại Prisma Client tương ứng với `schema.prisma` |
| `npx prisma studio` | Mở giao diện trực quan quản lý dữ liệu database trên trình duyệt |
| `npx prisma db seed` | Chạy script tạo dữ liệu ban đầu |
| `npm run lint` | Kiểm tra và sửa lỗi định dạng code bằng ESLint |
| `npm run test` | Chạy Unit Tests |
| `npm run test:e2e` | Chạy End-to-End Tests |

---

## 6. Quy trình phát triển đề xuất

1. **Cập nhật mã nguồn mới nhất:**
   ```bash
   git pull origin main
   ```

2. **Tạo nhánh làm việc theo chuẩn:**
   ```bash
   git checkout -b feature/ten-tinh-nang
   # hoặc
   git checkout -b bugfix/ten-loi
   ```

3. **Quy tắc phát triển API:**
   * Luôn tạo DTO (Data Transfer Object) với `class-validator` cho tất cả Request Body & Query Params.
   * Viết `@ApiOperation` và `@ApiResponse` đầy đủ trên các Controller để Swagger tự động cập nhật tài liệu chính xác cho đội Frontend/Mobile.
   * Đảm bảo mọi thay đổi về Database đều được cập nhật qua `prisma/schema.prisma` và tạo file migration.

4. **Kiểm tra chất lượng mã nguồn trước khi commit:**
   ```bash
   npm run lint
   ```

5. **Commit với thông điệp rõ ràng:**
   ```bash
   git add .
   git commit -m "feat: mo ta ngan gon thay doi"
   ```

6. **Đẩy nhánh lên remote và tạo Pull Request (PR):**
   ```bash
   git push origin feature/ten-tinh-nang
   ```

---

## 7. Ghi chú cho thành viên dự án

* Luôn kiểm tra kỹ quyền truy cập (*Guards*) trên từng endpoint để tránh rò rỉ dữ liệu giữa các cơ sở và vai trò khác nhau.
* Khi thao tác với các giao dịch thanh toán hoặc giữ chỗ kho, luôn sử dụng Database Transaction (`prisma.$transaction`) để tránh lỗi bất đồng bộ và xung đột dữ liệu.
* Không commit file `.env` hoặc các thông tin bí mật (Secret Keys, API Keys) lên kho lưu trữ.
* Khi gặp xung đột mã nguồn (*conflict*), ưu tiên trao đổi trực tiếp với thành viên liên quan trước khi giải quyết.

---

## 8. License

Dự án phục vụ nội bộ cho **Hệ thống Quản lý và Cho thuê Kho Lưu trữ Tự phục vụ (Self-Storage)**. Vui lòng không sao chép hoặc phân phối lại mã nguồn ngoài phạm vi được cho phép bởi nhóm phát triển.