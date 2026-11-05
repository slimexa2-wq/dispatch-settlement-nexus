import json
import logging
from typing import List, Dict, Any, Optional, Union

# Set up a basic logger
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def clean_amount(val: Any, default: float = 0.0) -> float:
    """Safely cast dirty data to a float amount."""
    if val is None:
        return default
    try:
        # Handling string conversions or basic numerics
        if isinstance(val, str):
            val = val.strip().replace(',', '')
            if not val:
                return default
        amount = float(val)
        return amount if amount >= 0 else default
    except (ValueError, TypeError):
        return default

def calculate_deductions(employee_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Process employee data for loan deductions.
    Ensures negative deductions are impossible and caps total deductions
    to gross_salary so that net_salary is never negative.
    """
    results = []
    for emp in employee_data:
        emp_id = emp.get('employee_id', 'UNKNOWN')
        name = emp.get('name', 'Unknown Employee')

        # Self-healing dirty data
        gross_salary = clean_amount(emp.get('gross_salary', 0.0))
        advance_loan = clean_amount(emp.get('advance_loan', 0.0))

        # Guard mechanism: cap the deduction at gross_salary so net_salary >= 0
        actual_deduction = min(gross_salary, advance_loan)
        net_salary = gross_salary - actual_deduction
        unpaid_loan = advance_loan - actual_deduction

        results.append({
            'employee_id': emp_id,
            'name': name,
            'gross_salary': round(gross_salary, 2),
            'advance_loan_requested': round(advance_loan, 2),
            'actual_deduction': round(actual_deduction, 2),
            'net_salary': round(net_salary, 2),
            'unpaid_loan': round(unpaid_loan, 2)
        })
    return results

def run_guard_cli(data: Optional[Union[List[Dict[str, Any]], str]] = None) -> str:
    """
    Zero-parameter CLI entrypoint.
    It can accept a Python list of dicts, a JSON string, or None (in which case it uses a default).
    Returns JSON formatted string (dual mode output sim).
    """
    if data is None:
        logging.info("No data provided to CLI. Using default resilient data.")
        # Default self-healing data containing edge cases
        data = [
            {'employee_id': 'EMP001', 'name': 'Alice', 'gross_salary': 5000, 'advance_loan': 1000},
            {'employee_id': 'EMP002', 'name': 'Bob', 'gross_salary': '4000', 'advance_loan': '4500'}, # Edge case: loan > salary
            {'employee_id': 'EMP003', 'name': 'Charlie', 'gross_salary': None, 'advance_loan': 'bad_data'}, # Dirty data
            {'employee_id': 'EMP004', 'name': 'Diana'}, # Missing params
            {'employee_id': 'EMP005', 'name': 'Eve', 'gross_salary': -100, 'advance_loan': -500} # Negative values
        ]
    elif isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            logging.error("Failed to decode JSON data. Falling back to empty list.")
            data = []

    if not isinstance(data, list):
        data = []

    results = calculate_deductions(data)
    json_result = json.dumps(results, indent=2, ensure_ascii=False)
    print(json_result) # Simulate CLI output
    return json_result

if __name__ == "__main__":
    # One-click CLI entry point
    run_guard_cli()
