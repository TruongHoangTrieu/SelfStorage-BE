import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    frontendUrl,
  ].filter(Boolean) as string[];

  // Enable CORS strictly for trusted origins with credentials
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    },
    credentials: true,
  });

  // Hardened Anti-CSRF verification middleware
  app.use((req: any, res: any, next: any) => {
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method?.toUpperCase());
    if (!isStateChanging) {
      return next();
    }

    // Exact path matching for public webhook exemption (prevent path injection bypass)
    const normalizedPath = (req.path || '').split('?')[0];
    const isPublicWebhook =
      normalizedPath === '/api/payments/sepay/webhook' ||
      normalizedPath === '/payments/sepay/webhook';
    if (isPublicWebhook) {
      return next();
    }

    // Requests carrying explicit Authorization: Bearer are explicit API clients (not browser CSRF vectors)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return next();
    }

    // Check Origin / Referer against trusted origins whitelist
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    let requestOrigin: string | null = null;
    try {
      requestOrigin = origin || (referer ? new URL(referer).origin : null);
    } catch {
      requestOrigin = null;
    }

    if (requestOrigin) {
      if (allowedOrigins.includes(requestOrigin)) {
        return next();
      }
      return res.status(403).json({
        statusCode: 403,
        message: 'Forbidden: CSRF check failed (untrusted request origin)',
      });
    }

    // If Origin/Referer is absent, verify custom anti-CSRF header (sent by legitimate fetch/XHR clients like api.ts)
    const xRequestedWith = req.headers['x-requested-with'];
    if (xRequestedWith && xRequestedWith.toLowerCase() === 'xmlhttprequest') {
      return next();
    }

    // Reject missing Origin/Referer without anti-CSRF custom header to prevent stripped-header CSRF exploits
    return res.status(403).json({
      statusCode: 403,
      message: 'Forbidden: CSRF check failed (missing Origin and anti-CSRF verification header)',
    });
  });

  // Set global prefix
  app.setGlobalPrefix('api');

  // Enable Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Setup Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('SelfStorage Management System API')
    .setDescription(
      'Tài liệu Swagger API cho hệ thống Quản lý và Cho thuê Kho tự quản (SelfStorage). Bao gồm đầy đủ các flows: IAM/Auth, Cơ sở kho, Ngăn kho, Đặt chỗ (Reservation), Bàn giao/Check-in (Handover), Hợp đồng & Khóa thông minh (Contracts & Smart Lock), Vận hành (Operations & Policies/Discounts), và Tiếp nhận xử lý sự cố (Support Requests).',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Nhập access token (Bearer Token)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Authentication & IAM', 'Quản lý tài khoản, đăng ký, đăng nhập, hồ sơ cá nhân')
    .addTag('Facilities', 'Quản lý cơ sở kho, phân công nhân viên, sơ đồ mặt bằng tầng')
    .addTag('Storage Unit Types', 'Quản lý các loại ngăn kho (kích thước, giá cọc, mô tả)')
    .addTag('Storage Units', 'Quản lý từng ngăn kho vật lý cụ thể (số phòng, tầng, trạng thái)')
    .addTag('Reservations', 'Kiểm tra phòng trống, đặt chỗ trước kho, hủy đặt chỗ')
    .addTag('Handovers & Check-In', 'Quy trình kiểm tra tiếp nhận và bàn giao kho thực tế tại quầy cho khách')
    .addTag('Contracts & Storage Management', 'Quản lý hợp đồng thuê, danh mục đồ đạc cất kho và mã PIN khóa thông minh')
    .addTag('Operations & Business Rules', 'Quản lý chính sách (Policy), biểu phí phát sinh (Fee Types/Charges), và mã giảm giá (Discounts)')
    .addTag('Support & Issue Handling', 'Quy trình tiếp nhận phản ánh, phân công kỹ thuật và xử lý sự cố')
    .addTag('Payments & SePay Integration', 'Tạo thanh toán tiền cọc/tiền thuê, sinh mã VietQR và tiếp nhận SePay Webhook tự động')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'SelfStorage API Documentation',
  });

  const port = configService.get<number>('PORT') || 5000;

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger Documentation is available at: http://localhost:${port}/api/docs`);
}
bootstrap();
