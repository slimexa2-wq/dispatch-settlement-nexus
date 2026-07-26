import { useMemo, useState } from "react";
import type { Key } from "react";
import {
  DownloadOutlined,
  EditOutlined,
  FileAddOutlined,
  PlusOutlined,
  SaveOutlined,
  ScheduleOutlined,
  SettingOutlined
} from "@ant-design/icons";
import * as XLSX from "xlsx";
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { TableColumnsType, TablePaginationConfig, UploadProps } from "antd";
import {
  ApplicationSource,
  EmploymentStatus,
  InsuranceType,
  InterviewStatus,
  Permission,
  labels
} from "@xiangneng/shared";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { ReferenceSelect } from "../components/ReferenceSelect";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getAllPages, getErrorMessage, saveBlob } from "../lib/api";
import { adaptPerson, mapList } from "../lib/adapters";
import {
  peopleFiltersFromSearchParams,
  peopleListEndpoint,
  registrationResultMessage,
  type PeopleUrlFilters,
  type RegistrationResult
} from "../lib/people";
import {
  branchName,
  displayText,
  ellipsis,
  formatDate,
  formatDateTime,
  listResult,
  projectName,
  toDateValue
} from "../lib/format";
import type { ListResult, Person, PersonFile, Policy, Project, Supplier } from "../types/domain";

const employmentOptions = [
  { value: EmploymentStatus.APPLICANT, label: "已报名" },
  { value: EmploymentStatus.INTERVIEWING, label: "面试中" },
  { value: EmploymentStatus.PENDING_ONBOARD, label: "待入职" },
  { value: EmploymentStatus.ACTIVE, label: "在职" },
  { value: EmploymentStatus.LEFT, label: "离职" }
];

const unifiedStatusOptions = [
  { value: "APPLICANT", label: "已报名" },
  { value: "ARRIVED", label: "已到达" },
  { value: "PASSED", label: "面试通过" },
  { value: "FAILED", label: "面试未通过" },
  { value: "ONBOARDED", label: "已入职" },
  { value: "NOT_ONBOARDED", label: "未入职" },
  { value: "LEFT", label: "已离职" },
  { value: "REGULARIZED", label: "已转正" }
];

const interviewOptions = [
  { value: InterviewStatus.PENDING_ARRIVAL, label: "待到场" },
  { value: InterviewStatus.ARRIVED, label: "已到场" },
  { value: InterviewStatus.PASSED, label: "面试通过" },
  { value: InterviewStatus.FAILED, label: "面试未通过" },
  { value: InterviewStatus.ABANDONED, label: "放弃" }
];

const insuranceOptions = [
  { value: InsuranceType.COMMERCIAL, label: "商保" },
  { value: InsuranceType.SOCIAL, label: "社保" },
  { value: InsuranceType.RISK_FUND, label: "风险金" }
];

type RegistrationValues = {
  name: string;
  idCard: string;
  phone: string;
  projectId: string;
  jobDemandId?: string;
  jobTitle: string;
  interviewDate?: Dayjs;
  supplierId?: string;
  recommenderUserId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  notes?: string;
};

type DetailEditValues = RegistrationValues & {
  employmentStatus?: EmploymentStatus;
  interviewStatus?: InterviewStatus;
  onboardDate?: Dayjs;
  offboardDate?: Dayjs;
  offboardReason?: string;
  insuranceTypes?: InsuranceType[];
  employeeNo?: string;
  supplierPolicyId?: string;
};

type BatchInterviewValues = {
  status: InterviewStatus;
  notes?: string;
};

function extractReference<T>(value: T[] | ListResult<T> | undefined): T[] {
  return value ? listResult(value, 1, 200).items : [];
}

function tagInsurance(values?: InsuranceType[] | null) {
  if (!values?.length) return "—";
  return values.map((value) => {
    const option = insuranceOptions.find((item) => item.value === value);
    return <Tag key={value} color={value === InsuranceType.COMMERCIAL ? "blue" : value === InsuranceType.SOCIAL ? "geekblue" : "green"}>{option?.label ?? value}</Tag>;
  });
}

function supplierLabel(row: Person): string {
  return row.supplier?.name || row.supplierName || "—";
}

function isSelfRecruit(row: Person): boolean {
  const name = supplierLabel(row);
  return name.includes("祥能自招") || name.includes("自招");
}

function recommenderLabel(row: Person): string {
  if (!isSelfRecruit(row)) return "—";
  return row.recommender?.displayName || row.recommender?.name || row.recommenderName || row.supplier?.name || row.supplierName || "祥能自招";
}

function unifiedStatus(row: Person): string {
  if (row.offboardDate || row.employmentStatus === EmploymentStatus.LEFT) return "LEFT";
  if (row.employmentStatus === EmploymentStatus.ACTIVE && String(row.notes ?? "").includes("转正")) return "REGULARIZED";
  if (row.onboardDate || row.employmentStatus === EmploymentStatus.ACTIVE) return "ONBOARDED";
  if (row.interviewStatus === InterviewStatus.FAILED) return "FAILED";
  if (row.interviewStatus === InterviewStatus.ABANDONED) return "NOT_ONBOARDED";
  if (row.interviewStatus === InterviewStatus.PASSED || row.employmentStatus === EmploymentStatus.PENDING_ONBOARD) return "PASSED";
  if (row.interviewStatus === InterviewStatus.ARRIVED || row.employmentStatus === EmploymentStatus.INTERVIEWING) return "ARRIVED";
  return "APPLICANT";
}

function unifiedStatusLabel(row: Person): string {
  const code = unifiedStatus(row);
  return unifiedStatusOptions.find((item) => item.value === code)?.label ?? code;
}

type PeopleColumnKey =
  | "interviewDate"
  | "name"
  | "phone"
  | "idCard"
  | "employeeNo"
  | "project"
  | "branch"
  | "jobTitle"
  | "employmentStatus"
  | "onboardDate"
  | "supplier"
  | "recommender"
  | "insuranceTypes"
  | "notes";

type PeopleColumnDefinition = {
  key: PeopleColumnKey;
  title: string;
  width: number;
  column: TableColumnsType<Person>[number];
  exportValue: (row: Person) => string;
};

const defaultPeopleColumns: PeopleColumnKey[] = [
  "interviewDate",
  "name",
  "phone",
  "project",
  "jobTitle",
  "employmentStatus",
  "onboardDate",
  "supplier",
  "recommender",
  "insuranceTypes",
  "notes"
];

function insuranceExport(values?: InsuranceType[] | null): string {
  return values?.length ? values.map((value) => labels.insurance[value] ?? value).join("、") : "";
}

function dateExport(value?: string | null): string {
  return value ? formatDate(value) : "";
}

function plainText(value: unknown): string {
  return String(value ?? "").trim();
}

const lifecycleTypeLabels: Record<NonNullable<Person["lifecycle"]>[number]["type"], string> = {
  REGISTRATION: "报名登记",
  INTERVIEW: "面试处理",
  ONBOARD: "办理入职",
  INSURANCE: "保险情况更新",
  OFFBOARD: "办理离职"
};

function PeopleContent() {
  const { message, modal } = App.useApp();
  const { can } = useAuth();
  const canWrite = can(Permission.PEOPLE_WRITE);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<PeopleUrlFilters>(() => peopleFiltersFromSearchParams(searchParams));
  const [draftFilters, setDraftFilters] = useState<PeopleUrlFilters>(filters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationForm] = Form.useForm<RegistrationValues>();
  const [submitting, setSubmitting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [detail, setDetail] = useState<Person>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailForm] = Form.useForm<DetailEditValues>();
  const [batchTargets, setBatchTargets] = useState<Person[]>([]);
  const [batchForm] = Form.useForm<BatchInterviewValues>();
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<PeopleColumnKey[]>(defaultPeopleColumns);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<PeopleColumnKey[]>(defaultPeopleColumns);

  const projectsResource = useApiResource(() => getAllPages<Project>("/projects"), []);
  const suppliersResource = useApiResource(() => getAllPages<Supplier>("/suppliers"), []);
  const policiesResource = useApiResource(() => getAllPages<Policy>("/policies", { type: "SUPPLIER" }), []);
  const peopleResource = useApiResource(
    async () => {
      const path = peopleListEndpoint(filters.metric);
      return mapList(await api.get<ListResult<Person> | Person[]>(path, { page, pageSize, ...filters }), adaptPerson, page, pageSize);
    },
    [page, pageSize, JSON.stringify(filters)]
  );

  const list = peopleResource.data ? listResult(peopleResource.data, page, pageSize) : undefined;
  const projects = extractReference(projectsResource.data);
  const suppliers = extractReference(suppliersResource.data);
  const policies = extractReference(policiesResource.data);
  const projectOptions = projects.map((item) => ({ value: item.id, label: item.name, searchText: `${item.name} ${branchName(item)}` }));
  const supplierOptions = suppliers.map((item) => ({ value: item.id, label: item.name }));
  const policyOptions = policies.map((item) => ({ value: item.id, label: item.name }));
  const branchOptions = useMemo(() => {
    const values = new Map<string, string>();
    projects.forEach((item) => {
      if (item.branchId) values.set(item.branchId, branchName(item));
    });
    return [...values.entries()].map(([value, label]) => ({ value, label }));
  }, [projects]);

  const applyFilters = () => {
    setPage(1);
    setFilters({ ...draftFilters, metric: undefined });
    setDraftFilters((current) => ({ ...current, metric: undefined }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setPage(1);
  };

  const fillDetailForm = (person: Person) => {
    detailForm.setFieldsValue({
      name: person.name,
      idCard: person.idCard,
      phone: person.phone,
      projectId: person.projectId,
      jobDemandId: person.jobDemandId ?? undefined,
      jobTitle: person.jobTitle,
      interviewDate: person.interviewDate ? dayjs(person.interviewDate) : undefined,
      interviewStatus: person.interviewStatus ?? undefined,
      employmentStatus: person.employmentStatus ?? person.status,
      onboardDate: person.onboardDate ? dayjs(person.onboardDate) : undefined,
      offboardDate: person.offboardDate ? dayjs(person.offboardDate) : undefined,
      offboardReason: person.offboardReason ?? undefined,
      insuranceTypes: person.insuranceTypes ?? [],
      supplierId: person.supplierId ?? undefined,
      supplierPolicyId: person.supplierPolicyId ?? undefined,
      recommenderUserId: person.recommenderUserId ?? person.recommenderName ?? undefined,
      emergencyContactName: person.emergencyContactName ?? undefined,
      emergencyContactPhone: person.emergencyContactPhone ?? undefined,
      emergencyContactRelation: person.emergencyContactRelation ?? undefined,
      employeeNo: person.employeeNo ?? undefined,
      notes: person.notes ?? undefined
    });
  };

  const openPerson = async (person: Person) => {
    setDetail(person);
    fillDetailForm(person);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const next = adaptPerson(await api.get<Person>(`/people/${person.id}`));
      setDetail(next);
      fillDetailForm(next);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const registerPerson = async (values: RegistrationValues) => {
    setSubmitting(true);
    try {
      const result = await api.post<RegistrationResult>("/people", {
        ...values,
        idCard: values.idCard.trim().toUpperCase(),
        interviewDate: toDateValue(values.interviewDate),
        source: ApplicationSource.OPERATOR
      });
      message.success(registrationResultMessage(result));
      registrationForm.resetFields();
      setRegistrationOpen(false);
      await peopleResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitDetailEdit = async (values: DetailEditValues) => {
    if (!detail) return;
    setSubmitting(true);
    try {
      const project = projects.find((item) => item.id === values.projectId);
      const supplier = suppliers.find((item) => item.id === values.supplierId);
      const updated = adaptPerson(await api.patch<Person>(`/people/${detail.id}`, {
        ...values,
        idCard: values.idCard.trim().toUpperCase(),
        interviewDate: toDateValue(values.interviewDate),
        onboardDate: toDateValue(values.onboardDate),
        offboardDate: toDateValue(values.offboardDate),
        status: values.employmentStatus,
        branchId: project?.branchId,
        branchName: project ? branchName(project) : undefined,
        projectName: project?.name,
        supplierName: supplier?.name
      }));
      setDetail(updated);
      fillDetailForm(updated);
      message.success("人员详情已保存");
      await peopleResource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const openBatchInterview = (targets: Person[]) => {
    if (!targets.length) return;
    setBatchTargets(targets);
    batchForm.setFieldsValue({ status: targets[0]?.interviewStatus ?? InterviewStatus.ARRIVED });
  };

  const submitBatchInterview = async (values: BatchInterviewValues) => {
    setSubmitting(true);
    const results = await Promise.allSettled(
      batchTargets.map((person) => api.patch<Person>(`/people/${person.id}/interview`, values))
    );
    const successCount = results.filter((item) => item.status === "fulfilled").length;
    const failures = results.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (failures.length) {
      modal.warning({
        title: "部分操作未完成",
        content: `成功 ${successCount} 人，失败 ${failures.length} 人。首个错误：${getErrorMessage(failures[0]?.reason)}`
      });
    } else {
      message.success(`已更新 ${successCount} 人的面试状态`);
    }
    setSubmitting(false);
    setBatchTargets([]);
    setSelectedRowKeys([]);
    await peopleResource.reload();
  };

  const uploadFile: NonNullable<UploadProps["customRequest"]> = async (options) => {
    if (!detail) return;
    const data = new FormData();
    data.append("file", options.file as File);
    try {
      await api.upload(`/people/${detail.id}/files`, data);
      options.onSuccess?.({}, new XMLHttpRequest());
      message.success("附件上传成功");
      const next = adaptPerson(await api.get<Person>(`/people/${detail.id}`));
      setDetail(next);
      fillDetailForm(next);
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error("上传失败"));
      message.error(getErrorMessage(error));
    }
  };

  const downloadPersonFile = async (file: PersonFile) => {
    if (!detail) return;
    try {
      const result = await api.download(`/people/${detail.id}/files/${file.id}`);
      saveBlob(result.blob, result.fileName || file.fileName);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const columnDefinitions: Record<PeopleColumnKey, PeopleColumnDefinition> = {
    interviewDate: {
      key: "interviewDate",
      title: "面试日期",
      width: 120,
      column: { title: "面试日期", dataIndex: "interviewDate", fixed: "left", width: 120, defaultSortOrder: "descend", render: (value: string | null) => formatDate(value) },
      exportValue: (row) => dateExport(row.interviewDate)
    },
    name: {
      key: "name",
      title: "姓名",
      width: 110,
      column: { title: "姓名", dataIndex: "name", fixed: "left", width: 110, render: (_, row) => <Button type="link" size="small" onClick={() => void openPerson(row)}>{row.name}</Button> },
      exportValue: (row) => row.name
    },
    phone: { key: "phone", title: "手机号", width: 130, column: { title: "手机号", dataIndex: "phone", width: 130 }, exportValue: (row) => plainText(row.phone) },
    idCard: { key: "idCard", title: "身份证号", width: 190, column: { title: "身份证号", dataIndex: "idCard", width: 190, render: (value: string) => displayText(value) }, exportValue: (row) => plainText(row.idCard) },
    employeeNo: { key: "employeeNo", title: "员工编号", width: 130, column: { title: "员工编号", dataIndex: "employeeNo", width: 130, render: (value: string) => displayText(value) }, exportValue: (row) => plainText(row.employeeNo) },
    project: { key: "project", title: "项目", width: 210, column: { title: "项目", width: 210, render: (_, row) => projectName(row) }, exportValue: (row) => projectName(row) },
    branch: { key: "branch", title: "分子公司", width: 180, column: { title: "分子公司", width: 180, render: (_, row) => branchName(row) }, exportValue: (row) => branchName(row) },
    jobTitle: { key: "jobTitle", title: "岗位", width: 160, column: { title: "岗位", dataIndex: "jobTitle", width: 160, render: (value: string) => displayText(value) }, exportValue: (row) => plainText(row.jobTitle) },
    employmentStatus: { key: "employmentStatus", title: "状态", width: 110, column: { title: "状态", width: 110, render: (_, row) => <StatusTag status={unifiedStatus(row)} /> }, exportValue: (row) => unifiedStatusLabel(row) },
    onboardDate: { key: "onboardDate", title: "入职日期", width: 120, column: { title: "入职日期", dataIndex: "onboardDate", width: 120, render: (value: string | null) => value ? formatDate(value) : "" }, exportValue: (row) => dateExport(row.onboardDate) },
    supplier: { key: "supplier", title: "供应商", width: 180, column: { title: "供应商", width: 180, render: (_, row) => supplierLabel(row) }, exportValue: (row) => supplierLabel(row) === "—" ? "" : supplierLabel(row) },
    recommender: { key: "recommender", title: "推荐人", width: 120, column: { title: "推荐人", width: 120, render: (_, row) => recommenderLabel(row) }, exportValue: (row) => recommenderLabel(row) === "—" ? "" : recommenderLabel(row) },
    insuranceTypes: { key: "insuranceTypes", title: "保险情况", width: 170, column: { title: "保险情况", dataIndex: "insuranceTypes", width: 170, render: (values: InsuranceType[] = []) => tagInsurance(values) }, exportValue: (row) => insuranceExport(row.insuranceTypes) },
    notes: { key: "notes", title: "备注", width: 190, column: { title: "备注", dataIndex: "notes", width: 190, render: (value: string | null) => <Tooltip title={value}><span>{ellipsis(value, 18)}</span></Tooltip> }, exportValue: (row) => plainText(row.notes) }
  };

  const orderedVisibleColumns = columnOrder.filter((key) => visibleColumnKeys.includes(key)).map((key) => columnDefinitions[key]);
  const columns: TableColumnsType<Person> = [
    ...orderedVisibleColumns.map((item) => item.column),
    {
      title: "操作",
      fixed: "right",
      width: 90,
      render: (_, row) => <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openPerson(row)}>编辑</Button>
    }
  ];

  const moveColumn = (key: PeopleColumnKey, direction: -1 | 1) => {
    setColumnOrder((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  };

  const restoreDefaultColumns = () => {
    setColumnOrder(defaultPeopleColumns);
    setVisibleColumnKeys(defaultPeopleColumns);
  };

  const exportPeople = async () => {
    const exportColumns = orderedVisibleColumns;
    if (!exportColumns.length) {
      message.warning("请至少保留一个显示字段后再导出");
      return;
    }
    try {
      const path = peopleListEndpoint(filters.metric);
      const rows = (await getAllPages<Person>(path, { ...filters })).items.map(adaptPerson);
      modal.confirm({
        title: "确认导出人员数据",
        content: (
          <Space orientation="vertical">
            <Typography.Text>将导出当前筛选条件下的全部数据：{rows.length} 条。</Typography.Text>
            <Typography.Text>导出字段：{exportColumns.map((item) => item.title).join("、")}</Typography.Text>
          </Space>
        ),
        okText: "确认下载",
        cancelText: "取消",
        onOk: () => {
          const dataRows = [
            exportColumns.map((item) => item.title),
            ...rows.map((row) => exportColumns.map((item) => item.exportValue(row)))
          ];
          const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
          const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:A1");
          worksheet["!cols"] = exportColumns.map((item) => ({ wch: Math.max(12, Math.min(32, item.width / 8)) }));
          worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
          (worksheet as XLSX.WorkSheet & { "!views"?: unknown[] })["!views"] = [{ state: "frozen", ySplit: 1 }];
          for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
            exportColumns.forEach((column, columnIndex) => {
              if (["phone", "idCard", "employeeNo"].includes(column.key)) {
                const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
                const cell = worksheet[address];
                if (cell) {
                  cell.t = "s";
                  cell.z = "@";
                }
              }
            });
          }
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "人员花名册");
          const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
          saveBlob(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `人员花名册-${dayjs().format("YYYYMMDD-HHmmss")}.xlsx`);
          message.success("花名册导出已开始下载");
        }
      });
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const tablePagination: TablePaginationConfig = {
    current: list?.pagination.page ?? page,
    pageSize: list?.pagination.pageSize ?? pageSize,
    total: list?.pagination.total ?? 0,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 人`
  };

  return (
    <>
      <PageHeader
        title="人员管理"
        description="一个入口完成查看和修改；人员主档、面试、入职、离职、保险、联系人、附件、备注都在详情内维护。"
        extra={
          <>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsOpen(true)}>列设置</Button>
            {can(Permission.PEOPLE_EXPORT) && !filters.metric ? <Button icon={<DownloadOutlined />} onClick={() => void exportPeople()}>导出</Button> : null}
            {canWrite ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegistrationOpen(true)}>人员报名</Button> : null}
          </>
        }
      />
      <ContentCard>
        {filters.metric ? <Tag color="blue" className="drilldown-tag">当前为指标下钻结果；执行任一筛选后将切换到花名册查询</Tag> : null}
        <div className="filter-grid people-filter-grid">
          <Input allowClear placeholder="姓名 / 身份证号 / 手机号" value={draftFilters.keyword} onChange={(event) => setDraftFilters((old) => ({ ...old, keyword: event.target.value }))} onPressEnter={applyFilters} />
          <ReferenceSelect placeholder="分子公司" options={branchOptions} value={draftFilters.branchId} onChange={(value) => setDraftFilters((old) => ({ ...old, branchId: value as string | undefined }))} />
          <ReferenceSelect placeholder="项目" options={projectOptions} value={draftFilters.projectId} onChange={(value) => setDraftFilters((old) => ({ ...old, projectId: value as string | undefined }))} loading={projectsResource.loading} />
          <ReferenceSelect placeholder="供应商" options={supplierOptions} value={draftFilters.supplierId} onChange={(value) => setDraftFilters((old) => ({ ...old, supplierId: value as string | undefined }))} loading={suppliersResource.loading} />
          <Input allowClear placeholder="推荐人姓名/账号" value={draftFilters.recommenderUserId} onChange={(event) => setDraftFilters((old) => ({ ...old, recommenderUserId: event.target.value }))} />
          <Select allowClear placeholder="状态" value={draftFilters.status} options={unifiedStatusOptions} onChange={(value) => setDraftFilters((old) => ({ ...old, status: value, interviewStatus: undefined }))} />
          <Select allowClear placeholder="保险情况" value={draftFilters.insurance} options={insuranceOptions} onChange={(value) => setDraftFilters((old) => ({ ...old, insurance: value }))} />
          <DatePicker.RangePicker
            value={draftFilters.from && draftFilters.to ? [dayjs(draftFilters.from), dayjs(draftFilters.to)] : undefined}
            onChange={(values) => setDraftFilters((old) => ({ ...old, from: values?.[0]?.format("YYYY-MM-DD"), to: values?.[1]?.format("YYYY-MM-DD") }))}
          />
          <Space><Button type="primary" onClick={applyFilters}>查询</Button><Button onClick={resetFilters}>重置</Button></Space>
        </div>

        {selectedRowKeys.length && canWrite ? (
          <div className="batch-bar">
            <span>已选择 {selectedRowKeys.length} 人</span>
            <Button size="small" icon={<ScheduleOutlined />} onClick={() => openBatchInterview((list?.items ?? []).filter((item) => selectedRowKeys.includes(item.id)))}>批量更新面试</Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </div>
        ) : null}

        {peopleResource.error && !list ? <ErrorBlock error={peopleResource.error} onRetry={() => void peopleResource.reload()} /> : (
          <Table<Person>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={peopleResource.loading}
            scroll={{ x: 1700 }}
            pagination={tablePagination}
            rowSelection={canWrite ? { selectedRowKeys, onChange: setSelectedRowKeys, preserveSelectedRowKeys: true } : undefined}
            onChange={(pagination) => {
              setPage(pagination.current ?? 1);
              setPageSize(pagination.pageSize ?? 20);
            }}
            locale={{ emptyText: "没有符合条件的人员" }}
          />
        )}
      </ContentCard>

      <Modal
        title="列设置"
        open={columnSettingsOpen}
        onCancel={() => setColumnSettingsOpen(false)}
        onOk={() => setColumnSettingsOpen(false)}
        footer={[
          <Button key="default" onClick={restoreDefaultColumns}>恢复默认</Button>,
          <Button key="ok" type="primary" onClick={() => setColumnSettingsOpen(false)}>完成</Button>
        ]}
      >
        <Space orientation="vertical" className="full-width" size={8}>
          {columnOrder.map((key, index) => {
            const item = columnDefinitions[key];
            return (
              <div className="column-setting-row" key={key}>
                <Checkbox
                  checked={visibleColumnKeys.includes(key)}
                  onChange={(event) => {
                    setVisibleColumnKeys((current) => event.target.checked
                      ? [...current, key]
                      : current.length > 1 ? current.filter((itemKey) => itemKey !== key) : current);
                  }}
                >
                  {item.title}
                </Checkbox>
                <Space size={4}>
                  <Button size="small" disabled={index === 0} onClick={() => moveColumn(key, -1)}>上移</Button>
                  <Button size="small" disabled={index === columnOrder.length - 1} onClick={() => moveColumn(key, 1)}>下移</Button>
                </Space>
              </div>
            );
          })}
        </Space>
      </Modal>

      <Modal
        title="人员报名"
        open={registrationOpen}
        width={760}
        confirmLoading={submitting}
        onCancel={() => setRegistrationOpen(false)}
        onOk={() => registrationForm.submit()}
        destroyOnHidden
      >
        <Form<RegistrationValues> form={registrationForm} layout="vertical" onFinish={(values) => void registerPerson(values)}>
          <div className="form-grid two-columns">
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input maxLength={64} /></Form.Item>
            <Form.Item name="idCard" label="身份证号" rules={[{ required: true, message: "请输入身份证号" }, { pattern: /^\d{15}$|^\d{17}[\dXx]$/, message: "身份证号格式不正确" }]}><Input maxLength={18} /></Form.Item>
            <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "手机号格式不正确" }]}><Input maxLength={11} /></Form.Item>
            <Form.Item name="projectId" label="项目" rules={[{ required: true, message: "请选择项目" }]}><ReferenceSelect options={projectOptions} loading={projectsResource.loading} /></Form.Item>
            <Form.Item name="jobTitle" label="岗位" rules={[{ required: true, message: "请输入岗位" }]}><Input maxLength={120} /></Form.Item>
            <Form.Item name="interviewDate" label="面试日期"><DatePicker className="full-width" /></Form.Item>
            <Form.Item name="supplierId" label="供应商"><ReferenceSelect options={supplierOptions} loading={suppliersResource.loading} /></Form.Item>
            <Form.Item name="recommenderUserId" label="推荐人"><Input placeholder="可填写推荐人姓名或账号 ID" /></Form.Item>
            <Form.Item name="emergencyContactName" label="紧急联系人"><Input maxLength={64} /></Form.Item>
            <Form.Item name="emergencyContactPhone" label="紧急联系人电话"><Input maxLength={32} /></Form.Item>
            <Form.Item name="emergencyContactRelation" label="与本人关系"><Input maxLength={32} /></Form.Item>
          </div>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批量更新面试状态${batchTargets.length ? `（${batchTargets.length} 人）` : ""}`}
        open={Boolean(batchTargets.length)}
        confirmLoading={submitting}
        onCancel={() => setBatchTargets([])}
        onOk={() => batchForm.submit()}
        destroyOnHidden
      >
        <Form<BatchInterviewValues> form={batchForm} layout="vertical" onFinish={(values) => void submitBatchInterview(values)}>
          <Form.Item name="status" label="面试状态" rules={[{ required: true, message: "请选择面试状态" }]}>
            <Radio.Group options={interviewOptions} />
          </Form.Item>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? (
          <div className="person-drawer-title">
            <Space align="center" wrap>
              <Typography.Title level={4}>{detail.name}</Typography.Title>
              <StatusTag status={unifiedStatus(detail)} />
            </Space>
            <Typography.Text type="secondary">{projectName(detail)} · {detail.phone || "无手机号"} · {detail.idCard || "无身份证"}</Typography.Text>
          </div>
        ) : "人员详情与编辑"}
        width={820}
        open={detailOpen}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        extra={detail && canWrite ? <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={() => detailForm.submit()}>保存</Button> : null}
        className="person-detail-drawer"
      >
        {detail ? (
          <Form<DetailEditValues> form={detailForm} layout="vertical" onFinish={(values) => void submitDetailEdit(values)} disabled={!canWrite}>
            <Tabs
              items={[
                {
                  key: "base",
                  label: "人员详情",
                  children: (
                    <Space orientation="vertical" size={14} className="full-width">
                      <Card size="small" title="基本信息">
                        <div className="form-grid two-columns">
                          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input maxLength={64} /></Form.Item>
                          <Form.Item name="idCard" label="身份证号" rules={[{ required: true, message: "请输入身份证号" }, { pattern: /^\d{15}$|^\d{17}[\dXx]$/, message: "身份证号格式不正确" }]}><Input maxLength={18} /></Form.Item>
                          <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "手机号格式不正确" }]}><Input maxLength={11} /></Form.Item>
                          <Form.Item name="employeeNo" label="工号"><Input maxLength={64} /></Form.Item>
                        </div>
                      </Card>

                      <Card size="small" title="应聘与项目信息">
                        <div className="form-grid two-columns">
                          <Form.Item name="projectId" label="项目" rules={[{ required: true, message: "请选择项目" }]}><ReferenceSelect options={projectOptions} loading={projectsResource.loading} /></Form.Item>
                          <Form.Item name="jobTitle" label="岗位" rules={[{ required: true, message: "请输入岗位" }]}><Input maxLength={120} /></Form.Item>
                          <Form.Item name="supplierId" label="供应商"><ReferenceSelect options={supplierOptions} loading={suppliersResource.loading} /></Form.Item>
                          <Form.Item name="recommenderUserId" label="推荐人"><Input maxLength={120} /></Form.Item>
                          <Form.Item name="interviewStatus" label="面试状态"><Select options={interviewOptions} /></Form.Item>
                          <Form.Item name="interviewDate" label="面试日期"><DatePicker className="full-width" /></Form.Item>
                          <Form.Item name="employmentStatus" label="人员状态"><Select options={employmentOptions} /></Form.Item>
                          <Form.Item name="onboardDate" label="入职日期"><DatePicker className="full-width" /></Form.Item>
                          <Form.Item name="offboardDate" label="离职日期"><DatePicker className="full-width" /></Form.Item>
                          <Form.Item name="offboardReason" label="离职原因"><Input maxLength={300} /></Form.Item>
                        </div>
                      </Card>

                      <Card size="small" title="保险与政策">
                        <div className="form-grid two-columns">
                          <Form.Item name="insuranceTypes" label="保险情况"><Checkbox.Group options={insuranceOptions} /></Form.Item>
                          <Form.Item name="supplierPolicyId" label="供应商政策"><ReferenceSelect options={policyOptions} loading={policiesResource.loading} /></Form.Item>
                        </div>
                      </Card>

                      <Card size="small" title="紧急联系人">
                        <div className="form-grid two-columns">
                          <Form.Item name="emergencyContactName" label="联系人"><Input maxLength={64} /></Form.Item>
                          <Form.Item name="emergencyContactPhone" label="联系电话"><Input maxLength={32} /></Form.Item>
                          <Form.Item name="emergencyContactRelation" label="与本人关系"><Input maxLength={32} /></Form.Item>
                        </div>
                      </Card>

                      <Card size="small" title="备注">
                        <Form.Item name="notes" noStyle><Input.TextArea rows={4} maxLength={2000} showCount /></Form.Item>
                      </Card>
                    </Space>
                  )
                },
                {
                  key: "timeline",
                  label: "人员生命周期",
                  children: (
                    <>
                      <Timeline
                        items={(detail.lifecycle ?? []).map((log) => ({
                          children: (
                            <Space orientation="vertical" size={2}>
                              <Space wrap>
                                <Tag color="blue">{lifecycleTypeLabels[log.type] ?? log.type}</Tag>
                                <Typography.Text strong>{log.result}</Typography.Text>
                              </Space>
                              {log.businessInfo ? <Typography.Text>{log.businessInfo}</Typography.Text> : null}
                              <Typography.Text type="secondary">{formatDateTime(log.operatedAt)} · {log.operatorName ?? "系统"}</Typography.Text>
                            </Space>
                          )
                        }))}
                        pending={false}
                      />
                      {!detail.lifecycle?.length ? <Typography.Text type="secondary">暂无生命周期记录</Typography.Text> : null}
                    </>
                  )
                },
                {
                  key: "files",
                  label: "档案资料",
                  children: (
                    <Space orientation="vertical" className="full-width">
                      {canWrite ? (
                        <Upload customRequest={uploadFile} showUploadList={false} multiple>
                          <Button icon={<FileAddOutlined />}>上传附件</Button>
                        </Upload>
                      ) : null}
                      <List
                        size="small"
                        dataSource={detail.files ?? []}
                        locale={{ emptyText: "暂无附件" }}
                        renderItem={(file) => (
                          <List.Item actions={[<Button type="link" size="small" key="download" onClick={() => void downloadPersonFile(file)}>查看 / 下载</Button>]}>
                            {file.originalName || file.fileName}
                          </List.Item>
                        )}
                      />
                    </Space>
                  )
                }
              ]}
            />
          </Form>
        ) : null}
      </Drawer>
    </>
  );
}

export function PeoplePage() {
  return <PermissionGuard permission={Permission.PEOPLE_READ}><PeopleContent /></PermissionGuard>;
}
