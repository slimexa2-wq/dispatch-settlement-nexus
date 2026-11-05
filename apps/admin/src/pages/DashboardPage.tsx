import { useMemo, useState } from "react";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LoginOutlined,
  LogoutOutlined,
  ReloadOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { Alert, App, Button, Card, Col, DatePicker, Progress, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Permission } from "@xiangneng/shared";
import { PermissionGuard } from "../components/PermissionGuard";
import { PageHeader } from "../components/PageHeader";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock, LoadingBlock } from "../components/AsyncState";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { api, getAllPages, saveBlob, getErrorMessage } from "../lib/api";
import { normalizeStatistics, statPointPeoplePath } from "../lib/statistics";
import { useApiResource } from "../hooks/useApiResource";
import { branchName, listResult } from "../lib/format";
import type { DashboardData, Project, StatPoint } from "../types/domain";

type DashboardFilters = {
  branchId?: string;
  projectId?: string;
  from?: string;
  to?: string;
};

type MetricCardProps = {
  title: string;
  value: number;
  icon: ReactNode;
  tone: "blue" | "green" | "orange" | "purple" | "red";
  helper: string;
  onClick: () => void;
};

const statusNameMap: Record<string, string> = {
  APPLICANT: "已报名",
  ACTIVE: "在职",
  INTERVIEWING: "面试中",
  PENDING_ONBOARD: "待入职",
  ARRIVED: "已到达",
  PASSED: "面试通过",
  FAILED: "面试未通过",
  ONBOARDED: "已入职",
  NOT_ONBOARDED: "未入职",
  LEFT: "已离职",
  REGULARIZED: "已转正"
};

function MetricCard({ title, value, icon, tone, helper, onClick }: MetricCardProps) {
  return (
    <Card className={`metric-card tone-${tone}`} hoverable onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onClick();
    }}>
      <div className="metric-card-inner">
        <div className="metric-card-icon">{icon}</div>
        <Statistic title={title} value={value} />
      </div>
      <span className="metric-drilldown">{helper}</span>
    </Card>
  );
}

function VisualRankList({ data, color = "#1769ff", onItemClick }: { data?: StatPoint[]; color?: string; onItemClick?: (point: StatPoint) => void }) {
  const items = data?.filter((item) => item.value > 0).slice(0, 8) ?? [];
  const max = Math.max(...items.map((item) => item.value), 1);
  if (!items.length) return <div className="chart-empty">暂无数据</div>;
  return (
    <div className="visual-rank-list">
      {items.map((item) => (
        <button key={`${item.name}-${item.value}`} className="visual-rank-row" onClick={() => onItemClick?.(item)}>
          <span className="visual-rank-name" title={item.name}>{item.name}</span>
          <span className="visual-rank-track"><span style={{ width: `${Math.max((item.value / max) * 100, 3)}%`, background: color }} /></span>
          <strong>{item.value.toLocaleString("zh-CN")}</strong>
        </button>
      ))}
    </div>
  );
}

function StatusTiles({ data, onItemClick }: { data?: StatPoint[]; onItemClick?: (point: StatPoint) => void }) {
  const items = data ?? [];
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length) return <div className="chart-empty">暂无状态数据</div>;
  return (
    <div className="status-tile-grid">
      {items.map((item) => {
        const percent = total ? Math.round((item.value / total) * 100) : 0;
        return (
          <button key={item.name} className="status-tile" onClick={() => onItemClick?.(item)}>
            <span>{item.name}</span>
            <strong>{item.value.toLocaleString("zh-CN")}</strong>
            <em>{percent}%</em>
          </button>
        );
      })}
    </div>
  );
}

function TrendBars({ data }: { data?: DashboardData["sevenDayTrend"] }) {
  if (!data?.length) return <div className="chart-empty">暂无入离职趋势数据</div>;
  const max = Math.max(...data.flatMap((item) => [item.onboard, item.offboard]), 1);
  return (
    <div className="trend-chart" aria-label="入离职趋势">
      {data.map((item) => (
        <div className="trend-column" key={item.date}>
          <div className="trend-bars">
            <span className="trend-bar onboard" style={{ height: `${Math.max((item.onboard / max) * 130, item.onboard ? 6 : 0)}px` }} title={`入职 ${item.onboard}`} />
            <span className="trend-bar offboard" style={{ height: `${Math.max((item.offboard / max) * 130, item.offboard ? 6 : 0)}px` }} title={`离职 ${item.offboard}`} />
          </div>
          <span className="trend-date">{item.date.slice(5)}</span>
        </div>
      ))}
      <div className="trend-legend"><span className="legend-onboard" />入职 <span className="legend-offboard" />离职</div>
    </div>
  );
}

function DashboardContent() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [draftFilters, setDraftFilters] = useState<DashboardFilters>({});
  const [exporting, setExporting] = useState(false);

  const projectsResource = useApiResource(() => getAllPages<Project>("/projects"), []);
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const branchOptions = useMemo(() => {
    const values = new Map<string, string>();
    projects.forEach((project) => {
      if (project.branchId) values.set(project.branchId, branchName(project));
    });
    return [...values.entries()].map(([value, label]) => ({ value, label }));
  }, [projects]);
  const projectOptions = projects
    .filter((project) => !draftFilters.branchId || project.branchId === draftFilters.branchId)
    .map((project) => ({ value: project.id, label: project.name, searchText: `${project.name} ${branchName(project)}` }));

  const resource = useApiResource(async () => normalizeStatistics(await api.get<unknown>("/statistics/overview", filters)), [JSON.stringify(filters)]);

  if (resource.loading && !resource.data) return <LoadingBlock rows={12} />;
  if (resource.error && !resource.data) return <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} />;

  const data = resource.data ?? {};
  const recruitment = data.recruitment;
  const fulfillment = recruitment?.requiredCount
    ? Math.min(100, Math.round(((recruitment.onboardCount ?? 0) / recruitment.requiredCount) * 100))
    : 0;
  const statusDistribution = data.statusDistribution?.map((item) => ({ ...item, name: statusNameMap[item.name] ?? item.name }));
  const pendingItems = data.pendingItems ?? [];

  const filterQuery = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) filterQuery.set(key, value);
  });
  const peopleMetricPath = (metric: string) => {
    const params = new URLSearchParams(filterQuery);
    params.set("metric", metric);
    return `/people?${params.toString()}`;
  };
  const drillIntoPeople = (point: StatPoint) => {
    const path = statPointPeoplePath(point);
    if (!path) return;
    const [pathname, rawQuery = ""] = path.split("?");
    const params = new URLSearchParams(rawQuery);
    Object.entries(filters).forEach(([key, value]) => {
      if (value && !params.has(key)) params.set(key, value);
    });
    navigate(`${pathname}?${params.toString()}`);
  };

  const applyFilters = () => setFilters({ ...draftFilters });
  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
  };
  const exportDashboard = async () => {
    setExporting(true);
    try {
      const result = await api.download("/statistics/export", filters);
      saveBlob(result.blob, result.fileName);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="数据首页"
        description="指标来自人员、报名、面试、入职、离职等业务明细；可按时间、分子公司、项目筛选并下钻。"
        extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void resource.reload()} loading={resource.loading}>刷新</Button><Button loading={exporting} onClick={() => void exportDashboard()}>导出当前看板</Button></Space>}
      />

      <ContentCard className="dashboard-filter-card">
        <div className="filter-grid dashboard-filter-grid">
          <DatePicker.RangePicker
            value={draftFilters.from && draftFilters.to ? [dayjs(draftFilters.from), dayjs(draftFilters.to)] : undefined}
            onChange={(values: null | [Dayjs | null, Dayjs | null]) => setDraftFilters((old) => ({ ...old, from: values?.[0]?.format("YYYY-MM-DD"), to: values?.[1]?.format("YYYY-MM-DD") }))}
          />
          <ReferenceSelect placeholder="分子公司" options={branchOptions} value={draftFilters.branchId} onChange={(value) => setDraftFilters((old) => ({ ...old, branchId: value as string | undefined, projectId: undefined }))} loading={projectsResource.loading} />
          <ReferenceSelect placeholder="项目" options={projectOptions} value={draftFilters.projectId} onChange={(value) => setDraftFilters((old) => ({ ...old, projectId: value as string | undefined }))} loading={projectsResource.loading} />
          <Space><Button type="primary" onClick={applyFilters}>查询</Button><Button onClick={resetFilters}>重置</Button></Space>
        </div>
        {Object.values(filters).some(Boolean) ? <Tag color="blue">当前看板已按筛选条件计算；在职人数按截止日 {filters.to ?? filters.from ?? "当前"} 反算</Tag> : <Tag>当前看板为全部数据</Tag>}
      </ContentCard>

      <Row gutter={[16, 16]} className="dashboard-metrics">
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="本期面试" value={data.todayInterviews ?? 0} icon={<CalendarOutlined />} tone="blue" helper="下钻面试名单" onClick={() => navigate(peopleMetricPath("todayInterview"))} /></Col>
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="截止在职" value={data.activePeople ?? 0} icon={<TeamOutlined />} tone="green" helper="按筛选截止日反算" onClick={() => navigate(peopleMetricPath("active"))} /></Col>
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="本期入职" value={data.todayOnboard ?? 0} icon={<LoginOutlined />} tone="blue" helper="下钻入职明细" onClick={() => navigate(peopleMetricPath("todayOnboard"))} /></Col>
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="本期离职" value={data.todayOffboard ?? 0} icon={<LogoutOutlined />} tone="orange" helper="下钻离职明细" onClick={() => navigate(peopleMetricPath("todayOffboard"))} /></Col>
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="招聘需求人数" value={recruitment?.requiredCount ?? 0} icon={<FileTextOutlined />} tone="purple" helper="查看招聘需求" onClick={() => navigate("/recruitment/demands")} /></Col>
        <Col xs={24} sm={12} xl={8} xxl={4}><MetricCard title="本期面试通过" value={data.interviewPassed ?? 0} icon={<CheckCircleOutlined />} tone="green" helper="下钻通过人员" onClick={() => navigate(peopleMetricPath("interviewPassed"))} /></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}><ContentCard title="分子公司在职对比"><VisualRankList data={data.branchActive} onItemClick={drillIntoPeople} /></ContentCard></Col>
        <Col xs={24} xl={8}><ContentCard title="项目在职排行"><VisualRankList data={data.projectTop} color="#1769ff" onItemClick={drillIntoPeople} /></ContentCard></Col>
        <Col xs={24} xl={8}><ContentCard title="人员状态分布"><StatusTiles data={statusDistribution} onItemClick={drillIntoPeople} /></ContentCard></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}><ContentCard title="入离职趋势"><TrendBars data={data.sevenDayTrend} /></ContentCard></Col>
        <Col xs={24} xl={12}>
          <ContentCard title="招聘需求与缺口" extra={<Button type="link" onClick={() => navigate("/recruitment/demands")}>查看需求</Button>}>
            <div className="recruitment-summary">
              <Progress type="dashboard" percent={fulfillment} strokeColor="#1769ff" format={(value) => `${value}%`} />
              <div className="recruitment-numbers">
                <Space><ArrowUpOutlined className="success-text" /><span>需求人数</span><strong>{recruitment?.requiredCount ?? 0}</strong></Space>
                <Space><CalendarOutlined className="info-text" /><span>报名记录</span><strong>{recruitment?.applicationCount ?? "—"}</strong></Space>
                <Space><CheckCircleOutlined className="success-text" /><span>已入职</span><strong>{recruitment?.onboardCount ?? 0}</strong></Space>
                <Space><ArrowDownOutlined className="warning-text" /><span>剩余缺口</span><strong>{recruitment?.remainingCount ?? 0}</strong></Space>
              </div>
            </div>
          </ContentCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <ContentCard title="待办事项" extra={pendingItems.length ? <span className="danger-text">{pendingItems.length} 项待处理</span> : null}>
            {pendingItems.length ? (
              <Space orientation="vertical" size="small" className="full-width">
                {pendingItems.slice(0, 5).map((item, index) => (
                  <Alert
                    key={item.id ?? `${item.title}-${index}`}
                    type={item.level ?? "info"}
                    showIcon
                    title={item.title}
                    description={item.count === undefined ? undefined : `待处理 ${item.count} 项`}
                    action={item.path ? <Button size="small" onClick={() => navigate(item.path!)}>处理</Button> : undefined}
                  />
                ))}
              </Space>
            ) : <Typography.Text type="secondary">当前没有待处理提醒。</Typography.Text>}
          </ContentCard>
        </Col>
        <Col xs={24} xl={14}>
          <ContentCard title="近期项目变更">
            <Table
              size="small"
              pagination={false}
              columns={[
                { title: "变更时间", dataIndex: "time", width: 120 },
                { title: "项目名称", dataIndex: "project", width: 180 },
                { title: "变更内容", dataIndex: "content" },
                { title: "变更人", dataIndex: "operator", width: 120 }
              ]}
              dataSource={[
                { key: "1", time: "2026-07-26", project: "公开演示数据", content: "已校验 8 个完整项目与 48 份合成人员档案", operator: "系统管理员" },
                { key: "2", time: "2026-07-26", project: "招聘进度", content: "12 个岗位需求与 48 条报名记录完成对账", operator: "系统管理员" },
                { key: "3", time: "2026-07-26", project: "祥能 AI 助手", content: "本地 Qwen 查询、预览、确认与审计链路已启用", operator: "系统管理员" }
              ]}
              scroll={{ x: 760 }}
            />
          </ContentCard>
        </Col>
      </Row>
    </>
  );
}

export function DashboardPage() {
  return <PermissionGuard permission={Permission.DASHBOARD_READ}><DashboardContent /></PermissionGuard>;
}
