import json
from datetime import datetime, date

class HourlyRateJumpDetectorExplainer:
    """
    同项目同工种结算单价异常跳变与政策有效期越界自动核查器。
    将复杂后台计算结果转化为普通业务人员1秒看懂的大白话结论卡。
    """

    def __init__(self, jump_threshold=0.2):
        """
        :param jump_threshold: 跳变阈值，默认20%（0.2）
        """
        self.jump_threshold = jump_threshold

    def _clean_rate(self, rate, default=0.0):
        if rate is None:
            return default
        try:
            rate_float = float(rate)
            return rate_float if rate_float >= 0 else default
        except (ValueError, TypeError):
            return default

    def _clean_string(self, s, default="未知"):
        if s is None or str(s).strip() == "":
            return default
        return str(s).strip()

    def _parse_date(self, d):
        if d is None:
            return None
        if isinstance(d, (datetime, date)):
            return d
        try:
            return datetime.strptime(str(d).strip(), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return None

    def explain(self, current_rate, previous_rate=None, project_name=None,
                job_type=None, apply_date=None, policy_start=None, policy_end=None):
        """
        核查单价并生成大白话结论。
        """
        # 脏数据清洗与缺省值回落 (Self-healing & Fallbacks)
        current_rate_clean = self._clean_rate(current_rate)
        previous_rate_clean = self._clean_rate(previous_rate, default=current_rate_clean) # 没上期的话默认同本期，也就是无跳变
        proj = self._clean_string(project_name, "未知项目")
        job = self._clean_string(job_type, "未知工种")

        d_apply = self._parse_date(apply_date)
        d_start = self._parse_date(policy_start)
        d_end = self._parse_date(policy_end)

        issues = []

        # 核查异常跳变
        jump_ratio = 0.0
        if previous_rate_clean > 0:
            jump_ratio = (current_rate_clean - previous_rate_clean) / previous_rate_clean
            if abs(jump_ratio) >= self.jump_threshold:
                direction = "上涨" if jump_ratio > 0 else "下跌"
                issues.append(f"单价较上期{direction}了 {abs(jump_ratio)*100:.1f}%，超过了正常波动范围。")

        # 核查政策有效期越界
        if d_apply:
            if d_start and d_apply < d_start:
                issues.append(f"应用日期（{d_apply}）早于政策开始时间（{d_start}），政策尚未生效。")
            if d_end and d_apply > d_end:
                issues.append(f"应用日期（{d_apply}）晚于政策结束时间（{d_end}），政策已过期。")

        # 生成大白话结论
        if not issues:
            summary = f"✅ 【正常】{proj} - {job} 的单价（{current_rate_clean}元）无异常，且在政策有效期内。"
            status = "PASS"
        else:
            summary = f"⚠️ 【异常发现】{proj} - {job} 的核查结果：\n" + "\n".join([f"- {issue}" for issue in issues])
            status = "FAIL"

        data_dict = {
            "status": status,
            "project_name": proj,
            "job_type": job,
            "current_rate": current_rate_clean,
            "previous_rate": previous_rate_clean,
            "jump_ratio_percentage": round(jump_ratio * 100, 2),
            "issues": issues,
            "summary": summary
        }

        # HTML 卡片
        html_issues = "".join([f"<li>{issue}</li>" for issue in issues])
        html_color = "green" if status == "PASS" else "red"
        html_card = f"""
        <div style="border: 1px solid {html_color}; padding: 10px; border-radius: 5px;">
            <h3 style="color: {html_color};">{ '✅ 核查通过' if status == 'PASS' else '⚠️ 发现异常' }</h3>
            <p><strong>项目：</strong>{proj} | <strong>工种：</strong>{job}</p>
            <p><strong>当前单价：</strong>{current_rate_clean}元 (上期：{previous_rate_clean}元)</p>
            {f'<ul>{html_issues}</ul>' if html_issues else '<p>各项指标均正常。</p>'}
        </div>
        """

        # Markdown 卡片
        md_issues = "\n".join([f"- {issue}" for issue in issues])
        md_card = f"### { '✅ 核查通过' if status == 'PASS' else '⚠️ 发现异常' }\n" \
                  f"**项目：** {proj} | **工种：** {job}\n" \
                  f"**当前单价：** {current_rate_clean}元 (上期：{previous_rate_clean}元)\n\n" \
                  f"{md_issues if md_issues else '各项指标均正常。'}"

        return {
            "json": data_dict,
            "markdown": md_card,
            "html": html_card
        }
