import { useState } from "react";
import type { Key } from "react";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  EyeOutlined,
  SendOutlined,
  UndoOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload
} from "antd";
import type { TableColumnsType, UploadFile } from "antd";
import { Permission, SalarySlipStatus } from "@xiangneng/shared";
import { ContentCard } from "../components/ContentCard";
import { ErrorBlock } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PermissionGuard } from "../components/PermissionGuard";
import { StatusTag } from "../components/StatusTag";
import { useApiResource } from "../hooks/useApiResource";
import { api, getErrorMessage, saveBlob } from "../lib/api";
import { formatMoney, listResult } from "../lib/format";
import { importWarnings } from "../lib/imports";
import type { ImportPreview, ListResult, SalarySlip } from "../types/domain";

type PreviewRow = Partial<SalarySlip> & {
  row?: number;
  idCard?: string;
  employeeNo?: string;
  personName?: string;
  matched?: boolean;
  error?: string;
};

const salaryStatusLabels: Record<SalarySlipStatus, string> = {
  [SalarySlipStatus.DRAFT]: "草稿",
  [SalarySlipStatus.PUBLISHED]: "已发布",
  [SalarySlipStatus.WITHDRAWN]: "已撤回"
};

function SalarySlipsContent() {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [salaryMonth, setSalaryMonth] = useState<string>();
  const [status, setStatus] = useState<SalarySlipStatus>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [detail, setDetail] = useState<SalarySlip>();
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<UploadFile>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [working, setWorking] = useState(false);

  const resource = useApiResource(
    () => api.get<ListResult<SalarySlip> | SalarySlip[]>("/salary-slips", { page, pageSize, salaryMonth, status }),
    [page, pageSize, salaryMonth, status]
  );
  const list = resource.data ? listResult(resource.data, page, pageSize) : undefined;
  const previewWarnings = preview ? importWarnings(preview) : [];

  const downloadTemplate = async () => {
    try {
      const result = await api.download("/salary-slips/template");
      saveBlob(result.blob, result.fileName);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const previewImport = async () => {
    if (!file?.originFileObj) {
      message.warning("请先选择工资条文件");
      return;
    }
    setWorking(true);
    const data = new FormData();
    data.append("file", file.originFileObj);
    try {
      setPreview(await api.upload<ImportPreview>("/salary-slips/import-preview", data));
      message.success("预览校验完成，尚未写入数据库");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const commitImport = async () => {
    if (!preview?.importId) {
      message.warning("预览结果缺少导入标识，请重新预览");
      return;
    }
    setWorking(true);
    try {
      await api.post("/salary-slips/import-commit", { importId: preview.importId, sourceHash: preview.sourceHash });
      message.success("工资条已导入为草稿");
      setImportOpen(false);
      setFile(undefined);
      setPreview(undefined);
      await resource.reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const changeStatus = async (action: "publish" | "withdraw") => {
    if (!selectedRowKeys.length) return;
    modal.confirm({
      title: action === "publish" ? "确认发布工资条？" : "确认撤回工资条？",
      content: action === "publish" ? "发布后员工本人可查看，并进入通知队列。" : "撤回后员工将无法继续查看该工资条。",
      okText: action === "publish" ? "确认发布" : "确认撤回",
      onOk: async () => {
        try {
          await api.post(`/salary-slips/${action}`, { ids: selectedRowKeys });
          message.success(action === "publish" ? "工资条已发布" : "工资条已撤回");
          setSelectedRowKeys([]);
          await resource.reload();
        } catch (error) {
          message.error(getErrorMessage(error));
          throw error;
        }
      }
    });
  };

  const exportSlips = async () => {
    try {
      const result = await api.download("/salary-slips/export", { salaryMonth, status });
      saveBlob(result.blob, result.fileName);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const columns: TableColumnsType<SalarySlip> = [
    { title: "工资月份", dataIndex: "salaryMonth", fixed: "left", width: 110 },
    { title: "姓名", width: 100, render: (_, row) => row.person?.name ?? "—" },
    { title: "工号", width: 110, render: (_, row) => row.person?.employeeNo ?? "—" },
    { title: "项目", width: 170, render: (_, row) => row.person?.project?.name || row.person?.projectName || "—" },
    { title: "应发工资", dataIndex: "grossPay", width: 130, render: formatMoney },
    { title: "实发工资", dataIndex: "netPay", width: 130, render: formatMoney },
    { title: "推荐奖励", dataIndex: "referralReward", width: 120, render: formatMoney },
    { title: "状态", dataIndex: "status", width: 100, render: (value: SalarySlipStatus) => <StatusTag status={value} /> },
    { title: "备注", dataIndex: "notes", width: 180, ellipsis: { showTitle: true }, render: (value: string | null) => value || "—" },
    { title: "操作", fixed: "right", width: 90, render: (_, row) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(row)}>详情</Button> }
  ];

  const previewColumns: TableColumnsType<PreviewRow> = [
    { title: "行号", dataIndex: "row", width: 70 },
    { title: "姓名", dataIndex: "personName", width: 100, render: (value: string | undefined) => value || "—" },
    { title: "身份证 / 工号", width: 190, render: (_, row) => row.idCard || row.employeeNo || "—" },
    { title: "月份", dataIndex: "salaryMonth", width: 90 },
    { title: "应发", dataIndex: "grossPay", width: 110, render: formatMoney },
    { title: "实发", dataIndex: "netPay", width: 110, render: formatMoney },
    { title: "匹配结果", width: 100, render: (_, row) => row.matched === false || row.error ? <Tag color="red">未匹配</Tag> : <Tag color="green">通过</Tag> },
    { title: "说明", dataIndex: "error", width: 220, render: (value: string | undefined) => value || "—" }
  ];

  return (
    <>
      <PageHeader
        title="工资条管理"
        description="先预览校验、再确认导入；只有发布后的工资条可由员工本人查看。"
        extra={<><Button icon={<DownloadOutlined />} onClick={() => void downloadTemplate()}>下载模板</Button><Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setImportOpen(true)}>导入工资条</Button></>}
      />
      <ContentCard>
        <div className="filter-grid compact">
          <Input allowClear placeholder="工资月份，如 2026-07" value={salaryMonth} onChange={(event) => setSalaryMonth(event.target.value)} maxLength={7} />
          <Select allowClear placeholder="发布状态" value={status} options={Object.entries(salaryStatusLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value); setPage(1); }} />
          <Button icon={<DownloadOutlined />} onClick={() => void exportSlips()}>导出当前结果</Button>
        </div>
        {selectedRowKeys.length ? <div className="batch-bar"><span>已选择 {selectedRowKeys.length} 条</span><Button type="primary" size="small" icon={<SendOutlined />} onClick={() => void changeStatus("publish")}>发布</Button><Button size="small" icon={<UndoOutlined />} onClick={() => void changeStatus("withdraw")}>撤回</Button><Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button></div> : null}
        {resource.error && !list ? <ErrorBlock error={resource.error} onRetry={() => void resource.reload()} /> : (
          <Table<SalarySlip>
            rowKey="id"
            columns={columns}
            dataSource={list?.items ?? []}
            loading={resource.loading}
            scroll={{ x: 1250 }}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, preserveSelectedRowKeys: true }}
            pagination={{ current: page, pageSize, total: list?.pagination.total ?? 0, showSizeChanger: true, showTotal: (total) => `共 ${total} 条工资条` }}
            onChange={(pagination) => { setPage(pagination.current ?? 1); setPageSize(pagination.pageSize ?? 20); }}
            locale={{ emptyText: "暂无工资条" }}
          />
        )}
      </ContentCard>

      <Modal
        title="工资条导入"
        width={960}
        open={importOpen}
        confirmLoading={working}
        onCancel={() => { setImportOpen(false); setPreview(undefined); setFile(undefined); }}
        footer={preview ? <><Button onClick={() => setPreview(undefined)}>返回选文件</Button><Button type="primary" disabled={!preview.accepted.length || !preview.importId} loading={working} onClick={() => void commitImport()}>确认写入 {preview.accepted.length} 条</Button></> : <><Button onClick={() => setImportOpen(false)}>取消</Button><Button type="primary" loading={working} onClick={() => void previewImport()}>预览并校验</Button></>}
        destroyOnHidden
      >
        {!preview ? (
          <>
            <Alert type="info" showIcon title="导入不会直接发布" description="系统按身份证号或员工编号匹配人员。预览阶段不写数据库，未匹配数据会单独列出。" />
            <Upload.Dragger
              accept=".xlsx,.xls"
              maxCount={1}
              fileList={file ? [file] : []}
              beforeUpload={(nextFile) => { setFile(nextFile); return false; }}
              onRemove={() => { setFile(undefined); return true; }}
              className="import-dragger"
            >
              <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
              <p className="ant-upload-text">点击或拖拽工资条 Excel 到此处</p>
              <p className="ant-upload-hint">仅使用真实工资数据；模板外字段不会被猜测补齐。</p>
            </Upload.Dragger>
          </>
        ) : (
          <>
            <Space wrap className="preview-summary">
              <Tag color="blue">总行数 {preview.totalRows}</Tag>
              <Tag color="green">可导入 {preview.accepted.length}</Tag>
              <Tag color={preview.skipped.length ? "red" : "default"}>跳过 {preview.skipped.length}</Tag>
              <Tag color={previewWarnings.length ? "gold" : "default"}>警告 {previewWarnings.length}</Tag>
            </Space>
            {previewWarnings.length ? <Alert type="warning" showIcon title="预览存在警告" description={previewWarnings.slice(0, 5).map((item) => `第 ${item.row ?? "?"} 行：${item.message}`).join("；")} /> : null}
            <Table<PreviewRow> rowKey={(row) => String(row.row ?? `${row.idCard}-${row.employeeNo}`)} size="small" columns={previewColumns} dataSource={preview.accepted as PreviewRow[]} scroll={{ x: 900, y: 360 }} pagination={false} locale={{ emptyText: "没有可导入记录" }} />
          </>
        )}
      </Modal>

      <Drawer title="工资条详情" width={600} open={Boolean(detail)} onClose={() => setDetail(undefined)}>
        {detail ? <>
          <Alert type="info" showIcon title="仅员工本人可在员工端查看此工资条" />
          <Descriptions bordered column={1} size="small" className="detail-descriptions">
            <Descriptions.Item label="姓名">{detail.person?.name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="工资月份">{detail.salaryMonth}</Descriptions.Item>
            <Descriptions.Item label="状态"><StatusTag status={detail.status} /></Descriptions.Item>
            <Descriptions.Item label="应发工资">{formatMoney(detail.grossPay)}</Descriptions.Item>
            <Descriptions.Item label="实发工资"><Typography.Text strong>{formatMoney(detail.netPay)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="工时工资">{formatMoney(detail.hourlyPay)}</Descriptions.Item>
            <Descriptions.Item label="加班费">{formatMoney(detail.overtimePay)}</Descriptions.Item>
            <Descriptions.Item label="补贴">{formatMoney(detail.allowance)}</Descriptions.Item>
            <Descriptions.Item label="推荐奖励">{formatMoney(detail.referralReward)}</Descriptions.Item>
            <Descriptions.Item label="社保扣款">{formatMoney(detail.socialSecurityDeduction)}</Descriptions.Item>
            <Descriptions.Item label="其他扣款">{formatMoney(detail.otherDeduction)}</Descriptions.Item>
            <Descriptions.Item label="备注">{detail.notes || "—"}</Descriptions.Item>
          </Descriptions>
        </> : null}
      </Drawer>
    </>
  );
}

export function SalarySlipsPage() {
  return <PermissionGuard permission={Permission.SALARY_MANAGE}><SalarySlipsContent /></PermissionGuard>;
}
