import time
import re
import uuid

class AdvanceLoanDeductionGuard:
    def __init__(self):
        self.snapshots = {}
        self.UNDO_WINDOW_SECONDS = 5

    def _clean_numeric(self, value, default=0.0):
        if value is None:
            return float(default)
        if isinstance(value, (int, float)):
            return max(0.0, float(value))

        # Convert string
        val_str = str(value)
        # Remove non-numeric characters except dot and minus (for negative detection)
        cleaned_str = re.sub(r'[^\d\.\-]', '', val_str)
        if not cleaned_str:
            return float(default)

        try:
            val = float(cleaned_str)
            # Ensure no negative value is returned
            return max(0.0, val)
        except ValueError:
            return float(default)

    def process_deduction(self, worker_id, monthly_salary, advance_requested):
        # Default fallback for missing worker_id
        if not worker_id or not str(worker_id).strip():
            worker_id = f"unknown_{uuid.uuid4().hex[:8]}"
        else:
            worker_id = str(worker_id).strip()

        # Clean dirty data
        c_salary = self._clean_numeric(monthly_salary, 0.0)
        c_advance = self._clean_numeric(advance_requested, 0.0)

        # Protection logic: deduction cannot exceed monthly salary
        actual_deduction = min(c_advance, c_salary)
        remaining_salary = c_salary - actual_deduction

        snapshot_id = f"{worker_id}_{time.time()}"

        self.snapshots[worker_id] = {
            'snapshot_id': snapshot_id,
            'timestamp': time.time(),
            'monthly_salary': c_salary,
            'advance_requested': c_advance,
            'actual_deduction': actual_deduction,
            'remaining_salary': remaining_salary,
            'status': 'deducted'
        }

        return {
            'worker_id': worker_id,
            'actual_deduction': actual_deduction,
            'remaining_salary': remaining_salary,
            'snapshot_id': snapshot_id
        }

    def undo(self, worker_id):
        worker_id = str(worker_id).strip() if worker_id else ""
        if worker_id not in self.snapshots:
            return {
                'success': False,
                'message': 'No deduction record found for this worker.',
                'recovered_salary': 0.0
            }

        snapshot = self.snapshots[worker_id]
        if snapshot['status'] == 'undone':
            return {
                'success': False,
                'message': 'Already undone.',
                'recovered_salary': snapshot['monthly_salary']
            }

        elapsed_time = time.time() - snapshot['timestamp']
        if elapsed_time > self.UNDO_WINDOW_SECONDS:
            return {
                'success': False,
                'message': 'Undo window expired (over 5 seconds).',
                'recovered_salary': snapshot['remaining_salary']
            }

        # Proceed with undo
        snapshot['status'] = 'undone'
        return {
            'success': True,
            'message': 'Deduction successfully undone.',
            'recovered_salary': snapshot['monthly_salary']
        }
