import uuid
from typing import List, Dict, Any, Union

def process_advance_deductions(
    payroll_data: Union[List[Dict[str, Any]], None] = None,
    advance_records: Union[List[Dict[str, Any]], None] = None,
    min_net_salary: float = 0.0
) -> List[Dict[str, Any]]:
    """
    Worker weekly advance / living expense advance automatically deducted from current month's actual pay
    to prevent over-deduction (Cross-system data contract seamless bridge and Schema version automatic forward compatibility converter).

    Zero-configuration automatic fault tolerance, silently cleans dirty data, and ensures forward compatibility.
    """
    if payroll_data is None:
        payroll_data = []
    if advance_records is None:
        advance_records = []

    if not isinstance(payroll_data, list):
        payroll_data = []
    if not isinstance(advance_records, list):
        advance_records = []

    def safe_float(val: Any, default: float = 0.0) -> float:
        try:
            res = float(val)
            return res if res >= 0 else default
        except (ValueError, TypeError):
            return default

    advance_totals: Dict[str, float] = {}
    audit_logs_by_emp: Dict[str, List[str]] = {}

    for record in advance_records:
        if not isinstance(record, dict):
            continue

        emp_id = str(record.get('emp_id') or record.get('worker_id') or record.get('id') or '').strip()
        if not emp_id:
            continue

        amt = safe_float(record.get('amount') or record.get('advance_amount') or record.get('value'))

        if emp_id not in advance_totals:
            advance_totals[emp_id] = 0.0
            audit_logs_by_emp[emp_id] = []

        advance_totals[emp_id] += amt
        audit_logs_by_emp[emp_id].append(f"Mapped advance record to amount: {amt:.2f}")

    results = []
    processed_emp_ids = set()

    for payroll in payroll_data:
        if not isinstance(payroll, dict):
            continue

        emp_id = str(payroll.get('emp_id') or payroll.get('worker_id') or payroll.get('id') or '').strip()
        if not emp_id:
            emp_id = f"unknown_{uuid.uuid4().hex[:8]}"

        processed_emp_ids.add(emp_id)

        if emp_id not in audit_logs_by_emp:
            audit_logs_by_emp[emp_id] = []

        audit_logs = audit_logs_by_emp[emp_id]
        audit_logs.append("Started processing payroll data")

        base_salary = safe_float(payroll.get('standard_wage') or payroll.get('base_salary') or payroll.get('salary'))
        bonus = safe_float(payroll.get('performance_bonus') or payroll.get('bonus') or payroll.get('allowance'))

        gross_salary = base_salary + bonus
        audit_logs.append(f"Calculated gross salary: {gross_salary:.2f} (Base: {base_salary:.2f}, Bonus: {bonus:.2f})")

        total_advance = advance_totals.get(emp_id, 0.0)

        embedded_advance = safe_float(payroll.get('weekly_advances') or payroll.get('total_advance'))
        if embedded_advance > 0 and total_advance == 0:
            total_advance = embedded_advance
            audit_logs.append(f"Used embedded advance from payroll data: {total_advance:.2f}")

        safe_min = safe_float(min_net_salary)
        max_deductible = max(0.0, gross_salary - safe_min)

        actual_deduction = min(total_advance, max_deductible)
        net_salary = gross_salary - actual_deduction

        if actual_deduction < total_advance:
            audit_logs.append(f"Over-deduction prevented. Requested: {total_advance:.2f}, Allowed: {actual_deduction:.2f}")
        else:
            audit_logs.append(f"Deducted requested advance: {actual_deduction:.2f}")

        audit_logs.append(f"Final net salary: {net_salary:.2f}")

        results.append({
            "employee_id": emp_id,
            "gross_salary": gross_salary,
            "total_advance_requested": total_advance,
            "actual_deduction": actual_deduction,
            "net_salary": net_salary,
            "audit_logs": audit_logs
        })

    for emp_id, advance_amount in advance_totals.items():
        if emp_id not in processed_emp_ids:
            audit = audit_logs_by_emp.get(emp_id, [])
            audit.append("Warning: Advance record exists but no payroll data found. Net salary is 0.")
            audit.append(f"Over-deduction prevented. Requested: {advance_amount:.2f}, Allowed: 0.00")
            results.append({
                "employee_id": emp_id,
                "gross_salary": 0.0,
                "total_advance_requested": advance_amount,
                "actual_deduction": 0.0,
                "net_salary": 0.0,
                "audit_logs": audit
            })

    # Sort results by employee_id for deterministic output in testing
    results.sort(key=lambda x: x["employee_id"])
    return results
