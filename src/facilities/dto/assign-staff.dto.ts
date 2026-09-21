import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class AssignStaffDto {
  @IsInt()
  @IsNotEmpty()
  userId: number;

  @IsString()
  @IsNotEmpty()
  position: string; // e.g. RECEPTIONIST, SECURITY, CLEANER, TECHNICIAN
}

export class EndStaffAssignmentDto {
  @IsOptional()
  @IsDateString()
  endedAt?: string;
}
