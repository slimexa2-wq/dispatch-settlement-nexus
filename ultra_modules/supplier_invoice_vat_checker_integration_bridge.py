import re
from typing import Any, Dict, Optional, Tuple

class VATCheckerError(Exception):
    pass

def _clean_monetary_value(value: Any) -> float:
    """Silently heal dirty monetary data to a clean float."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove currency symbols, commas, and whitespace
        cleaned_str = re.sub(r'[^\d.-]', '', value)
        if not cleaned_str:
            return 0.0
        try:
            return float(cleaned_str)
        except ValueError:
            return 0.0
    return 0.0

def _map_schema(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Silently maps different naming conventions to a standard schema.
    Provides backward compatibility for older versions or external systems.
    """
    if not isinstance(input_data, dict):
        return {}

    standardized = {}

    # Map amount
    amount = input_data.get('amount')
    if amount is None:
        amount = input_data.get('totalAmount')
    if amount is None:
        amount = input_data.get('invoice_amount')
    standardized['amount'] = _clean_monetary_value(amount)

    # Map invoice type (special or ordinary)
    invoice_type = input_data.get('invoiceType')
    if invoice_type is None:
        invoice_type = input_data.get('type')
    if invoice_type is None:
        invoice_type = input_data.get('invoice_type')

    # Default to 'ordinary' if not recognized
    if isinstance(invoice_type, str):
        invoice_type = invoice_type.strip().lower()
        if 'special' in invoice_type or '专票' in invoice_type:
            standardized['invoiceType'] = 'special'
        else:
            standardized['invoiceType'] = 'ordinary'
    else:
        standardized['invoiceType'] = 'ordinary'

    # Map VAT rate
    vat_rate = input_data.get('vatRate')
    if vat_rate is None:
        vat_rate = input_data.get('taxRate')
    if vat_rate is None:
        vat_rate = input_data.get('rate')

    standardized['vatRate'] = _clean_monetary_value(vat_rate)

    # Map differential tax indicator
    is_differential = input_data.get('isDifferential')
    if is_differential is None:
        is_differential = input_data.get('differential_tax')
    if is_differential is None:
        is_differential = input_data.get('is_differential')

    if isinstance(is_differential, str):
        is_differential = is_differential.strip().lower() in ['true', 'yes', '1', '是']
    else:
        is_differential = bool(is_differential)

    standardized['isDifferential'] = is_differential

    return standardized


def calculate_vat_deduction_and_compliance(invoice_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculates VAT deduction and checks compliance based on generic invoice data.

    Returns a clean, simple result dictionary containing:
    - is_compliant: bool
    - deduction_amount: float (rounded to 2 decimal places)
    - compliance_message: str
    - standardized_data: dict (the cleaned data used for calculation)
    """
    # 1. Silently map and heal data
    std_data = _map_schema(invoice_data)

    amount = std_data['amount']
    invoice_type = std_data['invoiceType']
    vat_rate = std_data['vatRate']
    is_diff = std_data['isDifferential']

    # 2. Compliance rules and deduction logic
    is_compliant = True
    compliance_message = "Compliant"
    deduction_amount = 0.0

    if amount <= 0:
        return {
            "is_compliant": False,
            "deduction_amount": 0.0,
            "compliance_message": "Invalid amount",
            "standardized_data": std_data
        }

    # Normalize vat_rate to percentage (e.g., 0.06 or 6 -> 6)
    if vat_rate < 1.0 and vat_rate > 0.0:
        # e.g., 0.06 means 6%
        effective_rate_pct = vat_rate * 100
    else:
        effective_rate_pct = vat_rate

    # Valid rates for labor suppliers: 6%, 3%, 1%, and 5% (differential)
    valid_rates = [6.0, 3.0, 1.0, 5.0]

    # Check rate validity (with small epsilon for float comparison)
    rate_is_valid = False
    for r in valid_rates:
        if abs(effective_rate_pct - r) < 0.001:
            rate_is_valid = True
            break

    if not rate_is_valid:
        is_compliant = False
        compliance_message = f"Invalid VAT rate: {effective_rate_pct}%"
    elif is_diff and abs(effective_rate_pct - 5.0) >= 0.001:
        # If marked as differential, rate must be 5%
        is_compliant = False
        compliance_message = f"Differential tax requires 5% rate, got {effective_rate_pct}%"

    # Calculate deduction only for Special VAT Invoices and if compliant
    if is_compliant:
        if invoice_type == 'special':
            if is_diff:
                # Differential taxation deduction calculation (assuming 'amount' is tax-inclusive)
                # Deduction = Amount / (1 + 5%) * 5%
                deduction_amount = (amount / 1.05) * 0.05
            else:
                # Standard deduction
                # Deduction = Amount / (1 + rate) * rate
                rate_decimal = effective_rate_pct / 100.0
                deduction_amount = (amount / (1 + rate_decimal)) * rate_decimal
        else:
            # Ordinary invoices cannot be deducted
            deduction_amount = 0.0

    return {
        "is_compliant": is_compliant,
        "deduction_amount": round(deduction_amount, 2),
        "compliance_message": compliance_message,
        "standardized_data": std_data
    }
