import { describe, it, expect } from 'vitest';
import { calculateSupplierSettlement, generateSettlementExport, TierPolicy } from '../../src/services/dispatch-settlement-nexus/nexus';

describe('Dispatch Settlement Nexus', () => {
  it('should calculate tiered settlement correctly for a person reaching tiers', async () => {
    const prisma: any = {
      person: {
        findMany: async () => [
          {
            id: 'p1',
            name: 'Alice',
            onboardDate: new Date('2026-07-01T00:00:00Z'),
            offboardDate: null,
            offboardReason: null,
          }
        ]
      }
    };

    const policy: TierPolicy = {
      7: 100,
      15: 200,
      30: 300,
    };

    const result = await calculateSupplierSettlement(prisma, 'supplier-1', '2026-07', policy);

    expect(result.supplierId).toBe('supplier-1');
    expect(result.month).toBe('2026-07');

    // Alice onboarded 2026-07-01. Target month is 2026-07.
    // 7 days: 2026-07-07 (in target month) -> 100
    // 15 days: 2026-07-15 (in target month) -> 200
    // 30 days: 2026-07-30 (in target month) -> 300
    // Total due: 600
    expect(result.items.length).toBe(1);
    expect(result.items[0].dueAmount).toBe(600);
    expect(result.items[0].status).toBe('eligible');
  });

  it('should calculate tiered settlement correctly for a person reaching some tiers in the month', async () => {
    const prisma: any = {
      person: {
        findMany: async () => [
          {
            id: 'p2',
            name: 'Bob',
            onboardDate: new Date('2026-06-20T00:00:00Z'), // June 20th
            offboardDate: null,
            offboardReason: null,
          }
        ]
      }
    };

    const policy: TierPolicy = {
      7: 100,
      15: 200,
      30: 300,
    };

    const result = await calculateSupplierSettlement(prisma, 'supplier-1', '2026-07', policy);

    // Bob onboarded 2026-06-20
    // 7 days: 2026-06-26 (NOT in target month July)
    // 15 days: 2026-07-04 (in target month) -> 200
    // 30 days: 2026-07-19 (in target month) -> 300
    // Total due: 500
    expect(result.items[0].dueAmount).toBe(500);
  });

  it('should exclude person leaving with absentee reason', async () => {
    const prisma: any = {
      person: {
        findMany: async () => [
          {
            id: 'p3',
            name: 'Charlie',
            onboardDate: new Date('2026-07-01T00:00:00Z'),
            offboardDate: new Date('2026-07-10T00:00:00Z'),
            offboardReason: '旷工3天',
          }
        ]
      }
    };

    const policy: TierPolicy = {
      7: 100,
    };

    const result = await calculateSupplierSettlement(prisma, 'supplier-1', '2026-07', policy);

    expect(result.items[0].status).toBe('excluded');
    expect(result.items[0].dueAmount).toBe(0);
    expect(result.items[0].exclusionReason).toContain('存在异常离职（旷工或自离）');
  });

  it('should export csv correctly', async () => {
    const result = {
      supplierId: 'sup-1',
      month: '2026-07',
      totalDueAmount: 600,
      items: [
        {
          personId: 'p1',
          personName: 'Alice',
          onboardDate: new Date('2026-07-01T00:00:00Z'),
          offboardDate: null,
          offboardReason: null,
          employmentDays: 31,
          eligibleDays: 31,
          dueAmount: 600,
          status: 'eligible' as const,
        },
        {
          personId: 'p3',
          personName: 'Charlie',
          onboardDate: new Date('2026-07-01T00:00:00Z'),
          offboardDate: new Date('2026-07-10T00:00:00Z'),
          offboardReason: '多次旷工,开除',
          employmentDays: 10,
          eligibleDays: 10,
          dueAmount: 0,
          status: 'excluded' as const,
          exclusionReason: '存在异常离职（旷工或自离）：多次旷工,开除'
        }
      ]
    };

    const csv = generateSettlementExport(result);
    expect(csv).toContain('Alice,2026-07-01,,,31,600,结算,');
    expect(csv).toContain('Charlie,2026-07-01,2026-07-10,多次旷工，开除,10,0,剔除,存在异常离职（旷工或自离）：多次旷工，开除');
  });
});
