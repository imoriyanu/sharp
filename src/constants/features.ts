// Local defaults. Remote config (GET /api/config) can flip individual flags
// at runtime — see src/services/api.ts:fetchRemoteConfig.
export const FEATURES: { conversation: boolean; agenticThreaded: boolean; agenticScoring: boolean; agenticDebrief: boolean } = {
  conversation: false,
  agenticThreaded: false,
  agenticScoring: false,
  agenticDebrief: false,
};

export function applyRemoteFeatures(remote: Partial<typeof FEATURES> | null | undefined): void {
  if (!remote) return;
  for (const k of Object.keys(remote) as (keyof typeof FEATURES)[]) {
    if (typeof remote[k] === 'boolean') (FEATURES as any)[k] = remote[k];
  }
}
