import { useMemo, useState } from "react";
import {
  ApartmentOutlined,
  PlusOutlined,
  SwapOutlined,
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
import { Permission } from "@xiangneng/shared";
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
  branchId?: string;
  organizationUnitId?: string;
};

type EmployeeCreateValues = {
  employeeNo: string;
  name: string;
  phone: string;
  idCard: string;
  email?: string;
  legalEntityId?: string;
  branchId?: string;
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
  branchId?: string;
  reason: string;
};

type OffboardValues = {
  offboardDate: Dayjs;
  reason: string;
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

const changeLabels: Record<string, string> = {
  ONBOARD: "入职",
  TRANSFER: "调动",
  DISABLE: "停用",
  ENABLE: "启用",
  OFFBOARD: "离职",
  ARCHIVE: "归档"
};

function statusLabel(status: InternalEmployee["status"]): string {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function dateValue(value?: Dayjs): string | undefined {
  return value?.format("YYYY-MM-DD");
}

function InternalEmployeesContent() {
  const { message } = App.useApp();
  const { can } = useAuth();
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
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm<EmployeeCreateValues>();
  const [transferForm] = Form.useForm<TransferValues>();
  const [offboardForm] = Form.useForm<OffboardValues>();

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

  const branchOptions = options?.branches.map((item) => ({
    value: item.id,
    label: item.name
  })) ?? [];
  const organizationOptions = options?.organizationUnits
    .filter((item) => item.type === "CENTER" || item.type === "DEPARTMENT")
    .map((item) => ({ value: item.id, label: item.name })) ?? [];
  const positionOptions = options?.positions.map((item) => ({
    value: item.id,
    label: `${item.name}（${item.code}）`
  })) ?? [];

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
      await employeesResource.reload();
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
        title: "分公司",
        width: 170,
        render: (_, row) => row.branch?.name ?? "—"
      },
      {
        title: "部门/中心",
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
          can(Permission.INTERNAL_EMPLOYEE_WRITE) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增内部员工
            </Button>
          ) : undefined
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
            placeholder="分公司"
            options={branchOptions}
            value={draftFilters.branchId}
            onChange={(branchId) =>
              setDraftFilters((current) => ({ ...current, branchId }))
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
            <Form.Item name="legalEntityId" label="法人主体"><Select allowClear showSearch optionFilterProp="label" options={options?.legalEntities.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
            <Form.Item name="branchId" label="分公司"><Select allowClear showSearch optionFilterProp="label" options={branchOptions} /></Form.Item>
            <Form.Item name="organizationUnitId" label="部门/中心" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={organizationOptions} /></Form.Item>
            <Form.Item name="positionId" label="岗位" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={positionOptions} /></Form.Item>
            <Form.Item name="jobGradeId" label="职级"><Select allowClear options={options?.jobGrades.map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` }))} /></Form.Item>
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
            {can(Permission.INTERNAL_EMPLOYEE_TRANSFER) ? <Button icon={<SwapOutlined />} onClick={() => setTransferOpen(true)}>办理调动</Button> : null}
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
                        <Descriptions.Item label="系统账号">{detail.userId || "未绑定"}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                    <Card size="small" title="当前任职">
                      <Descriptions column={2}>
                        <Descriptions.Item label="法人主体">{detail.legalEntity?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="分公司">{detail.branch?.name || "—"}</Descriptions.Item>
                        <Descriptions.Item label="部门/中心">{detail.organizationUnit?.name || "—"}</Descriptions.Item>
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
                        { title: "分公司", render: (_, row) => row.branch?.name ?? "—" },
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
        title={`办理调动${detail ? `：${detail.name}` : ""}`}
        open={transferOpen}
        confirmLoading={submitting}
        onCancel={() => setTransferOpen(false)}
        onOk={() => transferForm.submit()}
        destroyOnHidden
      >
        <Form<TransferValues> form={transferForm} layout="vertical" onFinish={(values) => void submitTransfer(values)}>
          <Form.Item name="effectiveDate" label="生效日期" rules={[{ required: true }]}><DatePicker className="full-width" minDate={dayjs("2020-01-01")} /></Form.Item>
          <Form.Item name="branchId" label="调入分公司"><Select allowClear showSearch optionFilterProp="label" options={branchOptions} /></Form.Item>
          <Form.Item name="organizationUnitId" label="调入部门/中心" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={organizationOptions} /></Form.Item>
          <Form.Item name="positionId" label="调入岗位" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={positionOptions} /></Form.Item>
          <Form.Item name="reason" label="调动原因" rules={[{ required: true }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
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
