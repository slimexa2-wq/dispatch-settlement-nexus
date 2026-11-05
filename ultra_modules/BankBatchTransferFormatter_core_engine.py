import re
from decimal import Decimal, InvalidOperation

def validate_luhn(card_number: str) -> bool:
    """
    Validate bank card number using Luhn algorithm.
    """
    card_number = str(card_number).replace(" ", "").strip()
    if not card_number or not card_number.isdigit():
        return False

    digits = [int(x) for x in card_number]
    odd_sum = sum(digits[-1::-2])
    even_digits = [d * 2 for d in digits[-2::-2]]
    even_sum = sum((d // 10) + (d % 10) for d in even_digits)
    return (odd_sum + even_sum) % 10 == 0


def format_bank_batch_transfer(records: list, bank_type: str = 'CMB', default_currency: str = 'CNY') -> dict:
    """
    Format Excel records into bank-specific batch transfer standard format.

    Args:
        records: List of dictionaries representing Excel rows.
        bank_type: The bank type (e.g., 'CMB', 'ICBC', 'CCB'). Default is 'CMB'.
        default_currency: Default currency code. Default is 'CNY'.

    Returns:
        dict: Formatting results including 'success_records', 'failed_records', and 'summary'.
    """
    if not isinstance(records, list):
        return {"error": "Invalid input: records must be a list"}

    bank_type = bank_type.upper()
    valid_banks = ['CMB', 'ICBC', 'CCB']
    if bank_type not in valid_banks:
        bank_type = 'CMB' # Default fallback for invalid bank type

    success_records = []
    failed_records = []

    for row in records:
        if not isinstance(row, dict):
            failed_records.append({
                "original_row": row,
                "error": "Record is not a dictionary"
            })
            continue

        # Extract fields with zero-configuration fallback
        account_name = str(row.get('account_name') or row.get('name') or '').strip()
        account_number = str(row.get('account_number') or row.get('card_number') or '').strip()
        amount_raw = row.get('amount') if row.get('amount') is not None else row.get('money', 0)
        remark = str(row.get('remark') or 'Salary').strip()
        if not remark:
            remark = 'Salary'

        # Data cleaning and validation
        # 1. Clean account number
        clean_account_number = re.sub(r'[\s-]', '', account_number)

        # 2. Validate account number
        if not validate_luhn(clean_account_number):
            failed_records.append({
                "original_row": row,
                "error": "Invalid card number (Luhn check failed)"
            })
            continue

        if not account_name:
            failed_records.append({
                "original_row": row,
                "error": "Missing account name"
            })
            continue

        # 3. Clean and parse amount
        try:
            if isinstance(amount_raw, str):
                amount_str = amount_raw.replace(',', '').replace('¥', '').strip()
                amount = Decimal(amount_str)
            else:
                amount = Decimal(str(amount_raw))

            amount = amount.quantize(Decimal('0.01'))

            if amount <= 0:
                raise ValueError("Amount must be positive")
        except (ValueError, TypeError, InvalidOperation):
            failed_records.append({
                "original_row": row,
                "error": "Invalid amount format"
            })
            continue

        # Format record based on bank type
        formatted_record = {
            "bank_type": bank_type,
            "account_name": account_name,
            "account_number": clean_account_number,
            "amount": float(amount),  # Keep as float in output if expected, but Decimal for summing is safer.
                                      # Let's keep it as float in output for JSON serialization compatibility,
                                      # but use float after quantizing to 0.01.
            "currency": default_currency,
            "remark": remark
        }

        # Add bank-specific fields (mock example)
        if bank_type == 'CMB':
            formatted_record["cmb_biz_type"] = "SALARY"
        elif bank_type == 'ICBC':
            formatted_record["icbc_pay_code"] = "0001"
        elif bank_type == 'CCB':
            formatted_record["ccb_flag"] = "1"

        success_records.append(formatted_record)

    total_amount = float(sum(Decimal(str(r['amount'])) for r in success_records))

    return {
        "summary": {
            "total_count": len(records),
            "success_count": len(success_records),
            "failed_count": len(failed_records),
            "total_amount": total_amount,
            "bank_type": bank_type
        },
        "success_records": success_records,
        "failed_records": failed_records
    }
