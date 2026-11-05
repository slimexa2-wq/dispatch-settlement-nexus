import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Bot, BriefcaseBusiness, Check, ChevronRight, CircleAlert, Database,
  LoaderCircle, MessageSquareText, RotateCcw, Send, Sparkles, UserRound, UserRoundCheck, UserRoundX, X
} from 'lucide-react';
import { handlePortalDemoRequest } from '../../app/demo';

type JsonObject = Record<string, any>;
type ChatItem = { id: string; role: 'assistant' | 'user'; text: string; payload?: JsonObject };

const coreBase = (import.meta.env.VITE_CORE_API_URL as string | undefined) ?? '/api';
const demoFallbackEnabled = (import.meta.env.VITE_PORTAL_DEMO_FALLBACK as string | undefined) !== 'false';
let tokenPromise: Promise<string> | null = null;

async function coreRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token: string;
  try {
    const existing = sessionStorage.getItem('xiangneng_core_token');
    token = existing || await ensureDemoToken();
  } catch (error) {
    if (demoFallbackEnabled) return handlePortalDemoRequest<T>(`/api${path}`, init);
    throw error;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${coreBase}${path}`, { ...init, headers });
  } catch (error) {
    if (demoFallbackEnabled) return handlePortalDemoRequest<T>(`/api${path}`, init);
    throw error;
  }
  const value = await response.json().catch(() => ({})) as JsonObject;
  if (demoFallbackEnabled && (response.status === 404 || response.status >= 500)) {
    return handlePortalDemoRequest<T>(`/api${path}`, init);
  }
  if (!response.ok) throw new Error(value.error?.message ?? `AI 服务请求失败（${response.status}）`);
  return value.data as T;
}

async function ensureDemoToken(): Promise<string> {
  const existing = sessionStorage.getItem('xiangneng_core_token');
  if (existing) return existing;
  if (!tokenPromise) {
    tokenPromise = fetch(`${coreBase}/auth/demo-login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: 'operator' })
    }).then(async (response) => {
      const value = await response.json() as JsonObject;
      if (!response.ok || !value.data?.token) throw new Error(value.error?.message ?? '演示身份初始化失败');
      sessionStorage.setItem('xiangneng_core_token', value.data.token);
      return value.data.token as string;
    }).finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

const WELCOME: ChatItem = { id: 'welcome', role: 'assistant', text: '您好，我是祥能 AI 业务助手。我只在您的权限范围内查询数据；入职和离职会先生成预览，确认后才执行。' };
const STATE_KEY = 'xiangneng_portal_ai_state_v1';
const CONV_KEY = 'xiangneng_portal_ai_conv_v1';

type PersistedState = { messages: ChatItem[]; actionStatuses: Record<string, 'cancelled' | 'executed'> };

function loadPersisted(): PersistedState {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (Array.isArray(parsed.messages) && parsed.messages.length) {
        return { messages: parsed.messages, actionStatuses: parsed.actionStatuses ?? {} };
      }
    }
  } catch { /* 忽略损坏的存储 */ }
  return { messages: [WELCOME], actionStatuses: {} };
}

function savePersisted(messages: ChatItem[], actionStatuses: Record<string, 'cancelled' | 'executed'>) {
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ messages, actionStatuses })); } catch { /* 忽略写入失败 */ }
}

function getConversationId(): string {
  let id = sessionStorage.getItem(CONV_KEY);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(CONV_KEY, id); }
  return id;
}

const quickActions = [
  { label: '查项目人员', icon: Database, text: '查询祥能智造示范项目本月入职、离职、当前在职和净增减' },
  { label: '查人员信息', icon: UserRound, text: '查询邱玉彬现在在哪个项目' },
  { label: '查招聘进度', icon: BriefcaseBusiness, text: '查询祥能智造示范项目还差多少人' },
  { label: '办理入职', icon: UserRoundCheck, text: '给手机号10000000003的人员办理今天入职' },
  { label: '办理离职', icon: UserRoundX, text: '给手机号10000000004的人员办理今天离职，原因是个人原因辞职' }
] as const;

const labels: Record<string, string> = {
  period: '月份', branch_name: '分公司', project_name: '项目', position_name: '岗位',
  hire_count: '入职', resignation_count: '离职', current_headcount: '当前在职', net_change: '净增减',
  demand_count: '需求', completed_count: '完成', gap: '缺口', completion_rate: '完成率',
  registered_count: '报名', arrived_count: '到场', passed_count: '通过', deadline: '截止日期',
  status: '状态', onboardDate: '入职日期', offboardDate: '离职日期', offboardReason: '离职原因',
  projectId: '项目', jobTitle: '岗位', employeeNo: '员工编号', insuranceTypes: '保险'
};

function valueText(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (key === 'completion_rate') return `${value}%`;
  if (Array.isArray(value)) return value.length ? value.join('、') : '无';
  if (typeof value === 'object') return Object.values(value as JsonObject).filter(Boolean).join(' · ');
  return String(value);
}

function ResultTable({ rows }: { rows: JsonObject[] }) {
  const columns = useMemo(() => Object.keys(rows[0] ?? {}).filter((key) => !key.endsWith('_id') && key !== 'job_id').slice(0, 7), [rows]);
  if (!rows.length) return <div className="ai-empty">当前条件下暂无记录</div>;
  return <div className="ai-table-wrap"><table className="ai-table"><thead><tr>{columns.map((key) => <th key={key}>{labels[key] ?? key}</th>)}</tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={row.job_id ?? row.project_id ?? `${index}`} >{columns.map((key) => <td key={key}>{valueText(key, row[key])}</td>)}</tr>)}</tbody></table>{rows.length > 10 && <small>已显示前 10 条，共 {rows.length} 条</small>}</div>;
}

function Totals({ totals }: { totals?: JsonObject }) {
  if (!totals) return null;
  return <div className="ai-totals">{Object.entries(totals).map(([key, value]) => <div key={key}><span>{labels[key] ?? key}</span><strong>{valueText(key, value)}</strong></div>)}</div>;
}

function QueryResult({ payload, onCandidate }: { payload: JsonObject; onCandidate: (id: string) => void }) {
  const result = payload.result ?? {};
  if (result.match === 'ambiguous') {
    return <div className="ai-result-card"><strong>匹配到多位人员，请选择</strong><div className="ai-candidates">{result.candidates?.map((item: JsonObject) => <button type="button" key={item.employee_id} onClick={() => onCandidate(item.employee_id)}><span><b>{item.name}</b><small>{item.phone} · {item.project_name} · {item.position_name}</small></span><ChevronRight size={16} /></button>)}</div></div>;
  }
  if (result.employee) {
    const employee = result.employee;
    return <div className="ai-result-card ai-person-result"><div className="ai-person-title"><span><UserRound size={19} /></span><div><strong>{employee.name}</strong><small>{employee.phone} · {employee.employee_no ?? '暂无员工编号'}</small></div><em>{employee.status}</em></div><dl><div><dt>身份证号</dt><dd>{employee.id_card}</dd></div><div><dt>项目</dt><dd>{employee.project?.name}</dd></div><div><dt>分公司</dt><dd>{employee.project?.branch_name}</dd></div><div><dt>岗位</dt><dd>{employee.position_name}</dd></div><div><dt>入职日期</dt><dd>{employee.onboard_date ?? '—'}</dd></div><div><dt>离职日期</dt><dd>{employee.offboard_date ?? '—'}</dd></div><div><dt>供应商</dt><dd>{employee.supplier?.name ?? '祥能自招'}</dd></div></dl></div>;
  }
  return <div className="ai-result-card"><Totals totals={result.totals} />{Array.isArray(result.rows) && <ResultTable rows={result.rows} />}{result.methodology && <p className="ai-method"><CircleAlert size={14} />口径：{result.methodology}</p>}{result.updated_at && <small className="ai-updated">更新时间：{new Date(result.updated_at).toLocaleString('zh-CN')}</small>}</div>;
}

function KnowledgeResult({ payload }: { payload: JsonObject }) {
  const result = payload.result ?? {};
  const records = Array.isArray(result.records) ? result.records as JsonObject[] : [];
  return <div className="ai-result-card ai-knowledge-result">
    <div className="ai-knowledge-list">{records.slice(0, 12).map((record, index) => <section key={`${record.type}-${record.title}-${index}`}>
      <div><span>{record.type === 'project' ? '项目' : record.type === 'job' ? '岗位' : record.type === 'supplier' ? '供应商' : '数据总览'}</span><strong>{record.title}</strong></div>
      <dl>{Object.entries(record.fields ?? {}).slice(0, 10).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{valueText(key, value)}</dd></div>)}</dl>
    </section>)}</div>
    {records.length > 12 && <small>已展示最相关的 12 条，共检索到 {records.length} 条记录。</small>}
    {result.methodology && <p className="ai-method"><CircleAlert size={14} />{result.methodology}</p>}
    {result.updated_at && <small className="ai-updated">更新时间：{new Date(result.updated_at).toLocaleString('zh-CN')}</small>}
  </div>;
}

function ActionPreview({ preview, onConfirm, onCancel, busy, status }: { preview: JsonObject; onConfirm: () => void; onCancel: () => void; busy: boolean; status?: 'cancelled' | 'executed' }) {
  return <div className="ai-result-card ai-preview"><div className="ai-preview-head"><span><CircleAlert size={18} /></span><div><strong>请确认本次操作</strong><small>{preview.person?.name} · {preview.person?.project_name} · {preview.person?.position_name}</small></div></div><div className="ai-diff"><section><b>操作前</b>{Object.entries(preview.before ?? {}).map(([key, value]) => <p key={key}><span>{labels[key] ?? key}</span><em>{valueText(key, value)}</em></p>)}</section><ChevronRight /><section><b>操作后</b>{Object.entries(preview.after ?? {}).map(([key, value]) => <p key={key}><span>{labels[key] ?? key}</span><em>{valueText(key, value)}</em></p>)}</section></div><p className="ai-impact">影响：{preview.impact_scope?.join('、')}</p><div className="ai-preview-actions"><button type="button" onClick={onCancel} disabled={busy || Boolean(status)}>{status === 'cancelled' ? '已取消' : '取消'}</button><button type="button" className="primary" onClick={onConfirm} disabled={busy || Boolean(status)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{status === 'executed' ? '已执行' : '确认执行'}</button></div><small className="ai-expiry">预览有效至 {new Date(preview.expires_at).toLocaleTimeString('zh-CN')}</small></div>;
}

function MessagePayload({ item, onCandidate, onConfirm, onCancel, busy, actionStatuses }: { item: ChatItem; onCandidate: (id: string) => void; onConfirm: (preview: JsonObject) => void; onCancel: (preview: JsonObject) => void; busy: boolean; actionStatuses: Record<string, 'cancelled' | 'executed'> }) {
  const payload = item.payload;
  if (!payload) return null;
  if (payload.type === 'query_result') return <QueryResult payload={payload} onCandidate={onCandidate} />;
  if (payload.type === 'knowledge_result') return <KnowledgeResult payload={payload} />;
  if (payload.type === 'action_preview') return <ActionPreview preview={payload.preview} onConfirm={() => onConfirm(payload.preview)} onCancel={() => onCancel(payload.preview)} busy={busy} status={actionStatuses[payload.preview.action_id]} />;
  if (payload.type === 'clarification' || payload.type === 'unsupported') return <div className="ai-result-card ai-clarify"><CircleAlert size={17} /><p>{payload.message}</p><small>可补充人员姓名、项目、日期或离职原因后重新发送。</small></div>;
  if (payload.status === 'EXECUTED') return <div className="ai-result-card ai-success"><Check size={20} /><div><strong>操作已成功完成</strong><small>业务数据、生命周期与审计日志已同步更新。</small></div></div>;
  return null;
}

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<JsonObject | null>(null);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'cancelled' | 'executed'>>(() => loadPersisted().actionStatuses);
  const [messages, setMessages] = useState<ChatItem[]>(() => loadPersisted().messages);
  const lastQuestion = useMemo(() => [...messages].reverse().find((m) => m.role === 'user')?.text ?? '', [messages]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) void loadHealth(); }, [open]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { savePersisted(messages, actionStatuses); }, [messages, actionStatuses]);

  async function loadHealth() {
    try { setHealth(await coreRequest<JsonObject>('/ai/health')); }
    catch { setHealth({ status: 'degraded', model: 'unavailable', database: 'unavailable' }); }
  }

  async function send(question = input, parameters: JsonObject = {}) {
    const text = question.trim();
    if (!text || busy) return;
    setInput(''); setBusy(true);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'user', text }]);
    try {
      const response = await coreRequest<JsonObject>('/ai/chat', { method: 'POST', body: JSON.stringify({ message: text, conversationId: getConversationId(), parameters }) });
      const answer = response.type === 'knowledge_result' ? response.answer : response.type === 'query_result' ? '已按当前权限范围查询完成。' : response.type === 'action_preview' ? '已生成操作预览，尚未修改业务数据。' : response.message ?? '请补充信息后继续。';
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: answer, payload: response }]);
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: error instanceof Error ? error.message : 'AI 服务暂不可用，请稍后重试。', payload: { type: 'clarification', message: '本地模型或业务服务暂不可用，您可以稍后重试或使用传统页面。' } }]);
    } finally { setBusy(false); }
  }

  async function confirm(preview: JsonObject) {
    setBusy(true);
    try {
      const result = await coreRequest<JsonObject>('/ai/actions/confirm', {
        method: 'POST', body: JSON.stringify({ actionId: preview.action_id, actionToken: preview.action_token, idempotencyKey: `${crypto.randomUUID().replaceAll('-', '')}ui` })
      });
      setActionStatuses((items) => ({ ...items, [preview.action_id]: 'executed' }));
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: '操作已完成。', payload: result }]);
    } catch (error) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: error instanceof Error ? error.message : '确认失败，请重新预览。' }]);
    } finally { setBusy(false); }
  }

  const cancel = (preview: JsonObject) => {
    setActionStatuses((items) => ({ ...items, [preview.action_id]: 'cancelled' }));
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: '已取消，本次预览没有修改任何业务数据。' }]);
  };

  const clearConversation = () => {
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(CONV_KEY);
    setMessages([WELCOME]);
    setActionStatuses({});
  };

  return <>
    <button className="ai-fab" type="button" onClick={() => setOpen(true)} aria-label="打开祥能AI业务助手"><Sparkles size={20} /><span>祥能AI业务助手</span></button>
    {open && <div className="ai-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="ai-drawer" role="dialog" aria-modal="true" aria-label="祥能AI业务助手">
        <header className="ai-drawer-header"><div className="ai-brand-icon"><Bot size={23} /></div><div><strong>祥能AI业务助手</strong><span>Qwen3.5 4B · 本地安全运行</span></div><div className={`ai-health ${health?.status === 'ok' || health?.retrieval === 'ok' ? 'ok' : 'warn'}`} title="查看健康状态"><Activity size={14} />{health?.status === 'ok' ? '模型与数据在线' : health?.retrieval === 'ok' ? '业务检索在线' : health ? '表单可用' : '检查中'}</div><button type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={21} /></button></header>
        <section className="ai-quick"><p>快捷能力</p><div>{quickActions.map((action) => <button type="button" key={action.label} onClick={() => void send(action.text)} disabled={busy}><action.icon size={16} />{action.label}</button>)}</div></section>
        <section className="ai-messages">{messages.map((item) => <article key={item.id} className={`ai-message ai-message--${item.role}`}><div className="ai-message-avatar">{item.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}</div><div className="ai-message-body"><p>{item.text}</p><MessagePayload item={item} onCandidate={(id) => void send(lastQuestion, { employee_id: id })} onConfirm={(preview) => void confirm(preview)} onCancel={cancel} busy={busy} actionStatuses={actionStatuses} /></div></article>)}{busy && <article className="ai-message ai-message--assistant"><div className="ai-message-avatar"><Bot size={17} /></div><div className="ai-typing"><i /><i /><i /></div></article>}<div ref={endRef} /></section>
        <footer className="ai-composer"><div className="ai-safety"><Database size={13} />后端在线时查正式业务库；离线演示查当前业务快照 · 写操作须确认 · 全程审计</div><form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="可输入任意姓名、手机号、项目、岗位或供应商问题" rows={1} /><button type="submit" disabled={!input.trim() || busy} aria-label="发送"><Send size={18} /></button></form><button className="ai-reset" type="button" onClick={async () => { if (!window.confirm('确认恢复 AI 演示写操作前的数据吗？')) return; setBusy(true); try { const result = await coreRequest<JsonObject>('/ai/demo/reset', { method: 'POST', body: '{}' }); setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: `演示数据已恢复，共恢复 ${result.restored_people} 人。` }]); } finally { setBusy(false); } }}><RotateCcw size={13} />重置演示写操作</button><button className="ai-reset" type="button" onClick={() => { if (window.confirm('确认清空当前对话记录吗？此操作仅清空本地显示，不影响业务数据。')) clearConversation(); }}><RotateCcw size={13} />清空对话</button></footer>
      </aside>
    </div>}
  </>;
}
