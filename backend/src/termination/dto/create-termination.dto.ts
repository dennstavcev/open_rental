import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateTerminationDto {
  // Желаемая дата расторжения (не ранее чем через 30 дней).
  @IsDateString()
  requestedTerminationDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
