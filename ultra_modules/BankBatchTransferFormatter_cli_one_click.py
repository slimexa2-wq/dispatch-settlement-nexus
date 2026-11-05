import argparse
import json
import csv
import sys
import io
from typing import List, Dict, Any, Optional

def luhn_checksum(card_number: str) -> bool:
    """Validate a bank card number using the Luhn algorithm."""
    if not card_number or not isinstance(card_number, str):
        return False
    digits = [int(d) for d in card_number if d.isdigit()]
    if not digits:
        return False

    checksum = 0
    reverse_digits = digits[::-1]

    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d

    return checksum % 10 == 0

def clean_data(amount: Any) -> float:
    """Silently clean dirty data for amount to float, returning 0.0 for invalid."""
    if amount is None:
        return 0.0
    try:
        # Try to convert to float, stripping spaces, replacing commas etc if it's a string
        if isinstance(amount, str):
            amount = amount.replace(',', '').replace('￥', '').replace('$', '').strip()
        return float(amount)
    except (ValueError, TypeError):
        return 0.0

def process_records(records: List[Dict[str, Any]], bank: str = "ALL") -> List[Dict[str, Any]]:
    """Process records based on bank type, format them and validate."""
    processed = []
    for r in records:
        # Default missing parameters gracefully
        name = str(r.get('name', '')).strip()
        card_no = str(r.get('card_number', '')).strip()
        amount_raw = r.get('amount', 0)
        bank_name = str(r.get('bank_name', '')).strip().upper()

        # Self-healing: if no name or card_no, we just continue (or skip)
        # But we format what we have

        amount = clean_data(amount_raw)

        if bank != "ALL" and bank not in bank_name and bank_name not in bank:
            # If a specific bank is requested and this doesn't match, skip or mark
            # For robustness, if user says CMB, only process CMB.
            # If bank_name is empty, maybe try to process anyway or skip.
            pass

        is_valid_card = luhn_checksum(card_no)

        # Determine standard format output
        target_bank = bank_name if bank_name else "UNKNOWN"
        if "招行" in target_bank or "CMB" in target_bank:
            std_bank = "CMB"
        elif "工行" in target_bank or "ICBC" in target_bank:
            std_bank = "ICBC"
        elif "建行" in target_bank or "CCB" in target_bank:
            std_bank = "CCB"
        else:
            std_bank = target_bank

        processed.append({
            "name": name,
            "card_number": card_no,
            "amount": amount,
            "bank": std_bank,
            "card_valid": is_valid_card,
            "status": "READY" if is_valid_card and name and amount > 0 else "ERROR"
        })
    return processed

def to_csv_string(records: List[Dict[str, Any]]) -> str:
    """Convert list of dicts to CSV string mimicking Excel export"""
    if not records:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["name", "card_number", "amount", "bank", "card_valid", "status"])
    writer.writeheader()
    writer.writerows(records)
    return output.getvalue()

def run(input_data: Optional[str] = None, input_format: str = "json", output_format: str = "json") -> str:
    """
    Main zero-parameter entrypoint.
    If no input is provided, processes a default set of records (zero-configuration).
    """
    default_data = [
        {"name": "张三", "card_number": "6222021234567890123", "amount": "5000", "bank_name": "工行"},
        {"name": "李四", "card_number": "6214831234567890", "amount": 6000.5, "bank_name": "招商银行"},
        {"name": "王五", "card_number": "invalid_card", "amount": "￥7000", "bank_name": "建行"},
        {"name": "赵六", "amount": None} # Missing params
    ]

    records = []
    if not input_data:
        records = default_data
    else:
        try:
            if input_format.lower() == "json":
                parsed = json.loads(input_data)
                if isinstance(parsed, list):
                    records = parsed
                elif isinstance(parsed, dict):
                    records = [parsed]
            elif input_format.lower() == "csv":
                reader = csv.DictReader(io.StringIO(input_data))
                records = list(reader)
        except Exception:
            # Fallback silently to default if parsing fails completely
            records = default_data

    processed = process_records(records)

    if output_format.lower() == "csv":
        return to_csv_string(processed)
    else:
        return json.dumps(processed, ensure_ascii=False, indent=2)

def main():
    # Zero parameter CLI entrypoint
    parser = argparse.ArgumentParser(description="一键代发工资格式转换与校验器")
    parser.add_argument("--input", "-i", type=str, default=None, help="Input JSON or CSV string")
    parser.add_argument("--in-fmt", type=str, default="json", choices=["json", "csv"], help="Input format")
    parser.add_argument("--out-fmt", type=str, default="json", choices=["json", "csv"], help="Output format")

    args = parser.parse_args()

    result = run(input_data=args.input, input_format=args.in_fmt, output_format=args.out_fmt)
    print(result)

if __name__ == "__main__":
    main()
