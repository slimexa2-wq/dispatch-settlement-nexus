import collections
import concurrent.futures
import math
import re
import threading
from typing import Any, Dict, List, Optional, Tuple, Union

KNOWN_HEADERS = {
    "emp_id": ["工号", "员工号", "员工编号", "id", "employeeid", "emp_id"],
    "emp_name": ["姓名", "员工姓名", "name", "employeename"],
    "attendance_days": ["打卡天数", "出勤天数", "考勤天数", "出勤", "打卡", "attendancedays", "days"],
    "basic_salary": ["基本工资", "底薪", "基本薪资", "basicsalary", "base"],
    "gross_salary": ["应发", "应发工资", "应发合计", "grosssalary", "gross"],
    "net_salary": ["实发", "实发工资", "实发合计", "netsalary", "net"],
    "deductions": ["扣除", "扣款", "扣款合计", "deductions", "deduction"],
    "bonuses": ["奖金", "绩效", "补贴", "bonus", "bonuses"],
}

class FuzzyHeaderFingerprintBatchPipeline:
    def __init__(self, threshold: float = 0.2):
        self.threshold = threshold
        self._progress = 0
        self._total = 0
        self._results: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._executor = concurrent.futures.ThreadPoolExecutor()
        self._futures: List[concurrent.futures.Future] = []
        self._status = "IDLE"

    def _get_ngrams(self, text: str) -> Dict[str, int]:
        ngrams = collections.Counter()
        if not text:
            return ngrams
        # Unigrams
        for char in text:
            ngrams[char] += 1
        # Bigrams
        for i in range(len(text) - 1):
            ngrams[text[i:i+2]] += 1
        return ngrams

    def _cosine_similarity(self, vec1: Dict[str, int], vec2: Dict[str, int]) -> float:
        intersection = set(vec1.keys()) & set(vec2.keys())
        numerator = sum([vec1[x] * vec2[x] for x in intersection])

        sum1 = sum([vec1[x]**2 for x in vec1.keys()])
        sum2 = sum([vec2[x]**2 for x in vec2.keys()])
        denominator = math.sqrt(sum1) * math.sqrt(sum2)

        if not denominator:
            return 0.0
        return float(numerator) / denominator

    def _clean_text(self, text: Any) -> str:
        if text is None:
            return ""
        try:
            text = str(text)
        except Exception:
            return ""
        # Keep alphanumeric and chinese characters
        text = re.sub(r'[^\w\u4e00-\u9fff]', '', text).lower()
        return text

    def _identify_header(self, header: Any) -> Tuple[str, float]:
        cleaned_header = self._clean_text(header)
        if not cleaned_header:
            return "unknown", 0.0

        header_ngrams = self._get_ngrams(cleaned_header)
        best_match = "unknown"
        best_score = 0.0

        for category, fingerprints in KNOWN_HEADERS.items():
            for fingerprint in fingerprints:
                fingerprint_cleaned = self._clean_text(fingerprint)
                fp_ngrams = self._get_ngrams(fingerprint_cleaned)
                score = self._cosine_similarity(header_ngrams, fp_ngrams)
                if score > best_score:
                    best_score = score
                    best_match = category

        if best_score >= self.threshold:
            return best_match, best_score
        return "unknown", best_score

    def _process_item(self, index: int, header: Any) -> Dict[str, Any]:
        category, score = self._identify_header(header)
        result = {
            "index": index,
            "original": header,
            "cleaned": self._clean_text(header),
            "category": category,
            "confidence": score
        }
        with self._lock:
            self._progress += 1
            self._results.append(result)
        return result

    def process_batch(self, batch: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        if batch is None:
            batch = []
        if not isinstance(batch, (list, tuple)):
            batch = [batch]

        with self._lock:
            self._total = len(batch)
            self._progress = 0
            self._results = []
            self._status = "RUNNING"

        if self._total == 0:
            with self._lock:
                self._status = "COMPLETED"
            return []

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(32, (self._total + 9) // 10)) as executor:
            futures = {executor.submit(self._process_item, i, item): i for i, item in enumerate(batch)}
            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())

        with self._lock:
            self._status = "COMPLETED"
            self._results.sort(key=lambda x: x["index"])
            return list(self._results)

    def process_batch_async(self, batch: Optional[List[Any]] = None) -> None:
        if batch is None:
            batch = []
        if not isinstance(batch, (list, tuple)):
            batch = [batch]

        with self._lock:
            self._total = len(batch)
            self._progress = 0
            self._results = []
            self._status = "RUNNING"
            self._futures = []

            if self._total == 0:
                self._status = "COMPLETED"
                return

        def _worker(items):
            for i, item in items:
                self._process_item(i, item)

            with self._lock:
                if self._progress >= self._total:
                    self._status = "COMPLETED"

        chunk_size = max(1, self._total // 10)
        indexed_batch = list(enumerate(batch))
        chunks = [indexed_batch[i:i + chunk_size] for i in range(0, len(indexed_batch), chunk_size)]

        for chunk in chunks:
            future = self._executor.submit(_worker, chunk)
            with self._lock:
                self._futures.append(future)

    def get_progress(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "progress": self._progress,
                "total": self._total,
                "percentage": round((self._progress / self._total * 100) if self._total > 0 else 100.0, 2),
                "status": self._status
            }

    def get_results(self) -> List[Dict[str, Any]]:
        with self._lock:
            sorted_results = sorted(self._results, key=lambda x: x["index"])
            return list(sorted_results)

    def wait_completion(self, timeout: Optional[float] = None) -> bool:
        futures_to_wait = []
        with self._lock:
            futures_to_wait = list(self._futures)

        if not futures_to_wait:
            return True

        done, not_done = concurrent.futures.wait(futures_to_wait, timeout=timeout)
        return len(not_done) == 0
