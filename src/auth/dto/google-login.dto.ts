import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiPropertyOptional({
    description: 'Google ID token (credential) từ Google Identity Services / One Tap / Popup',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsOptional()
  @IsString()
  credential?: string;

  @ApiPropertyOptional({
    description: 'Google ID token (alias của credential)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({
    description: 'Authorization code từ Google OAuth 2.0 redirect flow',
    example: '4/0AVMBs8...',
  })
  @IsOptional()
  @IsString()
  code?: string;
}
