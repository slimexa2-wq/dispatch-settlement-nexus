import { DEFAULT_PERSONA } from "./system-prompt.js";

const CASUAL_EXACT = [
  "你好", "您好", "在吗", "在不在", "嗨", "hi", "hello", "哈喽",
  "早", "早上好", "下午好", "晚上好", "晚安", "辛苦了", "谢谢", "感谢",
  "不客气", "哈哈", "好的", "ok", "OK", "没事", "没事了"
];

const CHATTY_HINTS = ["天气", "吃饭", "周末", "无聊", "觉得", "喜欢", "今天", "明天", "昨天", "好累", "困了", "开心", "难过"];
const BUSINESS_STRONG = [
  "项目", "人员", "招聘", "入职", "离职", "统计", "查询", "多少", "名单",
  "电话", "手机号", "工资", "花名册", "供应商", "在职", "缺口", "达成",
  "办理", "信息", "档案", "状态", "谁", "哪个", "进度"
];

/**
 * 快路径规则层：身份类 / 问候类意图直接返回预置模板，零模型调用，毫秒级返回。
 * 身份模板用 DEFAULT_PERSONA 拼，确保"你是谁"等自报准确（模型裸答会乱报"我是Qwen3.5"）。
 * 命中返回模板字符串；未命中返回 null（交由后续逻辑处理）。
 */
export function fastPathReply(message: string): string | null {
  const m = message.trim();
  if (
    /^(你是谁|你叫什么|你是什么|你的名字|你是机器人吗|你是ai吗|你是什么助手|你的身份|介绍一下你自己)/i.test(m) ||
    /你是谁|你叫什么名字|你的身份是什么|介绍一下你自己/.test(m)
  ) {
    const p = DEFAULT_PERSONA;
    return `我是${p.name}，由${p.org}开发，是${p.role}。我可以帮你查询项目人员统计、人员信息、招聘进度，也欢迎日常闲聊～`;
  }
  if (CASUAL_EXACT.some((w) => m === w || m.startsWith(w))) {
    return "你好！我是祥能AI业务助手，有什么可以帮你的吗？";
  }
  return null;
}

/**
 * 闲聊直通车判定：无业务关键词的短句闲聊（如"今天天气真好"），
 * 跳过 router.route() 那一次意图分类模型调用，直接走通用生成，省 ~3s。
 */
export function isCasualChat(message: string): boolean {
  const m = message.trim();
  if (m.length > 16) return false;
  if (CASUAL_EXACT.some((w) => m === w || m.startsWith(w))) return true;
  if (CHATTY_HINTS.some((w) => m.includes(w)) && !BUSINESS_STRONG.some((w) => m.includes(w))) return true;
  return false;
}
