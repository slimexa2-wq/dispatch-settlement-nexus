import math
import re
from collections import Counter
from typing import List, Optional, Any, Dict, Tuple, Set

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

def identify_headers_with_audit(
    raw_headers: List[Any],
    target_headers: Optional[List[str]] = None,
    threshold: float = 0.3
) -> Dict[str, Any]:
    """
    Zero-configuration cosine semantic fingerprinting header recognizer with full audit trace.
    Returns a dict with 'frontend_result' (clean mapping) and 'audit_trace' (detailed logs).
    """
    if target_headers is None or not isinstance(target_headers, list) or len(target_headers) == 0:
        target_headers = DEFAULT_TARGET_HEADERS

    if not isinstance(raw_headers, list):
        raw_headers = [raw_headers] if raw_headers is not None else []

    audit_trace = []

    # Store initial target headers info
    target_info = {}
    for th in target_headers:
        cth = _clean_string(th)
        if cth:
            target_info[th] = {
                'clean': cth,
                'fingerprint': _get_fingerprint(cth)
            }

    audit_trace.append({
        'action': 'initialize',
        'target_headers': target_headers,
        'threshold': threshold
    })

    temp_matches = []

    for idx, raw in enumerate(raw_headers):
        clean_raw = _clean_string(raw)
        if not clean_raw:
            audit_trace.append({
                'action': 'ignore_empty',
                'index': idx,
                'original': raw
            })
            continue

        raw_fingerprint = _get_fingerprint(clean_raw)

        best_match = None
        max_similarity = -1.0
        comparisons = {}

        for th, info in target_info.items():
            sim = _cosine_similarity(raw_fingerprint, info['fingerprint'])
            comparisons[th] = sim
            if sim > max_similarity:
                max_similarity = sim
                best_match = th

        if max_similarity >= threshold:
            temp_matches.append({
                'index': idx,
                'original': raw,
                'clean': clean_raw,
                'best_match': best_match,
                'similarity': max_similarity,
                'comparisons': comparisons
            })
            audit_trace.append({
                'action': 'match_found',
                'index': idx,
                'original': raw,
                'clean': clean_raw,
                'best_match': best_match,
                'similarity': max_similarity,
                'comparisons': comparisons
            })
        else:
            audit_trace.append({
                'action': 'no_match_above_threshold',
                'index': idx,
                'original': raw,
                'clean': clean_raw,
                'max_similarity': max_similarity,
                'comparisons': comparisons
            })

    # Deduplication phase
    final_mapping = {}
    matched_targets = {} # target -> best temp_match

    for tm in temp_matches:
        target = tm['best_match']
        if target not in matched_targets:
            matched_targets[target] = tm
        else:
            # Conflict resolution: keep the one with higher similarity
            existing = matched_targets[target]
            if tm['similarity'] > existing['similarity']:
                audit_trace.append({
                    'action': 'deduplication_override',
                    'target': target,
                    'kept_original': tm['original'],
                    'kept_similarity': tm['similarity'],
                    'dropped_original': existing['original'],
                    'dropped_similarity': existing['similarity']
                })
                matched_targets[target] = tm
            else:
                audit_trace.append({
                    'action': 'deduplication_drop',
                    'target': target,
                    'kept_original': existing['original'],
                    'kept_similarity': existing['similarity'],
                    'dropped_original': tm['original'],
                    'dropped_similarity': tm['similarity']
                })

    for target, tm in matched_targets.items():
        final_mapping[tm['original']] = target

    audit_trace.append({
        'action': 'finalize',
        'final_mapping': final_mapping
    })

    return {
        'frontend_result': final_mapping,
        'audit_trace': audit_trace
    }
