import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './storage-provider.interface';

// Локальная реализация StorageProvider (ADR-0007): файлы на диске в каталоге
// uploads. Только для localhost/тестов.
@Injectable()
export class LocalFsStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(
      config.get<string>('UPLOADS_DIR', './uploads'),
    );
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }

  getUrl(key: string): string {
    return this.resolveKey(key);
  }

  // Защита от выхода за пределы каталога uploads (path traversal).
  private resolveKey(key: string): string {
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(`Недопустимый ключ хранилища: ${key}`);
    }
    return full;
  }
}
