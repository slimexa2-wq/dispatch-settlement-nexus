def calculate_deduction_and_net_pay(
    base_salary=0.0,
    weekly_advances=None,
    min_remaining_pay=0.0
):
    """
    工人每周借支/生活费预支自动抵扣当月实发工资防超扣保护器
    核心纯函数算法与零配置自动容错实现。

    :param base_salary: 当月应发工资
    :param weekly_advances: 每周预支/借支金额列表
    :param min_remaining_pay: 最低保留工资（防超扣底线，默认0）
    :return: 包含清洗后基础数据、实际抵扣额、实发薪资及未收回预支款的字典
    """
    if weekly_advances is None:
        weekly_advances = []

    # 1. 脏数据静默清洗 - 基础工资
    try:
        clean_base = float(base_salary)
        # 处理 NaN 和负数
        if clean_base != clean_base or clean_base < 0:
            clean_base = 0.0
    except (ValueError, TypeError):
        clean_base = 0.0

    # 2. 脏数据静默清洗 - 最低保留工资
    try:
        clean_min = float(min_remaining_pay)
        if clean_min != clean_min or clean_min < 0:
            clean_min = 0.0
    except (ValueError, TypeError):
        clean_min = 0.0

    # 3. 脏数据静默清洗 - 预支列表
    total_advance = 0.0
    if isinstance(weekly_advances, (list, tuple)):
        for adv in weekly_advances:
            try:
                val = float(adv)
                if val == val and val > 0:  # 忽略 NaN 和负数/0预支
                    total_advance += val
            except (ValueError, TypeError):
                continue
    elif isinstance(weekly_advances, (int, float, str)):
        # 容错：如果传入了单个值而不是列表
        try:
            val = float(weekly_advances)
            if val == val and val > 0:
                total_advance += val
        except (ValueError, TypeError):
            pass

    # 4. 核心防御与抵扣逻辑
    # 可抵扣最大额度：基础工资减去必须保留的底线（不能为负）
    max_deductible = max(0.0, clean_base - clean_min)

    # 实际扣除金额
    actual_deduction = min(total_advance, max_deductible)

    # 实发金额
    net_pay = clean_base - actual_deduction

    # 仍未收回的预支金额（可用于下月继续扣或者记账）
    unrecovered = total_advance - actual_deduction

    return {
        "base_salary": round(clean_base, 2),
        "total_advance_requested": round(total_advance, 2),
        "actual_deduction": round(actual_deduction, 2),
        "net_pay": round(net_pay, 2),
        "unrecovered_advance": round(unrecovered, 2)
    }
