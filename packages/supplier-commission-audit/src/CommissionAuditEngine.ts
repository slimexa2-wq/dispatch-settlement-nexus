import { z } from "zod";

// --- Schema Definitions ---

export const CommissionPolicySchema = z.object({
  supplierName: z.string(),
  projectName: z.string(),
  employeeName: z.string(),
  idCard: z.string(),
  effectiveDate: z.string(), // ISO date string YYYY-MM-DD
  expiryDate: z.string().optional(), // ISO date string YYYY-MM-DD
  rate: z.number(), // Hourly rate or monthly flat rate
  rateType: z.enum(["HOURLY", "MONTHLY_FLAT"]),
  isSocialSecurityLinked: z.boolean().default(false),
});
export type CommissionPolicy = z.infer<typeof CommissionPolicySchema>;

export const AttendanceRecordSchema = z.object({
    employeeName: z.string(),
    idCard: z.string(),
    date: z.string(), // ISO date string YYYY-MM-DD
    hoursWorked: z.number(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

export const PriorSettlementSchema = z.object({
    employeeName: z.string(),
    idCard: z.string(),
    settlementMonth: z.string(), // YYYY-MM
    settledAmount: z.number(),
    settledHours: z.number().optional(),
});
export type PriorSettlement = z.infer<typeof PriorSettlementSchema>;

export const AuditSubmissionSchema = z.object({
  supplierName: z.string(),
  projectName: z.string(),
  employeeName: z.string(),
  idCard: z.string(),
  month: z.string(), // YYYY-MM
  claimedAmount: z.number(),
  claimedHours: z.number().optional(), // Expected for hourly
  isNewEntry: z.boolean().default(false), // For Rule 3A
});
export type AuditSubmission = z.infer<typeof AuditSubmissionSchema>;

// The 6 columns required by the roadmap
export const AuditResultSchema = z.object({
  submission: AuditSubmissionSchema,
  status: z.enum(["PASS", "DIFF_RED", "PENDING_YELLOW", "PARTIAL_PENDING", "ZERO_GRAY"]), // 6. 审核结果
  hoursChecked: z.string(), // 1. 工时/天数核对
  policyChecked: z.string(), // 2. 政策核对
  amountChecked: z.string(), // 3. 金额核对
  evidencePointer: z.string(), // 4. 原始数据依据
  auditNotes: z.string(), // 5. 审核说明
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

export class CommissionAuditEngine {
    private policies: CommissionPolicy[] = [];
    private attendance: AttendanceRecord[] = [];
    private priorSettlements: PriorSettlement[] = [];
    private allEmployees: {name: string, idCard: string}[] = [];

    constructor() {}

    public loadPolicies(policies: CommissionPolicy[]) {
        this.policies = policies;
    }

    public loadAttendance(records: AttendanceRecord[]) {
        this.attendance = records;
    }

    public loadPriorSettlements(settlements: PriorSettlement[]) {
        this.priorSettlements = settlements;
    }

    public loadEmployeeRegistry(registry: {name: string, idCard: string}[]) {
        this.allEmployees = registry;
    }

    public audit(submission: AuditSubmission): AuditResult {
        const result: AuditResult = {
            submission,
            status: "PASS",
            hoursChecked: "N/A",
            policyChecked: "N/A",
            amountChecked: "N/A",
            evidencePointer: `Submission: ${submission.employeeName} - ${submission.month}`,
            auditNotes: "",
        };

        if (submission.claimedAmount === 0) {
             result.status = "ZERO_GRAY";
             result.auditNotes = "0元暂不审核";
             return result;
        }

        // Rule 5B: 同名不同证号串号检测
        const matchingNameEmployees = this.allEmployees.filter(e => e.name === submission.employeeName);
        if (matchingNameEmployees.length > 0) {
            const exactMatch = matchingNameEmployees.find(e => e.idCard === submission.idCard);
            if (!exactMatch) {
                result.status = "PENDING_YELLOW";
                result.auditNotes = `待核实: 姓名匹配但身份证号不符。正确证号可能为: ${matchingNameEmployees.map(e => e.idCard).join(", ")}`;
                return result;
            }
        }

        // Find applicable policies overlapping with the submission month
        const monthPrefix = submission.month;
        const applicablePolicies = this.policies.filter(p =>
            p.employeeName === submission.employeeName &&
            p.idCard === submission.idCard &&
            p.supplierName === submission.supplierName &&
            p.projectName === submission.projectName &&
            (p.effectiveDate.startsWith(monthPrefix) || p.effectiveDate < monthPrefix + '-31') &&
            (!p.expiryDate || p.expiryDate >= monthPrefix + '-01')
        );

        if (applicablePolicies.length === 0) {
             result.status = "DIFF_RED";
             result.auditNotes = "未找到适用的提成政策";
             result.policyChecked = "无匹配政策";
             return result;
        }

        let calculatedAmount = 0;
        let auditNotes = "";
        let hoursNote = "";
        let policyNote = "";

        const isHourly = applicablePolicies.some(p => p.rateType === "HOURLY");

        if (isHourly) {
            // Rule 1A: 满6个月降档分段计费 (split billing by date)
            const monthlyAttendance = this.attendance.filter(a =>
                a.employeeName === submission.employeeName &&
                a.idCard === submission.idCard &&
                a.date.startsWith(submission.month)
            );

            let totalHours = 0;
            let dailyCalcNotes = [];

            for (const record of monthlyAttendance) {
                totalHours += record.hoursWorked;
                // Find policy active on this specific date
                const activePolicy = applicablePolicies.find(p =>
                    p.effectiveDate <= record.date &&
                    (!p.expiryDate || p.expiryDate >= record.date)
                );

                if (activePolicy) {
                    calculatedAmount += record.hoursWorked * activePolicy.rate;
                } else {
                    dailyCalcNotes.push(`${record.date}无政策`);
                }
            }

            if (applicablePolicies.length > 1) {
                policyNote = `分段计费适用多条政策: ${applicablePolicies.map(p => p.rate + '元/h').join(', ')}`;
            } else if (applicablePolicies[0]) {
                policyNote = `单价: ${applicablePolicies[0].rate}元/h`;
            }

            hoursNote = `系统考勤累计: ${totalHours}小时`;

            // Rule 6A
            if (totalHours === 0 && submission.claimedHours && submission.claimedHours > 0) {
                result.status = "PENDING_YELLOW";
                result.auditNotes = "待核实: 月结考勤表无记录，需核验日结或打卡记录";
                return result;
            }

            if (submission.claimedHours && Math.abs(totalHours - submission.claimedHours) > 0.01) {
                 auditNotes += `工时差异: 提报 ${submission.claimedHours} vs 系统 ${totalHours}。`;
            }

        } else {
            // MONTHLY_FLAT
            const policy = applicablePolicies[0];
            if (policy) {
                calculatedAmount = policy.rate;
                policyNote = `月度定额: ${policy.rate}元/月`;

                // Rule 2
                if (policy.isSocialSecurityLinked && submission.claimedAmount === policy.rate) {
                     const monthParts = submission.month.split('-');
                     if (monthParts.length >= 2) {
                         const daysInMonth = new Date(parseInt(monthParts[0]!), parseInt(monthParts[1]!), 0).getDate();
                         const attendedDays = new Set(this.attendance
                            .filter(a => a.employeeName === submission.employeeName && a.date.startsWith(submission.month))
                            .map(a => a.date)
                         ).size;

                         if (attendedDays < daysInMonth / 2) {
                             result.status = "PENDING_YELLOW";
                             auditNotes += "待核实: 社保挂钩定额不满月却全额提报。";
                         }
                     }
                }
            }
            hoursNote = "定额无需工时";
        }

        result.hoursChecked = hoursNote;
        result.policyChecked = policyNote;

        // Rule 10: 同月跨批次提报查重与差额补结
        const priorSettledForMonth = this.priorSettlements
            .filter(ps => ps.employeeName === submission.employeeName && ps.idCard === submission.idCard && ps.settlementMonth === submission.month)
            .reduce((sum, ps) => sum + ps.settledAmount, 0);

        if (priorSettledForMonth > 0) {
             calculatedAmount = Math.max(0, calculatedAmount - priorSettledForMonth);
             auditNotes += `扣除本月前批已结: ${priorSettledForMonth}元。`;
        }

        result.amountChecked = `应结: ${calculatedAmount.toFixed(2)}元 (提报: ${submission.claimedAmount}元)`;

        const diff = submission.claimedAmount - calculatedAmount;

        // Rule 7: “少结不增付”前提与 >200元 异常预警
        if (diff > 0) {
             result.status = "DIFF_RED";
             auditNotes += `多提报金额: ${diff.toFixed(2)}元。`;
        } else if (diff < 0) {
             if (Math.abs(diff) <= 200) {
                  auditNotes += `少结通过 (差额 ${Math.abs(diff).toFixed(2)}元 <= 200元)。`;
             } else {
                  result.status = "DIFF_RED";
                  auditNotes += `重大异常: 单笔少结 > 200元 (差额 ${Math.abs(diff).toFixed(2)}元)。`;
             }
        }

        result.auditNotes = (auditNotes || "审核通过").trim();
        return result;
    }

    public auditBatch(submissions: AuditSubmission[]): AuditResult[] {
        return submissions.map(sub => this.audit(sub));
    }
}
