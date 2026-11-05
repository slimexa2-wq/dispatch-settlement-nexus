import type { ReactNode } from 'react';
import { Bell, BriefcaseBusiness, Building2, ClipboardList, House, LogOut, ReceiptText, UserRound, UsersRound } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../app/api';
import type { MessageItem, Session } from '../app/types';
import { Avatar } from './Avatar';
import { BrandMark } from './BrandMark';
import { AiAssistant } from '../features/ai/AiAssistant';

export type Portal = 'personal' | 'internal' | 'supplier';

const navConfig = {
  personal: [
    { label: '首页', to: '/personal/home', icon: House },
    { label: '推荐', to: '/personal/referrals', icon: ClipboardList },
    { label: '我的', to: '/personal/me', icon: UserRound }
  ],
  internal: [
    { label: '工作台', to: '/internal/dashboard', icon: House },
    { label: '人员', to: '/internal/people', icon: UsersRound },
    { label: '项目', to: '/internal/projects', icon: BriefcaseBusiness },
    { label: '我的', to: '/internal/me', icon: UserRound }
  ],
  supplier: [
    { label: '岗位需求', to: '/supplier/jobs', icon: ClipboardList },
    { label: '我的人员', to: '/supplier/people', icon: UsersRound },
    { label: '结算', to: '/supplier/settlements', icon: ReceiptText },
    { label: '我的', to: '/supplier/me', icon: UserRound }
  ]
} as const;

export function AppShell({ portal, session, title, children, wide = false }: { portal: Portal; session: Session; title: string; children: ReactNode; wide?: boolean }) {
  const navigate = useNavigate();
  const messages = useQuery({ queryKey: ['messages'], queryFn: () => api<MessageItem[]>('/api/messages'), staleTime: 20_000 });
  const unread = messages.data?.filter((message) => !message.isRead).length ?? 0;
  const logout = useMutation({ mutationFn: () => api('/api/session', { method: 'DELETE' }), onSuccess: () => navigate('/entry') });
  const navItems = navConfig[portal];
  const messagePath = portal === 'personal' ? '/personal/messages' : portal === 'supplier' ? '/supplier/messages' : '/internal/messages';

  return <div className={`app-layout app-layout--${portal}`}>
    <aside className="desktop-sidebar">
      <BrandMark compact />
      <div className="sidebar-profile"><Avatar name={session.name} size={44} /><div><strong>{session.name}</strong><span>{session.subtitle}</span></div></div>
      <nav>{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={20} /><span>{item.label}</span></NavLink>)}</nav>
      <button type="button" className="sidebar-exit" onClick={() => logout.mutate()}><LogOut size={18} />切换身份</button>
    </aside>
    <div className="app-stage">
      <header className="mobile-header">
        <div className="mobile-brand"><span className="mobile-logo"><Building2 size={18} /></span><div><strong>{title}</strong><span>{session.subtitle}</span></div></div>
        <button className="icon-button" type="button" aria-label={`消息${unread ? `，${unread}条未读` : ''}`} onClick={() => navigate(messagePath)}><Bell size={21} />{unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}</button>
      </header>
      <main className={`app-content ${wide ? 'app-content--wide' : ''}`}>{children}</main>
      <nav className="bottom-nav">{navItems.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={21} /><span>{item.label}</span></NavLink>)}</nav>
    </div>
    {portal === 'internal' && <AiAssistant />}
  </div>;
}
