import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { status: string; message: string; timestamp: string } {
    return {
      status: 'success',
      message: 'Self-Storage Facility Rental and Management System API is running',
      timestamp: new Date().toISOString(),
    };
  }
}
