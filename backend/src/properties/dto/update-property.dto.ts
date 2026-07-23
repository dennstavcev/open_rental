import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

// Частичное обновление объекта — все поля опциональны.
export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  address?: string;

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
