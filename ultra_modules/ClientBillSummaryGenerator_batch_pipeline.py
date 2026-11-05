import copy
import concurrent.futures
import threading
from typing import List, Dict, Any, Optional

class ClientBillSummaryGenerator:
    """
    甲方用工单位月度结算确认单（含工时明细+管理费+税费）一键生成器.
    Supports streaming batch records, progress snapshot, and non-blocking background processing.
    """
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers)
        self._lock = threading.Lock()

        self.total_records = 0
        self.processed_count = 0
        self.success_count = 0
        self.failure_count = 0

        self.client_summaries: Dict[str, Dict[str, float]] = {}
        self._futures: set = set()

    def _safe_float(self, val: Any, default: float = 0.0) -> float:
        if val is None:
            return default
        if isinstance(val, str) and val.strip() == "":
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def _process_record(self, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            client = record.get("client", "Unknown Client")
            if not isinstance(client, str) or not str(client).strip():
                client = "Unknown Client"
            else:
                client = str(client).strip()

            hours = self._safe_float(record.get("hours"), 0.0)
            rate = self._safe_float(record.get("rate"), 0.0)

            mgmt_fee_rate = self._safe_float(record.get("mgmt_fee_rate"), 0.05)
            tax_rate = self._safe_float(record.get("tax_rate"), 0.06)

            wage = hours * rate
            mgmt_fee = wage * mgmt_fee_rate
            tax = (wage + mgmt_fee) * tax_rate
            total = wage + mgmt_fee + tax

            return {
                "client": client,
                "wage": wage,
                "mgmt_fee": mgmt_fee,
                "tax": tax,
                "total": total,
                "hours": hours,
            }
        except Exception:
            # Catching unforeseen errors to prevent crash
            return None

    def _record_done_callback(self, future: concurrent.futures.Future):
        with self._lock:
            self.processed_count += 1
            self._futures.discard(future)
            try:
                result = future.result()
                if result is not None:
                    self.success_count += 1
                    client = result["client"]
                    if client not in self.client_summaries:
                        self.client_summaries[client] = {
                            "total_wage": 0.0,
                            "total_mgmt_fee": 0.0,
                            "total_tax": 0.0,
                            "total_amount": 0.0,
                            "total_hours": 0.0,
                            "record_count": 0
                        }

                    self.client_summaries[client]["total_wage"] += result["wage"]
                    self.client_summaries[client]["total_mgmt_fee"] += result["mgmt_fee"]
                    self.client_summaries[client]["total_tax"] += result["tax"]
                    self.client_summaries[client]["total_amount"] += result["total"]
                    self.client_summaries[client]["total_hours"] += result["hours"]
                    self.client_summaries[client]["record_count"] += 1
                else:
                    self.failure_count += 1
            except Exception:
                self.failure_count += 1

    def process_batch(self, records: List[Dict[str, Any]]):
        """
        Non-blocking batch processing. Starts the background processing.
        Allows repeated calls to stream in more records.
        """
        if not records:
            return

        with self._lock:
            self.total_records += len(records)

        for record in records:
            future = self._executor.submit(self._process_record, record)
            with self._lock:
                self._futures.add(future)
            # Add done callback after it's in the set to avoid race condition
            # where callback runs before it's added.
            future.add_done_callback(self._record_done_callback)

    def wait_completion(self):
        """
        Block and wait for all submitted tasks to complete.
        """
        while True:
            with self._lock:
                futures = list(self._futures)
            if not futures:
                break
            concurrent.futures.wait(futures)

    def get_snapshot(self) -> Dict[str, Any]:
        """
        Returns a progress snapshot and aggregated results without blocking.
        """
        with self._lock:
            return {
                "total_submitted": self.total_records,
                "processed": self.processed_count,
                "success": self.success_count,
                "failure": self.failure_count,
                "is_completed": (self.total_records > 0 and self.processed_count == self.total_records) or (self.total_records == 0),
                "client_summaries": copy.deepcopy(self.client_summaries)
            }

    def shutdown(self):
        """
        Clean up executor resources.
        """
        self._executor.shutdown(wait=True)
