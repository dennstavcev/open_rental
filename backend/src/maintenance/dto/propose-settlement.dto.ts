import { SettlementPayer } from '@prisma/client';
import { IsEnum, IsNumber, Min } from 'class-validator';

export class ProposeSettlementDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsEnum(SettlementPayer)
  payer!: SettlementPayer;
}
