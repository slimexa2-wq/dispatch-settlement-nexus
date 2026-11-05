import datetime

class TieredRebateCalculator:
    @staticmethod
    def _parse_date(date_obj):
        if type(date_obj) is datetime.date:
            return date_obj
        if isinstance(date_obj, datetime.datetime):
            return date_obj.date()
        if isinstance(date_obj, str):
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
                try:
                    return datetime.datetime.strptime(date_obj, fmt).date()
                except ValueError:
                    pass
        return datetime.date.today()

    @staticmethod
    def _parse_absent_days(absent_days):
        if absent_days is None:
            return 0
        if isinstance(absent_days, (int, float)):
            return max(0, int(absent_days))
        if isinstance(absent_days, str):
            try:
                return max(0, int(float(absent_days)))
            except ValueError:
                pass
        return 0

    @staticmethod
    def _parse_tiers(tiers):
        default_tiers = [(45, 600.0), (30, 400.0), (15, 200.0), (7, 100.0)]
        if not tiers or not isinstance(tiers, list):
            return default_tiers

        parsed_tiers = []
        for tier in tiers:
            if isinstance(tier, (tuple, list)) and len(tier) == 2:
                try:
                    days = int(tier[0])
                    amount = float(tier[1])
                    parsed_tiers.append((days, amount))
                except (ValueError, TypeError):
                    pass

        if not parsed_tiers:
            return default_tiers

        # Sort by days descending so we find the highest tier first
        return sorted(parsed_tiers, key=lambda x: x[0], reverse=True)

    @classmethod
    def calculate(cls, entry_date=None, current_date=None, absent_days=None, tiers=None):
        entry_d = cls._parse_date(entry_date)
        current_d = cls._parse_date(current_date)
        absent_d = cls._parse_absent_days(absent_days)
        parsed_tiers = cls._parse_tiers(tiers)

        # Calculate effective days (total days - absent days)
        # We ensure total_days is at least 0.
        total_days = max(0, (current_d - entry_d).days)
        effective_days = max(0, total_days - absent_d)

        # Find the highest tier that effective_days satisfies
        for days, amount in parsed_tiers:
            if effective_days >= days:
                return amount

        return 0.0
