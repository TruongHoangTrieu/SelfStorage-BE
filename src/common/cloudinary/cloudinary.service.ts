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
