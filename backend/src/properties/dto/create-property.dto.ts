import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @MinLength(1)
  address!: string;

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
