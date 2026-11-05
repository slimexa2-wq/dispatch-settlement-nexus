import decimal
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple, List


class GrossMarginReconcilerAuditTrace:
    def __init__(self):
        self.audit_log: List[Dict[str, Any]] = []

    def _log(self, action: str, details: Dict[str, Any]) -> None:
        """Silently logs actions for background audit trace."""
        self.audit_log.append({
            "timestamp": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "action": action,
            "details": details
        })

    def _sanitize_and_parse(self, value: Any, field_name: str) -> decimal.Decimal:
        """Sanitizes dirty data and parses to Decimal, falling back to 0 on failure."""
        original_value = value
        sanitized_value = value

        try:
            if value is None:
                sanitized_value = "0"
            elif isinstance(value, str):
                sanitized_value = value.replace(",", "").strip()
                if not sanitized_value:
                    sanitized_value = "0"
            elif isinstance(value, float):
                sanitized_value = str(value)  # Converts float to string representation to preserve precision accurately during decimal conversion

            result = decimal.Decimal(str(sanitized_value))

            # Record healing if the value was modified
            if str(original_value) != str(result) and original_value is not None:
                 self._log("DATA_HEALING", {
                     "field": field_name,
                     "original": original_value,
                     "healed": str(result)
                 })

            return result
        except (decimal.InvalidOperation, TypeError, ValueError) as e:
            self._log("PARSE_ERROR_FALLBACK", {
                "field": field_name,
                "original": original_value,
                "error": str(e),
                "fallback": "0"
            })
            return decimal.Decimal("0")

    def calculate_net_gross_margin(
        self,
        invoice_amount: Optional[Any] = 0,
        equal_pay: Optional[Any] = 0,
        return_fee: Optional[Any] = 0,
        recruitment_commission: Optional[Any] = 0
    ) -> Dict[str, Any]:
        """
        Calculates the net gross margin.
        Formula: Net Gross Margin = Invoice Amount - (Equal Pay + Return Fee + Recruitment Commission)
        Returns a clear dict with the result, while silently logging audit traces.
        """
        self.audit_log = [] # Reset trace for this calculation
        self._log("CALCULATION_START", {
            "inputs": {
                "invoice_amount": invoice_amount,
                "equal_pay": equal_pay,
                "return_fee": return_fee,
                "recruitment_commission": recruitment_commission
            }
        })

        # Sanitize and convert all inputs to Decimal
        d_invoice = self._sanitize_and_parse(invoice_amount, "invoice_amount")
        d_equal_pay = self._sanitize_and_parse(equal_pay, "equal_pay")
        d_return = self._sanitize_and_parse(return_fee, "return_fee")
        d_commission = self._sanitize_and_parse(recruitment_commission, "recruitment_commission")

        # Accounts Payable
        accounts_payable = d_equal_pay + d_return + d_commission

        # Net Gross Margin
        net_gross_margin = d_invoice - accounts_payable

        self._log("CALCULATION_END", {
            "parsed_values": {
                "invoice_amount": str(d_invoice),
                "equal_pay": str(d_equal_pay),
                "return_fee": str(d_return),
                "recruitment_commission": str(d_commission),
            },
            "intermediate": {
                "accounts_payable": str(accounts_payable)
            },
            "result": str(net_gross_margin)
        })

        return {
            "net_gross_margin": str(net_gross_margin),
            # In a production environment, audit_trace might be saved to a DB and not returned directly,
            # but for this module's requirement, we include it as an optional hidden field or property.
            "_audit_trace": self.audit_log
        }

    def reconcile_and_compare(
        self,
        expected_margin: Optional[Any] = 0,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Calculates the net gross margin and compares it against an expected margin.
        Highlights discrepancies for quick auditing.
        """
        calc_result = self.calculate_net_gross_margin(**kwargs)
        calculated_margin = decimal.Decimal(calc_result["net_gross_margin"])

        d_expected = self._sanitize_and_parse(expected_margin, "expected_margin")

        difference = calculated_margin - d_expected
        is_match = difference == decimal.Decimal("0")

        comparison_details = {
            "calculated_margin": str(calculated_margin),
            "expected_margin": str(d_expected),
            "difference": str(difference),
            "is_match": is_match
        }

        self._log("RECONCILIATION_COMPARE", comparison_details)

        result = {
            "reconciliation_result": {
                "calculated": str(calculated_margin),
                "expected": str(d_expected),
                "difference": str(difference),
                "match": is_match,
                "highlight_discrepancy": not is_match
            },
            "_audit_trace": calc_result["_audit_trace"]
        }

        return result
