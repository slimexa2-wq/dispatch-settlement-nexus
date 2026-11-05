import json
from typing import Any, Dict, List, Tuple

class CrossMonthDuplicateGuardExplainer:
    """
    Translates complex cross-month duplicate guard calculation results
    into plain-language explanation cards for business operators.
    Features zero-configuration fault tolerance and automatic data self-healing.
    """

    @classmethod
    def generate_explanation(cls, data: Any = None, format_type: Any = 'text') -> str:
        """
        Generates the explainer card.

        Args:
            data: The raw calculation result, expected to be a dict, but handles anything safely.
            format_type: Output format ('text', 'html', 'json', 'markdown'). Defaults to 'text'.
        """
        data = cls._normalize_data(data)
        format_type = cls._normalize_format(format_type)

        worker_name = cls._extract_string(data.get("worker_name"), "未知工人")
        project_name = cls._extract_string(data.get("project_name"), "未知项目")

        valid_duplicates, total_amount = cls._process_duplicates(data.get("duplicates"))

        status = "danger" if valid_duplicates else "safe"

        if status == "safe":
            title = "未发现重复申领"
            desc = f"工人【{worker_name}】在项目【{project_name}】近3个月内无异常重复返费记录，可以正常结款。"
        else:
            title = "发现重复申领风险！"
            desc = f"⚠️ 警告：发现工人【{worker_name}】在项目【{project_name}】存在跨月重复申领返费的情况！"

            details = [f"- {d['month']} 已经申领过 {d['amount']:.2f} 元" for d in valid_duplicates]
            desc += " 历史记录如下：" + " ".join(details)
            desc += f" 累计重复金额：{total_amount:.2f} 元，系统已自动拦截。"

        return cls._format_output(
            format_type, status, title, desc, worker_name, project_name, total_amount, valid_duplicates
        )

    @staticmethod
    def _normalize_data(data: Any) -> Dict[str, Any]:
        if isinstance(data, dict):
            return data
        return {}

    @staticmethod
    def _normalize_format(format_type: Any) -> str:
        if not isinstance(format_type, str):
            return 'text'
        format_type = format_type.strip().lower()
        if format_type in ['text', 'html', 'json', 'markdown']:
            return format_type
        return 'text'

    @staticmethod
    def _extract_string(value: Any, default: str) -> str:
        try:
            val = str(value).strip()
            if not val or val == 'None':
                return default
            return val
        except Exception:
            return default

    @staticmethod
    def _process_duplicates(raw_duplicates: Any) -> Tuple[List[Dict[str, Any]], float]:
        if not isinstance(raw_duplicates, list):
            return [], 0.0

        valid_duplicates = []
        total = 0.0

        for item in raw_duplicates:
            if not isinstance(item, dict):
                continue

            try:
                month = str(item.get("month", "未知月份")).strip()
                if not month or month == 'None':
                    month = "未知月份"
            except Exception:
                month = "未知月份"

            try:
                amount = float(item.get("amount", 0.0))
            except (ValueError, TypeError):
                amount = 0.0

            if amount > 0:
                valid_duplicates.append({"month": month, "amount": amount})
                total += amount

        return valid_duplicates, total

    @staticmethod
    def _format_output(
        format_type: str, status: str, title: str, desc: str,
        worker: str, project: str, total: float, dups: List[Dict[str, Any]]
    ) -> str:
        if format_type == 'json':
            return json.dumps({
                "status": status,
                "title": title,
                "description": desc,
                "worker_name": worker,
                "project_name": project,
                "total_duplicate_amount": total,
                "duplicates": dups
            }, ensure_ascii=False)

        elif format_type == 'html':
            color = "#dc3545" if status == "danger" else "#28a745"
            return (
                f'<div class="duplicate-guard-card" style="border: 2px solid {color}; '
                f'padding: 16px; border-radius: 8px; background-color: #fff;">\n'
                f'    <h3 style="color: {color}; margin-top: 0; font-family: sans-serif;">{title}</h3>\n'
                f'    <p style="font-size: 16px; margin-bottom: 0; color: #333; line-height: 1.5; font-family: sans-serif;">{desc}</p>\n'
                f'</div>'
            )

        elif format_type == 'markdown':
            emoji = "🔴" if status == "danger" else "🟢"
            return f"### {emoji} {title}\n\n**结论**：{desc}\n"

        else:
            emoji = "[!]" if status == "danger" else "[V]"
            return f"{emoji} {title}\n{desc}"
