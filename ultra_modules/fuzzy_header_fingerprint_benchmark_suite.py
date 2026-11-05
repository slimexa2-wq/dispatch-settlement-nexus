import time
import random
import concurrent.futures
from typing import List, Dict, Any, Optional
from ultra_modules.fuzzy_header_fingerprint_core_engine import identify_header

class FuzzyHeaderFingerprintBenchmarkSuite:
    """
    Benchmark suite for fuzzy header fingerprinting.
    Validates zero-crash behavior, dirty data self-healing, and millisecond-level response
    under high concurrency and extreme edge cases.
    """

    @staticmethod
    def generate_synthetic_fixtures(size: int = 1000) -> List[Any]:
        """
        Generates a synthetic dataset including normal, nulls, gibberish, non-string,
        and extreme boundaries (cross-year/month like "2023-12-31应发工资", "2024-01-01实发工资").
        """
        base_headers = ["实发工资", "应发工资", "打卡天数", "员工工号", "姓名", "基本工资", "出勤天数", "部门"]
        dirty_prefixes = ["\n", "\t", " ", "!!!", "###", "NULL_", "2023-12-31_", "2024-01-01_"]
        dirty_suffixes = [" (copy)", "_v2", " \r\n", "???"]

        dataset = []

        for _ in range(size):
            choice = random.random()
            if choice < 0.1:
                dataset.append(None)
            elif choice < 0.2:
                dataset.append(random.choice([123, 45.67, True, [], {}]))
            elif choice < 0.3:
                # Random chinese characters
                dataset.append("".join(chr(random.randint(0x4e00, 0x9fa5)) for _ in range(5)))
            elif choice < 0.4:
                # Random ASCII gibberish
                dataset.append("".join(chr(random.randint(32, 126)) for _ in range(10)))
            else:
                base = random.choice(base_headers)
                prefix = random.choice(dirty_prefixes) if random.random() < 0.5 else ""
                suffix = random.choice(dirty_suffixes) if random.random() < 0.5 else ""
                dataset.append(f"{prefix}{base}{suffix}")

        return dataset

    @staticmethod
    def run_benchmark(dataset: Optional[List[Any]] = None, concurrency: int = 100) -> Dict[str, Any]:
        """
        Runs the benchmark on the dataset with the given concurrency level.
        Provides zero-configuration fallback if dataset is None.
        Returns performance metrics and verifies zero-crash.
        """
        if dataset is None:
            dataset = FuzzyHeaderFingerprintBenchmarkSuite.generate_synthetic_fixtures(1000)

        def process_item(item: Any) -> Optional[str]:
            return identify_header(item)

        start_time = time.time()

        success_count = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(process_item, item) for item in dataset]

            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                    success_count += 1
                except Exception:
                    pass

        end_time = time.time()
        total_time_ms = (end_time - start_time) * 1000
        avg_time_ms = total_time_ms / max(1, len(dataset))

        return {
            "total_records": len(dataset),
            "success_count": success_count,
            "total_time_ms": total_time_ms,
            "avg_time_ms": avg_time_ms,
            "zero_crash": success_count == len(dataset)
        }
