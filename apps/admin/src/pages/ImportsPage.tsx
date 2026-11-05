import { useState } from "react";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InboxOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Col,
  Descriptions,
  Divider,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload
} from "antd";
import type { TableColumnsType } from "antd";
import { Permission } from "@xiangneng/shared";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage, saveBlob } from "../lib/api";
import { formatDateTime, listResult } from "../lib/format";
import { stagedImportCommit } from "../lib/imports";
import type { ListResult } from "../types/domain";

type ImportRecord = {
  id: string;
  type: string;
  sourceFile: string;
  sourceHash?: string;
  status: string;
  totalRows: number;
  successRows: number;
  skippedRows: number;
  operator?: { displayName?: string };
  createdAt: string;
};

type OrganizationRow = {
  sourceRow?: number;
  branchName?: string;
  projectName?: string;
  sourceProjectId?: string;
  isExternal?: boolean;
  projectStatus?: string;
  businessType?: string | null;
};

type OrganizationPreview = {
  importId: string;
  importJobId?: string;
  sourceFile: string;
  sourceHash: string;
  branches: Array<{ name: string; projectCount: number }>;
  projects: OrganizationRow[];
  skipped: unknown[];
  warnings: Array<{ code?: string; message: string; sourceRows?: number[] }>;
  reconciliation: Record<string, unknown>;
};

type PeopleAcceptedRow = {
  row?: number;
  sourceRow?: number;
  action: "CREATE" | "MERGE";
  existingPersonId?: string;
  data?: {
    name?: string;
    idCard?: string;
    phone?: string;
    projectId?: string;
    jobTitle?: string;
  };
};

type PeopleSkippedRow = {
  row?: number;
  sourceRow?: number;
  reason: string;
};

type PeoplePreview = {
  importId: string;
  sourceFile: string;
  sourceHash: string;
  totalRows: number;
  accepted: PeopleAcceptedRow[];
  skipped: PeopleSkippedRow[];
  warnings?: Array<{ row?: number; message: string }>;
  reconciliation: Record<string, number>;
};

type PeopleCommitResult = {
  job?: {
    id: string;
    status: string;
    totalRows: number;
    successRows: number;
    skippedRows: number;
    failedRows?: number;
  };
  results: Array<{ row: number; personId: string; action: "CREATE" | "MERGE" }>;
  failures: PeopleSkippedRow[];
};

type PeopleResultRow = {
  row: number;
  result: string;
  personId?: string;
  reason?: string;
};

function ImportsContent() {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<OrganizationPreview>();
  const [peopleFile, setPeopleFile] = useState<File>();
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peoplePreview, setPeoplePreview] = useState<PeoplePreview>();
  const [peopleResult, setPeopleResult] = useState<PeopleCommitResult>();
  const [working, setWorking] = useState(false);

  const resource = useApiResource(
    () => api.get<ListResult<ImportRecord> | ImportRecord[]>("/imports", { page, pageSize }),
    [page, pageSize]
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;

  const runPreview = async () => {
    setWorking(true);
    try {
      setPreview(await api.post<OrganizationPreview>("/imports/organization/preview"));
      message.success("校验完成，尚未写入数据库");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const commitConfirmed = async () => {
    if (!preview) return;
    setWorking(true);
    try {
      await api.post("/imports/organization/commit", stagedImportCommit(preview.importId, preview.sourceHash));
      message.success("组织与项目主数据导入完成");
      setPreviewOpen(false);
      setPreview(undefined);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const commit = () => {
    modal.confirm({
      title: "确认写入组织与项目主数据？",
      content: "导入按唯一键幂等执行，不会把合计行、说明行或空白行写入项目表。",
      okText: "确认导入",
      cancelText: "取消",
      onOk: commitConfirmed
    });
  };

  const downloadPeopleTemplate = async () => {
    setWorking(true);
    try {
      const download = await api.download("/imports/people/template");
      saveBlob(download.blob, download.fileName);
      message.success("人员导入模板已下载");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const previewPeople = async () => {
    if (!peopleFile) {
      message.warning("请先选择人员花名册 Excel 文件");
      return;
    }
    setPeopleOpen(true);
    setPeoplePreview(undefined);
    setPeopleResult(undefined);
    setWorking(true);
    try {
      const formData = new FormData();
      formData.append("file", peopleFile);
      const result = await api.upload<PeoplePreview>("/imports/people/preview", formData);
      setPeoplePreview({
        ...result,
        accepted: result.accepted ?? [],
        skipped: result.skipped ?? [],
        warnings: result.warnings ?? [],
        reconciliation: result.reconciliation ?? {}
      });
      message.success("人员文件校验完成，尚未写入数据库");
    } catch (error) {
      setPeopleOpen(false);
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const commitPeopleConfirmed = async () => {
    if (!peoplePreview) return;
    setWorking(true);
    try {
      const result = await api.post<PeopleCommitResult>(
        "/imports/people/commit",
        stagedImportCommit(peoplePreview.importId, peoplePreview.sourceHash)
      );
      setPeopleResult({
        ...result,
        results: result.results ?? [],
        failures: result.failures ?? []
      });
      message.success("人员导入已执行，请核对逐行结果");
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const commitPeople = () => {
    modal.confirm({
      title: "确认写入人员主档与报名记录？",
      content: "身份证号已存在的记录将归并到原人员档案；校验不通过的行不会写入。",
      okText: "确认导入",
      cancelText: "取消",
      onOk: commitPeopleConfirmed
    });
  };

  const historyColumns: TableColumnsType<ImportRecord> = [
    { title: "导入时间", dataIndex: "createdAt", width: 160, render: (value: string) => formatDateTime(value) },
    { title: "导入类型", dataIndex: "type", width: 150, render: (value: string) => value === "ORGANIZATION" || value === "ORGANIZATION_PROJECTS" ? "组织与项目" : value === "SALARY_SLIP" ? "工资条" : value === "PEOPLE" ? "人员" : value },
    { title: "源文件", dataIndex: "sourceFile", width: 260, ellipsis: { showTitle: true } },
    { title: "总行数", dataIndex: "totalRows", width: 90 },
    { title: "成功", dataIndex: "successRows", width: 90 },
    { title: "跳过 / 异常", dataIndex: "skippedRows", width: 110 },
    { title: "状态", dataIndex: "status", width: 110, render: (value: string) => <StatusTag status={value} /> },
    { title: "操作人", width: 120, render: (_, row) => row.operator?.displayName ?? "系统" }
  ];

  const previewColumns: TableColumnsType<OrganizationRow> = [
    { title: "源行", dataIndex: "sourceRow", width: 70 },
    { title: "分子公司", dataIndex: "branchName", width: 200 },
    { title: "项目名称", dataIndex: "projectName", width: 240 },
    { title: "源项目编号", dataIndex: "sourceProjectId", width: 120, render: (value: string | undefined) => value || "—" },
    { title: "是否外送", dataIndex: "isExternal", width: 100, render: (value: boolean | undefined) => value === undefined ? "未设置" : value ? "是" : "否" },
    { title: "项目状态", dataIndex: "projectStatus", width: 120, render: (value: string | undefined) => value ? <StatusTag status={value} /> : <Tag>未设置</Tag> },
    { title: "业务类型", dataIndex: "businessType", width: 180, render: (value: string | null) => value || "综合用工服务" }
  ];

  const peoplePreviewColumns: TableColumnsType<PeopleAcceptedRow> = [
    { title: "源行", width: 70, render: (_, row) => row.row ?? row.sourceRow ?? "—" },
    { title: "处理方式", dataIndex: "action", width: 100, render: (value: PeopleAcceptedRow["action"]) => <Tag color={value === "CREATE" ? "green" : "blue"}>{value === "CREATE" ? "新建" : "归并"}</Tag> },
    { title: "姓名", width: 120, render: (_, row) => row.data?.name ?? "—" },
    { title: "身份证号", width: 190, render: (_, row) => row.data?.idCard ?? "—" },
    { title: "手机号", width: 140, render: (_, row) => row.data?.phone ?? "—" },
    { title: "岗位", width: 160, render: (_, row) => row.data?.jobTitle ?? "—" }
  ];

  const peopleResultColumns: TableColumnsType<PeopleResultRow> = [
    { title: "源行", dataIndex: "row", width: 70 },
    { title: "结果", dataIndex: "result", width: 100, render: (value: string) => <Tag color={value === "失败" || value === "跳过" ? "red" : value === "归并" ? "blue" : "green"}>{value}</Tag> },
    { title: "人员档案 ID", dataIndex: "personId", width: 260, render: (value?: string) => value ?? "—" },
    { title: "说明", dataIndex: "reason", render: (value?: string) => value ?? "已写入人员主档及报名记录" }
  ];

  const peopleSkippedColumns: TableColumnsType<PeopleSkippedRow> = [
    { title: "源行", width: 70, render: (_, row) => row.row ?? row.sourceRow ?? "—" },
    { title: "处理结果", width: 100, render: () => <Tag color="red">跳过</Tag> },
    { title: "原因", dataIndex: "reason" }
  ];

  return (
    <>
      <PageHeader
        title="数据导入"
        description="所有批量导入先预览、校验和对账，再确认写入；可重复执行且不会重复插入。"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><ContentCard><Statistic title="幂等导入" value="唯一键去重" /><Typography.Text type="secondary">重复文件不会重复插入主数据</Typography.Text></ContentCard></Col>
        <Col xs={24} md={8}><ContentCard><Statistic title="演示数据" value="完整可用" /><Typography.Text type="secondary">缺失的演示字段按统一规则补齐，并与业务数据源联动</Typography.Text></ContentCard></Col>
        <Col xs={24} md={8}><ContentCard><Statistic title="结果清单" value="可追溯" /><Typography.Text type="secondary">成功、跳过、异常逐项留痕</Typography.Text></ContentCard></Col>
      </Row>
      <ContentCard title="导入工作台">
        <Tabs
          items={[
            {
              key: "organization",
              label: "组织与项目",
              children: (
                <Row gutter={[20, 16]} align="middle">
                  <Col xs={24} lg={17}>
                    <Alert
                      type="info"
                      showIcon
                      title="使用已核验的组织架构与项目分布数据"
                      description="系统读取从唯一事实源 Excel 生成并完成哈希、合计行过滤和归属对账的派生工件；演示环境会按统一规则补齐负责人、联系方式、岗位说明与期限。"
                    />
                  </Col>
                  <Col xs={24} lg={7}>
                    <Button
                      block
                      type="primary"
                      icon={<CloudUploadOutlined />}
                      loading={working && previewOpen}
                      onClick={() => { setPreviewOpen(true); void runPreview(); }}
                    >
                      预览已核验初始化数据
                    </Button>
                  </Col>
                </Row>
              )
            },
            {
              key: "people",
              label: "人员花名册",
              children: (
                <Row gutter={[20, 16]}>
                  <Col xs={24} lg={15}>
                    <Upload.Dragger
                      accept=".xlsx,.xls"
                      maxCount={1}
                      beforeUpload={(file) => {
                        setPeopleFile(file);
                        setPeoplePreview(undefined);
                        setPeopleResult(undefined);
                        return false;
                      }}
                      onRemove={() => {
                        setPeopleFile(undefined);
                        setPeoplePreview(undefined);
                        setPeopleResult(undefined);
                      }}
                    >
                      <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                      <p className="ant-upload-text">拖拽或点击选择人员花名册 Excel</p>
                      <p className="ant-upload-hint">必须使用系统模板；先校验新建、归并和跳过行，确认后才写入。</p>
                    </Upload.Dragger>
                  </Col>
                  <Col xs={24} lg={9}>
                    <Space orientation="vertical" size="middle" className="full-width">
                      <Alert
                        type="warning"
                        showIcon
                        title="身份证号作为人员查重依据"
                        description="命中已有档案时在原档案上归并报名信息，不会重复创建人员。"
                      />
                      <Button block icon={<DownloadOutlined />} loading={working && !peopleOpen} onClick={() => void downloadPeopleTemplate()}>
                        下载人员导入模板
                      </Button>
                      <Button block type="primary" icon={<FileExcelOutlined />} disabled={!peopleFile} loading={working && peopleOpen} onClick={() => void previewPeople()}>
                        上传并预览
                      </Button>
                    </Space>
                  </Col>
                </Row>
              )
            }
          ]}
        />
      </ContentCard>
      <ContentCard title="导入记录" extra={<Button icon={<ReloadOutlined />} onClick={() => void resource.reload()} loading={resource.loading}>刷新</Button>}>
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<ImportRecord>
            rowKey="id"
            columns={historyColumns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1150 }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 次导入` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无导入记录" }}
          />
        )}
      </ContentCard>

      <Modal
        title="组织架构与项目分布导入"
        width={1000}
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setPreview(undefined); }}
        footer={preview ? <><Button onClick={() => setPreviewOpen(false)}>取消</Button><Button type="primary" loading={working} disabled={!preview.projects.length} onClick={commit}>确认导入 {preview.projects.length} 个项目</Button></> : <><Button onClick={() => setPreviewOpen(false)}>关闭</Button><Button type="primary" loading={working} onClick={() => void runPreview()}>重新读取</Button></>}
        destroyOnHidden
      >
        {!preview ? (
          <Alert
            type="info"
            showIcon
            title={working ? "正在读取已核验初始化数据" : "尚未读取初始化数据"}
            description="系统只使用由原始 Excel 生成并完成哈希与对账校验的派生工件，页面不会忽略或假装处理用户上传的文件。"
          />
        ) : (
          <>
            <Descriptions bordered size="small" column={{ xs: 1, md: 3 }}>
              <Descriptions.Item label="源文件">{preview.sourceFile}</Descriptions.Item>
              <Descriptions.Item label="分子公司">{preview.branches.length}</Descriptions.Item>
              <Descriptions.Item label="可导入项目">{preview.projects.length}</Descriptions.Item>
              <Descriptions.Item label="跳过">{preview.skipped.length}</Descriptions.Item>
              <Descriptions.Item label="警告">{preview.warnings.length}</Descriptions.Item>
              <Descriptions.Item label="文件摘要">{preview.sourceHash?.slice(0, 16) ?? "—"}</Descriptions.Item>
            </Descriptions>
            <Divider titlePlacement="start">对账结果</Divider>
            <Space wrap>{Object.entries(preview.reconciliation).map(([key, value]) => <Tag color="blue" key={key}>{key}: {String(value)}</Tag>)}</Space>
            {preview.warnings.length ? <Alert type="warning" showIcon title="预览警告" description={preview.warnings.slice(0, 8).map((item) => `${item.sourceRows?.length ? `源行 ${item.sourceRows.join(",")}：` : ""}${item.message}`).join("；")} className="preview-alert" /> : null}
            <Divider titlePlacement="start">可导入项目</Divider>
            <Table<OrganizationRow> rowKey={(row) => String(row.sourceRow ?? `${row.branchName}-${row.projectName}`)} size="small" columns={previewColumns} dataSource={preview.projects} pagination={false} scroll={{ x: 1000, y: 360 }} locale={{ emptyText: "没有可导入项目" }} />
          </>
        )}
      </Modal>

      <Modal
        title="人员花名册导入"
        width={1040}
        open={peopleOpen}
        onCancel={() => {
          if (working) return;
          setPeopleOpen(false);
          setPeoplePreview(undefined);
          setPeopleResult(undefined);
        }}
        closable={!working}
        maskClosable={!working}
        footer={peopleResult ? (
          <Button type="primary" onClick={() => { setPeopleOpen(false); setPeoplePreview(undefined); setPeopleResult(undefined); }}>完成</Button>
        ) : peoplePreview ? (
          <>
            <Button disabled={working} onClick={() => setPeopleOpen(false)}>取消</Button>
            <Button type="primary" loading={working} disabled={!peoplePreview.accepted.length} onClick={commitPeople}>
              确认导入 {peoplePreview.accepted.length} 行
            </Button>
          </>
        ) : <Button disabled={working} onClick={() => setPeopleOpen(false)}>关闭</Button>}
        destroyOnHidden
      >
        {!peoplePreview ? (
          <Alert type="info" showIcon title="正在解析并校验人员花名册" description="文件尚未写入数据库，请等待预览结果。" />
        ) : peopleResult ? (
          <>
            <Descriptions bordered size="small" column={{ xs: 1, md: 4 }}>
              <Descriptions.Item label="执行状态"><StatusTag status={peopleResult.job?.status ?? "COMMITTED"} /></Descriptions.Item>
              <Descriptions.Item label="成功写入">{peopleResult.results.length}</Descriptions.Item>
              <Descriptions.Item label="新建">{peopleResult.results.filter((item) => item.action === "CREATE").length}</Descriptions.Item>
              <Descriptions.Item label="归并">{peopleResult.results.filter((item) => item.action === "MERGE").length}</Descriptions.Item>
              <Descriptions.Item label="失败 / 跳过">{peopleResult.failures.length}</Descriptions.Item>
              <Descriptions.Item label="源文件" span={3}>{peoplePreview.sourceFile}</Descriptions.Item>
            </Descriptions>
            {peopleResult.failures.length ? <Alert className="preview-alert" type="warning" showIcon title="存在未写入行" description="请根据下方逐行原因修正文件后重新预览。" /> : <Alert className="preview-alert" type="success" showIcon title="全部可接收行已写入" />}
            <Divider titlePlacement="start">逐行处理结果</Divider>
            <Table<PeopleResultRow>
              size="small"
              rowKey={(row) => `${row.row}-${row.result}`}
              columns={peopleResultColumns}
              dataSource={[
                ...peopleResult.results.map((item) => ({ row: item.row, result: item.action === "CREATE" ? "新建" : "归并", personId: item.personId })),
                ...peopleResult.failures.map((item) => ({
                  row: item.row ?? item.sourceRow ?? 0,
                  result: peoplePreview.skipped.some((skipped) => (skipped.row ?? skipped.sourceRow) === (item.row ?? item.sourceRow)) ? "跳过" : "失败",
                  reason: item.reason
                }))
              ] as PeopleResultRow[]}
              pagination={false}
              scroll={{ x: 800, y: 360 }}
            />
          </>
        ) : (
          <>
            <Descriptions bordered size="small" column={{ xs: 1, md: 4 }}>
              <Descriptions.Item label="源文件" span={2}>{peoplePreview.sourceFile}</Descriptions.Item>
              <Descriptions.Item label="总数据行">{peoplePreview.totalRows}</Descriptions.Item>
              <Descriptions.Item label="可接收">{peoplePreview.accepted.length}</Descriptions.Item>
              <Descriptions.Item label="新建">{peoplePreview.accepted.filter((item) => item.action === "CREATE").length}</Descriptions.Item>
              <Descriptions.Item label="归并">{peoplePreview.accepted.filter((item) => item.action === "MERGE").length}</Descriptions.Item>
              <Descriptions.Item label="跳过">{peoplePreview.skipped.length}</Descriptions.Item>
              <Descriptions.Item label="文件摘要">{peoplePreview.sourceHash.slice(0, 16)}</Descriptions.Item>
            </Descriptions>
            <Divider titlePlacement="start">对账结果</Divider>
            <Space wrap>{Object.entries(peoplePreview.reconciliation).map(([key, value]) => <Tag color="blue" key={key}>{key}: {value}</Tag>)}</Space>
            {peoplePreview.skipped.length || peoplePreview.warnings?.length ? (
              <Alert
                className="preview-alert"
                type="warning"
                showIcon
                title="存在跳过或警告行"
                description={[
                  ...peoplePreview.skipped.slice(0, 8).map((item) => `源行 ${item.row ?? item.sourceRow ?? "—"}：${item.reason}`),
                  ...(peoplePreview.warnings ?? []).slice(0, 5).map((item) => `${item.row ? `源行 ${item.row}：` : ""}${item.message}`)
                ].join("；")}
              />
            ) : null}
            <Divider titlePlacement="start">可接收人员</Divider>
            <Table
              size="small"
              rowKey={(row) => String(row.row ?? row.sourceRow ?? `${row.data?.idCard}-${row.action}`)}
              columns={peoplePreviewColumns}
              dataSource={peoplePreview.accepted}
              pagination={false}
              scroll={{ x: 900, y: 360 }}
              locale={{ emptyText: "没有可导入人员；请先修正所有校验错误" }}
            />
            {peoplePreview.skipped.length ? (
              <>
                <Divider titlePlacement="start">跳过清单</Divider>
                <Table
                  size="small"
                  rowKey={(row) => String(row.row ?? row.sourceRow ?? row.reason)}
                  columns={peopleSkippedColumns}
                  dataSource={peoplePreview.skipped}
                  pagination={false}
                  scroll={{ x: 700, y: 220 }}
                />
              </>
            ) : null}
          </>
        )}
      </Modal>
    </>
  );
}

export function ImportsPage() {
  return <PermissionGuard permission={Permission.IMPORT_MANAGE}><ImportsContent /></PermissionGuard>;
}
