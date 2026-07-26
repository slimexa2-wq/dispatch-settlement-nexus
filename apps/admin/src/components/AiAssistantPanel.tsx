import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  RobotOutlined,
  SendOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UserOutlined
} from "@ant-design/icons";
import { api, getErrorMessage } from "../lib/api";

type JsonRecord = Record<string, unknown>;
type ChatEntry = { id: string; role: "assistant" | "user"; text: string; payload?: JsonRecord };

const quickActions = [
  { label: "项目人员数据", icon: <DatabaseOutlined />, message: "查询祥能智造示范项目本月入职、离职、当前在职和净增减" },
  { label: "人员信息", icon: <UserOutlined />, message: "查询邱玉彬现在在哪个项目" },
  { label: "招聘进度", icon: <RobotOutlined />, message: "祥能智造示范项目招人的达成情况怎么样" },
  { label: "办理入职", icon: <UserAddOutlined />, message: "给手机号10000000003的人员办理今天入职" },
  { label: "办理离职", icon: <UserDeleteOutlined />, message: "给手机号10000000004的人员办理今天离职，原因是个人原因辞职" }
] as const;

const labels: Record<string, string> = {
  period: "月份",
  branch_name: "分公司",
  project_name: "项目",
  position_name: "岗位",
  hire_count: "入职",
  resignation_count: "离职",
  current_headcount: "当前在职",
  net_change: "净增减",
  demand_count: "需求",
  completed_count: "完成",
  gap: "缺口",
  completion_rate: "完成率",
  registered_count: "报名",
  arrived_count: "到场",
  passed_count: "通过",
  status: "状态",
  onboardDate: "入职日期",
  offboardDate: "离职日期",
  offboardReason: "离职原因",
  projectId: "项目",
  jobTitle: "岗位",
  employeeNo: "员工编号",
  insuranceTypes: "保险"
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "completion_rate") return `${value}%`;
  if (Array.isArray(value)) return value.length ? value.map(String).join("、") : "无";
  if (typeof value === "object") return Object.values(record(value)).filter(Boolean).map(String).join(" · ");
  return String(value);
}

function ResultTable({ data }: { data: JsonRecord[] }) {
  const keys = useMemo(() => Object.keys(data[0] ?? {}).filter((key) => !key.endsWith("_id") && key !== "job_id").slice(0, 8), [data]);
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前条件下暂无记录" />;
  return <Table<JsonRecord>
    size="small"
    pagination={data.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
    rowKey={(item) => String(item.id ?? item.job_id ?? item.project_id ?? item.employee_id ?? JSON.stringify(item))}
    dataSource={data}
    columns={keys.map((key) => ({ title: labels[key] ?? key, dataIndex: key, key, render: (value: unknown) => displayValue(key, value) }))}
    scroll={{ x: true }}
  />;
}

function ClarificationForm({ payload, onSubmit }: { payload: JsonRecord; onSubmit: (parameters: JsonRecord) => void }) {
  const skill = String(payload.skill ?? "");
  const initial = record(payload.extracted_parameters);
  const [values, setValues] = useState<JsonRecord>(initial);
  const fields: Array<[string, string]> = skill === "project_personnel_statistics"
    ? [["project_name", "项目名称"], ["month", "月份（如 2026-07）"]]
    : skill === "employee_information_query"
      ? [["employee_name", "姓名"], ["phone_suffix", "手机号后四位（可选）"]]
      : skill === "recruitment_progress_query"
        ? [["project_name", "项目名称"], ["position_name", "岗位（可选）"]]
        : skill === "employee_entry"
          ? [["employee_name", "姓名"], ["entry_date", "入职日期（YYYY-MM-DD）"]]
          : [["employee_name", "姓名"], ["resignation_date", "离职日期（YYYY-MM-DD）"], ["resignation_reason", "离职原因"]];
  return <Card size="small" title="补充必要信息" className="admin-ai-form-card">
    <Space orientation="vertical" style={{ width: "100%" }}>
      {fields.map(([name, label]) => <Input key={name} placeholder={label} value={String(values[name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />)}
      <Button type="primary" onClick={() => onSubmit(values)}>继续</Button>
    </Space>
  </Card>;
}

function QueryResult({ payload, onCandidate }: { payload: JsonRecord; onCandidate: (employeeId: string) => void }) {
  const result = record(payload.result);
  if (result.match === "ambiguous") {
    return <Card size="small" title="匹配到多位人员，请选择">
      <Space orientation="vertical" style={{ width: "100%" }}>
        {rows(result.candidates).map((candidate) => <Button key={String(candidate.employee_id)} block onClick={() => onCandidate(String(candidate.employee_id))}>
          {String(candidate.name)} · {String(candidate.phone)} · {String(candidate.project_name)}
        </Button>)}
      </Space>
    </Card>;
  }
  const employee = record(result.employee);
  if (Object.keys(employee).length) {
    const project = record(employee.project);
    const supplier = record(employee.supplier);
    return <Descriptions size="small" bordered column={1}>
      <Descriptions.Item label="姓名">{displayValue("name", employee.name)}</Descriptions.Item>
      <Descriptions.Item label="手机号">{displayValue("phone", employee.phone)}</Descriptions.Item>
      <Descriptions.Item label="身份证号">{displayValue("id_card", employee.id_card)}</Descriptions.Item>
      <Descriptions.Item label="员工编号">{displayValue("employee_no", employee.employee_no)}</Descriptions.Item>
      <Descriptions.Item label="状态">{displayValue("status", employee.status)}</Descriptions.Item>
      <Descriptions.Item label="项目">{displayValue("project_name", project.name)}</Descriptions.Item>
      <Descriptions.Item label="岗位">{displayValue("position_name", employee.position_name)}</Descriptions.Item>
      <Descriptions.Item label="供应商/推荐人">{displayValue("supplier", supplier.name ?? employee.recommender_name)}</Descriptions.Item>
      <Descriptions.Item label="入职/离职">{displayValue("date", `${employee.onboard_date ?? "—"} / ${employee.offboard_date ?? "—"}`)}</Descriptions.Item>
    </Descriptions>;
  }
  const totals = record(result.totals);
  return <Space orientation="vertical" style={{ width: "100%" }}>
    {Object.keys(totals).length ? <div className="admin-ai-totals">{Object.entries(totals).map(([key, value]) => <div key={key}><span>{labels[key] ?? key}</span><strong>{displayValue(key, value)}</strong></div>)}</div> : null}
    <ResultTable data={rows(result.rows)} />
    {result.methodology ? <Alert type="info" showIcon title={`统计口径：${String(result.methodology)}`} /> : null}
    {result.updated_at ? <Typography.Text type="secondary">数据更新时间：{new Date(String(result.updated_at)).toLocaleString("zh-CN")}</Typography.Text> : null}
  </Space>;
}

function KnowledgeResult({ payload }: { payload: JsonRecord }) {
  const result = record(payload.result);
  const records = rows(result.records);
  return <Space orientation="vertical" style={{ width: "100%" }}>
    {records.slice(0, 20).map((item, index) => <Card key={`${String(item.type)}-${String(item.title)}-${index}`} size="small" title={<Space><Tag color="blue">{item.type === "project" ? "项目" : item.type === "job" ? "岗位" : item.type === "supplier" ? "供应商" : "总览"}</Tag>{String(item.title)}</Space>}>
      <Descriptions size="small" column={2}>{Object.entries(record(item.fields)).map(([key, value]) => <Descriptions.Item key={key} label={key}>{displayValue(key, value)}</Descriptions.Item>)}</Descriptions>
    </Card>)}
    {result.methodology ? <Alert type="info" showIcon title={String(result.methodology)} /> : null}
    {result.updated_at ? <Typography.Text type="secondary">数据更新时间：{new Date(String(result.updated_at)).toLocaleString("zh-CN")}</Typography.Text> : null}
  </Space>;
}

export function AiAssistantPanel({ compact = false }: { compact?: boolean }) {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: "welcome", role: "assistant", text: "您好，我是祥能AI业务助手。查询结果来自当前权限范围内的系统业务数据；入职和离职必须先预览，再由您点击确认。" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<JsonRecord | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void api.get<JsonRecord>("/ai/health").then(setHealth).catch((error) => setHealth({ status: "degraded", message: getErrorMessage(error) }));
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy]);

  const send = async (message: string, parameters: JsonRecord = {}) => {
    const text = message.trim();
    if (!text || busy) return;
    setEntries((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const payload = await api.post<JsonRecord>("/ai/chat", { message: text, parameters });
      const reply = payload.type === "knowledge_result"
        ? String(payload.answer ?? "已从当前权限范围检索到相关业务数据。")
        : payload.type === "query_result"
        ? "已按您的权限范围完成实时查询。"
        : payload.type === "action_preview"
          ? "已生成写操作预览，尚未修改数据库。请核对后确认。"
          : String(payload.message ?? "请补充必要信息后继续。");
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: reply, payload }]);
    } catch (error) {
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: getErrorMessage(error), payload: { type: "error" } }]);
    } finally {
      setBusy(false);
    }
  };

  const updatePayload = (entryId: string, patch: JsonRecord) => setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, payload: { ...entry.payload, ...patch } } : entry));

  const confirm = async (entry: ChatEntry) => {
    const preview = record(entry.payload?.preview);
    setBusy(true);
    try {
      const result = await api.post<JsonRecord>("/ai/actions/confirm", {
        actionId: preview.action_id,
        actionToken: preview.action_token,
        idempotencyKey: crypto.randomUUID()
      });
      updatePayload(entry.id, { confirmed: true });
      const successText = health?.database === "demo_snapshot"
        ? "操作已同步到演示业务状态并记录审计信息；连接正式后端时使用数据库事务执行。"
        : "操作已通过正式业务服务事务执行并写入审计日志。";
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: result.status === "EXECUTED" ? successText : `操作状态：${String(result.status)}`, payload: { type: "action_result", result } }]);
    } catch (error) {
      setEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: getErrorMessage(error), payload: { type: "error" } }]);
    } finally {
      setBusy(false);
    }
  };

  const renderPayload = (entry: ChatEntry) => {
    const payload = entry.payload;
    if (!payload) return null;
    const type = String(payload.type ?? "");
    if (type === "query_result") return <QueryResult payload={payload} onCandidate={(employeeId) => void send(entry.text, { employee_id: employeeId })} />;
    if (type === "knowledge_result") return <KnowledgeResult payload={payload} />;
    if (type === "clarification") return <ClarificationForm payload={payload} onSubmit={(parameters) => void send(entry.text, parameters)} />;
    if (type === "unsupported") return <Alert type="warning" showIcon title={String(payload.message ?? "当前仅支持五项业务能力")} />;
    if (type === "error") return <Alert type="error" showIcon title="请求未执行，传统系统不受影响" />;
    if (type === "action_preview") {
      const preview = record(payload.preview);
      if (payload.cancelled) return <Alert type="info" showIcon title="本次预览已取消，数据库未发生变化" />;
      if (payload.confirmed) return <Alert type="success" showIcon title="已确认并执行" />;
      return <Card size="small" title="写操作预览（尚未写库）" className="admin-ai-preview">
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="人员">{displayValue("person", record(preview.person).name)}</Descriptions.Item>
          <Descriptions.Item label="操作前">{displayValue("before", preview.before)}</Descriptions.Item>
          <Descriptions.Item label="操作后">{displayValue("after", preview.after)}</Descriptions.Item>
          <Descriptions.Item label="影响范围">{displayValue("impact", preview.impact_scope)}</Descriptions.Item>
          <Descriptions.Item label="预览有效期">{preview.expires_at ? new Date(String(preview.expires_at)).toLocaleString("zh-CN") : "—"}</Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 12 }}>
          <Button onClick={() => updatePayload(entry.id, { cancelled: true })}>取消</Button>
          <Button type="primary" danger loading={busy} onClick={() => void confirm(entry)}>确认执行</Button>
        </Space>
      </Card>;
    }
    if (type === "action_result") return <Alert type="success" showIcon title="事务执行成功" />;
    return null;
  };

  return <div className={`admin-ai-panel${compact ? " admin-ai-panel-compact" : ""}`}>
    <div className="admin-ai-status">
      <Space><RobotOutlined /><Typography.Text strong>祥能AI业务助手</Typography.Text></Space>
      <Tag color={health?.status === "ok" ? "success" : health?.retrieval === "ok" ? "processing" : "warning"}>{health?.status === "ok" ? `本地模型在线 · ${String(health.model_name ?? "Qwen3.5 4B")}` : health?.retrieval === "ok" ? "演示业务检索在线 · Qwen后端可切换" : "降级表单可用"}</Tag>
    </div>
    <div className="admin-ai-quick">{quickActions.map((item) => <Button key={item.label} icon={item.icon} onClick={() => void send(item.message)}>{item.label}</Button>)}</div>
    <div className="admin-ai-chat">
      {entries.map((entry) => <div key={entry.id} className={`admin-ai-message admin-ai-message-${entry.role}`}>
        <div className="admin-ai-bubble">{entry.text}</div>
        {entry.role === "assistant" ? renderPayload(entry) : null}
      </div>)}
      {busy ? <div className="admin-ai-loading"><Spin size="small" /> 本地模型/业务工具处理中…</div> : null}
      <div ref={endRef} />
    </div>
    <div className="admin-ai-input">
      <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={input} placeholder="可输入任意姓名、手机号、项目、岗位或供应商问题" onChange={(event) => setInput(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void send(input); } }} />
      <Button type="primary" icon={busy ? <Spin size="small" /> : <SendOutlined />} disabled={busy || !input.trim()} onClick={() => void send(input)} />
    </div>
    <Typography.Text type="secondary" className="admin-ai-footnote"><CheckCircleOutlined /> 模型只理解意图；查数、权限、事务和审计由程序执行。</Typography.Text>
  </div>;
}
