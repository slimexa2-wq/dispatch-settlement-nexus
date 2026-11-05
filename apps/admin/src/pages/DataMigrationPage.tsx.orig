import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Col, Descriptions, Divider, Form, Input, Progress, Row, Select, Space, Steps, Table, Tag, Typography, Upload } from "antd";
import { DownloadOutlined, ReloadOutlined, RollbackOutlined, UploadOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { ContentCard } from "../components/ContentCard";
import { PageHeader } from "../components/PageHeader";
import { api, getErrorMessage, saveBlob, type PaginatedResult } from "../lib/api";

type FieldDefinition = { key: string; label: string; required?: boolean; aliases?: string[] };
type MigrationTemplate = { id: string; code: string; name: string; description?: string | null; fields: FieldDefinition[]; uniqueKeys: string[] };
type PreviewRow = { sourceRow: number; action: "CREATE" | "UPDATE" | "SKIP" | "ERROR"; uniqueKey?: string | null; data: Record<string, unknown>; errors: string[] };
type MigrationBatch = {
  id: string; sourceFile: string; status: string; totalRows: number; createRows: number; updateRows: number; skipRows: number;
  errorRows: number; processedRows: number; createdAt: string; template: MigrationTemplate;
};
type PreviewResult = {
  batch: MigrationBatch; template: MigrationTemplate; mapping: Record<string, string>;
  autoMapping: { unmappedHeaders: string[]; missingRequired: string[] };
  previewRows: PreviewRow[]; previewTruncated: boolean;
  summary: { total: number; creates: number; updates: number; skips: number; errors: number };
};
type AnalyzeResult = {
  batch: MigrationBatch; template: MigrationTemplate; headers: string[]; rowCount: number; mapping: Record<string, string>;
  autoMapping: { unmappedHeaders: string[]; missingRequired: string[] };
  sampleRows: Array<Record<string, unknown>>;
};

const statusLabels: Record<string, string> = {
  DRAFT: "草稿", PREVIEWING: "待修复", READY: "可提交", COMMITTING: "迁移中", COMMITTED: "已完成",
  PARTIAL: "部分成功", FAILED: "失败", ROLLED_BACK: "已撤销"
};

export function DataMigrationPage() {
  const { message, modal } = App.useApp();
  const [templates, setTemplates] = useState<MigrationTemplate[]>([]);
  const [batches, setBatches] = useState<MigrationBatch[]>([]);
  const [templateId, setTemplateId] = useState<string>();
  const [analysis, setAnalysis] = useState<AnalyzeResult>();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [conflictPolicy, setConflictPolicy] = useState("UPDATE");
  const [preview, setPreview] = useState<PreviewResult>();
  const [ignoredSourceRows, setIgnoredSourceRows] = useState<Set<number>>(new Set());
  const [selectedErrorRows, setSelectedErrorRows] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const template = useMemo(() => templates.find((item) => item.id === templateId), [templates, templateId]);
  const headers = analysis?.headers ?? [];
  const currentStep = preview ? (preview.batch.status === "COMMITTED" ? 3 : 2) : analysis ? 1 : 0;

  const reload = async () => {
    const [templateItems, batchResult] = await Promise.all([
      api.get<MigrationTemplate[]>("/migration-center/templates"),
      api.get<PaginatedResult<MigrationBatch>>("/migration-center/batches", { page: 1, pageSize: 50 })
    ]);
    setTemplates(templateItems);
    setBatches(batchResult.items);
    setTemplateId((current) => current ?? templateItems[0]?.id);
  };

  useEffect(() => { void reload().catch((error) => message.error(getErrorMessage(error))); }, []);

  const parseFile = async (file: File) => {
    if (!templateId) { message.warning("请先选择迁移数据类型"); return false; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("templateId", templateId);
      formData.append("file", file);
      const result = await api.upload<AnalyzeResult>("/migration-center/analyze-file", formData);
      setAnalysis(result);
      setPreview(undefined);
      setMapping(result.mapping);
      setIgnoredSourceRows(new Set());
      setSelectedErrorRows([]);
      message.success(`文件已上传并识别 ${result.rowCount} 行，下一步进行字段映射和预览校验`);
      await reload();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally { setLoading(false); }
    return false;
  };

  const runPreview = async (ignoredRows = ignoredSourceRows) => {
    if (!analysis) return message.warning("请先选择模板并上传Excel或CSV");
    setLoading(true);
    try {
      const result = await api.post<PreviewResult>(`/migration-center/batches/${analysis.batch.id}/preview-file`, {
        mapping, conflictPolicy, ignoredSourceRows: [...ignoredRows]
      });
      setPreview(result);
      setMapping(result.mapping);
      setSelectedErrorRows([]);
      message.success(result.summary.errors ? `预览完成，发现 ${result.summary.errors} 行错误` : "预览校验通过，可以正式迁移");
      await reload();
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const skipSelectedErrors = async () => {
    if (!selectedErrorRows.length) return message.warning("请先勾选需要跳过的错误行");
    const next = new Set(ignoredSourceRows);
    selectedErrorRows.forEach((row) => next.add(row));
    setIgnoredSourceRows(next);
    await runPreview(next);
  };

  const restoreSkippedRows = async () => {
    const next = new Set<number>();
    setIgnoredSourceRows(next);
    await runPreview(next);
  };

  const commit = async (batch: MigrationBatch) => {
    setLoading(true);
    try {
      await api.post(`/migration-center/batches/${batch.id}/commit`);
      message.success("迁移执行完成");
      await reload();
      if (preview?.batch.id === batch.id) setPreview(undefined);
    } catch (error) { message.error(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const rollback = (batch: MigrationBatch) => modal.confirm({
    title: "确认撤销本批迁移？",
    content: "新增数据会删除，更新数据会恢复到迁移前。有关联业务的数据可能无法自动撤销。",
    okText: "确认撤销", okButtonProps: { danger: true },
    onOk: async () => { await api.post(`/migration-center/batches/${batch.id}/rollback`); message.success("本批迁移已撤销"); await reload(); }
  });

  const downloadTemplate = () => {
    if (!template) return;
    const row = Object.fromEntries(template.fields.map((field) => [field.label, ""]));
    const worksheet = XLSX.utils.json_to_sheet([row]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, template.name);
    XLSX.writeFile(workbook, `${template.name}-导入模板.xlsx`);
  };

  const downloadErrors = async (batch: MigrationBatch) => {
    const { blob, fileName } = await api.download(`/migration-center/batches/${batch.id}/errors.csv`);
    saveBlob(blob, fileName);
  };

  const batchColumns = [
    { title: "批次文件", dataIndex: "sourceFile", ellipsis: true },
    { title: "数据类型", render: (_: unknown, row: MigrationBatch) => row.template.name, width: 130 },
    { title: "状态", dataIndex: "status", width: 100, render: (value: string) => <Tag color={value === "COMMITTED" ? "green" : value === "FAILED" || value === "PARTIAL" ? "red" : "blue"}>{statusLabels[value] ?? value}</Tag> },
    { title: "总行数", dataIndex: "totalRows", width: 85 },
    { title: "新增", dataIndex: "createRows", width: 75 },
    { title: "更新", dataIndex: "updateRows", width: 75 },
    { title: "错误", dataIndex: "errorRows", width: 75, render: (value: number) => <Typography.Text type={value ? "danger" : undefined}>{value}</Typography.Text> },
    { title: "执行进度", width: 150, render: (_: unknown, row: MigrationBatch) => <Progress size="small" percent={row.totalRows ? Math.round(row.processedRows / row.totalRows * 100) : 0} /> },
    { title: "操作", width: 250, render: (_: unknown, row: MigrationBatch) => <Space>
      {row.errorRows > 0 ? <Button size="small" onClick={() => void downloadErrors(row)}>下载错误</Button> : null}
      {["READY", "PREVIEWING", "FAILED", "PARTIAL"].includes(row.status) ? <Button size="small" type="primary" disabled={row.status === "PREVIEWING" && row.errorRows > 0} onClick={() => void commit(row)}>{row.status === "PARTIAL" || row.status === "FAILED" ? "继续迁移" : "正式迁移"}</Button> : null}
      {["COMMITTED", "PARTIAL"].includes(row.status) ? <Button size="small" danger icon={<RollbackOutlined />} onClick={() => rollback(row)}>撤销</Button> : null}
    </Space> }
  ];

  return <>
    <PageHeader title="数据迁移中心" description="批量上传、字段映射、预览校验、错误修复、正式迁移和可控撤销集中处理。" />
    <ContentCard>
      <Steps current={currentStep} items={[{ title: "选择模板并上传" }, { title: "字段映射" }, { title: "预览校验" }, { title: "正式迁移" }]} />
      <Divider />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}><Form layout="vertical"><Form.Item label="迁移数据类型"><Select value={templateId} onChange={(value) => { setTemplateId(value); setAnalysis(undefined); setPreview(undefined); setMapping({}); setIgnoredSourceRows(new Set()); setSelectedErrorRows([]); }} options={templates.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item></Form></Col>
        <Col xs={24} lg={8}><Form layout="vertical"><Form.Item label="重复数据处理"><Select value={conflictPolicy} onChange={setConflictPolicy} options={[{ value: "UPDATE", label: "存在则更新" }, { value: "SKIP", label: "存在则跳过" }, { value: "CREATE_ONLY", label: "只允许新增" }]} /></Form.Item></Form></Col>
        <Col xs={24} lg={8}><Space style={{ marginTop: 30 }}><Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载标准模板</Button><Upload accept=".xlsx,.xls,.csv" showUploadList={false} beforeUpload={parseFile}><Button type="primary" icon={<UploadOutlined />} loading={loading}>上传数据文件</Button></Upload></Space></Col>
      </Row>
      {analysis ? <Descriptions size="small" column={3} bordered items={[{ key: "file", label: "当前文件", children: analysis.batch.sourceFile }, { key: "rows", label: "数据行数", children: analysis.rowCount }, { key: "headers", label: "识别列数", children: headers.length }]} /> : null}

      {template && headers.length ? <Card size="small" title="字段映射" style={{ marginTop: 16 }} extra={<Button type="primary" onClick={() => void runPreview()} loading={loading}>预览校验</Button>}>
        <Typography.Paragraph type="secondary">左侧是系统字段，右侧选择原Excel列。系统会自动识别常见别名，管理员只需修正少量未匹配字段。</Typography.Paragraph>
        <Row gutter={[16, 8]}>{template.fields.map((field) => <Col xs={24} md={12} xl={8} key={field.key}><Form.Item label={<>{field.label}{field.required ? <Typography.Text type="danger"> *</Typography.Text> : null}</>}><Select allowClear showSearch placeholder="选择原文件列" value={Object.entries(mapping).find(([, target]) => target === field.key)?.[0]} options={headers.map((header) => ({ value: header, label: header }))} onChange={(header) => setMapping((current) => {
          const next = Object.fromEntries(Object.entries(current).filter(([, target]) => target !== field.key));
          if (header) next[header] = field.key;
          return next;
        })} /></Form.Item></Col>)}</Row>
      </Card> : null}

      {preview ? <Card size="small" title="预览校验结果" style={{ marginTop: 16 }} extra={<Space><Button disabled={!ignoredSourceRows.size} onClick={() => void restoreSkippedRows()}>恢复已跳过行</Button><Button type="primary" disabled={preview.summary.errors > 0} onClick={() => void commit(preview.batch)}>确认正式迁移</Button></Space>}>
        <Row gutter={12}>{Object.entries({ 总行数: preview.summary.total, 新增: preview.summary.creates, 更新: preview.summary.updates, 跳过: preview.summary.skips, 错误: preview.summary.errors }).map(([label, value]) => <Col key={label}><Card size="small"><Typography.Text type="secondary">{label}</Typography.Text><Typography.Title level={4} style={{ margin: 0 }}>{value}</Typography.Title></Card></Col>)}</Row>
        {preview.summary.errors > 0 ? <Space style={{ marginTop: 12 }}><Typography.Text type="secondary">确认为无效或无需迁移的数据，可勾选错误行后直接跳过并重新校验。</Typography.Text><Button onClick={() => void skipSelectedErrors()} disabled={!selectedErrorRows.length}>跳过选中错误行并重新校验</Button></Space> : null}
        <Table<PreviewRow> rowKey="sourceRow" size="small" style={{ marginTop: 12 }} pagination={{ pageSize: 10 }} dataSource={preview.previewRows} rowSelection={{
          selectedRowKeys: selectedErrorRows,
          onChange: (keys) => setSelectedErrorRows(keys.map(Number)),
          getCheckboxProps: (row) => ({ disabled: row.action !== "ERROR" })
        }} columns={[
          { title: "原始行", dataIndex: "sourceRow", width: 80 },
          { title: "处理动作", dataIndex: "action", width: 100, render: (value: string) => <Tag color={value === "ERROR" ? "red" : value === "CREATE" ? "green" : "blue"}>{value}</Tag> },
          { title: "唯一标识", dataIndex: "uniqueKey", width: 180, ellipsis: true },
          { title: "校验结果", render: (_, row) => row.errors.length ? <Typography.Text type="danger">{row.errors.join("；")}</Typography.Text> : "通过" }
        ]} />
      </Card> : null}
    </ContentCard>

    <ContentCard style={{ marginTop: 16 }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }}><Typography.Title level={4}>迁移批次记录</Typography.Title><Button icon={<ReloadOutlined />} onClick={() => void reload()}>刷新</Button></Space>
      <Table<MigrationBatch> rowKey="id" columns={batchColumns} dataSource={batches} scroll={{ x: 1200 }} pagination={{ pageSize: 10 }} />
    </ContentCard>
  </>;
}
