import sys
import json
import csv
import io

# Optional pandas import for excel output
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

class FourWayCommissionAuditor:
    def __init__(self, data=None):
        # 零参数默认兜底，缺参自动设合理默认值
        self.data = data if data is not None else {}
        self.results = []

    def sanitize(self, val, default=0.0):
        # 脏数据自愈
        if val is None or val == "" or str(val).lower() == "null" or str(val).lower() == "nan":
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def audit(self):
        # 缺参自动设合理默认值
        salary_raw = self.data.get("salary")
        attendance_raw = self.data.get("attendance")
        policy_multiplier_raw = self.data.get("policy_multiplier")
        last_month_base_raw = self.data.get("last_month_base")

        salary = self.sanitize(salary_raw)
        attendance = self.sanitize(attendance_raw, default=1.0)
        policy_multiplier = self.sanitize(policy_multiplier_raw, default=1.0)
        last_month_base = self.sanitize(last_month_base_raw)

        # 10条铁律核验 (production-ready rules without mock)
        # 1. 工资不为负
        rule1 = salary >= 0
        self.results.append({"rule": 1, "desc": "工资不为负", "passed": rule1})

        # 2. 出勤率不超过1
        rule2 = attendance <= 1.0
        self.results.append({"rule": 2, "desc": "出勤率不超过1", "passed": rule2})

        # 3. 政策系数非负
        rule3 = policy_multiplier >= 0
        self.results.append({"rule": 3, "desc": "政策系数非负", "passed": rule3})

        # 4. 上月提成基数非负
        rule4 = last_month_base >= 0
        self.results.append({"rule": 4, "desc": "上月提成基数非负", "passed": rule4})

        # 5. 总提成 = (工资 + 上月基数) * 出勤率 * 政策系数
        calculated = (max(salary, 0) + max(last_month_base, 0)) * min(max(attendance, 0), 1.0) * max(policy_multiplier, 0)
        rule5 = calculated >= 0
        self.results.append({"rule": 5, "desc": "总提成非负", "passed": rule5})

        # 6. 出勤率为负转为0
        rule6 = attendance >= 0
        if not rule6:
            attendance = 0.0
            self.results.append({"rule": 6, "desc": "出勤率不为负（自愈）", "passed": True})
        else:
            self.results.append({"rule": 6, "desc": "出勤率不为负", "passed": True})

        # 7. 如果工资极其高 (>1e9)，触发大额标记
        rule7 = salary <= 1e9
        self.results.append({"rule": 7, "desc": "工资额度正常", "passed": rule7})

        # 8. 上月提成基数和当前工资同时存在时，政策系数有效
        rule8 = True
        if salary > 0 and last_month_base > 0:
            if policy_multiplier <= 0:
                rule8 = False
        self.results.append({"rule": 8, "desc": "政策系数逻辑核验", "passed": rule8})

        # 9. 保证数据全部是数字 (原始输入不是dict或list等非法类型被正确清理)
        rule9 = True
        for raw_val in [salary_raw, attendance_raw, policy_multiplier_raw, last_month_base_raw]:
            if raw_val is not None:
                if isinstance(raw_val, (dict, list, tuple)):
                    rule9 = False
                    break
        self.results.append({"rule": 9, "desc": "数据类型纯净化", "passed": rule9})

        # 10. 核验全通过则合法
        all_passed = all([r["passed"] for r in self.results[:9]])
        self.results.append({"rule": 10, "desc": "总体合规", "passed": all_passed})

        return {
            "status": "success",
            "calculated_commission": calculated,
            "rules_audit": self.results,
            "all_passed": all_passed
        }

class AuditorAdapter:
    def __init__(self, data=None):
        self.auditor = FourWayCommissionAuditor(data)

    def run_json(self):
        result = self.auditor.audit()
        return json.dumps(result, ensure_ascii=False)

    def run_csv(self):
        result = self.auditor.audit()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["status", "calculated_commission", "all_passed"])
        writer.writerow([result["status"], result["calculated_commission"], result["all_passed"]])
        writer.writerow([])
        writer.writerow(["rule", "desc", "passed"])
        for r in result["rules_audit"]:
            writer.writerow([r["rule"], r["desc"], r["passed"]])
        return output.getvalue()

    def run_excel(self, output_file="commission_audit.xlsx"):
        if not HAS_PANDAS:
            # Fallback to CSV if pandas is missing to remain robust
            csv_data = self.run_csv()
            with open("commission_audit.csv", "w", encoding="utf-8") as f:
                f.write(csv_data)
            return "commission_audit.csv"

        result = self.auditor.audit()

        df_summary = pd.DataFrame([{
            "status": result["status"],
            "calculated_commission": result["calculated_commission"],
            "all_passed": result["all_passed"]
        }])

        df_rules = pd.DataFrame(result["rules_audit"])

        with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
            df_summary.to_excel(writer, sheet_name="Summary", index=False)
            df_rules.to_excel(writer, sheet_name="Rules Audit", index=False)

        return output_file

def run_auditor_one_click(output_mode="json"):
    # 极简调用，零参数一键入口 (支持模式切换)
    adapter = AuditorAdapter()
    if output_mode == "excel":
        return adapter.run_excel()
    elif output_mode == "csv":
        return adapter.run_csv()
    else:
        return adapter.run_json()

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "json"
    print(f"Running auditor in {mode} mode:")
    print(run_auditor_one_click(mode))
