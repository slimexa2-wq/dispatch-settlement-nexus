/**
 * 纯规则、零模型的日期/时间快速通道。
 * 用于在进入意图路由 / 模型之前，先把常见的「现在几点」「今天几号」等
 * 基础时间问题用确定性规则秒回，避免落入慢速模型通道。
 *
 * 设计约束：分类必须是 DETERMINISTIC 且 ZERO-MODEL（速度硬要求）。
 */

const BUSINESS_KEYWORDS = [
  "项目", "人员", "招聘", "入职", "离职", "在职", "统计", "花名册",
  "工资", "供应商", "缺口", "达成", "进度", "档案", "办理", "名单", "报表", "人数"
];

// 「明确的纯日期问题」：先出现时间范围词，再出现日期单位词。
const PURE_DATE =
  /(今天|今日|明天|昨天|昨日|本周|这周|本月|这个月|今年|明年|去年).*(几号|日期|哪天|几月几号|星期|周几|礼拜|多少天|哪一年|几月)/;

const WEEKDAY_MAP: Record<string, string> = {
  Sunday: "星期日",
  Monday: "星期一",
  Tuesday: "星期二",
  Wednesday: "星期三",
  Thursday: "星期四",
  Friday: "星期五",
  Saturday: "星期六"
};

type ShanghaiParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function shanghaiParts(date: Date): ShanghaiParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute")
  };
}

function weekdayCn(date: Date): string {
  const en = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "long" }).format(date);
  return WEEKDAY_MAP[en] ?? en;
}

function offsetFromMessage(message: string): number {
  if (/明天|明日/.test(message)) return 1;
  if (/昨天|昨日/.test(message)) return -1;
  return 0;
}

function dayLabel(message: string): string {
  if (/明天|明日/.test(message)) return "明天";
  if (/昨天|昨日/.test(message)) return "昨天";
  return "今天";
}

export function dateTimeReply(message: string): string | null {
  const msg = message.trim();
  if (!msg) return null;

  // GUARD：含业务关键词且不是明确的纯日期问题 → 不劫持业务查询。
  const isBusiness = BUSINESS_KEYWORDS.some((keyword) => msg.includes(keyword));
  if (isBusiness && !PURE_DATE.test(msg)) return null;

  // 当前时间
  if (/(现在|几点|什么时间|时间|几点了)/.test(msg) && !/(几号|日期|星期|周几|礼拜|哪年)/.test(msg)) {
    const p = shanghaiParts(new Date());
    return `现在是北京时间 ${p.hour}:${p.minute}（${p.year}年${p.month}月${p.day}日 ${weekdayCn(new Date())}）。`;
  }

  // 星期几
  if (/星期几|周几|礼拜几|星期|周几|礼拜/.test(msg)) {
    const label = dayLabel(msg);
    const target = new Date(Date.now() + offsetFromMessage(msg) * 86400000);
    const p = shanghaiParts(target);
    return `${label}是 ${p.year}年${p.month}月${p.day}日 ${weekdayCn(target)}。`;
  }

  // 年份
  if (/哪一年|今年是哪年|年份/.test(msg)) {
    const p = shanghaiParts(new Date());
    return `今年是 ${p.year} 年。`;
  }

  // 当月天数
  if (/(多少天|有几天|几天)/.test(msg) && /(本月|这个月|这月|月份)/.test(msg)) {
    const p = shanghaiParts(new Date());
    const days = new Date(Date.UTC(Number(p.year), Number(p.month), 0)).getDate();
    return `${p.year}年${p.month}月一共有 ${days} 天。`;
  }

  // 日期
  if (/几号|日期|哪天|几月几号|今天是/.test(msg)) {
    const label = dayLabel(msg);
    const target = new Date(Date.now() + offsetFromMessage(msg) * 86400000);
    const p = shanghaiParts(target);
    return `${label}是 ${p.year}年${p.month}月${p.day}日（${weekdayCn(target)}）。`;
  }

  return null;
}
