export function referralTokenFromParams(params: { ref?: string; scene?: string }): string | undefined {
  if (params.ref?.trim()) return params.ref.trim();
  if (!params.scene) return undefined;
  let scene = params.scene;
  try {
    scene = decodeURIComponent(scene);
  } catch {
    return undefined;
  }
  const token = /(?:^|&)r=([^&]+)/.exec(scene)?.[1];
  return token?.trim() || undefined;
}

export function jobDetailPath(jobDemandId: string, referralToken?: string): string {
  const ref = referralToken ? `&ref=${encodeURIComponent(referralToken)}` : "";
  return `/pages/jobs/detail/index?id=${encodeURIComponent(jobDemandId)}${ref}`;
}
