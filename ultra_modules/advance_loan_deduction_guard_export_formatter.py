import math
import logging

# Set up logging for audit trails
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AdvanceLoanDeductionGuard")

class AdvanceLoanDeductionGuard:
    """
    Core module to protect against over-deductions from weekly advances
    or living expenses against the actual monthly payroll.
    """

    def __init__(self):
        pass

    def _sanitize_numeric(self, value, default=0.0):
        """Silently heal dirty numeric data to zero NaN/None."""
        if value is None:
            return float(default)
        if isinstance(value, str):
            try:
                # Remove common currency/formatting symbols
                value = value.replace(",", "").replace("$", "").replace("¥", "").strip()
                val = float(value)
            except ValueError:
                return float(default)
        elif isinstance(value, (int, float)):
            val = float(value)
        else:
            return float(default)

        if math.isnan(val) or math.isinf(val):
            return float(default)

        return val

    def _sanitize_string(self, value, default=""):
        """Silently heal dirty string data."""
        if value is None:
            return default
        return str(value).strip()

    def process_payroll_deduction(self, data):
        """
        Process the payroll deductions with guard mechanisms.

        Args:
            data (dict): Worker payroll data containing:
                - worker_id: (str) Worker ID/Name
                - gross_pay: (numeric) Total earned
                - advance_loans: (numeric) Total advances/living expenses taken
                - minimum_take_home: (numeric) Minimum amount worker must take home (default 0)

        Returns:
            dict: Clean, exported net results with 0 comments/NaNs, plus a report.
        """
        # 1. Self-healing & default assignment
        raw_data = data or {}
        worker_id = self._sanitize_string(raw_data.get("worker_id"), default="Unknown_Worker")
        gross_pay = self._sanitize_numeric(raw_data.get("gross_pay"), default=0.0)
        advance_loans = self._sanitize_numeric(raw_data.get("advance_loans"), default=0.0)
        min_take_home = self._sanitize_numeric(raw_data.get("minimum_take_home"), default=0.0)

        # 2. Complex business logic & guard calculation
        # The maximum amount we can deduct is gross_pay - min_take_home
        max_deductible = max(0.0, gross_pay - min_take_home)

        # The actual deduction is the lesser of what they owe (advance_loans) and what we can deduct
        actual_deduction = min(advance_loans, max_deductible)

        # Remaining advance that couldn't be deducted this month
        remaining_loan = max(0.0, advance_loans - actual_deduction)

        # Final net pay
        net_pay = max(0.0, gross_pay - actual_deduction)

        # Audit log (hidden from frontend, only in backend logs)
        logger.info(f"AUDIT: worker={worker_id}, gross={gross_pay}, loan={advance_loans}, "
                    f"min_take_home={min_take_home}, actual_deduct={actual_deduction}, "
                    f"remaining_loan={remaining_loan}, net={net_pay}")

        # 3. Generate minimalist 3-line report
        # Line 1: Summary of pay and deductions
        # Line 2: What was actually deducted and remaining debt
        # Line 3: Final net pay to worker
        report = (
            f"【工资抵扣简报】员工: {worker_id} | 应发: {gross_pay:.2f} | 借支: {advance_loans:.2f}\n"
            f"【抵扣保护执行】本月实扣: {actual_deduction:.2f} | 顺延欠款: {remaining_loan:.2f}\n"
            f"【最终实发工资】一键实发金额: {net_pay:.2f} (已防超扣)"
        )

        # 4. Return zero configuration, 0 comments, pure exported dict
        return {
            "worker_id": worker_id,
            "gross_pay": gross_pay,
            "requested_deduction": advance_loans,
            "actual_deduction": actual_deduction,
            "remaining_loan": remaining_loan,
            "net_pay": net_pay,
            "comments": 0,
            "report_text": report
        }
