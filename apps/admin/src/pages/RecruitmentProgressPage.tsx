import { useState } from "react";
import { EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag
} from "antd";
import type { TableColumnsType } from "antd";
import {
  ApplicationSource,
  InterviewStatus,
  Permission,
  labels
} from "@xiangneng/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { adaptApplication, adaptJobDemand, mapList } from "../lib/adapters";
import { applicationInterviewEndpoint } from "../lib/applications";
import { formatDate, formatDateTime, listResult, projectName } from "../lib/format";
import type { Application, JobDemand, ListResult } from "../types/domain";

type ApplicationResponse = ListResult<Application> & {
  summary?: {
    applicationCount: number;
    arrivedCount: number;
    passedCount: number;
    onboardCount: number;
    remainingCount: number;
  };
};

const sourceLabels: Record<ApplicationSource, string> = {
  [ApplicationSource.OPERATOR]: "运营报名",
  [ApplicationSource.SUPPLIER]: "供应商报人",
  [ApplicationSource.SELF]: "求职者报名",
  [ApplicationSource.REFERRAL]: "内部推荐"
};

function RecruitmentProgressContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [jobDemandId, setJobDemandId] = useState<string | undefined>(searchParams.get("jobDemandId") ?? undefined);
  const [source, setSource] = useState<ApplicationSource>();
  const [detail, setDetail] = useState<Application>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string>();

  const resource = useApiResource(
    async () => mapList(await api.get<ApplicationResponse | Application[]>("/applications", { page, pageSize, jobDemandId, source }), adaptApplication, page, pageSize),
    [page, pageSize, jobDemandId, source]
  );
  const jobsResource = useApiResource(
    async () => mapList(await getAllPages<JobDemand>("/job-demands"), adaptJobDemand, 1, 200),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const jobs = jobsResource.data ? listResult(jobsResource.data, 1, 200).items : [];
  const selectedJob = jobs.find((job) => job.id === jobDemandId);
  const summary = selectedJob ? {
    applicationCount: selectedJob.applicationCount ?? 0,
    arrivedCount: selectedJob.arrivedCount ?? 0,
    passedCount: selectedJob.passedCount ?? 0,
    onboardCount: selectedJob.onboardCount ?? 0,
    remainingCount: selectedJob.remainingCount ?? 0
  } : undefined;

  const updateInterview = async (application: Application, status: InterviewStatus) => {
    setUpdatingId(application.id);
    try {
      await api.patch(applicationInterviewEndpoint(application.id), { status });
      message.success("面试状态已更新");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setUpdatingId(undefined);
    }
  };

  const columns: TableColumnsType<Application> = [
    { title: "报名时间", dataIndex: "createdAt", width: 150, render: (value: string) => formatDateTime(value) },
    { title: "姓名", width: 100, render: (_, row) => row.person?.name ?? "—" },
    { title: "手机号", width: 130, render: (_, row) => row.person?.phone ?? "—" },
    { title: "岗位", width: 150, render: (_, row) => row.jobDemand?.title ?? "—" },
    { title: "项目", width: 180, render: (_, row) => row.jobDemand ? projectName(row.jobDemand) : row.person ? projectName(row.person) : "—" },
    { title: "报名来源", dataIndex: "source", width: 120, render: (value: ApplicationSource) => <Tag color="blue">{sourceLabels[value]}</Tag> },
    { title: "供应商", width: 150, render: (_, row) => row.supplier?.name || "—" },
    { title: "推荐人", width: 120, render: (_, row) => row.recommender?.displayName || "—" },
    { title: "面试日期", width: 110, render: (_, row) => formatDate(row.interviewDate) },
    {
      title: "面试状态",
      width: 150,
      render: (_, row) => can(Permission.PEOPLE_WRITE) ? (
        <Select
          size="small"
          style={{ width: 130 }}
          value={row.interviewStatus}
          loading={updatingId === row.id}
          options={Object.entries(labels.interviewStatus).map(([value, label]) => ({ value, label }))}
          onChange={(value) => void updateInterview(row, value)}
        />
      ) : <StatusTag status={row.interviewStatus} />
    },
    { title: "报名状态", width: 110, render: (_, row) => <StatusTag status={row.employmentStatus} /> },
    {
      title: "操作",
      fixed: "right",
      width: 150,
      render: (_, row) => <Space size={4}>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetail(row); setDetailOpen(true); }}>详情</Button>
        {row.personId ? <Button type="link" size="small" onClick={() => navigate(`/people?keyword=${encodeURIComponent(row.person?.idCard ?? row.person?.phone ?? "")}`)}>人员档案</Button> : null}
      </Space>
    }
  ];

  return (
    <>
      <PageHeader
        title="报名与招聘进度"
        description="供应商报人、求职者报名和内部推荐统一汇入人员档案，并按同一口径跟踪。"
        extra={<Button icon={<ReloadOutlined />} onClick={() => void resource.reload()} loading={resource.loading}>刷新</Button>}
      />
      {summary ? (
        <Row gutter={[12, 12]} className="summary-strip">
          {[
            ["已报名", summary.applicationCount],
            ["已到场", summary.arrivedCount],
            ["面试通过", summary.passedCount],
            ["已入职", summary.onboardCount],
            ["剩余缺口", summary.remainingCount]
          ].map(([label, value]) => <Col xs={12} md={8} xl={4} key={String(label)}><Card><Statistic title={label} value={Number(value)} /></Card></Col>)}
        </Row>
      ) : null}
      <ContentCard>
        <div className="filter-grid compact">
          <ReferenceSelect placeholder="招聘需求" options={jobs.map((job) => ({ value: job.id, label: `${job.title} · ${projectName(job)}` }))} value={jobDemandId} onChange={(value) => { setJobDemandId(value as string | undefined); setPage(1); }} loading={jobsResource.loading} />
          <Select allowClear placeholder="报名来源" value={source} options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setSource(value); setPage(1); }} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<Application>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1600 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条报名` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无报名记录" }}
          />
        )}
      </ContentCard>

      <Drawer title="报名详情" width={680} open={detailOpen} onClose={() => setDetailOpen(false)}>
        {detail ? <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="姓名">{detail.person?.name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="手机号">{detail.person?.phone ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="岗位">{detail.jobDemand?.title ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="项目">{detail.jobDemand ? projectName(detail.jobDemand) : "—"}</Descriptions.Item>
          <Descriptions.Item label="报名来源">{sourceLabels[detail.source]}</Descriptions.Item>
          <Descriptions.Item label="报名时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="面试日期">{formatDate(detail.interviewDate)}</Descriptions.Item>
          <Descriptions.Item label="面试状态"><StatusTag status={detail.interviewStatus} /></Descriptions.Item>
          <Descriptions.Item label="报名状态"><StatusTag status={detail.employmentStatus} /></Descriptions.Item>
          <Descriptions.Item label="报名入职日期">{formatDate(detail.onboardDate)}</Descriptions.Item>
          <Descriptions.Item label="报名离职日期">{formatDate(detail.offboardDate)}</Descriptions.Item>
          <Descriptions.Item label="离职原因">{detail.offboardReason || "—"}</Descriptions.Item>
          <Descriptions.Item label="供应商">{detail.supplier?.name || "—"}</Descriptions.Item>
          <Descriptions.Item label="推荐人">{detail.recommender?.displayName || "—"}</Descriptions.Item>
        </Descriptions> : null}
      </Drawer>
    </>
  );
}

export function RecruitmentProgressPage() {
  return <PermissionGuard permission={Permission.JOB_READ}><RecruitmentProgressContent /></PermissionGuard>;
}
