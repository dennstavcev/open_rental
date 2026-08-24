import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { trim, trimToNull } from './address-transformers';

// Частичное обновление объекта — все поля опциональны.
export class UpdatePropertyDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  street?: string | null;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  house?: string | null;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  building?: string | null;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  floor?: string | null;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  apartment?: string | null;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{1,2}:\d{1,7}:\d{1,10}$/, {
    message:
      'Кадастровый номер — четыре числа через двоеточие, например 38:36:000021:1234',
  })
  cadastralNumber?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  propertyType?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  areaSqm?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
