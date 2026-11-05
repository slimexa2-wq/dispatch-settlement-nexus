import concurrent.futures
from typing import List, Dict, Any

class UtilityFeeRoomSplitterBatchPipeline:
    """
    水电费/住宿管理费按同宿舍实际在住天数自动平摊扣款计算器。
    支持批量流式处理、高吞吐并发、脏数据自愈及缺参默认兜底。
    """

    def __init__(self, default_stay_days: int = 30):
        self.default_stay_days = default_stay_days

    def calculate_room_fee(self, room_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        计算单个宿舍的水电费平摊
        room_data: {
            "room_id": str,
            "total_fee": float,
            "residents": [
                {"resident_id": str, "stay_days": int}
            ]
        }
        """
        room_id = room_data.get("room_id", "unknown")

        try:
            total_fee = float(room_data.get("total_fee", 0.0))
        except (ValueError, TypeError):
            total_fee = 0.0

        residents = room_data.get("residents", [])
        if not isinstance(residents, list):
            residents = []

        processed_residents = []
        total_stay_days = 0

        # 1. 预处理租客数据，清理脏数据并计算总天数
        for r in residents:
            if not isinstance(r, dict):
                continue

            resident_id = r.get("resident_id", "unknown")
            try:
                stay_days = int(r.get("stay_days", self.default_stay_days))
                if stay_days < 0:
                    stay_days = 0
            except (ValueError, TypeError):
                stay_days = self.default_stay_days

            processed_residents.append({
                "resident_id": resident_id,
                "stay_days": stay_days,
                "fee": 0.0
            })
            total_stay_days += stay_days

        # 2. 计算分摊费用
        if total_stay_days == 0 or total_fee <= 0 or not processed_residents:
            return {
                "room_id": room_id,
                "total_fee": total_fee,
                "status": "success",
                "split_details": processed_residents,
                "error": None
            }

        # 按天数比例分配，处理精度问题
        allocated_fee = 0.0
        # 寻找最后一个入住天数大于0的人作为兜底者
        last_valid_idx = -1
        for i, r in enumerate(processed_residents):
            if r["stay_days"] > 0:
                last_valid_idx = i

        for i, r in enumerate(processed_residents):
            if r["stay_days"] == 0:
                r["fee"] = 0.0
                continue

            if i == last_valid_idx:
                # 最后一个有效租客，用减法兜底，防止精度丢失
                fee = round(total_fee - allocated_fee, 2)
            else:
                fee = round((r["stay_days"] / total_stay_days) * total_fee, 2)
                allocated_fee += fee
            r["fee"] = max(0.0, fee) # 防负数

        return {
            "room_id": room_id,
            "total_fee": total_fee,
            "status": "success",
            "split_details": processed_residents,
            "error": None
        }

    def process_batch(self, batch_data: List[Dict[str, Any]], max_workers: int = 10) -> List[Dict[str, Any]]:
        """
        批量流式处理多个宿舍的数据，支持高吞吐并发
        """
        if not isinstance(batch_data, list):
            return []

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_room = {
                executor.submit(self.calculate_room_fee, room_data): room_data
                for room_data in batch_data if isinstance(room_data, dict)
            }

            for future in concurrent.futures.as_completed(future_to_room):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    # 极少情况的未捕获异常兜底
                    room_data = future_to_room[future]
                    results.append({
                        "room_id": room_data.get("room_id", "unknown"),
                        "total_fee": 0.0,
                        "status": "error",
                        "split_details": [],
                        "error": str(e)
                    })

        return results
