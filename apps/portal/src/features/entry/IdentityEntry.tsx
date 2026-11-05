import { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { BrandMark } from '../../components/BrandMark';

export interface EntryPersona {
  id: string;
  name: string;
  role: string;
  subtitle: string;
  avatarSeed: string;
  personStatus?: string;
}

interface IdentityEntryProps {
  personas: EntryPersona[];
  loading: boolean;
  onSelect: (persona: EntryPersona) => void | Promise<void>;
}

export function IdentityEntry({ personas, loading, onSelect }: IdentityEntryProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const personal = personas.filter((persona) => persona.role === 'personal');
  const internal = personas.filter((persona) => ['group_leader', 'company_manager', 'project_manager', 'site_operator'].includes(persona.role));
  const supplier = personas.filter((persona) => persona.role === 'supplier');

  const directSelect = (items: EntryPersona[]) => {
    if (items[0]) void onSelect(items[0]);
  };

  return <main className="entry-page">
    <span className="entry-orb entry-orb--one" />
    <span className="entry-orb entry-orb--two" />
    <section className="entry-panel">
      <header className="entry-header">
        <BrandMark />
        <p>同一套业务数据 · 按身份进入专属工作空间</p>
      </header>
      <div className="portal-grid">
        <div>
          <button className="portal-card" type="button" onClick={() => directSelect(personal)} disabled={loading} aria-label="进入个人端">
            <span className="portal-icon"><UserRound /></span>
            <span><h2>个人端</h2><p>求职、报名、推荐，以及入职后的工资与员工服务</p></span>
            <ChevronRight className="chevron" size={18} />
          </button>
          {personal.length > 1 && <div className="persona-list">
            {personal.map((persona) => <button type="button" className="persona-button" key={persona.id} onClick={() => void onSelect(persona)}><Avatar name={persona.name} /><span><strong>{persona.name}</strong><span>{persona.subtitle}</span></span></button>)}
          </div>}
        </div>
        <div>
          <button className="portal-card" type="button" onClick={() => setInternalOpen((open) => !open)} aria-expanded={internalOpen} aria-label="展开内部管理端">
            <span className="portal-icon"><ShieldCheck /></span>
            <span><h2>内部管理端</h2><p>领导看数据，现场运营办理人员、岗位与审核业务</p></span>
            {internalOpen ? <ChevronDown className="chevron" size={18} /> : <ChevronRight className="chevron" size={18} />}
          </button>
          {internalOpen && <div className="persona-list">
            {internal.map((persona) => <button type="button" className="persona-button" key={persona.id} onClick={() => void onSelect(persona)}><Avatar name={persona.name} /><span><strong>{persona.name}</strong><span>{persona.subtitle}</span></span></button>)}
          </div>}
        </div>
        <div>
          <button className="portal-card" type="button" onClick={() => supplier.length === 1 ? directSelect(supplier) : undefined} disabled={loading} aria-label="进入供应商端">
            <span className="portal-icon"><Building2 /></span>
            <span><h2>供应商端</h2><p>查看岗位政策、输送人员状态与月度结算</p></span>
            <ChevronRight className="chevron" size={18} />
          </button>
          {supplier.length > 1 && <div className="persona-list">
            {supplier.map((persona) => <button type="button" className="persona-button" key={persona.id} onClick={() => void onSelect(persona)}><Avatar name={persona.name} /><span><strong>{persona.name}</strong><span>{persona.subtitle}</span></span></button>)}
          </div>}
        </div>
      </div>
      <p className="entry-footnote"><UsersRound size={14} /> 演示版采用一键身份切换，数据与权限仍由后端隔离</p>
    </section>
  </main>;
}
