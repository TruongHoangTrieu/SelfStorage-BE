import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';

import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication & IAM')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieMaxAge(): number {
    const exp = (this.configService.get<string>('JWT_EXPIRES_IN') || '1d').trim();
    const match = exp.match(/^(\d+)([dhms]?)$/i);
    if (!match) return 24 * 60 * 60 * 1000;
    const val = parseInt(match[1], 10);
    const unit = match[2]?.toLowerCase();
    switch (unit) {
      case 'd':
        return val * 24 * 60 * 60 * 1000;
      case 'h':
        return val * 60 * 60 * 1000;
      case 'm':
        return val * 60 * 1000;
      case 's':
        return val * 1000;
      default:
        return val * 1000;
    }
  }

  private getCookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    maxAge: number;
    path: string;
    domain?: string;
  } {
    const maxAge = this.getCookieMaxAge();
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
    const configuredSameSite = this.configService.get<string>('COOKIE_SAMESITE')?.toLowerCase();
    const isProd = process.env.NODE_ENV === 'production';

    let sameSite: 'lax' | 'strict' | 'none' = 'lax';
    if (configuredSameSite === 'none' && isProd) {
      sameSite = 'none';
    } else if (configuredSameSite === 'strict') {
      sameSite = 'strict';
    }

    return {
      httpOnly: true,
      secure: isProd || sameSite === 'none',
      sameSite,
      maxAge,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  private setAuthCookie(response: Response, token: string) {
    const options = this.getCookieOptions();
    response.cookie('token', token, options);
  }

  private clearAuthCookie(response: Response) {
    const options = this.getCookieOptions();
    response.clearCookie('token', {
      ...options,
      maxAge: 0,
    });
  }

  @ApiOperation({ summary: 'Đăng ký tài khoản khách hàng mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, nhận cookie xác thực' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc email đã tồn tại' })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(registerDto);
    if (result.accessToken) {
      this.setAuthCookie(response, result.accessToken);
    }
    return {
      message: result.message,
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @ApiOperation({ summary: 'Đăng nhập hệ thống (nhận HttpOnly Cookie)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, nhận cookie và thông tin user' })
  @ApiResponse({ status: 401, description: 'Email hoặc mật khẩu không chính xác' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(loginDto);
    this.setAuthCookie(response, result.accessToken);
    return {
      message: 'Đăng nhập thành công',
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @ApiOperation({ summary: 'Đăng nhập bằng tài khoản Google (Token / Credential / Code)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập Google thành công, nhận cookie và thông tin user' })
  @ApiResponse({ status: 400, description: 'Thiếu credential hoặc mã code từ Google' })
  @ApiResponse({ status: 401, description: 'Xác thực Google thất bại' })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = googleLoginDto.credential || googleLoginDto.idToken;
    let profile: {
      email: string;
      fullName: string;
      avatarUrl?: string;
      googleId: string;
    };

    if (token) {
      profile = await this.authService.verifyGoogleIdToken(token);
    } else if (googleLoginDto.code) {
      profile = await this.authService.exchangeGoogleCode(googleLoginDto.code);
    } else {
      throw new BadRequestException(
        'Vui lòng cung cấp credential/idToken hoặc authorization code từ Google',
      );
    }

    const result = await this.authService.loginOrRegisterGoogleUser(profile);
    this.setAuthCookie(response, result.accessToken);

    return {
      message: result.message,
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @ApiOperation({ summary: 'Khởi chạy chuyển hướng đăng nhập Google OAuth 2.0' })
  @ApiResponse({ status: 302, description: 'Chuyển hướng đến Google Consent Screen' })
  @Get('google')
  async googleAuth(@Res() response: Response) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    try {
      const url = this.authService.getGoogleAuthUrl();
      return response.redirect(url);
    } catch (err: any) {
      return response.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(
          err.message || 'Chưa thể khởi tạo Google OAuth. Vui lòng cấu hình GOOGLE_CLIENT_ID trong .env',
        )}`,
      );
    }
  }

  @ApiOperation({ summary: 'Tiếp nhận chuyển hướng Callback từ Google OAuth 2.0' })
  @ApiResponse({ status: 302, description: 'Xác thực thành công và chuyển hướng về Frontend' })
  @Get('google/callback')
  async googleAuthCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res() response: Response,
  ) {
    const rawFrontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    // Clean any leading key names (e.g. FRONTEND_URL=), newlines, and trailing slashes
    const frontendUrl = rawFrontendUrl
      .replace(/^FRONTEND_URL\s*=\s*/i, '')
      .trim()
      .replace(/\/+$/, '');

    if (error) {
      return response.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(
          'Đăng nhập Google bị hủy: ' + error,
        )}`,
      );
    }

    if (!code) {
      return response.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(
          'Không nhận được mã xác thực (code) từ Google',
        )}`,
      );
    }

    try {
      const profile = await this.authService.exchangeGoogleCode(code);
      const result = await this.authService.loginOrRegisterGoogleUser(profile);
      this.setAuthCookie(response, result.accessToken);

      const encodedUser = encodeURIComponent(JSON.stringify(result.user));
      return response.redirect(
        `${frontendUrl}/auth/callback?success=true&user=${encodedUser}`,
      );
    } catch (err: any) {
      return response.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(
          err.message || 'Xác thực Google thất bại',
        )}`,
      );
    }
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy thông tin tài khoản người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Thông tin tài khoản từ JWT' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực hoặc token hết hạn' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser() user: any) {
    return user;
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân (họ tên, số điện thoại)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công, trả về thông tin user mới' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực hoặc token hết hạn' })
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, updateProfileDto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đổi mật khẩu người dùng' })
  @ApiResponse({ status: 200, description: 'Đổi mật khẩu thành công' })
  @ApiResponse({ status: 400, description: 'Mật khẩu cũ không chính xác hoặc dữ liệu không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực hoặc token hết hạn' })
  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, changePasswordDto);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.clearAuthCookie(response);
    return this.authService.logout(user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Kiểm tra quyền truy cập cho Role Customer' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STORAGE_CUSTOMER)
  @Get('test/customer')
  async testCustomerEndpoint(@CurrentUser() user: any) {
    return {
      message: 'Access granted to customer endpoint',
      user,
    };
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Kiểm tra quyền truy cập cho Role Administrator' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @Get('test/admin')
  async testAdminEndpoint(@CurrentUser() user: any) {
    return {
      message: 'Access granted to admin endpoint',
      user,
    };
  }
}
