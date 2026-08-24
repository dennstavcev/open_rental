import { SettlementPayer } from '@prisma/client';
import { tenantShareForPayer } from './billing.util';

describe('tenantShareForPayer', () => {
  it.each([
    [SettlementPayer.tenant, 10.01],
    [SettlementPayer.split, 5.01],
    [SettlementPayer.owner, -10.01],
  ])('считает долю арендатора для %s', (payer, expected) => {
    expect(tenantShareForPayer(10.01, payer)).toBe(expected);
  });
});
