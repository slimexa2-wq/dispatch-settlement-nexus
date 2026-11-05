import concurrent.futures
import threading
import uuid
from typing import List, Dict, Any, Optional

class SupplierInvoiceVatChecker:
    """
    劳务供应商专票/普票税率合规性与进项抵扣测算器
    """
    @staticmethod
    def process_record(record: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理单条发票记录，支持容错和自愈。
        """
        result = {
            'id': record.get('id', 'unknown'),
            'original_record': record,
            'is_valid': True,
            'deductible_amount': 0.0,
            'tax_amount': 0.0,
            'amount_without_tax': 0.0,
            'errors': []
        }

        # 1. 脏数据自愈：金额 (Amount)
        raw_amount = record.get('amount')
        amount = 0.0
        try:
            if raw_amount is None or str(raw_amount).strip() == '':
                amount = 0.0
                result['errors'].append("Missing amount, defaulted to 0.0")
            else:
                if isinstance(raw_amount, str):
                    raw_amount = raw_amount.replace(',', '').replace('￥', '').strip()
                amount = float(raw_amount)
        except (ValueError, TypeError):
            result['is_valid'] = False
            result['errors'].append("Invalid amount format, defaulted to 0.0")
            amount = 0.0

        if amount < 0:
            result['is_valid'] = False
            result['errors'].append("Amount cannot be negative, set to 0.0")
            amount = 0.0

        # 2. 缺参默认兜底：发票类型 (Invoice Type)
        invoice_type = str(record.get('invoice_type', '普票')).strip()
        if invoice_type not in ('专票', '普票'):
            result['errors'].append(f"Unrecognized invoice_type '{invoice_type}', defaulted to '普票'")
            invoice_type = '普票'

        # 3. 缺参默认兜底：税率 (VAT Rate) 支持 6%, 3%, 1%, 5%（差额5%）
        raw_rate = str(record.get('vat_rate', '6%')).strip().replace('%', '')
        rate_val = 0.06
        rate_str = '6%'
        try:
            if not raw_rate:
                rate_val = 0.06
                rate_str = '6%'
            else:
                r = float(raw_rate)
                if r > 1.0:
                    r = r / 100.0

                if abs(r - 0.06) < 1e-5:
                    rate_val = 0.06; rate_str = '6%'
                elif abs(r - 0.03) < 1e-5:
                    rate_val = 0.03; rate_str = '3%'
                elif abs(r - 0.01) < 1e-5:
                    rate_val = 0.01; rate_str = '1%'
                elif abs(r - 0.05) < 1e-5:
                    rate_val = 0.05; rate_str = '5%'
                else:
                    result['errors'].append(f"Invalid vat_rate '{raw_rate}', defaulted to 6%")
                    rate_val = 0.06; rate_str = '6%'
        except (ValueError, TypeError):
            result['errors'].append(f"Invalid vat_rate format, defaulted to 6%")
            rate_val = 0.06; rate_str = '6%'

        # 测算进项抵扣 (仅专票可抵扣)
        # 换算不含税金额 = 票面金额 / (1 + 税率)
        amount_without_tax = amount / (1 + rate_val)
        tax_amount = amount - amount_without_tax
        deductible_amount = tax_amount if invoice_type == '专票' else 0.0

        result['amount_without_tax'] = round(amount_without_tax, 2)
        result['tax_amount'] = round(tax_amount, 2)
        result['deductible_amount'] = round(deductible_amount, 2)
        result['applied_invoice_type'] = invoice_type
        result['applied_vat_rate'] = rate_str

        return result


class BatchPipeline:
    """
    高吞吐批量流水线与并发加速封装
    """
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers)
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.Lock()

    def submit_batch(self, records: List[Dict[str, Any]]) -> str:
        """
        单次拖入10~1000条记录的批量流式处理（异步提交不阻塞）
        """
        task_id = str(uuid.uuid4())

        if records and len(records) > 1000:
            records = records[:1000]

        total_records = len(records) if records else 0

        with self.lock:
            self.tasks[task_id] = {
                'total': total_records,
                'completed': 0,
                'results': [],
                'total_valid': 0,
                'total_deductible_amount': 0.0,
                'total_tax_amount': 0.0,
                'status': 'pending' if total_records > 0 else 'completed'
            }

        if total_records == 0:
            return task_id

        with self.lock:
            self.tasks[task_id]['status'] = 'processing'

        for record in records:
            future = self.executor.submit(SupplierInvoiceVatChecker.process_record, record)
            future.add_done_callback(lambda f, tid=task_id: self._on_record_completed(tid, f))

        return task_id

    def _on_record_completed(self, task_id: str, future: concurrent.futures.Future):
        try:
            res = future.result()
        except Exception as e:
            res = {
                'id': 'error',
                'original_record': {},
                'is_valid': False,
                'deductible_amount': 0.0,
                'tax_amount': 0.0,
                'amount_without_tax': 0.0,
                'errors': [f"Unexpected error: {str(e)}"]
            }

        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return

            task['results'].append(res)
            task['completed'] += 1
            if res.get('is_valid', False):
                task['total_valid'] += 1
            task['total_deductible_amount'] += res.get('deductible_amount', 0.0)
            task['total_tax_amount'] += res.get('tax_amount', 0.0)

            if task['completed'] == task['total']:
                task['status'] = 'completed'
                task['total_deductible_amount'] = round(task['total_deductible_amount'], 2)
                task['total_tax_amount'] = round(task['total_tax_amount'], 2)

    def get_progress(self, task_id: str) -> Optional[Dict[str, Any]]:
        """
        进度快照与零阻塞结果汇总
        """
        with self.lock:
            if task_id not in self.tasks:
                return None
            task = self.tasks[task_id]
            return {
                'task_id': task_id,
                'status': task['status'],
                'total': task['total'],
                'completed': task['completed'],
                'progress_pct': round((task['completed'] / task['total'] * 100) if task['total'] > 0 else 100.0, 2),
                'total_valid': task['total_valid'],
                'total_deductible_amount': round(task['total_deductible_amount'], 2),
                'total_tax_amount': round(task['total_tax_amount'], 2),
                'results': list(task['results'])
            }

    def shutdown(self):
        self.executor.shutdown(wait=True)
