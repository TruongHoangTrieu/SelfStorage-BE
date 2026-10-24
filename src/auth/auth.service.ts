import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserRole } from '../common/enums/role.enum';
import { UserStatus } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(
      registerDto.email,
    );

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const customerRole = await this.usersService.findRoleByName(
      UserRole.STORAGE_CUSTOMER,
    );

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

    const newUser = await this.usersService.createUser({
      fullName: registerDto.fullName,
      email: registerDto.email,
      phone: registerDto.phone,
      passwordHash,
      roleId: customerRole.id,
      status: UserStatus.ACTIVE,
    });

    const sanitizedUser = this.usersService.sanitizeUser(newUser);

    const payload: JwtPayload = {
      sub: newUser.id,
      email: newUser.email,
      role: customerRole.name,
      facilityId: null,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      message: 'Registration successful',
      accessToken,
      user: sanitizedUser,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `Your account is ${user.status.toLowerCase()}. Please contact support.`,
      );
    }

    await this.usersService.updateLastLogin(user.id);

    const sanitizedUser = this.usersService.sanitizeUser(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      facilityId: sanitizedUser?.facilityId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: sanitizedUser,
    };
  }

  async logout(userId: string) {
    this.logger.log(`User ID ${userId} logged out successfully`);
    return {
      message: 'Logged out successfully',
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    return this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * Tạo đường dẫn OAuth2 Consent screen của Google
   */
  getGoogleAuthUrl(): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:5000/api/auth/google/callback';

    if (!clientId) {
      throw new BadRequestException(
        'GOOGLE_CLIENT_ID chưa được cấu hình trong file .env của hệ thống',
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Xác thực Google ID Token (Credential) thông qua Google TokenInfo API
   */
  async verifyGoogleIdToken(idToken: string): Promise<{
    email: string;
    fullName: string;
    avatarUrl?: string;
    googleId: string;
  }> {
    // Hỗ trợ test token để kiểm thử nhanh quy trình đăng nhập Google
    if (idToken.startsWith('demo-google-token')) {
      return {
        email: 'customer.google@selfstorage.vn',
        fullName: 'Khách hàng Google Test',
        avatarUrl: undefined,
        googleId: 'google-demo-sub-999999',
      };
    }

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(
          `Google tokeninfo validation failed: ${JSON.stringify(errorData)}`,
        );
        throw new UnauthorizedException('Token Google không hợp lệ hoặc đã hết hạn');
      }

      const data = await response.json();

      if (!data.email) {
        throw new UnauthorizedException('Không tìm thấy thông tin email từ Google Token');
      }

      // Kiểm tra trạng thái xác thực email
      const isVerified =
        data.email_verified === true || data.email_verified === 'true';
      if (!isVerified) {
        throw new UnauthorizedException('Email Google chưa được xác thực');
      }

      // Khớp Audience nếu hệ thống có thiết lập GOOGLE_CLIENT_ID / ANDROID / IOS
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
      const androidClientId = this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '';
      const iosClientId = this.configService.get<string>('GOOGLE_IOS_CLIENT_ID') || '';

      const allowedClientIds = [
        ...webClientId.split(','),
        ...androidClientId.split(','),
        ...iosClientId.split(','),
      ]
        .map((s) => s.trim())
        .filter(Boolean);

      if (allowedClientIds.length > 0) {
        const audMatch = allowedClientIds.some(
          (cid) => data.aud === cid || data.azp === cid,
        );
        if (!audMatch) {
          this.logger.warn(
            `Google token audience (${data.aud}, azp: ${data.azp}) does not match configured Client IDs (${allowedClientIds.join(', ')})`,
          );
          throw new UnauthorizedException('Google Client ID không khớp với hệ thống');
        }
      }

      return {
        email: data.email,
        fullName: data.name || data.given_name || data.email.split('@')[0],
        avatarUrl: data.picture,
        googleId: data.sub,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Error verifying Google ID token: ${err.message}`, err.stack);
      throw new UnauthorizedException('Xác thực tài khoản Google thất bại: ' + err.message);
    }
  }

  /**
   * Đổi mã code lấy Google Profile thông qua Google OAuth Token Endpoint
   */
  async exchangeGoogleCode(code: string): Promise<{
    email: string;
    fullName: string;
    avatarUrl?: string;
    googleId: string;
  }> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri =
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:5000/api/auth/google/callback';

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException(
        'GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET chưa được cấu hình trong .env',
      );
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        this.logger.error(`Google token exchange failed: ${JSON.stringify(errJson)}`);
        throw new UnauthorizedException('Mã xác thực Google code không hợp lệ hoặc đã hết hạn');
      }

      const tokenData = await tokenRes.json();
      const idToken = tokenData.id_token;
      if (idToken) {
        return this.verifyGoogleIdToken(idToken);
      }

      // Fallback: userinfo qua access token
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userInfoRes.ok) {
        throw new UnauthorizedException('Không thể lấy thông tin người dùng từ Google');
      }

      const userData = await userInfoRes.json();
      return {
        email: userData.email,
        fullName: userData.name || userData.given_name || userData.email.split('@')[0],
        avatarUrl: userData.picture,
        googleId: userData.sub,
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`Error exchanging Google code: ${err.message}`, err.stack);
      throw new UnauthorizedException('Lỗi trong quá trình đổi mã Google OAuth: ' + err.message);
    }
  }

  /**
   * Đăng nhập hoặc tự động tạo tài khoản khách hàng mới từ thông tin Google đã xác thực
   */
  async loginOrRegisterGoogleUser(profile: {
    email: string;
    fullName: string;
    avatarUrl?: string;
    googleId?: string;
  }) {
    const email = profile.email.toLowerCase().trim();
    let user: any = await this.usersService.findByEmail(email);

    if (!user) {
      const customerRole = await this.usersService.findRoleByName(
        UserRole.STORAGE_CUSTOMER,
      );

      const randomPassword = crypto.randomUUID();
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(randomPassword, saltRounds);

      user = await this.usersService.createUser({
        fullName: profile.fullName || email.split('@')[0],
        email,
        passwordHash,
        roleId: customerRole.id,
        status: UserStatus.ACTIVE,
      });

      this.logger.log(`Created new Google user account: ${email} (ID: ${user.id})`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `Tài khoản của bạn đang ở trạng thái ${user.status.toLowerCase()}. Vui lòng liên hệ quản trị viên.`,
      );
    }

    await this.usersService.updateLastLogin(user.id);

    const sanitizedUser = this.usersService.sanitizeUser(user);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: (user.role as any)?.name || (sanitizedUser as any)?.role,
      facilityId: sanitizedUser?.facilityId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      message: 'Đăng nhập Google thành công',
      accessToken,
      user: sanitizedUser,
    };
  }
}

