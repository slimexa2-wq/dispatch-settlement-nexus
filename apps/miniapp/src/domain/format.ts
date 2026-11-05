export function formatDate(value?: string | null): string {
  if (!value) return "暂无";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export function localDateString(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localMonthString(value = new Date()): string {
  return localDateString(value).slice(0, 7);
}

export function formatMoney(value?: number | string | null): string {
  if (value === null || value === undefined) return "暂无";
  const amount = Number(value);
  return Number.isFinite(amount) ? "¥" + amount.toFixed(2) : "暂无";
}

export function formatPhone(value?: string | null): string {
  return value || "暂无";
}

export function projectName(value: { project?: { name: string } | null; projectName?: string | null }): string {
  return value.project?.name ?? value.projectName ?? "暂无";
}

export function statusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    RECRUITING: "招聘中",
    PAUSED: "暂停招聘",
    FILLED: "已招满",
    ENDED: "已结束",
    APPLICANT: "已报名",
    INTERVIEWING: "面试中",
    PENDING_ONBOARD: "待入职",
    ACTIVE: "在职",
    LEFT: "离职",
    PENDING_ARRIVAL: "待到场",
    ARRIVED: "已到场",
    PASSED: "面试通过",
    FAILED: "面试未通过",
    ABANDONED: "放弃",
    PENDING: "待达成",
    ACHIEVED: "已达成",
    PAID: "已发放",
    CANCELLED: "已取消",
    PUBLISHED: "已发布",
    WITHDRAWN: "已撤回",
    DRAFT: "草稿"
  };
  return status ? labels[status] ?? status : "暂无";
}
