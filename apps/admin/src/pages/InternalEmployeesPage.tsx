import { useMemo, useState } from "react";
import {
  ApartmentOutlined,
  DollarOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  UserSwitchOutlined,
  UserDeleteOutlined
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography
} from "antd";
import type { TableColumnsType, TablePaginationConfig } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Permission, type UserRole } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ErrorBlock } from "../components/AsyncState";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import type {
  InternalEmployee,
  InternalEmployment,
  ListResult,
  OrganizationOptionSet
} from "../types/domain";

type EmployeeFilters = {
  keyword?: string;
  status?: InternalEmployee["status"];
  organizationUnitId?: string;
};

type EmployeeCreateValues = {
  employeeNo: string;
  name: string;
  phone: string;
  idCard: string;
  email?: string;
  userId?: string;
  legalEntityId?: string;
  organizationUnitId: string;
  positionId: string;
  jobGradeId?: string;
  onboardDate: Dayjs;
  reason?: string;
};

type TransferValues = {
  effectiveDate: Dayjs;
  organizationUnitId: string;
  positionId: string;
  jobGradeId?: string;
  reason: string;
};

type OffboardValues = {
  offboardDate: Dayjs;
  reason: string;
};

type AccountBindingValues = {
  userId?: string;
};

type GradeApprovalPolicyValues = {
  jobGradeId: string;
  maxApprovalYuan?: number | null;
};

type PositionPermissionValues = {
  positionId: string;
  bindings: Array<{
    roleCode: UserRole;
    scopeType: "SELF" | "ORG_UNIT" | "CENTER" | "GROUP";
  }>;
};

const statusOptions = [
  { value: "ACTIVE", label: "在职" },
  { value: "DISABLED", label: "停用" },
  { value: "LEFT", label: "离职" },
  { value: "ARCHIVED", label: "已归档" }
] satisfies Array<{ value: InternalEmployee["status"]; label: string }>;

const statusColor: Record<InternalEmployee["status"], string> = {
  ACTIVE: "green",
  DISABLED: "orange",
  LEFT: "default",
  ARCHIVED: "blue"
};

const positionScopeOptions = [
  { value: "SELF", label: "本人" },
  { value: "ORG_UNIT", label: "本部门" },
  { value: "CENTER", label: "本中心" },
  { value: "GROUP", label: "集团" }
] satisfies Array<{ value: PositionPermissionValues["bindings"][number]["scopeType"]; label: string }>;

const changeLabels: Record<string, string> = {
  ONBOARD: "入职",
  TRANSFER: "调动",
  DISABLE: "停用",
  ENABLE: "启用",
  OFFBOARD: "离职",
  ARCHIVE: "归档",
  ACCOUNT_BIND: "绑定账号",
  ACCOUNT_UNBIND: "解绑账号"
};

function statusLabel(status: InternalEmployee["status"]): string {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function dateValue(value?: Dayjs): string | undefined {
  return value?.format("YYYY-MM-DD");
}

function InternalEmployeesContent() {
  const { message } = App.useApp();
  const { can, user } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<EmployeeFilters>({});
  const [draftFilters, setDraftFilters] = useState<EmployeeFilters>({});
  const [detail, setDetail] = useState<InternalEmployee>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [offboardOpen, setOffboardOpen] = useState(false);
  const [accountBindingOpen, setAccountBindingOpen] = useState(false);
  const [positionPermissionOpen, setPositionPermissionOpen] = useState(false);
  const [gradePolicyOpen, setGradePolicyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm<EmployeeCreateValues>();
  const [transferForm] = Form.useForm<TransferValues>();
  const [offboardForm] = Form.useForm<OffboardValues>();
  const [accountBindingForm] = Form.useForm<AccountBindingValues>();
  const [positionPermissionForm] = Form.useForm<PositionPermissionValues>();
  const [gradePolicyForm] = Form.useForm<GradeApprovalPolicyValues>();

  const optionsResource = useApiResource(
    () => api.get<OrganizationOptionSet>("/organization/options"),
    []
  );
  const employeesResource = useApiResource(
    () =>
      api.get<ListResult<InternalEmployee>>("/internal-employees", {
        page,
        pageSize,
        ...filters
      }),
    [page, pageSize, JSON.stringify(filters)]
  );
  const options = optionsResource.data;
  const list = employeesResource.data;

  const organizationOptions = options?.organizationUnits
    .filter((item) => item.type !== "GROUP")
    .map((item) => ({ value: item.id, label: item.name })) ?? [];
  const positionOptions = options?.positions.map((item) => ({
    value: item.id,
    label: `${item.name}（${item.code}）`
  })) ?? [];

  const accountOptions = (options?.accounts ?? []).map((account) => ({
    value: account.id,
    label: `${account.displayName}（${account.username}）${account.internalEmployee ? ` · 已绑定 ${account.internalEmployee.name}` : ""}`,
    disabled: Boolean(account.internalEmployee && account.internalEmployee.id !== detail?.id)
  }));

  const unboundAccountOptions = (options?.accounts ?? [])
    .filter((account) => !account.internalEmployee)
    .map((account) => ({
      value: account.id,
      label: `${account.displayName}（${account.username}）`
    }));

  const roleOptions = options?.roles?.map((item) => ({
    value: item.code,
    label: `${item.name}（${item.code}）`
  })) ?? [];
  const canGrantGlobalPositionAuthorization = Boolean(
    user?.roles?.some((role) => role === "SUPER_ADMIN" || role === "SYSTEM_ADMIN") ||
    user?.role === "SUPER_ADMIN" ||
    user?.role === "SYSTEM_ADMIN"
  );
  const availablePositionScopeOptions = canGrantGlobalPositionAuthorization
    ? positionScopeOptions
    : positionScopeOptions.filter((option) => option.value !== "GROUP");

  const bindingsForPosition = (positionId: string): PositionPermissionValues["bindings"] =>
    (options?.positionRoleBindings ?? [])
      .filter((binding) => binding.positionId === positionId)
      .map((binding) => ({ roleCode: binding.role.code, scopeType: binding.scopeType }));


  const approvalPolicyForGrade = (jobGradeId: string) =>
    options?.jobGradeApprovalPolicies?.find((policy) => policy.jobGradeId === jobGradeId);

  const openGradePolicy = () => {
    const jobGradeId = options?.jobGrades[0]?.id;
    if (!jobGradeId) {
      message.warning("当前暂无可配置职级");
      return;
    }
    const policy = approvalPolicyForGrade(jobGradeId);
    gradePolicyForm.setFieldsValue({
      jobGradeId,
      maxApprovalYuan: policy?.maxReimbursementApprovalCents == null
        ? null
        : policy.maxReimbursementApprovalCents / 100
    });
    setGradePolicyOpen(true);
  };

  const openPositionPermissions = () => {
    const positionId = options?.positions[0]?.id;
    if (!positionId) {
      message.warning("当前组织范围内暂无可配置岗位");
      return;
    }
    positionPermissionForm.setFieldsValue({
      positionId,
      bindings: bindingsForPosition(positionId)
    });
    setPositionPermissionOpen(true);
  };

  const openEmployee = async (employee: InternalEmployee) => {
    setDetail(employee);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await api.get<InternalEmployee>(`/internal-employees/${employee.id}`));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCreate = async (values: EmployeeCreateValues) => {
    setSubmitting(true);
    try {
      await api.post<InternalEmployee>("/internal-employees", {
        ...values,
        idCard: values.idCard.trim().toUpperCase(),
        onboardDate: dateValue(values.onboardDate)
      });
      message.success("内部员工已创建，首条任职和入职变更已同步生成");
      createForm.resetFields();
      setCreateOpen(false);
      await Promise.all([employeesResource.reload(), optionsResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitTransfer = async (values: TransferValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/internal-employees/${detail.id}/transfer`, {
        ...values,
        expectedVersion: detail.version,
        effectiveDate: dateValue(values.effectiveDate)
      });
      message.success("员工调动已完成，原任职和原数据范围已关闭");
      transferForm.resetFields();
      setTransferOpen(false);
      const next = await api.get<InternalEmployee>(`/internal-employees/${detail.id}`);
      setDetail(next);
      await employeesResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitOffboard = async (values: OffboardValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/internal-employees/${detail.id}/offboard`, {
        expectedVersion: detail.version,
        offboardDate: dateValue(values.offboardDate),
        reason: values.reason
      });
      message.success("离职已完成，账号、角色和数据范围已同步停用");
      offboardForm.resetFields();
      setOffboardOpen(false);
      const next = await api.get<InternalEmployee>(`/internal-employees/${detail.id}`);
      setDetail(next);
      await employeesResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };



  const submitAccountBinding = async (values: AccountBindingValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.put(`/internal-employees/${detail.id}/account`, {
        expectedVersion: detail.version,
        userId: values.userId ?? null
      });
      message.success(values.userId ? "系统账号已绑定，岗位权限已同步" : "系统账号已解绑，原岗位权限已撤销");
      setAccountBindingOpen(false);
      const next = await api.get<InternalEmployee>(`/internal-employees/${detail.id}`);
      setDetail(next);
      await Promise.all([employeesResource.reload(), optionsResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitGradePolicy = async (values: GradeApprovalPolicyValues) => {
    setSubmitting(true);
    try {
      const maxReimbursementApprovalCents = values.maxApprovalYuan == null
        ? null
        : Math.round(values.maxApprovalYuan * 100);
      await api.put(`/organization/job-grades/${values.jobGradeId}/reimbursement-policy`, {
        maxReimbursementApprovalCents
      });
      message.success("职级报销审批额度已保存");
      setGradePolicyOpen(false);
      await optionsResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitPositionPermissions = async (values: PositionPermissionValues) => {
    setSubmitting(true);
    try {
      await api.put(`/organization/positions/${values.positionId}/role-bindings`, {
        bindings: values.bindings
      });
      message.success("岗位权限已保存，当前在职员工的岗位授权已同步刷新");
      setPositionPermissionOpen(false);
      await optionsResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<TableColumnsType<InternalEmployee>>(
    () => [
      {
        title: "员工编号",
        dataIndex: "employeeNo",
        fixed: "left",
        width: 130
      },
      {
        title: "姓名",
        dataIndex: "name",
        fixed: "left",
        width: 110,
        render: (_, row) => (
          <Button type="link" size="small" onClick={() => void openEmployee(row)}>
            {row.name}
          </Button>
        )
      },
      { title: "手机号", dataIndex: "phone", width: 135 },
      { title: "身份证号", dataIndex: "idCard", width: 195 },
      {
        title: "状态",
        dataIndex: "status",
        width: 95,
        render: (value: InternalEmployee["status"]) => (
          <Tag color={statusColor[value]}>{statusLabel(value)}</Tag>
        )
      },
      {
        title: "所属部门",
        width: 170,
        render: (_, row) => row.organizationUnit?.name ?? "—"
      },
      {
        title: "岗位",
        width: 150,
        render: (_, row) => row.position?.name ?? "—"
      },
      {
        title: "职级",
        width: 130,
        render: (_, row) => row.jobGrade?.name ?? "—"
      },
      {
        title: "入职日期",
        dataIndex: "onboardDate",
        width: 120,
        render: (value: string) => formatDate(value)
      },
      {
        title: "操作",
        fixed: "right",
        width: 105,
        render: (_, row) => (
          <Button type="link" size="small" onClick={() => void openEmployee(row)}>
            查看详情
          </Button>
        )
      }
    ],
    []
  );

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total: list?.pagination.total ?? 0,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 名内部员工`
  };

  return (
    <>
      <PageHeader
        title="内部员工管理"
        description="管理公司内部员工、组织任职、调动与离职。手机号和身份证号按当前账号权限完整显示，所有变更保留历史。"
        extra={
          <Space>
            {can(Permission.USER_MANAGE) ? (
              <>
                <Button icon={<SafetyCertificateOutlined />} onClick={openPositionPermissions}>
                  岗位权限配置
                </Button>
                <Button icon={<DollarOutlined />} onClick={openGradePolicy}>
                  职级审批额度
                </Button>
              </>
            ) : null}
            {can(Permission.INTERNAL_EMPLOYEE_WRITE) ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新增内部员工
              </Button>
            ) : null}
          </Space>
        }
      />
      <ContentCard>
        <div className="filter-grid internal-employee-filters">
          <Input
            allowClear
            placeholder="姓名 / 员工编号 / 手机号 / 身份证号"
            value={draftFilters.keyword}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                keyword: event.target.value
              }))
            }
            onPressEnter={() => {
              setPage(1);
              setFilters(draftFilters);
            }}
          />
          <Select
            allowClear
            placeholder="员工状态"
            options={statusOptions}
            value={draftFilters.status}
            onChange={(status) =>
              setDraftFilters((current) => ({ ...current, status }))
            }
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="部门/中心"
            options={organizationOptions}
            value={draftFilters.organizationUnitId}
            onChange={(organizationUnitId) =>
              setDraftFilters((current) => ({ ...current, organizationUnitId }))
            }
          />
          <Space>
            <Button
              type="primary"
              onClick={() => {
                setPage(1);
                setFilters(draftFilters);
              }}
            >
              查询
            </Button>
            <Button
              onClick={() => {
                setDraftFilters({});
                setFilters({});
                setPage(1);
              }}
            >
              重置
            </Button>
          </Space>
        </div>

        {employeesResource.error && !list ? (
          <ErrorBlock
            error={employeesResource.error}
            onRetry={() => void employeesResource.reload()}
          />
        ) : (
          <Table<InternalEmployee>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={employeesResource.loading}
            scroll={{ x: 1500 }}
            pagination={pagination}
            onChange={(next) => {
              setPage(next.current ?? 1);
              setPageSize(next.pageSize ?? 20);
            }}
            locale={{ emptyText: "当前范围内暂无内部员工" }}
          />
        )}
      </ContentCard>

      <Modal
        title="新增内部员工"
        open={createOpen}
        width={820}
        confirmLoading={submitting}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        destroyOnHidden
      >
        <Form<EmployeeCreateValues>
          form={createForm}
          layout="vertical"
          onFinish={(values) => void submitCreate(values)}
        >
          <div className="form-grid two-columns">
            <Form.Item name="employeeNo" label="员工编号" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
            <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input maxLength={64} /></Form.Item>
            <Form.Item name="phone" label="手机号" rules={[{ required: true }, { pattern: /^1\d{10}$/, message: "请输入11位手机号" }]}><Input maxLength={11} /></Form.Item>
            <Form.Item name="idCard" label="身份证号" rules={[{ required: true }]}><Input maxLength={32} /></Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ type: "email" }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="legalEntityId" label="合同主体" tooltip="合同主体是劳动合同签订公司，与员工实际所属部门独立。"><Select allowClear showSearch optionFilterProp="label" options={options?.legalEntities.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item name="organizationUnitId" label="所属部门/中心" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={organizationOptions} /></Form.Item>
            <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={positionOptions} /></Form.Item>
            <Form.Item name="jobGradeId" label="职级"><Select allowClear options={options?.jobGrades.map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` }))} /></Form.Item>
            {can(Permission.USER_MANAGE) ? <Form.Item name="userId" label="绑定系统账号" tooltip="可先在权限与审计中创建账号；绑定后按岗位自动同步角色和数据范围。"><Select allowClear showSearch optionFilterProp="label" options={unboundAccountOptions} placeholder="可暂不绑定" /></Form.Item> : null}
            <Form.Item name="onboardDate" label="入职日期" rules={[{ required: true }]}><DatePicker className="full-width" /></Form.Item>
            <Form.Item name="reason" label="入职说明"><Input maxLength={500} /></Form.Item>
          </div>
        </Form>
      </Modal>

      <Drawer
        title={detail ? (
          <Space wrap>
            <Typography.Title level={4}>{detail.name}</Typography.Title>
            <Tag color={statusColor[detail.status]}>{statusLabel(detail.status)}</Tag>
            <Typography.Text type="secondary">{detail.employeeNo}</Typography.Text>
          </Space>
        ) : "内部员工详情"}
        size={900}
        open={detailOpen}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        extra={detail?.status === "ACTIVE" ? (
          <Space>
            {can(Permission.USER_MANAGE) && can(Permission.INTERNAL_EMPLOYEE_WRITE) ? <Button icon={<UserSwitchOutlined />} onClick={() => {
              accountBindingForm.setFieldsValue({ userId: detail.userId ?? undefined });
              setAccountBindingOpen(true);
            }}>绑定账号</Button> : null}
            {can(Permission.INTERNAL_EMPLOYEE_TRANSFER) ? <Button icon={<SwapOutlined />} onClick={() => {
              transferForm.setFieldsValue({
                organizationUnitId: detail.organizationUnitId ?? undefined,
                positionId: detail.positionId ?? undefined,
                jobGradeId: detail.jobGradeId ?? undefined
              });
              setTransferOpen(true);
            }}>办理调动/晋升</Button> : null}
            {can(Permission.INTERNAL_EMPLOYEE_OFFBOARD) ? <Button danger icon={<UserDeleteOutlined />} onClick={() => setOffboardOpen(true)}>办理离职</Button> : null}
          </Space>
        ) : undefined}
      >
        {detail ? (
          <Tabs
            items={[
              {
                key: "base",
                label: "完整档案",
                children: (
                  <Space orientation="vertical" size={16} className="full-width">
                    <Card size="small" title="身份与联系信息">
                      <Descriptions column={2}>
                        <Descriptions.Item label="员工编号">{detail.employeeNo}</Descriptions.Item>
                        <Descriptions.Item label="姓名">{detail.name}</Descriptions.Item>
                        <Descriptions.Item label="手机号">{detail.phone}</Descriptions.Item>
                        <Descriptions.Item label="身份证号">{detail.idCard}</Descriptions.Item>
                        <Descriptions.Item label="邮箱">{detail.email || "—"}</Descriptions.Item>
                        <Descriptions.Item label="系统账号">{detail.user ? `${detail.user.displayName}（${detail.user.username}）` : "未绑定"}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                    <Card size="small" title="当前任职">
                      <Descriptions column={2}>
                        <Descriptions.Item label="合同主体">{detail.legalEntity?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="所属部门/中心">{detail.organizationUnit?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="岗位">{detail.position?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="职级">{detail.jobGrade?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="档案版本">V{detail.version}</Descriptions.Item>
                        <Descriptions.Item label="入职日期">{formatDate(detail.onboardDate)}</Descriptions.Item>
                        <Descriptions.Item label="离职日期">{detail.offboardDate ? formatDate(detail.offboardDate) : "—"}</Descriptions.Item>
                        <Descriptions.Item label="离职原因" span={2}>{detail.offboardReason || "—"}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Space>
                )
              },
              {
                key: "history",
                label: "任职与变更记录",
                children: (
                  <Space orientation="vertical" size={18} className="full-width">
                    <Typography.Title level={5}>任职历史</Typography.Title>
                    <Table<InternalEmployment>
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={detail.employments ?? []}
                      columns={[
                        { title: "开始日期", dataIndex: "startedAt", render: (value: string) => formatDate(value) },
                        { title: "结束日期", dataIndex: "endedAt", render: (value) => value ? formatDate(value) : "当前" },
                        { title: "部门", render: (_, row) => row.organizationUnit.name },
                        { title: "岗位", render: (_, row) => row.position.name },
                        { title: "说明", dataIndex: "reason", render: (value) => value || "—" }
                      ]}
                    />
                    <Typography.Title level={5}>变更时间线</Typography.Title>
                    <Timeline
                      items={(detail.changes ?? []).map((change) => ({
                        dot: <ApartmentOutlined />,
                        children: (
                          <Space orientation="vertical" size={2}>
                            <Space>
                              <Tag color="blue">{changeLabels[change.type] ?? change.type}</Tag>
                              <Typography.Text strong>{formatDate(change.effectiveAt)}</Typography.Text>
                            </Space>
                            <Typography.Text>{change.reason || "无补充说明"}</Typography.Text>
                            <Typography.Text type="secondary">{formatDateTime(change.createdAt)}</Typography.Text>
                          </Space>
                        )
                      }))}
                    />
                    {!detail.changes?.length ? <Typography.Text type="secondary">暂无变更记录</Typography.Text> : null}
                  </Space>
                )
              }
            ]}
          />
        ) : null}
      </Drawer>


      <Modal
        title={`绑定系统账号${detail ? `：${detail.name}` : ""}`}
        open={accountBindingOpen}
        width={560}
        confirmLoading={submitting}
        onCancel={() => setAccountBindingOpen(false)}
        onOk={() => accountBindingForm.submit()}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          绑定后系统会根据员工当前岗位生成角色权限，并以所属部门或中心作为数据范围。换绑会撤销旧账号的岗位来源权限，但保留人工和临时授权。
        </Typography.Paragraph>
        <Form<AccountBindingValues> form={accountBindingForm} layout="vertical" onFinish={(values) => void submitAccountBinding(values)}>
          <Form.Item name="userId" label="系统账号">
            <Select allowClear showSearch optionFilterProp="label" options={accountOptions} placeholder="清空后保存即解除绑定" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="岗位权限配置"
        open={positionPermissionOpen}
        width={760}
        confirmLoading={submitting}
        onCancel={() => setPositionPermissionOpen(false)}
        onOk={() => positionPermissionForm.submit()}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          岗位决定系统职责，数据范围随员工当前组织归属自动生成。保存后会刷新该岗位全部在职员工的岗位授权，人工和临时授权不会被删除。
        </Typography.Paragraph>
        <Form<PositionPermissionValues>
          form={positionPermissionForm}
          layout="vertical"
          onFinish={(values) => void submitPositionPermissions(values)}
        >
          <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={positionOptions}
              onChange={(positionId) => positionPermissionForm.setFieldValue("bindings", bindingsForPosition(positionId))}
            />
          </Form.Item>
          <Form.List name="bindings">
            {(fields, { add, remove }, { errors }) => (
              <Space direction="vertical" className="full-width" size="middle">
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="full-width">
                    <Form.Item
                      {...field}
                      name={[field.name, "roleCode"]}
                      rules={[{ required: true, message: "请选择角色" }]}
                      style={{ minWidth: 300, marginBottom: 0 }}
                    >
                      <Select showSearch optionFilterProp="label" placeholder="系统角色" options={roleOptions} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, "scopeType"]}
                      rules={[{ required: true, message: "请选择数据范围" }]}
                      style={{ minWidth: 190, marginBottom: 0 }}
                    >
                      <Select placeholder="数据范围" options={availablePositionScopeOptions} />
                    </Form.Item>
                    <Button danger type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>删除</Button>
                  </Space>
                ))}
                <Button type="dashed" block onClick={() => add({ scopeType: "SELF" })}>+ 添加岗位角色</Button>
                <Form.ErrorList errors={errors} />
                {!fields.length ? <Typography.Text type="secondary">未配置岗位角色时，保存会撤销该岗位产生的自动授权，不影响人工或临时授权。</Typography.Text> : null}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>


      <Modal
        title="职级报销审批额度"
        open={gradePolicyOpen}
        width={560}
        confirmLoading={submitting}
        onCancel={() => setGradePolicyOpen(false)}
        onOk={() => gradePolicyForm.submit()}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          岗位决定是否具备审批职责，职级决定单笔报销可审批到的金额。留空表示该职级暂不限制审批金额，具体额度请按公司制度配置。
        </Typography.Paragraph>
        <Form<GradeApprovalPolicyValues>
          form={gradePolicyForm}
          layout="vertical"
          onFinish={(values) => void submitGradePolicy(values)}
        >
          <Form.Item name="jobGradeId" label="职级" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={options?.jobGrades.map((grade) => ({
                value: grade.id,
                label: `${grade.name}（${grade.code} / L${grade.level}）`
              })) ?? []}
              onChange={(jobGradeId) => {
                const policy = approvalPolicyForGrade(jobGradeId);
                gradePolicyForm.setFieldValue(
                  "maxApprovalYuan",
                  policy?.maxReimbursementApprovalCents == null
                    ? null
                    : policy.maxReimbursementApprovalCents / 100
                );
              }}
            />
          </Form.Item>
          <Form.Item
            name="maxApprovalYuan"
            label="单笔最高审批金额（元）"
            tooltip="报销金额超过该额度时，当前职级负责人不能审批通过，需要由更高职级且具备审批角色的人员处理。"
          >
            <InputNumber
              className="full-width"
              min={0.01}
              precision={2}
              placeholder="留空表示暂不限制"
              addonAfter="元"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`办理调动/晋升${detail ? `：${detail.name}` : ""}`}
        open={transferOpen}
        confirmLoading={submitting}
        onCancel={() => setTransferOpen(false)}
        onOk={() => transferForm.submit()}
        destroyOnHidden
      >
        <Form<TransferValues> form={transferForm} layout="vertical" onFinish={(values) => void submitTransfer(values)}>
          <Form.Item name="effectiveDate" label="生效日期" rules={[{ required: true }]}><DatePicker className="full-width" minDate={dayjs("2020-01-01")} /></Form.Item>
          <Form.Item name="organizationUnitId" label="调入部门/中心" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={organizationOptions} /></Form.Item>
          <Form.Item name="positionId" label="调入岗位" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={positionOptions} /></Form.Item>
          <Form.Item name="jobGradeId" label="调整后职级"><Select allowClear showSearch optionFilterProp="label" options={options?.jobGrades.map((item) => ({ value: item.id, label: `${item.name}（${item.code} / L${item.level}）` }))} /></Form.Item>
          <Form.Item name="reason" label="调动/晋升原因" rules={[{ required: true }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`办理离职${detail ? `：${detail.name}` : ""}`}
        open={offboardOpen}
        confirmLoading={submitting}
        okButtonProps={{ danger: true }}
        onCancel={() => setOffboardOpen(false)}
        onOk={() => offboardForm.submit()}
        destroyOnHidden
      >
        <Form<OffboardValues> form={offboardForm} layout="vertical" onFinish={(values) => void submitOffboard(values)}>
          <Form.Item name="offboardDate" label="离职日期" rules={[{ required: true }]}><DatePicker className="full-width" /></Form.Item>
          <Form.Item name="reason" label="离职原因" rules={[{ required: true }]}><Input.TextArea rows={4} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function InternalEmployeesPage() {
  return (
    <PermissionGuard permission={Permission.INTERNAL_EMPLOYEE_READ}>
      <InternalEmployeesContent />
    </PermissionGuard>
  );
}
