import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (
      cloudName &&
      cloudName !== 'your_cloud_name' &&
      apiKey &&
      apiKey !== 'your_api_key' &&
      apiSecret &&
      apiSecret !== 'your_api_secret'
    ) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`Cloudinary configured successfully for cloud: ${cloudName}`);
    } else {
      this.logger.warn(
        'Cloudinary credentials are not configured or still have placeholder values. Uploads will use mock fallback.',
      );
    }
  }

  /**
   * Upload an image file buffer to Cloudinary
   */
  async uploadImage(
    file: Express.Multer.File,
    folder = 'handovers',
  ): Promise<{ url: string; public_id: string }> {
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary not configured. Returning local/mock preview URL.');
      const base64Data = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      return {
        url: dataUri,
        public_id: `mock-handover-${Date.now()}`,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `selfstorage/${folder}`,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            this.logger.error(`Cloudinary upload failed: ${error.message}`);
            return reject(new Error(`Tải ảnh lên Cloudinary thất bại: ${error.message}`));
          }
          if (!result) {
            return reject(new Error('Không nhận được phản hồi từ Cloudinary'));
          }
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Upload CCCD image with Private/Signed URL and anti-abuse Watermark
   * Dòng watermark chéo: "SELFSTORAGE - HO SO NHAN KHO [MA DON] - [NGAY/THANG]"
   */
  async uploadCccdImage(
    file: Express.Multer.File,
    options?: {
      reservationCode?: string;
      side?: 'front' | 'back';
    },
  ): Promise<{ url: string; signedUrl: string; public_id: string; expiresAt: number }> {
    const orderCode = (options?.reservationCode || 'CHECKIN').replace(/[^a-zA-Z0-9\-_]/g, '');
    const sideText = options?.side === 'back' ? 'MAT SAU' : 'MAT TRUOC';
    const nowStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');
    const watermarkText = `SELFSTORAGE - HO SO NHAN KHO ${orderCode} - ${nowStr} - ${sideText}`;

    if (!this.isConfigured) {
      this.logger.warn('Cloudinary not configured. Returning local mock with private signed URL simulation.');
      const base64Data = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const expiresAt = Math.floor(Date.now() / 1000) + 300;
      return {
        url: dataUri,
        signedUrl: dataUri,
        public_id: `mock-cccd-${Date.now()}`,
        expiresAt,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'selfstorage/cccd',
          resource_type: 'image',
          transformation: [
            { width: 1200, crop: 'limit', quality: 'auto' },
            {
              overlay: {
                font_family: 'Arial',
                font_size: 36,
                font_weight: 'bold',
                text: watermarkText,
              },
              color: '#ffffff',
              background: '#dc2626',
              opacity: 70,
              angle: -22,
              gravity: 'center',
            },
          ],
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            this.logger.error(`Cloudinary upload CCCD failed: ${error.message}`);
            return reject(new Error(`Tải ảnh CCCD lên Cloudinary thất bại: ${error.message}`));
          }
          if (!result) {
            return reject(new Error('Không nhận được phản hồi từ Cloudinary'));
          }

          // Cấp Signed URL tạm thời có hiệu lực 5 phút (300 giây)
          const expiresAt = Math.floor(Date.now() / 1000) + 300;
          const signedUrl = this.generateSignedCccdUrl(result.public_id, 300) || result.secure_url;

          resolve({
            url: result.secure_url,
            signedUrl,
            public_id: result.public_id,
            expiresAt,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Upload CCCD image từ chuỗi Base64 (dành cho Mobile App Android/iOS & Web) kèm đóng dấu Watermark
   */
  async uploadCccdBase64(
    base64Data: string,
    options?: {
      reservationCode?: string;
      side?: 'front' | 'back';
    },
  ): Promise<{ url: string; signedUrl: string; public_id: string; expiresAt: number }> {
    const cleanBase64 = base64Data.startsWith('data:')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;

    const matches = cleanBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const mimeType = matches?.[1] || 'image/jpeg';
    const rawBase64 = matches?.[2] || base64Data;
    const buffer = Buffer.from(rawBase64, 'base64');

    const fakeFile = {
      buffer,
      mimetype: mimeType,
      originalname: `cccd_${options?.side || 'front'}_${Date.now()}.jpg`,
      size: buffer.length,
    } as Express.Multer.File;

    return this.uploadCccdImage(fakeFile, options);
  }

  /**
   * Tạo Signed URL tạm thời cho ảnh CCCD (hết hạn sau 5 phút)
   */
  generateSignedCccdUrl(publicIdOrUrl: string, expiresInSeconds = 300): string {
    if (!publicIdOrUrl) return '';
    if (!this.isConfigured) return publicIdOrUrl;
    if (publicIdOrUrl.startsWith('data:')) return publicIdOrUrl;
    if (publicIdOrUrl.startsWith('file:')) return publicIdOrUrl;

    const cleanPublicId = this.extractPublicId(publicIdOrUrl);
    if (!cleanPublicId) return publicIdOrUrl;

    try {
      const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const isAuthType = publicIdOrUrl.includes('/image/authenticated/');
      const signed = cloudinary.url(cleanPublicId, {
        type: isAuthType ? 'authenticated' : 'upload',
        sign_url: true,
        secure: true,
      });
      return `${signed}${signed.includes('?') ? '&' : '?'}expiresAt=${expiresAt}`;
    } catch (err: any) {
      this.logger.warn(`Failed to generate signed URL for ${cleanPublicId}: ${err.message}`);
      return publicIdOrUrl;
    }
  }

  /**
   * Xóa vĩnh viễn ảnh trên Cloudinary (dùng cho Auto-deletion sau 30 ngày)
   */
  async deleteImage(
    publicIdOrUrl: string,
    type: 'upload' | 'authenticated' = 'upload',
  ): Promise<boolean> {
    if (!this.isConfigured || !publicIdOrUrl) return false;
    const cleanPublicId = this.extractPublicId(publicIdOrUrl);
    if (!cleanPublicId) return false;

    try {
      const resUpload = await cloudinary.uploader.destroy(cleanPublicId, { type: 'upload' });
      if (resUpload?.result === 'ok') return true;
      const resAuth = await cloudinary.uploader.destroy(cleanPublicId, { type: 'authenticated' });
      return resAuth?.result === 'ok';
    } catch (err: any) {
      this.logger.error(`Failed to delete Cloudinary asset ${cleanPublicId}: ${err.message}`);
      return false;
    }
  }

  private extractPublicId(urlOrId: string): string {
    if (!urlOrId) return '';
    if (!urlOrId.startsWith('http')) return urlOrId;
    // Tìm public_id dạng selfstorage/cccd/...
    const match = urlOrId.match(/(selfstorage\/[^\.\?\#]+)/);
    if (match && match[1]) {
      return match[1];
    }
    const filenameMatch = urlOrId.match(/\/v\d+\/(.+?)(\.[a-zA-Z0-9]+)?(\?.*)?$/);
    if (filenameMatch && filenameMatch[1]) {
      return filenameMatch[1];
    }
    return urlOrId;
  }

  /**
   * Upload base64 string directly
   */
  async uploadBase64(
    base64String: string,
    folder = 'handovers',
  ): Promise<{ url: string; public_id: string }> {
    if (!this.isConfigured) {
      return {
        url: base64String,
        public_id: `mock-handover-${Date.now()}`,
      };
    }

    try {
      const result = await cloudinary.uploader.upload(base64String, {
        folder: `selfstorage/${folder}`,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      return {
        url: result.secure_url,
        public_id: result.public_id,
      };
    } catch (error: any) {
      this.logger.error(`Cloudinary base64 upload failed: ${error.message}`);
      throw new Error(`Tải ảnh lên Cloudinary thất bại: ${error.message}`);
    }
  }
}
