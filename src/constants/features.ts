// Local defaults. Remote config (GET /api/config) can flip individual flags
// at runtime. See src/services/api.ts:fetchRemoteConfig.
export const FEATURES: { conversation: boolean; agenticThreaded: boolean; agenticScoring: boolean; agenticDebrief: boolean } = {
  // Live voice (ElevenLabs Conversational AI duplex). Scaffold complete , 
  // types, quota, screens, Supabase column, Home tile all gated on this flag.
  // OFF for MVP: needs end-to-end testing + ELEVENLABS_AGENT_ID configured on
  // Railway + cost modelling at scale. Flip to true (or remote-config it on)
  // when ready to ship.
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
