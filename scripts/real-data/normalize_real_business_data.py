from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from normalization import normalize_real_business_data
from workbook_readers import read_xls, read_xlsx, rows_as_records


def file_hash(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize Xiangneng internal business workbooks")
    parser.add_argument("--weekly", required=True)
    parser.add_argument("--enterprise", required=True)
    parser.add_argument("--roster")
    parser.add_argument("--output", required=True)
    parser.add_argument("--reconciliation", required=True)
    args = parser.parse_args()

    weekly_path = Path(args.weekly)
    enterprise_path = Path(args.enterprise)
    roster_path = Path(args.roster) if args.roster else None

    weekly_book = read_xlsx(weekly_path)
    weekly_rows = rows_as_records(weekly_book["周度数据表"], 1)
    enterprise_book = read_xls(enterprise_path)
    enterprise_rows = rows_as_records(
        enterprise_book["项目数据总表"],
        0,
        {"面试日期", "入职日期", "离职日期"},
    )
    roster_rows = []
    if roster_path:
        roster_book = read_xlsx(roster_path)
        roster_rows = rows_as_records(
            roster_book["花名册"],
            1,
            {"入职时间", "离职时间", "合同开始时间", "合同结束时间", "转正日期", "变更时间"},
        )

    normalized = normalize_real_business_data(weekly_rows, enterprise_rows, roster_rows)
    normalized["meta"]["sources"] = {
        "weekly": {"file": weekly_path.name, "sha256": file_hash(weekly_path)},
        "enterprise": {"file": enterprise_path.name, "sha256": file_hash(enterprise_path)},
        "roster": {"file": roster_path.name, "sha256": file_hash(roster_path)} if roster_path else None,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    reconciliation = {
        "sources": normalized["meta"]["sources"],
        "counts": {
            "weeklyRows": len(weekly_rows),
            "enterpriseRows": len(enterprise_rows),
            "rosterRows": len(roster_rows),
            "organizationUnits": len(normalized["organizationUnits"]),
            "branches": len(normalized["branches"]),
            "projects": len(normalized["projects"]),
            "people": len(normalized["people"]),
            "applications": len(normalized["applications"]),
            "internalEmployees": len(normalized["internalEmployees"]),
            "unresolved": len(normalized["unresolved"]),
        },
        "statusDistribution": {},
        "unresolved": normalized["unresolved"],
    }
    for person in normalized["people"]:
        status = person["status"]
        reconciliation["statusDistribution"][status] = reconciliation["statusDistribution"].get(status, 0) + 1
    reconciliation_path = Path(args.reconciliation)
    reconciliation_path.parent.mkdir(parents=True, exist_ok=True)
    reconciliation_path.write_text(json.dumps(reconciliation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(reconciliation["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
