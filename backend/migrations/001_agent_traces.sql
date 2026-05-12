-- Sharp AI — Agent traces
-- Records every step an agent takes: tool calls, inputs, outputs, latency, tokens.
-- Used for offline debugging when PostHog funnels surface a problem.

create table if not exists agent_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text null,  -- matches public.sessions.id which is text
  request_id text not null,
  agent_name text not null,
  step_index int not null,
  step_kind text not null check (step_kind in ('start', 'tool_call', 'tool_result', 'final', 'error')),
  tool_name text null,
  tool_input jsonb null,
  tool_output jsonb null,
  message text null,
  latency_ms int null,
  input_tokens int null,
  output_tokens int null,
  created_at timestamptz not null default now()
);

create index if not exists agent_traces_user_id_idx on agent_traces (user_id, created_at desc);
create index if not exists agent_traces_request_id_idx on agent_traces (request_id);
create index if not exists agent_traces_agent_name_idx on agent_traces (agent_name, created_at desc);

-- RLS — users can read their own traces; writes only via service role.
alter table agent_traces enable row level security;

create policy "agent_traces_select_own"
  on agent_traces for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies — backend uses service role key, bypassing RLS.
