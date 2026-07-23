// Абстракция файлового хранилища (ADR-0007). Дев/тест — LocalFsStorageProvider;
// прод (S3-совместимый) — вторая реализация того же интерфейса, вместе с
// хостингом. Модули работают только через этот интерфейс, не с диском/SDK.
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  // Идентификатор для доступа к файлу. Для локальной реализации — путь под
  // каталогом uploads; для прод-S3 позже — presigned URL.
  getUrl(key: string): string;
}
