export const forbiddenPublicDataMarkers = Object.freeze([
  "唯一数据.xls",
  "唯一数据.xlsx",
  "demo-data.full.json",
  "data/derived/",
  "祥能人力周度在离职数据统计_20260719.xlsx",
  "所有企业名单汇总2026-07-21.xls",
  "202606集团花名册.xlsx",
  "real-business-data.json",
  "internal-employee-initial-accounts.json",
  "data/internal/",
  "data/internal-source/"
]);

export function assertPublicArtifactSafe(text) {
  const normalized = String(text).toLowerCase();
  for (const marker of forbiddenPublicDataMarkers) {
    if (normalized.includes(marker.toLowerCase())) {
      throw new Error(`Public demo artifact contains forbidden source marker: ${marker}`);
    }
  }
}
