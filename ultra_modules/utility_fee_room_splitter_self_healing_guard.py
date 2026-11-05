import time
import copy
from typing import List, Dict, Any

class UtilityFeeRoomSplitter:
    """
    A utility fee calculator and splitter based on actual days stayed.
    It includes self-healing mechanisms for dirty data, handles missing parameters,
    and provides a 5-second snapshot-based undo mechanism.
    """

    def __init__(self):
        self._history = []
        self._current_result = []

    def _sanitize_fee(self, fee: Any) -> float:
        try:
            if isinstance(fee, bool):
                return 0.0
            val = float(fee)
            return max(0.0, val)
        except (ValueError, TypeError):
            return 0.0

    def _sanitize_tenant(self, tenant: Any) -> Dict[str, Any]:
        if not isinstance(tenant, dict):
            tenant = {}

        name = tenant.get('name', 'Unknown')
        if not isinstance(name, str):
            name = str(name) if name is not None else 'Unknown'

        days_raw = tenant.get('days', 0)
        try:
            if isinstance(days_raw, bool):
                days = 0.0
            else:
                days = float(days_raw)
                days = max(0.0, days)
        except (ValueError, TypeError):
            days = 0.0

        return {'name': name, 'days': days}

    def calculate_and_split(self, total_fee: Any = 0.0, tenants: Any = None) -> List[Dict[str, Any]]:
        total_fee_val = self._sanitize_fee(total_fee)

        if tenants is None or not isinstance(tenants, list):
            tenants = []

        sanitized_tenants = [self._sanitize_tenant(t) for t in tenants]
        total_days = sum(t['days'] for t in sanitized_tenants)

        if total_days == 0 and sanitized_tenants:
            # Fallback to equal split if total days is 0 (or all days were invalid)
            for t in sanitized_tenants:
                t['days'] = 1.0
            total_days = float(len(sanitized_tenants))

        if not sanitized_tenants:
            self._save_snapshot([])
            return []

        total_cents = int(round(total_fee_val * 100))
        exact_accumulated = 0.0
        allocated_cents = 0

        cents_result = []
        for i, t in enumerate(sanitized_tenants):
            exact_accumulated += total_cents * (t['days'] / total_days)
            target_allocated = int(round(exact_accumulated))

            # Ensure the last person gets exactly the remaining cents to avoid rounding mismatch
            if i == len(sanitized_tenants) - 1:
                target_allocated = total_cents

            cents = target_allocated - allocated_cents
            if cents < 0:
                cents = 0

            allocated_cents += cents

            cents_result.append({
                'name': t['name'],
                'days': t['days'],
                'fee': cents / 100.0
            })

        self._save_snapshot(cents_result)
        return cents_result

    def _save_snapshot(self, result: List[Dict[str, Any]]):
        self._current_result = copy.deepcopy(result)
        self._history.append({
            'result': self._current_result,
            'timestamp': time.time()
        })

    def undo(self) -> List[Dict[str, Any]]:
        """
        Revert to the previous calculation snapshot if called within 5 seconds of the latest calculation.
        Otherwise, silently fail and return the current state.
        """
        if not self._history:
            return self._current_result

        latest = self._history[-1]
        if time.time() - latest['timestamp'] <= 5.0:
            self._history.pop()
            if self._history:
                self._current_result = copy.deepcopy(self._history[-1]['result'])
            else:
                self._current_result = []

        return self._current_result
