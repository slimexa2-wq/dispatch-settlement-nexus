import { useState } from "react";
import {
  EditOutlined,
  EyeOutlined,
  PictureOutlined,
  PlusOutlined,
  UploadOutlined
} from "@ant-design/icons";
import {
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
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
  Upload
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { TableColumnsType, UploadFile } from "antd";
import {
  Permission,
  ProjectStatus,
  ResponsibilityType
} from "@xiangneng/shared";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBlock } from "../components/AsyncState";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { AuthenticatedImage } from "../components/AuthenticatedImage";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { adaptProject, mapList } from "../lib/adapters";
import { branchName, displayText, formatDate, listResult, toDateValue } from "../lib/format";
import type { Branch, ListResult, Project } from "../types/domain";

type ProjectFormValues = {
  branchId: string;
  name: string;
  isExternal?: boolean;
  businessType?: string;
  status?: ProjectStatus;
  managerName?: string;
  managerPhone?: string;
  cooperationStart?: Dayjs;
  cooperationEnd?: Dayjs;
  responsibility?: ResponsibilityType;
  description?: string;
  remark?: string;
};

type ImageFormValues = { sortOrder?: number; remark?: string };

const statusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.ACTIVE]: "进行中",
  [ProjectStatus.PAUSED]: "暂停",
  [ProjectStatus.HISTORICAL]: "历史项目",
  [ProjectStatus.PENDING_CONFIRMATION]: "待确认"
};

const responsibilityLabels: Record<ResponsibilityType, string> = {
  [ResponsibilityType.CLIENT]: "甲方负责",
  [ResponsibilityType.OURS]: "我方负责",
  [ResponsibilityType.JOINT]: "双方共同负责",
  [ResponsibilityType.PENDING_CONFIRMATION]: "待确认"
};

function projectToForm(project: Project): ProjectFormValues {
  return {
    branchId: project.branchId,
    name: project.name,
    isExternal: project.isExternal,
    businessType: project.businessType ?? undefined,
    status: project.status ?? undefined,
    managerName: project.managerName ?? undefined,
    managerPhone: project.managerPhone ?? undefined,
    cooperationStart: project.cooperationStart ? dayjs(project.cooperationStart) : undefined,
    cooperationEnd: project.cooperationEnd ? dayjs(project.cooperationEnd) : undefined,
    responsibility: project.responsibility ?? undefined,
    description: project.description ?? undefined,
    remark: project.remark ?? undefined
  };
}

function ProjectsContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [branchId, setBranchId] = useState<string>();
  const [status, setStatus] = useState<ProjectStatus>();
  const [formOpen, setFormOpen] = useState(false);
  const [createForm] = Form.useForm<ProjectFormValues>();
  const [detailForm] = Form.useForm<ProjectFormValues>();
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Project>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState<UploadFile>();
  const [imageForm] = Form.useForm<ImageFormValues>();

  const resource = useApiResource(
    async () => mapList(await api.get<ListResult<Project> | Project[]>("/projects", { page, pageSize, keyword, branchId, status }), adaptProject, page, pageSize),
    [page, pageSize, keyword, branchId, status]
  );
  const branchesResource = useApiResource(
    () => getAllPages<Branch>("/branches"),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const branches = branchesResource.data ? listResult(branchesResource.data, 1, 200).items : [];
  const derivedBranches = new Map<string, string>();
  list?.items.forEach((project) => derivedBranches.set(project.branchId, branchName(project)));
  branches.forEach((branch) => derivedBranches.set(branch.id, branch.name));
  const branchOptions = [...derivedBranches.entries()].map(([value, label]) => ({ value, label }));

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ isExternal: false, status: ProjectStatus.ACTIVE });
    setFormOpen(true);
  };

  const saveProject = async (values: ProjectFormValues) => {
    setSaving(true);
    try {
      const body = {
        ...values,
        cooperationStart: toDateValue(values.cooperationStart),
        cooperationEnd: toDateValue(values.cooperationEnd)
      };
      await api.post("/projects", body);
      message.success("项目已创建");
      setFormOpen(false);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (project: Project) => {
    setDetail(project);
    detailForm.setFieldsValue(projectToForm(project));
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const loaded = adaptProject(await api.get<Project>(`/projects/${project.id}`));
      setDetail(loaded);
      detailForm.setFieldsValue(projectToForm(loaded));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const saveProjectDetail = async (values: ProjectFormValues) => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = adaptProject(await api.patch<Project>(`/projects/${detail.id}`, {
        ...values,
        cooperationStart: toDateValue(values.cooperationStart),
        cooperationEnd: toDateValue(values.cooperationEnd)
      }));
      setDetail(updated);
      detailForm.setFieldsValue(projectToForm(updated));
      message.success("项目资料已保存，关联岗位同步更新");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (values: ImageFormValues) => {
    if (!detail || !imageFile?.originFileObj) {
      message.warning("请选择项目图片");
      return;
    }
    setSaving(true);
    const data = new FormData();
    data.append("file", imageFile.originFileObj);
    data.append("sortOrder", String(values.sortOrder ?? 0));
    if (values.remark) data.append("note", values.remark);
    try {
      await api.upload(`/projects/${detail.id}/images`, data);
      message.success("项目实拍图已上传");
      setImageModalOpen(false);
      setImageFile(undefined);
      imageForm.resetFields();
      setDetail(adaptProject(await api.get<Project>(`/projects/${detail.id}`)));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<Project> = [
    { title: "项目名称", dataIndex: "name", fixed: "left", width: 220 },
    { title: "归属分子公司", width: 180, render: (_, row) => branchName(row) },
    { title: "是否外送", dataIndex: "isExternal", width: 100, render: (value: boolean) => <Tag color={value ? "blue" : "default"}>{value ? "是" : "否"}</Tag> },
    { title: "项目状态", dataIndex: "status", width: 110, render: (value: ProjectStatus | null) => value ? <Tag color={value === ProjectStatus.ACTIVE ? "green" : value === ProjectStatus.PAUSED ? "gold" : "default"}>{statusLabels[value]}</Tag> : <Tag>未设置</Tag> },
    { title: "负责人", dataIndex: "managerName", width: 110, render: (value: string | null) => displayText(value) },
    { title: "联系方式", dataIndex: "managerPhone", width: 140, render: (value: string | null) => displayText(value) },
    { title: "合作期限", width: 220, render: (_, row) => `${formatDate(row.cooperationStart)} 至 ${formatDate(row.cooperationEnd)}` },
    { title: "责任主体", dataIndex: "responsibility", width: 140, render: (value: ResponsibilityType | null) => value ? responsibilityLabels[value] : "未设置" },
    { title: "当前在职", dataIndex: "activeCount", width: 100, render: (value: number | undefined) => value ?? "—" },
    {
      title: "操作",
      fixed: "right",
      width: 100,
      render: (_, row) => <Button type="link" size="small" icon={can(Permission.PROJECT_WRITE) ? <EditOutlined /> : <EyeOutlined />} onClick={() => void openDetail(row)}>{can(Permission.PROJECT_WRITE) ? "编辑" : "查看"}</Button>
    }
  ];

  return (
    <>
      <PageHeader
        title="项目管理"
        description="维护项目归属、责任主体和实拍图；岗位信息通过项目关联自动同步。"
        extra={can(Permission.PROJECT_WRITE) ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button> : null}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="项目名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => setPage(1)} />
          <ReferenceSelect placeholder="分子公司" options={branchOptions} value={branchId} onChange={(value) => { setBranchId(value as string | undefined); setPage(1); }} />
          <Select allowClear placeholder="项目状态" value={status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<Project>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1500 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 个项目` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无项目数据" }}
          />
        )}
      </ContentCard>

      <Modal title="新建项目" open={formOpen} width={780} confirmLoading={saving} onCancel={() => setFormOpen(false)} onOk={() => createForm.submit()} destroyOnHidden>
        <Form<ProjectFormValues> form={createForm} layout="vertical" onFinish={(values) => void saveProject(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="branchId" label="归属分子公司" rules={[{ required: true, message: "请选择分子公司" }]}><ReferenceSelect options={branchOptions} loading={branchesResource.loading} /></Form.Item>
            <Form.Item name="managerName" label="项目负责人"><Input maxLength={64} placeholder="缺失时留空" /></Form.Item>
            <Form.Item name="managerPhone" label="负责人联系方式"><Input maxLength={32} placeholder="缺失时留空" /></Form.Item>
            <Form.Item name="cooperationStart" label="合作开始日期"><DatePicker className="full-width" /></Form.Item>
            <Form.Item name="cooperationEnd" label="合作结束日期"><DatePicker className="full-width" /></Form.Item>
            <Form.Item name="responsibility" label="责任主体"><Select allowClear options={Object.entries(responsibilityLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="status" label="项目状态"><Select options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="businessType" label="业务类型"><Input maxLength={64} placeholder="按实际资料维护" /></Form.Item>
            <Form.Item name="isExternal" label="是否外送" valuePropName="checked"><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item>
          </div>
          <Form.Item name="description" label="项目简介"><Input.TextArea rows={4} maxLength={3000} showCount /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="项目详情与编辑" width={920} open={detailOpen} loading={detailLoading} onClose={() => setDetailOpen(false)} extra={detail && can(Permission.PROJECT_WRITE) ? <Button type="primary" loading={saving} onClick={() => detailForm.submit()}>保存修改</Button> : null}>
        {detail ? (
          <>
            <Row gutter={[12, 12]} className="detail-stats">
              {[
                ["当前在职", detail.activeCount ?? 0, "metric=active"],
                ["本期入职", detail.onboardCount ?? 0, "metric=monthOnboard"],
                ["本期离职", detail.offboardCount ?? 0, "metric=monthOffboard"],
                ["面试人数", detail.interviewCount ?? 0, "metric=interviewAll"]
              ].map(([label, value, query]) => (
                <Col xs={12} md={6} key={String(label)}><Card hoverable onClick={() => navigate(`/people?projectId=${detail.id}&${query}`)}><Statistic title={label} value={Number(value)} /></Card></Col>
              ))}
            </Row>
            <Typography.Title level={4} className="section-title">项目资料</Typography.Title>
            <Form<ProjectFormValues> form={detailForm} layout="vertical" disabled={!can(Permission.PROJECT_WRITE)} onFinish={(values) => void saveProjectDetail(values)}>
              <div className="form-grid two-columns">
                <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }]}><Input maxLength={200} /></Form.Item>
                <Form.Item name="branchId" label="归属分子公司" rules={[{ required: true, message: "请选择分子公司" }]}><ReferenceSelect options={branchOptions} loading={branchesResource.loading} /></Form.Item>
                <Form.Item name="managerName" label="项目负责人"><Input maxLength={64} placeholder="请输入负责人姓名" /></Form.Item>
                <Form.Item name="managerPhone" label="负责人联系方式"><Input maxLength={32} placeholder="请输入完整联系电话" /></Form.Item>
                <Form.Item name="cooperationStart" label="合作开始日期"><DatePicker className="full-width" /></Form.Item>
                <Form.Item name="cooperationEnd" label="合作结束日期"><DatePicker className="full-width" /></Form.Item>
                <Form.Item name="responsibility" label="责任主体"><Select allowClear options={Object.entries(responsibilityLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
                <Form.Item name="status" label="项目状态"><Select options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
                <Form.Item name="businessType" label="业务类型"><Input maxLength={64} /></Form.Item>
                <Form.Item name="isExternal" label="是否外送" valuePropName="checked"><Switch checkedChildren="是" unCheckedChildren="否" /></Form.Item>
              </div>
              <Form.Item name="description" label="项目简介"><Input.TextArea rows={4} maxLength={3000} showCount /></Form.Item>
              <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
            </Form>
            <div className="section-title-row">
              <Typography.Title level={4}>项目实拍图</Typography.Title>
              {can(Permission.PROJECT_WRITE) ? <Button icon={<PictureOutlined />} onClick={() => setImageModalOpen(true)}>上传图片</Button> : null}
            </div>
            {detail.images?.length ? (
              <Row gutter={[16, 16]}>
                {[...detail.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => (
                  <Col xs={24} sm={12} md={8} key={image.id}>
                    <Card
                      className="project-image-card"
                      cover={<AuthenticatedImage imageId={image.id} alt={image.remark || detail.name} height={170} />}
                    >
                      <Card.Meta title={`排序 ${image.sortOrder}`} description={image.remark || "无备注"} />
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : <div className="chart-empty">暂无项目实拍图</div>}
          </>
        ) : null}
      </Drawer>

      <Modal title="上传项目实拍图" open={imageModalOpen} confirmLoading={saving} onCancel={() => { setImageModalOpen(false); setImageFile(undefined); }} onOk={() => imageForm.submit()} destroyOnHidden>
        <Form<ImageFormValues> form={imageForm} layout="vertical" onFinish={(values) => void uploadImage(values)} initialValues={{ sortOrder: detail?.images?.length ?? 0 }}>
          <Form.Item label="图片" required>
            <Upload
              accept="image/*"
              maxCount={1}
              fileList={imageFile ? [imageFile] : []}
              beforeUpload={(file) => { setImageFile(file); return false; }}
              onRemove={() => { setImageFile(undefined); return true; }}
            >
              <Button icon={<UploadOutlined />}>选择图片</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="sortOrder" label="排序"><InputNumber min={0} precision={0} className="full-width" /></Form.Item>
          <Form.Item name="remark" label="简短备注"><Input maxLength={200} placeholder="如：厂区环境、宿舍、食堂" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ProjectsPage() {
  return <PermissionGuard permission={Permission.PROJECT_READ}><ProjectsContent /></PermissionGuard>;
}
