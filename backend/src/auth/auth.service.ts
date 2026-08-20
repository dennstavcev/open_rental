import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdatePayoutDetailsDto } from './dto/update-payout-details.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Профиль текущего пользователя. Реквизиты для перевода (ADR-0019) —
// данные аккаунта, не поля договора: в текст договора они не подставляются
// (ADR-0017), но нужны арендатору, чтобы было куда платить.
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  payoutPhone: string | null;
  payoutBankName: string | null;
  payoutNote: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      payoutPhone: user.payoutPhone,
      payoutBankName: user.payoutBankName,
      payoutNote: user.payoutNote,
    };
  }

  // Пустая строка очищает поле — иначе реквизиты было бы нельзя убрать.
  async updatePayoutDetails(
    userId: string,
    dto: UpdatePayoutDetailsDto,
  ): Promise<UserProfile> {
    const normalize = (value?: string): string | null | undefined =>
      value === undefined ? undefined : value.trim() || null;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        payoutPhone: normalize(dto.payoutPhone),
        payoutBankName: normalize(dto.payoutBankName),
        payoutNote: normalize(dto.payoutNote),
      },
    });
    return this.getProfile(userId);
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    // Email нормализуется в нижний регистр — вход не зависит от регистра.
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName,
      },
    });

    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Одинаковая ошибка для «нет юзера» и «неверный пароль», чтобы не
    // раскрывать существование email.
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    return this.issueTokens(user.id, user.email);
  }

  // Ротация: проверяем refresh-токен, отзываем старый, выдаём новую пару.
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    const matches = await argon2.verify(stored.tokenHash, refreshToken);
    if (!matches) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.verifyRefreshToken(refreshToken);
    } catch {
      // Невалидный/просроченный токен на выходе — не ошибка: считаем, что
      // сессия уже недействительна.
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email } satisfies AccessTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      },
    );

    const jti = randomUUID();
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti } satisfies RefreshTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: await argon2.hash(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return this.jwt.verify<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
  }
}
