import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

// Мок Prisma: тесты не требуют реальной БД (Postgres в docker-compose).
type PrismaMock = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

const config = new ConfigService({
  JWT_ACCESS_SECRET: 'test-access',
  JWT_REFRESH_SECRET: 'test-refresh',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      config,
    );
  });

  describe('register', () => {
    it('создаёт пользователя и выдаёт пару токенов', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'a@b.ru',
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const tokens = await service.register({
        email: 'a@b.ru',
        password: 'password123',
        fullName: 'Иван',
      });

      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toBeTruthy();
      // Пароль сохраняется как argon2-хеш, не в открытом виде.
      const passedHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(passedHash).not.toBe('password123');
      expect(await argon2.verify(passedHash, 'password123')).toBe(true);
    });

    it('нормализует email в нижний регистр', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.ru' });
      prisma.refreshToken.create.mockResolvedValue({});
      await service.register({
        email: 'A@B.RU',
        password: 'password123',
        fullName: 'Иван',
      });
      expect(prisma.user.create.mock.calls[0][0].data.email).toBe('a@b.ru');
    });

    it('отклоняет дубликат email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.register({
          email: 'a@b.ru',
          password: 'password123',
          fullName: 'Иван',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('выдаёт токены при верном пароле', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.ru',
        passwordHash,
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const tokens = await service.login({
        email: 'a@b.ru',
        password: 'password123',
      });
      expect(tokens.accessToken).toBeTruthy();
    });

    it('вход не зависит от регистра email', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.ru',
        passwordHash,
      });
      prisma.refreshToken.create.mockResolvedValue({});
      await service.login({ email: 'A@B.Ru', password: 'password123' });
      expect(prisma.user.findUnique.mock.calls[0][0].where.email).toBe('a@b.ru');
    });

    it('отклоняет неверный пароль', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.ru',
        passwordHash,
      });
      await expect(
        service.login({ email: 'a@b.ru', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('отклоняет несуществующий email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@b.ru', password: 'password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('ротирует токены: отзывает старый и выдаёт новый', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.ru' });
      prisma.refreshToken.create.mockResolvedValue({});
      const { refreshToken } = await service.register({
        email: 'a@b.ru',
        password: 'password123',
        fullName: 'Иван',
      });

      const jti = prisma.refreshToken.create.mock.calls[0][0].data.id;
      const storedHash =
        prisma.refreshToken.create.mock.calls[0][0].data.tokenHash;
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: jti,
        tokenHash: storedHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.ru' });
      prisma.refreshToken.update.mockResolvedValue({});

      const tokens = await service.refresh(refreshToken);
      expect(tokens.accessToken).toBeTruthy();
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: jti },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('отклоняет отозванный refresh-токен', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.ru' });
      prisma.refreshToken.create.mockResolvedValue({});
      const { refreshToken } = await service.register({
        email: 'a@b.ru',
        password: 'password123',
        fullName: 'Иван',
      });

      const jti = prisma.refreshToken.create.mock.calls[0][0].data.id;
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: jti,
        tokenHash: 'x',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('отклоняет мусорный refresh-токен', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
