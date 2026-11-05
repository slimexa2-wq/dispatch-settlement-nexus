interface BrandMarkProps { compact?: boolean; }

export function BrandMark({ compact = false }: BrandMarkProps) {
  return <span className="brand-mark"><img src="/brand-mark.svg" alt="" />{compact ? '祥能招聘' : '祥能人员与招聘信息管理系统'}</span>;
}
