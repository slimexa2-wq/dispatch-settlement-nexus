import concurrent.futures
import threading
from datetime import datetime, timedelta
import uuid

class CrossMonthDuplicateGuard:
    """
    跨3个月历史结款台账同一工人同一项目重复申领返费防呆拦截器
    支持高吞吐批量流水线与并发加速
    """
    def __init__(self, history_ledger=None, max_workers=10):
        self.max_workers = max_workers
        self.history_map = self._build_history_map(history_ledger)
        self.batch_lock = threading.Lock()
        self.batch_seen = {}

    def _build_history_map(self, ledger):
        h_map = {}
        if not ledger:
            return h_map
        if not isinstance(ledger, list):
            ledger = [ledger]

        for item in ledger:
            if not isinstance(item, dict):
                continue
            wid = str(item.get('worker_id', '')).strip()
            pid = str(item.get('project_id', '')).strip()
            if not wid or not pid:
                continue

            dt = self._parse_date(item.get('claim_date'))
            key = (wid, pid)
            if key not in h_map:
                h_map[key] = []
            h_map[key].append(dt)
        return h_map

    def _parse_date(self, date_val):
        if isinstance(date_val, datetime):
            return date_val
        if not date_val:
            return datetime.now() # Self-healing: missing date defaults to now
        if isinstance(date_val, str):
            for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y%m%d', '%Y-%m-%d %H:%M:%S'):
                try:
                    return datetime.strptime(date_val.strip(), fmt)
                except ValueError:
                    continue
        return datetime.now() # Self-healing: invalid format defaults to now

    def check_record(self, record):
        try:
            if not isinstance(record, dict):
                record = {'_raw': record} # Self-healing for primitive types

            # Default fallbacks
            wid = str(record.get('worker_id', '')).strip()
            pid = str(record.get('project_id', '')).strip()

            # Dirty data self-healing: assign unique ID to avoid false positive duplication
            if not wid or wid.lower() == 'none':
                wid = f'UNKNOWN_WORKER_{uuid.uuid4().hex[:8]}'
            if not pid or pid.lower() == 'none':
                pid = f'UNKNOWN_PROJECT_{uuid.uuid4().hex[:8]}'

            claim_dt = self._parse_date(record.get('claim_date'))

            normalized_record = dict(record)
            normalized_record['worker_id'] = wid
            normalized_record['project_id'] = pid
            normalized_record['claim_date'] = claim_dt.strftime('%Y-%m-%d %H:%M:%S')

            key = (wid, pid)

            with self.batch_lock:
                history_dates = self.history_map.get(key, [])
                batch_dates = self.batch_seen.get(key, [])
                all_dates = history_dates + batch_dates

                intercepted = False
                for h_dt in all_dates:
                    if abs((claim_dt - h_dt).days) <= 90:
                        intercepted = True
                        break

                if not intercepted:
                    if key not in self.batch_seen:
                        self.batch_seen[key] = []
                    self.batch_seen[key].append(claim_dt)

            if intercepted:
                return {'status': 'intercepted', 'record': normalized_record, 'reason': 'Duplicate claim within 90 days'}
            else:
                return {'status': 'passed', 'record': normalized_record}

        except Exception as e:
            return {'status': 'errors', 'record': record, 'reason': str(e)}

    def process_batch(self, batch_records):
        if not batch_records:
            return {'passed': [], 'intercepted': [], 'errors': [], 'progress_snapshot': {'total': 0, 'completed': 0, 'percent': 100.0}}

        if not isinstance(batch_records, list):
            batch_records = [batch_records]

        results = {'passed': [], 'intercepted': [], 'errors': []}
        total = len(batch_records)
        completed = 0

        # Concurrency
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_rec = [executor.submit(self.check_record, rec) for rec in batch_records]

            for future in concurrent.futures.as_completed(future_to_rec):
                res = future.result()
                status = res['status']
                results[status].append(res)
                completed += 1

        results['progress_snapshot'] = {
            'total': total,
            'completed': completed,
            'percent': 100.0 if total > 0 else 0.0
        }
        return results

def run_pipeline(records, history=None):
    """
    一键直达、零配置调用的入口函数。
    极简 API:
    - records: 单条或多条记录 (支持 10~1000 条拖入)
    - history: 历史结款台账记录
    返回分类后的结果字典 (passed, intercepted, errors, progress_snapshot)
    """
    guard = CrossMonthDuplicateGuard(history_ledger=history)
    return guard.process_batch(records)
