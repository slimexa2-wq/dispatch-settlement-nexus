import json
from typing import Any, Dict, List, Optional


class FourWayCommissionAuditorPlainExplainer:
    """
    供应商提成四方核对（工资/考勤/政策/上月提成）10条铁律自动核验器。
    提供极简大白话摘要与可视化卡片（HTML/JSON/Markdown）。
    """

    def __init__(self):
        # 初始化需要的铁律描述
        self.iron_rules = [
            "1. 基础工资不能为负数",
            "2. 考勤天数必须在0到31天之间",
            "3. 考勤天数大于0时，工资必须大于0",
            "4. 提成比例必须在0%到100%之间",
            "5. 当月提成计算 = (工资 - 上月扣除) * 提成比例",
            "6. 政策生效时间必须合法且覆盖当前核对周期",
            "7. 如果有旷工，提成减半",
            "8. 当月总提成不得超过工资的3倍",
            "9. 如果上一月提成为负数，需从本月基础扣除",
            "10. 最终提成必须大于等于0（不足的由下月扣除，本月为0）"
        ]

    def _heal_data(self, data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """脏数据自愈与缺参自动设合理默认值"""
        if data is None:
            data = {}

        healed = {
            "employee_id": str(data.get("employee_id", "UNKNOWN")),
            "employee_name": str(data.get("employee_name", "未命名员工")),
            "salary": float(data.get("salary", 0.0)),
            "attendance_days": float(data.get("attendance_days", 0.0)),
            "absenteeism_days": float(data.get("absenteeism_days", 0.0)),
            "commission_rate": float(data.get("commission_rate", 0.0)),
            "last_month_deduction": float(data.get("last_month_deduction", 0.0)),
            "policy_active": bool(data.get("policy_active", True))
        }

        # 脏数据自愈
        if healed["salary"] < 0:
            healed["salary"] = 0.0

        if healed["attendance_days"] < 0:
            healed["attendance_days"] = 0.0
        elif healed["attendance_days"] > 31:
            healed["attendance_days"] = 31.0

        if healed["absenteeism_days"] < 0:
            healed["absenteeism_days"] = 0.0

        if healed["commission_rate"] < 0:
            healed["commission_rate"] = 0.0

        return healed

    def _validate_rules(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """执行10条铁律核验"""
        issues = []

        # 1. 基础工资不能为负数
        if data["salary"] < 0:
            issues.append(self.iron_rules[0])

        # 2. 考勤天数必须在0到31天之间
        if not (0 <= data["attendance_days"] <= 31):
            issues.append(self.iron_rules[1])

        # 3. 考勤天数大于0时，工资必须大于0
        if data["attendance_days"] > 0 and data["salary"] <= 0:
            issues.append(self.iron_rules[2])

        # 4. 提成比例必须在0%到100%之间
        if not (0 <= data["commission_rate"] <= 1):
            issues.append(self.iron_rules[3])

        # 6. 政策生效时间必须合法且覆盖当前核对周期
        if not data["policy_active"]:
            issues.append(self.iron_rules[5])

        # 提成计算
        # 9. 如果上一月提成为负数，需从本月基础扣除
        base_for_commission = data["salary"] - data["last_month_deduction"]

        # 5. 当月提成计算 = (工资 - 上月扣除) * 提成比例
        commission = base_for_commission * data["commission_rate"]

        # 7. 如果有旷工，提成减半
        if data["absenteeism_days"] > 0:
            commission *= 0.5

        # 8. 当月总提成不得超过工资的3倍
        if commission > data["salary"] * 3:
            commission = data["salary"] * 3

        # 10. 最终提成必须大于等于0（不足的由下月扣除，本月为0）
        next_month_deduction = 0.0
        if commission < 0:
            next_month_deduction = abs(commission)
            commission = 0.0

        return {
            "is_passed": len(issues) == 0,
            "issues": issues,
            "final_commission": round(commission, 2),
            "next_month_deduction": round(next_month_deduction, 2)
        }

    def explain(self, raw_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        零配置调用入口
        传入原始数据，返回核验结果、大白话摘要和不同格式的可视化卡片。
        """
        healed_data = self._heal_data(raw_data)
        validation_result = self._validate_rules(healed_data)

        # 构建大白话摘要
        summary = self._build_plain_summary(healed_data, validation_result)

        # 构建卡片
        cards = {
            "html": self._build_html_card(healed_data, validation_result, summary),
            "json": self._build_json_card(healed_data, validation_result, summary),
            "markdown": self._build_markdown_card(healed_data, validation_result, summary)
        }

        return {
            "success": validation_result["is_passed"],
            "data": healed_data,
            "result": validation_result,
            "summary": summary,
            "cards": cards
        }

    def _build_plain_summary(self, data: Dict[str, Any], result: Dict[str, Any]) -> str:
        name = data["employee_name"]
        is_passed = result["is_passed"]
        issues = result["issues"]
        commission = result["final_commission"]
        next_deduction = result["next_month_deduction"]

        status_text = "核验通过" if is_passed else "核验不通过"

        summary = f"员工【{name}】的提成核对结果：{status_text}。\n"
        summary += f"本月最终提成为：{commission}元。\n"

        if next_deduction > 0:
            summary += f"注意：由于本月提成不足以抵扣，有 {next_deduction} 元需结转至下月扣除。\n"

        if not is_passed:
            summary += "发现以下违规问题：\n"
            for issue in issues:
                summary += f"- {issue}\n"

        return summary

    def _build_html_card(self, data: Dict[str, Any], result: Dict[str, Any], summary: str) -> str:
        color = "green" if result["is_passed"] else "red"
        html = f"""<div style="border:1px solid #ccc; padding:16px; border-radius:8px; font-family:sans-serif;">
    <h3 style="color:{color}; margin-top:0;">提成核对结果: {'通过' if result['is_passed'] else '拦截'}</h3>
    <p><strong>员工:</strong> {data['employee_name']} (ID: {data['employee_id']})</p>
    <p><strong>最终提成:</strong> <span style="font-size:1.2em; font-weight:bold;">{result['final_commission']}</span> 元</p>
"""
        if result["next_month_deduction"] > 0:
            html += f"    <p style='color:orange;'>⚠️ 下月需扣除: {result['next_month_deduction']} 元</p>\n"

        if not result["is_passed"]:
            html += "    <div style='background:#fee; padding:8px; border-radius:4px; margin-top:12px;'>\n"
            html += "        <strong>发现问题:</strong>\n"
            html += "        <ul style='margin-bottom:0;'>\n"
            for issue in result["issues"]:
                html += f"            <li>{issue}</li>\n"
            html += "        </ul>\n"
            html += "    </div>\n"

        html += "</div>"
        return html

    def _build_json_card(self, data: Dict[str, Any], result: Dict[str, Any], summary: str) -> str:
        card = {
            "title": "提成核对结果",
            "status": "PASS" if result["is_passed"] else "FAIL",
            "employee": {
                "id": data["employee_id"],
                "name": data["employee_name"]
            },
            "commission": result["final_commission"],
            "next_month_deduction": result["next_month_deduction"],
            "issues": result["issues"],
            "summary": summary
        }
        return json.dumps(card, ensure_ascii=False, indent=2)

    def _build_markdown_card(self, data: Dict[str, Any], result: Dict[str, Any], summary: str) -> str:
        status_icon = "✅" if result["is_passed"] else "❌"
        md = f"### {status_icon} 提成核对报告\n\n"
        md += f"**员工:** {data['employee_name']} (ID: {data['employee_id']})\n"
        md += f"**核验状态:** {'通过' if result['is_passed'] else '拦截'}\n"
        md += f"**最终提成:** `{result['final_commission']} 元`\n\n"

        if result["next_month_deduction"] > 0:
            md += f"> ⚠️ **提示:** 下月需继续扣除 `{result['next_month_deduction']} 元`\n\n"

        if not result["is_passed"]:
            md += "**🚨 发现问题:**\n"
            for issue in result["issues"]:
                md += f"- {issue}\n"

        md += f"\n---\n*摘要说明:*\n{summary}"
        return md
