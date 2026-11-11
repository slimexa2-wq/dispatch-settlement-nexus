import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
import "./ReimbursementsPage.css";
import type {
  ListResult,
  OrganizationOptionSet,
  Reimbursement,
  ReimbursementArtifact,
  ReimbursementAttachment,
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
  proofAttachmentId: string;
};

function emptyCreateValues(): CreateValues {
  return { title: "", branchId: undefined, organizationUnitId: undefined, lines: [{
    expenseDate: dayjs(), category: "差旅费", description: "", paymentAmount: 0, invoiceAmount: 0
  }] };
}

function readCreateDraft(key: string): CreateValues {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "null") as CreateValues | null;
    if (stored && typeof stored.title === "string" && Array.isArray(stored.lines)) {
      return { ...stored, lines: stored.lines.map(line => ({ ...line,
        expenseDate: line.expenseDate ? dayjs(String(line.expenseDate)) : line.expenseDate
      })) };
    }
  } catch { /* An unavailable or invalid saved draft must not prevent opening the form. */ }
  return emptyCreateValues();
}

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
  const { user } = useAuth();
  return <ReimbursementsWorkspace key={user?.id ?? "anonymous"} />;
}

function ReimbursementsWorkspace() {
  const { message, modal } = App.useApp();
  const { can, user } = useAuth();
  const draftStorageKey = `xiangneng.reimbursement.draft.${user?.id ?? "anonymous"}`;
  const [initialDraft] = useState(() => readCreateDraft(draftStorageKey));
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
  const [proofUploading, setProofUploading] = useState(false);
  const [createForm] = Form.useForm<CreateValues>();
  const [issueForm] = Form.useForm<IssueValues>();
  const [resolutionForm] = Form.useForm<{ resolution: string }>();
  const [paymentForm] = Form.useForm<PaymentValues>();
  const paymentSession = useRef(0);

  useEffect(() => () => { paymentSession.current += 1; }, []);

  const closePayment = () => {
    paymentSession.current += 1;
    setProofUploading(false);
    setPaymentOpen(false);
  };

  const saveLocalDraft = () => {
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(createForm.getFieldsValue(true)));
      return true;
    } catch {
      return false;
    }
  };

  const closeCreateDraft = () => {
    if (submitting) return;
    if (!saveLocalDraft()) {
      message.error("当前浏览器无法暂存草稿，请保留窗口并创建保存，或明确放弃草稿");
      return;
    }
    setCreateOpen(false);
    message.info("草稿已暂存，重新打开可继续填写");
  };

  const clearCreateDraft = () => {
    let cleared = true;
    try {
      sessionStorage.removeItem(draftStorageKey);
    } catch {
      cleared = false;
    }
    createForm.resetFields();
    createForm.setFieldsValue(emptyCreateValues());
    return cleared;
  };

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
    closePayment();
    setDetail(row);
    setDetailOpen(true);
    await reloadDetail(row.id);
  };

  const createBatch = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      const created = await api.post<Reimbursement>("/reimbursements", {
        title: values.title,
        branchId: values.branchId,
        organizationUnitId: values.organizationUnitId,
        lines: values.lines.map(toLinePayload)
      });
      message.success("报销单已创建，金额校验和流程版本已写入");
      const draftCleared = clearCreateDraft();
      setCreateOpen(false);
      if (!draftCleared) message.warning("报销单已创建，但浏览器无法清除暂存副本，请勿重复创建同一单据");
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
    if (!detail || proofUploading) return;
    setSubmitting(true);
    try {
      await api.post(`/reimbursements/${detail.id}/payments`, {
        expectedVersion: detail.version,
        amountCents: detail.totalPaymentCents,
        reference: values.reference,
        paidAt: values.paidAt.toISOString(),
        proofAttachmentId: values.proofAttachmentId
      });
      message.success("打款信息已登记，报销单已完成闭环");
      paymentForm.resetFields();
      closePayment();
      await Promise.all([reloadDetail(), listResource.reload()]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const uploadFinalPaymentProof: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    if (!detail || !(file instanceof File)) return;
    const batchId = detail.id;
    const session = paymentSession.current;
    const isCurrent = () => session === paymentSession.current;
    const formData = new FormData();
    formData.append("file", file);
    setProofUploading(true);
    try {
      const attachment = await api.upload<ReimbursementAttachment>(
        `/reimbursements/${batchId}/attachments?type=PAYMENT_VOUCHER`, formData
      );
      if (!isCurrent()) return;
      const refreshed = await api.get<Reimbursement>(`/reimbursements/${batchId}`);
      if (!isCurrent()) return;
      setDetail(refreshed);
      paymentForm.setFieldsValue({ proofAttachmentId: attachment.id });
      await paymentForm.validateFields(["proofAttachmentId"]);
      if (!isCurrent()) return;
      onSuccess?.(attachment);
      message.success("整单最终付款凭证已上传");
    } catch (error) {
      if (!isCurrent()) return;
      message.error(getErrorMessage(error));
      onError?.(error instanceof Error ? error : new Error("上传失败"));
    } finally {
      if (isCurrent()) setProofUploading(false);
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
        onClose={() => { closePayment(); setDetailOpen(false); }}
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
                  paymentSession.current += 1;
                  setProofUploading(false);
                  paymentForm.resetFields();
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
                          children: <Space orientation="vertical">
                            <span>{`已打款 ${currency(detail.payment.amountCents)} · 流水号 ${detail.payment.reference} · ${formatDateTime(detail.payment.paidAt)}`}</span>
                            <span>整单最终付款凭证：{detail.attachments.find(item => item.id === detail.payment?.proofAttachmentId)?.originalName ?? "历史记录未关联凭证"}</span>
                            {detail.payment.proofAttachmentId ? <Button type="link" onClick={async () => {
                              try {
                                const file = await api.download(`/reimbursements/${detail.id}/attachments/${detail.payment?.proofAttachmentId}`);
                                saveBlob(file.blob, file.fileName);
                              } catch (error) { message.error(getErrorMessage(error)); }
                            }}>下载最终付款凭证</Button> : null}
                          </Space>
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
        className="reimbursement-create-modal"
        width={980}
        open={createOpen}
        confirmLoading={submitting}
        onCancel={closeCreateDraft}
        wrapProps={{ onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          // Some portal versions leave closed child popups on their Escape stack
          // in StrictMode. Handle the dialog's own bubbling event after controls.
          if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || submitting ||
            !event.currentTarget.contains(event.target as Node)) return;
          const target = event.target as HTMLElement;
          if (target.closest('[aria-expanded="true"]') ||
            target.closest(".ant-select, .ant-picker")?.querySelector('[aria-expanded="true"]')) return;
          event.stopPropagation();
          closeCreateDraft();
        } }}
        onOk={() => createForm.submit()}
        okText="创建并保存"
        footer={[
          <Button key="discard" danger disabled={submitting} onClick={() => modal.confirm({
            title: "放弃这份报销草稿？", content: "标题、归属和全部明细都会清空。",
            okText: "放弃草稿", cancelText: "继续填写", okButtonProps: { danger: true },
            onOk: () => {
              const draftCleared = clearCreateDraft();
              setCreateOpen(false);
              if (!draftCleared) message.warning("当前窗口已清空，但浏览器无法清除暂存副本");
            }
          })}>放弃草稿</Button>,
          <Button key="save" disabled={submitting} onClick={closeCreateDraft}>暂存并关闭</Button>,
          <Button key="create" type="primary" loading={submitting} onClick={() => createForm.submit()}>创建并保存</Button>
        ]}
      >
        <Alert
          type="info"
          showIcon
          title="每条发票金额不得低于付款金额，请按真实票额填写。关闭时会在当前浏览器标签页暂存全部输入，可继续填写或明确放弃。"
          style={{ marginBottom: 16 }}
        />
        <Form<CreateValues> form={createForm} initialValues={initialDraft} layout="vertical"
          onValuesChange={() => { saveLocalDraft(); }} onFinish={(values) => void createBatch(values)}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="title" label="报销标题" rules={[{ required: true }]}>
                <Input placeholder="例如：宜宾分公司七月差旅报销" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="branchId" label="分公司">
                <Select allowClear options={options?.branches.map((item) => ({ value: item.id, label: item.name }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
                      <Col xs={24} sm={12} lg={5}><Form.Item name={[field.name, "expenseDate"]} label="费用日期" rules={[{ required: true }]}><DatePicker format="YYYY-MM-DD" style={{ width: "100%" }} /></Form.Item></Col>
                      <Col xs={24} sm={12} lg={5}><Form.Item name={[field.name, "category"]} label="费用类别" rules={[{ required: true }]}><Select options={["差旅费", "办公费", "项目材料费", "交通费", "业务招待费", "其他"].map((value) => ({ value, label: value }))} /></Form.Item></Col>
                      <Col xs={24} sm={12} lg={7}><Form.Item name={[field.name, "paymentAmount"]} label="付款金额（元）" rules={[{ required: true }, { type: "number", min: 0.01, message: "付款金额必须大于0" }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
                      <Col xs={24} sm={12} lg={7}><Form.Item name={[field.name, "invoiceAmount"]} label="发票金额（元）" dependencies={[["lines", field.name, "paymentAmount"]]} rules={[{ required: true }, ({ getFieldValue }) => ({
                        validator(_, value: number | null) {
                          const payment = getFieldValue(["lines", field.name, "paymentAmount"]) as number;
                          return value == null || Math.round(value * 100) >= Math.round(payment * 100)
                            ? Promise.resolve() : Promise.reject(new Error(`明细 ${index + 1}：发票金额不能低于付款金额`));
                        }
                      })]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item></Col>
                      <Col xs={24} sm={14}><Form.Item name={[field.name, "description"]} label="费用说明" rules={[{ required: true }]}><Input /></Form.Item></Col>
                      <Col xs={24} sm={10}><Form.Item name={[field.name, "payeeName"]} label="收款人"><Input /></Form.Item></Col>
                    </Row>
                  </Card>
                ))}
                <Button block icon={<PlusOutlined />} onClick={() => add({ expenseDate: dayjs(), category: "差旅费", paymentAmount: 0, invoiceAmount: 0 })}>添加明细</Button>
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

      <Modal title="登记打款" open={paymentOpen} confirmLoading={submitting} okButtonProps={{ disabled: proofUploading }} onCancel={closePayment} onOk={() => paymentForm.submit()} okText="确认登记打款">
        <Alert type="info" showIcon title="待登记：核对实际打款信息并上传整单最终付款凭证后，才能确认完成。" style={{ marginBottom: 16 }} />
        <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="打款金额">{currency(detail?.totalPaymentCents ?? 0)}</Descriptions.Item>
          <Descriptions.Item label="收款明细">{detail?.lines.length ?? 0} 项</Descriptions.Item>
          <Descriptions.Item label="收款对象">{detail?.lines.map(line => `${line.payeeName || detail.applicant.displayName} · ${currency(line.paymentCents)}${line.payeeBank ? ` · ${line.payeeBank}` : ""}${line.payeeAccount ? ` · 尾号${line.payeeAccount.slice(-4)}` : ""}`).join("；")}</Descriptions.Item>
        </Descriptions>
        <Form<PaymentValues> form={paymentForm} layout="vertical" onFinish={(values) => void recordPayment(values)}>
          <Form.Item name="proofAttachmentId" label="整单最终付款凭证" rules={[{ required: true, message: "请上传并选择整单最终付款凭证" }]} extra="仅接受出纳实际打款后的整单凭证，原始明细付款截图不能替代。">
            <Select placeholder="上传后选择最终付款凭证" options={detail?.attachments.filter(item => item.type === "PAYMENT_VOUCHER" && !item.lineId).map(item => ({ value: item.id, label: item.originalName }))} />
          </Form.Item>
          <Upload accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" showUploadList={false} customRequest={uploadFinalPaymentProof}>
            <Button icon={<UploadOutlined />} loading={proofUploading}>上传整单最终付款凭证</Button>
          </Upload>
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
