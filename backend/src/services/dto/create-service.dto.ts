import { ServiceType } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @IsOptional()
  @IsString()
  description?: string;
}
