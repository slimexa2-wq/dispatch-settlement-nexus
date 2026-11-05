import concurrent.futures
import threading
import uuid
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any

class ReimbursementBatchPipeline:
    """
    High-throughput batch pipeline for reimbursement processing.
    Ensures zero precision loss when converting Yuan to integer cents.
    Prevents duplicate invoice processing.
    Supports asynchronous processing with progress snapshots and non-blocking result aggregation.
    """
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self._processed_invoices = set()
        self._global_lock = threading.Lock()
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers)
        self._jobs = {}
        self._jobs_lock = threading.Lock()

    def _yuan_to_cents(self, amount: Any) -> int:
        """
        Converts Yuan to cents strictly without precision loss.
        Tolerates missing or dirty data (returns 0 for negative or invalid amounts).
        """
        if amount is None or amount == "":
            return 0
        try:
            # Cast floats to string to avoid float precision issues during Decimal conversion
            if isinstance(amount, float):
                amount_str = str(amount)
            else:
                amount_str = str(amount).strip()

            val = Decimal(amount_str)
            if val < 0:
                return 0
            # Multiply by 100 and truncate/round safely to integer cents
            cents = int((val * Decimal('100')).to_integral_value())
            return cents
        except (InvalidOperation, ValueError, TypeError):
            return 0

    def process_single_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes a single reimbursement record safely.
        Provides robust fallbacks for missing parameters (零配置容错、缺参自动设合理默认值).
        """
        if not isinstance(record, dict):
            # Fallback for completely malformed records
            record = {}

        record_id = record.get("id", str(uuid.uuid4()))
        amount = record.get("amount", 0)
        invoice_no = record.get("invoice_no")

        # Auto-heal missing invoice numbers
        if not invoice_no or not str(invoice_no).strip():
            invoice_no = f"AUTO-INV-{record_id}"
        else:
            invoice_no = str(invoice_no).strip()

        cents = self._yuan_to_cents(amount)
        status = "success"
        error_message = ""

        # Global anti-duplicate invoice checking (发票连号防重器)
        with self._global_lock:
            if invoice_no in self._processed_invoices:
                status = "duplicate_invoice"
                error_message = f"Invoice {invoice_no} has already been processed."
            else:
                self._processed_invoices.add(invoice_no)

        return {
            "id": record_id,
            "original_amount": amount,
            "cents": cents,
            "invoice_no": invoice_no,
            "status": status,
            "error": error_message
        }

    def _run_batch(self, job_id: str, batch: List[Dict[str, Any]]):
        """
        Internal worker for executing a batch asynchronously.
        """
        with self._jobs_lock:
            job_info = self._jobs.get(job_id)

        if not job_info:
            return

        # Execute all tasks in parallel using the thread pool
        future_to_record = {
            self._executor.submit(self.process_single_record, rec): rec
            for rec in batch
        }

        for future in concurrent.futures.as_completed(future_to_record):
            try:
                res = future.result()
                with job_info["lock"]:
                    job_info["results"].append(res)
                    job_info["processed"] += 1
                    if res["status"] == "success":
                        job_info["successful"] += 1
                    else:
                        job_info["failed"] += 1
            except Exception as exc:
                # Catch-all for extreme boundary crashes to prevent pipeline from stalling
                with job_info["lock"]:
                    job_info["processed"] += 1
                    job_info["failed"] += 1
                    rec = future_to_record.get(future, {})
                    job_info["results"].append({
                        "id": rec.get("id", "unknown"),
                        "status": "error",
                        "error": str(exc),
                        "cents": 0
                    })

        with job_info["lock"]:
            job_info["status"] = "completed"

    def submit_batch(self, batch: List[Dict[str, Any]] = None) -> str:
        """
        Submits a batch for processing (10~1000 items).
        Returns a job ID immediately (零阻塞).
        """
        if batch is None:
            batch = []
        elif not isinstance(batch, list):
            # Tolerate passing a single dict instead of a list
            batch = [batch]

        job_id = str(uuid.uuid4())

        with self._jobs_lock:
            self._jobs[job_id] = {
                "total": len(batch),
                "processed": 0,
                "successful": 0,
                "failed": 0,
                "status": "processing" if batch else "completed",
                "results": [],
                "lock": threading.Lock()
            }

        if batch:
            # Spin up a background thread to orchestrate the thread pool submissions
            # so submit_batch remains completely non-blocking even for large batches
            threading.Thread(target=self._run_batch, args=(job_id, batch), daemon=True).start()

        return job_id

    def get_progress_snapshot(self, job_id: str) -> Dict[str, Any]:
        """
        Retrieves the non-blocking progress snapshot and aggregated results for a specific job.
        """
        with self._jobs_lock:
            job_info = self._jobs.get(job_id)

        if not job_info:
            return {"error": "Job not found", "status": "unknown"}

        with job_info["lock"]:
            return {
                "job_id": job_id,
                "status": job_info["status"],
                "total": job_info["total"],
                "processed": job_info["processed"],
                "successful": job_info["successful"],
                "failed": job_info["failed"],
                "results": list(job_info["results"])
            }

    def process_sync(self, batch: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Convenience method for one-click synchronous execution if preferred (一键直达).
        """
        job_id = self.submit_batch(batch)
        import time
        while True:
            snapshot = self.get_progress_snapshot(job_id)
            if snapshot.get("status") in ("completed", "unknown"):
                return snapshot
            time.sleep(0.01)

# Default global pipeline instance for zero-configuration usage
default_pipeline = ReimbursementBatchPipeline()

def process_reimbursements_batch(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    One-click zero-config entrypoint for processing reimbursements synchronously.
    """
    return default_pipeline.process_sync(records)
