import { useState } from "react";
import { EditOutlined, EyeOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { TableColumnsType } from "antd";
import { Permission, PolicyType, labels } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage } from "../lib/api";
import { displayText, formatDate, formatMoney, listResult, projectName, toDateValue } from "../lib/format";
import type { ListResult, Policy, Project, Supplier } from "../types/domain";

type Props = { type: PolicyType };

type PolicyFormValues = {
  name: string;
  projectId: string;
  jobTitle?: string;
  supplierId?: string;
  supplierLevel?: string;
  employeeType?: string;
  amount: number;
  achievementConditions: string;
  exclusionConditions?: string;
  effectiveAt: Dayjs;
  expiresAt?: Dayjs;
  notes?: string;
};

function PoliciesContent({ type }: Props) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [projectId, setProjectId] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Policy>();
  const [detail, setDetail] = useState<Policy>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PolicyFormValues>();

  const resource = useApiResource(
    () => api.get<ListResult<Policy> | Policy[]>("/policies", { page, pageSize, type, keyword, projectId }),
    [page, pageSize, type, keyword, projectId]
  );
  const projectsResource = useApiResource(
    () => getAllPages<Project>("/projects"),
    []
  );
  const suppliersResource = useApiResource(
    () => getAllPages<Supplier>("/suppliers"),
    []
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const projects = projectsResource.data ? listResult(projectsResource.data, 1, 200).items : [];
  const suppliers = suppliersResource.data ? listResult(suppliersResource.data, 1, 200).items : [];
  const projectOptions = projects.map((item) => ({ value: item.id, label: item.name }));
  const supplierOptions = suppliers.map((item) => ({ value: item.id, label: item.name }));
  const isSupplier = type === PolicyType.SUPPLIER;
  const title = isSupplier ? "供应商政策" : "内部推荐政策";

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ effectiveAt: dayjs(), amount: 0 });
    setFormOpen(true);
  };

  const openEdit = (policy: Policy) => {
    setEditing(policy);
    form.setFieldsValue({
      name: policy.name,
      projectId: policy.projectId,
      jobTitle: policy.jobTitle ?? undefined,
      supplierId: policy.supplierId ?? undefined,
      supplierLevel: policy.supplierLevel ?? undefined,
      employeeType: policy.employeeType ?? undefined,
      amount: Number(policy.amount),
      achievementConditions: policy.achievementConditions,
      exclusionConditions: policy.exclusionConditions ?? undefined,
      effectiveAt: dayjs(policy.effectiveAt),
      expiresAt: policy.expiresAt ? dayjs(policy.expiresAt) : undefined,
      notes: policy.notes ?? undefined
    });
    setFormOpen(true);
  };

  const savePolicy = async (values: PolicyFormValues) => {
    setSaving(true);
    try {
      const body = {
        ...values,
        type,
        effectiveAt: toDateValue(values.effectiveAt),
        expiresAt: toDateValue(values.expiresAt),
        supplierId: isSupplier ? values.supplierId : null,
        supplierLevel: isSupplier ? values.supplierLevel : null,
        employeeType: isSupplier ? null : values.employeeType
      };
      if (editing) await api.patch(`/policies/${editing.id}`, body);
      else await api.post("/policies", body);
      message.success(editing ? "政策已更新" : "政策已创建");
      setFormOpen(false);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumnsType<Policy> = [
    { title: "政策名称", dataIndex: "name", fixed: "left", width: 230 },
    { title: "归属项目", width: 190, render: (_, row) => projectName(row) },
    { title: "归属岗位", dataIndex: "jobTitle", width: 140, render: (value: string | null) => displayText(value, "全部岗位") },
    {
      title: "适用对象",
      width: 180,
      render: (_, row) => isSupplier
        ? row.supplier?.name || row.supplierLevel || "通用供应商"
        : displayText(row.employeeType)
    },
    { title: "金额 / 单价", dataIndex: "amount", width: 130, render: formatMoney },
    { title: "达成条件", dataIndex: "achievementConditions", width: 230, ellipsis: { showTitle: true } },
    { title: "生效日期", dataIndex: "effectiveAt", width: 110, render: (value: string) => formatDate(value) },
    { title: "失效日期", dataIndex: "expiresAt", width: 110, render: (value: string | null) => formatDate(value) },
    { title: "状态", width: 90, render: (_, row) => <Tag color={(row.isActive ?? row.active) === false ? "default" : "green"}>{(row.isActive ?? row.active) === false ? "已停用" : "有效"}</Tag> },
    {
      title: "操作",
      fixed: "right",
      width: 170,
      render: (_, row) => <Space size={4}>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetail(row); setDetailOpen(true); }}>详情</Button>
        {can(Permission.POLICY_WRITE) ? <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button> : null}
      </Space>
    }
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={isSupplier ? "按指定供应商或供应商级别配置，历史人员保留匹配时的政策版本。" : "按员工身份配置推荐奖励，与供应商结算政策严格分离。"}
        extra={can(Permission.POLICY_WRITE) ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建政策</Button> : null}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input.Search allowClear placeholder="政策名称 / 岗位" value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => setPage(1)} />
          <ReferenceSelect placeholder="归属项目" options={projectOptions} value={projectId} onChange={(value) => { setProjectId(value as string | undefined); setPage(1); }} loading={projectsResource.loading} />
        </div>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<Policy>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1500 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条政策` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: `暂无${title}` }}
          />
        )}
      </ContentCard>

      <Modal title={editing ? `编辑${title}` : `新建${title}`} open={formOpen} width={760} confirmLoading={saving} onCancel={() => setFormOpen(false)} onOk={() => form.submit()} destroyOnHidden>
        <Form<PolicyFormValues> form={form} layout="vertical" onFinish={(values) => void savePolicy(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="name" label="政策名称" rules={[{ required: true, message: "请输入政策名称" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="projectId" label="归属项目" rules={[{ required: true, message: "请选择项目" }]}><ReferenceSelect options={projectOptions} loading={projectsResource.loading} /></Form.Item>
            <Form.Item name="jobTitle" label="归属岗位"><Input maxLength={120} placeholder="留空表示项目全部岗位" /></Form.Item>
            {isSupplier ? (
              <>
                <Form.Item name="supplierId" label="指定供应商"><ReferenceSelect options={supplierOptions} loading={suppliersResource.loading} /></Form.Item>
                <Form.Item name="supplierLevel" label="指定供应商级别"><Input maxLength={32} placeholder="与指定供应商至少维护一项" /></Form.Item>
              </>
            ) : <Form.Item name="employeeType" label="适用员工类型" rules={[{ required: true, message: "请输入适用员工类型" }]}><Input maxLength={64} placeholder="如：普通员工、现场运营人员" /></Form.Item>}
            <Form.Item name="amount" label="金额 / 单价" rules={[{ required: true, message: "请输入金额" }]}><InputNumber min={0} precision={2} prefix="¥" className="full-width" /></Form.Item>
            <Form.Item name="effectiveAt" label="生效日期" rules={[{ required: true, message: "请选择生效日期" }]}><DatePicker className="full-width" /></Form.Item>
            <Form.Item name="expiresAt" label="失效日期" dependencies={["effectiveAt"]} rules={[({ getFieldValue }) => ({ validator(_, value?: Dayjs) { const start = getFieldValue("effectiveAt") as Dayjs | undefined; return !value || !start || value.isAfter(start) || value.isSame(start, "day") ? Promise.resolve() : Promise.reject(new Error("失效日期不能早于生效日期")); } })]}><DatePicker className="full-width" /></Form.Item>
          </div>
          <Form.Item name="achievementConditions" label="达成条件" rules={[{ required: true, message: "请输入达成条件" }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
          <Form.Item name="exclusionConditions" label="不发放 / 不结算条件"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={`${title}详情`} width={680} open={detailOpen} onClose={() => setDetailOpen(false)} extra={detail && can(Permission.POLICY_WRITE) ? <Button icon={<EditOutlined />} onClick={() => openEdit(detail)}>编辑</Button> : null}>
        {detail ? <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="政策名称">{detail.name}</Descriptions.Item>
          <Descriptions.Item label="政策类型">{labels.policyType[detail.type]}</Descriptions.Item>
          <Descriptions.Item label="归属项目">{projectName(detail)}</Descriptions.Item>
          <Descriptions.Item label="归属岗位">{displayText(detail.jobTitle, "全部岗位")}</Descriptions.Item>
          <Descriptions.Item label="适用对象">{isSupplier ? detail.supplier?.name || detail.supplierLevel || "通用供应商" : displayText(detail.employeeType)}</Descriptions.Item>
          <Descriptions.Item label="金额 / 单价">{formatMoney(detail.amount)}</Descriptions.Item>
          <Descriptions.Item label="达成条件">{detail.achievementConditions}</Descriptions.Item>
          <Descriptions.Item label="不发放 / 不结算条件">{displayText(detail.exclusionConditions, "无")}</Descriptions.Item>
          <Descriptions.Item label="有效期">{formatDate(detail.effectiveAt)} 至 {formatDate(detail.expiresAt, "长期")}</Descriptions.Item>
          <Descriptions.Item label="备注">{displayText(detail.notes, "—")}</Descriptions.Item>
        </Descriptions> : null}
      </Drawer>
    </>
  );
}

export function PoliciesPage({ type }: Props) {
  return <PermissionGuard permission={Permission.POLICY_READ}><PoliciesContent type={type} /></PermissionGuard>;
}
