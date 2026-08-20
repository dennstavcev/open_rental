import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateInventoryItemDto {
  // Тип техники/предмета — свободный текст («Холодильник», «Диван»).
  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
