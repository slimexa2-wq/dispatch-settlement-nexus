import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, jsonBody } from './api';
import { useSession } from './session';
import type { Session } from './types';
import { AppShell, type Portal } from '../components/AppShell';
import { EmptyState, Field, LoadingScreen } from '../components/Ui';
import { IdentityEntry, type EntryPersona } from '../features/entry/IdentityEntry';
import {
  AdvancesPage, AppealsPage, ApplicationsPage, FavoritesPage, GenericPersonalPage, MessagesPage, PayrollPage,
  PersonalHome, PersonalJobDetail, PersonalMe, ReferralPage
} from '../features/personal/PersonalPages';
import {
  AuditLogPage, InternalDashboard, InternalJobDetail, InternalMe, InternalMessages,
  InternalPeople, InternalProjects, OnSiteRegistration, PersonDetail, ReviewQueue, SelfRecruitment
} from '../features/internal/InternalPages';
import {
  SupplierAppeals, SupplierJobDetail, SupplierJobs, SupplierMe, SupplierMessages,
  SupplierPeople, SupplierPersonDetail, SupplierSettlements
} from '../features/supplier/SupplierPages';

function portalForRole(role: Session['role']): Portal {
  if (role === 'personal') return 'personal';
  if (role === 'supplier') return 'supplier';
  return 'internal';
}

function portalHome(portal: Portal) {
  return portal === 'personal' ? '/personal/home' : portal === 'supplier' ? '/supplier/jobs' : '/internal/dashboard';
}

function EntryRoute() {
  const navigate = useNavigate(); const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const autoSelected = useRef(false);
  const personas = useQuery({ queryKey: ['personas'], queryFn: () => api<EntryPersona[]>('/api/personas') });
  const select = useMutation({ mutationFn: (persona: EntryPersona) => api<Session>('/api/session/select-persona', { method: 'POST', ...jsonBody({ personaId: persona.id }) }), onSuccess: async (data) => { await queryClient.invalidateQueries({ queryKey: ['session'] }); const requested = searchParams.get('redirect'); const portal = portalForRole(data.role); const safeRedirect = requested?.startsWith(`/${portal}/`) ? requested : portalHome(portal); navigate(safeRedirect, { replace: Boolean(searchParams.get('persona')) }); } });
  useEffect(() => {
    const requestedPersona = searchParams.get('persona');
    if (!requestedPersona || autoSelected.current || !personas.data?.length || select.isPending) return;
    const persona = personas.data.find((item) => item.id === requestedPersona);
    if (!persona) return;
    autoSelected.current = true;
    select.mutate(persona);
  }, [personas.data, searchParams, select]);
  return <IdentityEntry personas={personas.data ?? []} loading={personas.isLoading || select.isPending} onSelect={(persona) => select.mutate(persona)} />;
}

function RequirePortal({ portal }: { portal: Portal }) {
  const { session, loading } = useSession();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/entry" replace />;
  const actual = portalForRole(session.role);
  if (actual !== portal) return <Navigate to={portalHome(actual)} replace />;
  return <PortalLayout portal={portal} session={session}><Outlet /></PortalLayout>;
}

function PortalLayout({ portal, session, children }: { portal: Portal; session: Session; children: ReactNode }) {
  const location = useLocation();
  const title = portal === 'personal' ? '祥能招聘' : portal === 'supplier' ? '岗位与人员协作' : location.pathname.includes('/people') ? '人员' : location.pathname.includes('/projects') ? '项目' : '工作台';
  return <AppShell portal={portal} session={session} title={title} wide={portal !== 'personal'}>{children}</AppShell>;
}

function SessionPage({ children }: { children: (session: Session) => ReactNode }) {
  const { session } = useSession(); return session ? <>{children(session)}</> : null;
}

interface ScanData { token: string; projectId: string; projectName: string; jobId?: string; jobTitle?: string; interviewDate: string; source: string; expiresAt: string; }

function ScanRegistrationPage() {
  const { token = '' } = useParams();
  const qr = useQuery({ queryKey: ['scan', token], queryFn: () => api<ScanData>(`/api/qrcodes/${token}`), retry: false });
  const [form, setForm] = useState({ name: '', phone: '', idCard: '' });
  const signup = useMutation({ mutationFn: () => api(`/api/qrcodes/${token}/register`, { method: 'POST', ...jsonBody(form) }) });
  if (qr.isLoading) return <LoadingScreen />;
  if (qr.error || !qr.data) return <main className="scan-page"><EmptyState title="报名二维码已失效" detail={qr.error?.message ?? '请联系现场工作人员重新生成'} /></main>;
  return <main className="scan-page"><section className="scan-card"><img src="/brand-mark.svg" alt="祥能" /><h1>现场快捷报名</h1><p>{qr.data.projectName}{qr.data.jobTitle ? ` · ${qr.data.jobTitle}` : ''}</p><dl><div><dt>面试日期</dt><dd>{qr.data.interviewDate}</dd></div><div><dt>报名来源</dt><dd>{qr.data.source}</dd></div></dl>{signup.isSuccess ? <div className="scan-success"><strong>报名成功</strong><p>人员档案已建立，现场工作人员将继续为你办理面试。</p></div> : <form className="form-grid" onSubmit={(event) => { event.preventDefault(); signup.mutate(); }}><Field label="姓名" required><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="手机号" required><input required pattern="1\d{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field><Field label="身份证号" required><input required value={form.idCard} onChange={(event) => setForm({ ...form, idCard: event.target.value })} /></Field>{signup.error && <p className="form-error">{signup.error.message}</p>}<button className="primary-button" type="submit" disabled={signup.isPending}>{signup.isPending ? '提交中…' : '完成报名'}</button></form>}</section></main>;
}

export function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/entry" replace />} />
    <Route path="/entry" element={<EntryRoute />} />
    <Route path="/scan/:token" element={<ScanRegistrationPage />} />

    <Route path="/personal" element={<RequirePortal portal="personal" />}>
      <Route index element={<Navigate to="home" replace />} />
      <Route path="home" element={<SessionPage>{(session) => <PersonalHome session={session} />}</SessionPage>} />
      <Route path="jobs/:id" element={<PersonalJobDetail />} />
      <Route path="messages" element={<MessagesPage />} />
      <Route path="referrals" element={<SessionPage>{(session) => <ReferralPage session={session} />}</SessionPage>} />
      <Route path="me" element={<SessionPage>{(session) => <PersonalMe session={session} />}</SessionPage>} />
      <Route path="me/applications" element={<SessionPage>{(session) => <ApplicationsPage session={session} />}</SessionPage>} />
      <Route path="me/payroll" element={<PayrollPage />} />
      <Route path="me/advances" element={<AdvancesPage />} />
      <Route path="me/appeals" element={<AppealsPage />} />
      <Route path="me/favorites" element={<FavoritesPage />} />
      <Route path="me/:page" element={<GenericPersonalPage title="个人服务" />} />
      <Route path="*" element={<Navigate to="/personal/home" replace />} />
    </Route>

    <Route path="/internal" element={<RequirePortal portal="internal" />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<InternalDashboard />} />
      <Route path="people" element={<SessionPage>{(session) => <InternalPeople session={session} />}</SessionPage>} />
      <Route path="people/on-site" element={<OnSiteRegistration />} />
      <Route path="people/:id" element={<SessionPage>{(session) => <PersonDetail session={session} />}</SessionPage>} />
      <Route path="projects" element={<SessionPage>{(session) => <InternalProjects session={session} />}</SessionPage>} />
      <Route path="projects/jobs/:id" element={<SessionPage>{(session) => <InternalJobDetail session={session} />}</SessionPage>} />
      <Route path="me" element={<SessionPage>{(session) => <InternalMe session={session} />}</SessionPage>} />
      <Route path="messages" element={<InternalMessages portal="internal" />} />
      <Route path="review" element={<ReviewQueue />} />
      <Route path="self-recruitment" element={<SelfRecruitment />} />
      <Route path="audit" element={<AuditLogPage />} />
      <Route path="*" element={<Navigate to="/internal/dashboard" replace />} />
    </Route>

    <Route path="/supplier" element={<RequirePortal portal="supplier" />}>
      <Route index element={<Navigate to="jobs" replace />} />
      <Route path="jobs" element={<SupplierJobs />} />
      <Route path="jobs/:id" element={<SupplierJobDetail />} />
      <Route path="people" element={<SupplierPeople />} />
      <Route path="people/:id" element={<SupplierPersonDetail />} />
      <Route path="settlements" element={<SupplierSettlements />} />
      <Route path="me" element={<SessionPage>{(session) => <SupplierMe session={session} />}</SessionPage>} />
      <Route path="appeals" element={<SupplierAppeals />} />
      <Route path="messages" element={<SupplierMessages portal="supplier" />} />
      <Route path="*" element={<Navigate to="/supplier/jobs" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/entry" replace />} />
  </Routes>;
}
