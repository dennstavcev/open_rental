import { LeaseStatus } from '@prisma/client';
import { isRetentionExpired, retentionExpiryOf } from './retention.const';

describe('срок хранения ПДн договора', () => {
  const terminatedLease = {
    status: LeaseStatus.terminated,
    endDate: new Date('2025-08-25T12:30:15.123Z'),
    effectiveEndDate: null,
  };

  it('истекает ровно в момент трёхлетней годовщины UTC', () => {
    expect(retentionExpiryOf(terminatedLease.endDate)).toEqual(
      new Date('2028-08-25T12:30:15.123Z'),
    );
    expect(
      isRetentionExpired(
        terminatedLease,
        new Date('2028-08-25T12:30:15.123Z'),
      ),
    ).toBe(true);
  });

  it('не истекает за 1 мс до годовщины', () => {
    expect(
      isRetentionExpired(
        terminatedLease,
        new Date('2028-08-25T12:30:15.122Z'),
      ),
    ).toBe(false);
  });

  it('корректно считает 28 февраля через високосный год', () => {
    expect(
      isRetentionExpired(
        {
          ...terminatedLease,
          endDate: new Date('2025-02-28T00:00:00.000Z'),
        },
        new Date('2028-02-29T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('использует effectiveEndDate раньше плановой даты окончания', () => {
    expect(
      isRetentionExpired(
        {
          ...terminatedLease,
          endDate: new Date('2029-01-01T00:00:00.000Z'),
          effectiveEndDate: new Date('2025-01-01T00:00:00.000Z'),
        },
        new Date('2028-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('активный договор никогда не считается истёкшим', () => {
    expect(
      isRetentionExpired(
        { ...terminatedLease, status: LeaseStatus.active },
        new Date('2040-01-01T00:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
