import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  UploadOutlined,
  WalletOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Upload
} from "antd";
import type { TableColumnsType, TablePaginationConfig, UploadProps } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Permission } from "@xiangneng/shared";
import { useAuth } from "../auth/AuthContext";
import { ErrorBlock } from "../components/AsyncState";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage, saveBlob } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import type {
  ListResult,
  OrganizationOptionSet,
  Reimbursement,
  ReimbursementArtifact,
  ReimbursementIssue,
  ReimbursementLine,
  ReimbursementStatus
} from "../types/domain";

type Filters = {
  keyword?: string;
  status?: ReimbursementStatus;
  branchId?: string;
  organizationUnitId?: string;
};

type DraftLine = {
  expenseDate: Dayjs;
  category: string;
  description: string;
  payeeName?: string;
  payeeAccount?: string;
  payeeBank?: string;
  paymentAmount: number;
  invoiceAmount: number;
};

type CreateValues = {
  title: string;
  branchId?: string;
  organizationUnitId?: string;
  lines: DraftLine[];
};

type IssueValues = {
  lineId?: string;
  type: string;
  description: string;
};

type PaymentValues = {
  reference: string;
  paidAt: Dayjs;
};

const statusItems: Array<{
  value: ReimbursementStatus;
  label: string;
  color: string;
}> = [
  { value: "PENDING_SUBMISSION", label: "待提交", color: "default" },
  { value: "DEPARTMENT_PREPARING", label: "部门制单中", color: "blue" },
  { value: "OWNER_REVIEWING", label: "负责人审核中", color: "gold" },
  { value: "FINANCE_REVIEWING", label: "财务审核中", color: "orange" },
  { value: "APPROVED", label: "审核通过", color: "green" },
  { value: "PENDING_PAYMENT", label: "待打款", color: "purple" },
  { value: "PAID", label: "已打款", color: "success" }
];

const nextStatus: Partial<Record<ReimbursementStatus, ReimbursementStatus>> = {
  PENDING_SUBMISSION: "DEPARTMENT_PREPARING",
  DEPARTMENT_PREPARING: "OWNER_REVIEWING",
  OWNER_REVIEWING: "FINANCE_REVIEWING",
  FINANCE_REVIEWING: "APPROVED",
  APPROVED: "PENDING_PAYMENT"
};

const nextActionLabel: Partial<Record<ReimbursementStatus, string>> = {
  PENDING_SUBMISSION: "提交部门制单",
  DEPARTMENT_PREPARING: "提交负责人审核",
  OWNER_REVIEWING: "负责人审核通过",
  FINANCE_REVIEWING: "财务审核通过",
  APPROVED: "确认进入待打款"
};

const artifactLabels: Record<ReimbursementArtifact["type"], string> = {
  REIMBURSEMENT_FORM: "报销单（Excel）",
  PAYMENT_PACKAGE: "付款凭证材料包（ZIP）",
  INVOICE_PACKAGE: "发票材料包（ZIP）"
};

function statusLabel(status: ReimbursementStatus): string {
  return statusItems.find((item) => item.value === status)?.label ?? status;
}

function statusTag(status: ReimbursementStatus) {
  const item = statusItems.find((candidate) => candidate.value === status);
  return <Tag color={item?.color}>{item?.label ?? status}</Tag>;
}

function currency(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(cents / 100);
}

function toLinePayload(line: DraftLine, index: number) {
  return {
    sequence: index + 1,
    expenseDate: line.expenseDate.format("YYYY-MM-DD"),
    category: line.category,
    description: line.description,
    payeeName: line.payeeName,
    payeeAccount: line.payeeAccount,
    payeeBank: line.payeeBank,
    paymentCents: Math.round(line.paymentAmount * 100),
    invoiceCents: Math.round(line.invoiceAmount * 100)
  };
}

function readPermission(can: (permission: Permission) => boolean): boolean {
  return [
    Permission.REIMBURSEMENT_SELF,
    Permission.REIMBURSEMENT_MANAGE,
    Permission.REIMBURSEMENT_APPROVE,
    Permission.REIMBURSEMENT_FINANCE_REVIEW,
    Permission.REIMBURSEMENT_PAY,
    Permission.REIMBURSEMENT_EXPORT
  ].some(can);
}

export function ReimbursementsPage() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>({});
  const [draftFilters, setDraftFilters] = useState<Filters>({});
  const [detail, setDetail] = useState<Reimbursement>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<ReimbursementIssue>();
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm<CreateValues>();
  const [issueForm] = Form.useForm<IssueValues>();
  const [resolutionForm] = Form.useForm<{ resolution: string }>();
  const [paymentForm] = Form.useForm<PaymentValues>();

  const optionsResource = useApiResource(
    () => api.get<OrganizationOptionSet>("/organization/options"),
    []
  );
  const listResource = useApiResource(
    () =>
      api.get<ListResult<Reimbursement>>("/reimbursements", {
        page,
        pageSize,
        ...filters
      }),
    [page, pageSize, JSON.stringify(filters)]
  );

  const list = listResource.data;
  const options = optionsResource.data;
  const summary = useMemo(() => {
    const rows = list?.items ?? [];
    return {
      count: list?.pagination.total ?? 0,
      payment: rows.reduce((sum, item) => sum + item.totalPaymentCents, 0),
      invoice: rows.reduce((sum, item) => sum + item.totalInvoiceCents, 0),
      open: rows.filter((item) => item.status !== "PAID").length
    };
  }, [list]);

  const reloadDetail = async (id = detail?.id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      setDetail(await api.get<Reimbursement>(`/reimbursements/${id}`));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = async (row: Reimbursement) => {
    setDetail(row);
    setDetailOpen(true);
    await reloadDetail(row.id);
  };

  const createBatch = async (values: CreateValues) => {
    const invalid = values.lines.find(
      (line) => line.invoiceAmount <= line.paymentAmount
    );
    if (invalid) {
      message.error("每条明细的发票金额都必须严格大于付款金额");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post<Reimbursement>("/reimbursements", {
        title: values.title,
        branchId: values.branchId,
        organizationUnitId: values.organizationUnitId,
        lines: values.lines.map(toLinePayload)
      });
      message.success("报销单已创建，金额校验和流程版本已写入");
      createForm.resetFields();
      setCreateOpen(false);
      await listResource.reload();
      await openDetail(created);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const transition = async () => {
    if (!detail) return;
    const targetStatus = nextStatus[detail.status];
    if (!targetStatus) return;
    setSubmitting(true);
    try {
      await api.post(`/reimbursements/${detail.id}/transition`, {
        expectedVersion: detail.version,
        targetStatus,
        comment: nextActionLabel[detail.status]
      });
      message.success(`状态已更新为“${statusLabel(targetStatus)}”`);
      await Promise.all([reloadDetail(detail.id), listResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const createIssue = async (values: IssueValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/reimbursements/${detail.id}/issues`, values);
      message.success("问题已记录，解决前系统会阻止继续流转");
      issueForm.resetFields();
      setIssueOpen(false);
      await reloadDetail();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resolveIssue = async (values: { resolution: string }) => {
    if (!detail || !selectedIssue) return;
    setSubmitting(true);
    try {
      await api.post(
        `/reimbursements/${detail.id}/issues/${selectedIssue.id}/resolve`,
        values
      );
      message.success("问题已解决并保留处理记录");
      resolutionForm.resetFields();
      setResolutionOpen(false);
      setSelectedIssue(undefined);
      await reloadDetail();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const recordPayment = async (values: PaymentValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/reimbursements/${detail.id}/payments`, {
        expectedVersion: detail.version,
        amountCents: detail.totalPaymentCents,
        reference: values.reference,
        paidAt: values.paidAt.toISOString()
      });
      message.success("打款信息已登记，报销单已完成闭环");
      paymentForm.resetFields();
      setPaymentOpen(false);
      await Promise.all([reloadDetail(), listResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAttachment = (
    line: ReimbursementLine,
    type: "PAYMENT_VOUCHER" | "INVOICE"
  ): UploadProps["customRequest"] => async ({ file, onSuccess, onError }) => {
    if (!detail || !(file instanceof File)) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.upload(
        `/reimbursements/${detail.id}/attachments?type=${type}&lineId=${line.id}`,
        formData
      );
      message.success(type === "INVOICE" ? "发票已上传" : "付款凭证已上传");
      onSuccess?.({});
      await reloadDetail();
    } catch (error) {
      message.error(getErrorMessage(error));
      onError?.(error instanceof Error ? error : new Error("上传失败"));
    }
  };

  const generateArtifact = async (type: ReimbursementArtifact["type"]) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      await api.post(`/reimbursements/${detail.id}/artifacts/generate`, { type });
      message.success(`${artifactLabels[type]}已生成`);
      await reloadDetail();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadArtifact = async (artifact: ReimbursementArtifact) => {
    if (!detail) return;
    try {
      const file = await api.download(
        `/reimbursements/${detail.id}/artifacts/${artifact.id}`
      );
      saveBlob(file.blob, file.fileName);
      message.success("下载已开始");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const columns: TableColumnsType<Reimbursement> = [
    {
      title: "报销单",
      width: 280,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary" copyable>{row.code}</Typography.Text>
        </Space>
      )
    },
    {
      title: "申请与范围",
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{row.applicant?.displayName ?? "—"}</span>
          <Typography.Text type="secondary">
            {row.branch?.name ?? "集团"} / {row.organizationUnit?.name ?? "未分部门"}
          </Typography.Text>
        </Space>
      )
    },
    {
      title: "付款金额",
      dataIndex: "totalPaymentCents",
      width: 150,
      render: (value: number) => <Typography.Text strong>{currency(value)}</Typography.Text>
    },
    {
      title: "发票金额 / 票额差",
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <span>{currency(row.totalInvoiceCents)}</span>
          <Typography.Text type="success">多票 {currency(row.invoiceExcessCents)}</Typography.Text>
        </Space>
      )
    },
    {
      title: "流程状态",
      dataIndex: "status",
      width: 150,
      render: statusTag
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 170,
      render: (value) => formatDateTime(value)
    },
    {
      title: "操作",
      fixed: "right",
      width: 130,
      render: (_, row) => (
        <Button type="link" onClick={() => void openDetail(row)}>
          查看与处理
        </Button>
      )
    }
  ];

  if (!readPermission(can)) {
    return <Alert type="error" showIcon title="当前账号没有报销业务权限" />;
  }

  const artifactCards = ([
    "REIMBURSEMENT_FORM",
    "PAYMENT_PACKAGE",
    "INVOICE_PACKAGE"
  ] as const).map((type) => {
    const artifact = detail?.artifacts.find((item) => item.type === type);
    return (
      <Card key={type} size="small" title={artifactLabels[type]}>
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Tag color={artifact?.status === "GENERATED" ? "green" : artifact?.status === "FAILED" ? "red" : "default"}>
            {artifact?.status === "GENERATED" ? "已生成" : artifact?.status === "FAILED" ? "生成失败" : "尚未生成"}
          </Tag>
          {artifact?.error ? <Typography.Text type="danger">{artifact.error}</Typography.Text> : null}
          <Space>
            <Button
              icon={<FileDoneOutlined />}
              disabled={!detail || !["APPROVED", "PENDING_PAYMENT", "PAID"].includes(detail.status)}
              loading={submitting}
              onClick={() => void generateArtifact(type)}
            >
              {artifact?.status === "GENERATED" ? "重新生成" : "生成"}
            </Button>
            {artifact?.status === "GENERATED" ? (
              <Button icon={<DownloadOutlined />} onClick={() => void downloadArtifact(artifact)}>
                下载
              </Button>
            ) : null}
          </Space>
        </Space>
      </Card>
    );
  });

  return (
    <div className="page-stack reimbursement-page">
      <PageHeader
        title="报销业务闭环"
        description="从申请、部门制单、负责人审核、财务审核到打款，金额、附件、问题、审批和生成物全部留痕。"
        extra={
          can(Permission.REIMBURSEMENT_SELF) || can(Permission.REIMBURSEMENT_MANAGE) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              createForm.setFieldsValue({
                lines: [{
                  expenseDate: dayjs(),
                  category: "差旅费",
                  description: "",
                  paymentAmount: 0,
                  invoiceAmount: 0.01
                }]
              });
              setCreateOpen(true);
            }}>
              新建报销单
            </Button>
          ) : null
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}><Card><Typography.Text type="secondary">报销单总数</Typography.Text><Typography.Title level={3}>{summary.count}</Typography.Title></Card></Col>
        <Col xs={24} md={6}><Card><Typography.Text type="secondary">当前页付款合计</Typography.Text><Typography.Title level={3}>{currency(summary.payment)}</Typography.Title></Card></Col>
        <Col xs={24} md={6}><Card><Typography.Text type="secondary">当前页发票合计</Typography.Text><Typography.Title level={3}>{currency(summary.invoice)}</Typography.Title></Card></Col>
        <Col xs={24} md={6}><Card><Typography.Text type="secondary">处理中</Typography.Text><Typography.Title level={3}>{summary.open}</Typography.Title></Card></Col>
      </Row>

      <ContentCard
        title="报销单列表"
        extra={<Button icon={<ReloadOutlined />} onClick={() => void listResource.reload()}>刷新</Button>}
      >
        <Space wrap className="filter-bar">
          <Input.Search
            allowClear
            placeholder="搜索编号、标题或申请人"
            style={{ width: 260 }}
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((value) => ({ ...value, keyword: event.target.value }))}
            onSearch={() => {
              setPage(1);
              setFilters(draftFilters);
            }}
          />
          <Select
            allowClear
            placeholder="全部流程状态"
            style={{ width: 180 }}
            options={statusItems}
            value={draftFilters.status}
            onChange={(status) => setDraftFilters((value) => ({ ...value, status }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部分公司"
            style={{ width: 190 }}
            options={options?.branches.map((item) => ({ value: item.id, label: item.name }))}
            value={draftFilters.branchId}
            onChange={(branchId) => setDraftFilters((value) => ({ ...value, branchId }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部部门"
            style={{ width: 190 }}
            options={options?.organizationUnits.map((item) => ({ value: item.id, label: item.name }))}
            value={draftFilters.organizationUnitId}
            onChange={(organizationUnitId) => setDraftFilters((value) => ({ ...value, organizationUnitId }))}
          />
          <Button type="primary" onClick={() => {
            setPage(1);
            setFilters(draftFilters);
          }}>查询</Button>
          <Button onClick={() => {
            setDraftFilters({});
            setFilters({});
            setPage(1);
          }}>重置</Button>
        </Space>
        {listResource.error ? (
          <ErrorBlock error={listResource.error} onRetry={() => void listResource.reload()} />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={listResource.loading}
            scroll={{ x: 1280 }}
            pagination={{
              current: page,
              pageSize,
              total: list?.pagination.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }}
            onChange={(pagination: TablePaginationConfig) => {
              setPage(pagination.current ?? 1);
              setPageSize(pagination.pageSize ?? 20);
            }}
          />
        )}
      </ContentCard>

      <Drawer
        title={detail ? `${detail.code} · ${detail.title}` : "报销单详情"}
        size={1160}
        open={detailOpen}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        extra={
          detail ? (
            <Space>
              {nextStatus[detail.status] ? (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={submitting}
                  onClick={() => void transition()}
                >
                  {nextActionLabel[detail.status]}
                </Button>
              ) : null}
              {detail.status === "PENDING_PAYMENT" && can(Permission.REIMBURSEMENT_PAY) ? (
                <Button type="primary" icon={<WalletOutlined />} onClick={() => {
                  paymentForm.setFieldsValue({ paidAt: dayjs() });
                  setPaymentOpen(true);
                }}>登记打款</Button>
              ) : null}
            </Space>
          ) : null
        }
      >
        {detail ? (
          <Space orientation="vertical" size={20} style={{ width: "100%" }}>
            <Steps
              size="small"
              current={statusItems.findIndex((item) => item.value === detail.status)}
              items={statusItems.map((item) => ({ title: item.label }))}
            />
            {detail.issues.some((issue) => issue.status === "OPEN") ? (
              <Alert
                type="warning"
                showIcon
                title={`存在 ${detail.issues.filter((issue) => issue.status === "OPEN").length} 个未解决问题，流程已锁定`}
              />
            ) : null}
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}><Card size="small"><Typography.Text type="secondary">付款合计</Typography.Text><Typography.Title level={4}>{currency(detail.totalPaymentCents)}</Typography.Title></Card></Col>
              <Col xs={24} md={8}><Card size="small"><Typography.Text type="secondary">发票合计</Typography.Text><Typography.Title level={4}>{currency(detail.totalInvoiceCents)}</Typography.Title></Card></Col>
              <Col xs={24} md={8}><Card size="small"><Typography.Text type="secondary">票额差</Typography.Text><Typography.Title level={4} type="success">{currency(detail.invoiceExcessCents)}</Typography.Title></Card></Col>
            </Row>
            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="申请人">{detail.applicant.displayName}</Descriptions.Item>
              <Descriptions.Item label="分公司">{detail.branch?.name ?? "集团"}</Descriptions.Item>
              <Descriptions.Item label="部门">{detail.organizationUnit?.name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
              <Descriptions.Item label="版本">V{detail.version}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatDateTime(detail.updatedAt)}</Descriptions.Item>
            </Descriptions>
            <Tabs
              items={[
                {
                  key: "lines",
                  label: `付款与发票明细（${detail.lines.length}）`,
                  children: (
                    <Table<ReimbursementLine>
                      rowKey="id"
                      pagination={false}
                      scroll={{ x: 980 }}
                      columns={[
                        { title: "序号", dataIndex: "sequence", width: 70 },
                        { title: "日期", dataIndex: "expenseDate", width: 110, render: (value) => formatDate(value) },
                        { title: "类别", dataIndex: "category", width: 110 },
                        { title: "说明", dataIndex: "description", width: 240 },
                        { title: "收款人", dataIndex: "payeeName", width: 110, render: (value) => value ?? "—" },
                        { title: "付款金额", dataIndex: "paymentCents", width: 130, render: currency },
                        { title: "发票金额", dataIndex: "invoiceCents", width: 130, render: currency },
                        {
                          title: "材料",
                          width: 250,
                          render: (_, line) => (
                            <Space wrap>
                              <Tag color={line.attachments.some((item) => item.type === "PAYMENT_VOUCHER") ? "green" : "orange"}>
                                付款凭证 {line.attachments.filter((item) => item.type === "PAYMENT_VOUCHER").length}
                              </Tag>
                              <Tag color={line.attachments.some((item) => item.type === "INVOICE") ? "green" : "orange"}>
                                发票 {line.attachments.filter((item) => item.type === "INVOICE").length}
                              </Tag>
                              {["PENDING_SUBMISSION", "DEPARTMENT_PREPARING"].includes(detail.status) ? (
                                <>
                                  <Upload showUploadList={false} customRequest={uploadAttachment(line, "PAYMENT_VOUCHER")}>
                                    <Button size="small" icon={<UploadOutlined />}>付款凭证</Button>
                                  </Upload>
                                  <Upload showUploadList={false} customRequest={uploadAttachment(line, "INVOICE")}>
                                    <Button size="small" icon={<UploadOutlined />}>发票</Button>
                                  </Upload>
                                </>
                              ) : null}
                            </Space>
                          )
                        }
                      ]}
                      dataSource={detail.lines}
                    />
                  )
                },
                {
                  key: "issues",
                  label: `问题记录（${detail.issues.length}）`,
                  children: (
                    <Space orientation="vertical" style={{ width: "100%" }}>
                      <Button icon={<FileAddOutlined />} onClick={() => setIssueOpen(true)}>
                        记录问题
                      </Button>
                      <Table<ReimbursementIssue>
                        rowKey="id"
                        pagination={false}
                        columns={[
                          { title: "类型", dataIndex: "type", width: 140 },
                          { title: "问题说明", dataIndex: "description" },
                          { title: "提出人", width: 120, render: (_, issue) => issue.raisedBy?.displayName ?? "—" },
                          { title: "状态", dataIndex: "status", width: 110, render: (value) => <Tag color={value === "OPEN" ? "orange" : "green"}>{value === "OPEN" ? "待解决" : "已解决"}</Tag> },
                          { title: "处理结果", dataIndex: "resolution", render: (value) => value ?? "—" },
                          {
                            title: "操作",
                            width: 100,
                            render: (_, issue) => issue.status === "OPEN" ? (
                              <Button type="link" onClick={() => {
                                setSelectedIssue(issue);
                                setResolutionOpen(true);
                              }}>解决</Button>
                            ) : null
                          }
                        ]}
                        dataSource={detail.issues}
                      />
                    </Space>
                  )
                },
                {
                  key: "approval",
                  label: "审批与打款轨迹",
                  children: (
                    <Timeline
                      items={[
                        {
                          color: "blue",
                          children: `报销单创建 · ${formatDateTime(detail.createdAt)}`
                        },
                        ...detail.approvals.map((approval) => ({
                          color: "green",
                          children: `${statusLabel(approval.fromStatus)} → ${statusLabel(approval.toStatus)} · ${approval.actor?.displayName ?? "系统"} · ${formatDateTime(approval.createdAt)}${approval.comment ? ` · ${approval.comment}` : ""}`
                        })),
                        ...(detail.payment ? [{
                          color: "green",
                          dot: <CheckCircleOutlined />,
                          children: `已打款 ${currency(detail.payment.amountCents)} · 流水号 ${detail.payment.reference} · ${formatDateTime(detail.payment.paidAt)}`
                        }] : [])
                      ]}
                    />
                  )
                },
                {
                  key: "artifacts",
                  label: "最终生成物",
                  children: (
                    <Row gutter={[12, 12]}>
                      {artifactCards.map((card, index) => <Col xs={24} md={8} key={index}>{card}</Col>)}
                    </Row>
                  )
                }
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title="新建报销单"
        width={980}
        open={createOpen}
        confirmLoading={submitting}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText="创建并保存"
      >
        <Alert
          type="info"
          showIcon
          title="金额口径：每条发票金额必须严格大于付款金额，系统同时在接口和数据库层校验。"
          style={{ marginBottom: 16 }}
        />
        <Form<CreateValues> form={createForm} layout="vertical" onFinish={(values) => void createBatch(values)}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="title" label="报销标题" rules={[{ required: true }]}>
                <Input placeholder="例如：宜宾分公司七月差旅报销" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="branchId" label="分公司">
                <Select allowClear options={options?.branches.map((item) => ({ value: item.id, label: item.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="organizationUnitId" label="部门">
                <Select allowClear showSearch optionFilterProp="label" options={options?.organizationUnits.map((item) => ({ value: item.id, label: item.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" style={{ width: "100%" }}>
                {fields.map((field, index) => (
                  <Card key={field.key} size="small" title={`报销明细 ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>移除</Button> : null}>
                    <Row gutter={12}>
                      <Col span={5}><Form.Item name={[field.name, "expenseDate"]} label="费用日期" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
                      <Col span={5}><Form.Item name={[field.name, "category"]} label="费用类别" rules={[{ required: true }]}><Select options={["差旅费", "办公费", "项目材料费", "交通费", "业务招待费", "其他"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
                      <Col span={7}><Form.Item name={[field.name, "paymentAmount"]} label="付款金额（元）" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
                      <Col span={7}><Form.Item name={[field.name, "invoiceAmount"]} label="发票金额（元）" rules={[{ required: true }]}><InputNumber min={0.02} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
                      <Col span={14}><Form.Item name={[field.name, "description"]} label="费用说明" rules={[{ required: true }]}><Input /></Form.Item></Col>
                      <Col span={10}><Form.Item name={[field.name, "payeeName"]} label="收款人"><Input /></Form.Item></Col>
                    </Row>
                  </Card>
                ))}
                <Button block icon={<PlusOutlined />} onClick={() => add({ expenseDate: dayjs(), category: "差旅费", paymentAmount: 0, invoiceAmount: 0.01 })}>添加明细</Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal title="记录报销问题" open={issueOpen} confirmLoading={submitting} onCancel={() => setIssueOpen(false)} onOk={() => issueForm.submit()}>
        <Form<IssueValues> form={issueForm} layout="vertical" onFinish={(values) => void createIssue(values)}>
          <Form.Item name="lineId" label="关联明细">
            <Select allowClear options={detail?.lines.map((line) => ({ value: line.id, label: `${line.sequence}. ${line.description}` }))} />
          </Form.Item>
          <Form.Item name="type" label="问题类型" rules={[{ required: true }]}>
            <Select options={["附件缺失", "金额不一致", "抬头错误", "日期错误", "其他"].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="description" label="问题说明" rules={[{ required: true }]}>
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="解决报销问题" open={resolutionOpen} confirmLoading={submitting} onCancel={() => setResolutionOpen(false)} onOk={() => resolutionForm.submit()}>
        <Form form={resolutionForm} layout="vertical" onFinish={(values) => void resolveIssue(values as { resolution: string })}>
          <Typography.Paragraph>{selectedIssue?.description}</Typography.Paragraph>
          <Form.Item name="resolution" label="处理结果" rules={[{ required: true }]}>
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="登记打款" open={paymentOpen} confirmLoading={submitting} onCancel={() => setPaymentOpen(false)} onOk={() => paymentForm.submit()} okText="确认打款">
        <Progress percent={100} status="success" />
        <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="打款金额">{currency(detail?.totalPaymentCents ?? 0)}</Descriptions.Item>
          <Descriptions.Item label="收款明细">{detail?.lines.length ?? 0} 项</Descriptions.Item>
        </Descriptions>
        <Form<PaymentValues> form={paymentForm} layout="vertical" onFinish={(values) => void recordPayment(values)}>
          <Form.Item name="reference" label="银行流水号" rules={[{ required: true }]}>
            <Input placeholder="请输入银行付款流水号" />
          </Form.Item>
          <Form.Item name="paidAt" label="打款时间" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
