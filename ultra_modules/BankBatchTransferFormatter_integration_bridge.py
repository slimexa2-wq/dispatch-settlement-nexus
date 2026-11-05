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


def discover_schema_mapping(record: dict) -> dict:
    """
    Automatically identify old and new version field differences and silently map/convert them
    using zero-configuration semantic fingerprinting.
    """
    mapping = {
        'account_name': None,
        'account_number': None,
        'amount': None,
        'remark': None
    }

    name_patterns = ['account_name', 'name', '姓名', '户名', '收款人', 'employee_name', 'full_name']
    card_patterns = ['account_number', 'card_number', 'card', 'bank_card', '卡号', '银行卡号', '收款账号', '账号']
    amount_patterns = ['amount', 'money', 'salary', 'pay', '金额', '工资', '实发', 'total_amount']
    remark_patterns = ['remark', 'note', 'memo', 'description', '备注', '附言', '用途']

    available_keys = list(record.keys())

    def extract_key(patterns):
        # Exact match first
        for pattern in patterns:
            for key in available_keys:
                if str(key).strip().lower() == pattern.lower():
                    available_keys.remove(key)
                    return key
        # Partial match
        for pattern in patterns:
            for key in available_keys:
                if pattern.lower() in str(key).lower():
                    available_keys.remove(key)
                    return key
        return None

    card_key = extract_key(card_patterns)
    if card_key:
        mapping['account_number'] = record[card_key]

    name_key = extract_key(name_patterns)
    if name_key:
        mapping['account_name'] = record[name_key]

    amount_key = extract_key(amount_patterns)
    if amount_key:
        mapping['amount'] = record[amount_key]

    remark_key = extract_key(remark_patterns)
    if remark_key:
        mapping['remark'] = record[remark_key]

    return mapping


def format_integrated_bank_transfer(records: list, bank_type: str = 'CMB', default_currency: str = 'CNY') -> dict:
    """
    Format cross-schema Excel records into standard bank-specific batch transfer format,
    with data contract seamless bridge and auto self-healing.

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
        bank_type = 'CMB'

    success_records = []
    failed_records = []

    for row in records:
        if not isinstance(row, dict):
            failed_records.append({
                "original_row": row,
                "error": "Record is not a dictionary"
            })
            continue

        mapped = discover_schema_mapping(row)

        account_name = str(mapped['account_name'] or '').strip()
        account_number = str(mapped['account_number'] or '').strip()
        amount_raw = mapped['amount']

        remark = str(mapped['remark'] or 'Salary').strip()
        if not remark or remark.lower() == 'none':
            remark = 'Salary'

        clean_account_number = re.sub(r'[\s-]', '', account_number)

        if not validate_luhn(clean_account_number):
            failed_records.append({
                "original_row": row,
                "error": "Invalid card number (Luhn check failed)"
            })
            continue

        if not account_name or account_name.lower() == 'none':
            failed_records.append({
                "original_row": row,
                "error": "Missing account name"
            })
            continue

        try:
            if amount_raw is None:
                raise ValueError("Missing amount")
            if isinstance(amount_raw, str):
                amount_str = amount_raw.replace(',', '').replace('¥', '').replace('￥', '').strip()
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

        formatted_record = {
            "bank_type": bank_type,
            "account_name": account_name,
            "account_number": clean_account_number,
            "amount": float(amount),
            "currency": default_currency,
            "remark": remark
        }

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
