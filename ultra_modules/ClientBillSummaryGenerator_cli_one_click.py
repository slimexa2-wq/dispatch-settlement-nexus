import json
import csv
import os
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

class ClientBillSummaryGenerator:
    """
    甲方用工单位月度结算确认单一键生成器
    Zero-config CLI tool to generate monthly billing summary for client companies.
    """

    def __init__(self, data=None, output_dir="."):
        """
        初始化生成器，提供极简接口。缺省参数时将使用合理默认值兜底。
        """
        self.output_dir = output_dir
        if data is None:
            self.data = self._get_default_data()
        else:
            self.data = data

        self.processed_data = []
        self.summary = {}

    def _get_default_data(self):
        """
        提供缺省参数时的默认数据集兜底。
        """
        return [
            {
                "employee_name": "张三",
                "working_hours": 160,
                "hourly_rate": 50.0,
                "management_fee_rate": 0.1,
                "tax_rate": 0.06,
                "return_fee": 0,
                "recruitment_commission": 500
            },
            {
                "employee_name": "李四",
                "working_hours": "180.5",  # Dirty data: string
                "hourly_rate": "55",
                "management_fee_rate": "0.1",
                "tax_rate": "0.06",
                "return_fee": "200.5",     # string
                "recruitment_commission": 0
            },
            {
                "employee_name": "王五",
                "working_hours": None,  # Dirty data: None
                "hourly_rate": 60,
                # Missing management_fee_rate, tax_rate, and other fees
            }
        ]

    def _clean_decimal(self, value, default="0"):
        """
        脏数据自愈：处理字符串、None、负数、无效格式等异常数据。
        """
        if value is None:
            return Decimal(default)
        try:
            val = Decimal(str(value))
            if val < 0:
                val = Decimal("0") # 自愈为0
            return val
        except InvalidOperation:
            return Decimal(default)

    def process(self):
        """
        处理数据，计算金额。
        计算逻辑：
        工时费 = 工时 * 时薪 (即等额工资 Equal Pay)
        管理费 = 工时费 * 管理费率
        税费 = (工时费 + 管理费) * 税率
        应收款 (开票金额/合计) Accounts Receivable = 工时费 + 管理费 + 税费

        基于领域逻辑(Dispatch Outsourcing Projects)：
        净毛利 (Net Gross Margin) = 开票金额 (Accounts Receivable) - (等额工资 (Equal Pay) + 退款手续费 (Return Fee) + 招聘佣金 (Recruitment Commission))
        """
        total_working_hours = Decimal("0")
        total_base_fee = Decimal("0")
        total_management_fee = Decimal("0")
        total_tax_fee = Decimal("0")
        total_bill_amount = Decimal("0")
        total_net_gross_margin = Decimal("0")

        for item in self.data:
            name = item.get("employee_name", "Unknown")
            hours = self._clean_decimal(item.get("working_hours"), "0")
            rate = self._clean_decimal(item.get("hourly_rate"), "0")
            mgmt_rate = self._clean_decimal(item.get("management_fee_rate"), "0.1") # 默认10%
            tax_rate = self._clean_decimal(item.get("tax_rate"), "0.06") # 默认6%
            return_fee = self._clean_decimal(item.get("return_fee"), "0")
            recruit_comm = self._clean_decimal(item.get("recruitment_commission"), "0")

            base_fee = (hours * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            mgmt_fee = (base_fee * mgmt_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            tax_fee = ((base_fee + mgmt_fee) * tax_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            accounts_receivable = base_fee + mgmt_fee + tax_fee # Invoice Amount

            # Net Gross Margin
            net_gross_margin = accounts_receivable - (base_fee + return_fee + recruit_comm)

            self.processed_data.append({
                "employee_name": name,
                "working_hours": float(hours),
                "base_fee": float(base_fee),
                "management_fee": float(mgmt_fee),
                "tax_fee": float(tax_fee),
                "total": float(accounts_receivable),
                "return_fee": float(return_fee),
                "recruitment_commission": float(recruit_comm),
                "net_gross_margin": float(net_gross_margin)
            })

            total_working_hours += hours
            total_base_fee += base_fee
            total_management_fee += mgmt_fee
            total_tax_fee += tax_fee
            total_bill_amount += accounts_receivable
            total_net_gross_margin += net_gross_margin

        self.summary = {
            "total_employees": len(self.processed_data),
            "total_working_hours": float(total_working_hours),
            "total_base_fee": float(total_base_fee),
            "total_management_fee": float(total_management_fee),
            "total_tax_fee": float(total_tax_fee),
            "total_bill_amount": float(total_bill_amount),
            "total_net_gross_margin": float(total_net_gross_margin)
        }
        return self

    def export_json(self, filename="client_bill_summary.json"):
        """
        一键输出 JSON 格式
        """
        filepath = os.path.join(self.output_dir, filename)
        output = {
            "summary": self.summary,
            "details": self.processed_data
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        return filepath

    def export_excel_csv(self, filename="client_bill_summary.csv"):
        """
        一键输出 Excel 兼容的 CSV 格式 (utf-8-sig)
        """
        filepath = os.path.join(self.output_dir, filename)
        if not self.processed_data:
            return filepath

        with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            # 表头
            writer.writerow(["员工姓名", "工时", "工时费(等额工资)", "管理费", "税费", "合计(开票金额)", "退款手续费", "招聘佣金", "净毛利"])

            # 明细
            for row in self.processed_data:
                writer.writerow([
                    row["employee_name"],
                    row["working_hours"],
                    row["base_fee"],
                    row["management_fee"],
                    row["tax_fee"],
                    row["total"],
                    row["return_fee"],
                    row["recruitment_commission"],
                    row["net_gross_margin"]
                ])

            # 汇总行
            writer.writerow([])
            writer.writerow(["汇总", "总人数:", self.summary["total_employees"], "", "", ""])
            writer.writerow(["", "总工时:", self.summary["total_working_hours"], "总计金额:", self.summary["total_bill_amount"], "总净毛利:", self.summary["total_net_gross_margin"]])

        return filepath

    def generate(self):
        """
        零配置一键生成主入口，自动生成双模文件。
        """
        self.process()
        json_path = self.export_json()
        csv_path = self.export_excel_csv()
        return {
            "status": "success",
            "summary": self.summary,
            "json_file": json_path,
            "csv_file": csv_path
        }

if __name__ == "__main__":
    generator = ClientBillSummaryGenerator()
    result = generator.generate()
    print("【零配置】月度结算确认单已生成！")
    print(f" - JSON 报告: {result['json_file']}")
    print(f" - Excel/CSV 报表: {result['csv_file']}")
    print("---- 核心汇总数据 ----")
    for k, v in result['summary'].items():
        print(f"  {k}: {v}")
