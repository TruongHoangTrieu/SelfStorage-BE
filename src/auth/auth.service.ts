import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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
}
