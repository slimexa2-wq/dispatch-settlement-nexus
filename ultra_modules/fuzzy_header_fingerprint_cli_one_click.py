import json
import argparse
import sys
from typing import List, Dict, Union, Any, Optional

try:
    from ultra_modules.fuzzy_header_fingerprint_core_engine import identify_header, DEFAULT_TARGET_HEADERS
except ImportError:
    # Fallback for some test environments or if run independently without proper path
    def identify_header(raw_header: Any, target_headers: Optional[List[str]] = None, threshold: float = 0.3) -> Optional[str]:
        # Dummy implementation if import fails, normally should never happen in prod
        return None
    DEFAULT_TARGET_HEADERS = []

def process_headers(headers: Any, target_headers: Optional[List[str]] = None) -> Dict[str, Optional[str]]:
    """
    Process a list or string of headers and return a mapping of original to standard header.
    Self-heals dirty data (e.g., None, integers, dictionaries).
    """
    result = {}
    if not isinstance(headers, (list, tuple)):
        if isinstance(headers, dict):
            # If a dictionary is passed, assume keys are headers
            headers = list(headers.keys())
        elif headers is None:
            return result
        else:
            # Treat as a single header
            headers = [headers]

    for header in headers:
        header_str = str(header) if header is not None else ""
        if not header_str:
            # Don't try to identify entirely empty/None headers
            continue
        # Use identify_header to find the best match
        identified = identify_header(header, target_headers=target_headers)
        result[header_str] = identified

    return result

def run_cli_one_click(input_data: Any = None, target_headers: Optional[List[str]] = None) -> Dict[str, Optional[str]]:
    """
    Zero-configuration one-click entry point.

    If input_data is provided:
        - If string, tries to parse as JSON. If fails, treats as single header.
        - If list, processes as list of headers.
        - If dict, uses keys.
    If input_data is not provided (None):
        - Attempts to read from sys.argv (CLI arguments).
        - If sys.argv has arguments, treats the first positional argument as JSON string or comma-separated headers.
        - If no arguments, returns an empty dict gracefully.

    Supports Excel indirectly: the caller can just pass the first row (list of values) from Excel directly into this function.
    """
    if target_headers is None:
        target_headers = DEFAULT_TARGET_HEADERS

    if input_data is None:
        # One-click CLI behavior
        if len(sys.argv) > 1:
            raw_arg = sys.argv[1]
            try:
                # Try JSON first
                parsed = json.loads(raw_arg)
                input_data = parsed
            except json.JSONDecodeError:
                # Fallback to comma separated
                input_data = [h.strip() for h in raw_arg.split(",")]
        else:
            # Complete missing parameter fallback, return empty mapping
            return {}

    # Self-healing: if input_data is passed but it's a string, try JSON
    if isinstance(input_data, str):
        try:
            input_data = json.loads(input_data)
        except json.JSONDecodeError:
            input_data = [h.strip() for h in input_data.split(",")]

    return process_headers(input_data, target_headers)

if __name__ == "__main__":
    # Zero-configuration one-click execution
    print(json.dumps(run_cli_one_click(), ensure_ascii=False, indent=2))
