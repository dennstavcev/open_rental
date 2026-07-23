import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class AddLineItemDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}
