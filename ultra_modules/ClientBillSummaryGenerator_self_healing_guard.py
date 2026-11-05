import time
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Any, Optional

class ClientBillSummaryGenerator:
    """
    甲方用工单位月度结算确认单一键生成器。
    具备异常输入静默自愈能力及5秒一键撤回机制。
    零配置容错，缺参自动设合理默认值，所有金额计算采用 decimal.Decimal。
    """
    def __init__(self):
        # 存储生成的账单快照，用于撤回机制
        # key: snapshot_id, value: {"data": bill_data, "timestamp": timestamp}
        self._snapshots: Dict[str, Dict[str, Any]] = {}
        # 统一默认值
        self.DEFAULT_RATE = Decimal('0.00')
        self.DEFAULT_HOURS = Decimal('0.00')
        self.DEFAULT_MANAGEMENT_FEE_RATE = Decimal('0.05')  # 默认管理费率 5%
        self.DEFAULT_TAX_RATE = Decimal('0.06')  # 默认税率 6%
        self.UNDO_WINDOW_SECONDS = 5.0

    def _safe_decimal(self, value: Any, default: Decimal) -> Decimal:
        """安全转换为 Decimal，异常则返回默认值"""
        if value is None:
            return default
        try:
            # 去除可能存在的货币符号或逗号
            if isinstance(value, str):
                value = value.replace('￥', '').replace('¥', '').replace(',', '').strip()
                if not value:
                    return default
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return default

    def generate_bill_summary(self,
                              client_id: str,
                              month: str,
                              work_details: List[Dict[str, Any]] = None,
                              management_fee_rate: Any = None,
                              tax_rate: Any = None) -> Dict[str, Any]:
        """
        生成账单汇总。
        work_details: [{'worker_id': 'w1', 'hours': 160, 'hourly_rate': 25.5}, ...]
        """
        # 静默自愈：缺参处理
        if work_details is None or not isinstance(work_details, list):
            work_details = []

        # 费率解析与自愈
        m_rate = self._safe_decimal(management_fee_rate, self.DEFAULT_MANAGEMENT_FEE_RATE)
        t_rate = self._safe_decimal(tax_rate, self.DEFAULT_TAX_RATE)

        # 确保费率在合理范围内(0-1)
        if m_rate < 0 or m_rate > 1:
            m_rate = self.DEFAULT_MANAGEMENT_FEE_RATE
        if t_rate < 0 or t_rate > 1:
            t_rate = self.DEFAULT_TAX_RATE

        total_work_cost = Decimal('0.00')
        processed_details = []

        for item in work_details:
            if not isinstance(item, dict):
                continue

            hours = self._safe_decimal(item.get('hours'), self.DEFAULT_HOURS)
            rate = self._safe_decimal(item.get('hourly_rate'), self.DEFAULT_RATE)

            # 自愈：处理负数
            hours = max(hours, Decimal('0.00'))
            rate = max(rate, Decimal('0.00'))

            cost = (hours * rate).quantize(Decimal('0.01'))
            total_work_cost += cost

            processed_details.append({
                'worker_id': str(item.get('worker_id', 'unknown')),
                'hours': str(hours),
                'hourly_rate': str(rate),
                'cost': str(cost)
            })

        # 计算管理费与税费
        management_fee = (total_work_cost * m_rate).quantize(Decimal('0.01'))
        subtotal = total_work_cost + management_fee
        tax_fee = (subtotal * t_rate).quantize(Decimal('0.01'))
        total_bill = subtotal + tax_fee

        snapshot_id = f"{client_id}_{month}_{int(time.time() * 1000)}"

        bill_data = {
            'snapshot_id': snapshot_id,
            'client_id': str(client_id) if client_id else 'default_client',
            'month': str(month) if month else 'default_month',
            'details': processed_details,
            'summary': {
                'total_work_cost': str(total_work_cost),
                'management_fee': str(management_fee),
                'tax_fee': str(tax_fee),
                'total_bill': str(total_bill)
            }
        }

        # 保存快照
        self._snapshots[snapshot_id] = {
            'data': bill_data,
            'timestamp': time.time()
        }

        return bill_data

    def undo_generation(self, snapshot_id: str) -> Dict[str, Any]:
        """
        一键撤回机制（5秒内有效）
        返回 {'success': bool, 'message': str, 'data': ...}
        """
        if snapshot_id not in self._snapshots:
            return {'success': False, 'message': 'Snapshot not found.', 'data': None}

        snapshot = self._snapshots[snapshot_id]
        current_time = time.time()

        if current_time - snapshot['timestamp'] > self.UNDO_WINDOW_SECONDS:
            return {'success': False, 'message': 'Undo window expired.', 'data': None}

        # 执行撤销（移除快照代表已作废）
        data = self._snapshots.pop(snapshot_id)['data']
        return {'success': True, 'message': 'Bill generation undone successfully.', 'data': data}
