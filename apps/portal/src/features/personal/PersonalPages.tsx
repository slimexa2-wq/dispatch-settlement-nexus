import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Bookmark, BriefcaseBusiness, CalendarClock, Check, ChevronRight, CircleDollarSign,
  Clock3, FileText, Gift, Headphones, HelpCircle, MapPin, MessageSquareText, Phone,
  Send, Settings, Share2, ShieldCheck, Star, UserRound, UsersRound, WalletCards
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, jsonBody } from '../../app/api';
import { formatSalaryRange } from '../../app/format';
import type { Job, MessageItem, Person, Session } from '../../app/types';
import { Avatar } from '../../components/Avatar';
import { DetailLine, JobCard } from '../../components/DataCards';
import { StatusTag } from '../../components/StatusTag';
import { Card, EmptyState, Field, FilterSelect, LoadingScreen, Modal, PageHeader, SearchInput } from '../../components/Ui';

interface Catalog { projects: Array<{ id: string; name: string; region: string }>; }

export function PersonalHome({ session }: { session: Session }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [salary, setSalary] = useState('');
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const queryClient = useQueryClient();
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (type) params.set('jobType', type);
  if (region) params.set('region', region);
  if (salary) params.set('salary', salary);
  const jobs = useQuery({ queryKey: ['jobs', query, type, region, salary], queryFn: () => api<Job[]>(`/api/jobs?${params}`) });
  const apply = useMutation({
    mutationFn: (jobId: string) => api(`/api/jobs/${jobId}/apply`, { method: 'POST' }),
    onSuccess: async () => { setApplyJob(null); await queryClient.invalidateQueries({ queryKey: ['messages'] }); }
  });

  return <>
    <section className="recruit-banner">
      <div><span>2026 夏季招聘</span><h1>祥能未来计划</h1><p>寻找发光的你</p></div>
      <div className="banner-people"><UsersRound /><i /><i /></div>
    </section>
    <SearchInput value={query} onChange={setQuery} placeholder="搜索岗位、项目或工作地点" />
    <div className="filter-row">
      <FilterSelect label="岗位类型" value={type} onChange={setType} options={[{ label: '操作工', value: '操作工' }, { label: '质检', value: '质检' }, { label: '技术岗', value: '技术岗' }, { label: '仓储', value: '仓储' }]} />
      <FilterSelect label="区域" value={region} onChange={setRegion} options={[{ label: '宜宾市', value: '四川省宜宾市' }, { label: '泸州市', value: '四川省泸州市' }, { label: '成都市', value: '四川省成都市' }, { label: '绵阳市', value: '四川省绵阳市' }]} />
      <FilterSelect label="薪资范围" value={salary} onChange={setSalary} options={[{ label: '4–6K', value: '4000-6000' }, { label: '6–8K', value: '6000-8000' }, { label: '8K以上', value: '8000-' }]} />
    </div>
    <div className="row row--between"><h2 className="section-title">热门岗位</h2><span className="small muted">共 {jobs.data?.length ?? 0} 个岗位</span></div>
    {jobs.isLoading ? <LoadingScreen /> : jobs.data?.length ? <div className="job-list">{jobs.data.map((job) => <JobCard key={job.id} job={job} onApply={setApplyJob} />)}</div> : <EmptyState title="没有匹配岗位" detail="调整搜索或筛选条件后再试试" />}
    <Modal open={Boolean(applyJob)} title="确认报名" onClose={() => setApplyJob(null)} footer={<><button className="ghost-button" type="button" onClick={() => setApplyJob(null)}>暂不报名</button><button className="primary-button" type="button" disabled={apply.isPending} onClick={() => applyJob && apply.mutate(applyJob.id)}>{apply.isPending ? '提交中…' : '确认报名'}</button></>}>
      {apply.isSuccess ? <div className="success-state"><Check /><strong>报名成功</strong><p>后续面试和入职进度会通过消息中心通知。</p></div> : <div className="confirm-job"><BriefcaseBusiness /><div><strong>{applyJob?.title}</strong><p>{applyJob?.projectName} · {applyJob?.region}</p></div>{apply.error && <p className="form-error">{apply.error.message}</p>}</div>}
    </Modal>
  </>;
}

export function PersonalJobDetail() {
  const { id = '' } = useParams();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/api/jobs/${id}`) });
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api<Job[]>('/api/favorites') });
  const favorite = useMutation({ mutationFn: () => api<{ favorite: boolean }>(`/api/favorites/${id}`, { method: 'PUT' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }) });
  const apply = useMutation({ mutationFn: () => api(`/api/jobs/${id}/apply`, { method: 'POST' }), onSuccess: () => setConfirmOpen(false) });
  if (job.isLoading) return <LoadingScreen />;
  if (!job.data) return <EmptyState title="岗位不存在" detail="该岗位可能已关闭或删除" />;
  const item = job.data;
  return <div className="detail-page-with-bar">
    <PageHeader title="岗位详情" back action={<button className={`icon-button ${favorites.data?.some((saved) => saved.id === id) ? 'is-saved' : ''}`} type="button" aria-label="收藏岗位" onClick={() => favorite.mutate()}><Star size={20} fill={favorites.data?.some((saved) => saved.id === id) ? 'currentColor' : 'none'} /></button>} />
    <div className={`job-hero job-thumb--${item.imageKey}`} style={{ backgroundImage: `linear-gradient(180deg, rgba(7,34,76,.03), rgba(7,34,76,.72)), url(${item.imageUrl})` }}><div><span>{item.projectName}</span><strong>{item.title}</strong></div><span>项目实景</span></div>
    <Card className="job-detail-card">
      <div className="job-detail-title"><div><h1>{item.title}</h1><p>{item.projectName}</p></div><strong>{formatSalaryRange(item.salary_min, item.salary_max)}</strong></div>
      <div className="tag-cloud"><span>包住</span><span>{item.work_time.split(' ')[0]}</span><span>{item.type}</span><span>提供宿舍</span></div>
    </Card>
    <Card className="detail-section">
      <DetailLine icon="map" label="工作地点" value={item.address} />
      <DetailLine icon="users" label="招聘人数" value={`${item.headcount}人`} />
      <DetailLine icon="time" label="工作时间" value={item.work_time} />
      <DetailLine label="报名截止" value={item.deadline} />
    </Card>
    <Card className="detail-section rich-detail">
      <h2>项目介绍</h2><p>{item.projectDescription}</p>
      <h2>岗位要求</h2><p>{item.requirements}</p>
      <h2>岗位职责</h2><p>{item.duties}</p>
      <h2>福利待遇</h2><p>{item.benefits}</p>
      <h2>推荐政策</h2><p>{item.referral_policy}</p>
      <h2>项目负责人</h2><p>{item.managerName} · {item.managerPhone}</p>
    </Card>
    <div className="fixed-action-bar"><a className="secondary-button" href={`tel:${item.managerPhone}`}><Phone size={16} />联系负责人</a><button className="primary-button" type="button" onClick={() => setConfirmOpen(true)}>立即报名</button><button className="secondary-button" type="button" onClick={() => navigator.share?.({ title: `${item.projectName} · ${item.title}`, text: formatSalaryRange(item.salary_min, item.salary_max, false), url: location.href })}><Share2 size={16} />转发推荐</button></div>
    <Modal open={confirmOpen} title="报名确认" onClose={() => setConfirmOpen(false)} footer={<button className="primary-button" type="button" disabled={apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? '提交中…' : '确认报名'}</button>}><p>确认报名“{item.projectName} · {item.title}”吗？</p>{apply.error && <p className="form-error">{apply.error.message}</p>}</Modal>
  </div>;
}

const messageTabs = [{ label: '全部', value: '' }, { label: '招聘进度', value: 'application' }, { label: '工资通知', value: 'payroll' }, { label: '面试安排', value: 'interview' }, { label: '推荐奖励', value: 'referral' }];

export function MessagesPage({ portal = 'personal' }: { portal?: 'personal' | 'supplier' | 'internal' }) {
  const [tab, setTab] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api<MessageItem[]>('/api/messages') });
  const markRead = useMutation({ mutationFn: (id: string) => api(`/api/messages/${id}/read`, { method: 'PATCH' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }) });
  const markAllRead = useMutation({ mutationFn: () => api('/api/messages/read-all', { method: 'PATCH' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }) });
  const items = messages.data?.filter((message) => !tab || message.type === tab) ?? [];
  return <>
    <PageHeader title="消息中心" back action={<button type="button" className="text-button" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>{markAllRead.isPending ? '处理中…' : '全部已读'}</button>} />
    <div className="message-tabs">{messageTabs.map((item) => <button key={item.value} type="button" className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label}</button>)}</div>
    {messages.isLoading ? <LoadingScreen /> : items.length ? <div className="message-list">{items.map((message) => <button type="button" key={message.id} className={`message-row ${message.isRead ? '' : 'unread'}`} onClick={() => { markRead.mutate(message.id); navigate(message.targetPath.replace('/personal', `/${portal}`)); }}><span className={`message-icon message-icon--${message.type}`}><Bell /></span><div><div><strong>{message.title}</strong><time>{new Date(message.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</time></div><p>{message.content}</p></div>{!message.isRead && <i />}</button>)}</div> : <EmptyState title="暂无消息" detail="新的业务通知会出现在这里" />}
  </>;
}

interface Referral { id: string; name: string; phone: string; projectName: string; jobTitle: string; status: string; reward: number; rewardStatus: string; createdAt: string; onboardDate?: string; }

export function ReferralPage({ session }: { session: Session }) {
  const [open, setOpen] = useState(false); const [rulesOpen, setRulesOpen] = useState(false);
  const queryClient = useQueryClient();
  const referrals = useQuery({ queryKey: ['referrals'], queryFn: () => api<Referral[]>('/api/referrals') });
  const jobs = useQuery({ queryKey: ['jobs', 'referral'], queryFn: () => api<Job[]>('/api/jobs?status=recruiting') });
  const create = useMutation({ mutationFn: (data: Record<string, string>) => api('/api/referrals', { method: 'POST', ...jsonBody(data) }), onSuccess: async () => { setOpen(false); await queryClient.invalidateQueries({ queryKey: ['referrals'] }); } });
  const earned = referrals.data?.filter((item) => item.rewardStatus === 'earned').reduce((sum, item) => sum + item.reward, 0) ?? 0;
  return <>
    <PageHeader title="推荐" action={<button type="button" className="text-button" onClick={() => setRulesOpen(true)}>推荐规则</button>} />
    <section className="referral-banner"><div><h1>推荐好友来祥能入职<br />赚丰厚奖励</h1><button className="banner-button" type="button" onClick={() => setOpen(true)}>去推荐</button></div><Gift /></section>
    <div className="referral-stats"><div><strong>{referrals.data?.length ?? 0}</strong><span>已推荐(人)</span></div><div><strong>{referrals.data?.filter((item) => item.status === 'employed').length ?? 0}</strong><span>已入职(人)</span></div><div><strong>¥{earned.toLocaleString()}</strong><span>已获奖励(元)</span></div></div>
    <div className="row row--between"><h2 className="section-title">推荐记录</h2><span className="small muted">全部 <ChevronRight size={13} /></span></div>
    {referrals.isLoading ? <LoadingScreen /> : referrals.data?.length ? <div className="referral-list">{referrals.data.map((item) => <Card className="referral-row" key={item.id}><Avatar name={item.name} /><div><div><strong>{item.name}</strong><span>{item.phone}</span><StatusTag status={item.status} /></div><p>推荐岗位：{item.jobTitle}</p><p>推荐时间：{item.createdAt.slice(0,10)}　入职时间：{item.onboardDate ?? '—'}</p></div></Card>)}</div> : <EmptyState title="还没有推荐记录" detail="推荐好友入职可获得对应政策奖励" action={<button className="primary-button" type="button" onClick={() => setOpen(true)}>立即推荐</button>} />}
    <ReferralForm open={open} onClose={() => setOpen(false)} jobs={jobs.data ?? []} submitting={create.isPending} error={create.error?.message} onSubmit={(data) => create.mutate(data)} />
    <Modal open={rulesOpen} title="推荐规则" onClose={() => setRulesOpen(false)}><Card className="rich-detail"><h2>{session.personStatus === 'employed' ? '内部员工推荐政策' : '社会推荐政策'}</h2><p>{session.personStatus === 'employed' ? (jobs.data?.[0]?.referral_policy ?? '推荐人员入职满30天后按岗位政策发放奖励。') : '被推荐人达到岗位政策规定的在职条件后，推荐奖励进入待发放状态。'}</p><h2>奖励进度</h2><p>报名、面试、入职与奖励发放状态会在推荐记录中同步更新。</p></Card></Modal>
  </>;
}

function ReferralForm({ open, onClose, jobs, onSubmit, submitting, error }: { open: boolean; onClose: () => void; jobs: Job[]; onSubmit: (data: Record<string, string>) => void; submitting: boolean; error?: string | undefined }) {
  const [form, setForm] = useState({ name: '', phone: '', idCard: '', jobId: '' });
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(form); };
  return <Modal open={open} title="填写被推荐人信息" onClose={onClose} footer={<button type="submit" form="referral-form" className="primary-button" disabled={submitting}>{submitting ? '提交中…' : '提交推荐'}</button>}><form id="referral-form" className="form-grid" onSubmit={submit}><Field label="姓名" required><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="请输入真实姓名" /></Field><Field label="手机号" required><input required inputMode="tel" pattern="1\d{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="请输入11位手机号" /></Field><Field label="身份证号"><input value={form.idCard} onChange={(event) => setForm({ ...form, idCard: event.target.value })} placeholder="可稍后由运营补充" /></Field><Field label="推荐岗位" required><select required value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}><option value="">请选择岗位</option>{jobs.map((job) => <option value={job.id} key={job.id}>{job.projectName} · {job.title}</option>)}</select></Field>{error && <p className="form-error">{error}</p>}</form></Modal>;
}

const allFunctions = [
  { label: '我的报名', icon: FileText, path: 'applications' }, { label: '面试进度', icon: CalendarClock, path: 'applications' },
  { label: '我的推荐', icon: UsersRound, path: '/personal/referrals' }, { label: '工资条', icon: WalletCards, path: 'payroll', employeeOnly: true },
  { label: '借支申请', icon: CircleDollarSign, path: 'advances', employeeOnly: true }, { label: '申诉记录', icon: ShieldCheck, path: 'appeals' },
  { label: '我的消息', icon: Bell, path: '/personal/messages' }, { label: '收藏岗位', icon: Bookmark, path: 'favorites' }
];

export function PersonalMe({ session }: { session: Session }) {
  const isEmployee = session.personStatus === 'employed';
  const profile = useQuery({ queryKey: ['my-person-profile'], queryFn: () => api<Person[]>('/api/people') });
  const person = profile.data?.find((item) => item.id === session.personId) ?? profile.data?.[0];
  return <>
    <section className="profile-hero"><div className="profile-actions"><Link to="/personal/me/help" aria-label="帮助中心"><Headphones size={19} /></Link><Link to="/personal/me/settings" aria-label="设置"><Settings size={19} /></Link></div><div><Avatar name={session.name} size={62} /><div><h1>{session.name}<StatusTag status={session.personStatus ?? 'registered'} label={isEmployee ? '已入职员工' : '求职者'} /></h1><p>{person?.phone ?? '正在读取人员档案…'}</p></div></div></section>
    <Card className="function-panel"><h2>常用功能</h2><div className="function-grid">{allFunctions.filter((item) => !item.employeeOnly || isEmployee).map((item) => <Link key={item.label} to={item.path.startsWith('/') ? item.path : `/personal/me/${item.path}`}><span><item.icon /></span><strong>{item.label}</strong></Link>)}</div></Card>
    <Card className="menu-list"><h2>其他服务</h2><Link to="profile"><UserRound />个人资料<ChevronRight /></Link><Link to="help"><HelpCircle />帮助中心<ChevronRight /></Link><a href="tel:08318881234"><Headphones />联系客服<ChevronRight /></a><Link to="settings"><Settings />设置<ChevronRight /></Link></Card>
  </>;
}

export function ApplicationsPage({ session }: { session: Session }) {
  const people = useQuery({ queryKey: ['my-person'], queryFn: () => api<Person[]>('/api/people') });
  return <><PageHeader title="我的报名" back />{people.isLoading ? <LoadingScreen /> : people.data?.map((person) => <Card className="application-card" key={person.id}><div className="row row--between"><div><h2>{person.projectName}</h2><p>{person.jobTitle}</p></div><StatusTag status={person.status} /></div><div className="progress-steps">{['已报名','已到场','面试','待入职','已入职'].map((label, index) => <span className={index <= ['registered','arrived','interview_passed','pending_onboard','employed'].indexOf(person.status) ? 'done' : ''} key={label}><i>{index + 1}</i>{label}</span>)}</div><DetailLine label="报名时间" value={person.appliedAt.slice(0,10)} /><DetailLine label="面试时间" value={person.interviewAt ? new Date(person.interviewAt).toLocaleString('zh-CN') : '待通知'} /></Card>)}</>;
}

export function FavoritesPage() {
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const queryClient = useQueryClient();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api<Job[]>('/api/favorites') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/favorites/${id}`, { method: 'PUT' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }) });
  const apply = useMutation({
    mutationFn: (jobId: string) => api(`/api/jobs/${jobId}/apply`, { method: 'POST' }),
    onSuccess: async () => {
      setApplyJob(null);
      await queryClient.invalidateQueries({ queryKey: ['my-person'] });
    }
  });
  return <><PageHeader title="收藏岗位" back />{favorites.isLoading ? <LoadingScreen /> : favorites.data?.length ? <div className="job-list">{favorites.data.map((job) => <div className="favorite-job" key={job.id}><JobCard job={job} onApply={setApplyJob} /><button type="button" className="favorite-remove" onClick={() => remove.mutate(job.id)}><Bookmark size={14} fill="currentColor" />取消收藏</button></div>)}</div> : <EmptyState title="暂无收藏岗位" detail="在岗位详情点击星标，方便稍后查看" action={<Link className="primary-button" to="/personal/home">去看看岗位</Link>} />}<Modal open={Boolean(applyJob)} title="确认报名" onClose={() => setApplyJob(null)} footer={<><button className="ghost-button" type="button" onClick={() => setApplyJob(null)}>取消</button><button className="primary-button" type="button" disabled={apply.isPending} onClick={() => applyJob && apply.mutate(applyJob.id)}>{apply.isPending ? '提交中…' : '确认报名'}</button></>}><p>确认报名“{applyJob?.projectName} · {applyJob?.title}”吗？</p>{apply.error && <p className="form-error">{apply.error.message}</p>}</Modal></>;
}

interface Payroll { id: string; month: string; gross: number; net: number; details: Record<string, number>; publishedAt: string; }

export function PayrollPage() {
  const payroll = useQuery({ queryKey: ['payroll'], queryFn: () => api<Payroll[]>('/api/payroll') });
  const [selected, setSelected] = useState<Payroll | null>(null);
  return <><PageHeader title="我的工资条" back />{payroll.isLoading ? <LoadingScreen /> : payroll.data?.length ? <div className="stack">{payroll.data.map((item) => <button className="payroll-card" type="button" key={item.id} onClick={() => setSelected(item)}><span>{item.month.replace('-', '年')}月工资条</span><strong>¥ {item.net.toLocaleString()}</strong><small>实发工资 · 点击查看明细</small><ChevronRight /></button>)}</div> : <EmptyState title="暂无工资条" detail="工资条发布后会通过消息通知" />}<Modal open={Boolean(selected)} title={`${selected?.month ?? ''} 工资明细`} onClose={() => setSelected(null)}><div className="payroll-total"><span>实发工资</span><strong>¥{selected?.net.toLocaleString()}</strong></div>{selected && Object.entries(selected.details).map(([label, amount]) => <DetailLine key={label} label={label} value={`${amount >= 0 ? '+' : ''}${amount.toLocaleString()}元`} />)}<Link className="secondary-button full-button" to="/personal/me/appeals" onClick={() => setSelected(null)}>对工资条有疑问？提交申诉</Link></Modal></>;
}

interface Advance { id: string; amount: number; reason: string; status: string; reply?: string; created_at: string; }

export function AdvancesPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const advances = useQuery({ queryKey: ['advances'], queryFn: () => api<Advance[]>('/api/advances') });
  const create = useMutation({ mutationFn: (data: { amount: number; reason: string }) => api('/api/advances', { method: 'POST', ...jsonBody(data) }), onSuccess: async () => { setOpen(false); await queryClient.invalidateQueries({ queryKey: ['advances'] }); } });
  return <><PageHeader title="借支申请" back action={<button className="text-button" type="button" onClick={() => setOpen(true)}>新申请</button>} />{advances.data?.length ? <div className="stack">{advances.data.map((item) => <Card className="record-card" key={item.id}><div className="row row--between"><strong>¥{item.amount.toLocaleString()}</strong><StatusTag status={item.status} /></div><p>{item.reason}</p><small>{item.created_at?.slice(0,10)} · {item.reply ?? '等待处理'}</small></Card>)}</div> : <EmptyState title="暂无借支记录" detail="在职员工可在线提交借支申请" action={<button className="primary-button" type="button" onClick={() => setOpen(true)}>提交申请</button>} />}<AdvanceForm open={open} onClose={() => setOpen(false)} onSubmit={(data) => create.mutate(data)} submitting={create.isPending} error={create.error?.message} /></>;
}

function AdvanceForm({ open, onClose, onSubmit, submitting, error }: { open: boolean; onClose: () => void; onSubmit: (data: { amount: number; reason: string }) => void; submitting: boolean; error?: string | undefined }) {
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState('');
  return <Modal open={open} title="新建借支申请" onClose={onClose} footer={<button form="advance-form" className="primary-button" type="submit" disabled={submitting}>{submitting ? '提交中…' : '确认提交'}</button>}><form id="advance-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ amount: Number(amount), reason }); }}><Field label="借支金额" required><input required min="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="请输入金额" /></Field><Field label="申请原因" required><textarea required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请说明借支用途" /></Field>{error && <p className="form-error">{error}</p>}</form></Modal>;
}

interface Appeal { id: string; type: string; description: string; requested_amount?: number; status: string; reply?: string; created_at: string; }

export function AppealsPage({ supplier = false }: { supplier?: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const appeals = useQuery({ queryKey: ['appeals'], queryFn: () => api<Appeal[]>('/api/appeals') });
  const create = useMutation({ mutationFn: (data: Record<string, unknown>) => api('/api/appeals', { method: 'POST', ...jsonBody(data) }), onSuccess: async () => { setOpen(false); await queryClient.invalidateQueries({ queryKey: ['appeals'] }); } });
  return <><PageHeader title={supplier ? '我的申诉' : '申诉记录'} back action={<button className="text-button" type="button" onClick={() => setOpen(true)}>新申诉</button>} />{appeals.data?.length ? <div className="stack">{appeals.data.map((item) => <Card className="record-card" key={item.id}><div className="row row--between"><strong>{appealTypeLabel(item.type)}</strong><StatusTag status={item.status} /></div><p>{item.description}</p><small>{item.reply ?? '已提交，等待公司处理'}</small></Card>)}</div> : <EmptyState title="暂无申诉" detail="对工资、状态或结算有疑问时可在线提交" />}<AppealForm supplier={supplier} open={open} onClose={() => setOpen(false)} submitting={create.isPending} error={create.error?.message} onSubmit={(data) => create.mutate(data)} /></>;
}

function appealTypeLabel(type: string) { return ({ salary: '工资申诉', person_status: '人员状态申诉', settlement_missing: '人员遗漏', settlement_days: '在职天数错误', settlement_policy: '政策使用错误', settlement_amount: '结算金额错误', other: '其他申诉' } as Record<string,string>)[type] ?? type; }

function AppealForm({ supplier, open, onClose, onSubmit, submitting, error }: { supplier: boolean; open: boolean; onClose: () => void; onSubmit: (data: Record<string, unknown>) => void; submitting: boolean; error?: string | undefined }) {
  const [type, setType] = useState(supplier ? 'settlement_amount' : 'salary'); const [description, setDescription] = useState(''); const [amount, setAmount] = useState('');
  const [attachments, setAttachments] = useState<Array<{ id: string; originalName: string }>>([]);
  const upload = useMutation({ mutationFn: async (file: File) => { const body = new FormData(); body.append('file', file); return api<{ id: string; originalName: string }>('/api/attachments', { method: 'POST', body }); } });
  const addFiles = async (files: FileList | null) => { for (const file of Array.from(files ?? []).slice(0, 5 - attachments.length)) { const saved = await upload.mutateAsync(file); setAttachments((current) => [...current, saved]); } };
  return <Modal open={open} title="提交申诉" onClose={onClose} footer={<button form="appeal-form" className="primary-button" type="submit" disabled={submitting || upload.isPending}>{submitting ? '提交中…' : upload.isPending ? '上传中…' : '提交申诉'}</button>}><form id="appeal-form" className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ type, description, requestedAmount: amount ? Number(amount) : undefined, attachmentIds: attachments.map((item) => item.id) }); }}><Field label="申诉类型" required><select value={type} onChange={(event) => setType(event.target.value)}>{supplier ? <><option value="settlement_missing">人员遗漏</option><option value="settlement_days">在职天数错误</option><option value="settlement_policy">政策使用错误</option><option value="settlement_amount">结算金额错误</option><option value="other">其他</option></> : <><option value="salary">工资申诉</option><option value="other">其他</option></>}</select></Field><Field label="问题说明" required><textarea required minLength={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请描述问题、正确情况与期望处理结果" /></Field><Field label="申诉金额"><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="如涉及金额可填写" /></Field><label className="upload-placeholder"><FileText /><span>{upload.isPending ? '正在上传…' : '上传凭证（可选）'}</span><small>支持图片或 PDF，最多5个文件</small><input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void addFiles(event.target.files)} /></label>{attachments.length > 0 && <ul className="attachment-list">{attachments.map((item) => <li key={item.id}><FileText size={14} />{item.originalName}<button type="button" onClick={() => setAttachments((current) => current.filter((file) => file.id !== item.id))}>移除</button></li>)}</ul>}{(error || upload.error) && <p className="form-error">{error ?? upload.error?.message}</p>}</form></Modal>;
}

export function GenericPersonalPage({ title }: { title: string }) {
  const { page = '' } = useParams();
  const profile = useQuery({ queryKey: ['my-person-profile'], queryFn: () => api<Person[]>('/api/people') });
  const person = profile.data?.[0];
  const pageTitle = ({ profile: '个人资料', help: '帮助中心', settings: '设置' } as Record<string, string>)[page] ?? title;
  const details: Array<[string, string]> = page === 'profile'
    ? [['姓名', person?.name ?? '正在读取'], ['手机号', person?.phone ?? '正在读取'], ['身份证号', person?.idCard ?? '正在读取'], ['员工编号', person?.employeeNo ?? '未生成'], ['当前项目', person?.projectName ?? '正在读取'], ['岗位', person?.jobTitle ?? '正在读取']]
    : page === 'settings'
      ? [['消息通知', '已开启'], ['信息展示', '权限范围内展示完整业务信息'], ['数据同步', '后台、小程序与AI助手实时联动'], ['当前版本', '1.1.0 参赛演示版']]
      : [['招聘咨询', '0831-8881234'], ['员工服务', '工作日 09:00–18:00'], ['申诉处理', '提交后可在申诉记录查看进度'], ['数据说明', '仅展示当前账号权限范围内的业务数据']];
  return <><PageHeader title={pageTitle} back /><Card className="detail-section">{details.map(([label, value]) => <DetailLine key={label} label={label} value={value} />)}</Card>{page === 'help' && <a className="primary-button full-button" href="tel:08318881234"><Phone size={16} />联系运营人员</a>}</>;
}
