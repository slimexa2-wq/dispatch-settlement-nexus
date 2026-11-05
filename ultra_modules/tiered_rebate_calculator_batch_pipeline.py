import concurrent.futures
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import date

@dataclass
class RebateRecord:
    worker_id: str
    start_date: date
    end_date: date
    days_worked: int = 0
    absent_days: int = 0
    base_rebate: float = 0.0
    tier_rates: Dict[int, float] = field(default_factory=dict) # e.g., {7: 100.0, 15: 200.0, 30: 500.0, 45: 800.0}
    absent_penalty_per_day: float = 0.0

    # Computed fields
    final_rebate: float = 0.0
    status: str = "PENDING"
    error_msg: str = ""

class TieredRebateCalculator:
    """Calculates tiered rebate based on rules."""

    @staticmethod
    def calculate(record: RebateRecord) -> RebateRecord:
        try:
            # Data healing / default fallbacks
            record.days_worked = max(0, record.days_worked)
            record.absent_days = max(0, record.absent_days)
            record.base_rebate = max(0.0, record.base_rebate)
            record.absent_penalty_per_day = max(0.0, record.absent_penalty_per_day)

            if not record.tier_rates:
                # Default tiered rates if missing
                record.tier_rates = {7: 50.0, 15: 150.0, 30: 300.0, 45: 500.0}

            # Find the highest tier reached
            reached_tier_bonus = 0.0
            sorted_tiers = sorted(record.tier_rates.keys(), reverse=True)
            for tier_days in sorted_tiers:
                if record.days_worked >= tier_days:
                    reached_tier_bonus = record.tier_rates[tier_days]
                    break

            # Calculate total penalty
            total_penalty = record.absent_days * record.absent_penalty_per_day

            # Final rebate
            final_amount = record.base_rebate + reached_tier_bonus - total_penalty
            record.final_rebate = max(0.0, final_amount) # Rebate cannot be negative
            record.status = "SUCCESS"

        except Exception as e:
            record.status = "FAILED"
            record.error_msg = str(e)
            record.final_rebate = 0.0

        return record

class RebateBatchPipeline:
    """High-throughput pipeline for processing rebates."""

    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers

    def process_batch(self, records: List[RebateRecord]) -> List[RebateRecord]:
        """
        Process a batch of 10~1000 records.
        Using ThreadPoolExecutor for concurrency.
        """
        if not records:
            return []

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            # Map calculation to records
            future_to_record = {executor.submit(TieredRebateCalculator.calculate, rec): rec for rec in records}

            for future in concurrent.futures.as_completed(future_to_record):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    # Self-healing on extreme failure
                    rec = future_to_record[future]
                    rec.status = "FAILED_CRITICAL"
                    rec.error_msg = str(e)
                    results.append(rec)

        return results

def process_rebate_stream(records_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convenience method for one-click access and simple calling.
    Accepts raw dictionaries, parses them, runs the pipeline, and returns dictionaries.
    Zero configuration, defaults applied internally.
    """
    parsed_records = []
    for data in records_data:
        try:
            # Simple parsing with default fallbacks
            rec = RebateRecord(
                worker_id=str(data.get("worker_id", "UNKNOWN")),
                start_date=data.get("start_date", date.today()),
                end_date=data.get("end_date", date.today()),
                days_worked=int(data.get("days_worked", 0)),
                absent_days=int(data.get("absent_days", 0)),
                base_rebate=float(data.get("base_rebate", 0.0)),
                tier_rates=data.get("tier_rates", {}),
                absent_penalty_per_day=float(data.get("absent_penalty_per_day", 0.0))
            )
            parsed_records.append(rec)
        except Exception:
            # On parsing failure, create a failed record
            failed_rec = RebateRecord(
                worker_id=str(data.get("worker_id", "PARSE_ERROR")),
                start_date=date.today(),
                end_date=date.today(),
                status="FAILED_PARSE",
                error_msg="Failed to parse input data"
            )
            parsed_records.append(failed_rec)

    pipeline = RebateBatchPipeline()
    processed_records = pipeline.process_batch(parsed_records)

    # Convert back to dict for zero-blocking result aggregation
    return [
        {
            "worker_id": r.worker_id,
            "final_rebate": r.final_rebate,
            "status": r.status,
            "error_msg": r.error_msg
        }
        for r in processed_records
    ]
