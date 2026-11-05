import concurrent.futures
import time
import uuid
import threading
from typing import List, Dict, Any, Optional

class GrossMarginReconciler:
    def __init__(self):
        pass

    @staticmethod
    def process_record(record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a single record to calculate the net gross margin.
        receivable billing - payable (equal pay + rebate + self-recruitment commission).
        Handle missing parameters with defaults.
        Handle dirty data (self-healing).
        """
        try:
            # Safely extract and convert to float, with default 0.0 if missing or invalid
            def safe_float(val: Any, default: float = 0.0) -> float:
                if val is None:
                    return default
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return default

            record_id = record.get("id", str(uuid.uuid4()))
            receivable_billing = safe_float(record.get("receivable_billing"))
            equal_pay = safe_float(record.get("equal_pay"))
            rebate = safe_float(record.get("rebate"))
            commission = safe_float(record.get("commission"))

            payable = equal_pay + rebate + commission
            net_gross_margin = receivable_billing - payable

            return {
                "id": record_id,
                "status": "success",
                "receivable_billing": receivable_billing,
                "payable": payable,
                "net_gross_margin": net_gross_margin,
                "raw_record": record
            }
        except Exception as e:
            return {
                "id": record.get("id", str(uuid.uuid4())),
                "status": "error",
                "error_message": str(e),
                "raw_record": record
            }

class BatchPipeline:
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self.snapshots = {}
        self.lock = threading.Lock()

    def process_batch_async(self, batch_id: str, records: List[Dict[str, Any]]) -> None:
        with self.lock:
            self.snapshots[batch_id] = {
                "status": "processing",
                "total": len(records),
                "processed": 0,
                "results": [],
                "errors": []
            }

        def process_and_update(record):
            result = GrossMarginReconciler.process_record(record)
            with self.lock:
                self.snapshots[batch_id]["processed"] += 1
                if result["status"] == "success":
                    self.snapshots[batch_id]["results"].append(result)
                else:
                    self.snapshots[batch_id]["errors"].append(result)
            return result

        def run_pipeline():
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = [executor.submit(process_and_update, r) for r in records]
                concurrent.futures.wait(futures)

            with self.lock:
                self.snapshots[batch_id]["status"] = "completed"

        # Start pipeline in a separate thread to be zero-blocking
        thread = threading.Thread(target=run_pipeline)
        thread.start()

    def get_progress_snapshot(self, batch_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            return self.snapshots.get(batch_id)

    def process_batch_sync(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Synchronous processing for simpler use cases, but still utilizes concurrent execution internally.
        """
        batch_id = str(uuid.uuid4())
        self.process_batch_async(batch_id, records)

        while True:
            snapshot = self.get_progress_snapshot(batch_id)
            if snapshot and snapshot["status"] == "completed":
                return snapshot
            time.sleep(0.01)

def run_pipeline(records: List[Dict[str, Any]], async_mode: bool = False) -> Any:
    """
    Main entry point for extremely simplified usage.
    """
    pipeline = BatchPipeline()
    if async_mode:
        batch_id = str(uuid.uuid4())
        pipeline.process_batch_async(batch_id, records)
        return {"batch_id": batch_id, "pipeline": pipeline}
    else:
        return pipeline.process_batch_sync(records)
