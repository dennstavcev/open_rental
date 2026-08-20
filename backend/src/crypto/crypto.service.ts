import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Field-level шифрование ПДн (AES-256-GCM, ADR-0021). Ключ — ENCRYPTION_KEY
// (hex, 32 байта = 64 hex-символа). Формат хранения — base64(iv|tag|ciphertext).
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex = config.getOrThrow<string>('ENCRYPTION_KEY');
    this.key = Buffer.from(hex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY должен быть 32 байта (64 hex-символа)');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      'utf8',
    );
  }
}
