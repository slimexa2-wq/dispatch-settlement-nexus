/**
 * AI 助手核心逻辑（演示模式）
 * 意图识别 → 数据查询 → 操作执行 → 响应生成
 */
import type { Person, JobDemand, DashboardData } from "../types/domain";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface AiChatRequest {
  message: string;
  context?: {
    role: string;
    currentProject?: string;
  };
}

export interface AiChatResponse {
  reply: string;
  actions?: AiAction[];
  data?: unknown;
}

export interface AiAction {
  type: "offboard" | "query" | "update" | "export";
  target?: string;
  payload?: Record<string, unknown>;
  executed: boolean;
  result?: string;
}

/**
 * 意图识别：解析用户消息，提取实体和意图
 */
function parseIntent(message: string): {
  intent: "offboard" | "query_stats" | "query_project" | "update_person" | "unknown";
  personName?: string;
  projectName?: string;
  reason?: string;
  months?: number[];
  year?: number;
  payload?: Record<string, unknown>;
} {
  const text = message.trim();

  // 离职登记：xxx今天离职，离职原因是xxx / xxx离职了，因为xxx
  const offboardMatch = text.match(/(?:(\S+?)(?:今天)?(?:离职|走|辞职)了?[,，]?原因?(?:是|为|因为)?(.+?)[.。]?$)/);
  if (offboardMatch) {
    return {
      intent: "offboard",
      personName: offboardMatch[1],
      reason: offboardMatch[2]?.trim()
    };
  }

  // 查询项目月度数据：xxx项目1-6月入职数据 / xxx项目1到6月入职人数
  const projectMatch = text.match(/(?:(\S+?项目?|四川时代|索尔思|京东方|德方|极米)(?:的)?(?:1[-到至~]6月?|1月?到6月?|上半年)(?:的)?(?:入职|招聘|到岗)(?:人数|数据|统计)?)/);
  if (projectMatch) {
    return {
      intent: "query_project",
      projectName: projectMatch[1],
      months: [1, 2, 3, 4, 5, 6],
      year: 2026
    };
  }

  // 查询整体统计：今日面试人数 / 当前在职人数
  if (text.includes("今日面试") || text.includes("今天面试")) {
    return { intent: "query_stats" };
  }
  if (text.includes("在职人数") || text.includes("当前在职")) {
    return { intent: "query_stats" };
  }

  // 修改人员状态：把xxx状态改成xxx / 更新xxx状态为xxx
  const updateMatch = text.match(/(?:把|将)(\S+?)(?:的)?状态?(?:改|更新|调整)(?:为|成|到)(\S+?)[.。]?$/);
  if (updateMatch) {
    return {
      intent: "update_person",
      personName: updateMatch[1],
      payload: { status: updateMatch[2] }
    };
  }

  return { intent: "unknown" };
}

/**
 * 查询人员信息
 */
async function findPerson(
  people: Person[],
  name: string
): Promise<Person | undefined> {
  return people.find((p) => p.name === name || p.name?.includes(name));
}

/**
 * 查询项目月度入职数据
 */
async function queryProjectMonthlyData(
  people: Person[],
  projectName: string,
  year: number,
  months: number[]
): Promise<Array<{ month: number; count: number }>> {
  const result: Array<{ month: number; count: number }> = [];
  for (const month of months) {
    const count = people.filter((p) => {
      if (!p.onboardDate) return false;
      const date = new Date(p.onboardDate);
      return date.getFullYear() === year && date.getMonth() + 1 === month;
    }).length;
    result.push({ month, count });
  }
  return result;
}

/**
 * 处理 AI 聊天请求
 */
export async function processAiChat(
  request: AiChatRequest,
  people: Person[],
  jobs: JobDemand[],
  statistics: DashboardData | null
): Promise<AiChatResponse> {
  const { message } = request;
  const parsed = parseIntent(message);

  switch (parsed.intent) {
    case "offboard": {
      const person = await findPerson(people, parsed.personName!);
      if (!person) {
        return {
          reply: `未找到员工"${parsed.personName}"，请确认姓名是否正确。您可以先查看人员列表确认。`,
          actions: [{ type: "query", executed: false }]
        };
      }
      return {
        reply: parsed.reason
          ? `已识别离职登记请求：\n- 员工：${person.name}\n- 原因：${parsed.reason}\n- 时间：今天\n\n确认执行离职登记操作吗？`
          : `已找到员工 ${person.name}。请先提供离职原因，系统取得完整参数后才会生成操作预览。`,
        actions: parsed.reason
          ? [{
              type: "offboard",
              target: person.id,
              payload: { reason: parsed.reason },
              executed: false
            }]
          : [{ type: "query", executed: false }],
        data: { person }
      };
    }

    case "query_project": {
      const monthlyData = await queryProjectMonthlyData(people, parsed.projectName!, parsed.year!, parsed.months!);
      const total = monthlyData.reduce((sum, item) => sum + item.count, 0);
      const monthText = monthlyData.map((item) => `${item.month}月 ${item.count}人`).join("、");
      return {
        reply: `${parsed.projectName}项目 2026 年 1-6 月入职数据：\n\n${monthText}\n\n合计：${total} 人`,
        actions: [{ type: "query", executed: true }],
        data: { monthlyData, total }
      };
    }

    case "query_stats": {
      if (!statistics) {
        return {
          reply: "统计数据暂不可用，请稍后重试。",
          actions: [{ type: "query", executed: false }]
        };
      }
      const todayInterview = statistics.todayInterviews ?? 0;
      const active = statistics.activePeople ?? 0;
      return {
        reply: `当前统计数据：\n- 今日面试：${todayInterview} 人\n- 当前在职：${active} 人\n- 今日离职：${statistics.todayOffboard ?? 0} 人\n- 待入职：${statistics.todayOnboard ?? 0} 人`,
        actions: [{ type: "query", executed: true }],
        data: statistics
      };
    }

    case "update_person": {
      const person = await findPerson(people, parsed.personName!);
      if (!person) {
        return {
          reply: `未找到员工"${parsed.personName}"，请确认姓名。`,
          actions: [{ type: "query", executed: false }]
        };
      }
      return {
        reply: `已识别状态更新请求：\n- 员工：${person.name}\n- 新状态：${parsed.payload?.status}\n\n确认执行吗？`,
        actions: [{
          type: "update",
          target: person.id,
          payload: parsed.payload,
          executed: false
        }],
        data: { person }
      };
    }

    default:
      return {
        reply: `我可以帮您：\n1. 登记离职（如："张三今天离职，原因是清退临时工"）\n2. 查询项目数据（如："四川时代项目1-6月入职人数"）\n3. 查询统计信息（如："今日面试人数"）\n4. 更新人员状态（如："把李四状态改成已入职"）\n\n请告诉我您需要什么帮助？`,
        actions: []
      };
  }
}

/**
 * 执行 AI 操作（需用户确认后调用）
 */
export async function executeAiAction(
  action: AiAction,
  people: Person[],
  updatePerson: (id: string, updates: Partial<Person>) => void
): Promise<AiAction> {
  if (action.executed) return action;

  switch (action.type) {
    case "offboard": {
      const person = people.find((p) => p.id === action.target);
      if (!person) {
        return { ...action, executed: false, result: "未找到目标员工" };
      }
      updatePerson(person.id, {
        employmentStatus: "LEFT",
        offboardDate: new Date().toISOString().slice(0, 10),
        notes: (person.notes ? person.notes + "；" : "") + `AI 助手登记离职：${action.payload?.reason || "无原因"}`
      });
      return { ...action, executed: true, result: `已为 ${person.name} 办理离职登记` };
    }

    case "update": {
      const person = people.find((p) => p.id === action.target);
      if (!person) {
        return { ...action, executed: false, result: "未找到目标员工" };
      }
      const status = String(action.payload?.status || "");
      const updates: Partial<Person> = {};
      if (status.includes("入职")) {
        updates.employmentStatus = "ACTIVE";
        updates.onboardDate = new Date().toISOString().slice(0, 10);
      } else if (status.includes("离职")) {
        updates.employmentStatus = "LEFT";
        updates.offboardDate = new Date().toISOString().slice(0, 10);
      }
      updatePerson(person.id, updates);
      return { ...action, executed: true, result: `已更新 ${person.name} 状态为 ${status}` };
    }

    default:
      return { ...action, executed: false };
  }
}
