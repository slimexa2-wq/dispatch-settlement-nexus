import time
from typing import List, Dict, Any

class ResignedWorkerPayHoldReconciler:
    """
    Standalone validation and reconciliation engine for resigned workers' pay hold and deductions.
    Provides complete zero-configuration fault tolerance and self-healing for dirty data.
    """
    @staticmethod
    def _clean_float(value, default=0.0):
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = ''.join(c for c in value if c.isdigit() or c == '.' or c == '-')
            try:
                return float(cleaned)
            except ValueError:
                return default
        return default

    @staticmethod
    def _clean_bool(value, default=False):
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'y', 't')
        return default

    @classmethod
    def calculate_pay(
        cls,
        base_salary=None,
        deduction_requested=None,
        is_abrupt_resignation=None,
        max_deduction_rate=None,
        **kwargs # Catch-all for extreme boundaries/cross-year params like date_str
    ):
        base_salary_clean = max(0.0, cls._clean_float(base_salary, 0.0))
        deduction_requested_clean = max(0.0, cls._clean_float(deduction_requested, 0.0))
        is_abrupt = cls._clean_bool(is_abrupt_resignation, False)

        rate_clean = cls._clean_float(max_deduction_rate, 0.2)
        if rate_clean < 0.0 or rate_clean > 1.0:
            rate_clean = 0.2

        actual_deduction = 0.0
        max_deduction_cap = 0.0

        if is_abrupt:
            max_deduction_cap = base_salary_clean * rate_clean
            actual_deduction = min(deduction_requested_clean, max_deduction_cap)

        final_pay = base_salary_clean - actual_deduction

        return {
            "base_salary": base_salary_clean,
            "is_abrupt_resignation": is_abrupt,
            "requested_deduction": deduction_requested_clean,
            "compliance_cap": max_deduction_cap,
            "actual_deduction": actual_deduction,
            "final_pay": final_pay
        }


class SyntheticFixtureGenerator:
    """
    Generates synthetic datasets for performance benchmarking and extreme boundary verification
    of the ResignedWorkerPayHoldReconciler.
    """

    @staticmethod
    def generate_normal_data(count: int = 100) -> List[Dict[str, Any]]:
        return [
            {
                "base_salary": 5000.0 + i,
                "deduction_requested": 500.0 + (i % 100),
                "is_abrupt_resignation": (i % 2 == 0),
                "max_deduction_rate": 0.2,
                "resignation_date": f"2023-12-{(i%31)+1:02d}" # Cross-year boundary capable
            } for i in range(count)
        ]

    @staticmethod
    def generate_dirty_data(count: int = 100) -> List[Dict[str, Any]]:
        # Mix of None, gibberish strings, invalid types, etc.
        dirty_values = [None, "invalid_str", "", "5000xyz", "$%#", {"dict": "unsupported"}, [1, 2, 3]]
        return [
            {
                "base_salary": dirty_values[i % len(dirty_values)],
                "deduction_requested": dirty_values[(i + 1) % len(dirty_values)],
                "is_abrupt_resignation": dirty_values[(i + 2) % len(dirty_values)],
                "max_deduction_rate": dirty_values[(i + 3) % len(dirty_values)]
            } for i in range(count)
        ]

    @staticmethod
    def generate_missing_params(count: int = 100) -> List[Dict[str, Any]]:
        # Omit keys entirely
        return [
            {} for _ in range(count)
        ]

    @staticmethod
    def generate_extreme_bounds_data(count: int = 100) -> List[Dict[str, Any]]:
        # Extremely large numbers, negative numbers, out of bounds rates, cross-year/month boundary dates
        return [
            {
                "base_salary": 1e12 if i % 2 == 0 else -99999.99,
                "deduction_requested": 1e12 if i % 3 == 0 else -1000.0,
                "is_abrupt_resignation": True,
                "max_deduction_rate": 99.99 if i % 2 == 0 else -5.0,
                "resignation_date": "1999-12-31" if i % 2 == 0 else "2024-01-01"
            } for i in range(count)
        ]

    @staticmethod
    def generate_massive_concurrency_batch(count: int = 10000) -> List[Dict[str, Any]]:
        # A mix of all the above for a large batch run
        normal = SyntheticFixtureGenerator.generate_normal_data(count // 4)
        dirty = SyntheticFixtureGenerator.generate_dirty_data(count // 4)
        missing = SyntheticFixtureGenerator.generate_missing_params(count // 4)
        extreme = SyntheticFixtureGenerator.generate_extreme_bounds_data(count - (count // 4) * 3)
        return normal + dirty + missing + extreme


def run_benchmark(dataset: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Runs the ResignedWorkerPayHoldReconciler over a dataset and measures
    execution time. Ensures zero-crash processing.
    """
    start_time = time.perf_counter()
    results = []

    for item in dataset:
        # Pass parameters via kwargs, accommodating missing parameters
        res = ResignedWorkerPayHoldReconciler.calculate_pay(**item)
        results.append(res)

    end_time = time.perf_counter()
    total_time_ms = (end_time - start_time) * 1000.0

    return {
        "processed_count": len(results),
        "total_time_ms": total_time_ms,
        "results": results
    }
