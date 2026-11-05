import datetime
import calendar

def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_date(date_str, default=None):
    if not date_str:
        return default
    if isinstance(date_str, datetime.date):
        return date_str
    try:
        return datetime.datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return default

def calculate_prorated_social_security(params):
    """
    Calculate prorated social security and housing fund contributions based on join/leave dates.
    Includes built-in zero-configuration fault tolerance and audit trace.
    """
    audit_trace = []

    def log_trace(action, details):
        audit_trace.append({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "action": action,
            "details": details
        })

    log_trace("INIT", "Starting social security prorater calculation")

    # 1. Parse and clean parameters
    raw_salary = params.get("salary")
    salary = safe_float(raw_salary, 0.0)
    if salary != raw_salary:
        log_trace("CLEAN_DATA", f"Converted salary '{raw_salary}' to {salary}")

    # Rates with defaults
    rates = params.get("rates", {})
    if not isinstance(rates, dict):
        rates = {}
        log_trace("CLEAN_DATA", "Rates parameter invalid, defaulting to empty dict")

    p_soc = safe_float(rates.get("personal_social_security"), 0.08) # Default 8% for pension
    c_soc = safe_float(rates.get("company_social_security"), 0.16)  # Default 16% for pension
    p_hf = safe_float(rates.get("personal_housing_fund"), 0.07)     # Default 7%
    c_hf = safe_float(rates.get("company_housing_fund"), 0.07)      # Default 7%

    # Base bounds with defaults
    bounds = params.get("bounds", {})
    if not isinstance(bounds, dict):
        bounds = {}
    min_base = safe_float(bounds.get("min"), 3000.0)
    max_base = safe_float(bounds.get("max"), 30000.0)

    log_trace("APPLY_DEFAULTS", {
        "rates": {"p_soc": p_soc, "c_soc": c_soc, "p_hf": p_hf, "c_hf": c_hf},
        "bounds": {"min": min_base, "max": max_base}
    })

    # Dates
    target_month_str = params.get("target_month")
    if not target_month_str:
        target_month = datetime.date.today().replace(day=1)
        log_trace("APPLY_DEFAULTS", f"Target month not provided, defaulting to {target_month.strftime('%Y-%m')}")
    else:
        try:
            target_month = datetime.datetime.strptime(str(target_month_str), "%Y-%m").date()
        except ValueError:
            target_month = datetime.date.today().replace(day=1)
            log_trace("CLEAN_DATA", f"Invalid target month '{target_month_str}', defaulting to {target_month.strftime('%Y-%m')}")

    year = target_month.year
    month = target_month.month
    _, last_day_of_month = calendar.monthrange(year, month)
    total_days_in_month = last_day_of_month

    join_date = safe_date(params.get("join_date"))
    leave_date = safe_date(params.get("leave_date"))

    log_trace("DATE_PARSING", f"Parsed Join Date: {join_date}, Leave Date: {leave_date}, Target: {year}-{month:02d}")

    # 2. Determine working days in target month
    start_day = 1
    end_day = total_days_in_month

    if join_date and join_date.year == year and join_date.month == month:
        start_day = max(1, join_date.day)

    if leave_date and leave_date.year == year and leave_date.month == month:
        end_day = min(total_days_in_month, leave_date.day)

    # Edge case: left before month started or joined after month ended
    if (leave_date and leave_date < datetime.date(year, month, 1)) or \
       (join_date and join_date > datetime.date(year, month, last_day_of_month)):
        prorated_fraction = 0.0
        log_trace("CALCULATION", "Employee not active in target month, fraction = 0")
    elif start_day > end_day:
        prorated_fraction = 0.0
        log_trace("CALCULATION", f"Start day {start_day} > End day {end_day}, fraction = 0")
    else:
        active_days = end_day - start_day + 1
        prorated_fraction = active_days / total_days_in_month
        log_trace("CALCULATION", f"Active days: {active_days}/{total_days_in_month}, Prorated fraction: {prorated_fraction:.4f}")

    # 3. Calculate capped base
    base = salary
    capped_base = max(min_base, min(max_base, base))
    log_trace("BASE_CAPPING", f"Salary {salary} capped to bounds [{min_base}, {max_base}] -> {capped_base}")

    # 4. Prorate base
    prorated_base = capped_base * prorated_fraction
    log_trace("BASE_PRORATION", f"Prorated base = {capped_base} * {prorated_fraction:.4f} = {prorated_base:.2f}")

    # 5. Calculate contributions
    personal_soc = round(prorated_base * p_soc, 2)
    company_soc = round(prorated_base * c_soc, 2)
    personal_hf = round(prorated_base * p_hf, 2)
    company_hf = round(prorated_base * c_hf, 2)

    total_personal = round(personal_soc + personal_hf, 2)
    total_company = round(company_soc + company_hf, 2)

    log_trace("CONTRIBUTION_CALCULATION", {
        "personal_social": personal_soc,
        "company_social": company_soc,
        "personal_housing": personal_hf,
        "company_housing": company_hf
    })

    log_trace("COMPLETE", "Calculation finished successfully")

    result = {
        "prorated_fraction": round(prorated_fraction, 4),
        "capped_base": round(capped_base, 2),
        "prorated_base": round(prorated_base, 2),
        "contributions": {
            "personal": {
                "social_security": personal_soc,
                "housing_fund": personal_hf,
                "total": total_personal
            },
            "company": {
                "social_security": company_soc,
                "housing_fund": company_hf,
                "total": total_company
            }
        }
    }

    return {
        "result": result,
        "audit_trace": audit_trace
    }
