import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

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

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 5000;

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger Documentation is available at: http://localhost:${port}/api/docs`);
}
bootstrap();
