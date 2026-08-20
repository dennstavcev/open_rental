import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    service = new CryptoService(new ConfigService({ ENCRYPTION_KEY: KEY }));
  });

  it('encrypt→decrypt возвращает исходный текст', () => {
    const plain = 'Паспорт 1234 567890';
    const enc = service.encrypt(plain);
    expect(enc).not.toContain(plain);
    expect(service.decrypt(enc)).toBe(plain);
  });

  it('каждый шифртекст уникален (случайный IV)', () => {
    expect(service.encrypt('x')).not.toBe(service.encrypt('x'));
  });

  it('порча шифртекста → ошибка аутентификации GCM', () => {
    const enc = service.encrypt('secret');
    const tampered = Buffer.from(enc, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => service.decrypt(tampered.toString('base64'))).toThrow();
  });

  it('ключ неверной длины → ошибка', () => {
    expect(
      () => new CryptoService(new ConfigService({ ENCRYPTION_KEY: 'abcd' })),
    ).toThrow();
  });
});
