import csv
import io
import re

def is_luhn_valid(card_number: str) -> bool:
    """Check if a card number is valid according to the Luhn algorithm."""
    if not card_number or not isinstance(card_number, str):
        return False
    digits = [int(c) for c in card_number if c.isdigit()]
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

def clean_and_format_transfers(records: list = None, bank_type: str = "CMB") -> dict:
    """
    Cleans, validates, deduplicates, and formats a list of bank transfer records.

    Args:
        records (list): List of dictionaries, each containing 'name', 'card_number', 'amount'.
        bank_type (str): Type of bank (CMB, ICBC, CCB). Default is 'CMB'.

    Returns:
        dict: A dictionary containing 'cleaned_data', 'csv_content', and 'audit_trace'.
    """
    audit_trace = []

    # Auto-fallback for bank_type
    if not bank_type or not isinstance(bank_type, str):
        bank_type = "CMB"
    else:
        bank_type = bank_type.upper()

    audit_trace.append(f"Starting batch transfer formatting for bank type: {bank_type}")

    if not records or not isinstance(records, list):
        audit_trace.append("Input records list is empty, None, or invalid. Returning empty result.")
        records = []

    cleaned_data = []
    seen_cards = {}

    for i, record in enumerate(records):
        if not isinstance(record, dict):
            audit_trace.append(f"Record {i} is not a dictionary. Skipping.")
            continue

        original_name = record.get("name", "Unknown")
        original_card = record.get("card_number", "")
        original_amount = record.get("amount", 0.0)

        # 1. Clean card number
        card_number = str(original_card) if original_card is not None else ""
        card_number_clean = re.sub(r'\D', '', card_number)

        if not card_number_clean:
            audit_trace.append(f"Record {i} ('{original_name}'): Card number '{original_card}' is empty or has no digits. Skipping.")
            continue

        if card_number != card_number_clean:
            audit_trace.append(f"Record {i} ('{original_name}'): Card number cleaned from '{original_card}' to '{card_number_clean}'.")

        # 2. Luhn Validation
        is_valid = is_luhn_valid(card_number_clean)
        if not is_valid:
            audit_trace.append(f"Record {i} ('{original_name}'): Card number '{card_number_clean}' failed Luhn validation. Proceeding with flag.")

        # 3. Auto-healing Amount
        try:
            if isinstance(original_amount, (int, float)) and not isinstance(original_amount, bool):
                amount = float(original_amount)
            else:
                # Extract digits, dot, minus sign
                amount_str = re.sub(r'[^\d.-]', '', str(original_amount))
                amount = float(amount_str) if amount_str else 0.0
        except ValueError:
            amount = 0.0

        if amount < 0:
            audit_trace.append(f"Record {i} ('{original_name}'): Amount {amount} is negative, defaulting to 0.0.")
            amount = 0.0

        try:
            if amount != original_amount:
                audit_trace.append(f"Record {i} ('{original_name}'): Amount cleaned/defaulted from '{original_amount}' to {amount}.")
        except Exception:
            audit_trace.append(f"Record {i} ('{original_name}'): Amount cleaned/defaulted to {amount}.")

        name = str(original_name).strip() if original_name else "Unknown"
        if not name:
            name = "Unknown"

        cleaned_record = {
            "name": name,
            "card_number": card_number_clean,
            "amount": amount,
            "luhn_valid": is_valid,
            "bank_type": bank_type
        }

        # 4. Deduplication
        if card_number_clean in seen_cards:
            prev_idx = seen_cards[card_number_clean]
            audit_trace.append(f"Record {i} ('{name}'): Duplicate card number '{card_number_clean}' found (previously at index {prev_idx}). Overwriting previous record.")
            for j, data in enumerate(cleaned_data):
                if data["card_number"] == card_number_clean:
                    cleaned_data[j] = cleaned_record
                    break
            seen_cards[card_number_clean] = i
        else:
            seen_cards[card_number_clean] = i
            cleaned_data.append(cleaned_record)
            audit_trace.append(f"Record {i} ('{name}'): Successfully processed and added.")

    # 5. Generate CSV output
    output = io.StringIO()
    if bank_type == "ICBC":
        headers = ["AccountName", "AccountNo", "TransferAmount", "BankName", "Notes"]
    elif bank_type == "CCB":
        headers = ["ReceiverName", "ReceiverAccount", "Amount", "TargetBank", "Remarks"]
    else: # CMB and defaults
        headers = ["Name", "CardNumber", "Amount", "Bank", "Status"]

    writer = csv.writer(output)
    writer.writerow(headers)

    for row in cleaned_data:
        status_note = "Luhn Valid" if row["luhn_valid"] else "Luhn Invalid"
        if bank_type == "ICBC":
            writer.writerow([row["name"], row["card_number"], f"{row['amount']:.2f}", "ICBC", status_note])
        elif bank_type == "CCB":
            writer.writerow([row["name"], row["card_number"], f"{row['amount']:.2f}", "CCB", status_note])
        else:
            writer.writerow([row["name"], row["card_number"], f"{row['amount']:.2f}", row["bank_type"], status_note])

    csv_content = output.getvalue()
    audit_trace.append(f"Completed formatting. Processed {len(cleaned_data)} unique records.")

    return {
        "cleaned_data": cleaned_data,
        "csv_content": csv_content,
        "audit_trace": audit_trace
    }
