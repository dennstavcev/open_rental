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

export class CreatePropertyDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  street!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  house!: string;

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

  @IsString()
  @MinLength(1)
  propertyType!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  areaSqm?: number;

  @IsOptional()
  @IsString()
  description?: string;

  // IANA-имя таймзоны; если не задано — дефолт Europe/Moscow (на уровне БД).
  @IsOptional()
  @IsString()
  timezone?: string;
}
