import math
import re
from collections import Counter
from typing import List, Optional, Any, Dict

DEFAULT_TARGET_HEADERS = [
    "实发工资", "应发工资", "打卡天数", "员工工号", "姓名", "基本工资", "出勤天数", "部门"
]

def _clean_string(text: Any) -> str:
    """
    Silently clean dirty data. Removes whitespace and non-alphanumeric/non-chinese characters.
    Handles None and non-string inputs.
    """
    if not isinstance(text, str):
        if text is None:
            return ""
        text = str(text)
    # Remove any whitespace and invisible characters
    text = re.sub(r'\s+', '', text)
    # Lowercase
    text = text.lower()
    # Remove special characters (keep chinese, english, numbers)
    text = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9]', '', text)
    return text

def _get_fingerprint(text: str) -> Dict[str, int]:
    """
    Generate semantic fingerprint (character unigrams and bigrams).
    Assumes text is not empty.
    """
    unigrams = list(text)
    bigrams = [text[i:i+2] for i in range(len(text) - 1)]
    return dict(Counter(unigrams + bigrams))

def _cosine_similarity(vec1: Dict[str, int], vec2: Dict[str, int]) -> float:
    """
    Calculate cosine similarity between two fingerprint vectors.
    """
    if not vec1 or not vec2:
        return 0.0

    intersection = set(vec1.keys()) & set(vec2.keys())
    dot_product = sum(vec1[k] * vec2[k] for k in intersection)

    sum1 = sum(v ** 2 for v in vec1.values())
    sum2 = sum(v ** 2 for v in vec2.values())

    denominator = math.sqrt(sum1) * math.sqrt(sum2)
    return dot_product / denominator

def identify_header(
    raw_header: Any,
    target_headers: Optional[List[str]] = None,
    threshold: float = 0.3
) -> Optional[str]:
    """
    Zero-configuration cosine semantic fingerprinting header recognizer.

    Args:
        raw_header: The raw, potentially dirty header string.
        target_headers: Optional list of target standard headers. Falls back to default.
        threshold: The similarity threshold (0 to 1) for a match.

    Returns:
        The best matching target header, or None if no match is found above threshold.
    """
    if target_headers is None or not isinstance(target_headers, list) or len(target_headers) == 0:
        target_headers = DEFAULT_TARGET_HEADERS

    cleaned_raw = _clean_string(raw_header)
    if not cleaned_raw:
        return None

    raw_fingerprint = _get_fingerprint(cleaned_raw)

    best_match = None
    max_similarity = -1.0

    for target in target_headers:
        cleaned_target = _clean_string(target)
        if not cleaned_target:
            continue

        target_fingerprint = _get_fingerprint(cleaned_target)
        sim = _cosine_similarity(raw_fingerprint, target_fingerprint)

        if sim > max_similarity:
            max_similarity = sim
            best_match = target

    if max_similarity >= threshold:
        return best_match

    return None
