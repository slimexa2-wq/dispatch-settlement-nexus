import datetime
import decimal
import logging

class FieldMapper:
    """
    Silently maps and converts field differences across schema versions
    using semantic fingerprinting (matching common prefixes/keywords).
    """

    @staticmethod
    def extract_worker_id(data: dict) -> str:
        keys = ['worker_id', 'workerId', 'employee_id', 'employeeId', 'uid', 'user_id', 'userId', 'id_card', 'worker']
        for k in keys:
            if k in data and data[k] is not None:
                return str(data[k]).strip()
        return "UNKNOWN_WORKER"

    @staticmethod
    def extract_project_id(data: dict) -> str:
        keys = ['project_id', 'projectId', 'proj_id', 'pid', 'job_id', 'jobId', 'project']
        for k in keys:
            if k in data and data[k] is not None:
                return str(data[k]).strip()
        return "UNKNOWN_PROJECT"

    @staticmethod
    def extract_date(data: dict) -> datetime.date:
        keys = ['date', 'claim_date', 'claimDate', 'apply_date', 'applyDate', 'created_at', 'createdAt', 'timestamp']
        val = None
        for k in keys:
            if k in data and data[k] is not None:
                val = data[k]
                break

        if not val:
            return datetime.date.today()

        if isinstance(val, datetime.date):
            return val
        if isinstance(val, datetime.datetime):
            return val.date()

        try:
            # simple fallback parsing
            val_str = str(val)[:10] # support YYYY-MM-DD
            return datetime.datetime.strptime(val_str, "%Y-%m-%d").date()
        except Exception:
            return datetime.date.today()

    @staticmethod
    def extract_amount(data: dict) -> decimal.Decimal:
        keys = ['amount', 'fee', 'rebate', 'rebate_amount', 'rebateAmount', 'value', 'money']
        for k in keys:
            if k in data and data[k] is not None:
                try:
                    return decimal.Decimal(str(data[k]))
                except (decimal.InvalidOperation, TypeError, ValueError):
                    continue
        return decimal.Decimal('0.00')


class CrossMonthDuplicateGuard:
    """
    Guards against duplicate claims within a 90-day window for the same worker and project.
    """
    def __init__(self):
        self.audit_log = []
        self.history = [] # In-memory store for historical claims

    def _log_audit(self, action: str, details: dict):
        entry = {
            'timestamp': datetime.datetime.now().isoformat(),
            'action': action,
            'details': details
        }
        self.audit_log.append(entry)

    def process_claim(self, claim_data: dict, history_records: list = None) -> dict:
        """
        Process a new claim against historical records.
        """
        if not isinstance(claim_data, dict):
            self._log_audit("ERROR", {"message": "Invalid claim data format, expected dict", "input": claim_data})
            claim_data = {} # Self-healing: treat as empty dict

        self._log_audit("START_PROCESSING", {"raw_data": claim_data})

        worker_id = FieldMapper.extract_worker_id(claim_data)
        project_id = FieldMapper.extract_project_id(claim_data)
        claim_date = FieldMapper.extract_date(claim_data)
        amount = FieldMapper.extract_amount(claim_data)

        normalized_claim = {
            'worker_id': worker_id,
            'project_id': project_id,
            'claim_date': claim_date,
            'amount': amount
        }

        self._log_audit("MAPPED_FIELDS", normalized_claim)

        # Load history
        hist = history_records if history_records is not None else self.history

        # Check duplicates
        duplicate_found = False
        duplicate_record = None
        days_diff = 0

        for record in hist:
            if not isinstance(record, dict):
                continue

            hist_worker = FieldMapper.extract_worker_id(record)
            hist_project = FieldMapper.extract_project_id(record)
            hist_date = FieldMapper.extract_date(record)

            if hist_worker == worker_id and hist_project == project_id and hist_worker != "UNKNOWN_WORKER" and hist_project != "UNKNOWN_PROJECT":
                days_diff = (claim_date - hist_date).days
                if abs(days_diff) <= 90:
                    duplicate_found = True
                    duplicate_record = record
                    break

        if duplicate_found:
            self._log_audit("DUPLICATE_INTERCEPTED", {
                'conflict_with': duplicate_record,
                'days_diff': days_diff
            })
            result = {
                'status': 'REJECTED',
                'reason': 'Duplicate claim within 90 days',
                'worker_id': worker_id,
                'project_id': project_id,
                'amount': decimal.Decimal('0.00')
            }
        else:
            self._log_audit("CLAIM_APPROVED", normalized_claim)
            if history_records is None:
                self.history.append(claim_data)
            result = {
                'status': 'APPROVED',
                'worker_id': worker_id,
                'project_id': project_id,
                'amount': amount
            }

        self._log_audit("END_PROCESSING", {'result': result})
        return result

    def get_audit_logs(self):
        return self.audit_log
