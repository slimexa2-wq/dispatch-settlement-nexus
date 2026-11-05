import { describe, it, expect, beforeEach } from 'vitest';
import {
    CommissionAuditEngine,
    AuditSubmission
} from '../src/CommissionAuditEngine';

describe('CommissionAuditEngine', () => {
    let engine: CommissionAuditEngine;

    beforeEach(() => {
        engine = new CommissionAuditEngine();
    });

    it('Rule 10: ZERO_GRAY when claimed amount is 0', () => {
        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Alice', idCard: '123456789012345678',
            month: '2023-10', claimedAmount: 0
        };

        const result = engine.audit(submission);
        expect(result.status).toBe('ZERO_GRAY');
        expect(result.auditNotes).toContain('0元暂不审核');
        // Check structural output
        expect(result.submission).toEqual(submission);
        expect(result.evidencePointer).toBe('Submission: Alice - 2023-10');
    });

    it('Rule 5B: PENDING_YELLOW on ID card mismatch (同名不同证号串号检测)', () => {
        engine.loadEmployeeRegistry([
            { name: 'Bob', idCard: 'REAL_ID_123' }
        ]);

        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Bob', idCard: 'WRONG_ID_999',
            month: '2023-10', claimedAmount: 100
        };

        const result = engine.audit(submission);
        expect(result.status).toBe('PENDING_YELLOW');
        expect(result.auditNotes).toContain('姓名匹配但身份证号不符。正确证号可能为: REAL_ID_123');
    });

    it('Rule 1A: 满6个月到期日分段计费 (Split billing by date)', () => {
        engine.loadEmployeeRegistry([{ name: 'Charlie', idCard: 'ID_CHARLIE' }]);
        // Policy drops from 20/h to 10/h mid-month (on 2023-10-15)
        engine.loadPolicies([
            {
                supplierName: 'SuppA', projectName: 'ProjA',
                employeeName: 'Charlie', idCard: 'ID_CHARLIE',
                effectiveDate: '2023-04-15', expiryDate: '2023-10-14', rate: 20, rateType: 'HOURLY'
            },
            {
                supplierName: 'SuppA', projectName: 'ProjA',
                employeeName: 'Charlie', idCard: 'ID_CHARLIE',
                effectiveDate: '2023-10-15', rate: 10, rateType: 'HOURLY'
            }
        ]);
        engine.loadAttendance([
            { employeeName: 'Charlie', idCard: 'ID_CHARLIE', date: '2023-10-14', hoursWorked: 10 }, // Rate 20 -> 200
            { employeeName: 'Charlie', idCard: 'ID_CHARLIE', date: '2023-10-15', hoursWorked: 10 }  // Rate 10 -> 100
        ]); // Total calc: 300

        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Charlie', idCard: 'ID_CHARLIE',
            month: '2023-10', claimedAmount: 300, claimedHours: 20
        };

        const result = engine.audit(submission);
        expect(result.status).toBe('PASS');
        expect(result.amountChecked).toBe('应结: 300.00元 (提报: 300元)');
        expect(result.policyChecked).toContain('分段计费适用多条政策: 20元/h, 10元/h');
    });

    it('Rule 10: 同月跨批差额计算 (Deducts prior settlements for the same month)', () => {
         engine.loadEmployeeRegistry([{ name: 'Dave', idCard: 'ID_DAVE' }]);
         engine.loadPolicies([{
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Dave', idCard: 'ID_DAVE',
            effectiveDate: '2023-01-01', rate: 20, rateType: 'HOURLY'
        }]);
        engine.loadAttendance([
            { employeeName: 'Dave', idCard: 'ID_DAVE', date: '2023-10-01', hoursWorked: 50 },
        ]); // Calc is 1000

        engine.loadPriorSettlements([
            { employeeName: 'Dave', idCard: 'ID_DAVE', settlementMonth: '2023-10', settledAmount: 400 }
        ]);

        // Prior settled is 400. New target calc is 600.
        // Claims 600. Difference is 0. PASS.
        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Dave', idCard: 'ID_DAVE',
            month: '2023-10', claimedAmount: 600, claimedHours: 50
        };

        const result = engine.audit(submission);
        expect(result.status).toBe('PASS');
        expect(result.amountChecked).toContain('应结: 600.00元');
        expect(result.auditNotes).toContain('扣除本月前批已结: 400元');
    });

    it('Rule 7: 少结不增付 - PASS when diff <= 200', () => {
        engine.loadEmployeeRegistry([{ name: 'Eve', idCard: 'ID_EVE' }]);
        engine.loadPolicies([{
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Eve', idCard: 'ID_EVE',
            effectiveDate: '2023-01-01', rate: 20, rateType: 'HOURLY'
        }]);
        engine.loadAttendance([
            { employeeName: 'Eve', idCard: 'ID_EVE', date: '2023-10-01', hoursWorked: 10 }
        ]); // Calc: 200

        // Claimed 50. Diff is -150. Abs(150) <= 200. Should PASS with note.
        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Eve', idCard: 'ID_EVE',
            month: '2023-10', claimedAmount: 50, claimedHours: 10
        };
        const result = engine.audit(submission);

        expect(result.status).toBe('PASS');
        expect(result.auditNotes).toContain('少结通过 (差额 150.00元 <= 200元)');
    });

    it('Rule 7: >200元预警 (DIFF_RED when diff > 200)', () => {
        engine.loadEmployeeRegistry([{ name: 'Frank', idCard: 'ID_FRANK' }]);
        engine.loadPolicies([{
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Frank', idCard: 'ID_FRANK',
            effectiveDate: '2023-01-01', rate: 20, rateType: 'HOURLY'
        }]);
        engine.loadAttendance([
            { employeeName: 'Frank', idCard: 'ID_FRANK', date: '2023-10-01', hoursWorked: 20 }
        ]); // Calc: 400

        // Claimed 100. Diff is -300. Abs(300) > 200. Should be RED.
        const submission: AuditSubmission = {
            supplierName: 'SuppA', projectName: 'ProjA',
            employeeName: 'Frank', idCard: 'ID_FRANK',
            month: '2023-10', claimedAmount: 100, claimedHours: 20
        };
        const result = engine.audit(submission);

        expect(result.status).toBe('DIFF_RED');
        expect(result.auditNotes).toContain('重大异常: 单笔少结 > 200元 (差额 300.00元)');
    });
});
