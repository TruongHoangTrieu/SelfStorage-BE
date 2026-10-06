import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';

export class CheckInDto {
  @IsString({ message: 'reservationId must be a string' })
  @IsNotEmpty({ message: 'reservationId is required' })
  reservationId: string;

  @IsString({ message: 'condition must be a string' })
  @IsNotEmpty({ message: 'condition is required (e.g. Unit is clean and undamaged)' })
  condition: string;

  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  notes?: string;

  @IsOptional()
  @IsArray({ message: 'photos must be an array of photo URLs or objects' })
  photos?: any[];
}
