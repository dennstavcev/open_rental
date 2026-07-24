import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalFsStorageProvider } from './local-fs-storage.provider';

describe('LocalFsStorageProvider', () => {
  let dir: string;
  let provider: LocalFsStorageProvider;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'softrent-storage-'));
    provider = new LocalFsStorageProvider(
      new ConfigService({ UPLOADS_DIR: dir }),
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('put/get возвращает те же байты (в т.ч. во вложенном ключе)', async () => {
    const data = Buffer.from('scan-bytes');
    await provider.put('leases/l1/scan.pdf', data);
    const read = await provider.get('leases/l1/scan.pdf');
    expect(read.equals(data)).toBe(true);
  });

  it('delete удаляет файл', async () => {
    await provider.put('a/b.bin', Buffer.from('x'));
    await provider.delete('a/b.bin');
    await expect(provider.get('a/b.bin')).rejects.toThrow();
  });

  it('delete несуществующего ключа не бросает', async () => {
    await expect(provider.delete('nope.bin')).resolves.toBeUndefined();
  });

  it('отклоняет ключ с path traversal', async () => {
    await expect(
      provider.put('../escape.bin', Buffer.from('x')),
    ).rejects.toThrow(/Недопустимый ключ/);
  });
});
