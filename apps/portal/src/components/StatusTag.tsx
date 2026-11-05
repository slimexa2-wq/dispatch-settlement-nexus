const statusMap: Record<string, { label: string; tone: string }> = {
  registered: { label: '已报名', tone: 'info' },
  arrived: { label: '已到场', tone: 'info' },
  interview_passed: { label: '面试通过', tone: 'success' },
  interview_failed: { label: '面试未通过', tone: 'danger' },
  pending_onboard: { label: '待入职', tone: 'warning' },
  employed: { label: '已入职', tone: 'success' },
  departed: { label: '已离职', tone: 'neutral' },
  withdrawn: { label: '已放弃', tone: 'neutral' },
  recruiting: { label: '招聘中', tone: 'success' },
  paused: { label: '已暂停', tone: 'info' },
  closed: { label: '已关闭', tone: 'neutral' },
  submitted: { label: '待处理', tone: 'warning' },
  processing: { label: '处理中', tone: 'info' },
  resolved: { label: '已处理', tone: 'success' },
  rejected: { label: '已驳回', tone: 'danger' },
  pending_calculation: { label: '待核算', tone: 'warning' },
  pending_confirmation: { label: '待确认', tone: 'warning' },
  confirmed: { label: '已确认', tone: 'success' },
  paid: { label: '已结款', tone: 'success' },
  disputed: { label: '有争议', tone: 'danger' },
  earned: { label: '已达成', tone: 'success' },
  pending: { label: '进行中', tone: 'warning' }
};

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const item = statusMap[status] ?? { label: status, tone: 'neutral' };
  return <span className={`status-tag status-tag--${item.tone}`}>{label ?? item.label}</span>;
}
