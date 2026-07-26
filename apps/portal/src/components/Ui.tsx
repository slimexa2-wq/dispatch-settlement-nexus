import type { ChangeEvent, ReactNode } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PageHeader({ title, back = false, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const navigate = useNavigate();
  return <header className="page-header">{back ? <button type="button" className="icon-button" aria-label="返回" onClick={() => navigate(-1)}><ChevronLeft /></button> : <span className="page-header-spacer" />}<h1>{title}</h1><div className="page-header-action">{action}</div></header>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-input"><Search size={17} /><input value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} placeholder={placeholder} />{value && <button type="button" onClick={() => onChange('')} aria-label="清空"><X size={15} /></button>}</label>;
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return <label className="filter-select"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span>◎</span><strong>{title}</strong><p>{detail}</p>{action}</div>;
}

export function LoadingScreen() {
  return <div className="loading-screen"><span /><span /><span /><p>正在加载业务数据…</p></div>;
}

export function Modal({ open, title, children, onClose, footer }: { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function Field({ label, required = false, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return <label className="form-field"><span>{required && <b>*</b>}{label}</span>{children}{error && <small>{error}</small>}</label>;
}
