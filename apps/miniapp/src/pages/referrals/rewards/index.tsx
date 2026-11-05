import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, formatMoney } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function ReferralRewardsPage() {
  const user = useSession();
  const rewards = useAsyncData(() => api.myRewards(), []);
  if (!user) return <PageShell title="推荐奖励" />;
  if (user.role !== "EMPLOYEE") return <AccessDenied />;
  const items = rewards.data ? itemsOf(rewards.data) : [];
  return (
    <PageShell title="推荐奖励" subtitle="奖励金额和达成条件来自报名时绑定的政策版本">
      <AsyncBoundary loading={rewards.loading} error={rewards.error} empty={!items.length} emptyText="暂无奖励记录" onRetry={() => void rewards.reload()}>
        {items.map((reward) => (
          <SectionCard title={reward.referral?.personName ?? reward.referral?.person?.name ?? "推荐奖励"} key={reward.id} action={<StatusTag status={reward.status} />}>
            <FieldRow label="奖励金额" value={formatMoney(reward.amount)} />
            <FieldRow label="达成日期" value={formatDate(reward.achievedAt)} />
            <FieldRow label="发放日期" value={formatDate(reward.paidAt)} />
          </SectionCard>
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
