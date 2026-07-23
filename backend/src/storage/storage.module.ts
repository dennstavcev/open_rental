import { Global, Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { LocalFsStorageProvider } from './local-fs-storage.provider';

// Глобальный модуль: STORAGE_PROVIDER доступен любому модулю (объекты,
// договоры, показания, документы). Прод-биндинг меняется здесь, без
// изменений в потребителях (ADR-0007).
@Global()
@Module({
  providers: [
    { provide: STORAGE_PROVIDER, useClass: LocalFsStorageProvider },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
