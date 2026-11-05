import time
import re
import decimal
from decimal import Decimal
from typing import Dict, Any, List, Optional

# Configure decimal precision globally for financial calculations if needed,
# though standard context usually suffices.
decimal.getcontext().rounding = decimal.ROUND_HALF_UP

class ResignedWorkerPayHoldGuard:
    """
    自离/旷工离职人员急辞扣款合规上限校验与待发薪资自动对账器。

    Features:
    - 极简调用：缺参自动设合理默认值，异常输入静默自愈。
    - 严密后台逻辑：使用 Decimal 保证财务计算精度。
    - 自愈机制：过滤非数字字符，负数与异常数据自动置 0。
    - Undo 机制：轻量级快照，允许5秒内一键撤回最近的操作。
    """

    def __init__(self):
        # A list to store lightweight snapshots of state for the undo feature.
        # Snapshot format: {"timestamp": float, "worker_id": str, "record": dict}
        self._history: List[Dict[str, Any]] = []

    def _safe_decimal(self, value: Any, default: str = "0.00") -> Decimal:
        """
        Safely convert any input value to a Decimal, self-healing dirty data.
        Returns the default value (as Decimal) if conversion fails or value is negative.
        """
        if value is None:
            return Decimal(default)

        # If it's already a Decimal, return it. If float or int, try stringifying.
        if isinstance(value, Decimal):
            val = value
        else:
            try:
                # Convert to string and try to extract a valid numeric pattern.
                s = str(value)
                # Matches optional negative sign, digits, optional decimal point and digits.
                match = re.search(r'-?\d+(?:\.\d+)?', s)
                if match:
                    val = Decimal(match.group())
                else:
                    val = Decimal(default)
            except (decimal.InvalidOperation, TypeError, ValueError):
                val = Decimal(default)

        # No negative money values or days handled here; force to 0.00 if < 0.
        if val < Decimal("0"):
            val = Decimal("0.00")

        return val

    def calculate_settlement(self, worker_id: str = "UNKNOWN", **kwargs) -> Dict[str, Any]:
        """
        Main operation method. Calculates settlement details.

        Expected kwargs (but defaults are applied if missing or dirty):
        - base_salary: Base monthly salary (default 3000.00)
        - days_worked: Days worked in the settlement period (default 0.00, capped at 31)
        - penalty_requested: The initial penalty requested for sudden resignation (default 0.00)

        Compliance Logic:
        - Max penalty cannot exceed 20% of earned pay.
        """

        # Extract and heal data
        base_salary = self._safe_decimal(kwargs.get("base_salary"), default="3000.00")
        days_worked = self._safe_decimal(kwargs.get("days_worked"), default="0.00")
        penalty_req = self._safe_decimal(kwargs.get("penalty_requested"), default="0.00")

        # Cap days worked at maximum theoretical month length (31)
        if days_worked > Decimal("31"):
            days_worked = Decimal("31.00")

        # Calculate daily rate based on standard 21.75 working days/month
        # (This is standard in Chinese labor law, adjust if different spec is needed).
        # We'll use 21.75 for realism, though any valid divisor works.
        daily_rate = base_salary / Decimal("21.75")

        # Earned pay
        earned_pay = daily_rate * days_worked

        # Cap penalty at 20% of earned pay
        max_penalty = earned_pay * Decimal("0.20")
        actual_penalty = min(penalty_req, max_penalty)

        final_pay = earned_pay - actual_penalty

        # Format results to 2 decimal places.
        result = {
            "worker_id": worker_id,
            "base_salary": str(base_salary.quantize(Decimal("0.01"))),
            "days_worked": str(days_worked.quantize(Decimal("0.01"))),
            "earned_pay": str(earned_pay.quantize(Decimal("0.01"))),
            "requested_penalty": str(penalty_req.quantize(Decimal("0.01"))),
            "actual_penalty": str(actual_penalty.quantize(Decimal("0.01"))),
            "final_pay": str(final_pay.quantize(Decimal("0.01")))
        }

        # Save snapshot for undo
        snapshot = {
            "timestamp": time.time(),
            "worker_id": worker_id,
            "record": result
        }
        self._history.append(snapshot)

        return result

    def undo(self) -> Optional[Dict[str, Any]]:
        """
        Reverts the last settlement calculation if requested within 5 seconds.
        Returns the reverted record on success, or None if undo is not possible
        (either no history or 5 seconds have elapsed).
        """
        if not self._history:
            return None

        last_snapshot = self._history[-1]
        elapsed_time = time.time() - last_snapshot["timestamp"]

        if elapsed_time <= 5.0:
            # Pop the snapshot and return the undone record
            return self._history.pop()["record"]
        else:
            # Snapshot too old, undo not allowed
            return None
