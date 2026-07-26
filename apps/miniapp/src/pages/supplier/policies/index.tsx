import { Text } from "@tarojs/components";
import { api } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard } from "../../../components/ui";
import { formatDate, formatMoney, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function SupplierPoliciesPage() {
  const user = useSession();
  const policies = useAsyncData(() => api.policies({ type: "SUPPLIER", isActive: "true" }), []);
  if (!user) return <PageShell title="我的政策" />;
  if (user.role !== "SUPPLIER" || !user.permissions.includes("policy:read")) {
    return <AccessDenied message="仅供应商本人可查看按供应商或级别匹配的政策。" />;
  }
  return (
    <PageShell title="我的政策" subtitle="只展示当前供应商适用政策，不混入内部推荐政策">
      <AsyncBoundary loading={policies.loading} error={policies.error} empty={!policies.data?.items.length} emptyText="暂无适用政策" onRetry={() => void policies.reload()}>
        {(policies.data?.items ?? []).map((policy) => (
          <SectionCard title={policy.name} key={policy.id}>
            <FieldRow label="项目" value={projectName(policy)} />
            <FieldRow label="岗位" value={policy.jobTitle ?? "全部适用岗位"} />
            <FieldRow label="金额/单价" value={formatMoney(policy.amount)} />
            <FieldRow label="达成条件" value={policy.achievementConditions} />
            <FieldRow label="不结算条件" value={policy.exclusionConditions ?? "无"} />
            <FieldRow label="生效日期" value={formatDate(policy.effectiveAt)} />
            <FieldRow label="失效日期" value={formatDate(policy.expiresAt)} />
            {policy.notes ? <Text className="card-note">备注：{policy.notes}</Text> : null}
          </SectionCard>
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
