def generate_client_bill_summary(data=None, defaults=None):
    """
    Generate client bill summary with auto error correction and defaults.

    :param data: list of dictionaries representing individual billing entries.
    :param defaults: dictionary of default parameters for the billing process.
    :return: dictionary with aggregated billing info.
    """
    if data is None:
        data = []

    if defaults is None:
        defaults = {}

    # Default values and rules
    default_management_fee_rate = float(defaults.get('management_fee_rate', 0.05))
    default_tax_rate = float(defaults.get('tax_rate', 0.06))
    default_hourly_rate = float(defaults.get('hourly_rate', 0.0))

    total_hours = 0.0
    total_base_cost = 0.0

    clean_data = []

    for item in data:
        if not isinstance(item, dict):
            continue

        try:
            # Dirty data silent clean
            hours = float(item.get('hours', 0.0))
            if hours < 0 or hours != hours:  # check for negative or NaN
                hours = 0.0
        except (ValueError, TypeError):
            hours = 0.0

        try:
            rate = float(item.get('rate', default_hourly_rate))
            if rate < 0 or rate != rate:
                rate = default_hourly_rate
        except (ValueError, TypeError):
            rate = default_hourly_rate

        total_hours += hours
        base_cost = hours * rate
        total_base_cost += base_cost

        clean_item = {
            'hours': hours,
            'rate': rate,
            'base_cost': base_cost,
        }
        # Copy other fields for reference
        for k, v in item.items():
            if k not in ['hours', 'rate']:
                clean_item[k] = v
        clean_data.append(clean_item)

    management_fee = total_base_cost * default_management_fee_rate
    subtotal = total_base_cost + management_fee
    tax = subtotal * default_tax_rate
    grand_total = subtotal + tax

    return {
        'total_hours': round(total_hours, 2),
        'total_base_cost': round(total_base_cost, 2),
        'management_fee_rate': default_management_fee_rate,
        'management_fee': round(management_fee, 2),
        'tax_rate': default_tax_rate,
        'tax': round(tax, 2),
        'subtotal': round(subtotal, 2),
        'grand_total': round(grand_total, 2),
        'clean_data': clean_data,
        'entry_count': len(clean_data)
    }
