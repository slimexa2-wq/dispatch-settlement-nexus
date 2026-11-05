import math
from collections import Counter
import json

class FuzzyHeaderExplainer:
    def __init__(self, target_headers=None, threshold=0.3):
        # 默认自动配置项 (Zero-configuration)
        if target_headers is None:
            self.target_headers = {
                "net_salary": ["实发", "实发工资", "实际发放", "到手"],
                "gross_salary": ["应发", "应发工资", "应发合计", "总计"],
                "attendance_days": ["打卡天数", "出勤", "考勤天数", "出勤天数", "打卡"],
                "employee_id": ["工号", "员工号", "人员编码", "ID"]
            }
        else:
            self.target_headers = target_headers
        self.threshold = threshold

    def _clean_text(self, text):
        if text is None:
            return ""
        return str(text).strip().lower()

    def _get_ngrams(self, text, n=2):
        text = self._clean_text(text)
        if not text:
            return []
        if len(text) < n:
            return [text]
        return [text[i:i+n] for i in range(len(text)-n+1)]

    def _cosine_similarity(self, str1, str2):
        vec1 = Counter(self._get_ngrams(str1))
        vec2 = Counter(self._get_ngrams(str2))

        intersection = set(vec1.keys()) & set(vec2.keys())
        if not intersection:
            return 0.0

        numerator = sum([vec1[x] * vec2[x] for x in intersection])

        sum1 = sum([vec1[x]**2 for x in vec1.keys()])
        sum2 = sum([vec2[x]**2 for x in vec2.keys()])
        denominator = math.sqrt(sum1) * math.sqrt(sum2)

        if not denominator:
            return 0.0
        return float(numerator) / denominator

    def recognize_headers(self, input_headers=None):
        if input_headers is None:
            input_headers = []

        if not isinstance(input_headers, list):
            if isinstance(input_headers, str):
                input_headers = [input_headers]
            elif hasattr(input_headers, '__iter__') and not isinstance(input_headers, dict):
                input_headers = list(input_headers)
            else:
                input_headers = [str(input_headers)]

        results = {}
        for category, targets in self.target_headers.items():
            results[category] = {"matched": False, "matched_header": None, "confidence": 0.0}

            best_match = None
            best_score = 0.0

            for header in input_headers:
                header_clean = self._clean_text(header)
                if not header_clean:
                    continue

                for target in targets:
                    score = self._cosine_similarity(header_clean, target)
                    if score > best_score:
                        best_score = score
                        best_match = header

            if best_score >= self.threshold:
                results[category] = {
                    "matched": True,
                    "matched_header": best_match,
                    "confidence": round(best_score, 4)
                }

        return results

    def generate_plain_card(self, input_headers=None, format_type="json"):
        recognition_results = self.recognize_headers(input_headers)

        category_names = {
            "net_salary": "实发工资",
            "gross_salary": "应发工资",
            "attendance_days": "出勤天数",
            "employee_id": "员工工号"
        }

        summary_lines = []
        for cat, data in recognition_results.items():
            cat_name = category_names.get(cat, cat)
            if data["matched"]:
                summary_lines.append(f"✅ 成功识别【{cat_name}】：对应表头为「{data['matched_header']}」 (匹配度: {data['confidence']})")
            else:
                summary_lines.append(f"❌ 未能找到【{cat_name}】的对应表头，系统将使用默认处理。")

        plain_text_summary = "\n".join(summary_lines)

        format_type = self._clean_text(format_type)
        if format_type == "json":
            return json.dumps({
                "title": "表头智能识别大白话结论卡",
                "summary": plain_text_summary,
                "details": recognition_results
            }, ensure_ascii=False, indent=2)

        elif format_type == "markdown":
            md = "### 📊 表头智能识别大白话结论卡\n\n"
            for line in summary_lines:
                md += f"- {line}\n"
            return md

        elif format_type == "html":
            html = "<div class='header-card'>\n  <h3>📊 表头智能识别大白话结论卡</h3>\n  <ul>\n"
            for line in summary_lines:
                html += f"    <li>{line}</li>\n"
            html += "  </ul>\n</div>"
            return html

        else:
            return plain_text_summary
