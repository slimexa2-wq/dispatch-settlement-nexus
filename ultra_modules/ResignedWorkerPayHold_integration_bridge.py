import logging
import json
from typing import Dict, Any, List, Optional, Tuple, Union

# Set up logging for audit trace
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IntegrationBridgeException(Exception):
    pass

class ResignedWorkerPayHoldIntegrationBridge:
    """
    自离/旷工离职人员急辞扣款合规上限校验与待发薪资自动对账器
    (跨系统数据契约无缝桥接与Schema版本自动向前兼容转换器)
    """

    # Schema Definitions
    # Old version: {'worker_id': '123', 'base_salary': 3000, 'absent_days': 2, 'resignation_type': 'quick', 'pending_pay': 1500}
    # New version: {'id': '123', 'monthly_base': 3000, 'absenteeism': 2, 'leave_reason': 'quick_quit', 'unpaid_balance': 1500, 'daily_rate': 100}

    COMPLIANCE_MAX_DEDUCTION_PERCENTAGE = 0.20  # Max 20% of monthly base for quick resignation
    DEFAULT_MONTHLY_DAYS = 21.75

    @staticmethod
    def _self_heal_number(val: Any, default: float = 0.0) -> float:
        """Silently heal dirty number data."""
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        try:
            # Handle strings with spaces or strange characters
            cleaned = str(val).strip().replace(',', '')
            return float(cleaned)
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _self_heal_string(val: Any, default: str = "") -> str:
        if val is None:
            return default
        return str(val).strip()

    @classmethod
    def _map_schema(cls, record: Dict[str, Any], audit_log: List[str]) -> Dict[str, Any]:
        """
        Automatically identifies new vs old version field differences and maps them silently.
        """
        mapped = {}

        # Worker ID
        if 'id' in record:
            mapped['worker_id'] = cls._self_heal_string(record['id'])
            audit_log.append("Mapped 'id' to 'worker_id'")
        elif 'worker_id' in record:
            mapped['worker_id'] = cls._self_heal_string(record['worker_id'])
            audit_log.append("Used existing 'worker_id'")
        else:
            mapped['worker_id'] = "UNKNOWN"
            audit_log.append("Missing worker ID, defaulted to UNKNOWN")

        # Base Salary
        if 'monthly_base' in record:
            mapped['base_salary'] = cls._self_heal_number(record['monthly_base'])
            audit_log.append("Mapped 'monthly_base' to 'base_salary'")
        elif 'base_salary' in record:
            mapped['base_salary'] = cls._self_heal_number(record['base_salary'])
            audit_log.append("Used existing 'base_salary'")
        else:
            mapped['base_salary'] = 0.0
            audit_log.append("Missing base salary, defaulted to 0.0")

        # Absent Days
        if 'absenteeism' in record:
            mapped['absent_days'] = cls._self_heal_number(record['absenteeism'])
            audit_log.append("Mapped 'absenteeism' to 'absent_days'")
        elif 'absent_days' in record:
            mapped['absent_days'] = cls._self_heal_number(record['absent_days'])
            audit_log.append("Used existing 'absent_days'")
        else:
            mapped['absent_days'] = 0.0
            audit_log.append("Missing absent days, defaulted to 0.0")

        # Resignation Type
        if 'leave_reason' in record:
            reason = cls._self_heal_string(record['leave_reason']).lower()
            mapped['is_quick_quit'] = (reason in ['quick_quit', 'quick', 'absent', 'runaway'])
            audit_log.append(f"Mapped 'leave_reason' ({reason}) to is_quick_quit={mapped['is_quick_quit']}")
        elif 'resignation_type' in record:
            reason = cls._self_heal_string(record['resignation_type']).lower()
            mapped['is_quick_quit'] = (reason in ['quick', 'absent'])
            audit_log.append(f"Mapped 'resignation_type' ({reason}) to is_quick_quit={mapped['is_quick_quit']}")
        else:
            mapped['is_quick_quit'] = False
            audit_log.append("Missing resignation type, defaulted to False")

        # Pending Pay
        if 'unpaid_balance' in record:
            mapped['pending_pay'] = cls._self_heal_number(record['unpaid_balance'])
            audit_log.append("Mapped 'unpaid_balance' to 'pending_pay'")
        elif 'pending_pay' in record:
            mapped['pending_pay'] = cls._self_heal_number(record['pending_pay'])
            audit_log.append("Used existing 'pending_pay'")
        else:
            mapped['pending_pay'] = 0.0
            audit_log.append("Missing pending pay, defaulted to 0.0")

        # Daily Rate
        if 'daily_rate' in record and record['daily_rate'] is not None:
            mapped['daily_rate'] = cls._self_heal_number(record['daily_rate'])
            audit_log.append("Used provided 'daily_rate'")
        else:
            if mapped['base_salary'] > 0:
                mapped['daily_rate'] = mapped['base_salary'] / cls.DEFAULT_MONTHLY_DAYS
                audit_log.append(f"Calculated 'daily_rate' from base_salary: {mapped['daily_rate']}")
            else:
                mapped['daily_rate'] = 0.0
                audit_log.append("Missing daily rate and base salary, defaulted to 0.0")

        return mapped

    @classmethod
    def process_record(cls, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a single record: map schema, calculate compliance deductions, and reconcile pay.
        Returns the final clean net result, with a silent audit log included.
        """
        audit_log = []
        audit_log.append(f"Processing raw record: {json.dumps(raw_record)}")

        # 1. Schema Mapping & Self-Healing
        mapped_data = cls._map_schema(raw_record, audit_log)

        # 2. Logic Execution
        worker_id = mapped_data['worker_id']
        base_salary = mapped_data['base_salary']
        absent_days = mapped_data['absent_days']
        is_quick_quit = mapped_data['is_quick_quit']
        pending_pay = mapped_data['pending_pay']
        daily_rate = mapped_data['daily_rate']

        # Calculate standard absenteeism deduction
        absent_deduction = absent_days * daily_rate
        audit_log.append(f"Calculated absent deduction: {absent_deduction} ({absent_days} days * {daily_rate}/day)")

        # Calculate penalty for quick resignation
        quick_quit_penalty = 0.0
        if is_quick_quit:
            # According to some compliance rules, max penalty might be capped
            compliance_max = base_salary * cls.COMPLIANCE_MAX_DEDUCTION_PERCENTAGE
            # Let's say standard penalty is 3 days pay, but capped at compliance max
            proposed_penalty = 3 * daily_rate
            quick_quit_penalty = min(proposed_penalty, compliance_max)
            audit_log.append(f"Applied quick quit penalty: {quick_quit_penalty} (Proposed: {proposed_penalty}, Cap: {compliance_max})")

        total_deduction = absent_deduction + quick_quit_penalty

        # Reconcile with pending pay (ensure we don't deduct more than what is owed, or if we do, net pay is 0)
        final_net_pay = max(0.0, pending_pay - total_deduction)
        audit_log.append(f"Reconciled final net pay: {final_net_pay} (Pending: {pending_pay} - Deduction: {total_deduction})")

        # 3. Final Output Assembly
        result = {
            "worker_id": worker_id,
            "original_pending_pay": round(pending_pay, 2),
            "total_deduction": round(total_deduction, 2),
            "final_net_pay": round(final_net_pay, 2),
            "deduction_details": {
                "absent_deduction": round(absent_deduction, 2),
                "quick_quit_penalty": round(quick_quit_penalty, 2)
            },
            "_audit_log": audit_log # Silent full-link traceable audit log
        }

        return result

    @classmethod
    def process_batch(cls, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        One-click API for processing a batch of records.
        Returns the clean, final net results.
        """
        if not isinstance(records, list):
            # Self-healing for batch input
            if isinstance(records, dict):
                records = [records]
            else:
                return []

        results = []
        for record in records:
            if not isinstance(record, dict):
                continue
            results.append(cls.process_record(record))

        return results

def process(records: Union[Dict[str, Any], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Extremely simple, one-click frontend interface.
    Accepts a single record or list of records, returns processed list.
    """
    return ResignedWorkerPayHoldIntegrationBridge.process_batch(records)
