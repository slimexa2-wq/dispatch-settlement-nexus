import type { PrismaClient } from "../../generated/prisma/client.js";

export interface SettlementResult {
  supplierId: string;
  month: string;
  totalDueAmount: number;
  items: Array<{
    personId: string;
    personName: string;
    onboardDate: Date;
    offboardDate: Date | null;
    offboardReason: string | null;
    employmentDays: number;
    eligibleDays: number;
    dueAmount: number;
    status: 'eligible' | 'excluded';
    exclusionReason?: string;
  }>;
}

export interface TierPolicy {
  [days: number]: number;
}

export async function calculateSupplierSettlement(prisma: PrismaClient, supplierId: string, month: string, policy: TierPolicy): Promise<SettlementResult> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);

  // Last day of the month
  const targetEnd = new Date(year, m, 0, 23, 59, 59, 999);

  const people = await prisma.person.findMany({
    where: {
      supplierId,
      onboardDate: {
        lte: targetEnd
      }
    }
  });

  let totalDueAmount = 0;
  const items = [];

  for (const person of people) {
    if (!person.onboardDate) continue;

    const onboardStart = new Date(person.onboardDate);
    onboardStart.setHours(0, 0, 0, 0);

    const calcEnd = (person.offboardDate && person.offboardDate < targetEnd) ? person.offboardDate : targetEnd;
    const calcEndStart = new Date(calcEnd);
    calcEndStart.setHours(0, 0, 0, 0);

    // Total days from onboard to calcEnd
    const employmentDays = Math.floor((calcEndStart.getTime() - onboardStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    let isExcluded = false;
    let exclusionReason = undefined;

    if (person.offboardReason && (person.offboardReason.includes('旷工') || person.offboardReason.includes('自离'))) {
      isExcluded = true;
      exclusionReason = `存在异常离职（旷工或自离）：${person.offboardReason}`;
    }

    let dueAmount = 0;
    let eligibleDays = employmentDays;

    if (!isExcluded) {
      const targetStart = new Date(year, m - 1, 1, 0, 0, 0, 0);

      const tiers = Object.keys(policy).map(k => parseInt(k, 10)).sort((a, b) => a - b);

      for (const tier of tiers) {
         const tierDate = new Date(onboardStart.getTime() + (tier - 1) * 24 * 60 * 60 * 1000);

         if (tierDate >= targetStart && tierDate <= targetEnd) {
             if (person.offboardDate && person.offboardDate < tierDate) {
                 // left before reaching this tier
             } else {
                 dueAmount += policy[tier];
             }
         }
      }
    }

    totalDueAmount += dueAmount;

    items.push({
      personId: person.id,
      personName: person.name,
      onboardDate: person.onboardDate,
      offboardDate: person.offboardDate,
      offboardReason: person.offboardReason,
      employmentDays,
      eligibleDays,
      dueAmount,
      status: isExcluded ? 'excluded' as const : 'eligible' as const,
      exclusionReason
    });
  }

  return {
    supplierId,
    month,
    totalDueAmount,
    items,
  };
}

export function generateSettlementExport(result: SettlementResult): string {
  let csv = '人员姓名,入职时间,离职时间,离职原因,在职天数,结算金额,状态,说明\n';
  for (const item of result.items) {
    const obDate = item.onboardDate.toISOString().split('T')[0];
    const offbDate = item.offboardDate ? item.offboardDate.toISOString().split('T')[0] : '';
    const reason = (item.offboardReason || '').replace(/,/g, '，');
    const note = (item.exclusionReason || '').replace(/,/g, '，');

    csv += `${item.personName},${obDate},${offbDate},${reason},${item.employmentDays},${item.dueAmount},${item.status === 'eligible' ? '结算' : '剔除'},${note}\n`;
  }
  return csv;
}
