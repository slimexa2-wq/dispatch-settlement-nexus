import math
from collections import Counter
from typing import Dict, List, Optional, Any

def get_bigrams(text: str) -> List[str]:
    """Generate character bigrams from text."""
    if not text:
        return []
    text = str(text).strip()
    if len(text) <= 1:
        return [text]
    return [text[i:i+2] for i in range(len(text) - 1)]

def cosine_similarity(str1: str, str2: str) -> float:
    """Compute character-bigram-based cosine similarity between two strings."""
    if not str1 or not str2:
        return 0.0

    bigrams1 = get_bigrams(str1)
    bigrams2 = get_bigrams(str2)

    if not bigrams1 and not bigrams2:
        return 1.0
    if not bigrams1 or not bigrams2:
        return 0.0

    vec1 = Counter(bigrams1)
    vec2 = Counter(bigrams2)

    intersection = set(vec1.keys()) & set(vec2.keys())

    dot_product = sum(vec1[x] * vec2[x] for x in intersection)

    mag1 = math.sqrt(sum(vec1[x]**2 for x in vec1.keys()))
    mag2 = math.sqrt(sum(vec2[x]**2 for x in vec2.keys()))

    if mag1 == 0 or mag2 == 0:
        return 0.0

    return dot_product / (mag1 * mag2)

class FuzzyHeaderFingerprintIntegrationBridge:
    def __init__(self, target_schema: Optional[Dict[str, List[str]]] = None):
        """
        Initialize the bridge with a target schema.
        If target_schema is not provided, defaults to standard intelligent fallbacks.
        """
        if target_schema is None:
            self.target_schema = {
                'actual_pay': ['实发', '实发金额', '实发工资', '最终实发', '净发', '最后打款'],
                'expected_pay': ['应发', '应发金额', '应发工资', '基本工资', '总薪资', '理论工资'],
                'attendance_days': ['考勤天数', '打卡天数', '出勤天数', '工时', '天数', '上班天数'],
                'employee_id': ['工号', '员工编号', '人员编号', '员工号', '编号']
            }
        else:
            self.target_schema = target_schema

        self.similarity_threshold = 0.25

    def _map_header(self, raw_header: str) -> str:
        """
        Map a raw header to the target schema using fuzzy matching.
        Returns the mapped standard key, or the raw_header if no match is found above threshold.
        """
        if raw_header is None:
            return raw_header

        clean_header = str(raw_header).strip()
        if not clean_header:
            return raw_header

        best_match = None
        best_score = -1.0

        for standard_key, keywords in self.target_schema.items():
            for keyword in keywords:
                score = cosine_similarity(clean_header, keyword)

                # Boost score if there's a direct substring match
                if keyword in clean_header or clean_header in keyword:
                    score = score * 0.5 + 0.5

                if score > best_score:
                    best_score = score
                    best_match = standard_key

        if best_match and best_score >= self.similarity_threshold:
            return best_match

        return clean_header

    def normalize_data(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Map a list of dictionaries containing raw headers to standardized ones.
        """
        if not data:
            return []

        header_cache: Dict[str, str] = {}
        normalized_data = []

        for row in data:
            if not isinstance(row, dict):
                continue

            normalized_row = {}
            for k, v in row.items():
                if k is None:
                    continue

                k_str = str(k).strip()
                if not k_str:
                    continue

                if k_str not in header_cache:
                    header_cache[k_str] = self._map_header(k_str)

                mapped_key = header_cache[k_str]
                normalized_row[mapped_key] = v

            normalized_data.append(normalized_row)

        return normalized_data

def bridge_data(data: List[Dict[str, Any]], target_schema: Optional[Dict[str, List[str]]] = None) -> List[Dict[str, Any]]:
    """
    Zero-configuration, one-click calling function to bridge and normalize data.
    """
    bridge = FuzzyHeaderFingerprintIntegrationBridge(target_schema)
    return bridge.normalize_data(data)
