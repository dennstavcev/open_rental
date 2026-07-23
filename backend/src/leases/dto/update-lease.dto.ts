import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

// Частичное обновление договора-черновика.
export class UpdateLeaseDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  paymentDay?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  penaltyRatePercentPerDay?: number;
}
