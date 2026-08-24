import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InventoryReturnStatus } from '@prisma/client';

const trimReturnNote = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class UpdateInventoryReturnDto {
  @IsEnum(InventoryReturnStatus)
  returnStatus!: InventoryReturnStatus;

  @Transform(trimReturnNote)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  returnNote?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999.99)
  damageAmount?: number | null;
}
