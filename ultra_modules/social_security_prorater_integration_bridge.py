import math
import decimal
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, Union

# Set default rounding context for financial ops
decimal.getcontext().rounding = decimal.ROUND_HALF_UP

class SocialSecurityProraterBridge:
    """
    Bridge module for Social Security & Housing Fund prorated amounts calculation.
    Features:
    - Silent schema forward-compatibility (maps old schema to new schema).
    - Fault-tolerant data sanitization (handles strings, NaNs, missing properties).
    - High-precision calculation using Decimal.
    - Zero configuration / sensible defaults.
    - Audit log for traceability without cluttering the frontend.
    """

    # Keyword mappings (old schema keys -> new standard keys)
    SCHEMA_MAPPINGS = {
        'salary_base': 'base_salary',
        'base': 'base_salary',
        'min_salary_base': 'min_base',
        'lower_bound': 'min_base',
        'min_cap': 'min_base',
        'max_salary_base': 'max_base',
        'upper_bound': 'max_base',
        'max_cap': 'max_base',
        'emp_social_rate': 'social_rate_employee',
        'personal_social_rate': 'social_rate_employee',
        'comp_social_rate': 'social_rate_employer',
        'company_social_rate': 'social_rate_employer',
        'emp_housing_rate': 'housing_rate_employee',
        'personal_housing_rate': 'housing_rate_employee',
        'comp_housing_rate': 'housing_rate_employer',
        'company_housing_rate': 'housing_rate_employer',
        'rule': 'proration_rule',
        'calc_rule': 'proration_rule',
        'method': 'proration_rule',
        'worked_days': 'days_worked',
        'actual_days': 'days_worked',
        'standard_days': 'standard_working_days',
        'month_days': 'standard_working_days',
    }

    @staticmethod
    def _safe_decimal(val: Any, default: str = '0.0') -> Decimal:
        """Silently convert dirty data into Decimal."""
        try:
            if val is None:
                return Decimal(default)
            if isinstance(val, (int, float)):
                if math.isnan(val) or math.isinf(val):
                    return Decimal(default)
                return Decimal(str(val))
            if isinstance(val, str):
                val = val.replace(',', '').strip()
                if not val:
                    return Decimal(default)
                return Decimal(val)
            if isinstance(val, Decimal):
                if val.is_nan() or val.is_infinite():
                    return Decimal(default)
                return val
        except (ValueError, TypeError, InvalidOperation):
            pass
        return Decimal(default)

    @staticmethod
    def _map_schema(params: Dict[str, Any], audit_log: list) -> Dict[str, Any]:
        """Map alternative/legacy fields to standard schema."""
        mapped = {}
        for key, value in params.items():
            norm_key = key.lower().strip()
            if norm_key in SocialSecurityProraterBridge.SCHEMA_MAPPINGS:
                std_key = SocialSecurityProraterBridge.SCHEMA_MAPPINGS[norm_key]
                mapped[std_key] = value
                audit_log.append(f"Mapped field '{key}' -> '{std_key}'")
            else:
                mapped[norm_key] = value
        return mapped

    @classmethod
    def calculate(cls, params: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Calculate prorated social security and housing funds with full traceability.
        """
        audit_log = []
        if params is None or not isinstance(params, dict):
            audit_log.append("Invalid or missing params, defaulting to empty dict.")
            params = {}

        # 1. Schema mapping
        std_params = cls._map_schema(params, audit_log)

        # 2. Data Sanitization & Self-Healing
        base_salary = cls._safe_decimal(std_params.get('base_salary'), '0.0')
        base_salary = max(Decimal('0.0'), base_salary)

        min_base = cls._safe_decimal(std_params.get('min_base'), '0.0')
        max_base = cls._safe_decimal(std_params.get('max_base'), '9999999.0')

        if min_base > max_base:
            audit_log.append("min_base > max_base detected, swapping values.")
            min_base, max_base = max_base, min_base

        effective_base = min(max_base, max(min_base, base_salary))
        audit_log.append(f"Effective base determined: {effective_base} (base: {base_salary}, min: {min_base}, max: {max_base})")

        social_rate_ee = cls._safe_decimal(std_params.get('social_rate_employee'), '0.0')
        social_rate_er = cls._safe_decimal(std_params.get('social_rate_employer'), '0.0')
        housing_rate_ee = cls._safe_decimal(std_params.get('housing_rate_employee'), '0.0')
        housing_rate_er = cls._safe_decimal(std_params.get('housing_rate_employer'), '0.0')

        proration_rule = str(std_params.get('proration_rule', 'full_month')).strip().lower()
        if proration_rule not in ('full_month', 'by_day'):
            audit_log.append(f"Invalid proration_rule '{proration_rule}', defaulting to 'full_month'.")
            proration_rule = 'full_month'

        standard_days = cls._safe_decimal(std_params.get('standard_working_days'), '21.75')
        if standard_days <= Decimal('0.0'):
            audit_log.append(f"Invalid standard_working_days {standard_days}, defaulting to 21.75.")
            standard_days = Decimal('21.75')

        days_worked = cls._safe_decimal(std_params.get('days_worked'), str(standard_days))
        if days_worked < Decimal('0.0'):
            days_worked = Decimal('0.0')
        if days_worked > standard_days:
            audit_log.append(f"days_worked ({days_worked}) > standard_days ({standard_days}), capping at standard_days.")
            days_worked = standard_days

        # 3. Calculation
        if proration_rule == 'by_day':
            proration_factor = days_worked / standard_days
        else: # full_month
            proration_factor = Decimal('1.0') if days_worked > Decimal('0.0') else Decimal('0.0')

        audit_log.append(f"Proration rule '{proration_rule}', calculated factor: {proration_factor:.4f}")

        prorated_base = effective_base * proration_factor

        # Calculate amounts
        quant = Decimal('0.01')
        social_ee_amt = (prorated_base * social_rate_ee).quantize(quant)
        social_er_amt = (prorated_base * social_rate_er).quantize(quant)
        housing_ee_amt = (prorated_base * housing_rate_ee).quantize(quant)
        housing_er_amt = (prorated_base * housing_rate_er).quantize(quant)

        total_ee = social_ee_amt + housing_ee_amt
        total_er = social_er_amt + housing_er_amt

        audit_log.append("Calculation completed successfully.")

        # 4. Result formulation
        return {
            'effective_base': float(effective_base.quantize(quant)),
            'prorated_base': float(prorated_base.quantize(quant)),
            'proration_factor': float(proration_factor.quantize(Decimal('0.0001'))),
            'social_employee_amt': float(social_ee_amt),
            'social_employer_amt': float(social_er_amt),
            'housing_employee_amt': float(housing_ee_amt),
            'housing_employer_amt': float(housing_er_amt),
            'total_employee_amt': float(total_ee),
            'total_employer_amt': float(total_er),
            'audit_log': audit_log
        }
