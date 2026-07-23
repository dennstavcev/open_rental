import { MeterType } from '@prisma/client';
import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateMeterDto {
  @IsEnum(MeterType)
  meterType!: MeterType;

  // Пользовательское название — различает счётчики одного типа (ГВС/ХВС,
  // день/ночь) на одном объекте.
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  tariff!: number;
}
