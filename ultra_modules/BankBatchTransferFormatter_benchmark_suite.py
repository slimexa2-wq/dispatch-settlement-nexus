import time
import random
from typing import List, Dict, Any, Tuple
from ultra_modules.BankBatchTransferFormatter_core_engine import format_bank_batch_transfer


class SyntheticFixtureGenerator:
    """
    Generates synthetic datasets (fixtures) for benchmarking the BankBatchTransferFormatter.
    Provides extreme edge cases, dirty data, and massive concurrency simulations.
    """

    @staticmethod
    def _generate_valid_luhn_number(length: int = 16) -> str:
        """Helper to generate a random valid Luhn card number."""
        if length < 2:
            length = 16
        number = "".join(str(random.randint(0, 9)) for _ in range(length - 1))

        # Calculate Luhn checksum digit
        digits = [int(x) for x in number]
        even_digits = [d * 2 for d in digits[-1::-2]]
        even_sum = sum((d // 10) + (d % 10) for d in even_digits)
        odd_sum = sum(digits[-2::-2]) if len(digits) > 1 else 0
        total_sum = even_sum + odd_sum

        checksum = (10 - (total_sum % 10)) % 10
        return number + str(checksum)

    @classmethod
    def generate_normal_dataset(cls, count: int = 100) -> List[Dict[str, Any]]:
        """Generates a standard dataset with clean data."""
        return [
            {
                "account_name": f"User_{i}",
                "account_number": cls._generate_valid_luhn_number(random.choice([16, 19])),
                "amount": round(random.uniform(10.0, 50000.0), 2),
                "remark": "Monthly Salary"
            }
            for i in range(count)
        ]

    @classmethod
    def generate_dirty_dataset(cls, count: int = 100) -> List[Dict[str, Any]]:
        """Generates a dataset with gibberish, empty values, missing fields, and bad types."""
        dataset = []
        for i in range(count):
            case_type = random.choice(["missing_name", "bad_luhn", "empty_card", "weird_amount", "gibberish", "completely_empty"])
            record = {}
            if case_type == "missing_name":
                record = {
                    "account_name": "",
                    "account_number": cls._generate_valid_luhn_number(),
                    "amount": 1000
                }
            elif case_type == "bad_luhn":
                record = {
                    "account_name": f"User_{i}",
                    "account_number": "1234567890123456",  # invalid luhn likely
                    "amount": 1000
                }
            elif case_type == "empty_card":
                record = {
                    "account_name": f"User_{i}",
                    "account_number": None,
                    "amount": 1000
                }
            elif case_type == "weird_amount":
                record = {
                    "account_name": f"User_{i}",
                    "account_number": cls._generate_valid_luhn_number(),
                    "amount": "not_a_number"
                }
            elif case_type == "gibberish":
                record = {
                    "account_name": "???#$%^&*",
                    "account_number": "----  123 456 \n\t",
                    "amount": " 9,999.99 ¥ ",
                    "remark": "None"
                }
            else:
                record = {}  # completely missing fields
            dataset.append(record)
        return dataset

    @classmethod
    def generate_extreme_dataset(cls, count: int = 100) -> List[Dict[str, Any]]:
        """Generates a dataset with cross-year/month boundaries and huge string payloads."""
        dataset = []
        for i in range(count):
            dataset.append({
                "account_name": f"Border_User_{i}",
                "account_number": cls._generate_valid_luhn_number(30), # unusually long card
                "amount": 9999999999.99, # Huge amount
                "remark": "Salary for 2023-12 to 2024-01 cross-year settlement."
            })
        return dataset

    @classmethod
    def generate_mixed_dataset(cls, total_count: int = 10000) -> List[Dict[str, Any]]:
        """Generates a massive mixed dataset mimicking ultra-high concurrency inputs."""
        count_normal = int(total_count * 0.7)
        count_dirty = int(total_count * 0.2)
        count_extreme = total_count - count_normal - count_dirty

        mixed = (
            cls.generate_normal_dataset(count_normal) +
            cls.generate_dirty_dataset(count_dirty) +
            cls.generate_extreme_dataset(count_extreme)
        )
        random.shuffle(mixed)
        return mixed


class BenchmarkSuite:
    """
    Executes benchmark tests on format_bank_batch_transfer to ensure zero crashes and log execution times.
    """

    @staticmethod
    def run_benchmark(dataset: List[Dict[str, Any]], bank_type: str = 'CMB') -> Tuple[Dict[str, Any], float]:
        """
        Runs the formatting logic and measures response time.
        Silently handles Missing Parameter fallbacks using zero-configuration defaults.
        """
        # Ensure zero-configuration defaults if params are not passed strictly.
        if dataset is None:
            dataset = []
        if not bank_type:
            bank_type = 'CMB'

        start_time = time.perf_counter()

        try:
            result = format_bank_batch_transfer(records=dataset, bank_type=bank_type)
        except Exception as e:
            # The core function is expected to NOT crash (zero crashes policy).
            # If it does, we wrap it to not break the benchmark itself but record the failure.
            result = {"error": f"CRITICAL CRASH: {str(e)}"}

        end_time = time.perf_counter()

        execution_time_ms = (end_time - start_time) * 1000
        return result, execution_time_ms
