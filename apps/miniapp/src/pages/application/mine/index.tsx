import { Text } from "@tarojs/components";
import { api, itemsOf } from "../../../api/services";
import { AccessDenied, AsyncBoundary, FieldRow, PageShell, SectionCard, StatusTag } from "../../../components/ui";
import { formatDate, projectName } from "../../../domain/format";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

export default function MyApplicationsPage() {
  const user = useSession();
  const applications = useAsyncData(() => api.myApplications(), []);
  if (!user) return <PageShell title="我的报名" />;
  if (user.role !== "JOB_SEEKER") return <AccessDenied message="求职者仅可查看本人报名记录。" />;
  const items = applications.data ? itemsOf(applications.data) : [];
  return (
    <PageShell title="我的报名" subtitle="报名、面试和入职进度来自统一人员档案">
      <AsyncBoundary loading={applications.loading} error={applications.error} empty={!items.length} emptyText="暂无报名记录" onRetry={() => void applications.reload()}>
        {items.map((application) => (
          <SectionCard title={application.jobDemand?.title ?? "综合岗位"} key={application.id} action={<StatusTag status={application.status ?? application.person?.employmentStatus ?? application.person?.status} />}>
            <FieldRow label="项目" value={application.jobDemand ? projectName(application.jobDemand) : application.person ? projectName(application.person) : "综合招聘项目"} />
            <FieldRow label="报名人" value={application.person?.name ?? application.personName ?? user.displayName} />
            <FieldRow label="手机号" value={application.person?.phone ?? application.phone} />
            <FieldRow label="报名日期" value={formatDate(application.appliedAt ?? application.createdAt)} />
            <Text className="muted">如状态未更新，请联系岗位详情中的项目负责人。</Text>
          </SectionCard>
        ))}
      </AsyncBoundary>
    </PageShell>
  );
}
