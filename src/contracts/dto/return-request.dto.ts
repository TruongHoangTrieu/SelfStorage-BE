import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReturnRequestDto {
  @ApiProperty({
    description: 'Ngày khách dự kiến đến bàn giao kho (ISO date hoặc DD/MM/YYYY)',
    example: '2026-11-06',
  })
  @IsNotEmpty({ message: 'returnDate is required' })
  @IsDateString({}, { message: 'returnDate must be a valid ISO date string' })
  returnDate: string;

  @ApiProperty({
    description: 'Khung giờ khách đến trả kho',
    example: '10:00 - 11:00',
  })
  @IsString({ message: 'returnTimeSlot must be a string' })
  @IsNotEmpty({ message: 'returnTimeSlot is required' })
  @Matches(/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/, {
    message: 'returnTimeSlot must follow the format "HH:mm - HH:mm"',
  })
  returnTimeSlot: string;
}
