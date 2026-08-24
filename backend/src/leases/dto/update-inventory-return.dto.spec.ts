import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InventoryReturnStatus } from '@prisma/client';
import { UpdateInventoryReturnDto } from './update-inventory-return.dto';

describe('UpdateInventoryReturnDto', () => {
  it('обрезает примечание и превращает пробельную строку в null', async () => {
    const dto = plainToInstance(UpdateInventoryReturnDto, {
      returnStatus: InventoryReturnStatus.damaged,
      returnNote: '   ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.returnNote).toBeNull();
  });

  it('отклоняет сумму больше допустимого предела позиции', async () => {
    const dto = plainToInstance(UpdateInventoryReturnDto, {
      returnStatus: InventoryReturnStatus.missing,
      damageAmount: 99_999_999.99,
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'damageAmount')).toBe(true);
  });
});
