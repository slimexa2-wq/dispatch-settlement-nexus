import { useState } from "react";
import { DownloadOutlined, WarningOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Statistic,
  Table,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { Permission } from "@xiangneng/shared";
import { useNavigate } from "react-router-dom";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { MetricBars } from "../components/MetricBars";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage, saveBlob } from "../lib/api";
import { metricPeoplePath, normalizeStatistics, statPointPeoplePath } from "../lib/statistics";
import { branchName, listResult } from "../lib/format";
import type { DashboardData, Project, StatisticsAnomaly } from "../types/domain";

function StatisticsContent() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [projectId, setProjectId] = useState<string>();
  const [branchId, setBranchId] = useState<string>();

  const resource = useApiResource(
    async () => normalizeStatistics(await api.get<unknown>("/statistics/overview", { from: dateFrom, to: dateTo, projectId, branchId })),
    [dateFrom, dateTo, projectId, branchId]
  );
  const projectsResource = useApiResource(
    () => getAllPages<Project>("/projects"),
    []
  );
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const branches = new Map<string, string>();
  projects.forEach((project) => branches.set(project.branchId, branchName(project)));
  const data = resource.data;
  const drillIntoPeople = (point: NonNullable<DashboardData["branchActive"]>[number]) => {
    const path = statPointPeoplePath(point);
    if (path) navigate(path);
  };

  const exportReport = async () => {
    try {
      const result = await api.download("/statistics/export", { from: dateFrom, to: dateTo, projectId, branchId });
      saveBlob(result.blob, result.fileName);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const anomalyColumns: TableColumnsType<StatisticsAnomaly> = [
    { title: "异常类型", dataIndex: "type", width: 180, render: (value: string) => <Typography.Text type="danger"><WarningOutlined /> {value}</Typography.Text> },
    { title: "范围", dataIndex: "scopeName", width: 220 },
    { title: "应有值", dataIndex: "expected", width: 100 },
    { title: "明细计算值", dataIndex: "actual", width: 110 },
    { title: "差异", dataIndex: "difference", width: 90, render: (value: number) => <strong className="danger-text">{value}</strong> },
    { title: "操作", width: 100, render: (_, row) => <Button type="link" size="small" onClick={() => navigate(`/people?anomalyId=${row.id}`)}>下钻人员</Button> }
  ];

  if (resource.error && !data) return <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} />;

  return (
    <>
      <PageHeader title="统计分析" description="统计结果由业务明细实时计算；异常项标红并可下钻到人员。" extra={<Button icon={<DownloadOutlined />} onClick={() => void exportReport()}>导出统计</Button>} />
      <ContentCard className="statistics-filters">
        <div className="filter-grid compact">
          <DatePicker.RangePicker
            value={[dayjs(dateFrom), dayjs(dateTo)]}
            onChange={(values) => {
              setDateFrom(values?.[0]?.format("YYYY-MM-DD") ?? dayjs().startOf("month").format("YYYY-MM-DD"));
              setDateTo(values?.[1]?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD"));
            }}
          />
          <ReferenceSelect placeholder="分子公司" options={[...branches.entries()].map(([value, label]) => ({ value, label }))} value={branchId} onChange={(value) => setBranchId(value as string | undefined)} />
          <ReferenceSelect placeholder="项目" options={projects.map((project) => ({ value: project.id, label: project.name }))} value={projectId} onChange={(value) => setProjectId(value as string | undefined)} loading={projectsResource.loading} />
          <Button onClick={() => { setBranchId(undefined); setProjectId(undefined); }}>重置范围</Button>
        </div>
      </ContentCard>

      <Row gutter={[12, 12]} className="summary-strip">
        {[
          ["当前在职", data?.activePeople ?? 0, metricPeoplePath("active")],
          ["面试通过", data?.interviewPassed ?? 0, metricPeoplePath("interviewPassed", { from: dateFrom, to: dateTo })],
          ["本月离职", data?.monthOffboard ?? 0, metricPeoplePath("monthOffboard", { from: dateFrom, to: dateTo })],
          ["招聘缺口", data?.recruitment?.remainingCount ?? 0, "/recruitment/demands"]
        ].map(([label, value, path]) => (
          <Col xs={12} md={6} key={String(label)}><Card hoverable loading={resource.loading} onClick={() => navigate(String(path))}><Statistic title={label} value={Number(value)} /><Button type="link" size="small">查看明细</Button></Card></Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}><ContentCard title="分子公司在职对比"><MetricBars data={data?.branchActive} onItemClick={drillIntoPeople} /></ContentCard></Col>
        <Col xs={24} lg={12}><ContentCard title="人员状态分布"><MetricBars data={data?.statusDistribution} color="#367fce" onItemClick={drillIntoPeople} /></ContentCard></Col>
        <Col xs={24} lg={12}><ContentCard title="项目在职排名"><MetricBars data={data?.projectTop} color="#16876c" onItemClick={drillIntoPeople} /></ContentCard></Col>
        <Col xs={24} lg={12}><ContentCard title="供应商贡献排名"><MetricBars data={data?.supplierTop} color="#aa6a16" onItemClick={drillIntoPeople} /></ContentCard></Col>
      </Row>

      <ContentCard title="数据一致性异常" extra={<Space><Typography.Text type="secondary">当前筛选范围</Typography.Text></Space>}>
        {data?.anomalies === undefined
          ? <Alert type="warning" showIcon title="异常检测结果暂不可用" description="当前接口未返回统计一致性异常清单，不能据此判定没有差异。" />
          : data.anomalies.length
            ? <Alert type="error" showIcon title={`发现 ${data.anomalies.length} 项统计差异，请下钻核对明细。`} className="table-alert" />
            : <Alert type="success" showIcon title="未发现统计口径差异" />}
        <Table<StatisticsAnomaly> rowKey="id" columns={anomalyColumns} dataSource={data?.anomalies ?? []} loading={resource.loading} pagination={false} scroll={{ x: 800 }} locale={{ emptyText: "当前范围没有异常" }} />
      </ContentCard>
    </>
  );
}

export function StatisticsPage() {
  return <PermissionGuard permission={Permission.DASHBOARD_READ}><StatisticsContent /></PermissionGuard>;
}
