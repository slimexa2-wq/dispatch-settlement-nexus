import { api, type OverviewStatistics } from "../../../api/services";
import { AccessDenied, AsyncBoundary, MetricGrid, PageShell } from "../../../components/ui";
import { useAsyncData } from "../../../hooks/useAsyncData";
import { useSession } from "../../../hooks/useSession";

function value(source: OverviewStatistics | null, ...keys: string[]): number | string {
  for (const key of keys) {
    const item = source?.[key];
    if (typeof item === "number") return item;
    const card = source?.cards?.[key];
    if (typeof card === "number") return card;
  }
  return "—";
}

export default function SupplierMetricsPage() {
  const user = useSession();
  const statistics = useAsyncData(() => api.overview(), []);
  if (!user) return <PageShell title="我的数据" />;
  if (user.role !== "SUPPLIER" || !user.permissions.includes("dashboard:read")) return <AccessDenied />;
  const metrics = [
    { label: "今日面试", value: value(statistics.data, "todayInterview"), path: "/pages/supplier/people/index" },
    { label: "面试通过", value: value(statistics.data, "interviewPassed"), path: "/pages/supplier/people/index?interviewStatus=PASSED" },
    { label: "当前在职", value: value(statistics.data, "active"), path: "/pages/supplier/people/index?status=ACTIVE" },
    { label: "今日入职", value: value(statistics.data, "todayOnboard"), path: "/pages/supplier/people/index?status=ACTIVE" },
    { label: "今日离职", value: value(statistics.data, "todayOffboard"), path: "/pages/supplier/people/index?status=LEFT" },
    { label: "本月离职", value: value(statistics.data, "monthOffboard"), path: "/pages/supplier/people/index?status=LEFT" }
  ];
  return (
    <PageShell title="我的数据" subtitle="统计只来自本供应商业务明细，点击数字查看人员">
      <AsyncBoundary loading={statistics.loading} error={statistics.error} onRetry={() => void statistics.reload()}>
        <MetricGrid metrics={metrics} />
      </AsyncBoundary>
    </PageShell>
  );
}
