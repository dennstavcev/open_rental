import { IsIn, IsUUID } from 'class-validator';

// Клиент может помечать прочитанными только типы, для которых есть
// соответствующая поверхность интерфейса.
export const MARKABLE_TYPES = ['message_new'] as const;

export class MarkLeaseReadDto {
  @IsUUID()
  leaseId!: string;

  @IsIn(MARKABLE_TYPES)
  type!: (typeof MARKABLE_TYPES)[number];
}
