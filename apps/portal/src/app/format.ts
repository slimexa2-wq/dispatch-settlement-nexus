export function formatSalaryRange(minimum: number, maximum: number, compact = true): string {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum <= 0) {
    return '薪资面议';
  }
  if (!compact) return `${minimum}–${maximum}元/月`;
  const formatK = (value: number) => (value / 1000).toFixed(1).replace('.0', '');
  return `${formatK(minimum)}K–${formatK(maximum)}K/月`;
}
