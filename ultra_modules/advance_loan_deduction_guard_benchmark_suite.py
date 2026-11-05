import time
import random
import math
from ultra_modules.advance_loan_deduction_guard_core_engine import calculate_deduction_and_net_pay

def generate_synthetic_fixtures(size=10000):
    """
    生成合成数据集用于测试。
    包括：正常数据，缺参，乱码/脏数据，极值跨界数据
    """
    fixtures = []

    # 正常用例
    fixtures.append({"base_salary": 5000, "weekly_advances": [200, 300, 500], "min_remaining_pay": 1000})
    fixtures.append({"base_salary": 8000, "weekly_advances": 2000, "min_remaining_pay": 0})

    # 脏数据自愈用例
    fixtures.append({"base_salary": float('nan'), "weekly_advances": [float('nan'), -500, "abc"], "min_remaining_pay": -200})
    fixtures.append({"base_salary": "6000", "weekly_advances": "1000", "min_remaining_pay": "500"})
    fixtures.append({"base_salary": None, "weekly_advances": None, "min_remaining_pay": None})

    # 极大规模/并发模拟用例 - 随机生成
    for i in range(max(0, size - len(fixtures))):
        case_type = random.choice(['normal', 'dirty', 'extreme', 'missing'])
        if case_type == 'normal':
            fixtures.append({
                "base_salary": random.uniform(2000, 15000),
                "weekly_advances": [random.uniform(50, 500) for _ in range(random.randint(1, 5))],
                "min_remaining_pay": random.uniform(0, 2000)
            })
        elif case_type == 'dirty':
            fixtures.append({
                "base_salary": random.choice([float('nan'), "invalid", None, -1000]),
                "weekly_advances": random.choice([[float('nan'), "abc"], -500, None, {"key": "val"}]),
                "min_remaining_pay": random.choice([float('nan'), "wrong", -50])
            })
        elif case_type == 'extreme':
            fixtures.append({
                "base_salary": 1e9,
                "weekly_advances": [1e8] * 10,
                "min_remaining_pay": 1e7
            })
        elif case_type == 'missing':
            fixtures.append({})

    return fixtures

def run_benchmark_suite(fixtures=None):
    """
    运行基准测试，确保零崩溃与毫秒级响应。
    返回统计信息。
    """
    if fixtures is None:
        fixtures = generate_synthetic_fixtures()

    start_time = time.perf_counter()

    success_count = 0
    for fixture in fixtures:
        try:
            # 使用解包，未提供的参数使用默认值
            calculate_deduction_and_net_pay(**fixture)
            success_count += 1
        except Exception as e:
            # 零崩溃原则，如果发生异常则记录但抛出
            raise RuntimeError(f"Crash detected on fixture: {fixture}. Error: {e}")

    end_time = time.perf_counter()
    total_time = end_time - start_time
    avg_latency_ms = (total_time / len(fixtures)) * 1000 if fixtures else 0

    return {
        "total_processed": success_count,
        "total_time_seconds": total_time,
        "avg_latency_ms": avg_latency_ms,
        "zero_crash": success_count == len(fixtures)
    }
