import decimal
import logging
from typing import Dict, Any, Union

# Set up logging for silent audit
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
# We might not have a handler configured by default, let's ensure it doesn't crash
if not logger.handlers:
    logger.addHandler(logging.NullHandler())


class GrossMarginReconcilerIntegrationBridge:
    """
    Bridge for calculating Net Gross Margin for Dispatch Outsourcing Projects.
    Net Gross Margin = Invoice Amount (Accounts Receivable) - (Equal Pay + Return Fee + Recruitment Commission) (Accounts Payable)
    """

    SCHEMA_MAPPINGS = {
        # Mappings to new schema 'invoice_amount'
        "accounts_receivable": "invoice_amount",
        "billed_amount": "invoice_amount",
        "invoice_total": "invoice_amount",
        "receivable_amt": "invoice_amount",

        # Mappings to new schema 'equal_pay'
        "accounts_payable_equal_pay": "equal_pay",
        "worker_cost": "equal_pay",
        "pay_equal": "equal_pay",

        # Mappings to new schema 'return_fee'
        "accounts_payable_return_fee": "return_fee",
        "rebate": "return_fee",

        # Mappings to new schema 'recruitment_commission'
        "accounts_payable_commission": "recruitment_commission",
        "referral_fee": "recruitment_commission",
        "recruitment_fee": "recruitment_commission"
    }

    NEW_SCHEMA_KEYS = [
        "invoice_amount",
        "equal_pay",
        "return_fee",
        "recruitment_commission"
    ]

    def __init__(self):
        self.audit_log = []

    def _log_audit(self, message: str, context: Dict[str, Any] = None):
        """Silently record every step to backend audit log"""
        log_entry = {"message": message, "context": context or {}}
        self.audit_log.append(log_entry)
        logger.info(f"AUDIT: {message}", extra={"context": context})

    def _sanitize_and_convert(self, value: Any, key_name: str) -> decimal.Decimal:
        """Self-heal dirty data and convert to Decimal safely"""
        if value is None:
            self._log_audit(f"Null value for {key_name}, defaulting to 0.00")
            return decimal.Decimal("0.00")

        if isinstance(value, decimal.Decimal):
            # Ensure proper decimal formatting (two decimal places typically)
            # but for consistency we just ensure we return Decimal.
            # Formatting to "0.00" happens at the end or if we want exact 2 places:
            return value.quantize(decimal.Decimal("0.00"))

        if isinstance(value, (int, float)):
            try:
                # Convert float via string to avoid float precision issues
                return decimal.Decimal(str(value)).quantize(decimal.Decimal("0.00"))
            except (decimal.InvalidOperation, TypeError, ValueError):
                pass

        if isinstance(value, str):
            # Clean string
            clean_str = value.replace(",", "").replace("$", "").replace("¥", "").strip()
            if not clean_str:
                self._log_audit(f"Empty string for {key_name}, defaulting to 0.00")
                return decimal.Decimal("0.00")
            try:
                return decimal.Decimal(clean_str).quantize(decimal.Decimal("0.00"))
            except decimal.InvalidOperation:
                self._log_audit(f"Invalid string format '{value}' for {key_name}, defaulting to 0.00")
                return decimal.Decimal("0.00")

        self._log_audit(f"Unrecognized type {type(value)} for {key_name}, defaulting to 0.00")
        return decimal.Decimal("0.00")

    def _map_schema(self, data: Dict[str, Any]) -> Dict[str, decimal.Decimal]:
        """Automatically identify and map old/new schema fields"""
        mapped_data = {key: decimal.Decimal("0.00") for key in self.NEW_SCHEMA_KEYS}

        for key, value in data.items():
            normalized_key = key.lower().strip()

            # Map directly if it's already a new schema key
            if normalized_key in self.NEW_SCHEMA_KEYS:
                mapped_data[normalized_key] = self._sanitize_and_convert(value, normalized_key)
                self._log_audit(f"Mapped exact new schema field: {normalized_key}")
            # Map old schema keys to new schema
            elif normalized_key in self.SCHEMA_MAPPINGS:
                new_key = self.SCHEMA_MAPPINGS[normalized_key]
                mapped_data[new_key] = self._sanitize_and_convert(value, new_key)
                self._log_audit(f"Mapped old schema field '{key}' -> '{new_key}'")
            else:
                self._log_audit(f"Ignored unknown field: {key}")

        return mapped_data

    def process(self, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main entry point for reconciling margin.
        Zero-configuration, fault-tolerant.
        """
        if data is None:
            data = {}
            self._log_audit("Input data is None, initializing empty dict")

        if not isinstance(data, dict):
            self._log_audit(f"Invalid input type {type(data)}, expected dict. Attempting recovery to empty dict")
            data = {}

        self._log_audit("Starting gross margin reconciliation", context={"raw_input": data})

        # 1. Map Schema & Sanitize
        clean_data = self._map_schema(data)

        # 2. Calculate Net Gross Margin
        invoice_amount = clean_data["invoice_amount"]
        equal_pay = clean_data["equal_pay"]
        return_fee = clean_data["return_fee"]
        recruitment_commission = clean_data["recruitment_commission"]

        # Net Gross Margin = Invoice Amount - (Equal Pay + Return Fee + Recruitment Commission)
        accounts_payable = equal_pay + return_fee + recruitment_commission
        net_gross_margin = invoice_amount - accounts_payable

        self._log_audit("Calculation complete", context={
            "invoice_amount": str(invoice_amount),
            "accounts_payable": str(accounts_payable),
            "net_gross_margin": str(net_gross_margin)
        })

        # 3. Return clean results
        return {
            "invoice_amount": str(invoice_amount.quantize(decimal.Decimal("0.00"))),
            "equal_pay": str(equal_pay.quantize(decimal.Decimal("0.00"))),
            "return_fee": str(return_fee.quantize(decimal.Decimal("0.00"))),
            "recruitment_commission": str(recruitment_commission.quantize(decimal.Decimal("0.00"))),
            "net_gross_margin": str(net_gross_margin.quantize(decimal.Decimal("0.00")))
        }


def reconcile_margin(data: Dict[str, Any] = None) -> Dict[str, str]:
    """
    Zero-configuration wrapper for Net Gross Margin reconciliation.
    Automatically handles schema mapping, default values, data type self-healing.
    """
    bridge = GrossMarginReconcilerIntegrationBridge()
    return bridge.process(data)
