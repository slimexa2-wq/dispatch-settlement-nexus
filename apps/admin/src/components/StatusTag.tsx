import { Tag } from "antd";
import {
  EmploymentStatus,
  InterviewStatus,
  JobStatus,
  RewardStatus,
  SalarySlipStatus
} from "@xiangneng/shared";

const statusLabels: Record<string, string> = {
  [EmploymentStatus.APPLICANT]: "已报名",
  [EmploymentStatus.INTERVIEWING]: "面试中",
  [EmploymentStatus.PENDING_ONBOARD]: "待入职",
  [EmploymentStatus.ACTIVE]: "在职",
  [EmploymentStatus.LEFT]: "离职",
  ONBOARDED: "已入职",
  NOT_ONBOARDED: "未入职",
  REGULARIZED: "已转正",
  [InterviewStatus.PENDING_ARRIVAL]: "待到场",
  [InterviewStatus.ARRIVED]: "已到达",
  [InterviewStatus.PASSED]: "面试通过",
  [InterviewStatus.FAILED]: "面试未通过",
  [InterviewStatus.ABANDONED]: "放弃",
  [JobStatus.RECRUITING]: "招聘中",
  [JobStatus.PAUSED]: "暂停招聘",
  [JobStatus.FILLED]: "已招满",
  [JobStatus.ENDED]: "已结束",
  [RewardStatus.PENDING]: "待达成",
  [RewardStatus.ACHIEVED]: "已达成",
  [RewardStatus.PAID]: "已发放",
  [RewardStatus.CANCELLED]: "已取消",
  [SalarySlipStatus.DRAFT]: "草稿",
  [SalarySlipStatus.PUBLISHED]: "已发布",
  [SalarySlipStatus.WITHDRAWN]: "已撤回",
  HISTORICAL: "历史项目",
  PENDING_CONFIRMATION: "待确认",
  COMMITTED: "已导入",
  PARTIAL: "部分导入",
  PREVIEW: "待确认"
};

const colors: Record<string, string> = {
  [EmploymentStatus.APPLICANT]: "blue",
  [EmploymentStatus.INTERVIEWING]: "cyan",
  [EmploymentStatus.PENDING_ONBOARD]: "gold",
  [EmploymentStatus.ACTIVE]: "green",
  [EmploymentStatus.LEFT]: "default",
  ONBOARDED: "green",
  NOT_ONBOARDED: "gold",
  REGULARIZED: "purple",
  [InterviewStatus.PENDING_ARRIVAL]: "blue",
  [InterviewStatus.ARRIVED]: "cyan",
  [InterviewStatus.PASSED]: "green",
  [InterviewStatus.FAILED]: "red",
  [InterviewStatus.ABANDONED]: "default",
  [JobStatus.RECRUITING]: "green",
  [JobStatus.PAUSED]: "gold",
  [JobStatus.FILLED]: "blue",
  [JobStatus.ENDED]: "default",
  [RewardStatus.PENDING]: "gold",
  [RewardStatus.ACHIEVED]: "cyan",
  [RewardStatus.PAID]: "green",
  [RewardStatus.CANCELLED]: "default",
  [SalarySlipStatus.DRAFT]: "default",
  [SalarySlipStatus.PUBLISHED]: "green",
  [SalarySlipStatus.WITHDRAWN]: "gold",
  PARTIAL: "gold"
};

export function StatusTag({ status }: { status?: string | null }) {
  if (!status) return <Tag>未设置</Tag>;
  return <Tag color={colors[status]}>{statusLabels[status] ?? status}</Tag>;
}
