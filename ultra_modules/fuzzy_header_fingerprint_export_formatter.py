import math
import logging
from typing import List, Dict, Any, Tuple
from collections import Counter

# Setting up an invisible audit logger
audit_logger = logging.getLogger("audit.fuzzy_header_formatter")
audit_logger.setLevel(logging.INFO)
if not audit_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    # Keeping it silent by not attaching to root logger, or attaching a NullHandler if we just want in-memory
    # For traceable audit log without cluttering standard output, we just keep it in memory
    audit_logger.addHandler(logging.NullHandler())

def extract_features(text: str) -> Counter:
    """Extract character unigrams and bigrams for cosine similarity."""
    if not text:
        return Counter()
    text = str(text).lower().strip()
    features = []
    # Unigrams
    features.extend([text[i:i+1] for i in range(len(text))])
    # Bigrams
    if len(text) > 1:
        features.extend([text[i:i+2] for i in range(len(text)-1)])
    return Counter(features)

def cosine_similarity(s1: str, s2: str) -> float:
    """Calculate cosine similarity based on unigrams and bigrams."""
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0

    vec1 = extract_features(s1)
    vec2 = extract_features(s2)

    intersection = set(vec1.keys()) & set(vec2.keys())
    numerator = sum(vec1[x] * vec2[x] for x in intersection)

    sum1 = sum(vec1[x]**2 for x in vec1.keys())
    sum2 = sum(vec2[x]**2 for x in vec2.keys())

    denominator = math.sqrt(sum1) * math.sqrt(sum2)
    if denominator == 0.0:
        return 0.0
    return float(numerator) / denominator

class FuzzyHeaderFingerprintExportFormatter:
    """
    Core algorithm module for non-standard attendance/salary header zero-configuration recognition.
    Generates clean export data (no NaN/None, comments=0) and a 3-line minimalist report for WeChat/Feishu.
    """

    TARGET_FINGERPRINTS = {
        "actual_pay": ["实发", "实发工资", "实际发放", "实领", "最终实发", "实到手"],
        "payable": ["应发", "应发工资", "合计应发", "总应发", "应发合计"],
        "attendance_days": ["打卡天数", "出勤天数", "考勤天数", "出勤", "实际出勤", "计薪天数"],
        "employee_id": ["工号", "员工号", "人员编码", "员工编码", "人员编号"]
    }

    def __init__(self, threshold: float = 0.3):
        self.threshold = threshold
        self.audit_log: List[str] = []

    def _log_audit(self, message: str) -> None:
        """Silently logs actions for full-link traceability."""
        self.audit_log.append(message)
        audit_logger.info(message)

    def identify_header(self, header: str) -> str:
        """Identifies a header using cosine semantic fingerprinting."""
        if not header or not isinstance(header, str):
            self._log_audit(f"Invalid header type or empty: {header}, fallback to 'unknown'.")
            return "unknown"

        best_match = "unknown"
        best_score = 0.0

        for key, targets in self.TARGET_FINGERPRINTS.items():
            for target in targets:
                score = cosine_similarity(header, target)
                if score > best_score:
                    best_score = score
                    best_match = key

        if best_score >= self.threshold:
            self._log_audit(f"Header '{header}' matched with fingerprint '{best_match}' (score: {best_score:.4f})")
            return best_match

        self._log_audit(f"Header '{header}' failed to match any fingerprint (best score: {best_score:.4f}), retaining original as fallback.")
        return header

    def format_data(self, headers: List[str] = None, data: List[Dict[str, Any]] = None) -> Tuple[List[Dict[str, Any]], str]:
        """
        Formats data, maps headers, heals dirty data, and generates a report.
        """
        # Missing parameter fallbacks
        if headers is None:
            self._log_audit("Headers parameter missing, defaulted to empty list.")
            headers = []
        if data is None:
            self._log_audit("Data parameter missing, defaulted to empty list.")
            data = []

        if not headers and data:
            inferred_headers = set()
            for row in data:
                if isinstance(row, dict):
                    inferred_headers.update(row.keys())
            headers = list(inferred_headers)
            self._log_audit("Inferred headers from data keys since headers list was empty.")

        # Deduplicate headers and map
        header_mapping = {}
        for h in headers:
            mapped_key = self.identify_header(h)
            if mapped_key in header_mapping.values() and mapped_key != h and mapped_key != "unknown":
                # Deduplication: if target already exists, keep original for this duplicate
                self._log_audit(f"Deduplication triggered for '{h}', '{mapped_key}' already mapped. Keeping original.")
                header_mapping[h] = h
            else:
                header_mapping[h] = mapped_key

        clean_data = []

        total_people = len(data)
        total_actual_pay = 0.0
        total_payable = 0.0
        total_attendance_days = 0.0

        for row_idx, row in enumerate(data):
            if not isinstance(row, dict):
                self._log_audit(f"Row {row_idx} is not a dictionary, skipping.")
                continue

            clean_row = {}

            for orig_key, orig_val in row.items():
                mapped_key = header_mapping.get(orig_key, orig_key)
                clean_val = orig_val

                # Dirty data self-healing: handle None and NaN
                is_none = clean_val is None
                is_nan = isinstance(clean_val, float) and math.isnan(clean_val)

                if is_none or is_nan:
                    self._log_audit(f"Row {row_idx}, key '{orig_key}': Healed {clean_val} to 0.")
                    clean_val = 0

                # Self-heal numerical fields
                if mapped_key in ["actual_pay", "payable", "attendance_days"]:
                    try:
                        clean_val = float(clean_val)
                        if math.isnan(clean_val) or math.isinf(clean_val):
                            clean_val = 0.0
                    except (ValueError, TypeError):
                        self._log_audit(f"Row {row_idx}, key '{orig_key}': Failed to convert '{clean_val}' to numeric, defaulted to 0.0.")
                        clean_val = 0.0

                    if mapped_key == "actual_pay":
                        total_actual_pay += clean_val
                    elif mapped_key == "payable":
                        total_payable += clean_val
                    elif mapped_key == "attendance_days":
                        total_attendance_days += clean_val

                elif mapped_key == "employee_id":
                    if not isinstance(clean_val, str):
                        clean_val = str(clean_val) if clean_val != 0 else "UNKNOWN_ID"
                else:
                    # Generic cleanup for other fields
                    if isinstance(clean_val, float) and (math.isnan(clean_val) or math.isinf(clean_val)):
                        clean_val = 0
                    elif clean_val is None:
                        clean_val = ""

                clean_row[mapped_key] = clean_val

            # Guarantee comments=0 as per strict requirement
            clean_row["comments"] = 0

            clean_data.append(clean_row)

        # Generate 3-line minimalist report text
        report_lines = [
            f"📈 考勤简报：共计 {total_people} 人次，累计打卡 {total_attendance_days:g} 天",
            f"💰 资金简报：应发总计 {total_payable:g} 元，实发总计 {total_actual_pay:g} 元",
            "✨ 异常监测：所有NaN/None已自愈，0 批注，纯净导出完成"
        ]

        report_text = "\n".join(report_lines)
        self._log_audit("Data formatting and report generation completed successfully.")

        return clean_data, report_text
