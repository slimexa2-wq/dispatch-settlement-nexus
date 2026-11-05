import { useState } from "react";
import { EditOutlined, EyeOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { TableColumnsType } from "antd";
import { JobStatus, Permission, PolicyType, labels } from "@xiangneng/shared";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { StatusTag } from "../components/StatusTag";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { adaptJobDemand, mapList } from "../lib/adapters";
import { branchName, displayText, formatDate, listResult, projectName } from "../lib/format";
import type { JobDemand, ListResult, Policy, Project } from "../types/domain";

function demoProjectImage(name = ""): string {
  if (/物流|仓储|配送|运输/.test(name)) return "/project-assets/logistics-warehouse.png";
  if (/时代|电池|新能源|锂电|能源/.test(name)) return "/project-assets/new-energy-campus.png";
  return "/project-assets/electronics-workshop.png";
}

type JobDemandValues = {
  projectId: string;
  title: string;
  requiredCount: number;
  requirements: string;
  workContent?: string;
  salary: string;
  workTime: string;
  workLocation: string;
  deadline: Dayjs;
  status: JobStatus;
  supplierPolicyId?: string;
  referralPolicyId?: string;
  notes?: string;
};

function demandToForm(demand: JobDemand): JobDemandValues {
  return {
    projectId: demand.projectId,
    title: demand.title,
    requiredCount: demand.requiredCount,
    requirements: demand.requirements,
    workContent: demand.workContent ?? undefined,
    salary: demand.salary,
    workTime: demand.workTime,
    workLocation: demand.workLocation,
    deadline: dayjs(demand.deadline),
    status: demand.status,
    supplierPolicyId: demand.supplierPolicyId ?? undefined,
    referralPolicyId: demand.referralPolicyId ?? undefined,
    notes: demand.notes ?? undefined
  };
}

function JobDemandsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [status, setStatus] = useState<JobStatus>();
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm<JobDemandValues>();
  const [detailForm] = Form.useForm<JobDemandValues>();
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<JobDemand>();
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedCreateProjectId = Form.useWatch("projectId", createForm);
  const selectedDetailProjectId = Form.useWatch("projectId", detailForm);

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<JobDemand> | JobDemand[]>("/job-demands", { page, pageSize, keyword, projectId, status }), adaptJobDemand, page, pageSize),
    [page, pageSize, keyword, projectId, status]
  );
  const projectsResource = useApiResource(
    () => getAllPages<Project>("/projects"),
    []
  );
  const policiesResource = useApiResource(
    () => getAllPages<Policy>("/policies"),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const policies = policiesResource.data ? listResult(policiesResource.data, 1, 200).items : [];
  const projectOptions = projects.map((item) => ({ value: item.id, label: item.name, searchText: `${item.name} ${branchName(item)}` }));
  const selectedCreateProject = projects.find((item) => item.id === selectedCreateProjectId);
  const policyOptions = (policyType: PolicyType, forProjectId?: string) => policies
    .filter((item) => item.type === policyType && (!forProjectId || item.projectId === forProjectId))
    .map((item) => ({ value: item.id, label: `${item.name}（${Number(item.amount).toLocaleString("zh-CN")} 元）` }));

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ status: JobStatus.RECRUITING, requiredCount: 1 });
    setFormOpen(true);
  };

  const saveDemand = async (values: JobDemandValues) => {
    setSaving(true);
    try {
      const body = { ...values, deadline: values.deadline.toISOString() };
      await api.post("/job-demands", body);
      message.success("招聘需求已发布并同步");
      setFormOpen(false);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (demand: JobDemand) => {
    setDetail(demand);
    detailForm.setFieldsValue(demandToForm(demand));
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const next = adaptJobDemand(await api.get<JobDemand>(`/job-demands/${demand.id}`));
      setDetail(next);
      detailForm.setFieldsValue(demandToForm(next));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDemandDetail = async (values: JobDemandValues) => {
    if (!detail) return;
    setSaving(true);
    try {
      const next = adaptJobDemand(await api.patch<JobDemand>(`/job-demands/${detail.id}`, { ...values, deadline: values.deadline.toISOString() }));
      setDetail(next);
      detailForm.setFieldsValue(demandToForm(next));
      message.success("招聘需求已保存，并同步到各角色小程序");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<JobDemand> = [
    { title: "岗位", dataIndex: "title", fixed: "left", width: 160 },
    { title: "项目", width: 190, render: (_, row) => projectName(row) },
    { title: "需求人数", dataIndex: "requiredCount", width: 100 },
    { title: "已报名", dataIndex: "applicationCount", width: 90, render: (value: number | undefined) => value ?? 0 },
    { title: "面试通过", dataIndex: "passedCount", width: 100, render: (value: number | undefined) => value ?? 0 },
    { title: "已入职", dataIndex: "onboardCount", width: 90, render: (value: number | undefined) => value ?? 0 },
    {
      title: "剩余缺口",
      width: 100,
      render: (_, row) => {
        const gap = row.remainingCount ?? Math.max(0, row.requiredCount - (row.onboardCount ?? 0));
        return <strong className={gap > 0 ? "warning-text" : "success-text"}>{gap}</strong>;
      }
    },
    { title: "项目负责人", width: 120, render: (_, row) => displayText(row.project?.managerName) },
    { title: "联系方式", width: 140, render: (_, row) => displayText(row.project?.managerPhone) },
    { title: "截止时间", dataIndex: "deadline", width: 120, render: (value: string) => formatDate(value) },
    { title: "状态", dataIndex: "status", width: 110, render: (value: JobStatus) => <StatusTag status={value} /> },
    {
      title: "操作",
      fixed: "right",
      width: 100,
      render: (_, row) => <Button type="link" size="small" icon={can(Permission.JOB_WRITE) ? <EditOutlined /> : <EyeOutlined />} onClick={() => void openDetail(row)}>{can(Permission.JOB_WRITE) ? "编辑" : "查看"}</Button>
    }
  ];

  return (
    <>
      <PageHeader
        title="招聘需求"
        description="招聘需求是正式主模块；发布后同步给供应商、求职者与内部员工。"
        extra={can(Permission.JOB_WRITE) ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>发布招聘需求</Button> : null}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="岗位 / 招聘要求" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => setPage(1)} />
          <ReferenceSelect placeholder="项目" options={projectOptions} value={projectId} onChange={(value) => { setProjectId(value as string | undefined); setPage(1); }} loading={projectsResource.loading} />
          <Select allowClear placeholder="招聘状态" value={status} options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<JobDemand>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1550 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条需求` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无招聘需求" }}
          />
        )}
      </ContentCard>

      <Modal title="发布招聘需求" open={formOpen} width={820} confirmLoading={saving} onCancel={() => setFormOpen(false)} onOk={() => createForm.submit()} okText="发布并同步" destroyOnHidden>
        <Form<JobDemandValues> form={createForm} layout="vertical" onFinish={(values) => void saveDemand(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="projectId" label="归属项目" rules={[{ required: true, message: "请选择项目" }]}><ReferenceSelect options={projectOptions} loading={projectsResource.loading} /></Form.Item>
            <Form.Item name="title" label="招聘岗位" rules={[{ required: true, message: "请输入岗位" }]}><Input maxLength={120} /></Form.Item>
            <Form.Item name="requiredCount" label="需求人数" rules={[{ required: true, message: "请输入需求人数" }]}><InputNumber min={1} max={100000} precision={0} className="full-width" /></Form.Item>
            <Form.Item name="status" label="招聘状态" rules={[{ required: true }]}><Select options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="salary" label="薪资待遇" rules={[{ required: true, message: "请输入薪资待遇" }]}><Input maxLength={500} /></Form.Item>
            <Form.Item name="workTime" label="工作时间" rules={[{ required: true, message: "请输入工作时间" }]}><Input maxLength={500} /></Form.Item>
            <Form.Item name="workLocation" label="工作地点" rules={[{ required: true, message: "请输入工作地点" }]}><Input maxLength={500} /></Form.Item>
            <Form.Item name="deadline" label="报名截止时间" rules={[{ required: true, message: "请选择截止时间" }]}><DatePicker showTime className="full-width" /></Form.Item>
            <Form.Item name="supplierPolicyId" label="供应商政策"><ReferenceSelect options={policyOptions(PolicyType.SUPPLIER, selectedCreateProjectId)} loading={policiesResource.loading} /></Form.Item>
            <Form.Item name="referralPolicyId" label="内部推荐政策"><ReferenceSelect options={policyOptions(PolicyType.EMPLOYEE_REFERRAL, selectedCreateProjectId)} loading={policiesResource.loading} /></Form.Item>
          </div>
          {selectedCreateProject ? (
            <Alert
              type="info"
              showIcon
              className="form-context-alert"
              title={`${branchName(selectedCreateProject)} · ${selectedCreateProject.name}`}
              description={`项目负责人：${displayText(selectedCreateProject.managerName)} / 联系方式：${displayText(selectedCreateProject.managerPhone)}。以上信息从项目档案自动读取。`}
            />
          ) : null}
          <Form.Item name="workContent" label="工作内容" rules={[{ required: true, message: "请输入工作内容" }]}><Input.TextArea rows={4} maxLength={5000} showCount placeholder="例如：设备组装、质检、包装、现场协助、按班组安排完成日常生产任务。" /></Form.Item>
          <Form.Item name="requirements" label="岗位要求" rules={[{ required: true, message: "请输入岗位要求" }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="招聘需求详情与编辑" width={880} open={detailOpen} loading={detailLoading} onClose={() => setDetailOpen(false)} extra={detail ? <Space>{can(Permission.JOB_WRITE) ? <Button type="primary" loading={saving} onClick={() => detailForm.submit()}>保存修改</Button> : null}<Button icon={<SendOutlined />} onClick={() => navigate(`/recruitment/progress?jobDemandId=${detail.id}`)}>报名进度</Button></Space> : null}>
        {detail ? (
          <>
            <Row gutter={[12, 12]} className="detail-stats">
              {[
                ["需求人数", detail.requiredCount],
                ["已报名", detail.applicationCount ?? 0],
                ["面试通过", detail.passedCount ?? 0],
                ["已入职", detail.onboardCount ?? 0],
                ["剩余缺口", detail.remainingCount ?? Math.max(0, detail.requiredCount - (detail.onboardCount ?? 0))]
              ].map(([label, value]) => <Col xs={12} md={8} key={String(label)}><Card><Statistic title={label} value={Number(value)} /></Card></Col>)}
            </Row>
            <Form<JobDemandValues> form={detailForm} layout="vertical" disabled={!can(Permission.JOB_WRITE)} onFinish={(values) => void saveDemandDetail(values)}>
              <div className="form-grid two-columns">
                <Form.Item name="projectId" label="归属项目" rules={[{ required: true }]}><ReferenceSelect options={projectOptions} /></Form.Item>
                <Form.Item name="title" label="招聘岗位" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="requiredCount" label="需求人数" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="full-width" /></Form.Item>
                <Form.Item name="status" label="招聘状态" rules={[{ required: true }]}><Select options={Object.entries(labels.jobStatus).map(([value, label]) => ({ value, label }))} /></Form.Item>
                <Form.Item name="salary" label="薪资待遇" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="workTime" label="工作时间" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="workLocation" label="工作地点" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="deadline" label="报名截止时间" rules={[{ required: true }]}><DatePicker showTime className="full-width" /></Form.Item>
                <Form.Item name="supplierPolicyId" label="供应商政策"><ReferenceSelect options={policyOptions(PolicyType.SUPPLIER, selectedDetailProjectId)} /></Form.Item>
                <Form.Item name="referralPolicyId" label="内部推荐政策"><ReferenceSelect options={policyOptions(PolicyType.EMPLOYEE_REFERRAL, selectedDetailProjectId)} /></Form.Item>
              </div>
              <Alert type="info" showIcon className="form-context-alert" title={`项目负责人：${displayText(detail.project?.managerName)} / ${displayText(detail.project?.managerPhone)}`} description={`归属分子公司：${detail.project ? branchName(detail.project) : displayText(detail.branchName)}。负责人、联系方式、项目简介及实拍图由项目档案同步，不在岗位中重复维护。`} />
              <Form.Item name="workContent" label="工作内容" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
              <Form.Item name="requirements" label="岗位要求" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={5000} showCount /></Form.Item>
              <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
            </Form>
            <Typography.Title level={4} className="section-title">项目实拍图</Typography.Title>
            {detail.project?.images?.length ? (
              <Space wrap>{detail.project.images.map((image) => <AuthenticatedImage key={image.id} imageId={image.id} width={190} height={125} alt={image.remark || image.note || detail.project?.name || "项目实拍图"} />)}</Space>
            ) : <img className="demo-project-fallback" src={demoProjectImage(detail.project?.name)} alt={`${detail.project?.name ?? "项目"}演示场景`} />}
            <Typography.Paragraph type="secondary" className="sync-note">
              项目负责人、联系方式、简介与实拍图从项目档案实时关联，项目修改后自动同步到岗位详情。
            </Typography.Paragraph>
          </>
        ) : null}
      </Drawer>
    </>
  );
}

export function JobDemandsPage() {
  return <PermissionGuard permission={Permission.JOB_READ}><JobDemandsContent /></PermissionGuard>;
}
