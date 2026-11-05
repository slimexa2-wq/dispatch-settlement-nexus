import time
import uuid
import re
import logging

logger = logging.getLogger('FourWayAuditor')
logger.setLevel(logging.ERROR)

class FourWayCommissionAuditor:
    """
    供应商提成四方核对 (工资/考勤/政策/上月提成) 10条铁律自动核验器
    - 异常输入静默自愈
    - 5秒一键撤回(Undo)快照机制
    - 严禁弹窗报错打断用户
    """
    def __init__(self):
        self.snapshots = {}

    def _clean_numeric(self, val, default=0.0):
        if val is None:
            return default
        if isinstance(val, bool):
            return default if not val else 1.0
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            # Extract numeric part, including optional negative and decimals
            match = re.search(r'-?\d+(\.\d+)?', val.replace(',', ''))
            if match:
                return float(match.group())
        return default

    def audit(self, record):
        # Iron Rule 1: Ensure input is dictionary (Self-healing empty/wrong type)
        if not isinstance(record, dict):
            record = {}

        # Iron Rule 2: Salary must be non-negative. Missing/dirty defaults to 0.0
        salary = self._clean_numeric(record.get('salary'), default=0.0)
        salary = max(0.0, salary)

        # Iron Rule 3: Attendance days valid range 0 to 31. Missing/dirty defaults to 21.75
        attendance = self._clean_numeric(record.get('attendance_days'), default=21.75)
        attendance = max(0.0, min(31.0, attendance))

        # Iron Rule 4: Policy rate must be 0.0 to 1.0. Missing/dirty defaults to 0.1
        rate = self._clean_numeric(record.get('policy_rate'), default=0.1)
        rate = max(0.0, min(1.0, rate))

        # Iron Rule 5: Last month commission must be non-negative. Defaults to 0.0
        last_comm = self._clean_numeric(record.get('last_month_commission'), default=0.0)
        last_comm = max(0.0, last_comm)

        # Iron Rule 6: Base commission calculation
        base_comm = salary * rate

        # Iron Rule 7: Attendance adjustment (pro-rated up to 21.75 days)
        attendance_ratio = attendance / 21.75 if attendance <= 21.75 else 1.0
        adjusted_comm = base_comm * attendance_ratio

        # Iron Rule 8: Carry over last month commission
        total_comm_before_cap = adjusted_comm + last_comm

        # Iron Rule 9: Cap total commission at 500% of salary
        max_comm = salary * 5.0
        final_comm = min(total_comm_before_cap, max_comm) if salary > 0 else total_comm_before_cap

        # Iron Rule 10: Result must be rounded to 2 decimal places
        final_comm = round(final_comm, 2)

        healed_record = {
            'salary': round(salary, 2),
            'attendance_days': round(attendance, 2),
            'policy_rate': round(rate, 4),
            'last_month_commission': round(last_comm, 2),
            'final_commission': final_comm,
            'status': 'AUDITED'
        }

        snapshot_id = str(uuid.uuid4())
        self.snapshots[snapshot_id] = {
            'timestamp': time.time(),
            'original_record': record,
            'healed_record': healed_record,
            'undone': False
        }

        return {
            'snapshot_id': snapshot_id,
            'result': healed_record
        }

    def undo(self, snapshot_id):
        """
        5秒一键撤回(Undo)机制
        Returns success status silently without throwing errors.
        """
        # Self-healing: if snapshot_id is invalid, fail silently
        if not snapshot_id or not isinstance(snapshot_id, str):
            return {'success': False, 'data': None}

        if snapshot_id not in self.snapshots:
            return {'success': False, 'data': None}

        snapshot = self.snapshots[snapshot_id]

        if snapshot['undone']:
            return {'success': True, 'data': snapshot['original_record']}

        # 5 second time window check
        elapsed = time.time() - snapshot['timestamp']
        if elapsed > 5.0:
            return {'success': False, 'data': None}

        snapshot['undone'] = True
        return {'success': True, 'data': snapshot['original_record']}
