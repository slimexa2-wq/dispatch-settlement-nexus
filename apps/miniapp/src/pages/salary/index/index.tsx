import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatMoney } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function SalarySlipsPage() {
  const user = useSession();
  const salarySlips = useAsyncData(() => api.mySalarySlips(), []);
  if (!user) return <PageShell title="我的工资条" />;
  if (user.role !== "EMPLOYEE" || !user.permissions.includes("salary:self-read")) {
    return <AccessDenied message="工资条仅允许已绑定人员档案的员工本人查看。" />;
  }
  const items = salarySlips.data ? itemsOf(salarySlips.data) : [];
  return (
    <PageShell title="我的工资条" subtitle="仅展示当前员工本人已发布的工资条">
      <AsyncBoundary loading={salarySlips.loading} error={salarySlips.error} empty={!items.length} emptyText="暂无已发布工资条" onRetry={() => void salarySlips.reload()}>
        {items.map((slip) => (
          <SectionCard title={slip.salaryMonth} key={slip.id} action={<StatusTag status={slip.status} />}>
            <FieldRow label="应发工资" value={formatMoney(slip.grossPay)} />
            <FieldRow label="实发工资" value={formatMoney(slip.netPay)} sensitive />
            <FieldRow label="工时工资" value={formatMoney(slip.hourlyPay)} />
            <FieldRow label="加班费" value={formatMoney(slip.overtimePay)} />
            <FieldRow label="补贴" value={formatMoney(slip.allowance)} />
            <FieldRow label="推荐奖励" value={formatMoney(slip.referralReward)} />
            <FieldRow label="社保扣款" value={formatMoney(slip.socialSecurityDeduction)} />
            <FieldRow label="其他扣款" value={formatMoney(slip.otherDeduction)} />
            <FieldRow label="备注" value={slip.notes ?? "无"} />
          </SectionCard>
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
