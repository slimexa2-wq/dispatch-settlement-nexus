import Taro from "@tarojs/taro";
import { Button, Picker, Text, View } from "@tarojs/components";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../api/services";
import type {
  DepartmentReimbursementSummary,
  ReimbursementStatus
} from "../../../api/types";
import { AccessDenied, AsyncBoundary, PageShell, StatusTag } from "../../../components/ui";
import {
  centsToYuan,
  canCreateReimbursement,
  departmentSummaryApplicantPreview,
  departmentSummaryCategoryPreview,
  reimbursementPermissions,
  reimbursementStatusLabel
} from "../../../domain/reimbursements";
import { formatDate } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

const filterOptions: Array<{ label: string; value: "" | ReimbursementStatus }> = [
  { label: "全部状态", value: "" },
  { label: "待提交", value: "PENDING_SUBMISSION" },
  { label: "部门制单中", value: "DEPARTMENT_PREPARING" },
  { label: "负责人审核中", value: "OWNER_REVIEWING" },
  { label: "财务审核中", value: "FINANCE_REVIEWING" },
  { label: "审核通过", value: "APPROVED" },
  { label: "待付款", value: "PENDING_PAYMENT" },
  { label: "已付款", value: "PAID" }
];

type ReimbursementView = "mine" | "department" | "payment";

function departmentAction(
  summary: DepartmentReimbursementSummary,
  permissions: readonly string[]
): {
  targetStatus: "OWNER_REVIEWING" | "FINANCE_REVIEWING" | "APPROVED" | "PENDING_PAYMENT";
  label: string;
} | null {
  const statuses = Object.keys(summary.statusCounts);
  if (statuses.length !== 1 || summary.openIssueCount > 0) return null;
  const status = statuses[0];
  if (status === "DEPARTMENT_PREPARING" && permissions.includes(reimbursementPermissions.manage)) {
    return { targetStatus: "OWNER_REVIEWING", label: "确认部门汇总并提交负责人" };
  }
  if (status === "OWNER_REVIEWING" && permissions.includes(reimbursementPermissions.approve)) {
    return { targetStatus: "FINANCE_REVIEWING", label: "负责人审核通过并提交财务" };
  }
  if (status === "FINANCE_REVIEWING" && permissions.includes(reimbursementPermissions.financeReview)) {
    return { targetStatus: "APPROVED", label: "财务按申报金额审核通过" };
  }
  if (status === "APPROVED" && permissions.includes(reimbursementPermissions.financeReview)) {
    return { targetStatus: "PENDING_PAYMENT", label: "生成付款名单" };
  }
  return null;
}

function statusSummary(statusCounts: Record<string, number>): string {
  return Object.entries(statusCounts)
    .map(([status, count]) => `${reimbursementStatusLabel(status as ReimbursementStatus)} ${count}笔`)
    .join("、");
}

export default function ReimbursementListPage() {
  const user = useSession();
  const [status, setStatus] = useState<"" | ReimbursementStatus>("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  const createAllowed = Boolean(user && canCreateReimbursement(user));
  const departmentAllowed = Boolean(user && [
    reimbursementPermissions.manage,
    reimbursementPermissions.approve,
    reimbursementPermissions.financeReview,
    reimbursementPermissions.export
  ].some((permission) => user.permissions.includes(permission)));
  const paymentAllowed = Boolean(user && [
    reimbursementPermissions.financeReview,
    reimbursementPermissions.pay,
    reimbursementPermissions.export
  ].some((permission) => user.permissions.includes(permission)));

  const initialView: ReimbursementView = createAllowed
    ? "mine"
    : departmentAllowed
      ? "department"
      : "payment";
  const [view, setView] = useState<ReimbursementView>(initialView);

  const batches = useAsyncData(
    () => user ? api.reimbursements(status ? { status } : {}) : Promise.resolve({
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 }
    }),
    [status, user?.id]
  );
  const departmentSummaries = useAsyncData(
    () => departmentAllowed ? api.reimbursementDepartmentSummaries({ period }) : Promise.resolve([]),
    [departmentAllowed, period]
  );
  const paymentRoster = useAsyncData(
    () => paymentAllowed ? api.reimbursementPaymentRoster({ period }) : Promise.resolve([]),
    [paymentAllowed, period]
  );

  const availableViews = useMemo(() => [
    createAllowed ? { value: "mine" as const, label: "我的报销" } : null,
    departmentAllowed ? { value: "department" as const, label: "部门汇总" } : null,
    paymentAllowed ? { value: "payment" as const, label: "付款名单" } : null
  ].filter(Boolean) as Array<{ value: ReimbursementView; label: string }>, [createAllowed, departmentAllowed, paymentAllowed]);

  useEffect(() => {
    if (availableViews.length > 0 && !availableViews.some((item) => item.value === view)) {
      setView(availableViews[0]!.value);
    }
  }, [availableViews, view]);

  if (!user) return <PageShell title="报销中心" />;
  if (!user.permissions.some((permission) => permission.startsWith("reimbursement:"))) {
    return <AccessDenied message="当前岗位没有报销查看或办理权限。" />;
  }

  const selectedFilterIndex = Math.max(0, filterOptions.findIndex((item) => item.value === status));
  const selectedViewIndex = Math.max(0, availableViews.findIndex((item) => item.value === view));

  const runDepartmentAction = async (summary: DepartmentReimbursementSummary) => {
    const action = departmentAction(summary, user.permissions);
    if (!action) return;
    const confirm = await Taro.showModal({
      title: action.label,
      content: `${summary.organizationUnitName} ${summary.period}，共${summary.batchCount}笔、${summary.applicantCount}人，申报金额 ¥${centsToYuan(summary.totalPaymentCents)}。系统将一次推进整个部门批次。`
    });
    if (!confirm.confirm) return;
    try {
      await api.transitionReimbursementDepartmentSummary({
        batchIds: summary.batchIds,
        targetStatus: action.targetStatus,
        comment: `${summary.organizationUnitName}${summary.period}部门汇总批量处理`
      });
      await Taro.showToast({ title: "部门批次已更新", icon: "success" });
      await Promise.all([departmentSummaries.reload(), paymentRoster.reload(), batches.reload()]);
    } catch (error) {
      await Taro.showModal({
        title: "处理失败",
        content: error instanceof Error ? error.message : "请刷新后重试",
        showCancel: false
      });
    }
  };

  return (
    <PageShell
      title="报销中心"
      subtitle="一次提交，系统自动校验、汇总并传递到下一环节"
    >
      {availableViews.length > 1 ? (
        <Picker
          mode="selector"
          range={availableViews}
          rangeKey="label"
          value={selectedViewIndex}
          onChange={(event) => setView(availableViews[Number(event.detail.value)]?.value ?? availableViews[0]!.value)}
        >
          <View className="reimbursement-view-picker">当前：{availableViews[selectedViewIndex]?.label}⌄</View>
        </Picker>
      ) : null}

      {view === "mine" ? (
        <>
          <View className="reimbursement-toolbar">
            <Picker
              mode="selector"
              range={filterOptions}
              rangeKey="label"
              value={selectedFilterIndex}
              onChange={(event) => setStatus(filterOptions[Number(event.detail.value)]?.value ?? "")}
            >
              <View className="reimbursement-filter">{filterOptions[selectedFilterIndex]?.label ?? "全部状态"}⌄</View>
            </Picker>
            {createAllowed ? (
              <Button
                className="button reimbursement-create-button"
                onClick={() => void Taro.navigateTo({ url: "/pages/reimbursements/form/index" })}
              >
                发起报销
              </Button>
            ) : null}
          </View>

          <AsyncBoundary
            loading={batches.loading}
            error={batches.error}
            empty={!batches.data?.items.length}
            emptyText="暂无符合条件的报销单"
            onRetry={() => void batches.reload()}
          >
            {(batches.data?.items ?? []).map((batch) => {
              const openIssues = batch.issues?.filter((issue) => issue.status === "OPEN").length ?? batch._count?.issues ?? 0;
              return (
                <View
                  className="reimbursement-card"
                  key={batch.id}
                  onClick={() => void Taro.navigateTo({ url: `/pages/reimbursements/detail/index?id=${encodeURIComponent(batch.id)}` })}
                >
                  <View className="card-title-row">
                    <Text className="card-title">{batch.title}</Text>
                    <StatusTag status={batch.status} label={reimbursementStatusLabel(batch.status)} />
                  </View>
                  <Text className="card-meta">{batch.code} · {batch.applicant.displayName}</Text>
                  <Text className="reimbursement-money">¥{centsToYuan(batch.approvedAmountCents ?? batch.totalPaymentCents)}</Text>
                  {batch.approvedAmountCents !== null && batch.approvedAmountCents !== undefined && batch.approvedAmountCents !== batch.totalPaymentCents ? (
                    <Text className="card-note">申报 ¥{centsToYuan(batch.totalPaymentCents)}，财务审核 ¥{centsToYuan(batch.approvedAmountCents)}</Text>
                  ) : null}
                  <View className="reimbursement-card__footer">
                    <Text className="muted">{formatDate(batch.createdAt)} · {batch._count?.lines ?? batch.lines?.length ?? 0} 条明细</Text>
                    <Text className={openIssues ? "reimbursement-issue-count" : "muted"}>
                      {openIssues ? `${openIssues} 个问题待处理` : "查看详情 ›"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </AsyncBoundary>
        </>
      ) : null}

      {view === "department" ? (
        <>
          <Picker mode="date" fields="month" value={`${period}-01`} onChange={(event) => setPeriod(String(event.detail.value).slice(0, 7))}>
            <View className="reimbursement-period-picker">汇总月份：{period}⌄</View>
          </Picker>
          <AsyncBoundary
            loading={departmentSummaries.loading}
            error={departmentSummaries.error}
            empty={!departmentSummaries.data?.length}
            emptyText="本月暂无已提交的部门报销"
            onRetry={() => void departmentSummaries.reload()}
          >
            {(departmentSummaries.data ?? []).map((summary) => {
              const action = departmentAction(summary, user.permissions);
              return (
                <View className="reimbursement-card" key={summary.key}>
                  <View className="card-title-row">
                    <Text className="card-title">{summary.organizationUnitName}</Text>
                    <Text className="muted">{summary.period}</Text>
                  </View>
                  <Text className="card-meta">{summary.applicantCount}人 · {summary.batchCount}笔 · {statusSummary(summary.statusCounts)}</Text>
                  <Text className="reimbursement-money">¥{centsToYuan(summary.totalPaymentCents)}</Text>
                  <Text className="card-note">发票合计 ¥{centsToYuan(summary.totalInvoiceCents)}{summary.totalApprovedAmountCents ? ` · 已审核 ¥${centsToYuan(summary.totalApprovedAmountCents)}` : ""}</Text>
                  {summary.categorySummaries.length ? (
                    <View className="reimbursement-auto-summary">
                      <Text className="reimbursement-auto-summary__label">费用类型汇总</Text>
                      <Text className="reimbursement-auto-summary__value">{departmentSummaryCategoryPreview(summary.categorySummaries)}</Text>
                    </View>
                  ) : null}
                  {summary.applicantSummaries.length ? (
                    <View className="reimbursement-auto-summary">
                      <Text className="reimbursement-auto-summary__label">报销人汇总</Text>
                      <Text className="reimbursement-auto-summary__value">{departmentSummaryApplicantPreview(summary.applicantSummaries)}</Text>
                    </View>
                  ) : null}
                  <Text className="muted">系统已自动生成 {summary.detailRows.length} 条费用明细，可在管理后台展开核验与导出。</Text>
                  {summary.openIssueCount ? <Text className="reimbursement-issue-count">系统标记 {summary.openIssueCount} 个未解决问题</Text> : null}
                  {action ? (
                    <Button className="button" onClick={() => void runDepartmentAction(summary)}>{action.label}</Button>
                  ) : null}
                </View>
              );
            })}
          </AsyncBoundary>
        </>
      ) : null}

      {view === "payment" ? (
        <>
          <Picker mode="date" fields="month" value={`${period}-01`} onChange={(event) => setPeriod(String(event.detail.value).slice(0, 7))}>
            <View className="reimbursement-period-picker">付款月份：{period}⌄</View>
          </Picker>
          <AsyncBoundary
            loading={paymentRoster.loading}
            error={paymentRoster.error}
            empty={!paymentRoster.data?.length}
            emptyText="本月暂无待付或已付报销"
            onRetry={() => void paymentRoster.reload()}
          >
            {(paymentRoster.data ?? []).map((row) => (
              <View
                className="reimbursement-card"
                key={row.batchId}
                onClick={() => void Taro.navigateTo({ url: `/pages/reimbursements/detail/index?id=${encodeURIComponent(row.batchId)}` })}
              >
                <View className="card-title-row">
                  <Text className="card-title">{row.applicantName}</Text>
                  <StatusTag status={row.paymentStatus} label={row.paymentStatus === "PAID" ? "已付款" : "待付款"} />
                </View>
                <Text className="card-meta">{row.organizationUnitName} · {row.code}</Text>
                <Text className="reimbursement-money">¥{centsToYuan(row.approvedAmountCents)}</Text>
                <Text className="card-note">收款账号：{row.payeeAccount || "未填写"}{row.payeeBank ? ` · ${row.payeeBank}` : ""}</Text>
                <Text className="muted">{row.paymentReference ? `流水号：${row.paymentReference}` : "点击进入付款登记"}</Text>
              </View>
            ))}
          </AsyncBoundary>
        </>
      ) : null}
    </PageShell>
  );
}
