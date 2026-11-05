import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, formatMoney, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function MyReferralsPage() {
  const user = useSession();
  const referrals = useAsyncData(() => api.myReferrals(), []);
  if (!user) return <PageShell title="我的推荐" />;
  if (user.role !== "EMPLOYEE") return <AccessDenied />;
  const items = referrals.data ? itemsOf(referrals.data) : [];
  return (
    <PageShell title="我的推荐" subtitle="被推荐人的身份证、附件、保险和供应商政策不会在此显示">
      <AsyncBoundary loading={referrals.loading} error={referrals.error} empty={!items.length} emptyText="暂无推荐记录" onRetry={() => void referrals.reload()}>
        {items.map((referral) => (
          <SectionCard title={referral.personName ?? referral.person?.name ?? "被推荐人"} key={referral.id} action={<StatusTag status={referral.status ?? referral.person?.employmentStatus ?? referral.person?.status} />}>
            <FieldRow label="手机号" value={referral.person?.phone ?? referral.maskedPhone} />
            <FieldRow label="项目" value={referral.jobDemand ? projectName(referral.jobDemand) : referral.person ? projectName(referral.person) : "综合招聘项目"} />
            <FieldRow label="岗位" value={referral.jobDemand?.title ?? referral.person?.jobTitle ?? "综合岗位"} />
            <FieldRow label="面试日期" value={formatDate(referral.person?.interviewDate)} />
            <FieldRow label="入职日期" value={formatDate(referral.onboardDate ?? referral.person?.onboardDate)} />
            <FieldRow label="奖励金额" value={formatMoney(referral.rewardAmount ?? referral.reward?.amount)} />
            <FieldRow label="奖励状态" value={<StatusTag status={referral.rewardStatus ?? referral.reward?.status} />} />
          </SectionCard>
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
