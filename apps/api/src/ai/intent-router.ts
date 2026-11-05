import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { AppConfig } from "../config.js";
import { AiSchemaRegistry } from "./schema-registry.js";
import { OllamaClient } from "./ollama-client.js";
import type { AiSkill, IntentDecision } from "./types.js";

type KeywordConfig = {
  skills: Record<AiSkill, { strong: string[]; weak: string[]; exclusions: string[] }>;
};

const skillMeaning: Record<AiSkill, string> = {
  project_personnel_statistics: "项目入职数、离职数、当前在职、净增减",
  employee_information_query: "查询单个人员档案和生命周期",
  recruitment_progress_query: "招聘需求、完成人数、缺口、完成率",
  employee_entry: "给唯一人员办理入职",
  employee_resignation: "给唯一在职人员办理离职"
};

const unsafeOrOutOfScope = /批量|所有人|全部人员|全员|删除.{0,8}(人员|档案)|自由\s*SQL|绕过权限|跨权限/;
const unsupportedInformationalWords = /为什么.{0,8}(离职|辞职)|(?:离职|入职)政策/;
const informationalWriteWords = /为什么.{0,8}(离职|辞职)|(?:离职|入职)政策|什么时候(?:入职|离职)|(?:入职|离职)(?:时间|日期|记录)/;
const statisticalWriteWords = /人数|多少人|几个人|统计|趋势|报表|政策|记录|什么时候/;

function explicitWriteSkill(message: string): Extract<AiSkill, "employee_entry" | "employee_resignation"> | undefined {
  if (statisticalWriteWords.test(message)) return undefined;
  if (/(?:办理|办|登记|状态改成).{0,40}(?:入职|在职)|(?:入职|在职).{0,12}(?:办理|登记)/.test(message)) {
    return "employee_entry";
  }
  if (/(?:办理|办|登记|状态改成).{0,40}(?:离职|离岗)|(?:离职|离岗).{0,12}(?:办理|登记)/.test(message)) {
    return "employee_resignation";
  }
  return undefined;
}

function chinaDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function monthRange(offset = 0): { start_date: string; end_date: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value) - 1 + offset;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start_date: chinaDate(start), end_date: chinaDate(end) };
}

function explicitDates(message: string): Partial<{ start_date: string; end_date: string }> {
  const matches = [...message.matchAll(/(20\d{2})[-年/.](\d{1,2})(?:[-月/.](\d{1,2}))?/g)].map((match) => {
    const year = match[1]!;
    const month = match[2]!.padStart(2, "0");
    const day = match[3]?.padStart(2, "0");
    return day ? `${year}-${month}-${day}` : `${year}-${month}`;
  });
  if (matches.length) {
    const first = matches[0]!;
    const last = matches.at(-1)!;
    const start = first.length === 7 ? `${first}-01` : first;
    const lastDate = last.length === 7
      ? chinaDate(new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)))
      : last;
    return { start_date: start, end_date: lastDate };
  }
  if (message.includes("今天") || message.includes("今日")) return { start_date: chinaDate(), end_date: chinaDate() };
  if (message.includes("本月")) return monthRange();
  if (message.includes("上月")) return monthRange(-1);
  const year = new Date().getUTCFullYear();
  if (message.includes("上半年")) return { start_date: `${year}-01-01`, end_date: `${year}-06-30` };
  if (message.includes("下半年")) return { start_date: `${year}-07-01`, end_date: `${year}-12-31` };
  if (message.includes("今年")) return { start_date: `${year}-01-01`, end_date: `${year}-12-31` };
  return {};
}

function extractPersonName(message: string): string | undefined {
  const patterns = [
    // 带动作前缀（查/找/问下/给/为…），名字后紧跟属性词或句尾
    /(?:查询|查一下|查|找一下|找|问下|问一下|问|关于|帮我看|看看|看下|给|为)\s*([一-龥·]{2,4}?)(?=的|现在|今天|办理|入职|什么时候入职|离职|什么时候离职|状态|手机号|电话|资料|信息|档案|在哪|是哪个|是谁|花名册)/,
    // 动作前缀 + 名字结尾（查邱玉彬 / 找张三 / 问下李四）
    /(?:查询|查一下|查|找一下|找|问下|问一下|问)\s*([一-龥·]{2,4})$/,
    // 句首即名字，后跟状态/身份词（邱玉彬是谁 / 邱玉彬在哪个项目 / 邱玉彬的资料）
    /^([一-龥·]{2,6})(?:今天|现在|是否|的|在|是|资料|信息|档案|是谁)/,
    // 名字后紧跟属性词（张三在 / 李四的 / 王五资料 / 邱玉彬什么时候入职）
    /([一-龥·]{2,4})(?:在|是|的|资料|信息|档案|现在|目前|叫什么|是谁|什么时候入职|什么时候离职)/,
    // 保留：员工 Xxx
    /员工\s*([一-龥·]{2,6})/
  ];
  return patterns.map((pattern) => message.match(pattern)?.[1]).find(Boolean);
}

function extractProjectName(message: string): string | undefined {
  const quoted = message.match(/[“\"]([^”\"]{2,30})[”\"]/)?.[1];
  if (quoted) return quoted.replace(/项目$/, "");
  const withProject = message.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,30})项目/)?.[1]
    ?.replace(/^(请综合判断|综合判断|帮我看看|帮我看|查询|统计|看看|请查|本月|今年)/, "");
  if (withProject) return withProject;
  const talentSubject = message.match(/(?:综合判断|帮我看看|帮我看|查询|看看|请查)?([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,20})的人才/)?.[1];
  if (talentSubject) return talentSubject.replace(/^(请综合判断|综合判断|帮我看看|帮我看|查询|看看|请查)/, "");
  return message.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,30}(?:外包|工厂|基地|中心))(?:的|人才|招聘|人员|还|目前|招|缺|达成)/)?.[1]
    ?.replace(/^(请综合判断|综合判断|帮我看看|帮我看|查询|看看)/, "");
}

function extractParameters(skill: AiSkill, message: string): Record<string, unknown> {
  const dates = explicitDates(message);
  const projectName = extractProjectName(message);
  const digits = message.match(/(?<!\d)(1\d{10}|\d{4,10})(?!\d)/)?.[1];
  const personName = digits ? undefined : extractPersonName(message);
  switch (skill) {
    case "project_personnel_statistics": {
      const metrics: string[] = [];
      if (/入职/.test(message)) metrics.push("hire_count");
      if (/离职|离岗/.test(message)) metrics.push("resignation_count");
      if (/在职/.test(message)) metrics.push("current_headcount");
      if (/净增|增减|变化/.test(message)) metrics.push("net_change");
      if (!metrics.length) metrics.push("hire_count", "resignation_count", "current_headcount", "net_change");
      return { ...dates, project_name: projectName ?? null, branch_name: null, metrics, group_by: /每月|月度|趋势/.test(message) ? "month" : "none" };
    }
    case "employee_information_query":
      return {
        name: personName ?? null,
        phone: digits?.length === 11 ? digits : null,
        phone_suffix: digits && digits.length < 11 ? digits : null,
        employee_id: null
      };
    case "recruitment_progress_query":
      return {
        ...dates,
        project_name: projectName ?? null,
        branch_name: null,
        position_name: message.match(/(?:岗位|工种)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9-]{2,20})/)?.[1] ?? null,
        gap_greater_than: null,
        sort_by: /完成率/.test(message) ? "completion_rate_desc" : "gap_desc"
      };
    case "employee_entry":
      return {
        employee_id: null,
        employee_name: personName ?? null,
        phone: digits?.length === 11 ? digits : null,
        phone_suffix: digits && digits.length < 11 ? digits : null,
        entry_date: dates.start_date ?? chinaDate(),
        project_id: null,
        position_id: null,
        supplier_id: null,
        insurance_status: null,
        remark: null
      };
    case "employee_resignation":
      return {
        employee_id: null,
        employee_name: personName ?? null,
        phone: digits?.length === 11 ? digits : null,
        phone_suffix: digits && digits.length < 11 ? digits : null,
        resignation_date: dates.start_date ?? chinaDate(),
        resignation_reason: message.match(/原因(?:是|为|：|:)?\s*([^，。；;]+)|因([^，。；;]+?)(?:离职|辞职)/)?.slice(1).find(Boolean) ?? null,
        remark: null
      };
  }
}

export class IntentRouter {
  private keywords?: KeywordConfig;

  constructor(
    private readonly config: AppConfig,
    private readonly schemas: AiSchemaRegistry,
    private readonly model: OllamaClient
  ) {}

  async load(): Promise<void> {
    this.keywords = parse(await readFile(join(this.config.AI_SKILL_ROOT, "config", "intent-keywords.yaml"), "utf8")) as KeywordConfig;
  }

  isLoaded(): boolean {
    return Boolean(this.keywords);
  }

  async route(message: string, allowed: AiSkill[], supplied: Record<string, unknown> = {}): Promise<IntentDecision> {
    if (!this.keywords) throw new Error("AI 规则尚未加载");
    if (unsafeOrOutOfScope.test(message)) {
      return {
        skill: "unsupported",
        confidence: 1,
        mode: "unsupported",
        parameters: supplied,
        needs_clarification: true,
        clarification_question: "该请求超出已确认能力范围，AI 不支持批量、删除、自由 SQL 或绕过权限。",
        reason: "安全边界规则拒绝",
        routeType: "rule"
      };
    }
    if (unsupportedInformationalWords.test(message)) {
      return {
        skill: "unsupported",
        confidence: 1,
        mode: "unsupported",
        parameters: supplied,
        needs_clarification: true,
        clarification_question: "该问题不是人员状态变更指令，AI 不会触发入职或离职写操作。",
        reason: "信息咨询禁止误触发写操作",
        routeType: "rule"
      };
    }
    const forcedWrite = explicitWriteSkill(message);
    if (forcedWrite) {
      const parameters = { ...extractParameters(forcedWrite, message), ...supplied };
      const missingReason = forcedWrite === "employee_resignation" && !parameters.resignation_reason;
      return {
        skill: forcedWrite,
        confidence: 1,
        mode: "write",
        parameters,
        needs_clarification: missingReason,
        clarification_question: missingReason ? "请提供离职原因后，我再生成离职预览。" : null,
        reason: "明确单人状态变更指令",
        routeType: "rule"
      };
    }
    const ranked = allowed.map((skill) => {
      const item = this.keywords!.skills[skill];
      if (item.exclusions.some((word) => message.includes(word))) return { skill, strong: 0, weak: 0, score: 0 };
      const strong = item.strong.filter((word) => message.includes(word)).length;
      const weak = item.weak.filter((word) => message.includes(word)).length;
      return { skill, strong, weak, score: strong * 10 + weak };
    }).sort((a, b) => b.score - a.score);
    const strongMatches = ranked.filter((item) => item.strong > 0);
    if (strongMatches.length === 1 && strongMatches[0]!.score > (strongMatches[1]?.score ?? 0)) {
      const skill = strongMatches[0]!.skill;
      return {
        skill,
        confidence: 0.98,
        mode: skill === "employee_entry" || skill === "employee_resignation" ? "write" : "read",
        parameters: { ...extractParameters(skill, message), ...supplied },
        needs_clarification: false,
        clarification_question: null,
        reason: "强规则唯一命中",
        routeType: "rule"
      };
    }

    const best = ranked.find((item) => item.score > 0);
    if (best) {
      const skill = best.skill;
      const isWrite = skill === "employee_entry" || skill === "employee_resignation";
      return {
        skill,
        confidence: Math.min(0.9, 0.5 + best.score / 20),
        mode: isWrite ? "write" : "read",
        parameters: { ...extractParameters(skill, message), ...supplied },
        needs_clarification: isWrite,
        clarification_question: isWrite ? "请确认要为以下人员办理，我将生成预览供你确认。" : null,
        reason: "关键词评分最高命中",
        routeType: "rule"
      };
    }
    if (!informationalWriteWords.test(message)) {
      try {
        const candidates = allowed.map((skill) => `${skill}=${skillMeaning[skill]}`).join("；");
        const modelDecision = await this.model.completeJson([
          {
            role: "system",
            content: [
              "你只负责在候选业务意图中选择，不查询数据、不执行操作。",
              `候选：${candidates}；unsupported=与候选无关。`,
              "批量、删除、自由SQL、绕过权限必须选unsupported。",
              "询问为什么离职、入离职政策、什么时候入离职属于查询或unsupported，绝不能选写操作。",
              "只返回符合Schema的JSON。"
            ].join("")
          },
          { role: "user", content: message }
        ], this.schemas.toolsFor(allowed, 4));
        this.schemas.validateIntent(modelDecision);
        const skill = modelDecision.skill as AiSkill | "unsupported";
        if (skill !== "unsupported" && allowed.includes(skill)) {
          const modelParameters = typeof modelDecision.parameters === "object" && modelDecision.parameters
            ? modelDecision.parameters as Record<string, unknown>
            : {};
          return {
            skill,
            confidence: typeof modelDecision.confidence === "number" ? modelDecision.confidence : 0.82,
            mode: skill === "employee_entry" || skill === "employee_resignation" ? "write" : "read",
            parameters: { ...extractParameters(skill, message), ...modelParameters, ...supplied },
            needs_clarification: Boolean(modelDecision.needs_clarification),
            clarification_question: typeof modelDecision.clarification_question === "string" ? modelDecision.clarification_question : null,
            reason: "本地模型语义匹配",
            routeType: "model"
          };
        }
      } catch {
        // 模型超时、熔断或输出未通过 Schema 时，继续返回标准表单，不影响传统系统。
      }
    }
    return {
      skill: "unsupported",
      confidence: 0,
      mode: "unsupported",
      parameters: supplied,
      needs_clarification: true,
      clarification_question: "我目前只支持项目人员数据、人员信息、招聘进度、单人入职和单人离职。",
      reason: "规则与模型均未命中固定能力范围",
      routeType: "form"
    };
  }
}
