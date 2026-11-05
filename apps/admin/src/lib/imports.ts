import type { ImportPreview } from "../types/domain";

export function importWarnings(preview: Pick<ImportPreview, "warnings">) {
  return preview.warnings ?? [];
}

export function stagedImportCommit(importId: string, sourceHash: string) {
  return { importId, sourceHash };
}
