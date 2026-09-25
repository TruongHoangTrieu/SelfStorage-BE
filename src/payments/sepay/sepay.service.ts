import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SePayWebhookPayload, PaymentQrInfo } from './sepay.interface';

@Injectable()
export class SePayService {
  private readonly logger = new Logger(SePayService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Extract payment code from SePay webhook content or code property
   * Matches patterns like: SSDEP1001A2B3, SSREN1001A2B3, or custom payment codes.
   */
  extractPaymentCode(payload: SePayWebhookPayload): string | null {
    // 1. If SePay pre-parsed code property exists
    if (payload.code && typeof payload.code === 'string' && payload.code.trim().length > 0) {
      return payload.code.trim().toUpperCase();
    }

    // 2. Extract from content using Regex: match SSDEP... or SSREN... or general code pattern
    if (payload.content) {
      const match = payload.content.match(/(SSDEP[A-Z0-9]+|SSREN[A-Z0-9]+|PAY[A-Z0-9]+)/i);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }

    return null;
  }

  /**
   * Verify webhook authorization header if SEPAY_API_KEY or SEPAY_WEBHOOK_SECRET is configured
   */
  verifyWebhookAuth(authHeader?: string): boolean {
    const expectedApiKey = this.configService.get<string>('SEPAY_API_KEY');
    const isDevOrSandbox =
      this.configService.get<string>('NODE_ENV') === 'development' ||
      this.configService.get<string>('SEPAY_ENV') === 'sandbox';

    // If no API key is configured in env, allow in dev mode with warning
    if (!expectedApiKey) {
      this.logger.warn('SEPAY_API_KEY is not configured in .env. Skipping webhook authorization check.');
      return true;
    }

    // In dev / sandbox mode, allow if SePay dashboard webhook was created with "Không xác thực"
    if (!authHeader) {
      if (isDevOrSandbox) {
        this.logger.warn(
          'Received SePay Webhook without Authorization header (Allowed in Dev/Sandbox mode).',
        );
        return true;
      }
      return false;
    }

    // Format can be "Apikey <token>" or "Bearer <token>" or raw token
    const cleanHeader = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();
    return cleanHeader === expectedApiKey.trim();
  }

  /**
   * Generate VietQR payment info and QR image URL for banking transfer
   */
  generateQrInfo(amount: number, paymentCode: string): PaymentQrInfo {
    const bankCode = this.configService.get<string>('SEPAY_BANK_CODE') || 'MBBank';
    const accountNumber = this.configService.get<string>('SEPAY_ACCOUNT_NUMBER') || '0900000000';
    const accountName = this.configService.get<string>('SEPAY_ACCOUNT_NAME') || 'SELF STORAGE SYSTEM';

    // VietQR quick chart URL template: https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png?amount=<AMOUNT>&addInfo=<CONTENT>&accountName=<NAME>
    const encodedContent = encodeURIComponent(paymentCode);
    const encodedName = encodeURIComponent(accountName);
    const qrCodeUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodedName}`;

    return {
      qrCodeUrl,
      bankCode,
      accountNumber,
      accountName,
      amount,
      transferContent: paymentCode,
    };
  }
}
